'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const persistence = require('../persistence');
const mongoTagLogger = require('../logger/mongoTagLogger');
const cmmsStore = require('../cmms/cmmsStore');
const { normalizePdmSettings } = require('../settings/pdmSettings');
const { normalizeCmmsSettings } = require('../settings/cmmsSettings');
const { normalizeInferenceSettings } = require('../settings/inferenceSettings');
const { normalizeAssetContext, defaultScadaTags, clampDays, DAY_MS } = require('./motorAssetSetup');
const { generateMotorAssetSimDocs } = require('./motorAssetSim');
const { parcReportFromStart } = require('./liftStationMcsaSim');
const { runHostInferenceFromReport } = require('../inference/hostInference');
const {
  buildFeaturesForAsset,
  loadPdmView,
  evaluateProactiveForAsset,
} = require('./pdmService');
const { applyProductionEarlyWarningProfile } = require('../settings/pdmProductionProfile');
const { buildAssetReportPdf } = require('./pdmReportService');
const { MODELS_DIR } = require('../inference/modelRegistry');

const PUMP_DEFS = [
  { pumpIndex: 1, pumpRole: 'lead' },
  { pumpIndex: 2, pumpRole: 'lag' },
];

/** Four scenarios aligned to Opta pseudo-MCSA vs true FFT MCSA × regression vs ONNX. */
const STUDY_SCENARIOS = [
  {
    id: 'opta-mcsa-regression',
    title: 'Opta pseudo MCSA uplink — PdM regression only',
    mcsaMode: 'lite',
    mcsaUplink: true,
    hostInference: false,
  },
  {
    id: 'opta-mcsa-onnx',
    title: 'Opta pseudo MCSA — host ONNX',
    mcsaMode: 'lite',
    mcsaUplink: true,
    hostInference: 'onnx',
  },
  {
    id: 'true-mcsa-regression',
    title: 'True MCSA (FFT sim) — host rules',
    mcsaMode: 'fft',
    mcsaUplink: true,
    hostInference: 'rule',
  },
  {
    id: 'true-mcsa-onnx',
    title: 'True MCSA (FFT sim) — host ONNX',
    mcsaMode: 'fft',
    mcsaUplink: true,
    hostInference: 'onnx',
  },
];

const LS_STUDY_CONTEXT_BASE = {
  motorType: 'pump',
  application: 'lift_station',
  configuration: 'duplex',
  locationClass: 'restaurant',
  installDate: '2024-01-15',
  serviceHistory: [{
    date: '2024-01-15',
    type: 'install',
    vendor: 'PeakLogic sim',
    notes: 'Duplex lift station — 6-month PdM study seed',
  }],
};

function studyAssetId(scenarioId, pumpIndex) {
  return `pump-${pumpIndex}-${scenarioId}`;
}

function allStudyAssetIds() {
  const ids = [];
  for (const sc of STUDY_SCENARIOS) {
    for (const p of PUMP_DEFS) {
      ids.push(studyAssetId(sc.id, p.pumpIndex));
    }
  }
  return ids;
}

function studyAssetContext(scenarioId, pumpDef) {
  const assetId = studyAssetId(scenarioId, pumpDef.pumpIndex);
  const scenario = STUDY_SCENARIOS.find((s) => s.id === scenarioId);
  return normalizeAssetContext({
    ...LS_STUDY_CONTEXT_BASE,
    motorType: 'pump',
    pumpIndex: pumpDef.pumpIndex,
    pumpRole: pumpDef.pumpRole,
    modelId: 'lift-submersible-v3',
    studyScenario: scenarioId,
    studyLabel: scenario?.title || scenarioId,
  }, assetId);
}

