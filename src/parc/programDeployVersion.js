'use strict';

const persistence = require('../persistence');

const FILE = 'program-deploy.json';

function loadProgramDeployStore() {
  const raw = persistence.readJson(FILE, null);
  if (!raw || typeof raw !== 'object') return { devices: {} };
  return {
    devices: raw.devices && typeof raw.devices === 'object' ? raw.devices : {},
  };
}

function saveProgramDeployStore(store) {
  persistence.writeJson(FILE, store);
}

/**
 * Record last deploy / skip-check result for a Parc device (CRC fingerprint + program path).
 * @param {string} deviceId
 * @param {object} row
 */
function recordProgramDeployVersion(deviceId, row = {}) {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  const store = loadProgramDeployStore();
  const prev = store.devices[id] || {};
  const next = {
    ...prev,
    ...row,
    deviceId: id,
    checkedAt: new Date().toISOString(),
  };
  if (row.deployed === true) next.deployedAt = new Date().toISOString();
  store.devices[id] = next;
  saveProgramDeployStore(store);
  return next;
}

function getProgramDeployVersion(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  return loadProgramDeployStore().devices[id] || null;
}

module.exports = {
  loadProgramDeployStore,
  recordProgramDeployVersion,
  getProgramDeployVersion,
};
