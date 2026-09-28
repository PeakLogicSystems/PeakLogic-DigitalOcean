'use strict';

/** Production multi-tenant SaaS entry (DigitalOcean droplet port 3100). */
process.env.PEAKLOGIC_DEPLOYMENT = process.env.PEAKLOGIC_DEPLOYMENT || 'cloud';
process.env.PEAKLOGIC_PRODUCT = process.env.PEAKLOGIC_PRODUCT || 'cloud';
if (!process.env.PORT && !process.env.PEAKLOGIC_PORT) {
  process.env.PORT = '3100';
}
require('../server.js');
