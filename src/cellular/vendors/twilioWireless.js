'use strict';

const { SimVendorAdapter } = require('./baseAdapter');
const { normalizeStatus } = require('../simRecordSchema');

const BASE_URL = 'https://supersim.twilio.com/v1';

const TWILIO_DEFINITION = {
  id: 'twilio',
  displayName: 'Twilio Super SIM',
  docsUrl: 'https://www.twilio.com/docs/iot/supersim-api',
  signupUrl: 'https://www.twilio.com/iot/supersim',
  configSchema: [
    { key: 'accountSid', label: 'Account SID', required: true },
    { key: 'authToken', label: 'Auth Token', required: true, secret: true },
  ],
};

function mapTwilioStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active' || s === 'ready') return 'active';
  if (s === 'inactive' || s === 'new') return 'inactive';
  if (s === 'scheduled' || s === 'updating') return 'pending';
  return normalizeStatus(status);
}

class TwilioWirelessAdapter extends SimVendorAdapter {
  constructor(credentials = {}, options = {}) {
    super('twilio', credentials, options);
    this.accountSid = String(credentials.accountSid || process.env.TWILIO_ACCOUNT_SID || '').trim();
    this.authToken = String(credentials.authToken || process.env.TWILIO_AUTH_TOKEN || '').trim();
  }

  authHeaders(extra = {}) {
    if (!this.accountSid || !this.authToken) {
      throw Object.assign(new Error('Twilio Account SID and Auth Token required'), { status: 400 });
    }
    return {
      Authorization: this.basicAuthHeader(this.accountSid, this.authToken),
      Accept: 'application/json',
      ...extra,
    };
  }

  async testConnection() {
    await this.requestJson(`${BASE_URL}/Sims?PageSize=1`, { headers: this.authHeaders() });
    return { ok: true, message: 'Connected to Twilio Super SIM API' };
  }

  async listSimsPage(pageUrl) {
    const url = pageUrl || `${BASE_URL}/Sims?PageSize=50`;
    return this.requestJson(url, { headers: this.authHeaders() });
  }

  async listSims() {
    const out = [];
    let nextUrl = null;
    let page = await this.listSimsPage();
    const usageBySid = await this.fetchUsageBySimSid();

    do {
      const sims = page?.sims || [];
      for (const sim of sims) {
        const sid = sim.sid || sim.Sid;
        const usage = usageBySid.get(sid) || null;
        out.push({
          iccid: String(sim.iccid || sim.Iccid || ''),
          imsi: sim.imsi != null ? String(sim.imsi) : null,
          msisdn: sim.msisdn != null ? String(sim.msisdn) : null,
          vendorSimId: sid ? String(sid) : null,
          status: mapTwilioStatus(sim.status || sim.Status),
          plan: sim.fleet_sid || sim.fleetSid || null,
          dataUsageMb: usage,
          metadata: {
            uniqueName: sim.unique_name || sim.uniqueName || null,
            accountSid: sim.account_sid || sim.accountSid || null,
          },
        });
      }
      nextUrl = page?.meta?.next_page_url || null;
      if (nextUrl) page = await this.listSimsPage(nextUrl);
    } while (nextUrl);

    return out.filter((s) => s.iccid);
  }

  async fetchUsageBySimSid() {
    const map = new Map();
    try {
      let nextUrl = `${BASE_URL}/UsageRecords?Group=sim&Granularity=all&PageSize=50`;
      while (nextUrl) {
        const page = await this.requestJson(nextUrl, { headers: this.authHeaders() });
        for (const rec of page?.usage_records || []) {
          const sid = rec.sim_sid || rec.simSid;
          if (!sid) continue;
          const upload = Number(rec.data_upload || rec.dataUpload || 0);
          const download = Number(rec.data_download || rec.dataDownload || 0);
          const totalBytes = upload + download;
          map.set(sid, Math.round(totalBytes / (1024 * 1024) * 100) / 100);
        }
        nextUrl = page?.meta?.next_page_url || null;
      }
    } catch {
      /* usage is optional during sync */
    }
    return map;
  }

  async updateSimStatus(vendorSimId, status) {
    const sid = encodeURIComponent(String(vendorSimId).trim());
    return this.requestJson(`${BASE_URL}/Sims/${sid}`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      body: new URLSearchParams({ Status: status }).toString(),
    });
  }

  async activateSim(vendorSimId) {
    await this.updateSimStatus(vendorSimId, 'active');
    return { ok: true, status: 'active' };
  }

  async deactivateSim(vendorSimId) {
    await this.updateSimStatus(vendorSimId, 'inactive');
    return { ok: true, status: 'inactive' };
  }

  async getUsage(vendorSimId) {
    const sid = encodeURIComponent(String(vendorSimId).trim());
    const page = await this.requestJson(
      `${BASE_URL}/UsageRecords?Sim=${sid}&Granularity=all&PageSize=1`,
      { headers: this.authHeaders() },
    );
    const rec = (page?.usage_records || [])[0];
    if (!rec) return { dataUsageMb: null };
    const totalBytes = Number(rec.data_upload || 0) + Number(rec.data_download || 0);
    return { dataUsageMb: Math.round(totalBytes / (1024 * 1024) * 100) / 100 };
  }
}

TwilioWirelessAdapter.vendorDefinition = TWILIO_DEFINITION;

module.exports = { TwilioWirelessAdapter, TWILIO_DEFINITION, mapTwilioStatus };
