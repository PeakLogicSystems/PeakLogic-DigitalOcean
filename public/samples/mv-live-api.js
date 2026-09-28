'use strict';
/**
 * Resolve PeakLogic REST root for facility / sample 3D pages.
 * Appliance and cloud SaaS both mount studio routes at `/api` (e.g. `/api/dashboard`).
 * Override: ?mvApi=… · window.MV_API_BASE · parent.PEAKLOGIC_API_BASE · postMessage apiBase
 */
(function initMvLiveApiRoot(global) {
  function fromQuery() {
    try {
      const q = new URLSearchParams(global.location.search || '');
      return String(q.get('mvApi') || q.get('apiBase') || '').trim();
    } catch {
      return '';
    }
  }
  function fromParent() {
    try {
      if (global.parent && global.parent !== global && global.parent.PEAKLOGIC_API_BASE) {
        return String(global.parent.PEAKLOGIC_API_BASE).trim();
      }
    } catch { /* cross-origin */ }
    return '';
  }
  function applyApiBase(next) {
    const clean = String(next || '').trim().replace(/\/$/, '');
    if (clean) global.MV_API_BASE = clean;
  }
  let root = String(global.MV_API_BASE || '').trim() || fromQuery() || fromParent();
  if (!root) root = '/api';
  applyApiBase(root);
  global.addEventListener('message', (ev) => {
    const data = ev?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'peaklogic-api-base' && typeof data.apiBase === 'string') {
      applyApiBase(data.apiBase);
    }
    if (data.type === 'mv-hmi-poll-config' && typeof data.apiBase === 'string') {
      applyApiBase(data.apiBase);
    }
  });

  /** Poll /dashboard and expose tag map — used by fleet 3D sample pages. */
  class MvLiveApi {
    constructor(opts = {}) {
      this.pollMs = Math.max(2000, Number(opts.pollMs) || 60000);
      this._timer = null;
      this._onTags = null;
      this._onError = null;
      this._onData = null;
    }

    onTags(fn) { this._onTags = fn; return this; }
    onError(fn) { this._onError = fn; return this; }
    onData(fn) { this._onData = fn; return this; }

    apiRoot() {
      return String(global.MV_API_BASE || '/api').replace(/\/$/, '');
    }

    async poll() {
      const root = this.apiRoot();
      try {
        const res = await fetch(`${root}/dashboard`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const tags = {};
        for (const t of (data.tags || data.tagSnapshot || [])) {
          if (t?.id) tags[t.id] = t.value ?? t.val;
        }
        this._onTags?.(tags, data);
        this._onData?.(data);
        return { tags, data };
      } catch (e) {
        this._onError?.(e);
        throw e;
      }
    }

    start() {
      this.stop();
      this.poll().catch(() => {});
      this._timer = setInterval(() => { this.poll().catch(() => {}); }, this.pollMs);
      return this;
    }

    stop() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
  }

  global.MvLiveApi = MvLiveApi;
}(typeof window !== 'undefined' ? window : globalThis));
