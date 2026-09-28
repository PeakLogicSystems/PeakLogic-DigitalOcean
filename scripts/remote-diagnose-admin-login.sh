#!/usr/bin/env bash
# Diagnose platform admin login on the SaaS droplet (no secrets printed except test result).
set -euo pipefail
cd /home/peaklogic
PASS="$(cat /home/peaklogic/mv-system-admin-password.txt 2>/dev/null || cat /tmp/mv-system-admin-password.txt 2>/dev/null || true)"
EMAIL="$(grep '^PEAKLOGIC_SEED_ADMIN_EMAIL=' /etc/peaklogic/saas.env 2>/dev/null | cut -d= -f2- || echo admin@peaklogic.io)"
if [[ -z "$PASS" ]]; then echo "NO_PASSWORD_FILE"; exit 1; fi
sudo -u peaklogic env PEAKLOGIC_DEPLOYMENT=cloud EMAIL="$EMAIL" PASS="$PASS" node <<'NODE'
const { tenantStore } = require('./src/tenants/tenantStore');
const { verifyPassword } = require('./src/tenants/authCrypto');
const email = process.env.EMAIL;
const pass = process.env.PASS;
const users = Object.values(tenantStore._store.users);
const admin = users.find((u) => u.role === 'platform_admin');
console.log('deployment', process.env.PEAKLOGIC_DEPLOYMENT);
console.log('data_file_users', users.length);
console.log('platform_admin', admin ? admin.email : 'MISSING');
if (admin) {
  console.log('has_password_hash', !!admin.passwordHash);
  console.log('verify_direct', verifyPassword(pass, admin.passwordHash));
  try {
    const r = tenantStore.login({ email, password: pass, organizationId: '' });
    console.log('login_ok', r.user.role, r.user.email);
  } catch (e) {
    console.log('login_error', e.message);
  }
}
NODE
