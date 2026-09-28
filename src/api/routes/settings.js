'use strict';

const path = require('path');
const persistence = require('../../persistence');
const programStore = require('../../programs/programStore');
const { normalizePens } = require('../../graph/graphPens');
const { normalizeHmi, defaultDemoHmi } = require('../../hmi/hmiConfig');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const hardwareHistoryStore = require('../../hardware/hardwareHistoryStore');
const mongoSysLog = require('../../logger/mongoSysLog');
const { normalizePdmSettings } = require('../../settings/pdmSettings');
const { normalizeMongoLogger, resolveMongoLoggerForDeployment } = require('../../settings/mongoLoggerSettings');
const { DEPLOYMENT_MODE } = require('../../config');
const { normalizeStartup } = require('../../settings/startupSettings');
const { normalizeReportConfig } = require('../../reports/reportConfig');
const { normalizeCmmsIntegration } = require('../../settings/cmmsIntegrationSettings');
const { reloadConfig: reloadCmmsPublisher } = require('../../integrations/cmmsAlarmPublisher');
const { registry } = require('../../parc/deviceRegistry');
const { getMqttCentralHub } = require('../../parc/mqttCentralHub');
const {
  defaultMqttParcSettings,
  mqttParcHubConnectionKey,
  applyCloudMqttParcEnv,
  tenantMqttParcMayReloadHub,
} = require('../../parc/mqttParcBootstrap');
const { normalizeSiteKey } = require('../../parc/globalAddressKey');
const { normalizeCloudRemote } = require('../../settings/cloudRemoteSettings');
const { reloadConfig: reloadCloudRemote } = require('../../integrations/applianceCloudRelay');
const { normalizeCellularSimsSettings } = require('../../cellular/cellularSettings');
const { normalizeCloudSimsSettings } = require('../../cloud/cloudSettings');
const { normalizeRoiSettings } = require('../../settings/roiSettings');
const { normalizeAssistedLiving, syncAssistedLivingTags } = require('../../settings/assistedLivingSettings');
const { normalizeTimezone, readTimezoneFromSettings } = require('../../settings/timezoneSettings');
const { setConsoleTimezone } = require('../../logger/consoleTimestamp');
const simManager = require('../../cloud/simManager');
const { isCloudSimsEnabled } = require('../../cloud/cloudSimsEnabled');

const PUBLIC_ROOT = path.join(__dirname, '../../../public');

