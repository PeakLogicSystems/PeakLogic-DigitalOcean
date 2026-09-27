'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const { DATA_DIR, ST_DIR } = require('../config');

const storage = new AsyncLocalStorage();

function runWithRequestContext(ctx, fn) {
  return storage.run(ctx, () => Promise.resolve(fn()));
}

function getRequestContext() {
  return storage.getStore() || null;
}

function activeDataDir() {
  return getRequestContext()?.dataDir || DATA_DIR;
}

function activeStDir() {
  return getRequestContext()?.stDir || ST_DIR;
}

function tenantPaths(tenantId) {
  const dataDir = path.join(DATA_DIR, 'tenants', tenantId);
  return {
    tenantId,
    dataDir,
    stDir: path.join(dataDir, 'st'),
  };
}

module.exports = {
  runWithRequestContext,
  getRequestContext,
  activeDataDir,
  activeStDir,
  tenantPaths,
};
