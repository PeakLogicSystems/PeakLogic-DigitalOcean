#!/usr/bin/env node
'use strict';

/** Apply production early-warning PdM/inference/CMMS profile to data/settings.json */
const persistence = require('../src/persistence');
const { applyProductionEarlyWarningProfile } = require('../src/settings/pdmProductionProfile');

const prev = persistence.readJson('settings.json', {});
const next = applyProductionEarlyWarningProfile(prev);
persistence.writeJson('settings.json', next);
console.log('[pdm] Applied production early-warning profile');
console.log(JSON.stringify({
  inference: next.inference,
  pdm: {
    buildEnabled: next.pdm.buildEnabled,
    failureThreshold: next.pdm.failureThreshold,
    forecastMethods: next.pdm.forecastMethods,
  },
  cmms: next.cmms,
}, null, 2));
