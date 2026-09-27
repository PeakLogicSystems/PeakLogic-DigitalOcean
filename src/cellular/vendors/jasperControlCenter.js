'use strict';

const { SimVendorAdapter } = require('./baseAdapter');
const { normalizeStatus } = require('../simRecordSchema');

const DEFAULT_API_PATH = '/rws/api/v1';

function mapJasperStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIVATED') return 'active';
  if (s === 'ACTIVATION_READY' || s === 'INVENTORY') return 'inactive';
  if (s === 'TEST_READY') return 'pending';
  if (s === 'DEACTIVATED' || s === 'RETIRED') return 'deactivated';
  if (s.includes('SUSPEND')) return 'suspended';
  return normalizeStatus(status);
}

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

/**
 * Shared Cisco IoT Control Center (Jasper) REST adapter used by AT&T and T-Mobile portals.
 */
class JasperControlCenterAdapter extends SimVendorAdapter {
  constructor(vendorId, credentials = {}, options = {}) {
    super(vendorId, credentials, options);
    this.baseUrl = trimTrailingSlash(
      credentials.baseUrl
      || process.env[`${String(vendorId).toUpperCase()}_CONTROL_CENTER_BASE_URL`]
      || '',
    );
    this.username = String(
      credentials.username
      || process.env[`${String(vendorId).toUpperCase()}_CONTROL_CENTER_USERNAME`]
      || '',
    ).trim();
    this.apiKey = String(
      credentials.apiKey
      || process.env[`${String(vendorId).toUpperCase()}_CONTROL_CENTER_API_KEY`]
      || '',
    ).trim();
    this.accountId = String(
      credentials.accountId
      || process.env[`${String(vendorId).toUpperCase()}_CONTROL_CENTER_ACCOUNT_ID`]
      || '',
    ).trim();
  }

  apiRoot() {
    if (!this.baseUrl) {
      throw Object.assign(new Error('Control Center base URL required'), { status: 400 });
    }
    if (this.baseUrl.includes('/rws/api')) return this.baseUrl;
    return `${this.baseUrl}${DEFAULT_API_PATH}`;
  }

  authHeaders(extra = {}) {
    if (!this.username || !this.apiKey) {
      throw Object.assign(new Error('Control Center username and API key required'), { status: 400 });
    }
    return {
      Authorization: this.basicAuthHeader(this.username, this.apiKey),
      Accept: 'application/json',
      ...extra,
    };
  }

  async testConnection() {
    const root = this.apiRoot();
    if (this.accountId) {
      await this.requestJson(
        `${root}/devices?accountId=${encodeURIComponent(this.accountId)}&modifiedSince=2000-01-01T00%3A00%3A00%2B00%3A00&pageSize=1&pageNumber=1`,
        { headers: this.authHeaders() },
      );
    } else {
      await this.requestJson(`${root}/echo`, { headers: this.authHeaders() });
    }
    return { ok: true, message: 'Connected to Control Center API' };
  }

  async searchDevicesPage(pageNumber = 1, pageSize = 50) {
    if (!this.accountId) {
      throw Object.assign(new Error('Control Center account ID required to list SIMs'), { status: 400 });
    }
    const root = this.apiRoot();
    const qs = new URLSearchParams({
      accountId: this.accountId,
      modifiedSince: '2000-01-01T00:00:00+00:00',
      pageSize: String(pageSize),
      pageNumber: String(pageNumber),
    });
    return this.requestJson(`${root}/devices?${qs.toString()}`, { headers: this.authHeaders() });
  }

  mapDevice(device) {
    const iccid = String(device?.iccid || '').trim();
    if (!iccid) return null;
    const usageBytes = Number(device?.ctdDataUsage ?? device?.dataUsage ?? NaN);
    return {
      iccid,
      imsi: device.imsi != null ? String(device.imsi) : null,
      msisdn: device.msisdn != null ? String(device.msisdn) : null,
      vendorSimId: iccid,
      status: mapJasperStatus(device.status),
      plan: device.ratePlan != null ? String(device.ratePlan) : null,
      dataUsageMb: Number.isFinite(usageBytes)
        ? Math.round(usageBytes / (1024 * 1024) * 100) / 100
        : null,
      metadata: {
        communicationPlan: device.communicationPlan || null,
        imei: device.imei || null,
        deviceId: device.deviceID || device.deviceId || null,
        accountId: this.accountId || null,
      },
    };
  }

  async listSims() {
    const out = [];
    let pageNumber = 1;
    let lastPage = false;

    while (!lastPage) {
      const page = await this.searchDevicesPage(pageNumber, 50);
      const devices = page?.devices || [];
      for (const device of devices) {
        const mapped = this.mapDevice(device);
        if (mapped) out.push(mapped);
      }
      const totalPages = Number(page?.lastPage ?? page?.totalPages ?? 0);
      if (totalPages > 0) {
        lastPage = pageNumber >= totalPages;
      } else {
        lastPage = devices.length < 50;
      }
      pageNumber += 1;
      if (pageNumber > 200) break;
    }

    return out;
  }

  async editDeviceStatus(iccid, status) {
    const root = this.apiRoot();
    return this.requestJson(`${root}/devices/${encodeURIComponent(String(iccid).trim())}`, {
      method: 'PUT',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
  }

  async activateSim(vendorSimId) {
    await this.editDeviceStatus(vendorSimId, 'ACTIVATED');
    return { ok: true, status: 'active' };
  }

  async deactivateSim(vendorSimId) {
    await this.editDeviceStatus(vendorSimId, 'DEACTIVATED');
    return { ok: true, status: 'deactivated' };
  }

  async getUsage(vendorSimId) {
    const iccid = String(vendorSimId).trim();
    const root = this.apiRoot();
    const data = await this.requestJson(`${root}/devices/${encodeURIComponent(iccid)}/ctdUsages`, {
      headers: this.authHeaders(),
    });
    const bytes = Number(data?.ctdDataUsage ?? NaN);
    return {
      dataUsageMb: Number.isFinite(bytes)
        ? Math.round(bytes / (1024 * 1024) * 100) / 100
        : null,
    };
  }
}

module.exports = {
  JasperControlCenterAdapter,
  mapJasperStatus,
  DEFAULT_API_PATH,
};
