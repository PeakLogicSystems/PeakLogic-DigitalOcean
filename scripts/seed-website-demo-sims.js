#!/usr/bin/env node
'use strict';

/**
 * Seed website demo cloud sims (JXCT ×4 + pool chemistry) and optionally start them.
 *
 *   node scripts/seed-website-demo-sims.js
 *   node scripts/seed-website-demo-sims.js --no-start
 *
 * Requires PEAKLOGIC_CLOUD_SIMS=1 (or cloud deployment) and a running PeakLogic instance
 * with MQTT Parc hub broker configured — or run against simManager in-process (default).
 */

const path = require('path');

async function viaHttp(baseUrl) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/cloud/sims/seed-website-demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: !process.argv.includes('--no-start') }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function viaLocal() {
  process.env.PEAKLOGIC_CLOUD_SIMS = process.env.PEAKLOGIC_CLOUD_SIMS || '1';
  const configStore = require('../src/configStore');
  if (configStore.initMemorySync) configStore.initMemorySync();
  const simStore = require('../src/cloud/simStore');
  simStore.resetFallbackForTests([]);
  const simManager = require('../src/cloud/simManager');
  await simManager.init();
  const result = await simManager.seedWebsiteDemoSims({ start: !process.argv.includes('--no-start') });
  await simManager.shutdown();
  return result;
}

async function main() {
  const baseUrl = process.env.PEAKLOGIC_URL || process.argv.find((a) => a.startsWith('http'));
  const result = baseUrl ? await viaHttp(baseUrl) : await viaLocal();
  for (const row of result.results || []) {
    const err = row.startError ? ` (start: ${row.startError})` : (row.started ? ' (running)' : '');
    console.log(`[seed-website-demo] ${row.action} ${row.sim?.mqttDeviceId} type=${row.sim?.type}${err}`);
  }
  console.log('[seed-website-demo] done — bind mqtt_parc drivers: dragino_jxct_x4, dragino_pool_chem');
}

main().catch((e) => {
  console.error('[seed-website-demo] failed:', e.message || e);
  process.exit(1);
});
