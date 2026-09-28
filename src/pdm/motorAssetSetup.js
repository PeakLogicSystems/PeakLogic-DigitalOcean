'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

const MOTOR_TYPES = ['pump', 'fan', 'compressor'];

const APPLICATIONS_BY_MOTOR = {
  pump: ['lift_station', 'transfer', 'booster', 'sump'],
  fan: ['hvac', 'exhaust', 'cooling_tower', 'makeup_air'],
  compressor: ['refrigeration', 'air_compressor', 'heat_pump'],
};

const CONFIGURATIONS_BY_MOTOR = {
  pump: ['simplex', 'duplex', 'triplex'],
  fan: ['single', 'dual', 'vfd'],
  compressor: ['single', 'tandem'],
};

const LOCATION_CLASSES = [
  'strip_mall',
  'school',
  'alf',
  'convenience_store',
  'restaurant',
  'office',
  'warehouse',
];

const SERVICE_EVENT_TYPES = [
  'install',
  'pump_replacement',
  'motor_replacement',
  'seal_service',
  'impeller_service',
  'motor_or_starter',
  'cable_repair',
  'clog_clearing',
  'control_panel',
  'float_replacement',
  'filter_service',
  'refrigerant_service',
  'bearing_service',
  'vfd_replacement',
  'inspection',
  'pdm_pm',
];

const FLOAT_LADDERS = ['pull_down', 'pump_up'];

const MODEL_IDS_BY_MOTOR = {
  pump: 'lift-submersible-v2',
  fan: 'fan-motor-v1',
  compressor: 'compressor-start-v1',
};

/** @type {Record<string, { leadStarts: number, lagStarts: number, runMin: [number, number], fogIndex: number, materialMultiplier: number, weekendFactor: number, rainSensitivity: number }>} */
const LOCATION_PROFILES = {
  strip_mall: { leadStarts: 22, lagStarts: 10, runMin: [6, 12], fogIndex: 0.55, materialMultiplier: 1.25, weekendFactor: 0.85, rainSensitivity: 0.9 },
  school: { leadStarts: 14, lagStarts: 6, runMin: [8, 15], fogIndex: 0.25, materialMultiplier: 0.85, weekendFactor: 0.15, rainSensitivity: 0.5 },
  alf: { leadStarts: 18, lagStarts: 8, runMin: [10, 18], fogIndex: 0.4, materialMultiplier: 1.05, weekendFactor: 1.0, rainSensitivity: 0.5 },
  convenience_store: { leadStarts: 10, lagStarts: 0, runMin: [5, 10], fogIndex: 0.35, materialMultiplier: 1.0, weekendFactor: 1.0, rainSensitivity: 0.35 },
  restaurant: { leadStarts: 26, lagStarts: 12, runMin: [4, 10], fogIndex: 0.75, materialMultiplier: 1.45, weekendFactor: 1.1, rainSensitivity: 0.55 },
  office: { leadStarts: 12, lagStarts: 5, runMin: [8, 14], fogIndex: 0.2, materialMultiplier: 0.9, weekendFactor: 0.2, rainSensitivity: 0.4 },
  warehouse: { leadStarts: 8, lagStarts: 4, runMin: [10, 20], fogIndex: 0.15, materialMultiplier: 0.8, weekendFactor: 0.3, rainSensitivity: 0.6 },
};

const REPLACEMENT_EVENTS = new Set(['install', 'pump_replacement', 'motor_replacement']);

function clampDays(days) {
  return Math.min(Math.max(Number(days) || 180, 30), 360);
}

function computeAgeFactor(ageYears) {
  const y = Number(ageYears);
  if (!Number.isFinite(y) || y < 0) return 1;
  return Math.round((1 + 0.04 * Math.max(0, y - 3)) * 1000) / 1000;
}

function parseDateMs(value) {
  if (!value) return NaN;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : NaN;
}

function effectiveInstallDate(serviceHistory = [], fallbackInstallDate) {
  const events = (serviceHistory || [])
    .filter((e) => e?.date && REPLACEMENT_EVENTS.has(String(e.type || '')))
    .map((e) => ({ ...e, ts: parseDateMs(e.date) }))
    .filter((e) => Number.isFinite(e.ts))
    .sort((a, b) => b.ts - a.ts);
  if (events.length) return events[0].date;
  return fallbackInstallDate || null;
}

function pumpAgeYears(installDate, referenceMs = Date.now()) {
  const ts = parseDateMs(installDate);
  if (!Number.isFinite(ts)) return null;
  return Math.round(((referenceMs - ts) / DAY_MS / 365.25) * 100) / 100;
}

function locationProfile(locationClass) {
  return LOCATION_PROFILES[locationClass] || LOCATION_PROFILES.office;
}

function defaultScadaTags(context = {}) {
  const motorType = context.motorType || 'pump';
  const configuration = context.configuration || 'simplex';
  const idx = Math.max(1, Number(context.pumpIndex) || Number(context.unitIndex) || 1);

  if (motorType === 'pump') {
    const n = idx;
    const ctBase = configuration === 'simplex' ? 1 : (n === 1 ? 1 : 4);
    const tags = [
      `MOTOR${n}_HRS`,
      `MOTOR${n}_STARTS`,
      `MOTOR${n}_START_MS`,
      `AI${ctBase}`,
      `I${ctBase}_RAW`,
      `I${ctBase + 1}_RAW`,
      `I${ctBase + 2}_RAW`,
    ];
    if (configuration !== 'simplex') tags.push(`P${n}_RUN_FB`);
    if (configuration === 'simplex') tags.push('LVL_LEAD', 'LVL_HIGH');
    return tags;
  }

  if (motorType === 'fan') {
    return [`FAN${idx}_HRS`, `FAN${idx}_STARTS`, `FAN${idx}_AMPS`, `FAN${idx}_RUN_FB`];
  }

  return [
    `COMP${idx}_HRS`,
    `COMP${idx}_STARTS`,
    `COMP${idx}_START_MS`,
    `COMP${idx}_AMPS`,
    `COMP${idx}_SUCTION_PSI`,
  ];
}

