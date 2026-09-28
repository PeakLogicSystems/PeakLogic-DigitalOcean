'use strict';

const { channelMetrics } = require('./mcsaFeatures');

function classifyPumpStart({ startMs, runAmps, baselineAmps = 8 }) {
  const ms = Number(startMs) || 0;
  const run = Number(runAmps) || 0;
  const base = baselineAmps > 1 ? baselineAmps : 1;
  const ampRatio = run / base;
  if (ms >= 5000 || ampRatio > 1.35) {
    return { label: 'impeller_worn', score: 0.88, confidence: 0.85 };
  }
  if (ms >= 3800 || ampRatio > 1.2) {
    return { label: 'clog_ragging', score: 0.72, confidence: 0.8 };
  }
  if (ms >= 2800 || ampRatio > 1.1) {
    return { label: 'seal_leak', score: 0.55, confidence: 0.75 };
  }
  let score = 0.12 + (ms - 1500) / 20000;
  score = Math.min(0.35, Math.max(0.08, score));
  return { label: 'healthy', score, confidence: 0.88 };
}

function classifyFromMcsa(metrics, context = {}) {
  if (!metrics.length) {
    return { label: 'unknown', score: 0.5, confidence: 0.3 };
  }
  const avgFund = metrics.reduce((s, m) => s + m.fund, 0) / metrics.length;
  const maxSide = Math.max(...metrics.map((m) => m.ratioSide));
  const maxHarm = Math.max(...metrics.map((m) => m.ratioHarm));

  if (context.startMs != null && context.startMs >= 150) {
    return classifyPumpStart({
      startMs: context.startMs,
      runAmps: context.runAmps ?? avgFund * 50,
      baselineAmps: 8,
    });
  }

  if (maxSide > 0.45 || maxHarm > 0.55) {
    return { label: 'bearing_wear', score: 0.78, confidence: 0.82 };
  }
  if (maxSide > 0.28 || maxHarm > 0.38) {
    return { label: 'imbalance', score: 0.62, confidence: 0.76 };
  }
  if (avgFund > 2.5) {
    return { label: 'overload', score: 0.71, confidence: 0.8 };
  }
  const score = Math.min(0.35, Math.max(0.06, maxSide * 0.4 + maxHarm * 0.25));
  return { label: 'healthy', score, confidence: 0.84 };
}

function inferRule(profile, mcsaChannels, context = {}) {
  const metrics = (mcsaChannels || []).map(channelMetrics);
  if (profile === 'hvac-compressor' || profile === 'hvac-fan') {
    const ch = metrics[0] || { fund: 0, ratioSide: 0, ratioHarm: 0 };
    const compFault = context.env?.COMP_FLT === true;
    const fanFault = context.env?.FAN_FLT === true;
    if (compFault || fanFault) {
      return { label: 'electrical_fault', score: 0.9, confidence: 0.92 };
    }
    if (ch.ratioSide > 0.35) {
      return { label: 'bearing_wear', score: 0.75, confidence: 0.85 };
    }
    if (ch.fund > 2.0 && ch.ratioHarm > 0.3) {
      return { label: 'compressor_stress', score: 0.68, confidence: 0.8 };
    }
    const score = Math.min(0.4, Math.max(0.05, ch.ratioSide * 0.5 + ch.ratioHarm * 0.2));
    return { label: 'healthy', score, confidence: 0.86 };
  }
  return classifyFromMcsa(metrics, context);
}

module.exports = {
  classifyPumpStart,
  classifyFromMcsa,
  inferRule,
};
