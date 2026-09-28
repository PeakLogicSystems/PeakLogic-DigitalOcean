'use strict';

const FEATURE_DIM = 64;
const BAND_KEYS = ['rotor', 'bearing', 'pump', 'compressor', 'fan', 'ecc', 'stator', 'turbine', 'load'];

function bandEnergy(pairs) {
  if (!Array.isArray(pairs)) return 0;
  let sum = 0;
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const amp = Number(pair[1]);
    if (Number.isFinite(amp)) sum += Math.abs(amp);
  }
  return sum;
}

function fundAmp(channel) {
  const fund = channel?.fund;
  if (!Array.isArray(fund) || fund.length < 2) return 0;
  const amp = Number(fund[1]);
  return Number.isFinite(amp) ? Math.abs(amp) : 0;
}

/**
 * Per-channel scalar features used by rule + ONNX backends.
 */
function channelMetrics(channel) {
  const fund = fundAmp(channel);
  const bands = {};
  let sideband = 0;
  for (const key of BAND_KEYS) {
    const e = bandEnergy(channel?.[key]);
    bands[key] = e;
    if (key === 'rotor' || key === 'bearing' || key === 'ecc') sideband += e;
  }
  const harmonic = bands.pump + bands.compressor + bands.fan + bands.turbine + bands.load;
  const ratioSide = fund > 1e-6 ? sideband / fund : sideband;
  const ratioHarm = fund > 1e-6 ? harmonic / fund : harmonic;
  return {
    ch: Number(channel?.ch) || 0,
    fund,
    sideband,
    harmonic,
    ratioSide,
    ratioHarm,
    bands,
  };
}

/**
 * Fixed-length feature vector for ML backends (Opta MCSA-lite + HVAC FFT cooked spectra).
 */
function mcsaToFeatureVector(mcsaChannels) {
  const vec = new Float32Array(FEATURE_DIM);
  const list = Array.isArray(mcsaChannels) ? mcsaChannels : [];
  const metrics = list.map(channelMetrics);
  const maxChannels = 8;
  let idx = 0;
  for (let i = 0; i < maxChannels && idx + 6 <= FEATURE_DIM; i++) {
    const m = metrics[i];
    if (!m) {
      idx += 6;
      continue;
    }
    vec[idx++] = m.fund;
    vec[idx++] = m.sideband;
    vec[idx++] = m.harmonic;
    vec[idx++] = m.ratioSide;
    vec[idx++] = m.ratioHarm;
    vec[idx++] = m.bands.bearing || 0;
  }
  if (metrics.length) {
    const avgFund = metrics.reduce((s, m) => s + m.fund, 0) / metrics.length;
    const maxRatio = Math.max(...metrics.map((m) => m.ratioSide));
    const maxHarm = Math.max(...metrics.map((m) => m.ratioHarm));
    if (idx < FEATURE_DIM) vec[idx++] = avgFund;
    if (idx < FEATURE_DIM) vec[idx++] = maxRatio;
    if (idx < FEATURE_DIM) vec[idx++] = maxHarm;
    if (idx < FEATURE_DIM) vec[idx++] = metrics.length;
  }
  return vec;
}

function tagValue(tags, id) {
  if (!Array.isArray(tags)) return null;
  const row = tags.find((t) => String(t?.id || '').toUpperCase() === String(id).toUpperCase());
  if (!row) return null;
  const v = row.value ?? row.scaledValue ?? row.sampleValue;
  return v == null ? null : Number(v);
}

function contextFromReport(body, assetId) {
  const tags = body?.tags;
  const pumpMatch = /^pump-(\d+)$/.exec(assetId || '');
  const pumpIndex = pumpMatch ? Number(pumpMatch[1]) : null;
  const startMs = pumpIndex
    ? tagValue(tags, `MOTOR${pumpIndex}_START_MS`)
    : tagValue(tags, 'MOTOR_START_MS');
  const runAmps = pumpIndex
    ? Math.max(
      tagValue(tags, `AI${pumpIndex}`) ?? 0,
      tagValue(tags, `I${pumpIndex}_RAW`) ?? 0,
    )
    : tagValue(tags, 'MOTOR_CURRENT');
  const env = body?.env && typeof body.env === 'object' ? body.env : {};
  return {
    deviceId: body?.deviceId || null,
    platform: body?.platform || null,
    assetId,
    pumpIndex,
    startMs: Number.isFinite(startMs) ? startMs : null,
    runAmps: Number.isFinite(runAmps) ? runAmps : null,
    env,
    sampleRateHz: body?.runtime?.sampleRateHz ?? null,
    fftSize: body?.runtime?.fftSize ?? null,
  };
}

module.exports = {
  FEATURE_DIM,
  BAND_KEYS,
  bandEnergy,
  fundAmp,
  channelMetrics,
  mcsaToFeatureVector,
  contextFromReport,
  tagValue,
};