function normalizeAssetContext(raw = {}, assetId = '') {
  const motorType = MOTOR_TYPES.includes(raw.motorType) ? raw.motorType : 'pump';
  const configs = CONFIGURATIONS_BY_MOTOR[motorType] || ['single'];
  const configuration = configs.includes(raw.configuration) ? raw.configuration : configs[0];
  const locationClass = LOCATION_CLASSES.includes(raw.locationClass) ? raw.locationClass : 'office';
  const applications = APPLICATIONS_BY_MOTOR[motorType] || [];
  const application = applications.includes(raw.application) ? raw.application : applications[0];

  const serviceHistory = Array.isArray(raw.serviceHistory)
    ? raw.serviceHistory
      .filter((e) => e && e.date && e.type)
      .map((e) => ({
        date: String(e.date).slice(0, 10),
        type: SERVICE_EVENT_TYPES.includes(e.type) ? e.type : 'inspection',
        vendor: e.vendor ? String(e.vendor) : '',
        notes: e.notes ? String(e.notes) : '',
      }))
    : [];

  const installDate = raw.installDate ? String(raw.installDate).slice(0, 10) : null;
  const effInstall = effectiveInstallDate(serviceHistory, installDate);
  const ageYears = pumpAgeYears(effInstall);
  const ageFactor = computeAgeFactor(ageYears);

  return {
    assetId: assetId || raw.assetId || '',
    motorType,
    application,
    configuration,
    floatLadder: FLOAT_LADDERS.includes(raw.floatLadder) ? raw.floatLadder : 'pull_down',
    locationClass,
    siteId: raw.siteId ? String(raw.siteId) : '',
    siteName: raw.siteName ? String(raw.siteName) : '',
    pumpIndex: Math.max(1, Number(raw.pumpIndex) || Number(raw.unitIndex) || 1),
    pumpRole: raw.pumpRole ? String(raw.pumpRole) : (raw.pumpIndex === 2 || raw.unitIndex === 2 ? 'lag' : 'lead'),
    unitIndex: Math.max(1, Number(raw.unitIndex) || Number(raw.pumpIndex) || 1),
    installDate,
    effectiveInstallDate: effInstall,
    pumpAgeYears: ageYears,
    ageFactor,
    modelId: raw.modelId || MODEL_IDS_BY_MOTOR[motorType],
    serviceHistory,
    enabled: raw.enabled !== false,
  };
}

function buildRuntimeContext(assetContext, referenceMs = Date.now()) {
  const ctx = normalizeAssetContext(assetContext, assetContext?.assetId);
  const eff = ctx.effectiveInstallDate || ctx.installDate;
  const ageYears = pumpAgeYears(eff, referenceMs);
  const profile = locationProfile(ctx.locationClass);
  const lastService = ctx.serviceHistory.length
    ? ctx.serviceHistory.slice().sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date))[0]
    : null;

  return {
    assetId: ctx.assetId,
    motorType: ctx.motorType,
    application: ctx.application,
    configuration: ctx.configuration,
    floatLadder: ctx.floatLadder,
    locationClass: ctx.locationClass,
    siteId: ctx.siteId,
    siteName: ctx.siteName,
    pumpIndex: ctx.pumpIndex,
    pumpRole: ctx.pumpRole,
    unitIndex: ctx.unitIndex,
    installDate: ctx.installDate,
    effectiveInstallDate: eff,
    pumpAgeYears: ageYears,
    ageFactor: computeAgeFactor(ageYears),
    modelId: ctx.modelId,
    lastServiceType: lastService?.type || null,
    lastServiceDate: lastService?.date || null,
    materialProfile: {
      fogIndex: profile.fogIndex,
      materialMultiplier: profile.materialMultiplier,
    },
  };
}

function appendServiceEvent(ctx, event, assetId = '') {
  const base = normalizeAssetContext(ctx, assetId);
  const entry = {
    date: String(event?.date || new Date().toISOString()).slice(0, 10),
    type: SERVICE_EVENT_TYPES.includes(event?.type) ? event.type : 'inspection',
    vendor: event?.vendor ? String(event.vendor) : '',
    notes: event?.notes ? String(event.notes) : '',
  };
  return normalizeAssetContext({ ...base, serviceHistory: [...(base.serviceHistory || []), entry] }, assetId || base.assetId);
}

module.exports = {
  DAY_MS,
  MOTOR_TYPES,
  APPLICATIONS_BY_MOTOR,
  CONFIGURATIONS_BY_MOTOR,
  LOCATION_CLASSES,
  SERVICE_EVENT_TYPES,
  FLOAT_LADDERS,
  MODEL_IDS_BY_MOTOR,
  LOCATION_PROFILES,
  clampDays,
  computeAgeFactor,
  effectiveInstallDate,
  pumpAgeYears,
  locationProfile,
  defaultScadaTags,
  normalizeAssetContext,
  buildRuntimeContext,
  appendServiceEvent,
};
