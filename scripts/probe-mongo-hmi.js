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
(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const db = c.db(process.env.PEAKLOGIC_CONFIG_DB || 'peaklogic_config');
  for (const key of ['workspace.est.json', 'settings.json', 'project.est.json']) {
    const rows = await db.collection('config_documents').find({ key }).toArray();
    for (const r of rows) {
      const hmi = r.data?.hmi || r.data?.settings?.hmi;
      const startup = r.data?.startup;
      console.log('KEY', key, 'tenant', r.tenantId);
      if (startup) console.log(' startup', JSON.stringify(startup));
      if (hmi?.screens) console.log(' screens', hmi.screens.map((s) => s.name || s.id));
    }
  }
  await c.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
