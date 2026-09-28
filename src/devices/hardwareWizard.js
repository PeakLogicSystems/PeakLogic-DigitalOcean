'use strict';

const { defaultModbusRtuSerialPort } = require('../appliance/defaultRs485Port');

const WIZARD_TRANSPORT_GROUPS = [
  {
    id: 'modbus_rtu',
    label: 'Modbus RTU (RS-485 / USB serial)',
    hint: 'Datexel DAT10148, Waveshare, S::CAN Spectro::Lyser RTU, APG True Echo radar, DFRobot/JXCT/Seeed sensors',
  },
  {
    id: 'modbus_tcp',
    label: 'Modbus TCP (Ethernet)',
    hint: 'Spectro::Lyser TCP, ConCube TCP, and other Ethernet Modbus devices',
  },
  {
    id: 'mqtt_parc',
    label: 'MQTT Parc — Arduino Opta',
    hint: 'Remote ST on Opta; PeakLogic syncs tags from device telemetry',
  },
  {
    id: 'mqtt',
    label: 'MQTT broker (subscribe/publish)',
    hint: 'EdgePoint Industrial, Nexcomm Halo/BME688/HaLow leak sensors',
  },
  {
    id: 'nextcentury',
    label: 'NextCentury cloud API',
    hint: 'Utility metering — set credentials on Drivers → NextCentury API after apply',
  },
  {
    id: 'hal',
    label: 'HAL / onboard I/O',
    hint: 'Built-in simulation HAL or Linux HAT plugins (Sequent SM-I-001)',
  },
  {
    id: 'https',
    label: 'HTTPS REST polling',
    hint: 'Devices polled over HTTPS REST endpoints',
  },
];

const TRANSPORT_TO_GROUP = {
  modbus_rtu: 'modbus_rtu',
  vgreen_epc: 'modbus_rtu',
  pentair_rs485: 'modbus_rtu',
  jandy_rs485: 'modbus_rtu',
  hayward_rs485: 'modbus_rtu',
  modbus_tcp: 'modbus_tcp',
  mqtt_parc: 'mqtt_parc',
  mqtt_parc_telemetry: 'mqtt_parc',
  mqtt: 'mqtt',
  nextcentury: 'nextcentury',
  hal: 'hal',
  https: 'https',
};

function listTransportGroups() {
  return WIZARD_TRANSPORT_GROUPS.map((g) => ({ ...g }));
}

function transportGroupForPreset(preset) {
  const t = preset?.transport;
  return TRANSPORT_TO_GROUP[t] || null;
}

function filterPresetsByTransportGroup(groupId, presets) {
  const list = Array.isArray(presets) ? presets : [];
  if (!groupId) return list;
  return list.filter((p) => transportGroupForPreset(p) === groupId);
}

function connectionFieldSpec(preset) {
  const transport = preset?.transport;
  const defs = preset?.defaults || {};
  if (transport === 'modbus_tcp') {
    return [
      { id: 'host', label: 'TCP host', type: 'text', default: defs.host || '127.0.0.1' },
      { id: 'port', label: 'TCP port', type: 'number', default: defs.port ?? 502 },
      { id: 'slaveId', label: 'Slave ID', type: 'number', default: defs.slaveId ?? 1 },
    ];
  }
  if (transport === 'mqtt_parc' || transport === 'mqtt_parc_telemetry') {
    return [
      {
        id: 'deviceId',
        label: 'Opta device ID',
        type: 'text',
        default: defs.deviceId || preset?.driverId || 'opta_st_01',
        hint: 'ATECC serial id (opta_…) from firmware /setup, or legacy opta_st_01',
      },
      {
        id: 'driverId',
        label: 'Position / driver ID',
        type: 'text',
        default: preset?.driverId || 'opta_st_01',
        hint: 'Stable plant name — tags bind to this id',
      },
    ];
  }
  if (transport === 'mqtt') {
    return [
      { id: 'brokerUrl', label: 'Broker URL', type: 'text', default: defs.brokerUrl || 'mqtt://127.0.0.1:1883' },
      { id: 'topicPrefix', label: 'Topic prefix', type: 'text', default: defs.topicPrefix || '' },
      { id: 'clientId', label: 'Client ID', type: 'text', default: defs.clientId || '' },
    ];
  }
  if (transport === 'nextcentury' || transport === 'hal' || transport === 'https') {
    return [];
  }
  return [
    { id: 'serialPort', label: 'COM port', type: 'text', default: defs.serialPort || defaultModbusRtuSerialPort() },
    { id: 'baud', label: 'Baud', type: 'number', default: defs.baud ?? 9600 },
    { id: 'slaveId', label: 'Slave ID', type: 'number', default: defs.slaveId ?? 1 },
    { id: 'parity', label: 'Parity', type: 'text', default: defs.parity || 'none' },
    { id: 'stopBits', label: 'Stop bits', type: 'number', default: defs.stopBits ?? 1 },
  ];
}

