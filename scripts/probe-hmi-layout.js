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
  const h = s.hmi || {};
  console.log('layout', h.layout?.gridCols, h.layout?.gridRows, h.layout?.composerMode);
  for (const sc of h.screens || []) {
    console.log('screen', sc.id, 'grid', sc.gridCols, sc.gridRows, 'tiles', (sc.tiles||[]).length, 'inherit', sc.inheritProjectLayout, 'mode', sc.composerMode, '3d', sc.facility3dUrl||'');
  }
  await configStore.shutdown();
})();
