#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { MongoClient } = require('mongodb');

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

loadEnvFile('/etc/peaklogic/saas.env');

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.PEAKLOGIC_CONFIG_DB || 'peaklogic_config');
  const snaps = await db.collection('project_snapshots').find({}).project({ tenantId: 1, projectId: 1, name: 1 }).limit(30).toArray();
  console.log('snapshots sample:', JSON.stringify(snaps, null, 2));
  const tenants = [...new Set(snaps.map((s) => s.tenantId))];
  console.log('tenantIds:', tenants.join(', '));
  const cfg = await db.collection('config_documents').find({}).project({ tenantId: 1, key: 1, 'data.startup': 1 }).toArray();
  console.log('config docs:', JSON.stringify(cfg, null, 2));
  await client.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
