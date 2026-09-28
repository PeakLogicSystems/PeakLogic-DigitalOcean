'use strict';

const persistence = require('../persistence');
const mongoTagLogger = require('../logger/mongoTagLogger');
const { alignPdmFeatures, resolveTagIdsForAsset } = require('./featureAlign');
const { featuresToChartHistory, estimateRulFromFeatures, defaultPdmChartPens } = require('./rulEstimate');
const { buildFailureForecast } = require('./failureForecast');
const { generateMotorStartSimDocs } = require('./motorStartSim');
const { normalizePdmSettings, listPdmAssets } = require('../settings/pdmSettings');

const DAY_MS = 24 * 60 * 60 * 1000;

function readSettings() {
  return persistence.readJson('settings.json', {});
}

async function buildFeaturesForAsset(assetId, opts = {}) {
  const settings = opts.settings || readSettings();
  const pdm = normalizePdmSettings(settings.pdm, settings);
  const tagIds = resolveTagIdsForAsset(assetId, { assetTags: pdm.assetTags });
  const toMs = Number(opts.toMs) || Date.now();
  const fromMs = Number(opts.fromMs) || (toMs - 7 * DAY_MS);
  const [penDocs, edgeDocs] = await Promise.all([
    mongoTagLogger.queryPenDocs({ from: fromMs, to: toMs, tagIds }),
    mongoTagLogger.queryEdgeDocs({ from: fromMs, to: toMs, assetId }),
  ]);
  const aligned = alignPdmFeatures({
    fromMs,
    toMs,
    assetId,
    windowMin: pdm.windowMin,
    penDocs,
    edgeDocs,
  });
  const stored = await mongoTagLogger.storePdmFeatures({
    assetId,
    features: aligned.features,
    collection: pdm.featuresCollection,
    fromMs,
    toMs,
  });
  return { ...aligned, stored, tagIds };
}

async function buildAllFeatures(opts = {}) {
  const settings = opts.settings || readSettings();
  const pdm = normalizePdmSettings(settings.pdm, settings);
  const assets = listPdmAssets(pdm);
  const results = [];
  for (const assetId of assets) {
    results.push(await buildFeaturesForAsset(assetId, { ...opts, settings }));
  }
  return { ok: true, assets: results, count: results.length };
}

async function loadPdmView(assetId, opts = {}) {
  const settings = opts.settings || readSettings();
  const pdm = normalizePdmSettings(settings.pdm, settings);
  const toMs = Number(opts.toMs) || Date.now();
  const fromMs = Number(opts.fromMs) || (toMs - DAY_MS);
  const tagIds = resolveTagIdsForAsset(assetId, { assetTags: pdm.assetTags });
  let features = await mongoTagLogger.loadPdmFeatures({
    assetId,
    from: fromMs,
    to: toMs,
    collection: pdm.featuresCollection,
  });
  if (!features.length) {
    const built = await buildFeaturesForAsset(assetId, { fromMs, toMs, settings });
    features = built.features;
  }
  const history = featuresToChartHistory(features);
  const rul = estimateRulFromFeatures(features, { failureThreshold: pdm.failureThreshold });
  const forecast = buildFailureForecast({
    features,
    assetId,
    failureThreshold: pdm.failureThreshold,
    now: toMs,
  });
  return {
    ok: true,
    assetId,
    tagIds,
    fromMs,
    toMs,
    features,
    history,
    pens: defaultPdmChartPens(history),
    rul,
    forecast,
    meta: {
      windowCount: features.length,
      tagIds,
      source: 'pdm',
    },
  };
}

async function simulateMotorStart(opts = {}) {
  const sim = generateMotorStartSimDocs(opts);
  const edgeOk = await mongoTagLogger.logEdgeInferences(sim.edgeDocs);
  const scadaOk = await mongoTagLogger.insertPenDocs(sim.scadaDocs);
  const settings = readSettings();
  const pdm = normalizePdmSettings(settings.pdm, settings);
  const tagIds = (sim.tags || []).map((t) => t.id).filter(Boolean);
  const nextTags = {
    ...(pdm.assetTags || {}),
    [sim.assetId]: tagIds,
  };
  const next = {
    ...settings,
    pdm: { ...pdm, assetTags: nextTags },
  };
  persistence.writeJson('settings.json', next);
  return {
    ok: true,
    ...sim,
    edgeLogged: edgeOk,
    scadaLogged: scadaOk,
    assetTags: nextTags,
  };
}

function batchStatus(settings = readSettings()) {
  const pdm = normalizePdmSettings(settings.pdm, settings);
  return {
    enabled: !!pdm.buildEnabled,
    intervalHours: pdm.buildIntervalHours,
    assets: listPdmAssets(pdm),
    featuresCollection: pdm.featuresCollection,
    windowMin: pdm.windowMin,
    failureThreshold: pdm.failureThreshold,
  };
}

module.exports = {
  buildFeaturesForAsset,
  buildAllFeatures,
  loadPdmView,
  simulateMotorStart,
  batchStatus,
  listPdmAssets,
};
