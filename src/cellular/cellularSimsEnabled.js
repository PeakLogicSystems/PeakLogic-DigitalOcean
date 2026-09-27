'use strict';

const { DEPLOYMENT_MODE } = require('../config');
const persistence = require('../persistence');

/** Cellular SIM management is on in cloud deployment or when explicitly enabled for local dev. */
function isCellularSimsEnabled() {
  if (DEPLOYMENT_MODE === 'cloud') return true;
  if (process.env.PEAKLOGIC_CELLULAR_SIMS === '1') return true;
  if (process.env.PEAKLOGIC_CLOUD_SIMS === '1') return true;
  const settings = persistence.readJson('settings.json', {});
  return settings.cellularSims?.enabled === true;
}

module.exports = { isCellularSimsEnabled };
