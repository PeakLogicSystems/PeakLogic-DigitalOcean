'use strict';

const {
  buildEzMeterModbusTags,
  buildEzMeterDriver,
  liveAnalogRegisterCount,
} = require('./ezmeterRegisterMap');

const EZMETER_DRIVER_ID = 'dds_rgb';
const EZMETER_PRESET_ID = 'ezmeter_dds_rgb_2025';

/** Nominal line-neutral voltage (120 V service). Override via assistedLiving.ezMeter.nominalVoltage. */
const DEFAULT_NOMINAL_V = 120;
const DEFAULT_UNDERVOLT_V = 108;
const DEFAULT_OVERVOLT_V = 132;
const DEFAULT_LOW_PF = 0.85;
const DEFAULT_FREQ_MIN_HZ = 59.5;
const DEFAULT_FREQ_MAX_HZ = 60.5;
const DEFAULT_V_IMBAL_PCT = 5;
const DEFAULT_LOADED_I_A = 1;

function defaultEzMeterDriverId(assistedLiving) {
  return String(assistedLiving?.ezMeter?.driverId || EZMETER_DRIVER_ID).trim() || EZMETER_DRIVER_ID;
}

function isEzMeterFacility(assistedLiving) {
  const mode = String(assistedLiving?.facility?.driver || '').trim().toLowerCase();
  if (mode === 'ezmeter' || mode === 'ez-meter' || mode === 'dds_rgb' || mode === 'dds-rgb') return true;
  return assistedLiving?.ezMeter?.enabled === true;
}

function pqThresholds(assistedLiving) {
  const ez = assistedLiving?.ezMeter || {};
  return {
    nominalV: Number(ez.nominalVoltage) || DEFAULT_NOMINAL_V,
    undervoltV: Number(ez.undervoltV) || DEFAULT_UNDERVOLT_V,
    overvoltV: Number(ez.overvoltV) || DEFAULT_OVERVOLT_V,
    lowPf: Number(ez.lowPf) || DEFAULT_LOW_PF,
    freqMinHz: Number(ez.freqMinHz) || DEFAULT_FREQ_MIN_HZ,
    freqMaxHz: Number(ez.freqMaxHz) || DEFAULT_FREQ_MAX_HZ,
    vImbalPct: Number(ez.vImbalancePct) || DEFAULT_V_IMBAL_PCT,
    loadedIA: Number(ez.loadedCurrentA) || DEFAULT_LOADED_I_A,
  };
}

/**
 * Semantic map: facility summary tags → EZ Meter Modbus source tags.
 * scale/offset applied on the facility tag after read (engineering units).
 */
function defaultEzMeterSemanticMap() {
  return [
    { tagId: 'MECH_METER_KWH', sourceTagId: 'DDS_WH_SUM_IMP', scale: 0.001, comment: 'Summed import Wh → kWh (raw×10 Wh, scale 0.001)' },
    { tagId: 'MECH_METER_KWH_EXP', sourceTagId: 'DDS_WH_SUM_EXP', scale: 0.001, comment: 'Summed export Wh → kWh' },
    { tagId: 'MECH_PQ_VA', sourceTagId: 'DDS_V_A' },
    { tagId: 'MECH_PQ_VB', sourceTagId: 'DDS_V_B' },
    { tagId: 'MECH_PQ_VC', sourceTagId: 'DDS_V_C' },
    { tagId: 'MECH_PQ_IA', sourceTagId: 'DDS_I_A' },
    { tagId: 'MECH_PQ_IB', sourceTagId: 'DDS_I_B' },
    { tagId: 'MECH_PQ_IC', sourceTagId: 'DDS_I_C' },
    { tagId: 'MECH_PQ_HZ', sourceTagId: 'DDS_HZ_A' },
    { tagId: 'MECH_PQ_PF_A', sourceTagId: 'DDS_PF_A' },
    { tagId: 'MECH_PQ_PF_B', sourceTagId: 'DDS_PF_B' },
    { tagId: 'MECH_PQ_PF_C', sourceTagId: 'DDS_PF_C' },
  ];
}