function buildStudySettings({ days = 180, applyProductionProfile = true } = {}) {
  const prev = persistence.readJson('settings.json', {});
  const assetContext = {};
  const assetTags = {};
  for (const sc of STUDY_SCENARIOS) {
    for (const p of PUMP_DEFS) {
      const assetId = studyAssetId(sc.id, p.pumpIndex);
      assetContext[assetId] = studyAssetContext(sc.id, p);
      assetTags[assetId] = defaultScadaTags({
        motorType: 'pump',
        configuration: 'duplex',
        pumpIndex: p.pumpIndex,
      });
    }
  }
  for (const p of PUMP_DEFS) {
    const liveId = `pump-${p.pumpIndex}`;
    if (!assetContext[liveId]) {
      assetContext[liveId] = studyAssetContext('opta-mcsa-onnx', p);
      assetTags[liveId] = defaultScadaTags({
        motorType: 'pump',
        configuration: 'duplex',
        pumpIndex: p.pumpIndex,
      });
    }
  }
  let settings = {
    ...prev,
    pdm: normalizePdmSettings({
      assetContext,
      assetTags,
      windowMin: 60,
      failureThreshold: 0.35,
      buildEnabled: true,
      simSeedDays: clampDays(days),
      forecastMethods: ['health_index', 'run_amps_creep', 'start_time_ms'],
      reportTitle: 'Lift Station PdM Study',
      reportCompany: 'PeakLogic Sim',
    }, prev),
    cmms: normalizeCmmsSettings({
      autoWorkOrdersFromPdm: true,
      autoWorkOrdersFromAlarms: false,
      appendServiceHistoryOnWoComplete: true,
    }, prev),
    inference: normalizeInferenceSettings({
      hostEnabled: true,
      mode: 'host-supplement',
      backend: 'auto',
    }, prev),
    project: { ...(prev.project || {}), name: 'Duplex Lift Station — 6mo PdM Study (4 scenarios)' },
  };
  if (applyProductionProfile) {
    settings = applyProductionEarlyWarningProfile(settings);
  }
  return settings;
}

function applyStudySettings(settings) {
  persistence.writeJson('settings.json', settings);
}

function ensureStudyOnnxModel() {
  const modelPath = path.join(MODELS_DIR, 'lift-submersible-v3.onnx');
  if (fs.existsSync(modelPath)) return { ok: true, path: modelPath, built: false };
  const script = path.join(__dirname, '../../scripts/gen-lift-study-onnx.py');
  const attempts = [
    ['py', ['-3', script]],
    ['python', [script]],
    ['python3', [script]],
  ];
  for (const [cmd, args] of attempts) {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(modelPath)) {
      return { ok: true, path: modelPath, built: true };
    }
  }
  return {
    ok: false,
    error: 'Could not build study ONNX model (py -3 scripts/gen-lift-study-onnx.py; pip install onnx numpy)',
  };
}

async function purgeStudyMongo({ assetIds, fromMs, toMs, projectName }) {
  const db = await mongoTagLogger.getDb();
  if (!db) return { ok: false, error: 'MongoDB not connected' };

  const settings = persistence.readJson('settings.json', {});
  const pdm = normalizePdmSettings(settings.pdm, settings);
  const featuresCol = pdm.featuresCollection || 'pdm_features';
  const edgeCol = settings.mongoLogger?.edgeCollection || 'edge_inference_ts';
  const samplesCol = settings.mongoLogger?.samplesCollection || 'tag_samples_ts';
  const from = new Date(fromMs);
  const to = new Date(toMs);
  let deleted = 0;

  if (projectName) {
    deleted += (await db.collection(samplesCol).deleteMany({
      timestamp: { $gte: from, $lte: to },
      'metadata.projectName': projectName,
    })).deletedCount;
    deleted += (await db.collection(settings.mongoLogger?.collection || 'tag_logs').deleteMany({
      event: 'pen_sample',
      projectName,
      at: { $gte: from, $lte: to },
    })).deletedCount;
  }

  deleted += (await db.collection(edgeCol).deleteMany({
    timestamp: { $gte: from, $lte: to },
    'metadata.assetId': { $in: assetIds },
  })).deletedCount;
  deleted += (await db.collection(edgeCol).deleteMany({
    assetId: { $in: assetIds },
    at: { $gte: from, $lte: to },
  })).deletedCount;
  deleted += (await db.collection(featuresCol).deleteMany({
    assetId: { $in: assetIds },
    windowStartMs: { $gte: fromMs, $lte: toMs },
  })).deletedCount;

  return { ok: true, deletedCount: deleted };
}

