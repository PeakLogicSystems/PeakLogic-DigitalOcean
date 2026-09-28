'use strict';

const fs = require('fs');
const path = require('path');
const { classifyStart, MOTOR_TAGS, buildMotorPens } = require('./motorStartSim');

const MODEL_ID = 'lift-station-run-amps-v1';
const DEFAULT_AMP_THRESHOLD = 2;
const MIN_CORR_DELTA = 0.5;

const CT_COLS = [
  'Motor 1 Phase A CT',
  'Motor 1 Phase B CT',
  'Motor 2 Phase C CT',
];

const DIG_COLS = [
  'MS 1 Run',
  'MS 1 Fault',
  'MS 2 Run',
  'MS 2 Fault',
  'MS 3 Run',
  'MS 3 Fault',
];

function parseCsvText(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = line.split(',');
    const o = {};
    for (let j = 0; j < headers.length; j++) {
      o[headers[j]] = (cols[j] ?? '').trim();
    }
    rows.push(o);
  }
  return { headers, rows };
}

function parseCsvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return parseCsvText(text);
}

function isOn(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'on' || s === '1' || s === 'true' || s === 'yes';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mean(vals) {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function siteIdFromFile(filePath) {
  const base = path.basename(filePath, path.extname(filePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `putnam-${base || 'site'}`;
}

function normalizeRows(rows) {
  return rows
    .map((r) => {
      const t = Date.parse(r.datelogged);
      const cts = {};
      for (const c of CT_COLS) cts[c] = num(r[c]);
      const digs = {};
      for (const d of DIG_COLS) digs[d] = isOn(r[d]);
      const maxCt = Math.max(0, ...CT_COLS.map((c) => cts[c] ?? 0));
      return {
        raw: r,
        t,
        at: Number.isFinite(t) ? new Date(t) : null,
        cts,
        digs,
        maxCt,
        starts1: num(r['Motor 1 Starts']),
        starts2: num(r['Motor 2 Starts']),
        runTime1: num(r['Motor 1 Run Time']),
        runTime2: num(r['Motor 2 Run Time']),
      };
    })
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

/**
 * Find the digital column + CT channel with the strongest RUN↔amps correlation.
 * Supports inverted contacts (e.g. Fault Off == running).
 */
function discoverRunAmpsCorrelation(rows) {
  let best = null;
  for (const dig of DIG_COLS) {
    for (const ct of CT_COLS) {
      for (const inverted of [false, true]) {
        const onVals = [];
        const offVals = [];
        for (const r of rows) {
          const running = inverted ? !r.digs[dig] : r.digs[dig];
          const a = r.cts[ct];
          if (a == null) continue;
          (running ? onVals : offVals).push(a);
        }
        const onMean = mean(onVals) ?? 0;
        const offMean = mean(offVals) ?? 0;
        const delta = onMean - offMean;
        const score = Math.abs(delta);
        // Prefer polarity where "running" means higher amps (positive delta)
        const better = !best
          || score > best.score + 1e-9
          || (Math.abs(score - best.score) <= 1e-9 && delta > best.delta);
        if (better) {
          best = {
            digital: dig,
            ct,
            inverted,
            delta: Math.round(delta * 1000) / 1000,
            score,
            onMean: Math.round(onMean * 1000) / 1000,
            offMean: Math.round(offMean * 1000) / 1000,
            onCount: onVals.length,
            offCount: offVals.length,
            usable: score >= MIN_CORR_DELTA,
          };
        }
      }
    }
  }
  return best;
}

function ampAt(row, ct) {
  if (ct && row.cts[ct] != null) return row.cts[ct];
  return row.maxCt;
}

/**
 * Segment contiguous RUN intervals from correlated digital or amp threshold.
 */
function segmentRuns(rows, {
  correlation,
  ampThreshold = DEFAULT_AMP_THRESHOLD,
  preferDigital = true,
} = {}) {
  const useDigital = preferDigital && correlation?.usable;
  const ct = correlation?.ct || null;
  const runs = [];
  let cur = null;

  for (const r of rows) {
    const amp = ampAt(r, ct);
    let running;
    let method;
    if (useDigital) {
      const digOn = correlation.inverted ? !r.digs[correlation.digital] : r.digs[correlation.digital];
      // Require amp support so inverted fault contacts idle-high do not invent runs
      running = digOn && amp >= ampThreshold * 0.25;
      method = 'digital+amps';
      if (!digOn && amp >= ampThreshold) {
        running = true;
        method = 'amps-override';
      }
    } else {
      running = amp >= ampThreshold;
      method = 'amps';
    }

    if (running && !cur) {
      cur = { samples: [r], method, startMs: r.t };
    } else if (running && cur) {
      cur.samples.push(r);
    } else if (!running && cur) {
      cur.endMs = r.t;
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) {
    cur.endMs = cur.samples[cur.samples.length - 1].t;
    runs.push(cur);
  }
  return runs;
}

function classifyByInrush(inrushRatio) {
  if (inrushRatio >= 2.2) return { label: 'capacitor_failed', score: 0.9, confidence: 0.7 };
  if (inrushRatio >= 1.6) return { label: 'capacitor_weak', score: 0.65, confidence: 0.65 };
  if (inrushRatio >= 1.25) return { label: 'healthy', score: 0.2, confidence: 0.7 };
  return { label: 'healthy', score: 0.08, confidence: 0.75 };
}

/**
 * Extract PeakLogic motor-start feature shape from a RUN segment.
 * With ~5 min SCADA samples, startTimeMs is coarse; inrushRatio still useful.
 */
function featuresFromRun(run, { ct, siteId, correlation } = {}) {
  const samples = run.samples;
  const amps = samples.map((s) => ampAt(s, ct)).filter((v) => v != null && v >= 0);
  if (!amps.length) return null;

  const peakStartCurrentA = Math.round(Math.max(...amps) * 100) / 100;
  // Steady run = mean of latter half (or all if short)
  const steady = amps.length === 1 ? amps : amps.slice(Math.floor(amps.length / 2));
  const runCurrentA = Math.round((mean(steady) || peakStartCurrentA) * 100) / 100;
  const inrushRatio = runCurrentA > 0.01
    ? Math.round((peakStartCurrentA / runCurrentA) * 100) / 100
    : null;

  // Settle time: first sample until amp within 10% of run current
  let settleIdx = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = ampAt(samples[i], ct);
    if (a != null && Math.abs(a - runCurrentA) <= Math.max(0.5, runCurrentA * 0.1)) {
      settleIdx = i;
      break;
    }
    settleIdx = i;
  }
  const startTimeMs = Math.max(0, samples[settleIdx].t - samples[0].t);
  const runDurationMs = Math.max(0, (run.endMs || samples[samples.length - 1].t) - samples[0].t);

  const first = samples[0];
  const last = samples[samples.length - 1];
  const startsDelta = Math.max(
    0,
    (last.starts1 ?? first.starts1 ?? 0) - (first.starts1 ?? 0),
    (last.starts2 ?? first.starts2 ?? 0) - (first.starts2 ?? 0),
  );

  // Prefer start-time classifier when resolution supports it; else inrush
  let inference;
  if (startTimeMs >= 1000) {
    inference = classifyStart(startTimeMs);
  } else if (inrushRatio != null) {
    inference = classifyByInrush(inrushRatio);
  } else {
    inference = { label: 'healthy', score: 0.1, confidence: 0.5 };
  }

  return {
    at: first.at,
    assetId: siteId,
    siteId,
    method: run.method,
    correlation: correlation
      ? { digital: correlation.digital, ct: correlation.ct, inverted: correlation.inverted, delta: correlation.delta }
      : null,
    features: {
      startTimeMs,
      peakStartCurrentA,
      runCurrentA,
      inrushRatio,
      runDurationMs,
      sampleCount: samples.length,
      startsDelta,
      phaseA: Math.round((mean(samples.map((s) => s.cts[CT_COLS[0]]).filter((v) => v != null)) || 0) * 100) / 100,
      phaseB: Math.round((mean(samples.map((s) => s.cts[CT_COLS[1]]).filter((v) => v != null)) || 0) * 100) / 100,
      phaseC: Math.round((mean(samples.map((s) => s.cts[CT_COLS[2]]).filter((v) => v != null)) || 0) * 100) / 100,
    },
    inference: {
      type: 'classification',
      ...inference,
    },
  };
}

function toEdgeDoc(row, { deviceId, modelId = MODEL_ID, projectName = 'putnam_csv_import' } = {}) {
  return {
    at: row.at,
    deviceId: deviceId || `csv-${row.siteId}`,
    assetId: row.assetId,
    modelId,
    source: 'csv_import',
    projectName,
    inference: row.inference,
    features: row.features,
    meta: {
      method: row.method,
      correlation: row.correlation,
    },
  };
}

function toScadaDocs(row, { projectName = 'putnam_csv_import' } = {}) {
  const pens = buildMotorPens();
  const penByTag = Object.fromEntries(pens.map((p) => [p.tagId, p]));
  const pairs = [
    { tagId: 'MOTOR_CURRENT', value: row.features.runCurrentA },
    { tagId: 'MOTOR_START_MS', value: row.features.startTimeMs },
    { tagId: 'LINE_VOLTAGE', value: 240 },
  ];
  return pairs.map(({ tagId, value }) => {
    const tag = MOTOR_TAGS.find((t) => t.id === tagId);
    return {
      event: 'pen_sample',
      at: row.at,
      projectName,
      running: false,
      source: 'csv_run_amps',
      pen: penByTag[tagId],
      tag: { ...tag, value },
      sampleValue: value,
      scaledValue: value,
      assetId: row.assetId,
    };
  });
}

function trainingCsvHeader() {
  return [
    'siteId',
    'at',
    'method',
    'digital',
    'ct',
    'inverted',
    'peakStartCurrentA',
    'runCurrentA',
    'inrushRatio',
    'startTimeMs',
    'runDurationMs',
    'sampleCount',
    'startsDelta',
    'phaseA',
    'phaseB',
    'phaseC',
    'label',
    'score',
    'confidence',
  ].join(',');
}

function trainingCsvRow(row) {
  const c = row.correlation || {};
  const f = row.features;
  const inf = row.inference || {};
  return [
    row.siteId,
    row.at?.toISOString?.() || '',
    row.method || '',
    c.digital || '',
    c.ct || '',
    c.inverted === true ? '1' : '0',
    f.peakStartCurrentA,
    f.runCurrentA,
    f.inrushRatio,
    f.startTimeMs,
    f.runDurationMs,
    f.sampleCount,
    f.startsDelta,
    f.phaseA,
    f.phaseB,
    f.phaseC,
    inf.label || '',
    inf.score ?? '',
    inf.confidence ?? '',
  ].join(',');
}

/**
 * Analyze one lift-station CSV: correlate RUN→amps, segment runs, build training rows.
 */
function analyzeCsvFile(filePath, opts = {}) {
  const ampThreshold = Number(opts.ampThreshold) || DEFAULT_AMP_THRESHOLD;
  const siteId = opts.siteId || siteIdFromFile(filePath);
  const { headers, rows: rawRows } = parseCsvFile(filePath);
  const rows = normalizeRows(rawRows);
  const correlation = discoverRunAmpsCorrelation(rows);
  const runs = segmentRuns(rows, { correlation, ampThreshold, preferDigital: opts.preferDigital !== false });

  const training = [];
  for (const run of runs) {
    const feat = featuresFromRun(run, { ct: correlation?.ct, siteId, correlation });
    if (feat) training.push(feat);
  }

  const times = rows.map((r) => r.t);
  return {
    ok: true,
    filePath,
    fileName: path.basename(filePath),
    siteId,
    headers,
    rowCount: rows.length,
    from: times.length ? new Date(Math.min(...times)).toISOString() : null,
    to: times.length ? new Date(Math.max(...times)).toISOString() : null,
    correlation,
    ampThreshold,
    runCount: runs.length,
    training,
    summary: {
      runCount: training.length,
      meanRunCurrentA: mean(training.map((t) => t.features.runCurrentA)),
      meanPeakA: mean(training.map((t) => t.features.peakStartCurrentA)),
      meanInrush: mean(training.map((t) => t.features.inrushRatio).filter((v) => v != null)),
      labels: training.reduce((acc, t) => {
        const l = t.inference?.label || 'unknown';
        acc[l] = (acc[l] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

function analyzeCsvFiles(filePaths, opts = {}) {
  const sites = filePaths.map((p) => analyzeCsvFile(p, opts));
  const training = sites.flatMap((s) => s.training);
  const edgeDocs = training.map((t) => toEdgeDoc(t, opts));
  const scadaDocs = training.flatMap((t) => toScadaDocs(t, opts));
  return {
    ok: true,
    modelId: MODEL_ID,
    siteCount: sites.length,
    runCount: training.length,
    sites,
    training,
    edgeDocs,
    scadaDocs,
    tags: MOTOR_TAGS.map((t) => ({ ...t })),
    pens: buildMotorPens(),
  };
}

function writeTrainingArtifacts(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'correlation-report.json');
  const trainJsonPath = path.join(outDir, 'training.json');
  const trainCsvPath = path.join(outDir, 'training.csv');
  const edgePath = path.join(outDir, 'edge_inference.json');

  const report = {
    modelId: result.modelId,
    builtAt: new Date().toISOString(),
    siteCount: result.siteCount,
    runCount: result.runCount,
    sites: result.sites.map((s) => ({
      siteId: s.siteId,
      fileName: s.fileName,
      rowCount: s.rowCount,
      from: s.from,
      to: s.to,
      correlation: s.correlation,
      runCount: s.runCount,
      summary: s.summary,
    })),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(trainJsonPath, JSON.stringify(result.training, null, 2));
  fs.writeFileSync(edgePath, JSON.stringify(result.edgeDocs, null, 2));
  const csvLines = [trainingCsvHeader(), ...result.training.map(trainingCsvRow)];
  fs.writeFileSync(trainCsvPath, csvLines.join('\n') + '\n');
  return { reportPath, trainJsonPath, trainCsvPath, edgePath, outDir };
}

module.exports = {
  MODEL_ID,
  CT_COLS,
  DIG_COLS,
  DEFAULT_AMP_THRESHOLD,
  parseCsvText,
  parseCsvFile,
  isOn,
  discoverRunAmpsCorrelation,
  segmentRuns,
  featuresFromRun,
  classifyByInrush,
  analyzeCsvFile,
  analyzeCsvFiles,
  toEdgeDoc,
  toScadaDocs,
  writeTrainingArtifacts,
  siteIdFromFile,
  trainingCsvHeader,
  trainingCsvRow,
};
