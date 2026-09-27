'use strict';

const { SimVendorAdapter } = require('./baseAdapter');
const { normalizeStatus } = require('../simRecordSchema');

const OAUTH_URL = 'https://thingspace.verizon.com/api/ts/v1/oauth2/token';
const M2M_BASE = 'https://thingspace.verizon.com/api/m2m/v1';

const VERIZON_DEFINITION = {
  id: 'verizon',
  displayName: 'Verizon ThingSpace',
  docsUrl: 'https://thingspace.verizon.com/documentation/apis/connectivity-management/getting-started.html',
  signupUrl: 'https://thingspace.verizon.com/',
  configSchema: [
    { key: 'appKey', label: 'ThingSpace App Key', required: true },
    { key: 'appSecret', label: 'ThingSpace App Secret', required: true, secret: true },
    { key: 'uwsUsername', label: 'Connectivity Management Username', required: true },
    { key: 'uwsPassword', label: 'Connectivity Management Password', required: true, secret: true },
    { key: 'accountName', label: 'Account Name', required: true, placeholder: '0000123456-00001' },
  ],
  notes: 'Verizon ThingSpace Connectivity Management API. OAuth app key/secret from My Keys; UWS credentials from Connectivity Management user setup.',
};

function mapVerizonStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (/active|ready|connected|live/.test(s)) return 'active';
  if (/suspend|paused/.test(s)) return 'paused';
  if (/deactiv|retired|terminated/.test(s)) return 'deactivated';
  if (/pending|preactive|inventory|new/.test(s)) return 'inactive';
  return normalizeStatus(raw);
}

function findIdentifier(identifiers, kind) {
  const list = Array.isArray(identifiers) ? identifiers : [];
  const hit = list.find((item) => String(item?.kind || '').toLowerCase() === kind);
  return hit?.identifier || hit?.id || null;
}

class VerizonAdapter extends SimVendorAdapter {
  constructor(credentials = {}, options = {}) {
    super('verizon', credentials, options);
    this.appKey = String(credentials.appKey || process.env.VERIZON_APP_KEY || '').trim();
    this.appSecret = String(credentials.appSecret || process.env.VERIZON_APP_SECRET || '').trim();
    this.uwsUsername = String(credentials.uwsUsername || process.env.VERIZON_UWS_USERNAME || '').trim();
    this.uwsPassword = String(credentials.uwsPassword || process.env.VERIZON_UWS_PASSWORD || '').trim();
    this.accountName = String(credentials.accountName || process.env.VERIZON_ACCOUNT_NAME || '').trim();
    this._oauthToken = null;
    this._sessionToken = null;
  }

  requireCredentials() {
    if (!this.appKey || !this.appSecret || !this.uwsUsername || !this.uwsPassword || !this.accountName) {
      throw Object.assign(new Error(
        'Verizon app key, app secret, UWS username/password, and account name required',
      ), { status: 400 });
    }
  }

