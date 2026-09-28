/* global api, HmiView */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let cameras = [];
  let settings = {};
  let discoverHits = [];
  let needsSetupHits = [];
  let editingId = null;
  let selectedCameraId = null;
  let activeTab = 'overview';
  let overviewData = null;
  let overlayDraft = [];
  let tagOptionsCache = null;

  const OVERLAY_SYMBOLS = ['valve', 'pump', 'motor', 'dot', 'text', 'box'];

  const CAMERA_DISABLED_HINT = 'Camera system is off — enable it under Cameras → Administration… → Settings.';

  function cameraSystemEnabled() {
    return settings.camerasEnabled !== false;
  }

  function isCameraDisabledError(msg) {
    return /camera system is disabled/i.test(String(msg || ''));
  }

  function normalizeCameraError(msg) {
    return isCameraDisabledError(msg) ? CAMERA_DISABLED_HINT : String(msg || '');
  }

  function guardCameraRuntime(msgId, opts = {}) {
    if (cameraSystemEnabled()) return true;
    if (msgId) setMsg(msgId, CAMERA_DISABLED_HINT, false);
    if (opts.renderEl) opts.renderEl.innerHTML = `<p class="panel-hint err">${esc(CAMERA_DISABLED_HINT)}</p>`;
    return false;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(v) {
    if (!v) return '—';
    try {
      if (window.PeaklogicTime?.formatFriendly) return window.PeaklogicTime.formatFriendly(v);
      return new Date(v).toLocaleString(undefined, window.PeaklogicTime?.localeOpts?.() || {});
    } catch { return String(v); }
  }

  function setMsg(id, text, ok) {
    const el = $(id);
    if (!el) return;
    const display = ok ? (text || '') : normalizeCameraError(text);
    el.textContent = display;
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('err', display && !ok);
  }

  function camById(id) {
    return cameras.find((c) => c.cameraId === id) || null;
  }

  function viewerUrlFor(cam) {
    const v = String(cam?.viewerUrl || '').trim();
    if (v) return v;
    const id = String(cam?.cameraId || '').trim();
    if (!id) return '';
    const backend = settings.streamBackend || 'go2rtc';
    if (settings.go2rtcEnabled !== false && backend === 'go2rtc') {
      return `/api/cameras/${encodeURIComponent(id)}/player`;
    }
    if (cam?.hasStream) {
      return `/api/cameras/${encodeURIComponent(id)}/mjpeg`;
    }
    return '';
  }

  function snapshotImgUrl(cameraId, fileId) {
    return `/api/cameras/${encodeURIComponent(cameraId)}/snapshots/${encodeURIComponent(fileId)}`;
  }

  async function loadTagOptions() {
    if (tagOptionsCache) return tagOptionsCache;
    try {
      const data = await api.getTags();
      tagOptionsCache = (data.tags || data || [])
        .map((t) => String(t.tagId || t.id || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      tagOptionsCache = [];
    }
    return tagOptionsCache;
  }

  function overlayRowHtml(o, idx, tagOptions) {
    const tagOpts = ['<option value="">— tag —</option>']
      .concat(tagOptions.map((id) => `<option value="${esc(id)}" ${id === o.tagId ? 'selected' : ''}>${esc(id)}</option>`))
      .join('');
    const symOpts = OVERLAY_SYMBOLS.map((s) => `<option value="${s}" ${s === (o.symbol || 'valve') ? 'selected' : ''}>${s}</option>`).join('');
    return `<tr data-ovl-idx="${idx}">
      <td><input type="text" class="input-sm cell-mono" data-ovl-field="label" value="${esc(o.label || '')}" placeholder="Label"></td>
      <td><select class="input-sm cell-mono" data-ovl-field="tagId">${tagOpts}</select></td>
      <td><input type="number" class="input-sm" data-ovl-field="xPct" min="0" max="100" step="1" value="${Number(o.xPct ?? 50)}"></td>
      <td><input type="number" class="input-sm" data-ovl-field="yPct" min="0" max="100" step="1" value="${Number(o.yPct ?? 50)}"></td>
      <td><select class="input-sm" data-ovl-field="symbol">${symOpts}</select></td>
      <td><input type="color" data-ovl-field="onColor" value="${esc(o.onColor || '#22c55e')}" title="On color"></td>
      <td><input type="color" data-ovl-field="offColor" value="${esc(o.offColor || '#ef4444')}" title="Off color"></td>
      <td class="cam-ovl-snap"><label><input type="checkbox" data-ovl-field="snapshotOnRising" ${o.snapshotOnRising ? 'checked' : ''}> ↑</label>
        <label><input type="checkbox" data-ovl-field="snapshotOnFalling" ${o.snapshotOnFalling ? 'checked' : ''}> ↓</label></td>
      <td><button type="button" class="btn btn-sm" data-ovl-remove="${idx}">×</button></td>
    </tr>`;
  }

  function readOverlayDraftFromDom() {
    const rows = [...document.querySelectorAll('#cameras-overlay-table tbody tr[data-ovl-idx]')];
    return rows.map((row, idx) => {
      const get = (field) => row.querySelector(`[data-ovl-field="${field}"]`);
      const tagId = get('tagId')?.value?.trim() || '';
      if (!tagId) return null;
      return {
        id: overlayDraft[idx]?.id || `ovl_${tagId}_${idx}`,
        tagId,
        label: get('label')?.value?.trim() || tagId,
        xPct: Number(get('xPct')?.value ?? 50),
        yPct: Number(get('yPct')?.value ?? 50),
        symbol: get('symbol')?.value || 'valve',
        onColor: get('onColor')?.value || '#22c55e',
        offColor: get('offColor')?.value || '#ef4444',
        kind: 'bool',
        snapshotOnRising: !!get('snapshotOnRising')?.checked,
        snapshotOnFalling: !!get('snapshotOnFalling')?.checked,
      };
    }).filter(Boolean);
  }

  function renderOverlayEditor(cameraId, overlays, tagOptions) {
    overlayDraft = Array.isArray(overlays) ? overlays.map((o) => ({ ...o })) : [];
    const rows = overlayDraft.length
      ? overlayDraft.map((o, idx) => overlayRowHtml(o, idx, tagOptions)).join('')
      : '<tr><td colspan="9" class="muted">No overlays — add a tag marker below.</td></tr>';
    return `
      <div class="cameras-overlay-editor" id="cameras-overlay-editor">
        <h4 class="hmi-block-title">I/O overlays on video</h4>
        <p class="panel-hint">Map BOOL tags to positions on the live HMI <strong>Camera + I/O overlays</strong> tile. Rising/falling edges can trigger GridFS snapshots.</p>
        <div class="table-wrap cameras-overlay-table-wrap">
          <table class="help-table compact" id="cameras-overlay-table">
            <thead><tr>
              <th>Label</th><th>Tag</th><th>X%</th><th>Y%</th><th>Symbol</th><th>On</th><th>Off</th><th>Snap</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="toolbar wrap">
          <button type="button" id="btn-overlay-add" class="btn btn-sm">Add overlay</button>
          <button type="button" id="btn-overlay-save" class="btn btn-sm primary" data-camera-id="${esc(cameraId)}">Save overlays</button>
        </div>
        <p id="cameras-overlay-msg" class="muted cell-mono" aria-live="polite"></p>
      </div>`;
  }

  function bindOverlayEditor(cameraId) {
    const editor = $('cameras-overlay-editor');
    if (!editor || editor.dataset.bound === '1') return;
    editor.dataset.bound = '1';
    editor.addEventListener('click', async (e) => {
      const addBtn = e.target.closest('#btn-overlay-add');
      const saveBtn = e.target.closest('#btn-overlay-save');
      const removeBtn = e.target.closest('[data-ovl-remove]');
      if (addBtn) {
        const tags = await loadTagOptions();
        overlayDraft.push({
          id: `ovl_new_${Date.now()}`,
          tagId: tags[0] || '',
          label: 'Valve',
          xPct: 50,
          yPct: 50,
          symbol: 'valve',
          onColor: '#22c55e',
          offColor: '#ef4444',
          kind: 'bool',
          snapshotOnRising: true,
          snapshotOnFalling: false,
        });
        const tbody = editor.querySelector('#cameras-overlay-table tbody');
        if (tbody) {
          tbody.innerHTML = overlayDraft.map((o, idx) => overlayRowHtml(o, idx, tags)).join('');
        }
        return;
      }
      if (removeBtn) {
        const idx = Number(removeBtn.dataset.ovlRemove);
        overlayDraft.splice(idx, 1);
        const tags = await loadTagOptions();
        const tbody = editor.querySelector('#cameras-overlay-table tbody');
        if (tbody) {
          tbody.innerHTML = overlayDraft.length
            ? overlayDraft.map((o, i) => overlayRowHtml(o, i, tags)).join('')
            : '<tr><td colspan="9" class="muted">No overlays — add a tag marker below.</td></tr>';
        }
        return;
      }
      if (saveBtn) {
        const overlays = readOverlayDraftFromDom();
        try {
          await api.putCameraOverlays(cameraId, overlays);
          setMsg('cameras-overlay-msg', `Saved ${overlays.length} overlay(s).`, true);
          await refreshCameras();
          loadDetail();
        } catch (err) {
          setMsg('cameras-overlay-msg', err.message || String(err), false);
        }
      }
    });
  }

  function populateCameraSelects() {
    const opts = '<option value="">— select —</option>'
      + cameras.map((c) => `<option value="${esc(c.cameraId)}">${esc(c.name)} (${esc(c.host)})</option>`).join('');
    const allOpts = '<option value="">All cameras</option>'
      + cameras.map((c) => `<option value="${esc(c.cameraId)}">${esc(c.name)}</option>`).join('');
    ['cameras-detail-select', 'cameras-archive-filter', 'cameras-events-filter', 'cameras-ai-filter'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const cur = el.value;
      el.innerHTML = id === 'cameras-detail-select' ? opts.replace('— select —', '— select camera —') : allOpts;
      if (cur && cameras.some((c) => c.cameraId === cur)) el.value = cur;
      else if (selectedCameraId && cameras.some((c) => c.cameraId === selectedCameraId)) el.value = selectedCameraId;
    });
  }

  function selectCamera(cameraId, { tab = null } = {}) {
    selectedCameraId = cameraId || null;
    populateCameraSelects();
    if (tab) showCamerasTab(tab);
    else loadActiveTab();
  }

  function showCamerasTab(name) {
    activeTab = name || 'overview';
    document.querySelectorAll('[data-cameras-tab-btn]').forEach((b) => {
      b.classList.toggle('active', b.dataset.camerasTabBtn === activeTab);
    });
    document.querySelectorAll('[data-cameras-tab]').forEach((p) => {
      p.classList.toggle('view-hidden', p.dataset.camerasTab !== activeTab);
    });
    loadActiveTab();
  }

  function loadActiveTab() {
    const loaders = {
      overview: loadOverview,
      inventory: () => { renderInventoryTable(); },
      detail: loadDetail,
      archive: loadArchive,
      events: loadEvents,
      ai: loadAiHistory,
      discover: () => { renderDiscoverResults(); },
      system: loadSystem,
      settings: () => { fillSettingsForm(); },
    };
    loaders[activeTab]?.();
  }

  async function loadOverview() {
    if (!api.cameraOverview) return;
    try {
      overviewData = await api.cameraOverview();
      renderOverview(overviewData);
      setMsg('cameras-overview-msg', `Updated ${new Date().toLocaleTimeString()}`, true);
    } catch (e) {
      setMsg('cameras-overview-msg', e.message || String(e), false);
    }
  }

  function renderOverview(data) {
    const cards = $('cameras-overview-cards');
    const fleet = $('cameras-overview-fleet');
    if (!cards || !fleet || !data) return;
    const c = data.cameras || {};
    const sys = data.camerasEnabled !== false;
    const g = data.go2rtc || {};
    const gfs = data.gridfs || {};
    const ai = data.ai || {};
    const arch = data.archive || {};
    cards.innerHTML = `
      <div class="cam-stat-card ${sys ? '' : 'err'}"><div class="cam-stat-val">${sys ? 'ON' : 'OFF'}</div><div class="cam-stat-lbl">System</div></div>
      <div class="cam-stat-card"><div class="cam-stat-val">${c.total || 0}</div><div class="cam-stat-lbl">Cameras</div></div>
      <div class="cam-stat-card ok"><div class="cam-stat-val">${c.probedOk || 0}</div><div class="cam-stat-lbl">Probed OK</div></div>
      <div class="cam-stat-card ${c.probedErr ? 'err' : ''}"><div class="cam-stat-val">${c.probedErr || 0}</div><div class="cam-stat-lbl">Probe errors</div></div>
      <div class="cam-stat-card ${g.running ? 'ok' : ''}"><div class="cam-stat-val">${g.running ? 'ON' : 'OFF'}</div><div class="cam-stat-lbl">go2rtc</div></div>
      <div class="cam-stat-card ${gfs.connected ? 'ok' : ''}"><div class="cam-stat-val">${gfs.snapshotCount ?? '—'}</div><div class="cam-stat-lbl">Snapshots</div></div>
      <div class="cam-stat-card"><div class="cam-stat-val">${ai.enabled ? esc(ai.backend) : 'off'}</div><div class="cam-stat-lbl">Vision AI</div></div>
      <div class="cam-stat-card"><div class="cam-stat-val">${arch.running ? 'ON' : 'OFF'}</div><div class="cam-stat-lbl">Scheduler</div></div>`;
    const rows = (data.inventory || []).map((item) => {
      const probe = item.probeStatus === 'ok' ? '<span class="ok">OK</span>'
        : (item.probeStatus === 'error' ? '<span class="err">ERR</span>' : '<span class="muted">—</span>');
      return `<tr data-fleet-id="${esc(item.cameraId)}">
        <td><strong>${esc(item.name)}</strong><div class="muted cell-mono">${esc(item.cameraId)}</div></td>
        <td class="cell-mono">${esc(item.host)}</td>
        <td>${probe}</td>
        <td>${item.hasStream ? '<span class="ok">RTSP</span>' : '<span class="muted">—</span>'}</td>
        <td class="muted">${fmtTime(item.lastSeenAt)}</td>
        <td class="cam-actions">
          <button type="button" class="btn btn-sm" data-fleet-action="detail" data-id="${esc(item.cameraId)}">Detail</button>
          <button type="button" class="btn btn-sm" data-fleet-action="test" data-id="${esc(item.cameraId)}" ${viewerUrlFor(item) ? '' : 'disabled'}>Live</button>
        </td>
      </tr>`;
    }).join('');
    fleet.innerHTML = rows
      ? `<table class="data-table cameras-table"><thead><tr>
          <th>Name</th><th>Host</th><th>Probe</th><th>Stream</th><th>Last seen</th><th></th>
        </tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="panel-hint">No cameras in inventory.</p>';
    fleet.querySelectorAll('[data-fleet-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (btn.dataset.fleetAction === 'detail') selectCamera(id, { tab: 'detail' });
        if (btn.dataset.fleetAction === 'test') testCamera(id);
      });
    });
  }

  function renderInventoryTable() {
    const wrap = $('cameras-inventory-table');
    if (!wrap) return;
    if (!cameras.length) {
      wrap.innerHTML = '<p class="panel-hint">No cameras in inventory. Run <strong>Discover ONVIF</strong> or click <strong>Add camera</strong>.</p>';
      return;
    }
    const rows = cameras.map((c) => {
      const viewer = viewerUrlFor(c);
      const prof = c.onvifProfile ? `Profile ${esc(c.onvifProfile)}` : '—';
      const vendor = c.vendor ? esc(c.vendor) : '—';
      const probe = c.probeStatus === 'ok' ? '<span class="ok">OK</span>'
        : (c.probeStatus === 'error' ? '<span class="err">Error</span>' : '—');
      const seen = fmtTime(c.lastSeenAt);
      return `<tr data-camera-id="${esc(c.cameraId)}">
        <td><strong>${esc(c.name)}</strong><div class="muted cell-mono">${esc(c.cameraId)}</div></td>
        <td class="cell-mono">${esc(c.host)}:${esc(c.port)}</td>
        <td>${vendor}</td>
        <td>${prof}</td>
        <td>${probe}</td>
        <td class="cell-mono cam-col-url" title="${esc(viewer)}">${esc(viewer || '—')}</td>
        <td class="muted cell-mono">${esc(seen)}</td>
        <td class="cam-actions">
          <button type="button" class="btn btn-sm" data-cam-action="detail" data-id="${esc(c.cameraId)}">Detail</button>
          <button type="button" class="btn btn-sm" data-cam-action="edit" data-id="${esc(c.cameraId)}">Edit</button>
          <button type="button" class="btn btn-sm" data-cam-action="probe" data-id="${esc(c.cameraId)}">Probe</button>
          <button type="button" class="btn btn-sm" data-cam-action="test" data-id="${esc(c.cameraId)}" ${viewer ? '' : 'disabled'}>Test</button>
        </td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<table class="data-table cameras-table"><thead><tr>
      <th>Name</th><th>Host</th><th>Vendor</th><th>ONVIF</th><th>Probe</th><th>Viewer URL</th><th>Last seen</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
    wrap.querySelectorAll('[data-cam-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const act = btn.dataset.camAction;
        if (act === 'edit') openEditForm(id);
        if (act === 'probe') probeCameraById(id);
        if (act === 'test') testCamera(id);
        if (act === 'detail') selectCamera(id, { tab: 'detail' });
      });
    });
  }

  async function loadDetail() {
    const id = $('cameras-detail-select')?.value || selectedCameraId;
    const body = $('cameras-detail-body');
    if (!body) return;
    if (!id) {
      body.innerHTML = '<p class="panel-hint">Select a camera to view live stream, URLs, and latest snapshot.</p>';
      return;
    }
    if (!guardCameraRuntime(null, { renderEl: body })) return;
    selectedCameraId = id;
    const cam = camById(id);
    body.innerHTML = '<p class="panel-hint">Loading camera detail…</p>';
    try {
      const [viewerData, eventsData, inferData, tagOptions] = await Promise.all([
        api.cameraViewer(id),
        api.cameraEvents(id, 10).catch(() => ({ events: [] })),
        api.cameraInferences(id, 6).catch(() => ({ inferences: [] })),
        loadTagOptions(),
      ]);
      const viewerUrl = viewerData.viewerUrl || viewerUrlFor(cam);
      const latest = viewerData.latestSnapshot;
      const latestUrl = latest?.fileId ? snapshotImgUrl(id, latest.fileId) : null;
      const recentEvents = (eventsData.events || []).slice(0, 5).map((ev) =>
        `<li><span class="cam-ev-type">${esc(ev.type)}</span> ${esc(ev.message)} <span class="muted">${fmtTime(ev.at)}</span></li>`,
      ).join('') || '<li class="muted">No recent events</li>';
      const recentAi = (inferData.inferences || []).slice(-3).reverse().map((row) => {
        const inf = row.inference || row;
        const score = inf.score ?? row.score ?? '—';
        const label = inf.label ?? row.label ?? '—';
        const src = row.source || row.features?.source || '—';
        return `<li>${esc(label)} <strong>${score}</strong> <span class="muted">(${esc(src)}) ${fmtTime(row.at || row.timestamp)}</span></li>`;
      }).join('') || '<li class="muted">No recent inferences</li>';

      body.innerHTML = `
        <div class="cameras-detail-grid">
          <div class="cameras-detail-live">
            <h4 class="hmi-block-title">${esc(viewerData.name || cam?.name || id)}</h4>
            ${viewerUrl
    ? `<iframe class="cameras-live-iframe" src="${esc(viewerUrl)}" title="Live ${esc(id)}" allow="autoplay; fullscreen"></iframe>`
    : '<p class="panel-hint err">No viewer URL — run Probe first.</p>'}
          </div>
          <div class="cameras-detail-meta">
            <table class="help-table compact">
              <tr><th>Camera ID</th><td class="cell-mono">${esc(id)}</td></tr>
              <tr><th>Host</th><td class="cell-mono">${esc(cam?.host || '—')}</td></tr>
              <tr><th>Probe</th><td>${cam?.probeStatus === 'ok' ? '<span class="ok">OK</span>' : esc(cam?.probeStatus || '—')}</td></tr>
              <tr><th>RTSP</th><td class="cell-mono cam-col-url" title="${esc(cam?.rtspUrl || '')}">${esc(cam?.rtspUrl ? 'configured' : '—')}</td></tr>
              <tr><th>Viewer</th><td class="cell-mono cam-col-url">${esc(viewerUrl || '—')}</td></tr>
            </table>
            ${latestUrl
    ? `<figure class="cameras-detail-thumb"><img src="${esc(latestUrl)}" alt="Latest snapshot"><figcaption>Latest snapshot · ${fmtTime(latest?.uploadDate || latest?.at)}</figcaption></figure>`
    : '<p class="panel-hint">No archived snapshots yet.</p>'}
            <h4 class="hmi-block-title">Recent events</h4>
            <ul class="cameras-mini-list">${recentEvents}</ul>
            <h4 class="hmi-block-title">Recent AI</h4>
            <ul class="cameras-mini-list">${recentAi}</ul>
          </div>
        </div>
        ${renderOverlayEditor(id, viewerData.overlays || [], tagOptions)}`;
      bindOverlayEditor(id);
    } catch (e) {
      body.innerHTML = `<p class="err">${esc(normalizeCameraError(e.message || String(e)))}</p>`;
    }
  }

  async function loadArchive() {
    const filterId = $('cameras-archive-filter')?.value || '';
    const gallery = $('cameras-archive-gallery');
    if (!gallery) return;
    if (!guardCameraRuntime('cameras-archive-msg', { renderEl: gallery })) return;
    gallery.innerHTML = '<p class="panel-hint">Loading snapshots…</p>';
    try {
      let items = [];
      if (filterId) {
        const data = await api.cameraSnapshots(filterId, 60);
        items = (data.snapshots || []).map((s) => ({ ...s, cameraId: filterId }));
      } else {
        const lists = await Promise.all(cameras.map(async (c) => {
          try {
            const data = await api.cameraSnapshots(c.cameraId, 12);
            return (data.snapshots || []).map((s) => ({ ...s, cameraId: c.cameraId, cameraName: c.name }));
          } catch { return []; }
        }));
        items = lists.flat().sort((a, b) => {
          const ta = new Date(a.uploadDate || a.at || 0).getTime();
          const tb = new Date(b.uploadDate || b.at || 0).getTime();
          return tb - ta;
        }).slice(0, 80);
      }
      if (!items.length) {
        gallery.innerHTML = '<p class="panel-hint">No archived snapshots. Enable GridFS archive in Settings and capture a snapshot.</p>';
        return;
      }
      gallery.innerHTML = items.map((s) => {
        const cid = s.cameraId;
        const url = snapshotImgUrl(cid, s.fileId);
        const name = s.cameraName || camById(cid)?.name || cid;
        return `<a class="cam-snap-thumb" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(s.reason || s.metadata?.reason || '')}">
          <img src="${esc(url)}" alt="${esc(name)}" loading="lazy">
          <span class="cam-snap-cap">${esc(name)}<br><span class="muted">${fmtTime(s.uploadDate || s.at)}</span></span>
        </a>`;
      }).join('');
      setMsg('cameras-archive-msg', `${items.length} snapshot(s) shown.`, true);
    } catch (e) {
      gallery.innerHTML = '';
      setMsg('cameras-archive-msg', e.message || String(e), false);
    }
  }

  async function loadEvents() {
    const filterId = $('cameras-events-filter')?.value || '';
    const type = $('cameras-events-type')?.value || '';
    const wrap = $('cameras-events-table');
    if (!wrap) return;
    if (!guardCameraRuntime('cameras-events-msg', { renderEl: wrap })) return;
    wrap.innerHTML = '<p class="panel-hint">Loading events…</p>';
    try {
      const data = filterId
        ? await api.cameraEvents(filterId, 200, type || undefined)
        : await api.allCameraEvents(200, type || undefined);
      const events = data.events || [];
      if (!events.length) {
        wrap.innerHTML = '<p class="panel-hint">No events logged. Events require MongoDB (mongoLogger.uri).</p>';
        return;
      }
      const rows = events.map((ev) => `<tr>
        <td class="muted">${fmtTime(ev.at)}</td>
        <td class="cell-mono">${esc(ev.cameraId)}</td>
        <td><span class="cam-ev-type cam-ev-${esc(ev.type)}">${esc(ev.type)}</span></td>
        <td>${esc(ev.message)}</td>
        <td class="cell-mono muted">${ev.snapshotId ? esc(ev.snapshotId).slice(0, 8) + '…' : '—'}</td>
      </tr>`).join('');
      wrap.innerHTML = `<table class="data-table cameras-table"><thead><tr>
        <th>Time</th><th>Camera</th><th>Type</th><th>Message</th><th>Snapshot</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
      setMsg('cameras-events-msg', `${events.length} event(s).`, true);
    } catch (e) {
      wrap.innerHTML = '';
      setMsg('cameras-events-msg', e.message || String(e), false);
    }
  }

  async function loadAiHistory() {
    const filterId = $('cameras-ai-filter')?.value || '';
    const hours = Number($('cameras-ai-hours')?.value) || 24;
    const wrap = $('cameras-ai-table');
    if (!wrap) return;
    if (!guardCameraRuntime('cameras-ai-msg', { renderEl: wrap })) return;
    wrap.innerHTML = '<p class="panel-hint">Loading inference history…</p>';
    try {
      let rows = [];
      if (filterId) {
        const data = await api.cameraInferences(filterId, hours);
        rows = data.inferences || [];
      } else if (api.allCameraInferences) {
        const data = await api.allCameraInferences(hours);
        rows = data.inferences || [];
      }
      rows = rows.slice().reverse();
      if (!rows.length) {
        wrap.innerHTML = '<p class="panel-hint">No inference results in the selected window. Run infer manually or enable live/motion AI.</p>';
        return;
      }
      const tableRows = rows.map((row) => {
        const inf = row.inference || row;
        const score = inf.score ?? row.score ?? '—';
        const label = inf.label ?? row.label ?? '—';
        const conf = inf.confidence ?? row.confidence ?? '—';
        const cid = row.cameraId || row.metadata?.cameraId || row.features?.cameraId || '—';
        const src = row.source || row.features?.source || row.metadata?.source || '—';
        const model = row.modelId || inf.modelId || '—';
        const alarm = score !== '—' && Number(score) >= (Number(settings.cameraAiAlarmThreshold) || 0.85)
          ? ' <span class="err">ALARM</span>' : '';
        return `<tr>
          <td class="muted">${fmtTime(row.at || row.timestamp)}</td>
          <td class="cell-mono">${esc(cid)}</td>
          <td>${esc(label)}${alarm}</td>
          <td><strong>${esc(score)}</strong></td>
          <td>${esc(conf)}</td>
          <td class="muted">${esc(src)}</td>
          <td class="cell-mono muted">${esc(model)}</td>
        </tr>`;
      }).join('');
      wrap.innerHTML = `<table class="data-table cameras-table"><thead><tr>
        <th>Time</th><th>Camera</th><th>Label</th><th>Score</th><th>Conf</th><th>Source</th><th>Model</th>
      </tr></thead><tbody>${tableRows}</tbody></table>`;
      setMsg('cameras-ai-msg', `${rows.length} inference(s) in last ${hours}h.`, true);
    } catch (e) {
      wrap.innerHTML = '';
      setMsg('cameras-ai-msg', e.message || String(e), false);
    }
  }

  async function loadSystem() {
    const wrap = $('cameras-system-panels');
    if (!wrap) return;
    if (!guardCameraRuntime('cameras-system-msg', { renderEl: wrap })) return;
    wrap.innerHTML = '<p class="panel-hint">Loading system status…</p>';
    try {
      const [overview, syncHint] = await Promise.all([
        api.cameraOverview(),
        api.go2rtcStatus().catch(() => ({})),
      ]);
      const g = overview.go2rtc || {};
      const gfs = overview.gridfs || {};
      const ai = overview.ai || {};
      const arch = overview.archive || {};
      const streamRows = (cameras || []).map((c) => {
        const ok = c.probeStatus === 'ok' && !!c.rtspUrl;
        return `<tr><td class="cell-mono">${esc(c.cameraId)}</td><td>${esc(c.name)}</td><td>${ok ? '<span class="ok">ready</span>' : '<span class="muted">not ready</span>'}</td><td class="cell-mono cam-col-url">${esc(c.rtspUrl ? 'yes' : '—')}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="muted">No cameras</td></tr>';

      wrap.innerHTML = `
        <div class="cameras-sys-grid">
          <section class="cam-sys-panel">
            <h4 class="hmi-block-title">go2rtc</h4>
            <table class="help-table compact">
              <tr><th>Enabled</th><td>${g.enabled ? 'yes' : 'no'}</td></tr>
              <tr><th>Running</th><td>${g.running ? '<span class="ok">yes</span>' : '<span class="err">no</span>'}</td></tr>
              <tr><th>Binary</th><td class="cell-mono">${g.binaryFound ? esc(g.binaryPath || 'found') : '<span class="err">not found</span>'}</td></tr>
              <tr><th>Port</th><td>${esc(g.port || settings.go2rtcPort || 1984)}</td></tr>
            </table>
          </section>
          <section class="cam-sys-panel">
            <h4 class="hmi-block-title">GridFS / MongoDB</h4>
            <table class="help-table compact">
              <tr><th>Connected</th><td>${gfs.connected ? '<span class="ok">yes</span>' : '<span class="err">no — set mongoLogger.uri</span>'}</td></tr>
              <tr><th>Snapshots</th><td>${gfs.snapshotCount ?? 0} files</td></tr>
              <tr><th>Archive</th><td>${overview.settings?.snapshotArchiveEnabled ? `every ${overview.settings.snapshotIntervalMs}ms` : 'disabled'}</td></tr>
            </table>
          </section>
          <section class="cam-sys-panel">
            <h4 class="hmi-block-title">Vision AI</h4>
            <table class="help-table compact">
              <tr><th>Enabled</th><td>${ai.enabled ? esc(ai.backend) : 'off'}</td></tr>
              <tr><th>Live sampler</th><td>${ai.live?.running ? `running (${ai.live.intervalMs}ms)` : 'stopped'}</td></tr>
              <tr><th>Motion monitors</th><td>${ai.motion?.activeMonitors ?? 0} active</td></tr>
              <tr><th>Alarm</th><td>${ai.alarmTagId ? `${esc(ai.alarmTagId)} @ ${ai.alarmThreshold}` : '—'}</td></tr>
            </table>
          </section>
          <section class="cam-sys-panel">
            <h4 class="hmi-block-title">Snapshot scheduler</h4>
            <table class="help-table compact">
              <tr><th>Running</th><td>${arch.running ? '<span class="ok">yes</span>' : 'no'}</td></tr>
              <tr><th>Interval</th><td>${arch.intervalMs || overview.settings?.snapshotIntervalMs || '—'} ms</td></tr>
            </table>
          </section>
        </div>
        <h4 class="hmi-block-title">Stream inventory</h4>
        <table class="data-table cameras-table"><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>RTSP</th></tr></thead><tbody>${streamRows}</tbody></table>`;
      setMsg('cameras-system-msg', syncHint.running ? 'go2rtc is running.' : 'go2rtc is not running.', !!syncHint.running);
    } catch (e) {
      wrap.innerHTML = '';
      setMsg('cameras-system-msg', e.message || String(e), false);
    }
  }

  function renderNeedsSetup() {
    const wrap = $('cameras-discover-needs-setup');
    if (!wrap) return;
    if (!needsSetupHits.length) {
      wrap.innerHTML = '';
      wrap.classList.add('view-hidden');
      return;
    }
    wrap.classList.remove('view-hidden');
    const items = needsSetupHits.map((h) => {
      const ports = (h.openPorts || []).join(', ');
      return `<li>
        <strong class="cell-mono">${esc(h.host)}</strong>
        ${h.manufacturer ? `<span class="muted">(${esc(h.manufacturer)})</span>` : ''}
        <span class="muted">open ports: ${esc(ports || '—')}</span>
        <button type="button" class="btn btn-sm" data-needs-setup-ip="${esc(h.host)}">Add by IP</button>
        <div class="muted">${esc(h.note || '')}</div>
      </li>`;
    }).join('');
    wrap.innerHTML = `
      <div class="cameras-needs-setup-box">
        <h4 class="hmi-block-title">Cameras found but not usable yet (${needsSetupHits.length})</h4>
        <p class="panel-hint">These devices responded on the network but have <strong>no reachable ONVIF endpoint</strong>. Reolink ships with ONVIF and RTSP <strong>disabled</strong> — enable them on the camera, then use <strong>Add by IP</strong> or re-scan.</p>
        <ul class="cameras-needs-setup-list">${items}</ul>
      </div>`;
    wrap.querySelectorAll('[data-needs-setup-ip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ip = btn.dataset.needsSetupIp;
        const input = $('cameras-addip-host');
        if (input) {
          input.value = ip;
          input.focus();
        }
        addCameraByIp();
      });
    });
  }

  function renderDiscoverResults() {
    renderNeedsSetup();
    const wrap = $('cameras-discover-results');
    if (!wrap) return;
    if (!discoverHits.length) {
      wrap.innerHTML = needsSetupHits.length
        ? '<p class="panel-hint">No ONVIF-ready cameras found. See the list above for detected cameras that need ONVIF enabled.</p>'
        : '<p class="panel-hint">No discovery results yet. Click <strong>Scan network</strong>.</p>';
      return;
    }
    const rows = discoverHits.map((hit, i) => {
      const prof = hit.onvifProfile ? `Profile ${esc(hit.onvifProfile)}` : '—';
      const inInv = cameras.some((c) =>
        String(c.host).toLowerCase() === String(hit.host).toLowerCase()
        && Number(c.port) === Number(hit.port));
      const method = hit.discoveryMethod === 'subnet-sweep'
        ? '<span class="muted" title="Found by TCP port scan">TCP sweep</span>'
        : '<span class="muted" title="ONVIF WS-Discovery">WS-Discovery</span>';
      return `<tr>
        <td><strong>${esc(hit.name || hit.host)}</strong></td>
        <td class="cell-mono">${esc(hit.host)}:${esc(hit.port)}</td>
        <td>${method}</td>
        <td>${prof}</td>
        <td class="cell-mono" title="${esc(hit.onvifUrl)}">${esc(hit.onvifUrl || '—')}</td>
        <td>${inInv ? '<span class="ok">In inventory</span>' : '<span class="muted">New</span>'}</td>
        <td><button type="button" class="btn btn-sm" data-discover-import="${i}" ${inInv ? 'disabled' : ''}>Add</button></td>
      </tr>`;
    }).join('');
    wrap.innerHTML = `<table class="data-table cameras-table"><thead><tr>
      <th>Name</th><th>Host</th><th>Found by</th><th>ONVIF</th><th>Service URL</th><th>Status</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
    wrap.querySelectorAll('[data-discover-import]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hit = discoverHits[Number(btn.dataset.discoverImport)];
        if (!hit) return;
        try {
          await api.createCamera({
            name: hit.name,
            host: hit.host,
            port: hit.port,
            onvifUrl: hit.onvifUrl,
            manufacturer: hit.manufacturer,
            model: hit.model,
            onvifProfile: hit.onvifProfile,
            source: 'discovered',
            discoveredAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            username: settings.defaultUsername || '',
            password: settings.defaultPassword || '',
          });
          await refreshCameras();
          renderDiscoverResults();
          setMsg('cameras-discover-msg', `Added ${hit.name || hit.host} to inventory.`, true);
        } catch (e) {
          setMsg('cameras-discover-msg', e.message || String(e), false);
        }
      });
    });
  }

  function setSetting(id, fn) {
    const el = $(id);
    if (el) fn(el);
  }

  function fillSettingsForm() {
    setSetting('cam-set-system-enabled', (el) => { el.checked = settings.camerasEnabled !== false; });
    setSetting('cam-set-timeout', (el) => { el.value = String(settings.discoverTimeoutMs || 4000); });
    setSetting('cam-set-onvif-port', (el) => { el.value = String(settings.onvifPort || 8000); });
    setSetting('cam-set-rtsp-port', (el) => { el.value = String(settings.rtspPort || 554); });
    setSetting('cam-set-go2rtc-port', (el) => { el.value = String(settings.go2rtcPort || 1984); });
    setSetting('cam-set-mjpeg-ms', (el) => { el.value = String(settings.mjpegIntervalMs || 200); });
    setSetting('cam-set-stream-backend', (el) => { el.value = settings.streamBackend || 'go2rtc'; });
    setSetting('cam-set-user', (el) => { el.value = settings.defaultUsername || ''; });
    setSetting('cam-set-pass', (el) => { el.value = settings.defaultPassword || ''; });
    setSetting('cam-set-go2rtc-enabled', (el) => { el.checked = settings.go2rtcEnabled !== false; });
    setSetting('cam-set-auto-add', (el) => { el.checked = settings.autoAddDiscovered !== false; });
    setSetting('cam-set-auto-probe', (el) => { el.checked = settings.autoProbeOnDiscover !== false; });
    setSetting('cam-set-prefer-sub', (el) => { el.checked = settings.preferSubstream !== false; });
    setSetting('cam-set-gridfs-mirror', (el) => { el.checked = settings.gridfsMirrorAssets !== false; });
    setSetting('cam-set-snapshot-archive', (el) => { el.checked = settings.snapshotArchiveEnabled !== false; });
    setSetting('cam-set-snapshot-ms', (el) => { el.value = String(settings.snapshotIntervalMs || 60000); });
    setSetting('cam-set-snapshot-days', (el) => { el.value = String(settings.snapshotRetentionDays || 30); });
    setSetting('cam-set-ai-enabled', (el) => { el.checked = settings.cameraAiEnabled !== false; });
    setSetting('cam-set-ai-backend', (el) => { el.value = settings.cameraAiBackend || 'stub'; });
    setSetting('cam-set-ai-http-url', (el) => { el.value = settings.cameraAiHttpUrl || ''; });
    setSetting('cam-set-ai-model', (el) => { el.value = settings.cameraAiModelId || 'camera-vision'; });
    setSetting('cam-set-ai-alarm-threshold', (el) => { el.value = String(settings.cameraAiAlarmThreshold ?? 0.85); });
    setSetting('cam-set-ai-alarm-tag', (el) => { el.value = settings.cameraAiAlarmTagId || ''; });
    setSetting('cam-set-ai-post', (el) => { el.checked = settings.cameraAiPostCaptureEnabled !== false; });
    setSetting('cam-set-ai-live', (el) => { el.checked = settings.cameraAiLiveEnabled !== false; });
    setSetting('cam-set-ai-live-ms', (el) => { el.value = String(settings.cameraAiLiveIntervalMs || 5000); });
    setSetting('cam-set-ai-motion', (el) => { el.checked = settings.cameraAiMotionEnabled !== false; });
    setSetting('cam-set-ai-motion-cooldown', (el) => { el.value = String(settings.cameraAiMotionCooldownMs || 10000); });
    refreshGo2rtcStatus();
    refreshCameraAiStatus();
    refreshCloudAgentStatus();
    updateCameraSystemUi();
  }

  function updateCameraSystemUi() {
    const enabled = settings.camerasEnabled !== false;
    $('cameras-system-disabled-hint')?.classList.toggle('view-hidden', enabled);
    document.querySelectorAll(
      '#cam-set-go2rtc-enabled, #cam-set-auto-add, #cam-set-auto-probe, #cam-set-gridfs-mirror, '
      + '#cam-set-snapshot-archive, #cam-set-prefer-sub, #cam-set-ai-enabled, #cam-set-ai-post, '
      + '#cam-set-ai-live, #cam-set-ai-motion, #btn-cameras-discover, #btn-cameras-probe-all, '
      + '#btn-system-sync-go2rtc, #btn-system-ai-refresh',
    ).forEach((el) => {
      if (el) el.disabled = !enabled;
    });
  }

  function refreshCameraAiStatus() {
    const el = $('cameras-ai-status');
    if (!el || !api.cameraAiStatus) return Promise.resolve();
    return api.cameraAiStatus().then((data) => {
      const parts = [];
      if (data.enabled) parts.push(`AI ${data.backend}`);
      else parts.push('AI off');
      if (data.live?.running) parts.push(`live ${data.live.intervalMs}ms`);
      if (data.motion?.activeMonitors) parts.push(`motion x${data.motion.activeMonitors}`);
      if (data.alarmTagId) parts.push(`alarm→${data.alarmTagId}@${data.alarmThreshold}`);
      el.textContent = parts.join(' · ');
    }).catch(() => {});
  }

  async function refreshCloudAgentStatus() {
    const el = $('cameras-cloud-status');
    if (!el || !api.cloudAgent) return;
    try {
      const data = await api.cloudAgent();
      const a = data.agent || {};
      const cfg = data.config || {};
      if ($('cam-cloud-agent-enabled')) $('cam-cloud-agent-enabled').checked = !!cfg.enabled;
      if ($('cam-cloud-url') && !$('cam-cloud-url').dataset.touched) $('cam-cloud-url').value = cfg.cloudUrl || '';
      if ($('cam-cloud-site-id') && !$('cam-cloud-site-id').dataset.touched) $('cam-cloud-site-id').value = cfg.siteId || '';
      el.textContent = a.connected
        ? `Site agent connected · site=${a.siteId || '—'}`
        : (a.enabled ? `Site agent enabled but offline · site=${a.siteId || '—'}` : 'Site agent disabled');
      el.classList.toggle('ok', !!a.connected);
      el.classList.toggle('err', !!(a.enabled && !a.connected));
    } catch (e) {
      el.textContent = e.message || String(e);
      el.classList.add('err');
    }
  }

  async function saveCloudAgent() {
    if (!api.putCloudAgent) return;
    try {
      const data = await api.putCloudAgent({
        enabled: !!$('cam-cloud-agent-enabled')?.checked,
        cloudUrl: $('cam-cloud-url')?.value?.trim() || '',
        siteId: $('cam-cloud-site-id')?.value?.trim() || '',
        pairingCode: $('cam-cloud-pairing')?.value?.trim() || '',
        agentToken: $('cam-cloud-token')?.value?.trim() || undefined,
      });
      if ($('cam-cloud-pairing')) $('cam-cloud-pairing').value = '';
      setMsg('cameras-settings-msg', data.agent?.connected
        ? 'Cloud pairing saved — agent connected.'
        : 'Cloud pairing saved.', true);
      refreshCloudAgentStatus();
    } catch (e) {
      setMsg('cameras-settings-msg', e.message || String(e), false);
    }
  }

  function refreshGo2rtcStatus() {
    const el = $('cameras-go2rtc-status');
    if (!el || !api.go2rtcStatus) return Promise.resolve();
    if (!cameraSystemEnabled()) {
      el.textContent = 'Camera system off';
      el.classList.remove('ok', 'err');
      return Promise.resolve();
    }
    return api.go2rtcStatus().then(async (data) => {
      const parts = [];
      if (data.enabled) parts.push('go2rtc enabled');
      parts.push(data.running ? 'running' : 'stopped');
      if (data.binaryFound) parts.push(`binary: ${data.binaryPath}`);
      else parts.push('binary not found — run npm run go2rtc:download');
      if (api.gridfsStatus) {
        try {
          const gfs = await api.gridfsStatus();
          if (gfs?.status?.connected) parts.push('GridFS connected');
          else if (settings.gridfsMirrorAssets || settings.snapshotArchiveEnabled) {
            parts.push('GridFS unavailable (set mongoLogger.uri)');
          }
        } catch { /* ignore */ }
      }
      el.textContent = parts.join(' · ');
      el.classList.toggle('ok', !!data.running);
      el.classList.toggle('err', data.enabled && !data.binaryFound);
    }).catch((e) => {
      el.textContent = normalizeCameraError(e.message || String(e));
      el.classList.add('err');
    });
  }

  function openEditForm(cameraId) {
    editingId = cameraId || null;
    if (cameraId) selectedCameraId = cameraId;
    const form = $('camera-edit-form');
    const delBtn = $('btn-camera-delete');
    if (!form) return;
    form.classList.remove('view-hidden');
    $('camera-edit-title').textContent = cameraId ? 'Edit camera' : 'Add camera';
    delBtn?.classList.toggle('view-hidden', !cameraId);

    if (!cameraId) {
      $('cam-edit-id').value = '';
      $('cam-edit-id').readOnly = false;
      $('cam-edit-name').value = '';
      $('cam-edit-host').value = '';
      $('cam-edit-port').value = '80';
      $('cam-edit-onvif').value = '';
      $('cam-edit-viewer').value = '';
      $('cam-edit-rtsp').value = '';
      $('cam-edit-profile').value = '';
      $('cam-edit-user').value = settings.defaultUsername || '';
      $('cam-edit-pass').value = settings.defaultPassword || '';
      $('cam-edit-mfg').value = '';
      $('cam-edit-model').value = '';
      $('cam-edit-vendor').value = '';
      $('cam-edit-probe-status').value = '';
      $('cam-edit-probe-error').value = '';
      $('cam-edit-notes').value = '';
      return;
    }

    api.camera(cameraId).then((data) => {
      const c = data.camera;
      $('cam-edit-id').value = c.cameraId;
      $('cam-edit-id').readOnly = true;
      $('cam-edit-name').value = c.name || '';
      $('cam-edit-host').value = c.host || '';
      $('cam-edit-port').value = String(c.port || 80);
      $('cam-edit-onvif').value = c.onvifUrl || '';
      $('cam-edit-viewer').value = c.viewerUrl || '';
      $('cam-edit-rtsp').value = c.rtspUrl || '';
      $('cam-edit-profile').value = c.onvifProfile || '';
      $('cam-edit-user').value = c.username || '';
      $('cam-edit-pass').value = c.password || '';
      $('cam-edit-mfg').value = c.manufacturer || '';
      $('cam-edit-model').value = c.model || '';
      $('cam-edit-vendor').value = c.vendor || '';
      $('cam-edit-probe-status').value = c.probeStatus || '';
      $('cam-edit-probe-error').value = c.probeError || '';
      $('cam-edit-notes').value = c.notes || '';
    }).catch((e) => setMsg('cameras-inventory-msg', e.message, false));
  }

  function closeEditForm() {
    editingId = null;
    $('camera-edit-form')?.classList.add('view-hidden');
  }

  function collectEditForm() {
    return {
      cameraId: $('cam-edit-id')?.value?.trim() || undefined,
      name: $('cam-edit-name')?.value?.trim(),
      host: $('cam-edit-host')?.value?.trim(),
      port: Number($('cam-edit-port')?.value) || 80,
      onvifUrl: $('cam-edit-onvif')?.value?.trim(),
      viewerUrl: $('cam-edit-viewer')?.value?.trim(),
      rtspUrl: $('cam-edit-rtsp')?.value?.trim(),
      onvifProfile: $('cam-edit-profile')?.value || '',
      username: $('cam-edit-user')?.value || '',
      password: $('cam-edit-pass')?.value || '',
      notes: $('cam-edit-notes')?.value || '',
    };
  }

  async function saveEditForm(e) {
    e?.preventDefault();
    const body = collectEditForm();
    try {
      if (editingId) await api.updateCamera(editingId, body);
      else await api.createCamera(body);
      await refreshCameras();
      closeEditForm();
      setMsg('cameras-inventory-msg', 'Camera saved.', true);
      window.PeaklogicHmiCameras?.refreshPicker?.();
    } catch (err) {
      setMsg('cameras-inventory-msg', err.message || String(err), false);
    }
  }

  async function deleteCamera() {
    if (!editingId) return;
    if (!confirm(`Delete camera "${editingId}"?`)) return;
    try {
      await api.deleteCamera(editingId);
      if (selectedCameraId === editingId) selectedCameraId = null;
      await refreshCameras();
      closeEditForm();
      setMsg('cameras-inventory-msg', 'Camera deleted.', true);
      window.PeaklogicHmiCameras?.refreshPicker?.();
    } catch (e) {
      setMsg('cameras-inventory-msg', e.message, false);
    }
  }

  async function probeCameraById(cameraId, msgId = 'cameras-inventory-msg') {
    if (!guardCameraRuntime(msgId)) return;
    setMsg(msgId, `Probing ${cameraId} via ONVIF…`, true);
    try {
      const data = await api.probeCamera(cameraId, {
        username: $('cam-set-user')?.value || settings.defaultUsername || '',
        password: $('cam-set-pass')?.value || settings.defaultPassword || '',
        preferSubstream: $('cam-set-prefer-sub')?.checked ?? settings.preferSubstream !== false,
        rtspPort: Number($('cam-set-rtsp-port')?.value) || settings.rtspPort || 554,
      });
      await refreshCameras();
      if (editingId === cameraId && data.camera) {
        $('cam-edit-viewer').value = data.camera.viewerUrl || '';
        $('cam-edit-rtsp').value = data.camera.rtspUrl || '';
        $('cam-edit-onvif').value = data.camera.onvifUrl || '';
        $('cam-edit-vendor').value = data.camera.vendor || '';
        $('cam-edit-probe-status').value = data.camera.probeStatus || '';
        $('cam-edit-probe-error').value = data.camera.probeError || '';
      }
      const ok = data.probe?.ok;
      setMsg(msgId, ok
        ? `Probe OK — ${data.camera?.name || cameraId} ready`
        : `Probe failed: ${data.probe?.error || 'unknown error'}`, ok);
      window.PeaklogicHmiCameras?.refreshPicker?.();
      if (activeTab === 'detail') loadDetail();
    } catch (e) {
      setMsg(msgId, e.message || String(e), false);
    }
  }

  async function probeAllCameras() {
    if (!guardCameraRuntime('cameras-inventory-msg')) return;
    setMsg('cameras-inventory-msg', 'Probing all cameras via ONVIF…', true);
    try {
      const data = await api.probeAllCameras({
        username: $('cam-set-user')?.value || settings.defaultUsername || '',
        password: $('cam-set-pass')?.value || settings.defaultPassword || '',
        preferSubstream: $('cam-set-prefer-sub')?.checked ?? settings.preferSubstream !== false,
        rtspPort: Number($('cam-set-rtsp-port')?.value) || settings.rtspPort || 554,
      });
      cameras = data.cameras || cameras;
      populateCameraSelects();
      renderInventoryTable();
      const okN = (data.probed || []).filter((p) => p.ok).length;
      const total = (data.probed || []).length;
      setMsg('cameras-inventory-msg', `Probed ${okN}/${total} camera(s).`, okN === total);
      window.PeaklogicHmiCameras?.refreshPicker?.();
    } catch (e) {
      setMsg('cameras-inventory-msg', e.message || String(e), false);
    }
  }

  function testCamera(cameraId) {
    const cam = camById(cameraId);
    if (!cam) return;
    const url = viewerUrlFor(cam);
    if (!url) {
      setMsg('cameras-inventory-msg', 'No viewer URL — probe the camera or enable go2rtc in Settings.', false);
      return;
    }
    window.HmiView?.openCameraPopup?.(url, { title: cam.name || cam.cameraId });
  }

  async function runDiscover(msgId) {
    if (!guardCameraRuntime(msgId)) return;
    setMsg(msgId, 'Scanning network (WS-Discovery + subnet TCP sweep)…', true);
    try {
      const autoAdd = $('cam-set-auto-add')?.checked ?? settings.autoAddDiscovered !== false;
      const data = await api.discoverCameras({
        timeoutMs: Number($('cam-set-timeout')?.value) || settings.discoverTimeoutMs || 4000,
        subnetSweep: $('cam-discover-subnet-sweep')?.checked !== false,
        sweepPorts: [
          Number($('cam-set-onvif-port')?.value) || settings.onvifPort || 8000,
          80,
        ].filter((p, i, arr) => p > 0 && p <= 65535 && arr.indexOf(p) === i),
        autoAdd,
        autoProbe: ($('cam-set-auto-probe')?.checked ?? settings.autoProbeOnDiscover !== false) && autoAdd,
        username: $('cam-set-user')?.value || settings.defaultUsername || '',
        password: $('cam-set-pass')?.value || settings.defaultPassword || '',
      });
      discoverHits = data.discovered || [];
      needsSetupHits = data.needsSetup || [];
      cameras = data.cameras || cameras;
      settings = data.settings || settings;
      populateCameraSelects();
      renderInventoryTable();
      renderDiscoverResults();
      const added = (data.added || []).length;
      const updated = (data.updated || []).length;
      const probed = (data.probed || []).filter((p) => p.ok).length;
      const found = discoverHits.length;
      const ws = data.wsDiscoveryCount ?? 0;
      const sweep = data.subnetSweepCount ?? 0;
      const needs = needsSetupHits.length;
      const needsNote = needs ? ` ${needs} camera(s) need ONVIF enabled (see list above).` : '';
      const timeoutNote = data.sweepTimedOut
        ? ' Subnet sweep timed out — retry or disable extra network adapters.'
        : '';
      if (found === 0 && needs === 0) {
        setMsg(
          msgId,
          `No cameras found (WS-Discovery: ${ws}, subnet sweep: ${sweep}).${timeoutNote} Check the camera is on the same LAN/subnet as this PC, ONVIF is enabled (Reolink: port 8000, disabled by default), credentials are saved in Settings, then use Add by IP if you know the address.`,
          false,
        );
      } else if (found > 0 && !autoAdd) {
        setMsg(
          msgId,
          `Found ${found} ONVIF camera(s) (WS-Discovery: ${ws}, subnet sweep: ${sweep}).${needsNote}${timeoutNote} Click Add on a row to import, or enable auto-add in Settings.`,
          true,
        );
      } else {
        setMsg(
          msgId,
          `Found ${found} ONVIF camera(s) (WS-Discovery: ${ws}, subnet sweep: ${sweep}). Added ${added}, updated ${updated}, probed ${probed}.${needsNote}${timeoutNote}`,
          true,
        );
      }
      window.PeaklogicHmiCameras?.refreshPicker?.();
    } catch (e) {
      setMsg(msgId, e.message || String(e), false);
    }
  }

  async function addCameraByIp() {
    const host = ($('cameras-addip-host')?.value || '').trim();
    if (!host) {
      setMsg('cameras-discover-msg', 'Enter the camera IP address.', false);
      return;
    }
    if (!guardCameraRuntime('cameras-discover-msg')) return;
    setMsg('cameras-discover-msg', `Adding and probing ${host}…`, true);
    try {
      const data = await api.addCameraByIp({
        host,
        username: $('cam-set-user')?.value || settings.defaultUsername || '',
        password: $('cam-set-pass')?.value || settings.defaultPassword || '',
      });
      cameras = data.cameras || cameras;
      settings = data.settings || settings;
      populateCameraSelects();
      renderInventoryTable();
      renderCameraMenu();
      window.PeaklogicHmiCameras?.refreshPicker?.();
      if (data.ok) {
        setMsg('cameras-discover-msg', `${host} added and probed OK (${data.cameraId}). Use it from the top-bar camera icon or Inventory.`, true);
        if ($('cameras-addip-host')) $('cameras-addip-host').value = '';
      } else {
        setMsg('cameras-discover-msg', `${host} added (${data.cameraId}) but probe failed: ${data.error || 'no ONVIF response'}. Check ONVIF is enabled (port 8000) and the credentials in Settings.`, false);
      }
    } catch (e) {
      setMsg('cameras-discover-msg', e.message || String(e), false);
    }
  }

  async function refreshCameras() {
    const data = await api.cameras();
    cameras = data.cameras || [];
    settings = data.settings || settings;
    populateCameraSelects();
    renderInventoryTable();
    fillSettingsForm();
    renderCameraMenu();
    if (activeTab === 'overview') loadOverview();
  }

  function renderCameraMenu() {
    const menu = $('camera-menu');
    if (!menu) return;
    const empty = $('camera-menu-empty');
    const sep = $('camera-menu-sep');
    const list = cameras.slice().sort((a, b) => String(a.name || a.cameraId).localeCompare(String(b.name || b.cameraId)));
    menu.querySelectorAll('.topbar-camera-item').forEach((el) => el.remove());
    if (!list.length) {
      if (empty) empty.classList.remove('view-hidden');
      if (sep) sep.classList.add('view-hidden');
      return;
    }
    if (empty) empty.classList.add('view-hidden');
    if (sep) sep.classList.remove('view-hidden');
    const frag = document.createDocumentFragment();
    list.forEach((cam) => {
      const ready = cam.probeStatus === 'ok' || cam.hasStream || viewerUrlFor(cam);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'topbar-menu-item topbar-camera-item';
      btn.setAttribute('role', 'menuitem');
      btn.dataset.cameraId = cam.cameraId;
      btn.title = ready ? `Open live view: ${cam.name || cam.cameraId}` : `${cam.name || cam.cameraId} — probe camera first`;
      btn.innerHTML = `<span class="topbar-camera-item-dot ${cam.probeStatus === 'ok' ? 'ok' : ''}" aria-hidden="true"></span>`
        + `<span class="topbar-camera-item-name">${esc(cam.name || cam.cameraId)}</span>`
        + `<span class="topbar-camera-item-host muted">${esc(cam.host || '')}</span>`;
      frag.appendChild(btn);
    });
    menu.appendChild(frag);
  }

  function openCameraFromMenu(cameraId) {
    const cam = camById(cameraId);
    if (!cam) return;
    const url = viewerUrlFor(cam);
    const title = cam.name || cam.cameraId;
    const playerFallback = `/api/cameras/${encodeURIComponent(cameraId)}/player`;
    if (url) {
      window.HmiView?.openCameraPopup?.(url, { title, anchor: 'top' });
      return;
    }
    if (window.api?.cameraViewer) {
      window.api.cameraViewer(cameraId)
        .then((data) => {
          const resolved = String(data?.viewerUrl || '').trim() || playerFallback;
          window.HmiView?.openCameraPopup?.(resolved, { title: data.name || title, anchor: 'top' });
        })
        .catch(() => {
          window.HmiView?.openCameraPopup?.(playerFallback, { title, anchor: 'top' });
        });
      return;
    }
    window.HmiView?.openCameraPopup?.(playerFallback, { title, anchor: 'top' });
  }

  function bindCameraMenu() {
    const details = $('camera-menu-details');
    const menu = $('camera-menu');
    if (!details || !menu || details.dataset.bound === '1') return;
    details.dataset.bound = '1';
    details.addEventListener('toggle', () => {
      if (details.open) {
        refreshCameras().catch(() => renderCameraMenu());
      }
    });
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.topbar-camera-item');
      if (!btn) return;
      details.open = false;
      openCameraFromMenu(btn.dataset.cameraId);
    });
    document.addEventListener('click', (e) => {
      if (!details.open) return;
      if (!details.contains(e.target)) details.open = false;
    });
  }

  async function refreshAll() {
    await refreshCameras();
    loadActiveTab();
    setMsg('cameras-overview-msg', 'All panels refreshed.', true);
  }

  async function saveSettings() {
    try {
      const data = await api.putCameraSettings({
        camerasEnabled: !!$('cam-set-system-enabled')?.checked,
        discoverTimeoutMs: Number($('cam-set-timeout')?.value) || 4000,
        onvifPort: Number($('cam-set-onvif-port')?.value) || 8000,
        rtspPort: Number($('cam-set-rtsp-port')?.value) || 554,
        go2rtcPort: Number($('cam-set-go2rtc-port')?.value) || 1984,
        mjpegIntervalMs: Number($('cam-set-mjpeg-ms')?.value) || 200,
        streamBackend: $('cam-set-stream-backend')?.value || 'go2rtc',
        go2rtcEnabled: !!$('cam-set-go2rtc-enabled')?.checked,
        defaultUsername: $('cam-set-user')?.value || '',
        defaultPassword: $('cam-set-pass')?.value || '',
        autoAddDiscovered: !!$('cam-set-auto-add')?.checked,
        autoProbeOnDiscover: !!$('cam-set-auto-probe')?.checked,
        preferSubstream: !!$('cam-set-prefer-sub')?.checked,
        gridfsMirrorAssets: !!$('cam-set-gridfs-mirror')?.checked,
        snapshotArchiveEnabled: !!$('cam-set-snapshot-archive')?.checked,
        snapshotIntervalMs: Number($('cam-set-snapshot-ms')?.value) || 60000,
        snapshotRetentionDays: Number($('cam-set-snapshot-days')?.value) || 30,
        cameraAiEnabled: !!$('cam-set-ai-enabled')?.checked,
        cameraAiBackend: $('cam-set-ai-backend')?.value || 'stub',
        cameraAiHttpUrl: $('cam-set-ai-http-url')?.value?.trim() || '',
        cameraAiModelId: $('cam-set-ai-model')?.value?.trim() || 'camera-vision',
        cameraAiAlarmThreshold: Number($('cam-set-ai-alarm-threshold')?.value) || 0.85,
        cameraAiAlarmTagId: $('cam-set-ai-alarm-tag')?.value?.trim() || '',
        cameraAiPostCaptureEnabled: !!$('cam-set-ai-post')?.checked,
        cameraAiLiveEnabled: !!$('cam-set-ai-live')?.checked,
        cameraAiLiveIntervalMs: Number($('cam-set-ai-live-ms')?.value) || 5000,
        cameraAiMotionEnabled: !!$('cam-set-ai-motion')?.checked,
        cameraAiMotionCooldownMs: Number($('cam-set-ai-motion-cooldown')?.value) || 10000,
      });
      settings = data.settings || settings;
      setMsg('cameras-settings-msg', settings.camerasEnabled !== false
        ? 'Camera settings saved.'
        : 'Camera system disabled — streams, archive, and AI stopped.', true);
      updateCameraSystemUi();
      refreshGo2rtcStatus();
      refreshCameraAiStatus();
    } catch (e) {
      setMsg('cameras-settings-msg', e.message, false);
    }
  }

  async function syncGo2rtc(msgId = 'cameras-settings-msg') {
    if (!guardCameraRuntime(msgId)) return;
    setMsg(msgId, 'Syncing camera streams to go2rtc…', true);
    try {
      const data = await api.syncGo2rtc();
      const ok = (data.synced || []).filter((s) => s.ok).length;
      const total = (data.synced || []).length;
      setMsg(msgId, `Synced ${ok}/${total} stream(s) to go2rtc.`, true);
      refreshGo2rtcStatus();
      if (activeTab === 'system') loadSystem();
    } catch (e) {
      setMsg(msgId, e.message || String(e), false);
    }
  }

  async function captureSnapshot(cameraId, msgId = 'cameras-inventory-msg') {
    const id = cameraId || editingId || selectedCameraId;
    if (!id) {
      setMsg(msgId, 'Select a camera first.', false);
      return;
    }
    if (!guardCameraRuntime(msgId)) return;
    setMsg(msgId, 'Capturing snapshot…', true);
    try {
      const data = await api.captureCameraSnapshot(id);
      setMsg(msgId, `Snapshot archived (${data.snapshot?.fileId || 'ok'}).`, true);
      if (activeTab === 'archive') loadArchive();
      if (activeTab === 'detail') loadDetail();
    } catch (e) {
      setMsg(msgId, e.message || String(e), false);
    }
  }

  async function runInfer(cameraId, msgId = 'cameras-inventory-msg') {
    const id = cameraId || editingId || selectedCameraId;
    if (!id) {
      setMsg(msgId, 'Select a camera first.', false);
      return;
    }
    if (!guardCameraRuntime(msgId)) return;
    setMsg(msgId, 'Running AI inference…', true);
    try {
      const data = await api.inferCamera(id);
      const inf = data.result?.inference;
      setMsg(
        msgId,
        inf
          ? `AI: ${inf.label || '—'} score=${inf.score} (${data.result?.source || 'manual'})`
          : (data.result?.skipped ? `Skipped: ${data.result.reason}` : 'Inference complete.'),
        !!inf || data.result?.ok,
      );
      if (activeTab === 'ai') loadAiHistory();
    } catch (e) {
      setMsg(msgId, e.message || String(e), false);
    }
  }

  async function refreshAiMonitors(msgId = 'cameras-settings-msg') {
    try {
      await api.refreshCameraAi();
      refreshCameraAiStatus();
      setMsg(msgId, 'AI monitors refreshed.', true);
      if (activeTab === 'system') loadSystem();
    } catch (e) {
      setMsg(msgId, e.message || String(e), false);
    }
  }

  function refreshHmiPicker() {
    const sel = $('hmi-camera-pick');
    if (!sel) return Promise.resolve();
    return refreshCameras().then(() => {
      const cur = sel.value;
      sel.innerHTML = '<option value="">— from inventory —</option>'
        + cameras.map((c) => {
          const url = viewerUrlFor(c);
          if (!url && !c.cameraId) return '';
          return `<option value="${esc(url)}" data-camera-id="${esc(c.cameraId)}" data-name="${esc(c.name)}">${esc(c.name)} (${esc(c.host)})</option>`;
        }).join('');
      if (cur) sel.value = cur;
    }).catch(() => {});
  }

  function isCloudStudioHost() {
    return window.PEAKLOGIC_CLOUD_STUDIO === true
      || document.body?.dataset?.mvDeployment === 'cloud';
  }

  function showCloudPairingBanner(created, siteId) {
    const banner = $('cam-cloud-pairing-banner');
    if (!banner) return;
    const pairing = created?.pairingCode || '';
    const token = created?.agentToken || '';
    const id = created?.site?.siteId || siteId || '';
    if (!pairing && !token) {
      banner.innerHTML = '';
      return;
    }
    banner.innerHTML = `<div class="cs-pairing">
      <strong>Pairing keys for <code>${esc(id)}</code></strong>
      ${pairing ? `<p>Pairing code: <code>${esc(pairing)}</code></p>` : ''}
      ${token ? `<p>Agent token: <code>${esc(token)}</code></p>` : ''}
      <p class="muted">Copy now — paste on the edge appliance, then Save cloud pairing.</p>
    </div>`;
  }

  async function loadCloudSitesMini() {
    const host = $('cam-cloud-sites-table');
    const msg = $('cam-cloud-sites-msg');
    if (!host || !api.listSites) return;
    try {
      const data = await api.listSites();
      const sites = data.sites || [];
      if (!sites.length) {
        host.innerHTML = '<p class="muted">No remote sites yet. Create one above to get a pairing code.</p>';
      } else {
        host.innerHTML = `<table class="tags-table cameras-cloud-sites-table"><thead><tr>
          <th>Site</th><th>Name</th><th>Agent</th><th>Cameras</th><th></th>
        </tr></thead><tbody>
          ${sites.map((s) => `<tr>
            <td><code>${esc(s.siteId)}</code></td>
            <td>${esc(s.name || '—')}</td>
            <td>${s.agentOnline ? 'online' : 'offline'}</td>
            <td>${Number(s.cameraCount) || 0}</td>
            <td>
              <a class="btn btn-sm" href="/remote-sites/${encodeURIComponent(s.siteId)}/cameras">Cameras</a>
              <button type="button" class="btn btn-sm" data-cam-cloud-repair="${esc(s.siteId)}">Re-pair</button>
            </td>
          </tr>`).join('')}
        </tbody></table>`;
        host.querySelectorAll('[data-cam-cloud-repair]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const issued = await api.repairSite(btn.getAttribute('data-cam-cloud-repair'));
              showCloudPairingBanner(issued, btn.getAttribute('data-cam-cloud-repair'));
              await loadCloudSitesMini();
            } catch (e) {
              if (msg) setMsg('cam-cloud-sites-msg', e.message || String(e), false);
            }
          });
        });
      }
      if (msg) setMsg('cam-cloud-sites-msg', `${sites.length} remote site(s)`, true);
    } catch (e) {
      host.innerHTML = `<p class="err">${esc(e.message || String(e))}</p>`;
    }
  }

  function applyCloudStudioCameraUi() {
    if (!isCloudStudioHost()) return;
    $('cameras-cloud-host-panel')?.classList.remove('view-hidden');
    $('cameras-appliance-settings')?.classList.add('view-hidden');
    ['discover', 'system'].forEach((tab) => {
      document.querySelectorAll(`[data-cameras-tab-btn="${tab}"]`).forEach((el) => {
        el.classList.add('view-hidden');
      });
    });
    const settingsBtn = document.querySelector('[data-cameras-tab-btn="settings"]');
    if (settingsBtn) settingsBtn.textContent = 'Cloud pairing';
    $('btn-cam-cloud-create-site')?.addEventListener('click', async () => {
      try {
        const created = await api.createSite({
          siteId: $('cam-cloud-new-site-id')?.value?.trim() || undefined,
          name: $('cam-cloud-new-site-name')?.value?.trim() || undefined,
        });
        showCloudPairingBanner(created, created.site?.siteId);
        await loadCloudSitesMini();
      } catch (e) {
        setMsg('cam-cloud-sites-msg', e.message || String(e), false);
      }
    });
    $('btn-cam-cloud-refresh-sites')?.addEventListener('click', () => {
      loadCloudSitesMini().catch((e) => setMsg('cam-cloud-sites-msg', e.message || String(e), false));
    });
    loadCloudSitesMini().catch(() => {});
  }

  function bind() {
    applyCloudStudioCameraUi();
    bindCameraMenu();
    refreshCameras().catch(() => renderCameraMenu());
    document.querySelectorAll('[data-cameras-tab-btn]').forEach((b) => {
      b.addEventListener('click', () => showCamerasTab(b.dataset.camerasTabBtn));
    });
    $('btn-cameras-discover')?.addEventListener('click', () => {
      showCamerasTab('discover');
      runDiscover('cameras-discover-msg');
    });
    $('btn-cameras-refresh-all')?.addEventListener('click', () => refreshAll());
    $('btn-cameras-discover-tab')?.addEventListener('click', () => runDiscover('cameras-discover-msg'));
    $('btn-cameras-add-ip')?.addEventListener('click', () => addCameraByIp());
    $('cameras-addip-host')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCameraByIp(); }
    });
    $('btn-cameras-probe-all')?.addEventListener('click', () => probeAllCameras());
    $('btn-camera-snapshot')?.addEventListener('click', () => captureSnapshot());
    $('btn-camera-infer')?.addEventListener('click', () => runInfer());
    $('btn-cameras-ai-refresh')?.addEventListener('click', () => refreshAiMonitors());
    $('btn-camera-probe')?.addEventListener('click', () => {
      if (editingId) probeCameraById(editingId);
      else setMsg('cameras-inventory-msg', 'Save the camera first, then probe.', false);
    });
    $('btn-cameras-refresh')?.addEventListener('click', () => {
      refreshCameras().then(() => setMsg('cameras-inventory-msg', 'Inventory refreshed.', true)).catch((e) => setMsg('cameras-inventory-msg', e.message, false));
    });
    $('btn-camera-add')?.addEventListener('click', () => openEditForm(null));
    $('btn-camera-cancel-edit')?.addEventListener('click', closeEditForm);
    $('btn-camera-delete')?.addEventListener('click', deleteCamera);
    $('btn-camera-test')?.addEventListener('click', () => {
      const id = editingId || $('cameras-detail-select')?.value || '';
      const cam = id ? camById(id) : null;
      const url = $('cam-edit-viewer')?.value?.trim() || viewerUrlFor(cam) || (id ? `/api/cameras/${encodeURIComponent(id)}/player` : '');
      if (!url) {
        setMsg('cameras-inventory-msg', 'Save the camera first, then probe or enter a Viewer URL.', false);
        return;
      }
      window.HmiView?.openCameraPopup?.(url, { title: $('cam-edit-name')?.value?.trim() || cam?.name || 'Camera' });
    });
    $('camera-edit-form')?.addEventListener('submit', saveEditForm);
    $('btn-cameras-save-settings')?.addEventListener('click', saveSettings);
    $('cam-set-system-enabled')?.addEventListener('change', () => {
      settings = { ...settings, camerasEnabled: !!$('cam-set-system-enabled')?.checked };
      updateCameraSystemUi();
    });
    $('btn-cameras-sync-go2rtc')?.addEventListener('click', () => syncGo2rtc());
    $('btn-cameras-cloud-save')?.addEventListener('click', () => saveCloudAgent());
    $('btn-cameras-cloud-sync')?.addEventListener('click', async () => {
      try {
        await api.syncCloudAgent();
        setMsg('cameras-settings-msg', 'Inventory push requested.', true);
        refreshCloudAgentStatus();
      } catch (e) {
        setMsg('cameras-settings-msg', e.message || String(e), false);
      }
    });
    // Keep the status line live — connect can succeed after Save without a page reload.
    if ($('cameras-cloud-status') && !window.__mvCloudAgentPoll) {
      window.__mvCloudAgentPoll = setInterval(() => {
        refreshCloudAgentStatus().catch(() => {});
      }, 4000);
    }
    ['cam-cloud-url', 'cam-cloud-site-id'].forEach((id) => {
      $(id)?.addEventListener('input', () => { if ($(id)) $(id).dataset.touched = '1'; });
    });
    $('btn-system-sync-go2rtc')?.addEventListener('click', () => syncGo2rtc('cameras-system-msg'));
    $('btn-system-ai-refresh')?.addEventListener('click', () => refreshAiMonitors('cameras-system-msg'));
    $('btn-system-refresh')?.addEventListener('click', () => loadSystem());

    $('cameras-detail-select')?.addEventListener('change', () => {
      selectedCameraId = $('cameras-detail-select')?.value || null;
      loadDetail();
    });
    $('btn-detail-probe')?.addEventListener('click', () => {
      const id = $('cameras-detail-select')?.value;
      if (id) probeCameraById(id, 'cameras-detail-msg');
    });
    $('btn-detail-snapshot')?.addEventListener('click', () => captureSnapshot($('cameras-detail-select')?.value, 'cameras-detail-msg'));
    $('btn-detail-infer')?.addEventListener('click', () => runInfer($('cameras-detail-select')?.value, 'cameras-detail-msg'));
    $('btn-detail-popup')?.addEventListener('click', () => {
      const id = $('cameras-detail-select')?.value;
      if (id) testCamera(id);
    });
    $('btn-detail-edit')?.addEventListener('click', () => {
      const id = $('cameras-detail-select')?.value;
      if (id) { openEditForm(id); showCamerasTab('inventory'); }
    });

    $('btn-archive-refresh')?.addEventListener('click', () => loadArchive());
    $('cameras-archive-filter')?.addEventListener('change', () => loadArchive());
    $('btn-archive-capture')?.addEventListener('click', () => {
      const id = $('cameras-archive-filter')?.value || selectedCameraId;
      if (!id) {
        setMsg('cameras-archive-msg', 'Select a camera to capture.', false);
        return;
      }
      captureSnapshot(id, 'cameras-archive-msg');
    });

    $('btn-events-refresh')?.addEventListener('click', () => loadEvents());
    $('cameras-events-filter')?.addEventListener('change', () => loadEvents());
    $('cameras-events-type')?.addEventListener('change', () => loadEvents());

    $('btn-ai-refresh')?.addEventListener('click', () => loadAiHistory());
    $('cameras-ai-filter')?.addEventListener('change', () => loadAiHistory());
    $('cameras-ai-hours')?.addEventListener('change', () => loadAiHistory());
    $('btn-ai-infer-selected')?.addEventListener('click', () => {
      const id = $('cameras-ai-filter')?.value;
      if (!id) {
        setMsg('cameras-ai-msg', 'Select a camera from the filter.', false);
        return;
      }
      runInfer(id, 'cameras-ai-msg');
    });

    $('hmi-camera-pick')?.addEventListener('change', () => {
      const sel = $('hmi-camera-pick');
      const url = sel?.value || '';
      if (!url) return;
      const opt = sel.selectedOptions?.[0];
      const name = opt?.dataset?.name || opt?.textContent || '';
      const cameraId = opt?.dataset?.cameraId || '';
      const urlInput = $('hmi-camera-url');
      const idInput = $('hmi-camera-id');
      if (idInput) idInput.value = cameraId;
      if (urlInput) urlInput.value = url;
      const labelInput = $('hmi-tile-label-input');
      if (labelInput && !labelInput.value.trim() && name) {
        labelInput.value = name.split(' (')[0];
        labelInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      urlInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  window.PeaklogicCameras = {
    refresh: refreshCameras,
    open: () => {
      showCamerasTab(isCloudStudioHost() ? 'settings' : 'overview');
      if (isCloudStudioHost()) {
        loadCloudSitesMini().catch(console.error);
      } else {
        refreshCameras().catch(console.error);
      }
    },
  };

  window.PeaklogicHmiCameras = {
    refreshPicker: refreshHmiPicker,
  };

  window.PeaklogicCameraMenu = {
    render: renderCameraMenu,
    open: openCameraFromMenu,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
