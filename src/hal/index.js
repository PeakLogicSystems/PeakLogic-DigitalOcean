'use strict';

const { SimHalBackend } = require('./simBackend');
const { NativeHalBackend, nativeAvailable } = require('./nativeBackend');

function createHalBackend(cfg = {}) {
  const backend = (cfg.backend || 'sim').toLowerCase();
  if (backend === 'native' || backend === 'plugin') {
    return new NativeHalBackend(cfg);
  }
  return new SimHalBackend(cfg);
}

module.exports = {
  createHalBackend,
  nativeAvailable,
  SimHalBackend,
  NativeHalBackend,
};
