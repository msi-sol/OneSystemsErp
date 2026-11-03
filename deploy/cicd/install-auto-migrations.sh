#!/usr/bin/env bash
# One-time, reviewed host installation. Never provisions or grants database access.
set -euo pipefail
test "$(id -u)" = 0
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
test -f /home/ubuntu/.config/onesystemserp/migration.env
test -f /etc/onesystemserp/deploy.json
test -x /usr/bin/mysqldump
exec 9>/var/lib/onesystemserp/deploy.lock
flock -n 9 || { echo 'A deployment is active; retry installation after it finishes'; exit 1; }

backup="/var/lib/onesystemserp/backups/automatic-migrations-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup"
cp -a /usr/local/sbin/onesystemserp-deploy "$backup/host-deploy.py"
cp -a /etc/onesystemserp/deploy.json "$backup/deploy.json"
cp -a /etc/onesystemserp/schema-compatibility.json "$backup/schema-compatibility.json"
if test -d /etc/onesystemserp-migrations; then cp -a /etc/onesystemserp-migrations "$backup/migration-config"; fi
if ! id onesystemserp-migrator >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/onesystemserp/migrations --shell /usr/sbin/nologin onesystemserp-migrator
fi
install -d -m 0750 -o root -g onesystemserp-migrator /etc/onesystemserp-migrations
install -d -m 0700 -o onesystemserp-migrator -g onesystemserp-migrator /var/lib/onesystemserp/migrations
for name in migrate-release.mjs migration-policy.mjs prepare-migration-env.mjs; do
  install -m 0644 -o root -g root "$SCRIPT_DIR/$name" "/usr/local/lib/onesystemserp/$name"
  /usr/bin/node --check "/usr/local/lib/onesystemserp/$name"
done
/usr/bin/node --env-file=/home/ubuntu/.config/onesystemserp/migration.env /usr/local/lib/onesystemserp/prepare-migration-env.mjs
chown root:onesystemserp-migrator /etc/onesystemserp-migrations/migration.env
if ! test -f /etc/onesystemserp-migrations/applied-schema.prisma; then
  install -m 0640 -o root -g onesystemserp-migrator /opt/onesystemserp/current/prisma/schema.prisma /etc/onesystemserp-migrations/applied-schema.prisma
fi

# Verify scope/history, strict TLS, a private backup, and the no-pending path
# before enabling the automatic hook. No application services are restarted here.
current="$(readlink -f /opt/onesystemserp/current)"
release_id="$(basename "$current")"
read -r schema_sha difference_sha < <(python3 -c 'import json; d=json.load(open("/etc/onesystemserp/schema-compatibility.json"));print(d["schemaSha256"],d["differenceSha256"])')
systemd-run --quiet --wait --pipe --collect --unit=onesystemserp-migration-install-check \
  --property=User=onesystemserp-migrator --property=Group=onesystemserp-migrator \
  --property=EnvironmentFile=/etc/onesystemserp-migrations/migration.env \
  --property=NoNewPrivileges=yes --property=PrivateTmp=yes --property=ProtectHome=yes \
  "--property=IPAddressDeny=169.254.169.254/32 fd00:ec2::254/128" \
  --property=ProtectSystem=strict --property=ReadWritePaths=/var/lib/onesystemserp/migrations \
  --property=RuntimeMaxSec=510 --property=UMask=0077 --working-directory="$current" \
  /usr/bin/node /usr/local/lib/onesystemserp/migrate-release.mjs \
  --id "$release_id" --schema-sha "$schema_sha" --difference-sha "$difference_sha" --backup-check true --require-no-pending true

install -m 0755 -o root -g root "$SCRIPT_DIR/host-deploy.py" /usr/local/sbin/onesystemserp-deploy
python3 -m py_compile /usr/local/sbin/onesystemserp-deploy
python3 - <<'PY'
import json,os
from pathlib import Path
p=Path('/etc/onesystemserp/deploy.json')
d=json.loads(p.read_text());d['automatic_migrations']=True
temp=p.with_suffix('.tmp')
with open(temp,'w',opener=lambda name,flags:os.open(name,flags,0o600)) as stream:json.dump(d,stream,indent=2)
os.replace(temp,p)
PY
echo 'AUTOMATIC_MIGRATIONS_ENABLED_FOR_ONESYSTEMSERP_ONLY'