  async getOAuthToken() {
    if (this._oauthToken) return this._oauthToken;
    this.requireCredentials();
    const basic = Buffer.from(`${this.appKey}:${this.appSecret}`, 'utf8').toString('base64');
    const data = await this.requestJson(OAUTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    this._oauthToken = data?.access_token || data?.token;
    if (!this._oauthToken) {
      throw Object.assign(new Error('Verizon OAuth token missing from response'), { status: 502 });
    }
    return this._oauthToken;
  }

  async getSessionToken() {
    if (this._sessionToken) return this._sessionToken;
    const oauth = await this.getOAuthToken();
    const data = await this.requestJson(`${M2M_BASE}/session/login`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oauth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ username: this.uwsUsername, password: this.uwsPassword }),
    });
    this._sessionToken = data?.sessionToken;
    if (!this._sessionToken) {
      throw Object.assign(new Error('Verizon session token missing from response'), { status: 502 });
    }
    return this._sessionToken;
  }

  async authHeaders(extra = {}) {
    const oauth = await this.getOAuthToken();
    const session = await this.getSessionToken();
    return {
      Authorization: `Bearer ${oauth}`,
      'VZ-M2M-Token': session,
      Accept: 'application/json',
      ...extra,
    };
  }

  async testConnection() {
    await this.listSimsPage();
    return { ok: true, message: 'Connected to Verizon ThingSpace Connectivity Management API' };
  }

  async listSimsPage() {
    const headers = await this.authHeaders({ 'Content-Type': 'application/json' });
    return this.requestJson(`${M2M_BASE}/devices/actions/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ accountName: this.accountName }),
    });
  }

  mapDevice(device) {
    const identifiers = device?.deviceIds || device?.profileIdentifiers || device?.identifiers || [];
    const iccid = findIdentifier(identifiers, 'iccid')
      || String(device?.iccid || '').trim()
      || null;
    if (!iccid) return null;

    const msisdn = findIdentifier(identifiers, 'msisdn')
      || findIdentifier(identifiers, 'mdn')
      || (device?.msisdn != null ? String(device.msisdn) : null);
    const imsi = findIdentifier(identifiers, 'imsi')
      || (device?.imsi != null ? String(device.imsi) : null);
    const vendorSimId = device?.id != null ? String(device.id) : iccid;
    const statusRaw = device?.connectionStatus
      || device?.provisioningStatus
      || device?.status
      || device?.carrierInformations?.[0]?.state
      || device?.carrierInformation?.state
      || null;
    const plan = device?.carrierInformations?.[0]?.servicePlan
      || device?.carrierInformation?.servicePlan
      || device?.servicePlan
      || null;

    return {
      iccid: String(iccid),
      imsi,
      msisdn,
      vendorSimId,
      status: mapVerizonStatus(statusRaw),
      plan: plan != null ? String(plan) : null,
      dataUsageMb: null,
      metadata: {
        accountName: this.accountName,
        connectionStatus: statusRaw,
        kind: device?.kind || null,
      },
    };
  }

  async listSims() {
    const page = await this.listSimsPage();
    const devices = page?.devices
      || page?.getDeviceListWithProfiles?.results?.[0]?.profiles
      || page?.results
      || [];
    const out = [];
    for (const device of devices) {
      const mapped = this.mapDevice(device);
      if (mapped) out.push(mapped);
    }
    return out;
  }

  deviceIdPayload(vendorSimId) {
    const id = String(vendorSimId).trim();
    if (/^89\d+$/.test(id) || id.length >= 18) {
      return { deviceIds: [{ kind: 'iccid', id }] };
    }
    if (/^\d+$/.test(id)) {
      return { deviceIds: [{ kind: 'deviceId', id }] };
    }
    return { deviceIds: [{ kind: 'iccid', id }] };
  }

  async postDeviceAction(action, vendorSimId) {
    const headers = await this.authHeaders({ 'Content-Type': 'application/json' });
    const body = {
      accountName: this.accountName,
      ...this.deviceIdPayload(vendorSimId),
    };
    return this.requestJson(`${M2M_BASE}/devices/actions/${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  async activateSim(vendorSimId) {
    await this.postDeviceAction('activate', vendorSimId);
    return { ok: true, status: 'active' };
  }

  async deactivateSim(vendorSimId) {
    await this.postDeviceAction('suspend', vendorSimId);
    return { ok: true, status: 'paused' };
  }

  async getUsage(vendorSimId) {
    const headers = await this.authHeaders({ 'Content-Type': 'application/json' });
    const body = {
      accountName: this.accountName,
      ...this.deviceIdPayload(vendorSimId),
    };
    try {
      const data = await this.requestJson(`${M2M_BASE}/devices/usage/actions/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const records = data?.usageHistory || data?.deviceUsageHistory || data?.results || [];
      const rec = Array.isArray(records) ? records[0] : null;
      const bytes = Number(rec?.dataUsage ?? rec?.bytesUsed ?? rec?.totalDataUsage ?? NaN);
      return {
        dataUsageMb: Number.isFinite(bytes)
          ? Math.round(bytes / (1024 * 1024) * 100) / 100
          : null,
      };
    } catch {
      return { dataUsageMb: null };
    }
  }
}

VerizonAdapter.vendorDefinition = VERIZON_DEFINITION;

module.exports = { VerizonAdapter, VERIZON_DEFINITION, mapVerizonStatus };
