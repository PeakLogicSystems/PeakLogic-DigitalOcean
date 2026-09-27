'use strict';

const { HologramAdapter } = require('./hologram');
const { TwilioWirelessAdapter } = require('./twilioWireless');
const { AttAdapter } = require('./att');
const { VerizonAdapter } = require('./verizon');
const { TmobileAdapter } = require('./tmobile');
const { EmnifyAdapter } = require('./emnify');
const { SimetryAdapter } = require('./simetry');
const { createStubVendorAdapter } = require('./stubVendor');

const AerisAdapter = createStubVendorAdapter({
  id: 'aeris',
  displayName: 'Aeris',
  docsUrl: 'https://docs.aeris.com/',
  signupUrl: 'https://www.aeris.com/',
  configSchema: [
    { key: 'clientId', label: 'Client ID', required: true },
    { key: 'clientSecret', label: 'Client Secret', required: true, secret: true },
    { key: 'accountId', label: 'Account ID', required: false },
  ],
});

const OneNceAdapter = createStubVendorAdapter({
  id: '1nce',
  displayName: '1NCE',
  docsUrl: 'https://help.1nce.com/dev-hub/docs/api-reference',
  signupUrl: 'https://www.1nce.com/',
  configSchema: [
    { key: 'apiKey', label: 'API Key (OAuth client)', required: true, secret: true },
    { key: 'apiSecret', label: 'API Secret', required: true, secret: true },
  ],
});

const OnomondoAdapter = createStubVendorAdapter({
  id: 'onomondo',
  displayName: 'Onomondo',
  docsUrl: 'https://docs.onomondo.com/',
  signupUrl: 'https://onomondo.com/',
  configSchema: [
    { key: 'apiKey', label: 'API Key', required: true, secret: true },
  ],
});

const TelnyxAdapter = createStubVendorAdapter({
  id: 'telnyx',
  displayName: 'Telnyx IoT',
  docsUrl: 'https://developers.telnyx.com/docs/iot',
  signupUrl: 'https://telnyx.com/',
  configSchema: [
    { key: 'apiKey', label: 'API Key', required: true, secret: true },
  ],
});

/** @type {Map<string, typeof SimVendorAdapter>} */
const ADAPTERS = new Map([
  ['hologram', HologramAdapter],
  ['twilio', TwilioWirelessAdapter],
  ['att', AttAdapter],
  ['verizon', VerizonAdapter],
  ['tmobile', TmobileAdapter],
  ['emnify', EmnifyAdapter],
  ['simetry', SimetryAdapter],
  ['aeris', AerisAdapter],
  ['1nce', OneNceAdapter],
  ['onomondo', OnomondoAdapter],
  ['telnyx', TelnyxAdapter],
]);

const IMPLEMENTED = new Set(['hologram', 'twilio', 'att', 'verizon', 'tmobile', 'simetry']);

function listVendorDefinitions() {
  return [...ADAPTERS.entries()].map(([id, Adapter]) => {
    const def = Adapter.vendorDefinition || Adapter.definition || {};
    return {
      id,
      displayName: def.displayName || id,
      docsUrl: def.docsUrl || null,
      signupUrl: def.signupUrl || null,
      configSchema: def.configSchema || getDefaultSchema(id),
      implemented: IMPLEMENTED.has(id),
      stub: !IMPLEMENTED.has(id),
      notes: def.notes || null,
    };
  });
}

function getDefaultSchema(vendorId) {
  if (vendorId === 'hologram') {
    return [
      { key: 'apiKey', label: 'API Key', required: true, secret: true },
      { key: 'orgId', label: 'Organization ID', required: false },
    ];
  }
  if (vendorId === 'twilio') {
    return [
      { key: 'accountSid', label: 'Account SID', required: true },
      { key: 'authToken', label: 'Auth Token', required: true, secret: true },
    ];
  }
  return [];
}

function createVendorAdapter(vendorId, credentials = {}, options = {}) {
  const id = String(vendorId || '').trim().toLowerCase();
  const Adapter = ADAPTERS.get(id);
  if (!Adapter) {
    throw Object.assign(new Error(`Unknown cellular vendor: ${id}`), { status: 400 });
  }
  return new Adapter(credentials, options);
}

function isVendorImplemented(vendorId) {
  return IMPLEMENTED.has(String(vendorId || '').trim().toLowerCase());
}

module.exports = {
  listVendorDefinitions,
  createVendorAdapter,
  isVendorImplemented,
  IMPLEMENTED,
  ADAPTERS,
};
