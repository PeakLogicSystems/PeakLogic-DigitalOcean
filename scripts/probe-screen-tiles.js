#!/usr/bin/env node
'use strict';
const fs = require('fs');
function loadEnvFile(f) {
  if (!f || !fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
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
  const s = configStore.readSync('settings.json', {});
  for (const sc of s.hmi?.screens || []) {
    console.log(sc.number, sc.id, sc.name, 'svg=', (sc.svg || '').slice(-40), 'tiles=', (sc.tiles || []).length);
  }
  console.log('bindings', (s.hmi?.bindings || []).length);
  await configStore.shutdown();
})();
