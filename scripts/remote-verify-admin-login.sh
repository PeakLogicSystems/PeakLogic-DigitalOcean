#!/usr/bin/env bash
# Verify platform admin login (does not print password).
set -euo pipefail
ADMIN_EMAIL="$(grep '^PEAKLOGIC_SEED_ADMIN_EMAIL=' /etc/peaklogic/saas.env | cut -d= -f2-)"
PASS="$(cat /home/peaklogic/mv-system-admin-password.txt)"
export ADMIN_EMAIL="$ADMIN_EMAIL"
export ADMIN_PASS="$PASS"
node <<'NODE'
const http = require('http');
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASS;
const body = JSON.stringify({ email, password, organizationId: '' });
const req = http.request({
  hostname: '127.0.0.1',
  port: 3100,
  path: '/api/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let data = '';
  res.on('data', (c) => { data += c; });
  res.on('end', () => {
    console.log('status', res.statusCode);
    try {
      const j = JSON.parse(data);
      console.log('role', j.user?.role || j.error || data.slice(0, 80));
    } catch {
      console.log(data.slice(0, 120));
    }
  });
});
req.on('error', (e) => { console.error(e.message); process.exit(1); });
req.write(body);
req.end();
NODE
