'use strict';

/**
 * @typedef {object} VendorSimSnapshot
 * @property {string} iccid
 * @property {string|null} [imsi]
 * @property {string|null} [eid]
 * @property {string|null} [msisdn]
 * @property {string|null} [vendorSimId]
 * @property {string|null} [vendorDeviceId]
 * @property {string} [status]
 * @property {number|null} [dataUsageMb]
 * @property {string|null} [plan]
 * @property {object} [metadata]
 */

class SimVendorAdapter {
  /** @param {string} vendorId */
  constructor(vendorId, credentials = {}, options = {}) {
    this.vendorId = vendorId;
    this.credentials = credentials || {};
    this.options = options || {};
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  /** @returns {Promise<{ ok: boolean, message?: string, detail?: object }>} */
  async testConnection() {
    throw new Error('testConnection not implemented');
  }

  /** @returns {Promise<VendorSimSnapshot[]>} */
  async listSims() {
    throw new Error('listSims not implemented');
  }

  /** @param {string} vendorSimId */
  async getSim(vendorSimId) {
    const sims = await this.listSims();
    return sims.find((s) => s.vendorSimId === vendorSimId || s.iccid === vendorSimId) || null;
  }

  /** @param {string} vendorSimId */
  async activateSim(vendorSimId) {
    throw new Error('activateSim not implemented');
  }

  /** @param {string} vendorSimId */
  async deactivateSim(vendorSimId) {
    throw new Error('deactivateSim not implemented');
  }

  /** @param {string} vendorSimId */
  async getUsage(vendorSimId) {
    const sim = await this.getSim(vendorSimId);
    return { dataUsageMb: sim?.dataUsageMb ?? null };
  }

  /**
   * @param {string} url
   * @param {RequestInit} init
   */
  async requestJson(url, init = {}) {
    const res = await this.fetchImpl(url, init);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error || data?.message || data?.detail || res.statusText || `HTTP ${res.status}`;
      throw Object.assign(new Error(String(msg)), { status: res.status, data });
    }
    return data;
  }

  basicAuthHeader(username, password) {
    const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
    return `Basic ${token}`;
  }
}

module.exports = { SimVendorAdapter };
