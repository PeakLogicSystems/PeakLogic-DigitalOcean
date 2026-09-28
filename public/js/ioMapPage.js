'use strict';

(function () {
  const core = window.PeaklogicCore || {};
  const $ = core.$ || ((id) => document.getElementById(id));
  const esc = core.esc || ((s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));
  const POLL_MS = 800;
  const liveIoPref = () => window.PeaklogicLiveIoUpdate || {};
  const ioTs = () => window.PeaklogicIoTimestamp || {};

  let pollTimer = null;
  let lastTags = [];
  let lastPointSig = '';
  let lastBindingsConfigSig = '';

  function bindingsConfigSig(data) {
    const sortJoin = (ids) => [...ids].sort().join('\0');
    return [
      sortJoin((data?.screens || []).map((s) => s.id)),
      sortJoin((data?.roomScreens || []).map((r) => r.screenId)),
      sortJoin((data?.wiredTags || []).map((t) => t.id)),
      String((data?.bindings || []).length),
      sortJoin((data?.points || []).map((p) => p.id)),
    ].join('|');
  }
  let lastRuntime = {};

  function readUpdatePref() {
    return liveIoPref().readLiveIoUpdatePref?.() ?? true;
  }

  function writeUpdatePref(on) {
    liveIoPref().writeLiveIoUpdatePref?.(on);
  }

  function isUpdateEnabled() {
    const cb = $('io-map-live-update');
    if (cb) return cb.checked;
    return readUpdatePref();
  }

  function shouldRefreshIoMap(runtime) {
    return liveIoPref().shouldUpdateLiveIo?.(runtime, isUpdateEnabled()) ?? true;
  }

  function pointSignature(points) {
    return (points || []).map((p) => p.id).join('\0');
  }

  function formatTagName(tag) {
    const fmt = window.PeaklogicTagDisplay?.formatTag;
    return fmt ? fmt(tag, lastTags) : tag.id;
  }

  function formatTagSub(tag) {
    const fmt = window.PeaklogicTagDisplay?.formatTagSub;
    return fmt ? fmt(tag, lastTags) : '';
  }

  function qualityIsOk(quality) {
    const q = String(quality || 'GOOD').toUpperCase();
    return q === 'GOOD';
  }

  function qualityBadge(point) {
    if (qualityIsOk(point?.quality)) return '';
    return `<span class="io-quality io-quality-bad">${esc(String(point.quality).toUpperCase())}</span>`;
  }

  function formatValue(point) {
    if (!point) return '—';
    const forced = point.forceInput || point.forceOutput;
    let text;
    if (point.type === 'BOOL') text = point.value ? 'ON' : 'OFF';
    else if (typeof point.value === 'number') {
      text = Number.isInteger(point.value) ? String(point.value) : point.value.toFixed(3);
    } else {
      text = String(point.value ?? '—');
    }
    if (forced && point.logicValue !== undefined) {
      const logic = point.type === 'BOOL'
        ? (point.logicValue ? 'ON' : 'OFF')
        : String(point.logicValue);
      return `${text} (logic ${logic})`;
    }
    return text;
  }

  function runtimeLabel(runtime) {
    if (!runtime?.running) return 'Runtime stopped — last values shown';
    if (runtime.paused) return 'Runtime paused — values frozen';
    return 'Runtime active';
  }

  function renderPoints(data) {
    const host = $('io-map-panel');
    const status = $('io-map-status');
    const runtimeEl = $('io-map-runtime');
    if (!host) return;

    const runtime = data?.runtime || {};
    const points = data?.points || [];
    lastTags = points.map((p) => ({ id: p.id, label: p.label, type: p.type, role: p.role, driverId: p.driverId }));

    host.classList.toggle('io-stopped', !runtime.running);
    if (runtimeEl) runtimeEl.textContent = runtimeLabel(runtime);
    if (status) {
      const when = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : '—';
      const pollNote = shouldRefreshIoMap(runtime)
        ? ` · auto-refresh ${POLL_MS / 1000}s`
        : ' · frozen (enable I/O update)';
      status.textContent = `${points.length} point(s) · updated ${when}${pollNote}`;
    }

    if (!points.length) {
      host.innerHTML = '<p class="program-io-empty">No input or output tags configured. Assign drivers on I/O tags in the Tags panel.</p>';
      return;
    }

    const expIo = window.PeaklogicExpansionIo || {};
    const { base, bySlot } = expIo.partitionIoTags?.(points) || { base: points, bySlot: new Map() };
    const slots = [...bySlot.keys()].sort((a, b) => a - b);
    const hasExpansion = slots.length > 0;

    const mkDigital = (point) => {
      const on = !!point.value;
      const highlight = runtime.running && on;
      const forced = point.forceInput || point.forceOutput;
      const tag = { id: point.id, label: point.label, role: point.role, driverId: point.driverId };
      const stopped = !runtime.running;
      return `<div class="io-point digital ${highlight ? 'on' : 'off'}${forced ? ' forced' : ''}" data-io-id="${esc(point.id)}" data-io-type="BOOL">
        <span class="io-name">${esc(formatTagName(tag))}</span>
        ${formatTagSub(tag) ? `<span class="io-tag-id muted">${esc(formatTagSub(tag))}</span>` : `<span class="io-tag-id muted">${esc(point.id)}</span>`}
        <span class="io-role">${esc(point.role)}${point.driverId ? ` · ${esc(point.driverId)}` : ''}</span>
        <span class="io-val" data-io-val>${esc(formatValue(point))}</span>
        ${ioTs().ioTsSpan?.(point.updatedAt, { stopped }) || ''}
        ${qualityBadge(point)}
        ${forced ? '<span class="io-force-badge">FORCED</span>' : ''}
      </div>`;
    };

    const mkAnalog = (point) => {
      const forced = point.forceInput || point.forceOutput;
      const tag = { id: point.id, label: point.label, role: point.role, driverId: point.driverId, type: point.type };
      const stopped = !runtime.running;
      return `<div class="io-point analog${forced ? ' forced' : ''}" data-io-id="${esc(point.id)}" data-io-type="${esc(point.type)}">
        <span class="io-name">${esc(formatTagName(tag))}</span>
        ${formatTagSub(tag) ? `<span class="io-tag-id muted">${esc(formatTagSub(tag))}</span>` : `<span class="io-tag-id muted">${esc(point.id)}</span>`}
        <span class="io-role">${esc(point.type)} · ${esc(point.role)}${point.driverId ? ` · ${esc(point.driverId)}` : ''}</span>
        <span class="io-val" data-io-val>${esc(formatValue(point))}</span>
        ${ioTs().ioTsSpan?.(point.updatedAt, { stopped }) || ''}
        ${qualityBadge(point)}
        ${forced ? '<span class="io-force-badge">FORCED</span>' : ''}
      </div>`;
    };

    const renderGroup = (groupPoints, opts = {}) => {
      const { sectionTitle = '', flat = false } = opts;
      const digital = groupPoints.filter((p) => p.type === 'BOOL');
      const analog = groupPoints.filter((p) => p.type === 'INT' || p.type === 'REAL');
      const other = groupPoints.filter((p) => p.type !== 'BOOL' && p.type !== 'INT' && p.type !== 'REAL');
      if (!digital.length && !analog.length && !other.length) return '';
      const digBlock = digital.length ? `<div class="program-io-digital io-map-grid">${digital.map(mkDigital).join('')}</div>` : '';
      const anaBlock = analog.length ? `<div class="program-io-digital io-map-grid">${analog.map(mkAnalog).join('')}</div>` : '';
      const otherBlock = other.length ? `<div class="program-io-digital io-map-grid">${other.map(mkAnalog).join('')}</div>` : '';
      if (flat) {
        return `
          ${digital.length ? `<div class="program-io-section"><h3>Digital inputs &amp; outputs</h3>${digBlock}</div>` : ''}
          ${analog.length ? `<div class="program-io-section"><h3>Analog (INT / REAL)</h3>${anaBlock}</div>` : ''}
          ${other.length ? `<div class="program-io-section"><h3>Other I/O</h3>${otherBlock}</div>` : ''}`;
      }
      return `
        <div class="program-io-section${sectionTitle.startsWith('Expansion') ? ' program-io-expansion' : ''}">
          <h3>${esc(sectionTitle)}</h3>
          ${digital.length ? `<div class="program-io-subsection"><h4>Digital</h4>${digBlock}</div>` : ''}
          ${analog.length ? `<div class="program-io-subsection"><h4>Analog (INT / REAL)</h4>${anaBlock}</div>` : ''}
          ${other.length ? `<div class="program-io-subsection"><h4>Other I/O</h4>${otherBlock}</div>` : ''}
        </div>`;
    };

    let html = renderGroup(base, hasExpansion && base.length
      ? { sectionTitle: 'On-board I/O' }
      : { flat: true });
    for (const slot of slots) {
      const slotPoints = bySlot.get(slot) || [];
      const title = expIo.expansionSectionTitle?.(slot, slotPoints) || `Expansion ${slot}`;
      html += renderGroup(slotPoints, { sectionTitle: title });
    }
    host.innerHTML = html;
    window.PeaklogicIoMapBindings?.bindIoPointClicks?.();
    const sel = window.PeaklogicIoMapBindings?.getSelectedTagId?.();
    if (sel) {
      document.querySelectorAll('[data-io-id]').forEach((el) => {
        el.classList.toggle('io-map-selected', el.dataset.ioId === sel);
      });
    }
  }

  function updateIoMapLive(data) {
    const host = $('io-map-panel');
    if (!host) return;
    const runtime = data?.runtime || {};
    const points = data?.points || [];
    const byId = new Map(points.map((p) => [p.id, p]));
    host.classList.toggle('io-stopped', !runtime.running);
    const runtimeEl = $('io-map-runtime');
    if (runtimeEl) runtimeEl.textContent = runtimeLabel(runtime);
    const status = $('io-map-status');
    if (status) {
      const when = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : '—';
      const pollNote = shouldRefreshIoMap(runtime)
        ? ` · auto-refresh ${POLL_MS / 1000}s`
        : ' · frozen (enable I/O update)';
      status.textContent = `${points.length} point(s) · updated ${when}${pollNote}`;
    }
    host.querySelectorAll('[data-io-id]').forEach((el) => {
      const point = byId.get(el.dataset.ioId);
      if (!point) return;
      const forced = point.forceInput || point.forceOutput;
      const stopped = !runtime.running;
      el.classList.toggle('forced', forced);
      if (point.type === 'BOOL') {
        const on = !!point.value;
        const highlight = runtime.running && !runtime.paused && on;
        el.classList.toggle('on', highlight);
        el.classList.toggle('off', !highlight);
      }
      const valEl = el.querySelector('[data-io-val]');
      if (valEl) valEl.textContent = formatValue(point);
      let tsEl = el.querySelector('.io-ts');
      if (!tsEl && ioTs().ioTsSpan) {
        tsEl = document.createElement('span');
        valEl?.insertAdjacentElement('afterend', tsEl);
      }
      ioTs().updateIoTsEl?.(tsEl, point.updatedAt, { stopped });
      let badge = el.querySelector('.io-force-badge');
      if (forced && !badge) {
        badge = document.createElement('span');
        badge.className = 'io-force-badge';
        badge.textContent = 'FORCED';
        el.appendChild(badge);
      } else if (!forced && badge) {
        badge.remove();
      }
      let qBadge = el.querySelector('.io-quality-bad');
      const bad = !qualityIsOk(point?.quality);
      if (bad && !qBadge) {
        qBadge = document.createElement('span');
        qBadge.className = 'io-quality io-quality-bad';
        qBadge.textContent = String(point.quality).toUpperCase();
        el.appendChild(qBadge);
      } else if (!bad && qBadge) {
        qBadge.remove();
      }
    });
  }

  async function refresh() {
    const status = $('io-map-status');
    try {
      const data = await window.api.getIoMap();
      lastRuntime = data?.runtime || {};
      const sig = pointSignature(data?.points);
      const host = $('io-map-panel');
      const canPatch = host?.querySelector('[data-io-id]') && sig === lastPointSig;
      if (canPatch && shouldRefreshIoMap(lastRuntime)) {
        updateIoMapLive(data);
      } else {
        lastPointSig = sig;
        renderPoints(data);
      }
      const cfgSig = bindingsConfigSig(data);
      const bindingsBusy = window.PeaklogicIoMapBindings?.isUiBusy?.();
      if (bindingsBusy) {
        window.PeaklogicIoMapBindings?.loadConfig?.(data, { liveOnly: true });
      } else if (cfgSig !== lastBindingsConfigSig) {
        lastBindingsConfigSig = cfgSig;
        window.PeaklogicIoMapBindings?.loadConfig?.(data);
      } else {
        window.PeaklogicIoMapBindings?.loadConfig?.(data, { liveOnly: true });
      }
    } catch (e) {
      if (status) status.textContent = `Error: ${e.message}`;
      const host = $('io-map-panel');
      if (host) host.innerHTML = `<p class="program-io-empty err">${esc(e.message)}</p>`;
    }
  }

  function schedulePolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (shouldRefreshIoMap(lastRuntime) || isUpdateEnabled()) {
      pollTimer = setInterval(refresh, POLL_MS);
    }
  }

  function bindUpdateCheckbox() {
    const cb = $('io-map-live-update');
    if (!cb || cb.dataset.bound === '1') return;
    cb.dataset.bound = '1';
    cb.checked = readUpdatePref();
    cb.addEventListener('change', () => {
      writeUpdatePref(cb.checked);
      schedulePolling();
      if (cb.checked) refresh();
      else {
        const status = $('io-map-status');
        if (status && !status.textContent.startsWith('Error:')) {
          status.textContent = status.textContent.replace(/ · auto-refresh \d+s$/, '') + ' · frozen (enable I/O update)';
        }
      }
    });
  }

  function startPage() {
    bindUpdateCheckbox();
    refresh();
    schedulePolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPage);
  } else {
    startPage();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (shouldRefreshIoMap(lastRuntime) || isUpdateEnabled())) refresh();
  });
})();
