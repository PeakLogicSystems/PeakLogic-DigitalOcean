'use strict';

const { applySemanticMap } = require('../../scripts/assisted-living/ezmeter-map');
const {
  EZMETER_DRIVER_ID,
  pqThresholds,
  buildEzMeterPqDerivedTagDefs,
} = require('../facilities/ezmeterPq');

const EZMETER_PQ_DERIVED_PRESET_ID = 'ezmeter_facility_pq_derived';

/** Tag ids removed when replaceTags is true on the derived PQ preset. */
const DERIVED_PQ_TAG_IDS = new Set([
  'MECH_METER_KWH',
  'MECH_METER_KWH_EXP',
  'MECH_METER_INTERVAL_KWH',
  'MECH_PQ_VA',
  'MECH_PQ_VB',
  'MECH_PQ_VC',
  'MECH_PQ_IA',
  'MECH_PQ_IB',
  'MECH_PQ_IC',
  'MECH_PQ_HZ',
  'MECH_PQ_PF_A',
  'MECH_PQ_PF_B',
  'MECH_PQ_PF_C',
  ...buildEzMeterPqDerivedTagDefs().map((d) => d.id),
]);

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
    driverId: extra.driverId ?? null,
    driverAddress: extra.driverAddress ?? null,
    scale: extra.scale ?? 1,
    offset: extra.offset ?? 0,
  };
}

