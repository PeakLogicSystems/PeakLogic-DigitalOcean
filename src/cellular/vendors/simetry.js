'use strict';

const crypto = require('crypto');
const { SimVendorAdapter } = require('./baseAdapter');
const { normalizeStatus } = require('../simRecordSchema');

const DEFAULT_BASE_URL = 'https://integrationapi.teal.global/api/v1';
const DEFAULT_CALLBACK_URL = 'https://localhost/peaklogic/simetry/callback';

const SIMETRY_DEFINITION = {
  id: 'simetry',
  displayName: 'Simetry',
  aliases: ['simmetry'],
  docsUrl: 'https://simetry.freshdesk.com/support/solutions/articles/154000189151-api-access-to-connectivity-marketplace',
  signupUrl: 'https://simetry.com/',
  configSchema: [
    { key: 'apiKey', label: 'API Key', required: true, secret: true },
    { key: 'apiSecret', label: 'API Secret', required: true, secret: true },
    { key: 'baseUrl', label: 'API Base URL', required: false, placeholder: DEFAULT_BASE_URL },
    { key: 'clientUuid', label: 'Client / Account UUID', required: false },
    { key: 'callbackUrl', label: 'Callback URL', required: false, placeholder: DEFAULT_CALLBACK_URL },
  ],
  notes: 'Simetry Connectivity Marketplace (Teal API). Operations are async — queued then polled via operation-result. Billing uses eSIM billing preview and invoice preview endpoints.',
};

function mapSimetryStatus(entry) {
  if (entry?.suspended === true) return 'paused';
  const ds = String(entry?.deviceStatus || '').toUpperCase();
  if (ds === 'STOPPED') return 'paused';
  if (ds === 'ONLINE') return 'active';
  if (ds === 'WAITING') return 'inactive';
  return normalizeStatus(entry?.deviceStatus);
}

function newRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

function bytesToMb(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round((n / (1024 * 1024)) * 100) / 100;
}

