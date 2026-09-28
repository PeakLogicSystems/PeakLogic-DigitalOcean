#!/usr/bin/env node
'use strict';
/**
 * Push HMI (and related settings) from workspace.est.zip into Mongo configStore.
 * Use after patching workspace.est.zip when runtime still shows old screens.
 */
const fs = require('fs');
const path = require('path');

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

loadEnvFile(process.env.PEAKLOGIC_SAAS_ENV || '/etc/peaklogic/saas.env');

const { unpackArchive } = require('../src/project/projectArchive');
const configStore = require('../src/configStore');

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

(async () => {
  const dataDir = process.env.PEAKLOGIC_DATA || '/home/peaklogic/data';
  const zipPath = arg('workspace-zip', path.join(dataDir, 'workspace.est.zip'));
  const buf = fs.readFileSync(zipPath);
  const unpacked = unpackArchive(buf);
  const doc = unpacked.project;
  if (!doc?.settings?.hmi) throw new Error('workspace archive missing settings.hmi');

  await configStore.init();
  const prev = configStore.readSync('settings.json', {});
  const startup = prev.startup || { mode: 'workspace', projectId: null, promptOnBoot: false };
  const nextSettings = {
    ...prev,
    ...doc.settings,
    startup,
    hmi: doc.settings.hmi,
    project: {
      ...(prev.project || {}),
      ...(doc.project || {}),
      name: doc.project?.name || prev.project?.name || 'project',
    },
  };

  configStore.writeSync('settings.json', nextSettings);
  configStore.writeSync('workspace.est.json', doc);
  configStore.writeSync('project.est.json', doc);
  await configStore.flushPending();

  const screens = (nextSettings.hmi?.screens || []).map((s) => s.name);
  console.log(JSON.stringify({
    ok: true,
    zipPath,
    project: nextSettings.project?.name,
    screens,
    bindings: (nextSettings.hmi?.bindings || []).length,
  }, null, 2));
  await configStore.shutdown();
})().catch((e) => {
  console.error('[sync-workspace-hmi]', e.message || e);
  process.exit(1);
});
