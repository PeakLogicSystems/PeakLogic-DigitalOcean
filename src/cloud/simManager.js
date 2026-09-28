'use strict';

const persistence = require('../persistence');
const simStore = require('./simStore');
const { SimRunner } = require('./simRunner');
const { isCloudSimsEnabled } = require('./cloudSimsEnabled');

/** @type {Map<string, SimRunner>} */
const runners = new Map();

function resolveMqttCfg() {
  const settings = persistence.readJson('settings.json', {});
  const mp = settings.mqttParc || {};
  return {
    brokerUrl: String(mp.brokerUrl || process.env.PEAKLOGIC_MQTT_BROKER || 'mqtt://127.0.0.1:1883').trim(),
    topicPrefix: String(mp.topicPrefix || 'peaklogic/v1').trim().replace(/\/+$/, '') || 'peaklogic/v1',
    username: mp.username || process.env.MOSQUITTO_USER || '',
    password: mp.password || process.env.MOSQUITTO_PASS || '',
  };
}

async function init() {
  if (!isCloudSimsEnabled()) return { enabled: false };
  const sims = await simStore.list();
  for (const sim of sims) {
    if (sim.status === 'running') {
      await simStore.update(sim.id, { status: 'stopped', lastError: 'Runner stopped on server restart' });
    }
  }
  return { enabled: true, count: sims.length, store: simStore.status() };
}

async function listSims() {
  const sims = await simStore.list();
  return sims.map((sim) => ({
    ...sim,
    runner: runners.get(sim.id)?.status() || null,
  }));
}

async function getSim(id) {
  const sim = await simStore.get(id);
  if (!sim) return null;
  return { ...sim, runner: runners.get(id)?.status() || null };
}

async function createSim(input) {
  return simStore.create(input);
}

async function updateSim(id, patch) {
  const running = runners.has(id);
  if (running && (patch.mqttDeviceId || patch.tenantId || patch.type)) {
    throw Object.assign(new Error('Stop sim before changing tenant, type, or deviceId'), { status: 409 });
  }
  const { status, lastStartedAt, lastStoppedAt, lastError, ...safePatch } = patch || {};
  return simStore.update(id, safePatch);
}

async function deleteSim(id) {
  await stopSim(id).catch(() => {});
  return simStore.remove(id);
}

async function startSim(id) {
  const sim = await simStore.get(id);
  if (!sim) return null;
  if (runners.has(id)) {
    return { sim: await getSim(id), started: true, alreadyRunning: true };
  }

  await simStore.update(id, { status: 'starting', lastError: null });
  const runner = new SimRunner(sim, resolveMqttCfg());
  try {
    const result = await runner.start();
    runners.set(id, runner);
    const updated = await simStore.update(id, {
      status: 'running',
      lastStartedAt: new Date().toISOString(),
      lastError: null,
    });
    return { sim: { ...updated, runner: runner.status() }, started: true, ...result };
  } catch (err) {
    await runner.stop().catch(() => {});
    runners.delete(id);
    const message = err.message || String(err);
    const updated = await simStore.update(id, { status: 'error', lastError: message });
    throw Object.assign(new Error(message), { status: 502, sim: updated });
  }
}

async function stopSim(id) {
  const runner = runners.get(id);
  if (runner) {
    await runner.stop();
    runners.delete(id);
  }
  const sim = await simStore.get(id);
  if (!sim) return null;
  const updated = await simStore.update(id, {
    status: 'stopped',
    lastStoppedAt: new Date().toISOString(),
  });
  return { sim: { ...updated, runner: null }, stopped: true };
}

async function shutdown() {
  const ids = [...runners.keys()];
  for (const id of ids) {
    await stopSim(id).catch(() => {});
  }
  await simStore.close();
}

function managerStatus() {
  return {
    enabled: isCloudSimsEnabled(),
    runningCount: runners.size,
    store: simStore.status(),
    mqtt: resolveMqttCfg(),
  };
}

module.exports = {
  init,
  listSims,
  getSim,
  createSim,
  updateSim,
  deleteSim,
  startSim,
  stopSim,
  shutdown,
  managerStatus,
  _runners: runners,
};