function purgeStudyCmms(assetIds) {
  const idSet = new Set(assetIds);
  const pdmWos = cmmsStore.listWorkOrders({ limit: 500, filter: { source: 'pdm' } })
    .filter((wo) => idSet.has(wo.assetId));
  for (const wo of pdmWos) {
    cmmsStore.deleteWorkOrder(wo.id);
  }
  return { ok: true, removedCount: pdmWos.length };
}

function generateScenarioSim({
  scenarioId,
  days = 180,
  now = Date.now(),
  projectName,
}) {
  const sims = [];
  for (const p of PUMP_DEFS) {
    const assetId = studyAssetId(scenarioId, p.pumpIndex);
    sims.push(generateMotorAssetSimDocs({
      assetId,
      context: studyAssetContext(scenarioId, p),
      days,
      now,
      projectName,
      includeEdgeAi: false,
    }));
  }
  return {
    sims,
    edgeDocs: [],
    scadaDocs: sims.flatMap((s) => s.scadaDocs),
    startEvents: sims.flatMap((s) => s.startEvents || []),
    fromMs: Date.parse(sims[0].from),
    toMs: Date.parse(sims[0].to),
    days: sims[0].days,
    projectName,
    assetIds: PUMP_DEFS.map((p) => studyAssetId(scenarioId, p.pumpIndex)),
  };
}

function countMcsaUplink({ startEvents, mcsaMode, scenarioId }) {
  return startEvents.map((ev) => parcReportFromStart({
    at: ev.at,
    pumpIndex: ev.pumpIndex,
    assetId: `pump-${ev.pumpIndex}`,
    startMs: ev.startMs,
    runAmps: ev.runAmps,
    peakAmps: ev.peakAmps,
    healthScore: ev.healthScore,
    wear: ev.wear,
    deviceId: `duplexls_${scenarioId}`,
    mcsaMode,
  }));
}

async function generateHostMcsaEdgeDocs({ startEvents, settings, hostBackend, scenarioId, mcsaMode }) {
  const inference = normalizeInferenceSettings({
    hostEnabled: true,
    mode: 'host-override',
    backend: hostBackend,
  }, settings);
  const docs = [];
  for (const ev of startEvents) {
    const studyAsset = studyAssetId(scenarioId, ev.pumpIndex);
    const report = parcReportFromStart({
      at: ev.at,
      pumpIndex: ev.pumpIndex,
      assetId: `pump-${ev.pumpIndex}`,
      startMs: ev.startMs,
      runAmps: ev.runAmps,
      peakAmps: ev.peakAmps,
      healthScore: ev.healthScore,
      wear: ev.wear,
      deviceId: `duplexls_${scenarioId}`,
      mcsaMode,
    });
    const result = await runHostInferenceFromReport(report, {
      settings: { ...settings, inference },
    });
    for (const doc of result.docs || []) {
      if (doc.assetId !== `pump-${ev.pumpIndex}`) continue;
      docs.push({
        ...doc,
        at: ev.at,
        assetId: studyAsset,
        projectName: `ls6mo_${scenarioId}`,
        source: 'host',
        features: {
          ...(doc.features || {}),
          studyScenario: scenarioId,
          hostBackend: doc.features?.hostBackend || hostBackend,
          simLabel: ev.label,
        },
      });
    }
  }
  return docs;
}

async function seedSimToMongo(simBundle) {
  const edgeOk = simBundle.edgeDocs.length
    ? await mongoTagLogger.logEdgeInferences(simBundle.edgeDocs)
    : { ok: true, skipped: true, count: 0 };
  const scadaOk = simBundle.scadaDocs.length
    ? await mongoTagLogger.insertPenDocs(simBundle.scadaDocs)
    : { ok: true, skipped: true, count: 0 };
  return { edgeOk, scadaOk };
}

