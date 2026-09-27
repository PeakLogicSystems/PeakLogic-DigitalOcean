'use strict';

const { DEPLOYMENT_MODE } = require('../config');
const persistence = require('../persistence');

/** Cloud sim management is on in cloud deployment or when explicitly enabled for local dev. */
function isCloudSimsEnabled() {
  if (DEPLOYMENT_MODE === 'cloud') return true;
  if (process.env.PEAKLOGIC_CLOUD_SIMS === '1') return true;
  const settings = persistence.readJson('settings.json', {});
  return settings.cloudSims?.enabled === true;
}

module.exports = { isCloudSimsEnabled };
