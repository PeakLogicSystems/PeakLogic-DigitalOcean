#!/usr/bin/env node
'use strict';
const fs = require('fs');
function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t[0] === '#') continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(k) || process.env[k]) continue;
    process.env[k] = t.slice(eq + 1).trim();
  }
}
loadEnvFile('/etc/peaklogic/saas.env');
const configStore = require('../src/configStore');
(async () => {
  await configStore.init();
  const tags = configStore.readSync('tags.json', []);
  const drivers = configStore.readSync('drivers.json', []);
  const ids = tags.map((t) => t.id).sort();
  console.log('tagCount', ids.length);
  console.log('duplexTags', ids.filter((id) => /^(LVL_|MOTOR|TANK_|ALT_|PHASE)/.test(id)));
  console.log('drivers', drivers.map((d) => ({ id: d.id, type: d.type, deviceId: d.deviceId, enabled: d.enabled })));
  await configStore.shutdown();
})().catch((e) => { console.error(e.message); process.exit(1); });