async function runMonthlyProactiveTimeline({ settings, assetIds, fromMs, toMs, months = 6 }) {
  const timeline = [];
  const workOrdersCreated = [];
  const stepMs = Math.floor((toMs - fromMs) / months);

  for (let m = 1; m <= months; m++) {
    const checkpointMs = m === months ? toMs : fromMs + m * stepMs;
    const monthEntry = { month: m, checkpointAt: new Date(checkpointMs).toISOString(), assets: [] };

    for (const assetId of assetIds) {
      await buildFeaturesForAsset(assetId, { fromMs, toMs: checkpointMs, settings });
      const view = await loadPdmView(assetId, { fromMs, toMs: checkpointMs, settings, runProactive: false });
      const proactive = await evaluateProactiveForAsset(assetId, { fromMs, toMs: checkpointMs, settings });
      if (proactive.workOrder) {
        workOrdersCreated.push({
          month: m,
          checkpointAt: monthEntry.checkpointAt,
          assetId,
          workOrder: proactive.workOrder,
        });
      }
      monthEntry.assets.push({
        assetId,
        forecast: view.forecast,
        rul: view.rul,
        featureWindowCount: view.features?.length ?? 0,
        workOrderCreated: !!proactive.created,
        workOrderNumber: proactive.workOrder?.number || null,
      });
    }
    timeline.push(monthEntry);
  }
  return { timeline, workOrdersCreated };
}

async function exportScenarioReports({ settings, assetIds, fromMs, toMs, outputDir, scenarioLabel, scenarioTitle }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const reports = [];
  for (const assetId of assetIds) {
    const { buf, view } = await buildAssetReportPdf(assetId, {
      settings,
      fromMs,
      toMs,
      source: `LS 6mo study — ${scenarioTitle}`,
      reportConfig: {
        title: `PdM — ${scenarioTitle}`,
        subtitle: `${assetId} · 6-month sim`,
      },
      storeInMongo: false,
    });
    const filename = `PdM_${scenarioLabel}_${assetId}.pdf`.replace(/[^\w.-]+/g, '_');
    fs.writeFileSync(path.join(outputDir, filename), buf);
    reports.push({ assetId, filename, forecast: view.forecast, rul: view.rul });
  }
  return reports;
}

function listPdmWorkOrders(assetIds) {
  return cmmsStore.listWorkOrders({ limit: 500, filter: { source: 'pdm' } })
    .filter((wo) => assetIds.includes(wo.assetId));
}

