'use strict';

const { SimVendorAdapter } = require('./baseAdapter');

/**
 * Factory for vendor adapters that are registered but not yet fully implemented.
 * @param {object} def
 */
function createStubVendorAdapter(def) {
  class StubAdapter extends SimVendorAdapter {
    static definition = def;

    constructor(credentials = {}, options = {}) {
      super(def.id, credentials, options);
    }

    async testConnection() {
      const missing = (def.configSchema || [])
        .filter((f) => f.required && !this.credentials[f.key])
        .map((f) => f.key);
      if (missing.length) {
        return { ok: false, message: `Missing credentials: ${missing.join(', ')}` };
      }
      return {
        ok: false,
        message: `${def.displayName} adapter is registered but not yet implemented in PeakLogic`,
        stub: true,
      };
    }

    async listSims() {
      throw Object.assign(
        new Error(`${def.displayName} sync is not implemented yet — adapter stub only`),
        { status: 501, stub: true },
      );
    }

    async activateSim() {
      throw Object.assign(new Error(`${def.displayName} activate not implemented`), { status: 501, stub: true });
    }

    async deactivateSim() {
      throw Object.assign(new Error(`${def.displayName} deactivate not implemented`), { status: 501, stub: true });
    }
  }
  StubAdapter.vendorDefinition = def;
  return StubAdapter;
}

module.exports = { createStubVendorAdapter };
