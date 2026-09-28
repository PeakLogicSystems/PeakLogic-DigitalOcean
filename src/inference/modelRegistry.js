'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const DEFAULT_REGISTRY = {
  models: {
    'lift-submersible-v3': {
      profile: 'lift-pump',
      labels: ['healthy', 'seal_leak', 'clog_ragging', 'impeller_worn'],
      file: 'lift-submersible-v3.onnx',
    },
    'hvac-comp-v1': {
      profile: 'hvac-compressor',
      labels: ['healthy', 'bearing_wear', 'compressor_stress', 'electrical_fault'],
      file: 'hvac-comp-v1.onnx',
    },
    'hvac-fan-v1': {
      profile: 'hvac-fan',
      labels: ['healthy', 'bearing_wear', 'imbalance', 'electrical_fault'],
      file: 'hvac-fan-v1.onnx',
    },
  },
  platformDefaults: {
    'arduino-opta-mqtt-st': 'lift-submersible-v3',
    'mcxn947-hvac': 'hvac-comp-v1',
    'mcxn947-lift-mcsa': 'lift-submersible-v3',
    'lilygo-t-eth-elite-parc-st': 'lift-submersible-v3',
  },
};

const REGISTRY_PATH = path.join(DATA_DIR, 'host-inference.json');
const MODELS_DIR = path.join(DATA_DIR, 'models');

function loadRegistryFile() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      return {
        models: { ...DEFAULT_REGISTRY.models, ...(raw.models || {}) },
        platformDefaults: { ...DEFAULT_REGISTRY.platformDefaults, ...(raw.platformDefaults || {}) },
      };
    }
  } catch {
    /* use defaults */
  }
  return {
    models: { ...DEFAULT_REGISTRY.models },
    platformDefaults: { ...DEFAULT_REGISTRY.platformDefaults },
  };
}

function modelPath(modelDef) {
  const file = String(modelDef?.file || '').trim();
  if (!file) return null;
  return path.isAbsolute(file) ? file : path.join(MODELS_DIR, file);
}

function resolveModelId(platform, overrideModelId) {
  if (overrideModelId) return overrideModelId;
  const reg = loadRegistryFile();
  return reg.platformDefaults[platform] || null;
}

function getModelDef(modelId) {
  const reg = loadRegistryFile();
  return reg.models[modelId] || null;
}

function profileForModel(modelId) {
  const def = getModelDef(modelId);
  return def?.profile || 'lift-pump';
}

/**
 * Map Parc telemetry to scored assets + MCSA channel slices.
 */
function resolveInferenceTargets(body) {
  const mcsa = Array.isArray(body?.mcsa) ? body.mcsa : [];
  if (!mcsa.length) return [];

  const platform = String(body?.platform || '').trim();
  const deviceId = String(body?.deviceId || '').trim();
  const modelId = resolveModelId(platform, body?.hostModelId);
  const targets = [];

  if (platform === 'mcxn947-hvac' || /^hvac_mcsa_/i.test(deviceId)) {
    const floorMatch = /fl(\d+)/i.exec(deviceId);
    const floor = floorMatch ? floorMatch[1] : '1';
    const ch0 = mcsa.find((c) => Number(c.ch) === 0) || mcsa[0];
    const ch1 = mcsa.find((c) => Number(c.ch) === 1) || mcsa[1];
    if (ch0) {
      targets.push({
        assetId: `comp-fl${floor}`,
        modelId: modelId || 'hvac-comp-v1',
        profile: 'hvac-compressor',
        channels: [ch0],
      });
    }
    if (ch1) {
      targets.push({
        assetId: `fan-fl${floor}`,
        modelId: 'hvac-fan-v1',
        profile: 'hvac-fan',
        channels: [ch1],
      });
    }
    return targets;
  }

  const chGroups = [
    { assetId: 'pump-1', channels: mcsa.filter((c) => [0, 1, 2].includes(Number(c.ch))) },
    { assetId: 'pump-2', channels: mcsa.filter((c) => [3, 4, 5].includes(Number(c.ch))) },
  ];
  for (const g of chGroups) {
    if (!g.channels.length) continue;
    const active = g.channels.some((c) => {
      const fund = Array.isArray(c.fund) ? Number(c.fund[1]) : 0;
      return Number.isFinite(fund) && fund > 0.01;
    });
    if (!active && platform !== 'arduino-opta-mqtt-st' && platform !== 'mcxn947-lift-mcsa') continue;
    targets.push({
      assetId: g.assetId,
      modelId: modelId || 'lift-submersible-v3',
      profile: 'lift-pump',
      channels: g.channels.length ? g.channels : [g.channels[0]].filter(Boolean),
    });
  }
  return targets;
}

module.exports = {
  DEFAULT_REGISTRY,
  REGISTRY_PATH,
  MODELS_DIR,
  loadRegistryFile,
  modelPath,
  resolveModelId,
  getModelDef,
  profileForModel,
  resolveInferenceTargets,
};
