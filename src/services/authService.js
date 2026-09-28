'use strict';

const { tenantStore } = require('../tenants/tenantStore');

module.exports = {
  getTenantById(tenantId) {
    return tenantStore.getTenant(tenantId);
  },

  listNotificationRecipients(tenantId, alarmLevel, alarmContext = null, now = new Date()) {
    return tenantStore.listNotificationRecipients(tenantId, alarmLevel, alarmContext, now);
  },
};
