'use strict';

const { optaBrokerHint } = require('./mqttBrokerHint');
const { semverCompare } = require('../drivers/optaProtocol');
const {
  isLegacyOptaDeviceId,
  mvDeviceIdFromAteccSerial,
  legacyOptaDeviceIdFromAteccSerial,
  normalizeAteccSerialHex,
  resolveParcDeviceId,
} = require('./optaSerial');

function parseBrokerHost(brokerUrl) {
  const u = String(brokerUrl || '').trim();
  const m = u.match(/^mqtt(?:s)?:\/\/([^:/]+)/i) || u.match(/^([^:/]+)/);
  return m ? m[1] : '';
}

function brokerMismatchMessage(dev, hubBrokerUrl) {
  const hint = optaBrokerHint();
  const hubHost = parseBrokerHost(hubBrokerUrl) || hint.lanIp;
  /** On IOT-LINK / appliance PeakLogic uses mqtt://127.0.0.1 — Opta must use LAN IP. */
  const expectedHost = hubHost === '127.0.0.1' ? hint.lanIp : hubHost;
  const devBroker = String(dev?.meta?.mqttBroker || dev?.mqttBroker || '').trim();
  const devPort = dev?.meta?.mqttBrokerPort || dev?.mqttBrokerPort || 1883;
  if (!devBroker) return '';
  if (devBroker === '127.0.0.1' || devBroker === 'localhost') {
    return `Opta MQTT broker is ${devBroker} — open http://<opta-ip>/setup → MQTT Parc broker → ${expectedHost}:1883, save`;
  }
  if (expectedHost && expectedHost !== 'your PC LAN IP' && devBroker !== expectedHost) {
    return `Opta broker ${devBroker}:${devPort} ≠ PeakLogic Mosquitto ${expectedHost}:1883 — fix on Opta /setup → MQTT Parc broker`;
  }
  return '';
}

function isFreshForCmdHint(dev) {
  return !!(dev && !dev.stale && dev.ageSec != null && dev.ageSec <= 120);
}

function serialFromLegacyDeviceId(deviceId) {
  if (!isLegacyOptaDeviceId(deviceId)) return '';
  return normalizeAteccSerialHex(String(deviceId).replace(/^opta_/i, ''));
}

/** Fresh telemetry under mv_* / opta_* sibling — driver still on legacy id after firmware upgrade. */
function deviceIdMismatchHint(configuredId, registry, opts = {}) {
  if (!configuredId) return '';
  const id = String(configuredId).trim();
  const serialFromDriver = normalizeAteccSerialHex(opts.ateccSerial || '');
  const configured = registry?.getDevice?.(id);
  const serial = serialFromDriver
    || serialFromLegacyDeviceId(id)
    || normalizeAteccSerialHex(configured?.meta?.ateccSerial || configured?.ateccSerial || '');
  if (!serial) return '';

  let expectedMv = '';
  let expectedLegacy = '';
  try {
    expectedMv = mvDeviceIdFromAteccSerial(serial);
    expectedLegacy = legacyOptaDeviceIdFromAteccSerial(serial);
  } catch {
    return '';
  }

  if (expectedMv && id !== expectedMv && (isLegacyOptaDeviceId(id) || id === 'opta_st_01' || !/^mv_/i.test(id))) {
    return `Driver deviceId ${id} ≠ firmware ${expectedMv} — update Drivers → deviceId (firmware v2.3.40+ uses mv_* ids)`;
  }

  for (const candidateId of [expectedMv, expectedLegacy]) {
    if (!candidateId || candidateId === id) continue;
    const candidate = registry?.getDevice?.(candidateId);
    if (!isFreshForCmdHint(candidate)) continue;
    return `Driver deviceId ${id} ≠ firmware ${candidateId} — update Drivers → deviceId (firmware v2.3.40+ uses mv_* ids)`;
  }
  return '';
}

function cmdFailureHint(dev, opts = {}) {
  const { hubBrokerUrl, deviceId, registry, mqttHubUsername, ateccSerial } = opts;
  const idMismatch = deviceId
    ? deviceIdMismatchHint(deviceId, registry, { ateccSerial })
    : '';
  if (idMismatch) return idMismatch;

  const fw = String(dev?.meta?.firmwareVersion || dev?.firmwareVersion || '').trim();
  const hint = optaBrokerHint();
  const mismatch = brokerMismatchMessage(dev, hubBrokerUrl);
  if (mismatch) return mismatch;

  if (!dev || dev.stale || (dev.ageSec != null && dev.ageSec > 120)) {
    let msg = `No fresh telemetry — power-cycle Opta; set MQTT broker ${hint.optaBrokerIp}:1883 on http://<opta-ip>/setup`;
    if (opts.mqttHubUsername) {
      msg += ' — set MQTT username/password and TLS (port 8883) on Opta /setup (firmware v2.4.0+)';
    }
    return msg;
  }

  if (fw && semverCompare(fw, '2.3.18') < 0) {
    return `Firmware ${fw} — upload PeaklogicOptaMqttSt v2.3.18+ via Arduino IDE (Parc deploy does not flash firmware)`;
  }
  if (fw && semverCompare(fw, '2.3.41') < 0) {
    return `Telemetry OK but MQTT commands timeout on ${fw} — reflash PeaklogicOptaMqttSt v2.3.41+; Serial should show "MQTT subscribed cmd+config"`;
  }
  if (fw) {
    return `Telemetry OK but MQTT commands timeout on ${fw} — Serial: look for "MQTT subscribed cmd+config" (not "subscribe FAILED"); verify /setup broker ${hint.optaBrokerIp}:1883; put_program blocks other cmds until done`;
  }
  return `MQTT commands timeout — reflash PeaklogicOptaMqttSt v2.3.41+; set broker ${hint.optaBrokerIp}:1883 on Opta /setup`;
}

function cmdTimeoutMessage({ deviceId, op, dev, hubBrokerUrl, registry }) {
  const topic = `peaklogic/v1/${deviceId}/cmd`;
  const detail = cmdFailureHint(dev, { hubBrokerUrl, deviceId, registry });
  return `MQTT command timeout (${op}) on ${topic} — ${detail}`;
}

module.exports = {
  cmdFailureHint,
  cmdTimeoutMessage,
  brokerMismatchMessage,
  deviceIdMismatchHint,
  parseBrokerHost,
};
