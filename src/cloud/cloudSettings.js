'use strict';

const persistence = require('../persistence');

function defaultCloudSimsSettings(prev = {}) {
  return {
    enabled: prev.enabled === true || process.env.PEAKLOGIC_CLOUD_SIMS === '1',
  };
}

function normalizeCloudSimsSettings(input, prev = {}) {
  const base = defaultCloudSimsSettings(prev);
  if (input === null) return { enabled: false };
  if (input === undefined) return base;
  if (typeof input !== 'object') return base;
  const out = { ...base };
  if (Object.prototype.hasOwnProperty.call(input, 'enabled')) {
    out.enabled = input.enabled === true;
  }
  return out;
}

function readCloudSimsSettings() {
  const settings = persistence.readJson('settings.json', {});
  return normalizeCloudSimsSettings(settings.cloudSims, settings.cloudSims || {});
}

module.exports = { defaultCloudSimsSettings, normalizeCloudSimsSettings, readCloudSimsSettings };
