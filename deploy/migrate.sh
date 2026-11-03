#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/onesystemserp
set -a
source /home/ubuntu/.config/onesystemserp/migration.env
set +a
python3 - <<'PY'
import os
from urllib.parse import urlparse
target = urlparse(os.environ['DIRECT_URL'])
assert target.scheme == 'mysql'
assert target.hostname == 'constructpro-db.cwgvyg2y4v4o.us-east-1.rds.amazonaws.com'
assert target.path == '/onesystemserp'
assert target.username == 'onesystemserp_migrator'
print('Migration target verified: dedicated onesystemserp schema only.')
PY
exec ./node_modules/.bin/prisma migrate deploy
