'use strict';

const {
  normalizeAssetContext,
  defaultScadaTags,
} = require('./motorAssetSetup');
const { normalizePdmSettings } = require('../settings/pdmSettings');

const PRESET_PROFILES = {
  lift_station_simplex: {
    motorType: 'pump', application: 'lift_station', configuration: 'simplex', locationClass: 'convenience_store',
    assets: [{ assetId: 'pump-1', pumpIndex: 1, pumpRole: 'lead' }],
  },
  lift_station_dual_duplex: {
    motorType: 'pump', application: 'lift_station', configuration: 'duplex', locationClass: 'strip_mall',
    assets: [
      { assetId: 'pump-1', pumpIndex: 1, pumpRole: 'lead' },
      { assetId: 'pump-2', pumpIndex: 2, pumpRole: 'lag' },
    ],
  },
  lift_station_triplex: {
    motorType: 'pump', application: 'lift_station', configuration: 'triplex', locationClass: 'school',
    assets: [
      { assetId: 'pump-1', pumpIndex: 1, pumpRole: 'lead' },
      { assetId: 'pump-2', pumpIndex: 2, pumpRole: 'lag' },
      { assetId: 'pump-3', pumpIndex: 3, pumpRole: 'lag2' },
    ],
  },
  lilygo_t_eth_parc_st: {
    motorType: 'pump', application: 'lift_station', configuration: 'duplex', locationClass: 'strip_mall',
    assets: [
      { assetId: 'pump-1', pumpIndex: 1, pumpRole: 'lead' },
      { assetId: 'pump-2', pumpIndex: 2, pumpRole: 'lag' },
    ],
  },
  arduino_opta_parc: {
    motorType: 'pump', application: 'lift_station', configuration: 'duplex', locationClass: 'strip_mall',
    assets: [
      { assetId: 'pump-1', pumpIndex: 1, pumpRole: 'lead' },
      { assetId: 'pump-2', pumpIndex: 2, pumpRole: 'lag' },
    ],
  },
  pentair_ultratemp: {
    motorType: 'compressor', application: 'refrigeration', configuration: 'single', locationClass: 'restaurant',
    assets: [{ assetId: 'comp-1', unitIndex: 1 }],
  },
  jandy_heat_pump: {
    motorType: 'compressor', application: 'heat_pump', configuration: 'single', locationClass: 'alf',
    assets: [{ assetId: 'comp-1', unitIndex: 1 }],
  },
  hayward_vs_pump: {
    motorType: 'pump', application: 'transfer', configuration: 'simplex', locationClass: 'restaurant',
    assets: [{ assetId: 'pump-1', pumpIndex: 1, pumpRole: 'lead' }],
  },
  jandy_epump: {
    motorType: 'pump', application: 'transfer', configuration: 'single', locationClass: 'restaurant',
    assets: [{ assetId: 'pump-1', pumpIndex: 1, pumpRole: 'lead' }],
  },
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function defaultInstallHistory(presetLabel, installDate) {
  return [{
    date: installDate || todayIsoDate(),
    type: 'install',
    vendor: '',
    notes: `Provisioned from template ${presetLabel || 'device template'}`,
  }];
}

function resolveProfile(preset) {
  if (!preset?.id) return null;
  if (preset.pdm?.assets?.length) {
    return {
      motorType: preset.pdm.motorType || 'pump',
      application: preset.pdm.application || 'lift_station',
      configuration: preset.pdm.configuration || 'simplex',
      locationClass: preset.pdm.locationClass || 'office',
      floatLadder: preset.pdm.floatLadder || 'pull_down',
      assets: preset.pdm.assets,
    };
  }
  return PRESET_PROFILES[preset.id] || null;
}

function buildAssetSeed(profile, assetDef, opts = {}) {
  const installDate = opts.installDate || todayIsoDate();
  const siteId = opts.siteId || opts.deviceId || '';
  const siteName = opts.siteName || opts.presetLabel || siteId || '';
  const base = {
    motorType: assetDef.motorType || profile.motorType || 'pump',
    application: assetDef.application || profile.application,
    configuration: assetDef.configuration || profile.configuration,
    locationClass: opts.locationClass || assetDef.locationClass || profile.locationClass || 'office',
    floatLadder: assetDef.floatLadder || profile.floatLadder || 'pull_down',
    siteId,
    siteName,
    installDate,
    pumpIndex: assetDef.pumpIndex ?? assetDef.unitIndex ?? 1,
    unitIndex: assetDef.unitIndex ?? assetDef.pumpIndex ?? 1,
    pumpRole: assetDef.pumpRole || 'lead',
    serviceHistory: Array.isArray(assetDef.serviceHistory) && assetDef.serviceHistory.length
      ? assetDef.serviceHistory
      : defaultInstallHistory(opts.presetLabel || profile.application, installDate),
    enabled: true,
  };
  const assetId = assetDef.assetId;
  const ctx = normalizeAssetContext(base, assetId);
  const tagIds = defaultScadaTags(ctx);
  return { assetId, context: ctx, tagIds };
}

/**
 * Build PdM assetContext + assetTags for a device template. Skips asset IDs already present unless overwrite.
 */
function buildPdmSeedsFromPreset(preset, opts = {}) {
  const profile = resolveProfile(preset);
  if (!profile) return { assetContext: {}, assetTags: {}, seeded: [], skipped: [] };

  const seeds = [];
  for (const def of profile.assets) {
    seeds.push(buildAssetSeed(profile, def, {
      ...opts,
      presetLabel: preset.label || preset.id,
    }));
  }

  const assetContext = {};
  const assetTags = {};
  const seeded = [];
  const skipped = [];
  const existing = opts.existingContext || {};

  for (const { assetId, context, tagIds } of seeds) {
    if (existing[assetId] && !opts.overwrite) {
      skipped.push(assetId);
      continue;
    }
    assetContext[assetId] = context;
    assetTags[assetId] = tagIds;
    seeded.push(assetId);
  }

  return { assetContext, assetTags, seeded, skipped, profile };
}

function mergePdmSeedsIntoSettings(settings, seeds, opts = {}) {
  const prev = settings && typeof settings === 'object' ? settings : {};
  const pdm = normalizePdmSettings(prev.pdm, prev);
  const overwrite = !!opts.overwrite;
  const nextContext = { ...(pdm.assetContext || {}) };
  const nextTags = { ...(pdm.assetTags || {}) };

  for (const [assetId, ctx] of Object.entries(seeds.assetContext || {})) {
    if (nextContext[assetId] && !overwrite) continue;
    nextContext[assetId] = ctx;
  }
  for (const [assetId, tags] of Object.entries(seeds.assetTags || {})) {
    if (nextTags[assetId]?.length && !overwrite) continue;
    nextTags[assetId] = tags;
  }

  return {
    ...prev,
    pdm: normalizePdmSettings({
      ...pdm,
      assetContext: nextContext,
      assetTags: nextTags,
    }, prev),
  };
}

function seedPdmFromPreset(preset, settings, opts = {}) {
  const pdm = normalizePdmSettings(settings?.pdm, settings);
  const seeds = buildPdmSeedsFromPreset(preset, {
    ...opts,
    existingContext: pdm.assetContext,
  });
  if (!seeds.seeded.length) {
    return { settings, ...seeds, changed: false };
  }
  const next = mergePdmSeedsIntoSettings(settings, seeds, opts);
  return { settings: next, ...seeds, changed: true };
}

module.exports = {
  PRESET_PROFILES,
  resolveProfile,
  buildPdmSeedsFromPreset,
  mergePdmSeedsIntoSettings,
  seedPdmFromPreset,
  defaultInstallHistory,
};
