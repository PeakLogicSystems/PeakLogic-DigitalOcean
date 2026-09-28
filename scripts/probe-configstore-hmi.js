#!/usr/bin/env node
'use strict';
const fs = require('fs');
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
const configStore = require('../src/configStore');
(async () => {
  await configStore.init();
  const s = configStore.readSync('settings.json', {});
  const ws = configStore.readSync('workspace.est.json', {});
  const pe = configStore.readSync('project.est.json', {});
  const map = (doc) => (doc?.hmi?.screens || doc?.settings?.hmi?.screens || []).map((x) => x.name);
  console.log(JSON.stringify({
    startup: s.startup,
    projectName: s.project?.name,
    settingsScreens: map(s),
    workspaceScreens: map(ws),
    projectEstScreens: map(pe),
    bindingCount: (s.hmi?.bindings || []).length,
  }, null, 2));
  await configStore.shutdown();
})().catch((e) => { console.error(e); process.exit(1); });
