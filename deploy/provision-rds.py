#!/usr/bin/env python3
"""Provision only the dedicated ERP schema on the existing shared RDS server."""
import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
from urllib.parse import urlencode

HOST = 'constructpro-db.cwgvyg2y4v4o.us-east-1.rds.amazonaws.com'
SCHEMA = 'onesystemserp'
APP_HOST = '172.31.28.197'
APP_USER = 'onesystemserp_app'
MIGRATION_USER = 'onesystemserp_migrator'
ROOT = Path('/home/ubuntu/onesystemserp')
CA = Path('/home/ubuntu/rds-global-bundle.pem')
CONFIG = Path('/home/ubuntu/.config/onesystemserp')

def sql(statement):
    env = dict(os.environ)
    env['MYSQL_PWD'] = os.environ['RDS_ADMIN_PASSWORD']
    result = subprocess.run([
        'mysql', '--no-defaults', '--connect-timeout=10', f'--host={HOST}',
        '--port=3306', '--user=admin', '--ssl-mode=VERIFY_IDENTITY',
        f'--ssl-ca={CA}', '--batch', '--skip-column-names',
    ], input=statement, text=True, capture_output=True, env=env)
    if result.returncode:
        # Never print the SQL: provisioning statements contain generated passwords.
        raise RuntimeError(f'RDS command failed (exit {result.returncode}); no existing schema was modified.')
    return result.stdout.strip()

def private_write(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(content)

if not os.environ.get('RDS_ADMIN_PASSWORD'):
    raise SystemExit('Enter the current RDS admin password in the hidden prompt first.')
if not (ROOT / 'package.json').is_file() or not CA.is_file():
    raise SystemExit('Application checkout or AWS certificate bundle is missing.')
if sql(f"SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{SCHEMA}';") != '0':
    raise SystemExit('The ERP schema already exists. Stopping for inspection; nothing changed.')
if sql(f"SELECT COUNT(*) FROM mysql.user WHERE User IN ('{APP_USER}','{MIGRATION_USER}');") != '0':
    raise SystemExit('An ERP account already exists. Stopping for inspection; nothing changed.')
if (ROOT / '.env').exists():
    raise SystemExit('An application .env already exists. Stopping to preserve its settings.')

CONFIG.mkdir(mode=0o700, parents=True, exist_ok=True)
inventory = sql('SELECT TABLE_SCHEMA, COUNT(*) FROM information_schema.TABLES GROUP BY TABLE_SCHEMA ORDER BY TABLE_SCHEMA;')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
private_write(CONFIG / f'schema-inventory-before-{stamp}.tsv', inventory + '\n')

# Persist recovery material with owner-only access before issuing any DDL.
passwords = {'application': secrets.token_hex(32), 'migration': secrets.token_hex(32)}
private_write(CONFIG / f'provisioning-recovery-{stamp}.json', json.dumps(passwords))
sql(f"""
CREATE DATABASE `{SCHEMA}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER '{APP_USER}'@'{APP_HOST}' IDENTIFIED BY '{passwords['application']}' REQUIRE SSL;
CREATE USER '{MIGRATION_USER}'@'{APP_HOST}' IDENTIFIED BY '{passwords['migration']}' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON `{SCHEMA}`.* TO '{APP_USER}'@'{APP_HOST}';
GRANT ALL PRIVILEGES ON `{SCHEMA}`.* TO '{MIGRATION_USER}'@'{APP_HOST}';
""")

def url(user, password, limit):
    args = urlencode({'sslcert': str(CA), 'sslaccept': 'strict', 'connection_limit': limit, 'pool_timeout': 20})
    return f'mysql://{user}:{password}@{HOST}:3306/{SCHEMA}?{args}'

app_url = url(APP_USER, passwords['application'], 5)
migration_url = url(MIGRATION_USER, passwords['migration'], 2)
values = {
    'DATABASE_URL': app_url, 'DIRECT_URL': app_url,
    'AUTH_SECRET': secrets.token_hex(32), 'AUTH_TRUST_HOST': 'true',
    'BACKEND_INTERNAL_SECRET': secrets.token_hex(32),
    'BACKEND_INTERNAL_URL': 'http://127.0.0.1:4000',
    'AWS_BACKEND_URL': 'https://erp.mavericksolutionsinc.ph',
    'AUTH_URL': 'https://erp.mavericksolutionsinc.ph',
    'NEXTAUTH_URL': 'https://erp.mavericksolutionsinc.ph',
    'NEXT_PUBLIC_APP_URL': 'https://erp.mavericksolutionsinc.ph',
    'APP_BASE_URL': 'https://erp.mavericksolutionsinc.ph',
    'NODE_ENV': 'production',
}
private_write(ROOT / '.env', ''.join(f'{key}={json.dumps(value)}\n' for key, value in values.items()))
private_write(CONFIG / 'migration.env', f'DATABASE_URL={json.dumps(app_url)}\nDIRECT_URL={json.dumps(migration_url)}\n')
after = sql('SELECT TABLE_SCHEMA, COUNT(*) FROM information_schema.TABLES GROUP BY TABLE_SCHEMA ORDER BY TABLE_SCHEMA;')
private_write(CONFIG / f'schema-inventory-after-{stamp}.tsv', after + '\n')
print('Created only onesystemserp and two TLS-required accounts restricted to it.')
print('Application account has DML privileges; the separate migration account has no global privileges.')
print('Protected application and migration configuration saved. No existing project schema was altered.')
