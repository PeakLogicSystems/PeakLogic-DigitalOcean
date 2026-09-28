'use strict';

const tenantRuntime = require('./tenantRuntime');

function bindStore(getRuntime, storeName) {
  return new Proxy({}, {
    get(_target, prop) {
      const rt = getRuntime();
      if (!rt) {
        throw new Error(`Studio runtime unavailable${storeName ? ` (${storeName})` : ''}`);
      }
      const store = rt[storeName];
      const val = store[prop];
      if (typeof val === 'function') return val.bind(store);
      return val;
    },
  });
}

function createTenantRuntimeProxies() {
  const getActive = () => tenantRuntime.getActiveRuntime();
  return {
    tagStore: bindStore(getActive, 'tagStore'),
    driverManager: bindStore(getActive, 'driverManager'),
    graphHistory: bindStore(getActive, 'graphHistory'),
    scanEngine: bindStore(getActive, 'scanEngine'),
  };
}

module.exports = { createTenantRuntimeProxies };
