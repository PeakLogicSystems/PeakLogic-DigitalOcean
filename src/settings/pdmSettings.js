'use strict';

const DEFAULT_PDM = {
  assetTags: {},
  windowMin: 5,
  featuresCollection: 'pdm_features',
  failureThreshold: 0.3,
  buildEnabled: false,
  buildIntervalHours: 24,
};

function defaultPdmSettings() {
  return { ...DEFAULT_PDM, assetTags: {} };
}

function normalizePdmSettings(incoming, prev = {}) {
  const prevPdm = prev?.pdm && typeof prev.pdm === 'object' ? prev.pdm : {};
  if (incoming === null) return {};
  if (incoming === undefined) return { ...prevPdm };
  if (typeof incoming !== 'object') return { ...prevPdm };

  const assetTags = incoming.assetTags != null ? incoming.assetTags : prevPdm.assetTags;
  let parsedTags = {};
  if (typeof assetTags === 'string') {
    try { parsedTags = JSON.parse(assetTags); } catch { parsedTags = prevPdm.assetTags || {}; }
  } else if (assetTags && typeof assetTags === 'object') {
    parsedTags = assetTags;
  }

  const incomingContext = incoming.assetContext != null ? incoming.assetContext : prevPdm.assetContext;
  const assetContext = incomingContext && typeof incomingContext === 'object' ? incomingContext : {};

  return {
    assetTags: parsedTags,
    assetContext,
    windowMin: Math.max(1, Math.min(60, Number(incoming.windowMin ?? prevPdm.windowMin ?? DEFAULT_PDM.windowMin) || DEFAULT_PDM.windowMin)),
    featuresCollection: String(incoming.featuresCollection ?? prevPdm.featuresCollection ?? DEFAULT_PDM.featuresCollection).trim() || DEFAULT_PDM.featuresCollection,
    failureThreshold: Math.max(0.05, Math.min(0.95, Number(incoming.failureThreshold ?? prevPdm.failureThreshold ?? DEFAULT_PDM.failureThreshold) || DEFAULT_PDM.failureThreshold)),
    buildEnabled: incoming.buildEnabled != null ? !!incoming.buildEnabled : !!prevPdm.buildEnabled,
    buildIntervalHours: Math.max(1, Math.min(168, Number(incoming.buildIntervalHours ?? prevPdm.buildIntervalHours ?? DEFAULT_PDM.buildIntervalHours) || DEFAULT_PDM.buildIntervalHours)),
  };
}

function listPdmAssets(pdm) {
  const map = pdm?.assetTags && typeof pdm.assetTags === 'object' ? pdm.assetTags : {};
  return Object.keys(map).sort();
}

module.exports = {
  DEFAULT_PDM,
  defaultPdmSettings,
  normalizePdmSettings,
  listPdmAssets,
};
