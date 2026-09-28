'use strict';

const fs = require('fs');
const path = require('path');
const { ST_DIR, DEFAULT_MQTT_PARC_BROKER } = require('../config');
const { normalizeHmi } = require('../hmi/hmiConfig');
const { EST_FORMAT } = require('../project/estFile');

const FIXTURE_DIR = path.join(ST_DIR, 'fixtures');
const ACTIVE_PROGRAM = 'logic/30_pool_controller.st';
const PROJECT_ID = 'iot-link-pool';

/** Compulab IOT-LINK RS-485 tty mapping (FARS4 = PORT A, FBRS4 = PORT B). */
const IOT_LINK_DEFAULT_PORTS = {
  portA: '/dev/ttyLP6',
  portB: '/dev/ttyLP4',
};

const DEFAULT_INTELLIFLO_ADDR = 96;
const DEFAULT_INTELLIVALVE_ADDR = 12;
const DEFAULT_JANDY_EPUMP_ADDR = 120;
const DEFAULT_HAYWARD_PUMP_HUA = 0;

const PENTAIR_BUS_TAG_FIXTURES = [
  'tags.pentair_intelliflo.json',
  'tags.pentair_intellichlor.json',
  'tags.pentair_ultratemp.json',
  'tags.pentair_valves.json',
];

const JANDY_BUS_TAG_FIXTURES = [
  'tags.jandy_epump.json',
  'tags.jandy_aquapure.json',
  'tags.jandy_jxi_heater.json',
  'tags.jandy_lx_heater.json',
  'tags.jandy_heat_pump.json',
];

const HAYWARD_BUS_TAG_FIXTURES = [
  'tags.hayward_vs_pump.json',
];

