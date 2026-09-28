'use strict';

const express = require('express');
const { sysLogRequestContext } = require('./middleware/sysLogContext');
const { createDashboardRoutes } = require('./routes/dashboard');
const { createProgramRoutes } = require('./routes/programs');
const { createRuntimeRoutes } = require('./routes/runtime');
const { createProjectRoutes } = require('./routes/project');
const { createProjectHubRoutes } = require('./routes/projectHub');
const { createTagRoutes } = require('./routes/tags');
const { createDriverRoutes } = require('./routes/drivers');
const { createSettingsRoutes } = require('./routes/settings');
const { createHmiRoutes } = require('./routes/hmi');
const { createMiscRoutes } = require('./routes/misc');
const { createParcRoutes } = require('./routes/parc');
const { createAlarmRoutes } = require('./routes/alarms');
const { createReportRoutes } = require('./routes/reports');
const { createPdmRoutes } = require('./routes/pdm');
const { createUserRoutes } = require('./routes/users');
const { createHardwareHistoryRoutes } = require('./routes/hardwareHistory');
const { createSysLogRoutes } = require('./routes/sysLog');
const { createMqttBrokerLogRoutes } = require('./routes/mqttBrokerLog');
const { createIoMapRoutes } = require('./routes/ioMap');
const { createCloudSimRoutes } = require('./routes/cloudSims');
const { createCellularSimRoutes } = require('./routes/cellularSims');
let createMessagingRoutes;
try {
  ({ createMessagingRoutes } = require('./routes/messaging'));
} catch (err) {
  console.warn('[api] messaging routes unavailable:', err.message);
  createMessagingRoutes = () => express.Router();
}
const { createFacilityDrawRoutes } = require('../../facility-draw/src/api/facilityDrawRoutes');
const { createTenantAuthRoutes } = require('./routes/tenantAuth');
const { createTenantFleetRoutes } = require('./routes/tenantFleet');
const { createMqttConsoleRoutes } = require('./routes/mqttConsole');
const { createCloudSiteRoutes } = require('./routes/cloudSites');
const { createCmmsRoutes } = require('./routes/cmms');
const { createTenantWorkspaceMiddleware } = require('../tenants/tenantWorkspaceMiddleware');

function createExpressApi(deps) {
  const router = express.Router();
  const workspaceGate = createTenantWorkspaceMiddleware();
  const studio = express.Router();
  studio.use(workspaceGate);
  studio.use(createDashboardRoutes(deps));
  studio.use(createProgramRoutes(deps));
  studio.use(createRuntimeRoutes(deps));
  studio.use(createProjectRoutes(deps));
  studio.use(createProjectHubRoutes(deps));
  studio.use(createTagRoutes(deps));
  studio.use(createDriverRoutes(deps));
  studio.use(createSettingsRoutes(deps));
  studio.use(createHmiRoutes(deps));
  studio.use(createMiscRoutes(deps));
  studio.use(createParcRoutes(deps));
  studio.use(createAlarmRoutes(deps));
  studio.use(createHardwareHistoryRoutes(deps));
  studio.use(createIoMapRoutes(deps));
  studio.use(createFacilityDrawRoutes());

  router.use(sysLogRequestContext);
  router.use(createTenantAuthRoutes());
  router.use(createTenantFleetRoutes());
  router.use(createMqttConsoleRoutes());
  router.use(createCloudSiteRoutes());
  router.use(createCmmsRoutes());
  router.use(studio);
  router.use(createReportRoutes());
  router.use(createPdmRoutes());
  router.use(createSysLogRoutes());
  router.use(createMqttBrokerLogRoutes());
  router.use(createUserRoutes());
  router.use(createCloudSimRoutes());
  router.use(createCellularSimRoutes());
  router.use(createMessagingRoutes());
  return router;
}

module.exports = { createExpressApi };
