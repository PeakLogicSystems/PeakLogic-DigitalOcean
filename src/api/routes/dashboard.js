'use strict';

const path = require('path');
const persistence = require('../../persistence');
const programStore = require('../../programs/programStore');
const { parseProgram, collectProgramTagRefs } = require('../../engine/parser');
const { listSerialPorts } = require('../../system/serialPorts');
const { listPresets } = require('../../devices/devicePresets');
const { listTransportGroups } = require('../../devices/hardwareWizard');
const { normalizePens, penTagIds } = require('../../graph/graphPens');
const { normalizeHmi, defaultDemoHmi } = require('../../hmi/hmiConfig');
const { ensureDuplexlsScreen2 } = require('../../hmi/duplexlsScreen');
const { patchAssistedLivingHmi } = require('../../settings/assistedLivingSettings');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const projectStore = require('../../project/projectStore');
const { resolveParcRegistry } = require('../../parc/deviceRegistry');
const { getMqttCentralHub } = require('../../parc/mqttCentralHub');
const { syncMqttParcLiveIo } = require('../../parc/parcLiveIoSync');
const { enrichParcDevicesWithDriverLink } = require('../../parc/parcDiscovery');
const { MAX_TAGS, DEPLOYMENT_MODE } = require('../../config');
const { publicDriverList } = require('../../drivers/driverConfig');
const { normalizeReportConfig } = require('../../reports/reportConfig');
const { stProgramLimitsMeta, assessStProgramLines } = require('../../programs/stProgramLimits');
const { readTimezoneFromSettings } = require('../../settings/timezoneSettings');
const { buildLivePayload } = require('../../live/liveWebSocket');

const PUBLIC_ROOT = path.join(__dirname, '../../../public');

function createDashboardRoutes(deps) {
  const { tagStore, driverManager, scanEngine, graphHistory } = deps;
  const router = require('express').Router();

  router.get('/live', (req, res) => {
    const payload = buildLivePayload({ tagStore, driverManager, scanEngine });
    const qIds = (req.query.graphTags || '').split(',').filter(Boolean);
    if (qIds.length) {
      payload.graph = graphHistory.getHistory(qIds, 400);
    }
    res.json(payload);
  });

  router.get('/dashboard', async (req, res) => {
    syncMqttParcLiveIo(tagStore, driverManager);
    const tagList = tagStore.list();
    const registry = resolveParcRegistry();
    let settings = persistence.readJson('settings.json', { scanMs: 100, graphMaxPoints: 600, graphPens: [] });
    const mqttHub = getMqttCentralHub(registry).status();
    if (DEPLOYMENT_MODE === 'cloud' && mqttHub.brokerUrl) {
      settings = {
        ...settings,
        mqttParc: {
          ...(settings.mqttParc || {}),
          brokerUrl: mqttHub.brokerUrl,
        },
      };
    }
    const projects = await projectStore.listProjectsFresh();
    const startup = settings.startup || {};
    const activeProjectId = settings.project?.lastOpenedId
      || (startup.mode === 'saved_project' && startup.projectId ? startup.projectId : null);
    let activeProjectName = settings.project?.name;
    if (activeProjectId) {
      const listed = projects.find((p) => String(p.id) === String(activeProjectId));
      if (listed?.name) activeProjectName = listed.name;
      else if (!activeProjectName) activeProjectName = activeProjectId;
    }
    const graphPens = normalizePens(settings.graphPens, tagList);
    const rawHmi = patchAssistedLivingHmi(settings.hmi?.screens?.length ? settings.hmi : defaultDemoHmi());
    ensureDuplexlsScreen2(rawHmi, PUBLIC_ROOT, activeProjectName || settings.project?.name);
    const hmi = normalizeHmi(rawHmi, tagList, PUBLIC_ROOT);
    const qIds = (req.query.graphTags || '').split(',').filter(Boolean);
    const graphIds = qIds.length ? qIds : penTagIds(graphPens);
    const programSource = programStore.readActive();
    const programMeta = programStore.activeProgramMeta();
    let programTagRefs = [];
    if (scanEngine.ast) {
      programTagRefs = collectProgramTagRefs(scanEngine.ast);
    } else if (programSource) {
      const { ast } = parseProgram(programSource);
      programTagRefs = ast ? collectProgramTagRefs(ast) : [];
    }
    const programLineCount = assessStProgramLines(programSource, { forParc: false });
    const programLineCountParc = assessStProgramLines(programSource, { forParc: true });
    let serialPorts = [];
    try { serialPorts = await listSerialPorts(); } catch { /* ignore */ }
    let optaRuntime = null;
    try {
      const { optaRuntimeSnapshot } = require('../../parc/parcLiveIoSync');
      optaRuntime = optaRuntimeSnapshot(driverManager);
    } catch { /* optional */ }
    res.json({
      runtime: scanEngine.status(),
      optaRuntime,
      tags: tagList,
      tagCount: tagStore.count(),
      maxTags: MAX_TAGS,
      drivers: publicDriverList(driverManager.list()),
      driverHealth: driverManager.health(),
      program: programSource,
      programMeta,
      activeProgram: programStore.activeRel(),
      stDir: programStore.stDir(),
      programs: programStore.listPrograms(),
      settings: {
        ...settings,
        timezone: readTimezoneFromSettings(settings),
        graphPens,
        hmi,
        reportConfig: normalizeReportConfig(settings.reportConfig),
      },
      reportConfig: normalizeReportConfig(settings.reportConfig),
      forces: tagList.filter((t) => t.forceInput || t.forceOutput),
      graph: graphHistory.getHistory(graphIds.length ? graphIds : null, 400),
      graphPens,
      programTagRefs,
      programLimits: stProgramLimitsMeta(),
      programLineCount,
      programLineCountParc,
      live: tagStore.liveSnapshot(),
      serialPorts,
      devicePresets: listPresets(),
      wizardTransportGroups: listTransportGroups(),
      mongoLogger: mongoTagLogger.status(),
      projects,
      activeProjectId: activeProjectId || null,
      activeProjectName: activeProjectName || settings.project?.name || 'untitled',
      parc: {
        settings: registry.settings(),
        devices: enrichParcDevicesWithDriverLink((() => {
          try {
            const { listVisibleParcDevices } = require('../../parc/parcTenantScope');
            return listVisibleParcDevices(registry);
          } catch {
            return registry.listDevices();
          }
        })(), driverManager.list()),
        mqtt: mqttHub,
      },
    });
  });

  return router;
}

module.exports = { createDashboardRoutes };
