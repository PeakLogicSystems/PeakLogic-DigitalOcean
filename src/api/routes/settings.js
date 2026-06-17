'use strict';

const path = require('path');
const persistence = require('../../persistence');
const programStore = require('../../programs/programStore');
const { normalizePens, penTagIds } = require('../../graph/graphPens');
const { isGraphableTag } = require('../../tags/graphableTags');
const { normalizeHmi, defaultDemoHmi } = require('../../hmi/hmiConfig');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const { normalizeMongoLogger } = require('../../settings/mongoLoggerSettings');
const { registry } = require('../../fleet/deviceRegistry');
const { getMqttCentralHub } = require('../../fleet/mqttCentralHub');

const PUBLIC_ROOT = path.join(__dirname, '../../../public');

function createSettingsRoutes(deps) {
  const { tagStore, scanEngine, graphHistory } = deps;
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
      const ml = normalizeMongoLogger(req.body.mongoLogger, prev);
      next.mongoLogger = ml;
      if (ml.uri) await mongoTagLogger.setConfig(ml);
      else await mongoTagLogger.clearConfig();
    }
    if (req.body.activeProgram) programStore.setActive(req.body.activeProgram);
    if (req.body.remoteExecution !== undefined) next.remoteExecution = !!req.body.remoteExecution;
    if (req.body.mqttFleet !== undefined) next.mqttFleet = req.body.mqttFleet;
    persistence.writeJson('settings.json', next);
    if (req.body.mqttFleet !== undefined) {
      getMqttCentralHub(registry).reload(next.mqttFleet).catch((e) => {
        console.warn('[mqtt-fleet] hub reload:', e.message || e);
      });
    }
    scanEngine.loadSettings();
    const penIds = new Set(penTagIds(graphPens));
    for (const t of tagList) {
      if (!isGraphableTag(t)) continue;
      const want = penIds.has(t.id);
      if (!!t.graphEnabled !== want) {
        tagStore.upsert({ ...t, graphEnabled: want });
      }
    }
    tagStore.save();
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
      hmi: next.hmi,
      mongoLogger: mongoTagLogger.status(),
    });
  });

  return router;
}

module.exports = { createSettingsRoutes };