function createSettingsRoutes(deps) {
  const { tagStore, scanEngine, graphHistory, driverManager } = deps;
  const router = require('express').Router();

  router.put('/settings', async (req, res) => {
    const prev = persistence.readJson('settings.json', {});
    const tagList = tagStore.list();
    const graphPens = req.body.graphPens != null
      ? normalizePens(req.body.graphPens, tagList)
      : normalizePens(prev.graphPens, tagList);
    const next = { ...prev, graphPens };
    if (req.body.hmi != null) {
      next.hmi = normalizeHmi(req.body.hmi, tagList, PUBLIC_ROOT);
    } else if (!prev.hmi?.screens?.length) {
      next.hmi = defaultDemoHmi();
    }
    if (req.body.project) next.project = { ...(prev.project || {}), ...req.body.project };
    if (req.body.scanMs != null) next.scanMs = +req.body.scanMs;
    if (req.body.graphMaxPoints != null) next.graphMaxPoints = +req.body.graphMaxPoints;
    if (req.body.defaults && typeof req.body.defaults === 'object') {
      next.defaults = { ...(prev.defaults || {}), ...req.body.defaults };
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'mongoLogger')) {
      const normalized = normalizeMongoLogger(req.body.mongoLogger, prev);
      const ml = resolveMongoLoggerForDeployment(normalized, DEPLOYMENT_MODE);
      next.mongoLogger = ml;
      if (ml.uri) {
        await mongoTagLogger.setConfig(ml);
        await hardwareHistoryStore.setConfig(ml);
        await mongoSysLog.setConfig(ml);
      } else {
        const envMl = resolveMongoLoggerForDeployment({}, DEPLOYMENT_MODE);
        if (envMl.uri) {
          next.mongoLogger = envMl;
          await mongoTagLogger.setConfig(envMl);
          await hardwareHistoryStore.setConfig(envMl);
          await mongoSysLog.setConfig(envMl);
        } else {
          await mongoTagLogger.clearConfig();
          await hardwareHistoryStore.setConfig(null);
          await mongoSysLog.setConfig(null);
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'autoStartRuntime')) {
      next.autoStartRuntime = req.body.autoStartRuntime !== false;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'startup')) {
      next.startup = normalizeStartup(req.body.startup, prev.startup);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'activeProgram')) {
      if (req.body.activeProgram) {
        next.activeProgram = programStore.setActive(req.body.activeProgram);
      } else {
        programStore.clearActive();
        next.activeProgram = null;
      }
    }
    if (req.body.reportConfig != null) {
      next.reportConfig = normalizeReportConfig(req.body.reportConfig);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'pdm')) {
      next.pdm = normalizePdmSettings(req.body.pdm, prev);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'roi')) {
      next.roi = normalizeRoiSettings(req.body.roi, prev);
    }
    if (req.body.remoteExecution !== undefined) next.remoteExecution = !!req.body.remoteExecution;
    if (Object.prototype.hasOwnProperty.call(req.body, 'optaAutoRunOnBoot')) {
      next.optaAutoRunOnBoot = req.body.optaAutoRunOnBoot === true;
    }
    if (req.body.mqttParc !== undefined) {
      const patch = req.body.mqttParc && typeof req.body.mqttParc === 'object' ? req.body.mqttParc : {};
      next.mqttParc = {
        ...defaultMqttParcSettings(prev.mqttParc || {}),
        ...(prev.mqttParc || {}),
        ...patch,
      };
      if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
        next.mqttParc.enabled = patch.enabled === true;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'autoDiscoverDrivers')) {
        next.mqttParc.autoDiscoverDrivers = patch.autoDiscoverDrivers === true;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'globalSiteKey')) {
        try {
          next.mqttParc.globalSiteKey = normalizeSiteKey(patch.globalSiteKey);
        } catch {
          next.mqttParc.globalSiteKey = defaultMqttParcSettings(prev.mqttParc || {}).globalSiteKey;
        }
      }
      if (DEPLOYMENT_MODE === 'cloud') {
        const pinned = applyCloudMqttParcEnv({ mqttParc: next.mqttParc });
        next.mqttParc = pinned.settings.mqttParc;
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'cmmsIntegration')) {
      next.cmmsIntegration = normalizeCmmsIntegration(req.body.cmmsIntegration, prev.cmmsIntegration);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'cloudRemote')) {
      next.cloudRemote = normalizeCloudRemote(req.body.cloudRemote, prev.cloudRemote);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'cellularSims')) {
      next.cellularSims = normalizeCellularSimsSettings(req.body.cellularSims, prev.cellularSims);
    }
    const prevCloudSimsEnabled = isCloudSimsEnabled();
    if (Object.prototype.hasOwnProperty.call(req.body, 'cloudSims')) {
      next.cloudSims = normalizeCloudSimsSettings(req.body.cloudSims, prev.cloudSims);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'assistedLiving')) {
      next.assistedLiving = normalizeAssistedLiving(req.body.assistedLiving, prev.assistedLiving);
    }
    const prevTimezone = readTimezoneFromSettings(prev);
    if (Object.prototype.hasOwnProperty.call(req.body, 'timezone')) {
      next.timezone = normalizeTimezone(req.body.timezone, prev.timezone);
    } else {
      next.timezone = prevTimezone;
    }
    persistence.writeJson('settings.json', next);
    await persistence.flushConfig();
    syncAssistedLivingTags(tagStore, next.assistedLiving);
    if (req.body.mqttParc !== undefined) {
      if (tenantMqttParcMayReloadHub()) {
        const prevKey = mqttParcHubConnectionKey(prev.mqttParc);
        const nextKey = mqttParcHubConnectionKey(next.mqttParc);
        if (prevKey !== nextKey) {
          await getMqttCentralHub(registry).reload(next.mqttParc).catch((e) => {
            console.warn('[mqtt-parc] hub reload:', e.message || e);
          });
        }
      } else {
        try {
          const { bootstrapCloudParcMqttHub } = require('../../parc/cloudParcHubBoot');
          const hubBoot = await bootstrapCloudParcMqttHub(registry);
          if (hubBoot.error) {
            console.warn('[mqtt-parc] cloud hub ensure after settings:', hubBoot.error);
          }
        } catch (e) {
          console.warn('[mqtt-parc] cloud hub ensure after settings:', e.message || e);
        }
      }
      if (next.mqttParc?.enabled === true && driverManager) {
        const { ensureParcDriversFromRegistry } = require('../../parc/parcDriverSync');
        await ensureParcDriversFromRegistry({ driverManager, registry, tagStore }).catch((e) => {
          console.warn('[mqtt-parc] registry driver sync:', e.message || e);
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'cmmsIntegration')) {
      reloadCmmsPublisher(next.cmmsIntegration);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'cloudRemote')) {
      reloadCloudRemote(next.cloudRemote);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'cloudSims') && !prevCloudSimsEnabled && isCloudSimsEnabled()) {
      await simManager.init().catch((e) => {
        console.warn('[cloud-sims] init after settings enable:', e.message || e);
      });
    }
    setConsoleTimezone(next.timezone);
    if (next.timezone !== prevTimezone && driverManager) {
      const { syncOptaClocks } = require('../../parc/mqttOptaTimeSync');
      syncOptaClocks(driverManager).catch((e) => {
        console.warn('[timezone] Opta re-sync after timezone change:', e.message || e);
      });
    }
    scanEngine.loadSettings();
    if (next.graphMaxPoints) graphHistory.setMaxPoints(next.graphMaxPoints);
    const projectName = req.body.projectName || next.project?.name
      || persistence.readJson('workspace.est.json', {})?.project?.name;
    mongoTagLogger.logPenSelection({
      pens: graphPens,
      tags: tagList,
      projectName: projectName || 'untitled',
      source: 'apply_graph_settings',
    }).catch(() => {});
    res.json({
      ok: true,
      settings: next,
      graphPens,
      reportConfig: normalizeReportConfig(next.reportConfig),
      hmi: next.hmi,
      mongoLogger: mongoTagLogger.status(),
      cmmsIntegration: normalizeCmmsIntegration(next.cmmsIntegration, prev.cmmsIntegration),
    });
  });

  return router;
}

module.exports = { createSettingsRoutes };
