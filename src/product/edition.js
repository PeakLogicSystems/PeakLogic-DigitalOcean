'use strict';

/**
 * A product "edition" describes how this deployment identifies itself in the
 * UI and /health payload. Only one edition exists today (DigitalOcean/MongoDB);
 * the lookup-by-key shape is kept so a future edition can be added without
 * changing every call site that reads EDITION.
 * @type {Record<string, { id: string, product: string, label: string, shortLabel: string, tagline: string, platform: string }>}
 */
const EDITIONS = {
  'peaklogic-cloud': {
    id: 'peaklogic-cloud',
    product: 'peaklogic-cloud',
    label: 'PeakLogic Cloud',
    shortLabel: 'PeakLogic',
    tagline: 'Multi-tenant plant monitoring — locations, systems, devices, and CMMS integration from the cloud.',
    platform: 'digitalocean',
  },
};

const DEFAULT_EDITION_KEY = 'peaklogic-cloud';

function resolveEditionKey() {
  return String(process.env.PEAKLOGIC_EDITION || DEFAULT_EDITION_KEY).trim();
}

function getEdition(key = resolveEditionKey()) {
  return EDITIONS[key] || EDITIONS[DEFAULT_EDITION_KEY];
}

module.exports = {
  EDITIONS,
  getEdition,
  resolveEditionKey,
};