function defaultConnectionValues(preset, hwDefaults = {}) {
  const spec = connectionFieldSpec(preset);
  const out = {};
  for (const f of spec) {
    if (f.id === 'serialPort' && hwDefaults.serialPort) {
      out.serialPort = hwDefaults.serialPort;
    } else if (f.id === 'baud' && hwDefaults.baud != null) {
      out.baud = hwDefaults.baud;
    } else if (f.id === 'slaveId' && hwDefaults.slaveId != null) {
      out.slaveId = hwDefaults.slaveId;
    } else {
      out[f.id] = f.default;
    }
  }
  return out;
}

/**
 * Build POST /devices/apply body from wizard form values.
 * @param {object} preset - preset metadata from listPresets()
 * @param {object} values - connection field values from wizard step 3
 * @param {object} [options]
 * @param {boolean} [options.replaceTags]
 * @param {number} [options.paramGroups] - ConCube parameter groups
 */
function buildApplyPresetRequest(preset, values = {}, options = {}) {
  if (!preset?.id) throw new Error('preset required');
  const transport = preset.transport;
  const replaceTags = options.replaceTags === true;
  const body = {
    presetId: preset.id,
    replaceTags,
    slaveId: values.slaveId != null ? +values.slaveId : (preset.defaults?.slaveId ?? 1),
  };
  if (options.paramGroups != null) body.paramGroups = options.paramGroups;
  if (values.driverId) body.driverId = String(values.driverId).trim();
  if (transport === 'modbus_tcp') {
    if (values.host) body.host = values.host;
    if (values.port != null) body.port = +values.port;
  } else if (transport === 'mqtt_parc' || transport === 'mqtt_parc_telemetry') {
    if (values.deviceId) body.deviceId = String(values.deviceId).trim();
    if (values.driverId) body.driverId = String(values.driverId).trim();
  } else if (transport === 'mqtt') {
    if (values.brokerUrl) body.brokerUrl = values.brokerUrl;
    if (values.topicPrefix) body.topicPrefix = values.topicPrefix;
    if (values.clientId) body.clientId = values.clientId;
  } else if (
    transport !== 'nextcentury'
    && transport !== 'mqtt'
    && transport !== 'mqtt_parc'
    && transport !== 'mqtt_parc_telemetry'
    && transport !== 'https'
    && transport !== 'hal'
  ) {
    if (values.serialPort) body.serialPort = values.serialPort;
    if (values.baud != null) body.baud = +values.baud;
    if (values.parity) body.parity = values.parity;
    if (values.stopBits != null) body.stopBits = +values.stopBits;
  }
  return body;
}

function wizardSteps() {
  return [
    { id: 'transport', label: 'Transport' },
    { id: 'template', label: 'Device template' },
    { id: 'connection', label: 'Connection' },
    { id: 'apply', label: 'Apply' },
    { id: 'done', label: 'Done' },
  ];
}

module.exports = {
  WIZARD_TRANSPORT_GROUPS,
  listTransportGroups,
  transportGroupForPreset,
  filterPresetsByTransportGroup,
  connectionFieldSpec,
  defaultConnectionValues,
  buildApplyPresetRequest,
  wizardSteps,
};
