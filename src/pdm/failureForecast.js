'use strict';

const { DAY_MS, linearRegression, estimateRulFromFeatures } = require('./rulEstimate');

const DEFAULT_MOTOR_START_FAIL_MS = 5200;
const DEFAULT_MOTOR_START_TAG = 'MOTOR_START_MS';

function estimateTrendRul(points, { failValue, direction = 'below' } = {}) {
  const sorted = (points || [])
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  if (sorted.length < 3) {
    return { ok: false, error: 'Need at least 3 trend points' };
  }
  const t0 = sorted[0].t;
  const xs = sorted.map((p) => (p.t - t0) / DAY_MS);
  const ys = sorted.map((p) => p.v);
  const { slope } = linearRegression(xs, ys);
  const current = ys[ys.length - 1];
  const ratePerDay = Math.round(slope * 10000) / 10000;

  let rulDaysEstimate = null;
  if (direction === 'below') {
    if (slope < -0.00001 && current > failValue) {
      rulDaysEstimate = Math.max(0, Math.round((failValue - current) / slope));
    } else if (current <= failValue) {
      rulDaysEstimate = 0;
    }
  } else if (slope > 0.00001 && current < failValue) {
    rulDaysEstimate = Math.max(0, Math.round((failValue - current) / slope));
  } else if (current >= failValue) {
    rulDaysEstimate = 0;
  }

  let trend = 'stable';
  if (direction === 'below') {
    if (slope < -0.001) trend = 'degrading';
    else if (slope > 0.001) trend = 'improving';
  } else if (slope > 0.5) trend = 'degrading';
  else if (slope < -0.5) trend = 'improving';

  return {
    ok: true,
    currentValue: Math.round(current * 100) / 100,
    failValue,
    ratePerDay,
    rulDaysEstimate,
    trend,
    sampleCount: sorted.length,
    from: new Date(sorted[0].t).toISOString(),
    to: new Date(sorted[sorted.length - 1].t).toISOString(),
  };
}

function severityFromRul(rulDays) {
  if (rulDays == null) return 'unknown';
  if (rulDays <= 0) return 'failed';
  if (rulDays <= 7) return 'critical';
  if (rulDays <= 30) return 'warning';
  return 'ok';
}

function predictedFailureDate(rulDays, fromMs = Date.now()) {
  if (rulDays == null) return null;
  return new Date(fromMs + rulDays * DAY_MS).toISOString();
}

function headlineFromRul(rulDays, { assetId, faultType = 'failure' } = {}) {
  const who = assetId ? `${assetId}: ` : '';
  if (rulDays == null) return `${who}Insufficient trend data for failure forecast`;
  if (rulDays <= 0) return `${who}At or past predicted ${faultType} — service now`;
  if (rulDays === 1) return `${who}Estimated to fail in 1 day`;
  return `${who}Estimated to fail in ${rulDays} days`;
}

function extractTagTrend(features, tagId) {
  return (features || [])
    .map((f) => ({
      t: f.windowStartMs ?? Date.parse(f.at),
      v: f.scada?.tagStats?.[tagId]?.avg,
    }))
    .filter((p) => Number.isFinite(p.t) && p.v != null && Number.isFinite(p.v));
}

/**
 * Combined failure forecast from health index and motor start-time trends.
 */
function buildFailureForecast({
  features = [],
  assetId = '',
  failureThreshold = 0.3,
  motorStartFailMs = DEFAULT_MOTOR_START_FAIL_MS,
  motorStartTagId = DEFAULT_MOTOR_START_TAG,
  now = Date.now(),
} = {}) {
  const health = estimateRulFromFeatures(features, { failureThreshold });
  const startPts = extractTagTrend(features, motorStartTagId);
  const startTime = startPts.length >= 3
    ? estimateTrendRul(startPts, { failValue: motorStartFailMs, direction: 'above' })
    : { ok: false, error: 'No motor start time trend' };

  const candidates = [];
  if (health.ok && health.rulDaysEstimate != null) {
    candidates.push({
      method: 'health_index',
      label: 'Edge anomaly / health index',
      rulDaysEstimate: health.rulDaysEstimate,
      detail: `Health ${health.currentHealth} trending to threshold ${failureThreshold}`,
      ...health,
    });
  }
  if (startTime.ok && startTime.rulDaysEstimate != null) {
    candidates.push({
      method: 'start_time_ms',
      label: 'Motor start time (capacitor)',
      rulDaysEstimate: startTime.rulDaysEstimate,
      detail: `Start time ${startTime.currentValue} ms → fail at ${motorStartFailMs} ms`,
      ...startTime,
    });
  }

  let primary = null;
  if (candidates.length) {
    primary = candidates.reduce((a, b) => {
      if (a.rulDaysEstimate == null) return b;
      if (b.rulDaysEstimate == null) return a;
      return a.rulDaysEstimate <= b.rulDaysEstimate ? a : b;
    });
  }

  const rulDaysEstimate = primary?.rulDaysEstimate ?? null;
  const severity = severityFromRul(rulDaysEstimate);
  const faultType = primary?.method === 'start_time_ms' ? 'capacitor/motor start failure' : 'health threshold breach';
  const headline = headlineFromRul(rulDaysEstimate, { assetId, faultType });
  const predictedFailureAt = predictedFailureDate(rulDaysEstimate, now);

  const reportLines = [
    headline,
    predictedFailureAt ? `Predicted date: ${new Date(predictedFailureAt).toLocaleString()}` : null,
    primary?.detail || null,
    health.ok ? `Health index: ${health.currentHealth} (${health.trend}, ${health.degradationRatePerDay ?? health.ratePerDay}/day)` : null,
    startTime.ok ? `Start time: ${startTime.currentValue} ms (${startTime.trend}, ${startTime.ratePerDay} ms/day)` : null,
  ].filter(Boolean);

  return {
    ok: !!(primary || health.ok || startTime.ok),
    assetId,
    rulDaysEstimate,
    predictedFailureAt,
    headline,
    severity,
    faultType,
    primaryMethod: primary?.method || null,
    reportLines,
    methods: {
      healthIndex: health,
      startTimeMs: startTime,
    },
    failureThreshold,
    motorStartFailMs,
  };
}

module.exports = {
  DEFAULT_MOTOR_START_FAIL_MS,
  DEFAULT_MOTOR_START_TAG,
  estimateTrendRul,
  buildFailureForecast,
  headlineFromRul,
  severityFromRul,
  predictedFailureDate,
};