function readFixtureJson(name) {
  const fp = path.join(FIXTURE_DIR, name);
  if (!fs.existsSync(fp)) {
    throw new Error(`Missing fixture: ${name}`);
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function resolveSerialPorts(env = process.env) {
  return {
    portA: String(env.PEAKLOGIC_RS485_PORT_A || IOT_LINK_DEFAULT_PORTS.portA).trim(),
    portB: String(env.PEAKLOGIC_RS485_PORT_B || IOT_LINK_DEFAULT_PORTS.portB).trim(),
  };
}

function featureFlags(env = process.env) {
  const truthy = (v, fallback) => {
    if (v == null || v === '') return fallback;
    return /^(1|true|yes|on)$/i.test(String(v));
  };
  const pentairBus = truthy(env.PEAKLOGIC_POOL_PENTAIR_BUS, false);
  const intellifloPump = truthy(env.PEAKLOGIC_POOL_INTELLIFLO, pentairBus);
  const intellivalve = truthy(env.PEAKLOGIC_POOL_INTELLIVALVE, pentairBus);
  const jandyBus = truthy(env.PEAKLOGIC_POOL_JANDY_BUS, false);
  const jandyEpump = truthy(env.PEAKLOGIC_POOL_JANDY_EPUMP, jandyBus);
  const haywardBus = truthy(env.PEAKLOGIC_POOL_HAYWARD_BUS, false);
  const haywardPump = truthy(env.PEAKLOGIC_POOL_HAYWARD_PUMP, haywardBus);
  return {
    pentairHeatPump: truthy(env.PEAKLOGIC_POOL_PENTAIR, true),
    pentairBus,
    intellifloPump,
    intellivalve,
    jandyBus,
    jandyEpump,
    haywardBus,
    haywardPump,
    optaIo: truthy(env.PEAKLOGIC_POOL_OPTA_IO, true),
    modbusChemistryBus: truthy(env.PEAKLOGIC_POOL_MODBUS_CHEM, false),
  };
}

function intellifloAddr(env = process.env) {
  const n = Number(env.PEAKLOGIC_POOL_INTELLIFLO_ADDR);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTELLIFLO_ADDR;
}

function intellivalveAddr(env = process.env) {
  const n = Number(env.PEAKLOGIC_POOL_INTELLIVALVE_ADDR);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTELLIVALVE_ADDR;
}

function jandyEpumpAddr(env = process.env) {
  const n = Number(env.PEAKLOGIC_POOL_JANDY_EPUMP_ADDR);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_JANDY_EPUMP_ADDR;
}

function haywardPumpHua(env = process.env) {
  const n = Number(env.PEAKLOGIC_POOL_HAYWARD_PUMP_HUA);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_HAYWARD_PUMP_HUA;
}

function mergePentairBusTags(byId, driverId = 'pentair_bus') {
  for (const name of PENTAIR_BUS_TAG_FIXTURES) {
    for (const tag of readFixtureJson(name)) {
      byId.set(tag.id, {
        ...tag,
        driverId: driverId || tag.driverId || 'pentair_bus',
        driverAddress: {
          ...(tag.driverAddress || {}),
          deviceClass: tag.driverAddress?.deviceClass
            || (tag.id.startsWith('HP_') ? 'ultratemp' : undefined),
        },
      });
    }
  }
}

function mergeJandyBusTags(byId, driverId = 'jandy_bus') {
  for (const name of JANDY_BUS_TAG_FIXTURES) {
    for (const tag of readFixtureJson(name)) {
      byId.set(tag.id, {
        ...tag,
        driverId: driverId || tag.driverId || 'jandy_bus',
        driverAddress: {
          ...(tag.driverAddress || {}),
          deviceClass: tag.driverAddress?.deviceClass
            || (tag.id.startsWith('JHP_') ? 'heat_pump'
              : tag.id.startsWith('JLX_') ? 'lx_heater'
                : tag.id.startsWith('JXI_') ? 'jxi_heater'
                  : tag.id.startsWith('JAP_') ? 'aquapure' : 'epump'),
        },
      });
    }
  }
}

function mergeHaywardBusTags(byId, driverId = 'hayward_bus', hua = 0) {
  for (const name of HAYWARD_BUS_TAG_FIXTURES) {
    for (const tag of readFixtureJson(name)) {
      byId.set(tag.id, {
        ...tag,
        driverId: driverId || tag.driverId || 'hayward_bus',
        driverAddress: {
          ...(tag.driverAddress || {}),
          deviceClass: 'vs_pump',
          deviceAddr: hua,
        },
      });
    }
  }
}

/** Retarget Speck pump tags to Jandy ePump (ST tag IDs unchanged). */
function retargetPoolPumpToJandyEpump(byId, driverId, addr) {
  const base = { deviceClass: 'epump', deviceAddr: addr };
  const map = {
    PUMP_RPM: { jandy: 'rpm', ...base },
    PUMP_RPM_DEM: { jandy: 'rpm', ...base },
    PUMP_PWR_W: { jandy: 'watts', ...base },
    PUMP_RUN_CMD: { jandy: 'run_cmd', ...base },
    PUMP_RPM_CMD: { jandy: 'rpm_cmd', ...base },
  };
  for (const [id, driverAddress] of Object.entries(map)) {
    const t = byId.get(id);
    if (!t) continue;
    byId.set(id, { ...t, driverId, driverAddress });
  }
}

/** Retarget Speck pump tags to Hayward VS pump (ST tag IDs unchanged). */
function retargetPoolPumpToHaywardVs(byId, driverId, hua) {
  const base = { deviceClass: 'vs_pump', deviceAddr: hua };
  const map = {
    PUMP_RPM: { hayward: 'rpm', ...base },
    PUMP_RPM_DEM: { hayward: 'rpm', ...base },
    PUMP_PWR_W: { hayward: 'watts', ...base },
    PUMP_RUN_CMD: { hayward: 'run_cmd', ...base },
    PUMP_RPM_CMD: { hayward: 'speed_cmd', ...base },
  };
  for (const [id, driverAddress] of Object.entries(map)) {
    const t = byId.get(id);
    if (!t) continue;
    byId.set(id, { ...t, driverId, driverAddress });
  }
}

/** Retarget Speck pump tags to IntelliFlo (ST tag IDs unchanged). */
function retargetPoolPumpToIntelliflo(byId, driverId, addr) {
  const base = { deviceClass: 'intelliflo', deviceAddr: addr };
  const map = {
    PUMP_RPM: { pentair: 'rpm', ...base },
    PUMP_RPM_DEM: { pentair: 'rpm', ...base },
    PUMP_PWR_W: { pentair: 'watts', ...base },
    PUMP_RUN_CMD: { pentair: 'run_cmd', ...base },
    PUMP_RPM_CMD: { pentair: 'rpm_cmd', ...base },
    PUMP_STA_RAW: { pentair: 'status_speck', ...base },
  };
  for (const [id, driverAddress] of Object.entries(map)) {
    const t = byId.get(id);
    if (!t) continue;
    byId.set(id, { ...t, driverId, driverAddress });
  }
  if (!byId.has('IFLO_REMOTE_CMD')) {
    byId.set('IFLO_REMOTE_CMD', {
      id: 'IFLO_REMOTE_CMD',
      label: 'IntelliFlo remote cmd',
      type: 'BOOL',
      role: 'output',
      value: true,
      driverId,
      driverAddress: { pentair: 'remote_cmd', ...base },
    });
  }
}

/** Retarget backwash valve tags to Pentair IntelliValve (ST tag IDs unchanged). */
function retargetBackwashValveToIntellivalve(byId, driverId, addr) {
  const base = { deviceClass: 'intellivalve', deviceAddr: addr };
  const map = {
    BW_VLV1_CMD: { pentair: 'pos_cmd', ...base },
    VLV1_AT_POS: { pentair: 'at_pos', ...base },
  };
  for (const [id, driverAddress] of Object.entries(map)) {
    const t = byId.get(id);
    if (!t) continue;
    byId.set(id, { ...t, driverId, driverAddress });
  }
  const cfg = byId.get('POOL_CFG_PENTAIR_VLV');
  if (cfg) byId.set('POOL_CFG_PENTAIR_VLV', { ...cfg, value: true });
}

/**
 * Load IOT-LINK pool driver bundle with Linux serial ports and feature toggles.
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function loadIotLinkPoolDrivers(opts = {}) {
  const env = opts.env || process.env;
  const ports = resolveSerialPorts(env);
  const features = featureFlags(env);
  const drivers = readFixtureJson('drivers.iot_link_pool.json').map((d) => ({ ...d }));

  for (const d of drivers) {
    if (d.id === 'badu_pump') {
      d.serialPort = ports.portA;
      d.enabled = !features.intellifloPump && !features.jandyEpump && !features.haywardPump;
    }
    if (d.id === 'pentair_hp') {
      d.serialPort = ports.portB;
      d.enabled = features.pentairHeatPump && !features.modbusChemistryBus
        && !features.pentairBus && !features.jandyBus && !features.haywardBus;
    }
    if (d.id === 'pentair_bus') {
      d.serialPort = ports.portB;
      d.enabled = features.pentairBus && !features.modbusChemistryBus
        && !features.jandyBus && !features.haywardBus;
      d.busGapMs = Number(d.busGapMs) || 120;
      d.pollIntervalMs = Number(d.pollIntervalMs) || 60000;
    }
    if (d.id === 'jandy_bus') {
      d.serialPort = ports.portB;
      d.enabled = features.jandyBus && !features.modbusChemistryBus
        && !features.pentairBus && !features.haywardBus;
      d.deviceAddr = jandyEpumpAddr(env);
      d.busGapMs = Number(d.busGapMs) || 120;
      d.pollIntervalMs = Number(d.pollIntervalMs) || 60000;
    }
    if (d.id === 'hayward_bus') {
      d.serialPort = ports.portB;
      d.enabled = features.haywardBus && !features.modbusChemistryBus
        && !features.pentairBus && !features.jandyBus;
      d.deviceAddr = haywardPumpHua(env);
      d.pollIntervalMs = Number(d.pollIntervalMs) || 5000;
      d.keepaliveMs = Number(d.keepaliveMs) || 1000;
    }
    if (d.id === 'opta_mqtt_st') d.enabled = features.optaIo;
  }

  if (features.modbusChemistryBus) {
    drivers.push({
      id: 'pool_chem_rtu',
      type: 'modbus_rtu',
      enabled: true,
      serialPort: ports.portB,
      baud: 9600,
      slaveId: 1,
      parity: 'none',
      stopBits: 1,
      timeoutMs: 2000,
      pollIntervalMs: 5000,
    });
  }

  return drivers;
}

/** Merge pool controller tags with optional Pentair heat-pump tags. */
function loadIotLinkPoolTags(opts = {}) {
  const env = opts.env || process.env;
  const features = featureFlags(env);
  const base = readFixtureJson('tags.pool_controller.json');
  const byId = new Map(base.map((t) => [t.id, { ...t }]));

  if (features.pentairBus && !features.modbusChemistryBus && !features.jandyBus && !features.haywardBus) {
    mergePentairBusTags(byId, 'pentair_bus');
  } else if (features.pentairHeatPump && !features.modbusChemistryBus
      && !features.jandyBus && !features.haywardBus) {
    for (const tag of readFixtureJson('tags.pentair_ultratemp.json')) {
      byId.set(tag.id, { ...tag, driverId: 'pentair_hp' });
    }
  }

  if (features.jandyBus && !features.modbusChemistryBus && !features.pentairBus && !features.haywardBus) {
    mergeJandyBusTags(byId, 'jandy_bus');
  }

  if (features.haywardBus && !features.modbusChemistryBus && !features.pentairBus && !features.jandyBus) {
    mergeHaywardBusTags(byId, 'hayward_bus', haywardPumpHua(env));
  }

  if (features.intellifloPump && !features.modbusChemistryBus && !features.jandyEpump && !features.haywardPump) {
    const driverId = features.pentairBus ? 'pentair_bus' : 'pentair_pump';
    retargetPoolPumpToIntelliflo(byId, driverId, intellifloAddr(env));
  }

  if (features.jandyEpump && !features.modbusChemistryBus && !features.intellifloPump && !features.haywardPump) {
    const driverId = features.jandyBus ? 'jandy_bus' : 'jandy_pump';
    retargetPoolPumpToJandyEpump(byId, driverId, jandyEpumpAddr(env));
  }

  if (features.haywardPump && !features.modbusChemistryBus && !features.intellifloPump && !features.jandyEpump) {
    const driverId = features.haywardBus ? 'hayward_bus' : 'hayward_pump';
    retargetPoolPumpToHaywardVs(byId, driverId, haywardPumpHua(env));
  }

  if (features.intellivalve && features.pentairBus && !features.modbusChemistryBus
      && !features.jandyBus && !features.haywardBus) {
    retargetBackwashValveToIntellivalve(byId, 'pentair_bus', intellivalveAddr(env));
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function loadIotLinkPoolSettings(opts = {}) {
  const env = opts.env || process.env;
  const base = readFixtureJson('settings.iot_link_pool.json');
  const features = featureFlags(env);
  const settings = {
    ...base,
    mqttParc: {
      ...(base.mqttParc || {}),
      brokerUrl: env.PEAKLOGIC_MQTT_BROKER || base.mqttParc?.brokerUrl || DEFAULT_MQTT_PARC_BROKER,
    },
    features: {
      ...(base.features || {}),
      pentairHeatPump: features.pentairHeatPump,
      pentairBus: features.pentairBus,
      intellifloPump: features.intellifloPump,
      intellivalve: features.intellivalve,
      jandyBus: features.jandyBus,
      jandyEpump: features.jandyEpump,
      haywardBus: features.haywardBus,
      haywardPump: features.haywardPump,
      optaIo: features.optaIo,
      modbusChemistryBus: features.modbusChemistryBus,
    },
  };
  settings.hmi = normalizeHmi(settings.hmi || {}, loadIotLinkPoolTags(opts));
  return settings;
}

function readActiveProgramSource() {
  const fp = path.join(ST_DIR, ACTIVE_PROGRAM);
  if (!fs.existsSync(fp)) throw new Error(`Missing program: ${ACTIVE_PROGRAM}`);
  return fs.readFileSync(fp, 'utf8');
}

function buildWorkspaceEst(tags, drivers, settings) {
  return {
    format: EST_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    project: { name: PROJECT_ID },
    tags,
    drivers,
    program: readActiveProgramSource(),
    activeProgram: ACTIVE_PROGRAM,
    settings,
  };
}

/** Full .est snapshot for export / project hub (no persistence writes). */
function buildIotLinkPoolEstDoc(opts = {}) {
  const tags = loadIotLinkPoolTags(opts);
  const drivers = loadIotLinkPoolDrivers(opts);
  const settings = loadIotLinkPoolSettings(opts);
  return buildWorkspaceEst(tags, drivers, settings);
}

/**
 * Write pool appliance config into PEAKLOGIC_DATA (tags, drivers, settings, workspace).
 * @param {{ writeJson: Function, flushConfig?: Function }} persistence
 * @param {{ force?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 */
async function seedIotLinkPoolConfig(persistence, opts = {}) {
  const env = opts.env || process.env;
  const existing = persistence.readJson('settings.json', {});
  if (!opts.force && existing.activeProgram) {
    return { seeded: false, reason: 'settings.json already configured' };
  }

  const tags = loadIotLinkPoolTags({ env });
  const drivers = loadIotLinkPoolDrivers({ env });
  const settings = loadIotLinkPoolSettings({ env });

  persistence.writeJson('tags.json', tags);
  persistence.writeJson('drivers.json', drivers);
  persistence.writeJson('settings.json', settings);
  persistence.writeJson('workspace.est.json', buildWorkspaceEst(tags, drivers, settings));

  if (typeof persistence.flushConfig === 'function') {
    await persistence.flushConfig();
  }

  return {
    seeded: true,
    activeProgram: ACTIVE_PROGRAM,
    drivers: drivers.map((d) => ({ id: d.id, type: d.type, enabled: d.enabled, serialPort: d.serialPort })),
    tagCount: tags.length,
    features: featureFlags(env),
  };
}

module.exports = {
  ACTIVE_PROGRAM,
  PROJECT_ID,
  IOT_LINK_DEFAULT_PORTS,
  DEFAULT_INTELLIFLO_ADDR,
  DEFAULT_INTELLIVALVE_ADDR,
  DEFAULT_JANDY_EPUMP_ADDR,
  DEFAULT_HAYWARD_PUMP_HUA,
  PENTAIR_BUS_TAG_FIXTURES,
  JANDY_BUS_TAG_FIXTURES,
  HAYWARD_BUS_TAG_FIXTURES,
  resolveSerialPorts,
  featureFlags,
  intellifloAddr,
  intellivalveAddr,
  jandyEpumpAddr,
  haywardPumpHua,
  mergePentairBusTags,
  mergeJandyBusTags,
  mergeHaywardBusTags,
  retargetPoolPumpToIntelliflo,
  retargetPoolPumpToJandyEpump,
  retargetPoolPumpToHaywardVs,
  retargetBackwashValveToIntellivalve,
  loadIotLinkPoolDrivers,
  loadIotLinkPoolTags,
  loadIotLinkPoolSettings,
  buildIotLinkPoolEstDoc,
  seedIotLinkPoolConfig,
};
