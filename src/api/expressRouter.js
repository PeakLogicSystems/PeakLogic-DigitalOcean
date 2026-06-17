'use strict';

const express = require('express');
const { createDashboardRoutes } = require('./routes/dashboard');
const { createProgramRoutes } = require('./routes/programs');
const { createRuntimeRoutes } = require('./routes/runtime');
const { createProjectRoutes } = require('./routes/project');
const { createTagRoutes } = require('./routes/tags');
const { createDriverRoutes } = require('./routes/drivers');
const { createSettingsRoutes } = require('./routes/settings');
const { createHmiRoutes } = require('./routes/hmi');
const { createMiscRoutes } = require('./routes/misc');
const { createFleetRoutes } = require('./routes/fleet');
const { createAlarmRoutes } = require('./routes/alarms');

function createExpressApi(deps) {
  const router = express.Router();
  router.use(createDashboardRoutes(deps));
  router.use(createProgramRoutes(deps));
  router.use(createRuntimeRoutes(deps));
  router.use(createProjectRoutes(deps));
  router.use(createTagRoutes(deps));
  router.use(createDriverRoutes(deps));
  router.use(createSettingsRoutes(deps));
  router.use(createHmiRoutes());
  router.use(createMiscRoutes(deps));
  router.use(createFleetRoutes(deps));
  router.use(createAlarmRoutes(deps));
  return router;
}

module.exports = { createExpressApi };
