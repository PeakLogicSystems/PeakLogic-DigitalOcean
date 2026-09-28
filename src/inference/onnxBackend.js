'use strict';

const fs = require('fs');
const { FEATURE_DIM } = require('./mcsaFeatures');
const { getModelDef, modelPath } = require('./modelRegistry');

let ortModule = null;
let ortLoadError = null;
const sessions = new Map();

function loadOrt() {
  if (ortModule !== null || ortLoadError) return ortModule;
  try {
    ortModule = require('onnxruntime-node');
  } catch (e) {
    ortLoadError = e.message || String(e);
    ortModule = false;
  }
  return ortModule || null;
}

function scoreFromLogits(logits, labels) {
  if (!logits?.length) return { label: 'unknown', score: 0.5, confidence: 0.3 };
  let maxIdx = 0;
  let maxVal = logits[0];
  for (let i = 1; i < logits.length; i++) {
    if (logits[i] > maxVal) {
      maxVal = logits[i];
      maxIdx = i;
    }
  }
  const expSum = logits.reduce((s, v) => s + Math.exp(v - maxVal), 0);
  const confidence = Math.round((Math.exp(logits[maxIdx] - maxVal) / expSum) * 1000) / 1000;
  const label = labels?.[maxIdx] || `class_${maxIdx}`;
  const healthyIdx = labels?.indexOf('healthy');
  let score;
  if (healthyIdx >= 0 && maxIdx === healthyIdx) {
    score = Math.max(0.05, 1 - confidence);
  } else {
    score = confidence;
  }
  return { label, score, confidence };
}

async function getSession(modelId) {
  if (sessions.has(modelId)) return sessions.get(modelId);
  const ort = loadOrt();
  if (!ort) return null;
  const def = getModelDef(modelId);
  if (!def) return null;
  const file = modelPath(def);
  if (!file || !fs.existsSync(file)) return null;
  const session = await ort.InferenceSession.create(file);
  sessions.set(modelId, session);
  return session;
}

async function inferOnnx(modelId, featureVector) {
  const def = getModelDef(modelId);
  if (!def) return null;
  const session = await getSession(modelId);
  if (!session) return null;
  const ort = loadOrt();
  const inputName = session.inputNames[0];
  const tensor = new ort.Tensor('float32', featureVector, [1, FEATURE_DIM]);
  const out = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  const data = out[outputName]?.data;
  if (!data?.length) return null;
  const logits = Array.from(data);
  return {
    ...scoreFromLogits(logits, def.labels),
    backend: 'onnx',
    modelId,
  };
}

function onnxAvailable() {
  return !!loadOrt();
}

function onnxLoadError() {
  loadOrt();
  return ortLoadError;
}

function clearSessions() {
  sessions.clear();
}

module.exports = {
  inferOnnx,
  onnxAvailable,
  onnxLoadError,
  clearSessions,
  scoreFromLogits,
};