class SimetryAdapter extends SimVendorAdapter {
  constructor(credentials = {}, options = {}) {
    super('simetry', credentials, options);
    this.apiKey = String(credentials.apiKey || process.env.SIMETRY_API_KEY || '').trim();
    this.apiSecret = String(credentials.apiSecret || process.env.SIMETRY_API_SECRET || '').trim();
    this.baseUrl = String(credentials.baseUrl || process.env.SIMETRY_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    this.clientUuid = String(credentials.clientUuid || process.env.SIMETRY_CLIENT_UUID || '').trim();
    this.callbackUrl = String(credentials.callbackUrl || process.env.SIMETRY_CALLBACK_URL || DEFAULT_CALLBACK_URL).trim();
    this.pollMaxAttempts = Number(options.pollMaxAttempts || 30);
    this.pollDelayMs = Number(options.pollDelayMs || 500);
  }

  authHeaders(extra = {}) {
    if (!this.apiKey || !this.apiSecret) {
      throw Object.assign(new Error('Simetry API key and API secret required'), { status: 400 });
    }
    return {
      ApiKey: this.apiKey,
      ApiSecret: this.apiSecret,
      Accept: 'application/json',
      ...extra,
    };
  }

  async requestRaw(url, init = {}) {
    const res = await this.fetchImpl(url, init);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { res, data };
  }

  async requestJson(url, init = {}) {
    const { res, data } = await this.requestRaw(url, init);
    if (res.status === 102) {
      const err = Object.assign(new Error('Simetry operation still processing'), { status: 102, data });
      throw err;
    }
    if (!res.ok) {
      const msg = data?.message || data?.errorCode || data?.error || data?.detail || res.statusText || `HTTP ${res.status}`;
      throw Object.assign(new Error(String(msg)), { status: res.status, data });
    }
    if (data?.success === false) {
      const msg = data?.message || data?.errorCode || 'Simetry API request failed';
      throw Object.assign(new Error(String(msg)), { status: 502, data });
    }
    return data;
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async pollOperationResult(requestId) {
    const url = `${this.baseUrl}/operation-result?requestId=${encodeURIComponent(requestId)}`;
    for (let attempt = 0; attempt < this.pollMaxAttempts; attempt += 1) {
      try {
        const data = await this.requestJson(url, { headers: this.authHeaders() });
        if (Array.isArray(data?.entries)) return data;
        if (data?.success === true && data?.entries == null && attempt < this.pollMaxAttempts - 1) {
          await this.sleep(this.pollDelayMs);
          continue;
        }
        return data;
      } catch (err) {
        if (err.status === 102 && attempt < this.pollMaxAttempts - 1) {
          await this.sleep(this.pollDelayMs);
          continue;
        }
        throw err;
      }
    }
    throw Object.assign(new Error('Simetry operation timed out waiting for result'), { status: 504 });
  }

  buildQuery(params = {}) {
    const qs = new URLSearchParams();
    qs.set('requestId', params.requestId || newRequestId());
    qs.set('callbackUrl', this.callbackUrl);
    for (const [key, value] of Object.entries(params)) {
      if (key === 'requestId' || key === 'callbackUrl') continue;
      if (value != null && value !== '') qs.set(key, String(value));
    }
    return { query: qs.toString(), requestId: qs.get('requestId') };
  }

  async enqueueAndPoll(path, { method = 'GET', params = {}, body = null } = {}) {
    const { query, requestId } = this.buildQuery(params);
    const url = `${this.baseUrl}${path}?${query}`;
    const init = {
      method,
      headers: this.authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
    };
    if (body != null) init.body = JSON.stringify(body);
    await this.requestJson(url, init);
    return this.pollOperationResult(requestId);
  }

  mapEntry(entry) {
    const eid = entry?.eid != null ? String(entry.eid) : null;
    const iccid = entry?.iccid != null ? String(entry.iccid) : (entry?.bootstrapIccid != null ? String(entry.bootstrapIccid) : null);
    return {
      iccid: iccid || '',
      imsi: entry?.imsi != null ? String(entry.imsi) : (entry?.bootstrapImsi != null ? String(entry.bootstrapImsi) : null),
      eid,
      msisdn: entry?.msisdn != null ? String(entry.msisdn) : null,
      vendorSimId: eid || (entry?.id != null ? String(entry.id) : iccid),
      vendorDeviceId: entry?.id != null ? String(entry.id) : null,
      status: mapSimetryStatus(entry),
      plan: entry?.planName || entry?.planUuid || null,
      dataUsageMb: entry?.usage != null ? bytesToMb(entry.usage) : null,
      metadata: {
        deviceName: entry?.deviceName || null,
        deviceStatus: entry?.deviceStatus || null,
        suspended: entry?.suspended ?? null,
        planUuid: entry?.planUuid || null,
        clientUuid: entry?.clientUuid || null,
        deviceGroupName: entry?.deviceGroupName || null,
      },
    };
  }

  entryMatchesClient(entry) {
    if (!this.clientUuid) return true;
    return String(entry?.clientUuid || '') === this.clientUuid;
  }

  async testConnection() {
    await this.enqueueAndPoll('/esims', { params: { limit: 1 } });
    return { ok: true, message: 'Connected to Simetry Connectivity Marketplace API' };
  }

  async listSims() {
    const out = [];
    let offset = 0;
    const limit = 250;
    let hasMore = true;

    while (hasMore) {
      const result = await this.enqueueAndPoll('/esims', {
        params: { limit, offset },
      });
      const entries = Array.isArray(result?.entries) ? result.entries : [];
      for (const entry of entries) {
        if (!this.entryMatchesClient(entry)) continue;
        const mapped = this.mapEntry(entry);
        if (mapped.iccid) out.push(mapped);
      }
      hasMore = entries.length >= limit;
      offset += limit;
      if (offset > 10000) break;
    }

    return out;
  }

  async resolveEid(vendorSimId) {
    const id = String(vendorSimId || '').trim();
    if (!id) throw Object.assign(new Error('vendorSimId required'), { status: 400 });
    if (/^890340/.test(id)) return id;
    const sim = await this.getSim(id);
    if (sim?.eid) return sim.eid;
    if (sim?.vendorSimId && /^890340/.test(sim.vendorSimId)) return sim.vendorSimId;
    throw Object.assign(new Error(`Simetry eSIM not found for ${id}`), { status: 404 });
  }

  async setDataConsumption(vendorSimId, enable) {
    const eid = await this.resolveEid(vendorSimId);
    const path = enable ? '/esims/enable' : '/esims/disable';
    const result = await this.enqueueAndPoll(path, {
      method: 'POST',
      body: { entries: [eid] },
    });
    const entry = Array.isArray(result?.entries) ? result.entries[0] : null;
    if (entry?.success === false) {
      throw Object.assign(new Error(entry.errorMessage || `Simetry ${enable ? 'enable' : 'disable'} failed`), { status: 502, data: entry });
    }
    return { ok: true, status: enable ? 'active' : 'paused', eid };
  }

  async activateSim(vendorSimId) {
    return this.setDataConsumption(vendorSimId, true);
  }

  async deactivateSim(vendorSimId) {
    return this.setDataConsumption(vendorSimId, false);
  }

  async getUsage(vendorSimId) {
    const eid = await this.resolveEid(vendorSimId);
    const now = new Date();
    const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
    const periodEnd = now.toISOString().slice(0, 19).replace('T', ' ');

    const result = await this.enqueueAndPoll('/data-consumption/data', {
      params: {
        eid,
        dataType: 'MONTHLY',
        periodStart,
        periodEnd,
        limit: 100,
        offset: 0,
      },
    });

    const entries = Array.isArray(result?.entries) ? result.entries : [];
    const totalBytes = entries
      .filter((row) => String(row?.eid || '') === eid)
      .reduce((sum, row) => sum + (Number(row?.usage) || 0), 0);

    return { dataUsageMb: bytesToMb(totalBytes) };
  }

  formatTealPeriod(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) {
      throw Object.assign(new Error('invalid billing period date'), { status: 400 });
    }
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  async listPlans() {
    const out = [];
    let offset = 0;
    const limit = 250;
    let hasMore = true;

    while (hasMore) {
      const params = { limit, offset };
      if (this.clientUuid) params.clientUuid = this.clientUuid;
      const result = await this.enqueueAndPoll('/plans', { params });
      const entries = Array.isArray(result?.entries) ? result.entries : [];
      out.push(...entries);
      hasMore = entries.length >= limit;
      offset += limit;
      if (offset > 10000) break;
    }

    return out;
  }

  mapBillingPreview(entry) {
    const planLines = Array.isArray(entry?.entries) ? entry.entries : [];
    const usageBytes = Number(entry?.totalEsimUsage)
      || planLines.reduce((sum, line) => sum + (Number(line?.usage) || 0), 0);
    const planAmount = planLines.reduce((sum, line) => sum + (Number(line?.total) || 0), 0);
    const serviceFee = Number(entry?.esimServiceFee);
    const total = Number(entry?.total);
    const amount = Number.isFinite(total)
      ? total
      : (Number.isFinite(planAmount) ? planAmount : null);

    return {
      eid: entry?.eid != null ? String(entry.eid) : null,
      success: entry?.success !== false,
      errorMessage: entry?.errorMessage || null,
      usageBytes: Number.isFinite(usageBytes) ? usageBytes : 0,
      usageMb: bytesToMb(usageBytes),
      amount: Number.isFinite(amount) ? amount : null,
      serviceFee: Number.isFinite(serviceFee) ? serviceFee : null,
      currency: 'USD',
      planLines: planLines.map((line) => ({
        planUuid: line?.planUuid || null,
        planName: line?.planName || null,
        planRate: line?.planRate ?? null,
        usageBytes: Number(line?.usage) || 0,
        usageMb: bytesToMb(line?.usage),
        amount: line?.total ?? null,
      })),
    };
  }

  async getEsimBillingPreview({ periodStart, periodEnd, eids }) {
    const entries = (eids || []).map((e) => String(e).trim()).filter(Boolean);
    if (!entries.length) return [];

    const params = { periodStart, periodEnd };
    if (this.clientUuid) params.clientUuid = this.clientUuid;

    const result = await this.enqueueAndPoll('/data-consumption/generate-esim-billing-preview', {
      method: 'POST',
      params,
      body: { entries },
    });

    const rows = Array.isArray(result?.entries) ? result.entries : [];
    return rows.map((entry) => this.mapBillingPreview(entry));
  }

  async getInvoicePreview({ period, clientUuid }) {
    const cu = String(clientUuid || this.clientUuid || '').trim();
    if (!cu) {
      throw Object.assign(new Error('Simetry clientUuid required for invoice preview'), { status: 400 });
    }
    const periodValue = period || this.formatTealPeriod(new Date());
    const params = { period: periodValue, clientUuid: cu };

    try {
      const result = await this.enqueueAndPoll('/data-consumption/generate-billing-invoice-preview', {
        method: 'POST',
        params,
      });
      return Array.isArray(result?.entries) ? result.entries[0] : result;
    } catch (err) {
      const result = await this.enqueueAndPoll('/data-consumption/generate-invoice-preview', {
        method: 'POST',
        params,
      });
      return Array.isArray(result?.entries) ? result.entries[0] : result;
    }
  }
}

SimetryAdapter.vendorDefinition = SIMETRY_DEFINITION;

module.exports = { SimetryAdapter, SIMETRY_DEFINITION, mapSimetryStatus };
