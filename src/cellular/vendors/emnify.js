'use strict';

const { createStubVendorAdapter } = require('./stubVendor');

const EMNIFY_SCHEMA = [
  { key: 'applicationToken', label: 'Application Token', required: true, secret: true },
  { key: 'baseUrl', label: 'API Base URL', required: false, placeholder: 'https://cdn.emnify.net/api/v1' },
];

const EmnifyAdapter = createStubVendorAdapter({
  id: 'emnify',
  displayName: 'EMnify',
  docsUrl: 'https://docs.emnify.com/developers/api',
  signupUrl: 'https://www.emnify.com/',
  configSchema: EMNIFY_SCHEMA,
  notes: 'REST API with application token auth. Full adapter planned — use sync stub until implemented.',
});

module.exports = { EmnifyAdapter, EMNIFY_SCHEMA };
