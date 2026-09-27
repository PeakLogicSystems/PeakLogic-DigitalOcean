'use strict';

/**
 * Industrial I/O device templates — driver + tag mappings.
 * Built-in presets below; additional templates: src/devices/templates/*.json
 */

const {
  diTags,
  doTags,
  holdingRegTags,
  inputRegTags,
  halDiTags,
  halDoTags,
  halAiTags,
  halAoTags,
  halCntTags,
  modbusDintArrayTags,
} = require('./tagBuilders');
const { loadJsonTemplates } = require('./loadJsonTemplates');

const BUILTIN_PRESETS = [
  {
    id: 'hal_builtin_sim',
    label: 'Built-in HAL (sim) — 8 DI, 8 DO, 4 AI, 2 AO, 2 HW counters',
    vendor: 'PeakLogic',
    model: 'HAL simulation',
    transport: 'hal',
    defaults: { backend: 'sim' },
    driver: (opts) => ({
      id: opts.driverId || 'hal0',
      type: 'hal',
      enabled: true,
      backend: opts.backend || 'sim',
      limits: { di: 16, do: 16, ai: 8, ao: 4, cnt: 4 },
      counterBindings: {
        0: { pulseDi: 'DI0' },
        1: { pulseDi: 'DI1' },
      },
      simValues: { DI0: false, DI1: false },
    }),
    tags: (opts) => {
      const id = opts.driverId || 'hal0';
      return [
        ...halDiTags(id, 8),
        ...halDoTags(id, 8),
        ...halAiTags(id, 4),
        ...halAoTags(id, 2),
        ...halCntTags(id, 2),
      ];
    },
  },
  {
    id: 'sequent_sm_i001_rpi4',
    label: 'Raspberry Pi 4 + Sequent SM-I-001 (HAL plugin)',
    vendor: 'Sequent Microsystems',
    model: 'SM-I-001 Industrial Automation HAT',
    transport: 'hal',
    defaults: {
      backend: 'native',
      pluginPath: '/usr/lib/libpeaklogic_hal_sm_i001.so',
      stack: 0,
      i2cBus: 1,
    },
    driver: (opts) => ({
      id: opts.driverId || 'sm_ind',
      type: 'hal',
      enabled: true,
      backend: 'native',
      pluginPath: opts.pluginPath || '/usr/lib/libpeaklogic_hal_sm_i001.so',
      limits: { di: 4, do: 4, ai: 8, ao: 8, cnt: 4 },
      halConfig: {
        stack: opts.stack ?? 0,
        i2cBus: opts.i2cBus ?? 1,
      },
    }),
    tags: (opts) => {
      const id = opts.driverId || 'sm_ind';
      return [
        ...halDiTags(id, 4, 'DI'),
        ...halDoTags(id, 4, 'Q'),
        ...halAiTags(id, 4, 'U_IN', 0),
        ...halAiTags(id, 4, 'I_IN', 4),
        ...halAoTags(id, 4, 'U_OUT', 0),
        ...halAoTags(id, 4, 'I_OUT', 4),
        ...halCntTags(id, 4, 'HWCNT'),
      ];
    },
  },
  {
    id: 'hal_linux_plugin',
    label: 'Built-in HAL (Linux plugin) — board .so',
    vendor: 'PeakLogic',
    model: 'HAL native plugin',
    transport: 'hal',
    defaults: { backend: 'native', pluginPath: '/usr/lib/libpeaklogic_hal.so' },
    driver: (opts) => ({
      id: opts.driverId || 'hal0',
      type: 'hal',
      enabled: true,
      backend: 'native',
      pluginPath: opts.pluginPath || '/usr/lib/libpeaklogic_hal.so',
      limits: { di: 32, do: 32, ai: 16, ao: 8, cnt: 8 },
    }),
    tags: (opts) => {
      const id = opts.driverId || 'hal0';
      return [
        ...halDiTags(id, 8),
        ...halDoTags(id, 8),
        ...halAiTags(id, 4),
        ...halCntTags(id, 2),
      ];
    },
  },
  {
    id: 'modbus_dint_array_8',
    label: 'Modbus 32-bit array — 8 DINT block (FC16)',
    vendor: 'Generic',
    model: 'Holding register array',
    transport: 'modbus_tcp',
    defaults: { host: '127.0.0.1', port: 502, slaveId: 1 },
    driver: (opts) => ({
      id: opts.driverId || 'mb_dint',
      type: 'modbus_tcp',
      enabled: true,
      host: opts.host || '127.0.0.1',
      port: opts.port ?? 502,
      slaveId: opts.slaveId ?? 1,
      timeoutMs: 1000,
    }),
    tags: (opts) => modbusDintArrayTags(opts.driverId || 'mb_dint', 8, 0, 'DINT'),
  },
  {
    id: 'waveshare_rtu_io_8ch',
    label: 'Waveshare Modbus RTU IO 8CH (8 DI + 8 DO)',
    vendor: 'Waveshare',
    model: 'Modbus RTU IO 8CH',
    transport: 'modbus_rtu',
    defaults: { serialPort: 'COM3', baud: 9600, slaveId: 1, parity: 'none' },
    driver: (opts) => ({
      id: opts.driverId || 'ws_rtu_8',
      type: 'modbus_rtu',
      enabled: true,
      serialPort: opts.serialPort || 'COM3',
      baud: opts.baud ?? 9600,
      slaveId: opts.slaveId ?? 1,
      parity: opts.parity || 'none',
      timeoutMs: 1000,
    }),
    tags: (opts) => [
      ...diTags(opts.driverId || 'ws_rtu_8', 8, 'DI'),
      ...doTags(opts.driverId || 'ws_rtu_8', 8, 'Q'),
    ],
  },
  {
    id: 'waveshare_eth_io_8ch',
    label: 'Waveshare Modbus TCP/ETH IO 8CH (8 DI + 8 DO)',
    vendor: 'Waveshare',
    model: 'Modbus POE ETH IO 8CH',
    transport: 'modbus_tcp',
    defaults: { host: '192.168.1.253', port: 502, slaveId: 1 },
    driver: (opts) => ({
      id: opts.driverId || 'ws_eth_8',
      type: 'modbus_tcp',
      enabled: true,
      host: opts.host || '192.168.1.253',
      port: opts.port ?? 502,
      slaveId: opts.slaveId ?? 1,
      timeoutMs: 1000,
    }),
    tags: (opts) => [
      ...diTags(opts.driverId || 'ws_eth_8', 8, 'DI'),
      ...doTags(opts.driverId || 'ws_eth_8', 8, 'Q'),
    ],
  },
  {
    id: 'generic_modbus_rtu_8x8',
    label: 'Generic Modbus RTU — 8 DI + 8 DO',
    vendor: 'Generic',
    model: '8DI/8DO RTU',
    transport: 'modbus_rtu',
    defaults: { serialPort: 'COM3', baud: 9600, slaveId: 1, parity: 'none' },
    driver: (opts) => ({
      id: opts.driverId || 'mb_rtu_8',
      type: 'modbus_rtu',
      enabled: true,
      serialPort: opts.serialPort || 'COM3',
      baud: opts.baud ?? 9600,
      slaveId: opts.slaveId ?? 1,
      parity: opts.parity || 'none',
      timeoutMs: 1000,
    }),
    tags: (opts) => [
      ...diTags(opts.driverId || 'mb_rtu_8', 8, 'DI'),
      ...doTags(opts.driverId || 'mb_rtu_8', 8, 'Q'),
    ],
  },
];

