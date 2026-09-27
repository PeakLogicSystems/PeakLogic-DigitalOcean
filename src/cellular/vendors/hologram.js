'use strict';

const { SimVendorAdapter } = require('./baseAdapter');
const { normalizeStatus } = require('../simRecordSchema');

const BASE_URL = 'https://dashboard.hologram.io/api/1';

const HOLOGRAM_DEFINITION = {
  id: 'hologram',
  displayName: 'Hologram',
  docsUrl: 'https://docs.hologram.io/',
  signupUrl: 'https://hologram.io/',
  configSchema: [
    { key: 'apiKey', label: 'API Key', required: true, secret: true },
    { key: 'orgId', label: 'Organization ID', required: false },
  ],
};

function mapHologramState(state) {
  const s = String(state || '').toUpperCase();
  if (s.startsWith('LIVE')) return 'active';
  if (s.includes('PAUSE')) return 'paused';
  if (s.includes('INACTIVE') || s.includes('TEST')) return 'inactive';
  if (s.includes('DEAD') || s.includes('DEACTIV')) return 'deactivated';
  return normalizeStatus(state);
}

class HologramAdapter extends SimVendorAdapter {
  constructor(credentials = {}, options = {}) {
    super('hologram', credentials, options);
    this.apiKey = String(credentials.apiKey || process.env.HOLOGRAM_API_KEY || '').trim();
    this.orgId = String(credentials.orgId || process.env.HOLOGRAM_ORG_ID || '').trim();
  }

  authHeaders(extra = {}) {
    if (!this.apiKey) throw Object.assign(new Error('Hologram API key required'), { status: 400 });
    return {
      Authorization: this.basicAuthHeader('apikey', this.apiKey),
      Accept: 'application/json',
      ...extra,
    };
  }

  async testConnection() {
    const qs = this.orgId ? `?orgid=${encodeURIComponent(this.orgId)}&limit=1` : '?limit=1';
    await this.requestJson(`${BASE_URL}/devices${qs}`, { headers: this.authHeaders() });
    return { ok: true, message: 'Connected to Hologram API' };
  }

  async listSims() {
    const orgQs = this.orgId ? `orgid=${encodeURIComponent(this.orgId)}&` : '';
    const data = await this.requestJson(`${BASE_URL}/devices?${orgQs}limit=500`, {
      headers: this.authHeaders(),
    });
    const devices = data?.data || data?.devices || [];
    const out = [];
    for (const device of devices) {
      const links = device?.links?.cellular || device?.cellular_links || [];
      for (const link of links) {
        if (!link?.sim) continue;
        out.push({
          iccid: String(link.sim),
          imsi: link.imsi != null ? String(link.imsi) : null,
          msisdn: link.msisdn != null ? String(link.msisdn) : null,
          vendorSimId: link.id != null ? String(link.id) : null,
          vendorDeviceId: device.id != null ? String(device.id) : null,
          status: mapHologramState(link.state),
          plan: link.plan?.name || link.planid != null ? String(link.planid) : null,
          dataUsageMb: link.lastsession?.bytes != null
            ? Math.round(Number(link.lastsession.bytes) / (1024 * 1024) * 100) / 100
            : null,
          metadata: {
            apn: link.apn || null,
            zone: link.zone != null ? String(link.zone) : null,
            carrier: link.carrier != null ? String(link.carrier) : null,
            deviceName: device.name || null,
          },
        });
      }
    }
    return out;
  }

  async changeLinkState(vendorSimId, state) {
    const linkId = String(vendorSimId).trim();
    const orgQs = this.orgId ? `?orgid=${encodeURIComponent(this.orgId)}` : '';
    return this.requestJson(`${BASE_URL}/links/cellular/${encodeURIComponent(linkId)}/state${orgQs}`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ state }),
    });
  }

  async activateSim(vendorSimId) {
    await this.changeLinkState(vendorSimId, 'live');
    return { ok: true, status: 'active' };
  }

  async deactivateSim(vendorSimId) {
    await this.changeLinkState(vendorSimId, 'pause');
    return { ok: true, status: 'paused' };
  }
}

HologramAdapter.vendorDefinition = HOLOGRAM_DEFINITION;

module.exports = { HologramAdapter, HOLOGRAM_DEFINITION, mapHologramState };