function mergedEzMeterSemanticMap(assistedLiving) {
  const defaults = defaultEzMeterSemanticMap();
  const stored = assistedLiving?.ezMeter?.semanticMap;
  if (!Array.isArray(stored) || !stored.length) return defaults;
  const byTag = new Map(defaults.map((m) => [m.tagId, m]));
  for (const m of stored) {
    if (m?.tagId) byTag.set(m.tagId, m);
  }
  return [...byTag.values()];
}

/** Derived / computed facility PQ tags (memory role — filled by ST logic). */
function buildEzMeterPqDerivedTagDefs(thresholds = pqThresholds()) {
  const t = thresholds;
  return [
    { id: 'MECH_METER_INTERVAL_KWH', label: 'Site electric meter interval kWh', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_KW_SUM', label: 'Site total real power kW', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_KVA_SUM', label: 'Site total apparent power kVA', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_PF_SYS', label: 'Site system power factor', type: 'REAL', role: 'memory', graphEnabled: true, default: 1 },
    { id: 'MECH_PQ_V_AVG', label: 'Average phase voltage V', type: 'REAL', role: 'memory', graphEnabled: true, default: t.nominalV },
    { id: 'MECH_PQ_V_IMBAL_PCT', label: 'Voltage imbalance %', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_I_SUM', label: 'Total phase current A', type: 'REAL', role: 'memory', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_UNDERVOLT', label: 'PQ undervoltage alarm', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'MECH_PQ_OVERVOLT', label: 'PQ overvoltage alarm', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'MECH_PQ_PHASE_LOSS', label: 'PQ phase loss alarm', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'MECH_PQ_V_IMBAL', label: 'PQ voltage imbalance alarm', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'MECH_PQ_LOW_PF', label: 'PQ low power factor alarm', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'MECH_PQ_FREQ_FAULT', label: 'PQ frequency alarm', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'MECH_PQ_ALM', label: 'Site power quality alarm', type: 'BOOL', role: 'memory', alarmsEnabled: true, alarmCondition: 'on', default: false },
    { id: 'DDS_METER_KWH_PREV', label: 'Previous summed kWh (interval calc)', type: 'REAL', role: 'memory', graphEnabled: false, default: 0 },
    { id: 'MECH_PQ_CFG_NOM_V', label: 'PQ nominal voltage setpoint', type: 'REAL', role: 'memory', default: t.nominalV },
    { id: 'MECH_PQ_CFG_UV_V', label: 'PQ undervoltage threshold V', type: 'REAL', role: 'memory', default: t.undervoltV },
    { id: 'MECH_PQ_CFG_OV_V', label: 'PQ overvoltage threshold V', type: 'REAL', role: 'memory', default: t.overvoltV },
    { id: 'MECH_PQ_CFG_LOW_PF', label: 'PQ low PF threshold', type: 'REAL', role: 'memory', default: t.lowPf },
    { id: 'MECH_PQ_CFG_FREQ_MIN', label: 'PQ min frequency Hz', type: 'REAL', role: 'memory', default: t.freqMinHz },
    { id: 'MECH_PQ_CFG_FREQ_MAX', label: 'PQ max frequency Hz', type: 'REAL', role: 'memory', default: t.freqMaxHz },
    { id: 'MECH_PQ_CFG_IMBAL_PCT', label: 'PQ max voltage imbalance %', type: 'REAL', role: 'memory', default: t.vImbalPct },
    { id: 'MECH_PQ_CFG_LOAD_I', label: 'PQ loaded current threshold A', type: 'REAL', role: 'memory', default: t.loadedIA },
  ];
}

function baseTag(id, extra = {}) {
  const type = extra.type || 'BOOL';
  return {
    id,
    label: extra.label || id,
    type,
    role: extra.role || 'memory',
    value: extra.default ?? extra.value ?? (type === 'BOOL' ? false : 0),
    graphEnabled: extra.graphEnabled === true,
    alarmsEnabled: extra.alarmsEnabled === true,
    alarmCondition: extra.alarmCondition ?? null,
    alarmInnerLow: extra.alarmInnerLow ?? null,
    alarmInnerHigh: extra.alarmInnerHigh ?? null,
    alarmOuterLow: extra.alarmOuterLow ?? null,
    alarmOuterHigh: extra.alarmOuterHigh ?? null,
    driverId: extra.driverId ?? null,
    driverAddress: extra.driverAddress ?? null,
    scale: extra.scale ?? 1,
    offset: extra.offset ?? 0,
  };
}

function buildEzMeterPqDerivedTags(thresholds) {
  return buildEzMeterPqDerivedTagDefs(thresholds).map((d) => baseTag(d.id, d));
}

/** Wire facility semantic tags to EZ Meter Modbus driver (copies from source DDS_* tag address). */
function syncEzMeterSemanticTags(tagStore, assistedLiving) {
  if (!tagStore || typeof tagStore.list !== 'function') return;
  if (!isEzMeterFacility(assistedLiving)) return;

  const driverId = defaultEzMeterDriverId(assistedLiving);
  const map = mergedEzMeterSemanticMap(assistedLiving);
  if (!map.length) return;

  const tags = tagStore.list();
  const byId = new Map(tags.map((t) => [t.id, t]));
  let next = [...tags];

  for (const def of buildEzMeterPqDerivedTagDefs(pqThresholds(assistedLiving))) {
    if (!byId.has(def.id)) {
      next.push(baseTag(def.id, def));
      byId.set(def.id, next[next.length - 1]);
    }
  }

  const sourceById = new Map(next.filter((t) => t.id.startsWith('DDS_')).map((t) => [t.id, t]));
  let changed = next.length !== tags.length;

  const wired = next.map((t) => {
    const m = map.find((row) => row.tagId === t.id);
    if (!m?.sourceTagId) return t;
    const src = sourceById.get(m.sourceTagId);
    if (!src?.driverAddress) return t;
    changed = true;
    const out = {
      ...t,
      driverId,
      driverAddress: { ...src.driverAddress },
    };
    if (m.scale != null) out.scale = m.scale;
    if (m.offset != null) out.offset = m.offset;
    return out;
  });

  if (changed) tagStore.replaceAll(wired, { keepForces: true });
}

function buildEzMeterPreset() {
  return {
    id: EZMETER_PRESET_ID,
    label: 'EZ Meter DDS-RGB 2.025 — polyphase meter (Modbus RTU, full map)',
    vendor: 'EZ Meter',
    model: 'DDS-RGB 2.025 (RGB v1.600)',
    transport: 'modbus_rtu',
    sharedBus: false,
    diCount: 0,
    doCount: 0,
    aiCount: liveAnalogRegisterCount(),
    hrCount: 0,
    defaults: {
      serialPort: 'COM3',
      baud: 9600,
      slaveId: 1,
      parity: 'none',
      stopBits: 1,
    },
    driver: (opts) => buildEzMeterDriver(opts),
    tags: (opts) => buildEzMeterModbusTags(opts.driverId || EZMETER_DRIVER_ID),
  };
}

module.exports = {
  EZMETER_DRIVER_ID,
  EZMETER_PRESET_ID,
  DEFAULT_NOMINAL_V,
  defaultEzMeterDriverId,
  isEzMeterFacility,
  pqThresholds,
  defaultEzMeterSemanticMap,
  mergedEzMeterSemanticMap,
  buildEzMeterPqDerivedTagDefs,
  buildEzMeterPqDerivedTags,
  syncEzMeterSemanticTags,
  buildEzMeterPreset,
  buildEzMeterModbusTags,
  buildEzMeterDriver,
};
