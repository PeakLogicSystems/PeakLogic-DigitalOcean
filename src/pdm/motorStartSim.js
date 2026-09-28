'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const MODEL_ID = 'single-phase-start-v1';
const DEVICE_ID = 'edge-ct-motor01';

const MOTOR_TAGS = [
  { id: 'MOTOR_CURRENT', type: 'REAL', role: 'input', value: 0, graphEnabled: true, wordWidth: 16, quality: 'good' },
  { id: 'MOTOR_START_MS', type: 'REAL', role: 'input', value: 0, graphEnabled: true, wordWidth: 16, quality: 'good' },
  { id: 'LINE_VOLTAGE', type: 'REAL', role: 'input', value: 240, graphEnabled: true, wordWidth: 16, quality: 'good' },
];

function seededRandom(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483646 || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

function classifyStart(startTimeMs) {
  if (startTimeMs >= 5200) return { label: 'capacitor_failed', score: 0.94, confidence: 0.92 };
  if (startTimeMs >= 4000) return { label: 'capacitor_weak', score: 0.78, confidence: 0.86 };
  if (startTimeMs >= 3000) return { label: 'capacitor_weak', score: 0.58, confidence: 0.8 };
  if (startTimeMs >= 2400) return { label: 'healthy', score: 0.22, confidence: 0.75 };
  return { label: 'healthy', score: 0.08, confidence: 0.9 };
}

function buildMotorPens() {
  return [
    { tagId: 'MOTOR_CURRENT', color: '#2563eb', scale: 1, offset: 0, ymin: 0, ymax: 40, autoScale: true },
    { tagId: 'MOTOR_START_MS', color: '#dc2626', scale: 1, offset: 0, ymin: 0, ymax: 8000, autoScale: true },
    { tagId: 'LINE_VOLTAGE', color: '#16a34a', scale: 1, offset: 0, ymin: 200, ymax: 260, autoScale: false },
  ];
}

/**
 * Simulate single-phase motor starts with degrading start capacitor over time.
 * Returns edge_inference docs and SCADA pen_sample docs per start event.
 */
function generateMotorStartSimDocs({
  days = 90,
  assetId = 'motor-202',
  deviceId = DEVICE_ID,
  modelId = MODEL_ID,
  startsPerDay = 3,
  projectName = 'motor_start_sim',
  now = Date.now(),
}) {
  const dayCount = Math.min(Math.max(Number(days) || 90, 7), 180);
  const rate = Math.min(Math.max(Number(startsPerDay) || 3, 1), 12);
  const endMs = now;
  const startMs = endMs - dayCount * DAY_MS;
  const edgeDocs = [];
  const scadaDocs = [];
  const pens = buildMotorPens();
  const penByTag = Object.fromEntries(pens.map((p) => [p.tagId, p]));
  let eventIdx = 0;

  for (let day = 0; day < dayCount; day++) {
    const dayStart = startMs + day * DAY_MS;
    const progress = day / Math.max(dayCount - 1, 1);
    const baseStartMs = 1500 + progress * 4000;
    const rndDay = seededRandom(day * 7919 + 42);

    for (let s = 0; s < rate; s++) {
      const jitterH = rndDay() * 22 + 1;
      const atMs = dayStart + jitterH * 60 * 60 * 1000;
      if (atMs > endMs) continue;

      const rnd = seededRandom(eventIdx * 9973 + day);
      const startTimeMs = Math.round(baseStartMs + (rnd() - 0.5) * 400);
      const peakStartCurrentA = Math.round((18 + progress * 14 + rnd() * 3) * 10) / 10;
      const runCurrentA = Math.round((5.5 + rnd() * 1.2) * 10) / 10;
      const lineVoltage = Math.round((238 + (rnd() - 0.5) * 6) * 10) / 10;
      const { label, score, confidence } = classifyStart(startTimeMs);
      const at = new Date(atMs);

      edgeDocs.push({
        at,
        deviceId,
        assetId,
        modelId,
        source: 'simulate',
        projectName,
        inference: {
          type: 'classification',
          label,
          score,
          confidence,
        },
        features: {
          startTimeMs,
          peakStartCurrentA,
          runCurrentA,
          inrushRatio: Math.round((peakStartCurrentA / runCurrentA) * 100) / 100,
          startAttempts24h: label === 'capacitor_failed' ? Math.floor(2 + rnd() * 3) : 0,
        },
      });

      const scadaPairs = [
        { tagId: 'MOTOR_CURRENT', value: runCurrentA },
        { tagId: 'MOTOR_START_MS', value: startTimeMs },
        { tagId: 'LINE_VOLTAGE', value: lineVoltage },
      ];
      for (const { tagId, value } of scadaPairs) {
        const pen = penByTag[tagId];
        const tag = MOTOR_TAGS.find((t) => t.id === tagId);
        scadaDocs.push({
          event: 'pen_sample',
          at,
          projectName,
          running: false,
          source: 'motor_start_sim',
          pen,
          tag: { ...tag, value },
          sampleValue: value,
          scaledValue: value,
        });
      }
      eventIdx++;
    }
  }

  return {
    edgeDocs,
    scadaDocs,
    tags: MOTOR_TAGS.map((t) => ({ ...t })),
    pens,
    assetId,
    deviceId,
    modelId,
    startCount: edgeDocs.length,
    from: new Date(startMs).toISOString(),
    to: new Date(endMs).toISOString(),
    days: dayCount,
    degradation: {
      healthyStartMs: 1600,
      failedStartMs: 5200,
      finalLabel: edgeDocs.length ? edgeDocs[edgeDocs.length - 1].inference?.label : null,
    },
  };
}

module.exports = {
  MODEL_ID,
  DEVICE_ID,
  MOTOR_TAGS,
  buildMotorPens,
  classifyStart,
  generateMotorStartSimDocs,
};
