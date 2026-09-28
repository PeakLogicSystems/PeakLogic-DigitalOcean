'use strict';

const { generateMotorStartSimDocs, classifyStart } = require('./motorStartSim');
const {
  clampDays,
  buildRuntimeContext,
  defaultScadaTags,
  locationProfile,
  MODEL_IDS_BY_MOTOR,
  DAY_MS,
} = require('./motorAssetSetup');

function seededRandom(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

function classifyPumpStart(startTimeMs, runAmps, baselineAmps) {
  const ampRatio = runAmps / Math.max(baselineAmps, 1);
  if (startTimeMs >= 5000 || ampRatio > 1.35) {
    return { label: 'impeller_worn', score: 0.88, confidence: 0.85 };
  }
  if (startTimeMs >= 3800 || ampRatio > 1.2) {
    return { label: 'clog_ragging', score: 0.72, confidence: 0.8 };
  }
  if (startTimeMs >= 2800 || ampRatio > 1.1) {
    return { label: 'seal_leak', score: 0.55, confidence: 0.75 };
  }
  return { label: 'healthy', score: 0.12 + (startTimeMs - 1500) / 20000, confidence: 0.88 };
}

function classifyFan(labelBase, scoreBase) {
  if (scoreBase >= 0.85) return { label: 'bearing_wear', score: scoreBase, confidence: 0.82 };
  if (scoreBase >= 0.65) return { label: 'filter_loaded', score: scoreBase, confidence: 0.78 };
  if (scoreBase >= 0.45) return { label: 'belt_slip', score: scoreBase, confidence: 0.74 };
  return { label: 'healthy', score: scoreBase, confidence: 0.9 };
}

function penDoc({ at, tagId, value, projectName, source }) {
  return {
    event: 'pen_sample',
    at,
    projectName,
    running: false,
    source,
    pen: { tagId, autoScale: true },
    tag: { id: tagId, type: 'REAL', role: 'input', value, graphEnabled: true },
    sampleValue: value,
    scaledValue: value,
  };
}

function edgeDoc({ at, assetId, modelId, projectName, context, label, score, confidence, features }) {
  return {
    at,
    assetId,
    modelId,
    source: 'simulate',
    projectName,
    context,
    inference: { type: 'classification', label, score, confidence },
    features,
  };
}

function generatePumpSimDocs({
  assetId,
  context,
  days,
  now = Date.now(),
  projectName = 'motor_asset_sim',
  includeEdgeAi = true,
}) {
  const dayCount = clampDays(days);
  const endMs = now;
  const startMs = endMs - dayCount * DAY_MS;
  const ctx = buildRuntimeContext(context, endMs);
  const profile = locationProfile(ctx.locationClass);
  const isLag = ctx.pumpRole === 'lag' || ctx.pumpIndex > 1;
  const baseStarts = isLag ? profile.lagStarts : profile.leadStarts;
  const idx = ctx.pumpIndex || 1;
  const hrsTag = `MOTOR${idx}_HRS`;
  const startsTag = `MOTOR${idx}_STARTS`;
  const ctTags = defaultScadaTags({ motorType: 'pump', configuration: ctx.configuration, pumpIndex: idx })
    .filter((t) => t.startsWith('I') && t.includes('_RAW'));

  const edgeDocs = [];
  const scadaDocs = [];
  const startEvents = [];
  let totalStarts = 0;
  let runHours = (ctx.pumpAgeYears || 3) * 650;
  let progressWear = 0;

  for (let day = 0; day < dayCount; day++) {
    const dayStart = startMs + day * DAY_MS;
    const dow = new Date(dayStart).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const dayFactor = weekend ? profile.weekendFactor : 1;
    const rain = seededRandom(day * 3137 + 11)() < profile.rainSensitivity * 0.08;
    const startsToday = Math.max(1, Math.round(baseStarts * dayFactor * (rain ? 2.2 : 1)));
    const rndDay = seededRandom(day * 7919 + assetId.length);

    progressWear = day / Math.max(dayCount - 1, 1);
    const ageAmp = 1 + (ctx.ageFactor - 1) * 0.5;
    const matAmp = profile.materialMultiplier;
    const baselineRunA = (9 + idx * 0.5) * ageAmp * matAmp;
    const baselineStartMs = 1600 + progressWear * 2800 * ctx.ageFactor;

    for (let s = 0; s < startsToday; s++) {
      const atMs = dayStart + (rndDay() * 20 + 2) * 60 * 60 * 1000;
      if (atMs > endMs) continue;
      const rnd = seededRandom(totalStarts * 9973 + day);
      const runMin = profile.runMin[0] + rnd() * (profile.runMin[1] - profile.runMin[0]);
      const startTimeMs = Math.round(baselineStartMs + (rnd() - 0.5) * 500);
      const runAmps = Math.round((baselineRunA + progressWear * 4 + rnd() * 1.5) * 10) / 10;
      const peakA = Math.round((runAmps * (2.2 + progressWear * 0.8) + rnd() * 2) * 10) / 10;
      const { label, score, confidence } = classifyPumpStart(startTimeMs, runAmps, baselineRunA);
      const at = new Date(atMs);

      totalStarts++;
      runHours += runMin / 60;

      if (includeEdgeAi) {
        edgeDocs.push(edgeDoc({
          at,
          assetId,
          modelId: ctx.modelId || MODEL_IDS_BY_MOTOR.pump,
          projectName,
          context: ctx,
          label,
          score,
          confidence,
          features: {
            startTimeMs,
            startMs: startTimeMs,
            peakStartCurrentA: peakA,
            runCurrentA: runAmps,
            inrushRatio: Math.round((peakA / runAmps) * 100) / 100,
            runMinutes: Math.round(runMin * 10) / 10,
            pumpIndex: idx,
            pumpRole: ctx.pumpRole,
          },
        }));
      }

      const startMsTag = `MOTOR${idx}_START_MS`;
      startEvents.push({
        at,
        assetId,
        pumpIndex: idx,
        startMs: startTimeMs,
        runAmps,
        peakAmps: peakA,
        healthScore: score,
        wear: progressWear,
        label,
      });
      scadaDocs.push(penDoc({
        at, tagId: startMsTag, value: startTimeMs, projectName, source: 'motor_asset_sim',
      }));

      for (const [i, tagId] of ctTags.entries()) {
        const phaseA = Math.round((peakA * (0.95 + i * 0.02)) * 10) / 10;
        scadaDocs.push(penDoc({ at, tagId, value: phaseA, projectName, source: 'motor_asset_sim' }));
      }
      scadaDocs.push(penDoc({ at, tagId: hrsTag, value: Math.round(runHours * 100) / 100, projectName, source: 'motor_asset_sim' }));
      scadaDocs.push(penDoc({ at, tagId: startsTag, value: totalStarts, projectName, source: 'motor_asset_sim' }));
    }

    const dayAt = new Date(dayStart + 12 * 60 * 60 * 1000);
    scadaDocs.push(penDoc({ at: dayAt, tagId: hrsTag, value: Math.round(runHours * 100) / 100, projectName, source: 'motor_asset_sim_daily' }));
    scadaDocs.push(penDoc({ at: dayAt, tagId: startsTag, value: totalStarts, projectName, source: 'motor_asset_sim_daily' }));
  }

  return {
    edgeDocs,
    scadaDocs,
    startEvents,
    tags: defaultScadaTags({ motorType: 'pump', configuration: ctx.configuration, pumpIndex: idx }).map((id) => ({
      id, type: 'REAL', role: 'input', value: 0, graphEnabled: true,
    })),
    assetId,
    modelId: ctx.modelId,
    startCount: edgeDocs.length,
    from: new Date(startMs).toISOString(),
    to: new Date(endMs).toISOString(),
    days: dayCount,
    context: ctx,
  };
}

function generateFanSimDocs({ assetId, context, days, now = Date.now(), projectName = 'motor_asset_sim' }) {
  const dayCount = clampDays(days);
  const endMs = now;
  const startMs = endMs - dayCount * DAY_MS;
  const ctx = buildRuntimeContext(context, endMs);
  const profile = locationProfile(ctx.locationClass);
  const idx = ctx.unitIndex || 1;
  const hrsTag = `FAN${idx}_HRS`;
  const startsTag = `FAN${idx}_STARTS`;
  const ampsTag = `FAN${idx}_AMPS`;

  const edgeDocs = [];
  const scadaDocs = [];
  let totalStarts = 0;
  let runHours = (ctx.pumpAgeYears || 2) * 1200;
  const baseStarts = Math.max(4, Math.round(profile.leadStarts * 0.6));

  for (let day = 0; day < dayCount; day++) {
    const progress = day / Math.max(dayCount - 1, 1);
    const rndDay = seededRandom(day * 5507 + idx);
    const startsToday = Math.max(2, Math.round(baseStarts * (rndDay() * 0.4 + 0.8)));
    const baselineA = (6 + progress * 3) * ctx.ageFactor;

    for (let s = 0; s < startsToday; s++) {
      const atMs = startMs + day * DAY_MS + (rndDay() * 18 + 4) * 60 * 60 * 1000;
      if (atMs > endMs) continue;
      const rnd = seededRandom(totalStarts * 4447);
      const runMin = 20 + rnd() * 90;
      const runAmps = Math.round((baselineA + rnd() * 1.2) * 10) / 10;
      const scoreBase = Math.min(0.95, 0.1 + progress * 0.7 * ctx.ageFactor + rnd() * 0.15);
      const { label, score, confidence } = classifyFan('fan', scoreBase);
      const at = new Date(atMs);
      totalStarts++;
      runHours += runMin / 60;

      edgeDocs.push(edgeDoc({
        at, assetId, modelId: ctx.modelId || MODEL_IDS_BY_MOTOR.fan, projectName, context: ctx,
        label, score, confidence,
        features: { runCurrentA: runAmps, runMinutes: Math.round(runMin), filterLoad: profile.fogIndex },
      }));
      scadaDocs.push(penDoc({ at, tagId: ampsTag, value: runAmps, projectName, source: 'motor_asset_sim' }));
      scadaDocs.push(penDoc({ at, tagId: hrsTag, value: Math.round(runHours * 100) / 100, projectName, source: 'motor_asset_sim' }));
      scadaDocs.push(penDoc({ at, tagId: startsTag, value: totalStarts, projectName, source: 'motor_asset_sim' }));
    }
  }

  return {
    edgeDocs, scadaDocs, assetId, modelId: ctx.modelId,
    startCount: edgeDocs.length,
    from: new Date(startMs).toISOString(),
    to: new Date(endMs).toISOString(),
    days: dayCount,
    context: ctx,
    tags: [hrsTag, startsTag, ampsTag].map((id) => ({ id, type: 'REAL', role: 'input', value: 0, graphEnabled: true })),
  };
}

function generateCompressorSimDocs({ assetId, context, days, now = Date.now(), projectName = 'motor_asset_sim' }) {
  const motor = generateMotorStartSimDocs({
    days,
    assetId,
    modelId: context.modelId || MODEL_IDS_BY_MOTOR.compressor,
    startsPerDay: Math.max(8, Math.round(locationProfile(context.locationClass || 'office').leadStarts * 0.5)),
    now,
    projectName,
  });
  const ctx = buildRuntimeContext(context, now);
  motor.context = ctx;
  for (const doc of motor.edgeDocs) {
    doc.context = ctx;
    doc.modelId = ctx.modelId || MODEL_IDS_BY_MOTOR.compressor;
    if (doc.inference?.label === 'capacitor_failed') doc.inference.label = 'compressor_hard_start';
    if (doc.inference?.label === 'capacitor_weak') doc.inference.label = 'refrigerant_load_high';
  }
  return motor;
}

function generateMotorAssetSimDocs({
  assetId,
  context = {},
  days = 180,
  now = Date.now(),
  projectName = 'motor_asset_sim',
  includeEdgeAi = true,
}) {
  const motorType = context.motorType || 'pump';
  const fullContext = { ...context, assetId };
  if (motorType === 'fan') return generateFanSimDocs({ assetId, context: fullContext, days, now, projectName });
  if (motorType === 'compressor') return generateCompressorSimDocs({ assetId, context: fullContext, days, now, projectName });
  return generatePumpSimDocs({
    assetId,
    context: fullContext,
    days,
    now,
    projectName,
    includeEdgeAi,
  });
}

module.exports = {
  generateMotorAssetSimDocs,
  generatePumpSimDocs,
  generateFanSimDocs,
  generateCompressorSimDocs,
  classifyPumpStart,
};