function allPresets() {
  return [...BUILTIN_PRESETS, ...loadJsonTemplates()];
}

function listPresets() {
  return allPresets().map((p) => ({
    id: p.id,
    label: p.label,
    vendor: p.vendor,
    model: p.model,
    transport: p.transport,
    defaults: p.defaults,
    driverId: p.driver({}).id,
    sharedBus: p.sharedBus !== false,
    diCount: p.diCount ?? 8,
    doCount: p.doCount ?? 8,
    aiCount: p.aiCount ?? 0,
    hrCount: p.hrCount ?? 0,
  }));
}

function getPreset(id) {
  return allPresets().find((p) => p.id === id) || null;
}

function buildFromPreset(presetId, options = {}) {
  const preset = getPreset(presetId);
  if (!preset) throw Object.assign(new Error(`Unknown device preset: ${presetId}`), { status: 404 });
  const defined = Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined && v !== null)
  );
  const driverId = defined.driverId || preset.driver({}).id;
  const defs = preset.defaults || {};
  let opts;
  if (preset.sharedBus === false) {
    // Dedicated instrument: baud/parity/slave from template; only COM/host are overridable.
    opts = { ...defs, driverId };
    if (defined.serialPort) opts.serialPort = defined.serialPort;
    if (defined.host) opts.host = defined.host;
    if (defined.port != null) opts.port = defined.port;
  } else {
    opts = { ...defs, ...defined, driverId };
  }
  return {
    preset: { id: preset.id, label: preset.label },
    driver: preset.driver(opts),
    tags: preset.tags(opts),
  };
}

module.exports = {
  listPresets,
  getPreset,
  buildFromPreset,
  diTags,
  doTags,
  holdingRegTags,
  inputRegTags,
};