async function runStudyScenario({
  scenario,
  days = 180,
  now = Date.now(),
  outputDir,
  settings,
  purgeCmms = false,
}) {
  const {
    id: scenarioLabel,
    mcsaMode,
    mcsaUplink,
    hostInference,
    title: scenarioTitle,
  } = scenario;
  const assetIds = PUMP_DEFS.map((p) => studyAssetId(scenarioLabel, p.pumpIndex));
  const projectName = `ls6mo_${scenarioLabel}`;

  if (purgeCmms) purgeStudyCmms(assetIds);

  const sim = generateScenarioSim({
    scenarioId: scenarioLabel,
    days,
    now,
    projectName,
  });

  await purgeStudyMongo({ assetIds, fromMs: sim.fromMs, toMs: sim.toMs, projectName });

  const mcsaReports = mcsaUplink
    ? countMcsaUplink({ startEvents: sim.startEvents, mcsaMode, scenarioId: scenarioLabel })
    : [];

  let hostEdgeDocs = [];
  if (hostInference) {
    hostEdgeDocs = await generateHostMcsaEdgeDocs({
      startEvents: sim.startEvents,
      settings,
      hostBackend: hostInference,
      scenarioId: scenarioLabel,
      mcsaMode,
    });
  }

  const edgeDocs = hostEdgeDocs;
  const seeded = await seedSimToMongo({ ...sim, edgeDocs });

  const { timeline, workOrdersCreated } = await runMonthlyProactiveTimeline({
    settings,
    assetIds,
    fromMs: sim.fromMs,
    toMs: sim.toMs,
    months: 6,
  });

  const scenarioDir = path.join(outputDir, scenarioLabel);
  const reports = await exportScenarioReports({
    settings,
    assetIds,
    fromMs: sim.fromMs,
    toMs: sim.toMs,
    outputDir: scenarioDir,
    scenarioLabel,
    scenarioTitle,
  });

  const finalForecasts = reports.map((r) => ({
    assetId: r.assetId,
    severity: r.forecast?.severity || 'unknown',
    rulDays: r.forecast?.rulDaysEstimate ?? r.rul?.rulDaysEstimate ?? null,
    headline: r.forecast?.headline || '',
    currentHealth: r.rul?.currentHealth ?? null,
  }));

  const allWorkOrders = listPdmWorkOrders(assetIds);
  const firstAlertMonth = (assetId) => {
    for (const row of timeline) {
      const asset = row.assets.find((a) => a.assetId === assetId);
      const sev = asset?.forecast?.severity;
      if (sev && sev !== 'ok' && sev !== 'unknown') return row.month;
    }
    return null;
  };

  const summary = {
    scenario: scenarioLabel,
    scenarioTitle,
    mcsaMode,
    mcsaUplink,
    hostInference,
    days,
    projectName,
    assetIds,
    from: sim.sims[0].from,
    to: sim.sims[0].to,
    counts: {
      mcsaUplinkReports: mcsaReports.length,
      hostEdgeInferences: hostEdgeDocs.length,
      edgeInferences: edgeDocs.length,
      penSamples: sim.scadaDocs.length,
      proactiveWorkOrders: allWorkOrders.length,
    },
    seeded,
    timeline,
    cmmsWorkOrders: allWorkOrders.map((wo) => ({
      number: wo.number,
      assetId: wo.assetId,
      priority: wo.priority,
      title: wo.title,
      status: wo.status,
      createdAt: wo.createdAt,
      dueAt: wo.dueAt,
      firstAlertMonth: firstAlertMonth(wo.assetId),
    })),
    finalForecasts,
    reports: reports.map((r) => ({ assetId: r.assetId, file: r.filename })),
    workOrdersCreated: workOrdersCreated.length,
  };

  fs.mkdirSync(scenarioDir, { recursive: true });
  fs.writeFileSync(path.join(scenarioDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(scenarioDir, 'work-orders.json'), JSON.stringify(allWorkOrders, null, 2));
  return summary;
}

function buildComparisonMarkdown({ scenarios, outputDir }) {
  const lines = [
    '# Duplex Lift Station — 6-Month PdM Study (4 scenarios)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Scenarios (all visible in Historian PdM + CMMS)',
    '',
    '| Scenario | Asset IDs | Edge / host path |',
    '|----------|-----------|------------------|',
  ];
  for (const sc of STUDY_SCENARIOS) {
    const ids = PUMP_DEFS.map((p) => studyAssetId(sc.id, p.pumpIndex)).join(', ');
    let pathDesc = 'SCADA regression only';
    if (sc.hostInference === 'onnx') {
      pathDesc = sc.mcsaMode === 'fft' ? 'True MCSA FFT + host ONNX' : 'Opta pseudo MCSA + host ONNX';
    } else if (sc.hostInference === 'rule') {
      pathDesc = 'True MCSA FFT + host rules';
    } else if (sc.mcsaUplink) {
      pathDesc = 'Opta pseudo MCSA uplink (no inference) + PdM regression';
    }
    lines.push(`| **${sc.id}** — ${sc.title} | ${ids} | ${pathDesc} |`);
  }

  lines.push('', '## Work orders by scenario', '');
  for (const result of scenarios) {
    lines.push(`### ${result.scenarioTitle} (\`${result.scenario}\`)`, '');
    for (const wo of result.cmmsWorkOrders || []) {
      const alert = wo.firstAlertMonth ? ` · month ${wo.firstAlertMonth}` : '';
      lines.push(`- **${wo.number}** · ${wo.assetId} · ${wo.priority}${alert}`);
    }
    if (!(result.cmmsWorkOrders || []).length) lines.push('- _(none)_');
    lines.push('');
  }

  lines.push('## Review in PeakLogic', '');
  lines.push('1. **Historian → Logger config → PdM** — 8 assets (`pump-1-*` / `pump-2-*` for each scenario).');
  lines.push('2. **CMMS** (`/cmms`) — filter source **pdm** — up to 8 proactive PM work orders.');
  lines.push('3. Live pumps `pump-1` / `pump-2` use **production early-warning profile** (`data/pdm-production-early-warning.json`).');
  lines.push('4. PDFs in each scenario subfolder under this study directory.');
  lines.push('');

  fs.writeFileSync(path.join(outputDir, 'STUDY-COMPARISON.md'), lines.join('\n'), 'utf8');
}

async function runLiftStation6MonthStudy(opts = {}) {
  const days = clampDays(opts.days ?? 180);
  const now = opts.now ? Number(opts.now) : Date.now();
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = opts.outputDir || path.join(
    require('../config').DATA_DIR,
    'sim-studies',
    `ls-6mo-4way-${stamp}`,
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const onnx = ensureStudyOnnxModel();
  if (!onnx.ok) {
    console.warn(`[ls-study] ONNX model missing: ${onnx.error} — host-tensor will fall back to rules`);
  } else if (onnx.built) {
    console.log(`[ls-study] Built study ONNX: ${onnx.path}`);
  }

  const settingsBackup = persistence.readJson('settings.json', {});
  fs.writeFileSync(path.join(outputDir, 'settings-before-study.json'), JSON.stringify(settingsBackup, null, 2));

  const allAssets = allStudyAssetIds();
  purgeStudyCmms(allAssets);

  const settings = buildStudySettings({ days });
  applyStudySettings(settings);

  console.log(`[ls-study] Output: ${outputDir}`);
  console.log(`[ls-study] ${days} days · 4 scenarios · 8 PdM assets · restaurant duplex`);

  const results = [];
  for (const scenario of STUDY_SCENARIOS) {
    console.log(`[ls-study] Running ${scenario.id}…`);
    const summary = await runStudyScenario({
      scenario,
      days,
      now,
      outputDir,
      settings,
      purgeCmms: false,
    });
    results.push(summary);
    console.log(`[ls-study]   ${summary.counts.proactiveWorkOrders} WO(s) · ${summary.counts.mcsaUplinkReports} mcsa uplink · ${summary.counts.edgeInferences} inference`);
  }

  const productionSettings = applyProductionEarlyWarningProfile(settings);
  fs.writeFileSync(
    path.join(require('../config').DATA_DIR, 'pdm-production-early-warning.json'),
    JSON.stringify({
      description: 'Apply for live duplex lift station — earliest proactive warning (host supplement + all forecast methods)',
      inference: productionSettings.inference,
      pdm: {
        buildEnabled: productionSettings.pdm.buildEnabled,
        buildIntervalHours: productionSettings.pdm.buildIntervalHours,
        failureThreshold: productionSettings.pdm.failureThreshold,
        windowMin: productionSettings.pdm.windowMin,
        forecastMethods: productionSettings.pdm.forecastMethods,
      },
      cmms: productionSettings.cmms,
    }, null, 2),
  );
  applyStudySettings(productionSettings);

  const allWos = cmmsStore.listWorkOrders({ limit: 500, filter: { source: 'pdm' } })
    .filter((wo) => allAssets.includes(wo.assetId));

  const comparison = {
    generatedAt: new Date().toISOString(),
    days,
    assets: allAssets,
    scenarios: results.map((r) => ({
      id: r.scenario,
      title: r.scenarioTitle,
      workOrders: r.cmmsWorkOrders,
      finalForecasts: r.finalForecasts,
      counts: r.counts,
    })),
    totalProactiveWorkOrders: allWos.length,
  };

  fs.writeFileSync(path.join(outputDir, 'comparison.json'), JSON.stringify(comparison, null, 2));
  fs.writeFileSync(path.join(outputDir, 'all-work-orders.json'), JSON.stringify(allWos, null, 2));
  buildComparisonMarkdown({ scenarios: results, outputDir });

  console.log(`[ls-study] Done — ${allWos.length} total PdM work orders in CMMS`);
  console.log(`[ls-study] Review: ${path.join(outputDir, 'STUDY-COMPARISON.md')}`);
  console.log('[ls-study] UI: Historian → PdM (8 assets) · CMMS → filter pdm');

  return { outputDir, results, comparison, allWorkOrders: allWos };
}

module.exports = {
  STUDY_SCENARIOS,
  PUMP_DEFS,
  studyAssetId,
  allStudyAssetIds,
  buildStudySettings,
  generateScenarioSim,
  runStudyScenario,
  runLiftStation6MonthStudy,
  runMonthlyProactiveTimeline,
  ensureStudyOnnxModel,
};
