'use strict';

const path = require('path');
const persistence = require('../../persistence');
const programStore = require('../../programs/programStore');
const { parseProgram, collectProgramTagRefs } = require('../../engine/parser');
const { listSerialPorts } = require('../../system/serialPorts');
const { listPresets } = require('../../devices/devicePresets');
const { normalizePens, penTagIds } = require('../../graph/graphPens');
const { normalizeHmi, defaultDemoHmi } = require('../../hmi/hmiConfig');
const mongoTagLogger = require('../../logger/mongoTagLogger');
const projectStore = require('../../project/projectStore');
const { registry } = require('../../fleet/deviceRegistry');
const { getMqttCentralHub } = require('../../fleet/mqttCentralHub');
const { MAX_TAGS } = require('../../config');

const PUBLIC_ROOT = path.join(__dirname, '../../../public');

function createDashboardRoutes(deps) {
  const { tagStore, driverManager, scanEngine, graphHistory } = deps;
  const router = require('express').Router();

  router.get('/dashboard', async (req, res) => {
    const tagList = tagStore.list();
    const settings = persistence.readJson('settings.json', { scanMs: 100, graphMaxPoints: 600, graphPens: [] });
    const graphPens = normalizePens(settings.graphPens, tagList);
    const hmi = normalizeHmi(
      settings.hmi?.screens?.length ? settings.hmi : defaultDemoHmi(),
      tagList,
      PUBLIC_ROOT
    );
    const qIds = (req.query.graphTags || '').split(',').filter(Boolean);
    const graphIds = qIds.length ? qIds : penTagIds(graphPens);
    const { ast } = parseProgram(programStore.readActive());
    const programTagRefs = ast ? collectProgramTagRefs(ast) : [];
    let serialPorts = [];
    try { serialPorts = await listSerialPorts(); } catch { /* ignore */ }
    res.json({
      runtime: scanEngine.status(),
      tags: tagList,
      tagCount: tagStore.count(),
      maxTags: MAX_TAGS,
      drivers: driverManager.list(),
      driverHealth: driverManager.health(),
      program: programStore.readActive(),
      activeProgram: programStore.activeRel(),
      stDir: programStore.ST_DIR,
      programs: programStore.listPrograms(),
      settings: { ...settings, graphPens, hmi },
      forces: tagList.filter((t) => t.forceInput || t.forceOutput),
      graph: graphHistory.getHistory(graphIds.length ? graphIds : null, 400),
      graphPens,
      programTagRefs,
      live: tagStore.liveSnapshot(),
      serialPorts,
      devicePresets: listPresets(),
      mongoLogger: mongoTagLogger.status(),
      projects: projectStore.listProjects(),
      fleet: {
        settings: registry.settings(),
        devices: registry.listDevices(),
        mqtt: getMqttCentralHub(registry).status(),
      },
    });
  });

  return router;
}

module.exports = { createDashboardRoutes };
