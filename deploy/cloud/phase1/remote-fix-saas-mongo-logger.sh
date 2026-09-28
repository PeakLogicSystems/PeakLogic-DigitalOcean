#!/usr/bin/env bash
set -euo pipefail
cd /home/peaklogic
node <<'NODE'
const fs = require('fs');
const path = require('path');
process.chdir('/home/peaklogic');
require('./src/loadEnv');
const configStore = require('./src/configStore');
const persistence = require('./src/persistence');

function readEnvFile(filePath) {
  const out = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

(async () => {
  const env = readEnvFile('/etc/peaklogic/saas.env');
  const uri = env.MONGODB_URI || env.PEAKLOGIC_CONFIG_URI || env.MONGO_URL || '';
  const db = env.MONGODB_DB || 'peaklogic_cloud';
  if (!uri) throw new Error('MONGODB_URI missing in saas.env');
  await configStore.init();
  const settings = persistence.readJson('settings.json', {});
  settings.mongoLogger = {
    ...(settings.mongoLogger || {}),
    uri,
    db,
    sysLogCollection: settings.mongoLogger?.sysLogCollection || 'sys_log',
    collection: settings.mongoLogger?.collection || 'tag_samples_ts',
  };
  persistence.writeJson('settings.json', settings);
  await configStore.shutdown();
  console.log('configStore settings.mongoLogger updated for db:', db);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
NODE
systemctl restart peaklogic-saas
sleep 5
curl -s http://127.0.0.1:3100/api/sys-log/status
