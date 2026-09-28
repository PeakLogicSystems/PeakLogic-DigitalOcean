'use strict';

/** SaaS detect_target entry — full Cloud Studio (same process as root server.js). */
process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'cloud';
process.env.PEAKLOGIC_PRODUCT = process.env.PEAKLOGIC_PRODUCT || 'mvp-suite';
if (!process.env.PORT && !process.env.PEAKLOGIC_PORT) {
  process.env.PORT = '3100';
}
require('../server.js');
