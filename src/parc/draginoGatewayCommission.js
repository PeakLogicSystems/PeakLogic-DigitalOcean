'use strict';

const { draginoCloudMqttTopics } = require('./draginoTelemetry');
const { modbusMapFromPreset } = require('./draginoModbusMap');
const { getPreset } = require('../devices/devicePresets');

/** Dragino AT+TDC poll/uplink interval (seconds). Default 300 = 5 minutes. */
const DRAGINO_DEFAULT_REPORT_INTERVAL_SEC = 300;

function resolveDraginoReportIntervalSec(opts = {}) {
  if (opts.reportIntervalSec != null) {
    return Math.max(30, Math.trunc(Number(opts.reportIntervalSec) || DRAGINO_DEFAULT_REPORT_INTERVAL_SEC));
  }
  if (opts.presetId) {
    const preset = getPreset(opts.presetId);
    const fromTemplate = preset?.dragino?.reportIntervalSec;
    if (fromTemplate != null) {
      return Math.max(30, Math.trunc(Number(fromTemplate) || DRAGINO_DEFAULT_REPORT_INTERVAL_SEC));
    }
  }
  return DRAGINO_DEFAULT_REPORT_INTERVAL_SEC;
}

function parseMqttBrokerHostPort(brokerUrl, fallback = {}) {
  const raw = String(brokerUrl || '').trim();
  if (!raw) {
    return {
      host: fallback.host || 'peaklogic.io',
      port: fallback.port ?? 1883,
      tls: false,
    };
  }
  const tls = /^mqtts:/i.test(raw);
  const normalized = raw.replace(/^mqtts?:\/\//i, 'http://');
  try {
    const u = new URL(normalized);
    return {
      host: u.hostname,
      port: Number(u.port) || (tls ? 8883 : 1883),
      tls,
    };
  } catch {
    return {
      host: fallback.host || 'peaklogic.io',
      port: fallback.port ?? 1883,
      tls: false,
    };
  }
}

/** Public cloud broker for field Dragino (not localhost hub URL). */
function resolveDraginoCloudBroker(opts = {}, mqttParc = {}) {
  if (opts.cloudBrokerHost) {
    return {
      host: String(opts.cloudBrokerHost).trim(),
      port: opts.cloudBrokerPort != null ? Number(opts.cloudBrokerPort) : 1883,
      tls: opts.cloudBrokerTls === true,
    };
  }
  const parsed = parseMqttBrokerHostPort(mqttParc.brokerUrl, {
    host: 'peaklogic.io',
    port: 1883,
  });
  if (parsed.host === '127.0.0.1' || parsed.host === 'localhost' || parsed.host === 'mosquitto') {
    return { host: 'peaklogic.io', port: 1883, tls: false };
  }
  return parsed;
}

function padHex(n, bytes = 1) {
  return Number(n).toString(16).toUpperCase().padStart(bytes * 2, '0');
}

/** Build Dragino AT+COMMAND Modbus read (FC03/04) with CRC flag. */
function buildModbusReadCommand({
  slaveId = 1,
  functionCode = 3,
  startRegister = 0,
  registerCount = 4,
} = {}) {
  const fc = functionCode === 4 ? 4 : functionCode === 2 ? 2 : functionCode === 1 ? 1 : 3;
  const addr = padHex(startRegister, 2);
  const qty = padHex(registerCount, 2);
  return `${padHex(slaveId)} ${padHex(fc)} ${addr} ${qty},1`;
}

function parityToDragino(parity) {
  const p = String(parity || 'none').toLowerCase();
  if (p === 'odd') return 1;
  if (p === 'even') return 2;
  return 0;
}

function buildDraginoGatewayPlan(opts = {}, mqttParc = {}) {
  const deviceId = String(opts.deviceId || 'dragino_01').trim();
  if (!deviceId) throw Object.assign(new Error('deviceId required'), { status: 400 });

  const tenantId = String(opts.tenantId || mqttParc?.dragino?.cloudTenantId || '').trim();
  const broker = resolveDraginoCloudBroker(opts, mqttParc);
  const reportIntervalSec = resolveDraginoReportIntervalSec(opts);
  const topicCfg = { topicPrefix: mqttParc?.topicPrefix || 'peaklogic/v1' };
  const mqttTopics = draginoCloudMqttTopics(topicCfg, deviceId, tenantId || undefined);

  const modbusReads = Array.isArray(opts.modbusReads) && opts.modbusReads.length
    ? opts.modbusReads
    : null;

  let modbusMap = null;
  if (opts.presetId) {
    modbusMap = modbusMapFromPreset(opts.presetId, {
      slaveId: opts.slaveId,
      baud: opts.baud,
      parity: opts.parity,
      stopBits: opts.stopBits,
    });
  }

  const reads = modbusReads || (modbusMap?.reads || []).map((r) => ({
    slaveId: r.slaveId,
    functionCode: r.functionCode,
    startRegister: r.startRegister,
    registerCount: r.registerCount,
  })) || [{
    slaveId: opts.slaveId ?? 1,
    functionCode: opts.functionCode ?? 3,
    startRegister: opts.startRegister ?? 0,
    registerCount: opts.registerCount ?? 4,
  }];

  const atCommands = [
    'AT+MOD=1',
    `AT+BAUDR=${modbusMap?.baud ?? opts.baud ?? 9600}`,
    `AT+PARITY=${parityToDragino(modbusMap?.parity ?? opts.parity ?? 'none')}`,
    'AT+STOPBIT=0',
    'AT+DATABIT=8',
    'AT+MBFUN=1',
    `AT+PRO=3,5`,
    `AT+SERVADDR=${broker.host},${broker.port}`,
    `AT+CLIENT=${opts.clientId || deviceId}`.slice(0, 64),
    'AT+UNAME=peaklogic',
    'AT+PWD=<MOSQUITTO_PASS>',
    `AT+PUBTOPIC=${mqttTopics.pubTopic}`,
    `AT+SUBTOPIC=${mqttTopics.subTopic}`,
    `AT+TDC=${reportIntervalSec}`,
  ];

  reads.slice(0, 15).forEach((read, i) => {
    atCommands.push(`AT+COMMAND${i + 1}=${buildModbusReadCommand(read)}`);
  });

  if (opts.sensorPower5vMs) {
    atCommands.push(`AT+5VT=${opts.sensorPower5vMs}`);
  }

  const tagPreview = (modbusMap?.tags || []).map((t) => ({
    id: t.id,
    type: t.type,
    register: t.address,
    table: t.table,
  }));

  return {
    role: 'rs485_mqtt_gateway',
    deviceId,
    tenantId: tenantId || null,
    reportIntervalSec,
    modbusMap: modbusMap ? {
      presetId: modbusMap.presetId,
      presetLabel: modbusMap.presetLabel,
      baud: modbusMap.baud,
      slaveId: modbusMap.slaveId,
      parity: modbusMap.parity,
      stopBits: modbusMap.stopBits,
      tagCount: modbusMap.tags.length,
      tags: tagPreview,
    } : null,
    passthrough: {
      supported: false,
      reason: 'Dragino RS485-NB polls on interval (TDC); no synchronous Modbus RTU tunnel. Use modbusMap binding instead.',
      downlinkNote: 'MQTT downlink {AT+GETSENSORVALUE=1} triggers one sample — not suitable for scan-rate I/O',
    },
    mqtt: {
      brokerHost: broker.host,
      brokerPort: broker.port,
      tls: broker.tls,
      username: opts.mqttUsername || mqttParc?.username || 'peaklogic',
      pubTopic: mqttTopics.pubTopic,
      subTopic: mqttTopics.subTopic,
      note: 'Dragino publishes JSON; PeakLogic decodes Payload hex using bound Modbus template',
    },
    rs485: {
      mode: 'modbus_rtu',
      baud: modbusMap?.baud ?? opts.baud ?? 9600,
      parity: modbusMap?.parity ?? opts.parity ?? 'none',
      dataBits: 8,
      stopBits: modbusMap?.stopBits ?? opts.stopBits ?? 1,
      reads,
    },
    atCommands,
    peaklogic: {
      presetId: opts.presetId || 'dragino_rs485_nb',
      driverType: 'mqtt_parc',
      telemetryOnly: true,
      remoteExecution: false,
      bindPresetApi: 'POST /api/parc/dragino-gateway/bind-preset',
      steps: modbusMap ? [
        `POST bind-preset with presetId ${modbusMap.presetId} and deviceId ${deviceId}`,
        'Configure Dragino via BLE with atCommands below',
        'After first uplink → tags appear as named Modbus points (EC_US_CM, etc.)',
      ] : [
        'Enable MQTT Parc hub (cloud: broker mqtt://127.0.0.1:1883 + Mosquitto creds)',
        `POST bind-preset with presetId (modbus template) and deviceId ${deviceId}`,
        'Configure Dragino via BLE with atCommands below',
        'After first uplink → Sync tags from device',
      ],
    },
    architecture: [
      'RS485 Modbus sensor(s) → Dragino RS485-NB (polled gateway, not passthrough)',
      'NB-IoT → MQTT JSON → peaklogic.io',
      'Cloud Parc hub decodes Modbus map → parc.json → mqtt_parc driver',
    ],
  };
}

module.exports = {
  parseMqttBrokerHostPort,
  resolveDraginoCloudBroker,
  buildModbusReadCommand,
  buildDraginoGatewayPlan,
  resolveDraginoReportIntervalSec,
  DRAGINO_DEFAULT_REPORT_INTERVAL_SEC,
};