function buildEzMeterSemanticMirrorTagDefs() {
  return [
    { id: 'MECH_METER_KWH', label: 'Site electric meter kWh total (EZ Meter)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_METER_KWH_EXP', label: 'Site electric meter kWh export (EZ Meter)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_VA', label: 'Phase A voltage V (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_VB', label: 'Phase B voltage V (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_VC', label: 'Phase C voltage V (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_IA', label: 'Phase A current A (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_IB', label: 'Phase B current A (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_IC', label: 'Phase C current A (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_HZ', label: 'Line frequency Hz (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_PF_A', label: 'Phase A power factor (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_PF_B', label: 'Phase B power factor (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
    { id: 'MECH_PQ_PF_C', label: 'Phase C power factor (facility)', type: 'REAL', role: 'input', graphEnabled: true, default: 0 },
  ];
}

/** New facility PQ + mirror tags, wired to an existing EZ Meter Modbus driver. */
function buildEzMeterPqDerivedApplyTags(existingTags, opts = {}) {
  const driverId = opts.driverId || EZMETER_DRIVER_ID;
  const th = pqThresholds(opts.assistedLiving || opts);
  const existingIds = new Set(existingTags.map((t) => t.id));
  const stubs = [];
  for (const def of [...buildEzMeterSemanticMirrorTagDefs(), ...buildEzMeterPqDerivedTagDefs(th)]) {
    if (!existingIds.has(def.id)) stubs.push(baseTag(def.id, def));
  }
  if (!stubs.length) return [];
  const wired = applySemanticMap([...existingTags, ...stubs], driverId);
  const stubIds = new Set(stubs.map((t) => t.id));
  return wired.filter((t) => stubIds.has(t.id));
}

function buildEzMeterPqDerivedPreset() {
  return {
    id: EZMETER_PQ_DERIVED_PRESET_ID,
    label: 'EZ Meter — facility PQ derived measurement set',
    vendor: 'PeakLogic',
    model: 'Facility power quality (ST-derived)',
    transport: 'derived',
    tagsOnly: true,
    linkedDriverId: EZMETER_DRIVER_ID,
    driverId: EZMETER_DRIVER_ID,
    requiresTags: ['DDS_V_A', 'DDS_WH_SUM_IMP'],
    defaultProgram: 'logic/ezmeter_facility_pq.st',
    sharedBus: false,
    diCount: 0,
    doCount: 0,
    aiCount: 0,
    hrCount: 0,
    defaults: {},
    driver: (opts) => ({
      id: opts.driverId || EZMETER_DRIVER_ID,
      type: 'derived',
      enabled: true,
    }),
    tags: () => [],
    buildApplyTags: (existingTags, opts) => buildEzMeterPqDerivedApplyTags(existingTags, opts),
  };
}

function patchEzMeterAssistedLivingSettings(settings, driverId, body = {}) {
  const next = { ...(settings || {}) };
  const al = { ...(next.assistedLiving || {}) };
  al.facility = { ...(al.facility || {}), driver: 'ezmeter' };
  al.ezMeter = {
    ...(al.ezMeter || {}),
    enabled: true,
    driverId: driverId || EZMETER_DRIVER_ID,
    nominalVoltage: body.nominalVoltage ?? al.ezMeter?.nominalVoltage,
    undervoltV: body.undervoltV ?? al.ezMeter?.undervoltV,
    overvoltV: body.overvoltV ?? al.ezMeter?.overvoltV,
    lowPf: body.lowPf ?? al.ezMeter?.lowPf,
    freqMinHz: body.freqMinHz ?? al.ezMeter?.freqMinHz,
    freqMaxHz: body.freqMaxHz ?? al.ezMeter?.freqMaxHz,
    vImbalancePct: body.vImbalancePct ?? al.ezMeter?.vImbalancePct,
    loadedCurrentA: body.loadedCurrentA ?? al.ezMeter?.loadedCurrentA,
  };
  next.assistedLiving = al;
  return next;
}

/**
 * Apply a tags-only derived preset (no driver row changes).
 * @returns {object|null} error payload or result fields for res.json
 */
function applyTagsOnlyPreset({
  presetMeta,
  tagList,
  driverList,
  buildOpts,
  replaceTags,
  tagStore,
  persistence,
  loadProgram = true,
}) {
  const linkedId = buildOpts.driverId || presetMeta.linkedDriverId || presetMeta.driverId;
  const required = presetMeta.requiresTags || [];
  const missing = required.filter((id) => !tagList.some((t) => t.id === id));
  if (missing.length) {
    return {
      error: `Apply the EZ Meter Modbus template first. Missing tag(s): ${missing.join(', ')}`,
      status: 400,
    };
  }
  const linkedDriver = driverList.find((d) => d.id === linkedId);
  if (!linkedDriver) {
    return {
      error: `Driver "${linkedId}" not found. Apply EZ Meter DDS-RGB (full map) on driver ${linkedId} first.`,
      status: 400,
    };
  }

  let baseTags = tagList;
  if (replaceTags) {
    baseTags = tagList.filter((t) => !DERIVED_PQ_TAG_IDS.has(t.id));
  }

  const applyOpts = { ...buildOpts, driverId: linkedId };
  const templateTags = typeof presetMeta.buildApplyTags === 'function'
    ? presetMeta.buildApplyTags(baseTags, applyOpts)
    : [];

  if (!templateTags.length && !replaceTags) {
    return {
      error: 'All facility PQ derived tags are already present.',
      status: 409,
    };
  }

  if (!replaceTags) {
    const existingIds = new Set(baseTags.map((t) => t.id));
    const conflicts = templateTags.filter((t) => existingIds.has(t.id));
    if (conflicts.length) {
      return {
        error: `Tag id already in use: ${conflicts.map((t) => t.id).join(', ')}`,
        status: 409,
      };
    }
  }

  const merged = [...baseTags, ...templateTags];
  tagStore.replaceAll(merged);

  const settings = persistence.readJson('settings.json', {});
  const patched = patchEzMeterAssistedLivingSettings(settings, linkedId, buildOpts);
  if (loadProgram !== false && presetMeta.defaultProgram) {
    patched.activeProgram = presetMeta.defaultProgram;
  }
  persistence.writeJson('settings.json', patched);

  return {
    ok: true,
    preset: { id: presetMeta.id, label: presetMeta.label },
    driver: linkedDriver,
    tagsAdded: templateTags.length,
    tagCount: tagStore.count(),
    merged: !replaceTags,
    slaveId: linkedDriver.slaveId ?? null,
    tagsFromDevice: false,
    programLoaded: loadProgram !== false && !!presetMeta.defaultProgram,
    nextStep: presetMeta.defaultProgram
      ? `Load ST program ${presetMeta.defaultProgram} (set as active) and Start runtime`
      : undefined,
  };
}

module.exports = {
  EZMETER_PQ_DERIVED_PRESET_ID,
  DERIVED_PQ_TAG_IDS,
  buildEzMeterSemanticMirrorTagDefs,
  buildEzMeterPqDerivedApplyTags,
  buildEzMeterPqDerivedPreset,
  applyTagsOnlyPreset,
  patchEzMeterAssistedLivingSettings,
};
