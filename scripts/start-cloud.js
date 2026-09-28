'use strict';

/** Local cloud-mode dev: PEAKLOGIC_DEPLOYMENT=cloud + cloud sim APIs. */
process.env.PEAKLOGIC_DEPLOYMENT = 'cloud';
process.env.PEAKLOGIC_CLOUD_SIMS = '1';
require('../server.js');
