#!/usr/bin/env bash
set -euo pipefail
FILE="${1:-/home/peaklogic/data/cloud_tenants.json}"
export LIST_TENANTS_FILE="$FILE"
node -e "
const fs = require('fs');
const p = process.env.LIST_TENANTS_FILE;
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const tenants = Object.values(d.tenants || {});
console.log('file', p);
console.log('tenant_count', tenants.length);
tenants.sort((a,b) => (a.tenantSlug||'').localeCompare(b.tenantSlug||''));
for (const t of tenants) {
  console.log('-', t.tenantSlug, '|', t.name, '|', t.tenantType || 'customer');
}
const users = Object.values(d.users || {});
console.log('user_count', users.length);
for (const u of users) {
  console.log('  user', u.email, u.role);
}
"
