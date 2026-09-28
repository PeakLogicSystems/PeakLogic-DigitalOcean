'use strict';

/** Built-in cloud sim presets for website / sales demos (Dragino profile tag names). */

const WEBSITE_DEMO_TENANT = 'demo-tenant';

const WEBSITE_DEMO_SIMS = [
  {
    name: 'Website demo — JXCT soil ×4',
    tenantId: WEBSITE_DEMO_TENANT,
    type: 'jxct_soil',
    mqttDeviceId: 'dragino_jxct_x4',
    config: {
      intervalMs: 5000,
      sensorCount: 4,
      modbusPreset: 'jxct_npk_jxbs3001_dragino_x4',
    },
  },
  {
    name: 'Website demo — pool chemistry',
    tenantId: WEBSITE_DEMO_TENANT,
    type: 'pool_chemistry',
    mqttDeviceId: 'dragino_pool_chem',
    config: {
      intervalMs: 5000,
      modbusPreset: 'dfrobot_pool_chemistry_dragino',
    },
  },
];

module.exports = {
  WEBSITE_DEMO_TENANT,
  WEBSITE_DEMO_SIMS,
};
