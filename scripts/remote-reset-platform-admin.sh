#!/usr/bin/env bash
set -euo pipefail
NEW_PASS="$(openssl rand -hex 16)"
ADMIN_EMAIL="$(grep '^PEAKLOGIC_SEED_ADMIN_EMAIL=' /etc/peaklogic/saas.env | cut -d= -f2- || echo admin@peaklogic.io)"
python3 - "$NEW_PASS" <<'PY'
import re, sys
path = "/etc/peaklogic/saas.env"
new_pass = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    text = f.read()
if re.search(r"^PEAKLOGIC_SEED_ADMIN_PASSWORD=", text, re.M):
    text = re.sub(r"^PEAKLOGIC_SEED_ADMIN_PASSWORD=.*", f"PEAKLOGIC_SEED_ADMIN_PASSWORD={new_pass}", text, flags=re.M)
else:
    text = text.rstrip() + f"\nPEAKLOGIC_SEED_ADMIN_PASSWORD={new_pass}\n"
with open(path, "w", encoding="utf-8") as f:
    f.write(text)
PY
printf '%s\n' "$NEW_PASS" > /home/peaklogic/mv-system-admin-password.txt
chown peaklogic:peaklogic /home/peaklogic/mv-system-admin-password.txt
chmod 644 /home/peaklogic/mv-system-admin-password.txt
cat > /home/peaklogic/SYSTEM-ADMIN-LOGIN.txt <<EOF
PeakLogic Cloud — system admin (generated $(date -u +%Y-%m-%dT%H:%MZ))

Login:  https://peaklogic.io/login
Org ID: (leave blank)
Email:  $ADMIN_EMAIL
Password file: /home/peaklogic/mv-system-admin-password.txt

Delete this file after you save the password somewhere safe.
EOF
chown peaklogic:peaklogic /home/peaklogic/SYSTEM-ADMIN-LOGIN.txt /home/peaklogic/mv-system-admin-password.txt
chmod 644 /home/peaklogic/SYSTEM-ADMIN-LOGIN.txt /home/peaklogic/mv-system-admin-password.txt
cp /home/peaklogic/SYSTEM-ADMIN-LOGIN.txt /tmp/SYSTEM-ADMIN-LOGIN.txt
cp /home/peaklogic/mv-system-admin-password.txt /tmp/mv-system-admin-password.txt
chmod 644 /tmp/SYSTEM-ADMIN-LOGIN.txt /tmp/mv-system-admin-password.txt
sudo -u peaklogic env PEAKLOGIC_DEPLOYMENT=cloud \
  PEAKLOGIC_SEED_ADMIN_EMAIL="$ADMIN_EMAIL" \
  PEAKLOGIC_SEED_ADMIN_PASSWORD="$NEW_PASS" \
  node /home/peaklogic/scripts/reset-platform-admin.js
systemctl restart peaklogic-saas
sleep 2
HTTP="$(curl -sS -o /tmp/mv-login-test.json -w '%{http_code}' -X POST http://127.0.0.1:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$NEW_PASS\",\"organizationId\":\"\"}")"
echo "login_http=$HTTP"
head -c 120 /tmp/mv-login-test.json || true
echo
echo "=== System admin login ==="
echo "  https://peaklogic.io/login"
echo "  Organization ID: (leave blank)"
echo "  Email: $ADMIN_EMAIL"
echo "  Password: $NEW_PASS"
echo
echo "Saved to:"
echo "  /tmp/SYSTEM-ADMIN-LOGIN.txt          (easiest — run on the droplet)"
echo "  /home/peaklogic/SYSTEM-ADMIN-LOGIN.txt"
echo "Read after SSH to cloud-1-saas-nyc1: cat /tmp/SYSTEM-ADMIN-LOGIN.txt"
