#!/usr/bin/env bash
# One-time installation; run from a reviewed, trusted copy of deploy/cicd.
# Does not restart ERP, edit nginx, run migrations, or modify other applications.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run with sudo'; exit 1; }
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
test -f /home/ubuntu/onesystemserp/.env
test -f "$SCRIPT_DIR/host-deploy.py"
test -f "$SCRIPT_DIR/runtime-check.mjs"
test ! -e /etc/onesystemserp/deploy.json || { echo 'Already installed; review host configuration before updating'; exit 1; }

apt-get update -qq
DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get install -y -qq python3-boto3 rsync
if ! id onesystemserp >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/onesystemserp --shell /usr/sbin/nologin onesystemserp
fi
install -d -m 0755 /opt/onesystemserp /opt/onesystemserp/releases /usr/local/lib/onesystemserp
install -d -m 0750 -o root -g onesystemserp /etc/onesystemserp
install -d -m 0755 /var/lib/onesystemserp
install -d -m 0700 /var/lib/onesystemserp/backups
backup="/var/lib/onesystemserp/backups/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup"
for unit in onesystemserp.service onesystemserp-backend.service; do
  systemctl cat "$unit" > "$backup/$unit"
done
install -m 0600 /home/ubuntu/onesystemserp/.env "$backup/production.env"
install -m 0640 -o root -g onesystemserp /home/ubuntu/onesystemserp/.env /etc/onesystemserp/production.env
/usr/bin/node --env-file=/etc/onesystemserp/production.env "$SCRIPT_DIR/prepare-certificates.mjs"
for pair in 'public/uploads public-uploads' 'uploads backend-uploads'; do
  read -r source target <<< "$pair"
  install -d -m 0700 -o onesystemserp -g onesystemserp "/var/lib/onesystemserp/$target"
  if test -d "/home/ubuntu/onesystemserp/$source"; then
    rsync -a --chown=onesystemserp:onesystemserp "/home/ubuntu/onesystemserp/$source/" "/var/lib/onesystemserp/$target/"
  fi
done
install -m 0755 -o root -g root "$SCRIPT_DIR/host-deploy.py" /usr/local/sbin/onesystemserp-deploy
install -m 0644 -o root -g root "$SCRIPT_DIR/runtime-check.mjs" /usr/local/lib/onesystemserp/runtime-check.mjs
python3 -m py_compile /usr/local/sbin/onesystemserp-deploy
/usr/bin/node --check /usr/local/lib/onesystemserp/runtime-check.mjs
# Snapshot the reviewed current schema and its existing custom constraints. Any new
# difference, or a changed application schema, must be reviewed separately.
test "$(git -C /home/ubuntu/onesystemserp rev-parse HEAD)" = feda083396a0e53aa6f447bd1dbf6ba9442b777f
(
  cd /home/ubuntu/onesystemserp
  setpriv --reuid=ubuntu --regid=ubuntu --init-groups --no-new-privs \
    /usr/bin/node --env-file=.env /usr/local/lib/onesystemserp/runtime-check.mjs --capture-baseline
) > /etc/onesystemserp/schema-compatibility.json
chown root:onesystemserp /etc/onesystemserp/schema-compatibility.json
chmod 0640 /etc/onesystemserp/schema-compatibility.json
cat > /etc/onesystemserp/deploy.json <<'JSON'
{
  "instance_id": "i-05dbf6853ca3ecb33",
  "bucket": "onesystemserp-deploy-173677044880-us-east-1",
  "region": "us-east-1"
}
JSON
chmod 0600 /etc/onesystemserp/deploy.json
systemctl is-active onesystemserp.service onesystemserp-backend.service
echo 'HOST_DEPLOYMENT_PREREQUISITES_INSTALLED; ERP services were left running'
