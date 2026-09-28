'use strict';

const { registry } = require('./deviceRegistry');
const { appendOptaBrokerHint } = require('./mqttBrokerHint');
const { cmdFailureHint } = require('./cmdFailureHint');
const { resolveParcDeviceId } = require('./optaSerial');
const { findRegistryDeviceForDriver } = require('./parcDeviceResolve');

function parcDriverCfg(deviceIdOrCfg, opts = {}) {
  if (deviceIdOrCfg && typeof deviceIdOrCfg === 'object') return deviceIdOrCfg;
  return {
    deviceId: String(deviceIdOrCfg || '').trim(),
    ateccSerial: opts.ateccSerial,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait until Parc registry shows fresh telemetry from deviceId (device → broker → PC path).
 * @returns {Promise<{ ok: true, device: object } | { ok: false, error: string }>}
 */
async function waitForParcDeviceTelemetry(deviceIdOrCfg, opts = {}) {
  const cfg = parcDriverCfg(deviceIdOrCfg, opts);
  const mqttId = resolveParcDeviceId(cfg);
  const { deviceId: id } = findRegistryDeviceForDriver(registry, cfg);
  if (!mqttId && !id) return { ok: false, error: 'deviceId required' };
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || 45000);
  const pollMs = Math.max(100, Number(opts.pollMs) || 500);
  const maxAgeSec = Math.max(5, Number(opts.maxAgeSec) || 90);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { device: dev } = findRegistryDeviceForDriver(registry, cfg);
    if (dev && !dev.stale && dev.ageSec != null && dev.ageSec <= maxAgeSec) {
      return { ok: true, device: dev };
    }
    await sleep(pollMs);
  }

  const { device: dev } = findRegistryDeviceForDriver(registry, cfg);
  if (!dev) {
    return {
      ok: false,
      error: appendOptaBrokerHint(
        `Device ${mqttId || id} not seen on MQTT — no telemetry yet (check Mosquitto: npm run mqtt:start)`,
      ),
    };
  }
  if (dev.stale || (dev.ageSec != null && dev.ageSec > maxAgeSec)) {
    return {
      ok: false,
      error: appendOptaBrokerHint(
        `Telemetry stale for ${mqttId || id} (last report ${dev.ageSec ?? '?'}s ago) — check Opta Ethernet/MQTT publish; deploy may still work if runtime_status OK`,
      ),
    };
  }
  return {
    ok: false,
    error: appendOptaBrokerHint(`Timed out waiting for telemetry from ${mqttId || id}`),
  };
}

/**
 * Probe MQTT command path (runtime_status) before deploy — telemetry alone is not enough.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function waitForParcCmdHealth(deviceIdOrCfg, opts = {}) {
  const cfg = parcDriverCfg(deviceIdOrCfg, opts);
  const mqttId = resolveParcDeviceId(cfg);
  const { device: registryDev, deviceId: registryId } = findRegistryDeviceForDriver(registry, cfg);
  if (!mqttId) return { ok: false, error: 'deviceId required' };
  const { getMqttCentralHub } = require('./mqttCentralHub');
  const hub = getMqttCentralHub(registry);
  if (!hub.isLive()) {
    return {
      ok: false,
      error: appendOptaBrokerHint('MQTT Parc hub offline — enable hub and start Mosquitto'),
    };
  }
  const attempts = Math.max(1, Number(opts.attempts) || 5);
  const timeoutMs = Math.max(3000, Number(opts.timeoutMs) || 12000);
  const retryDelayMs = Math.max(500, Number(opts.retryDelayMs) || 2000);
  let lastErr = 'runtime_status failed';

  for (let i = 0; i < attempts; i += 1) {
    try {
      await hub.sendCommand(mqttId, 'runtime_status', {}, { timeoutMs });
      return { ok: true };
    } catch (e) {
      lastErr = e.message || String(e);
      if (i < attempts - 1) {
        console.warn(
          `[parc-deploy] runtime_status attempt ${i + 1}/${attempts} failed for ${mqttId} (${lastErr}) — retrying`,
        );
        await sleep(retryDelayMs);
      }
    }
  }

  const hubBrokerUrl = hub.status().brokerUrl;
  const hint = cmdFailureHint(registryDev, {
    hubBrokerUrl,
    deviceId: mqttId,
    registry,
    ateccSerial: cfg.ateccSerial,
  });
  return {
    ok: false,
    error: appendOptaBrokerHint(
      `MQTT command path not healthy for ${mqttId}${registryId && registryId !== mqttId ? ` (registry ${registryId})` : ''} after ${attempts} attempts — ${lastErr}. ${hint}`,
    ),
  };
}

module.exports = {
  waitForParcDeviceTelemetry,
  waitForParcCmdHealth,
};
