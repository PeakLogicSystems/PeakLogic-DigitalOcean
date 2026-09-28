'use strict';

const persistence = require('../persistence');
const { normalizeInferenceSettings } = require('../settings/inferenceSettings');
const { mcsaToFeatureVector, contextFromReport } = require('./mcsaFeatures');
const { inferRule } = require('./ruleClassifier');
const { resolveInferenceTargets } = require('./modelRegistry');
const { inferOnnx, onnxAvailable } = require('./onnxBackend');

function readSettings() {
  const settings = persistence.readJson('settings.json', {});
  return normalizeInferenceSettings(settings.inference, settings);
}

function reportHasDeviceEdgeAi(body) {
  const edgeAi = body?.edgeAi ?? body?.edge_ai;
  if (!edgeAi) return false;
  return Array.isArray(edgeAi) ? edgeAi.length > 0 : true;
}

function shouldRunHost(body, cfg) {
  if (!cfg.hostEnabled) return false;
  if (!Array.isArray(body?.mcsa) || !body.mcsa.length) return false;

  const mode = cfg.mode;
  if (mode === 'off') return false;
  if (mode === 'host-override') return true;
  if (mode === 'host-supplement') {
    if (reportHasDeviceEdgeAi(body)) return false;
    return true;
  }
  if (mode === 'host-on-start') {
    if (reportHasDeviceEdgeAi(body)) return false;
    const tags = body?.tags;
    if (!Array.isArray(tags)) return true;
    return tags.some((t) => /^MOTOR\d+_START_MS$/i.test(String(t?.id || '')));
  }
  return !reportHasDeviceEdgeAi(body);
}

async function inferTarget(target, body, cfg) {
  const vector = mcsaToFeatureVector(target.channels);
  const context = contextFromReport(body, target.assetId);
  let result = null;

  if (cfg.backend !== 'rule') {
    try {
      result = await inferOnnx(target.modelId, vector);
    } catch {
      result = null;
    }
  }

  if (!result || cfg.backend === 'rule') {
    result = {
      ...inferRule(target.profile, target.channels, context),
      backend: 'rule',
      modelId: target.modelId,
    };
  }

  return {
    at: new Date(),
    deviceId: body.deviceId || null,
    assetId: target.assetId,
    modelId: result.modelId || target.modelId,
    source: 'host',
    inference: {
      type: 'anomaly',
      score: result.score,
      label: result.label,
      confidence: result.confidence,
    },
    features: {
      hostBackend: result.backend,
      platform: body.platform || null,
      channelCount: target.channels.length,
      startMs: context.startMs,
      runAmps: context.runAmps,
      sampleRateHz: context.sampleRateHz,
      fftSize: context.fftSize,
    },
  };
}

/**
 * Score Parc telemetry on the PeakLogic host. Returns edge_inference docs (not yet persisted).
 */
async function runHostInferenceFromReport(body, opts = {}) {
  const cfg = opts.settings?.inference
    ? normalizeInferenceSettings(opts.settings.inference, opts.settings)
    : readSettings();
  if (!shouldRunHost(body, cfg)) {
    return { ok: true, skipped: true, docs: [], reason: 'host inference not applicable' };
  }

  const targets = resolveInferenceTargets(body);
  if (!targets.length) {
    return { ok: true, skipped: true, docs: [], reason: 'no inference targets' };
  }

  const docs = [];
  for (const target of targets) {
    docs.push(await inferTarget(target, body, cfg));
  }
  return { ok: true, skipped: false, docs, count: docs.length };
}

function hostInferenceStatus(settings) {
  const cfg = normalizeInferenceSettings(settings?.inference, settings || {});
  return {
    hostEnabled: cfg.hostEnabled,
    mode: cfg.mode,
    backend: cfg.backend,
    onnxAvailable: onnxAvailable(),
    modelsDir: cfg.modelsDir,
  };
}

module.exports = {
  shouldRunHost,
  runHostInferenceFromReport,
  hostInferenceStatus,
  inferTarget,
};
