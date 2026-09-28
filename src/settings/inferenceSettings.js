'use strict';

const path = require('path');
const { DATA_DIR } = require('../config');

const DEFAULT_INFERENCE = {
  hostEnabled: true,
  mode: 'host-supplement',
  backend: 'auto',
  modelsDir: path.join(DATA_DIR, 'models'),
};

function normalizeInferenceSettings(incoming, prev = {}) {
  const prevInf = prev?.inference && typeof prev.inference === 'object'
    ? prev.inference
    : {};
  if (incoming === null) return { ...DEFAULT_INFERENCE };
  if (incoming === undefined) {
    return { ...DEFAULT_INFERENCE, ...prevInf };
  }
  if (typeof incoming !== 'object') return { ...DEFAULT_INFERENCE, ...prevInf };

  const modeRaw = String(incoming.mode ?? prevInf.mode ?? DEFAULT_INFERENCE.mode).trim();
  const validModes = ['off', 'host-supplement', 'host-override', 'host-on-start'];
  const mode = validModes.includes(modeRaw) ? modeRaw : DEFAULT_INFERENCE.mode;

  const backendRaw = String(incoming.backend ?? prevInf.backend ?? DEFAULT_INFERENCE.backend).trim();
  const validBackends = ['auto', 'rule', 'onnx'];
  const backend = validBackends.includes(backendRaw) ? backendRaw : DEFAULT_INFERENCE.backend;

  const hostEnabled = incoming.hostEnabled !== undefined
    ? incoming.hostEnabled === true
    : (prevInf.hostEnabled !== undefined ? prevInf.hostEnabled === true : DEFAULT_INFERENCE.hostEnabled);

  const modelsDir = String(incoming.modelsDir ?? prevInf.modelsDir ?? DEFAULT_INFERENCE.modelsDir).trim()
    || DEFAULT_INFERENCE.modelsDir;

  return {
    hostEnabled: mode === 'off' ? false : hostEnabled,
    mode,
    backend,
    modelsDir,
  };
}

module.exports = {
  DEFAULT_INFERENCE,
  normalizeInferenceSettings,
};
