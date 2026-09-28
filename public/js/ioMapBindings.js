'use strict';

(function () {
  const core = window.PeaklogicCore || {};
  const $ = core.$ || ((id) => document.getElementById(id));
  const esc = core.esc || ((s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'));

  const HMI_PROPS = ['fill', 'class', 'text', 'flashState', 'opacity', 'stroke'];

  let config = {
    screens: [],
    bindings: [],
    drivers: [],
    wiredTags: [],
    roomScreens: [],
    roomLampRoles: [],
    roomPopupEnabled: true,
    mirrorSuggestions: {},
    points: [],
  };
  let selectedTagId = '';
  let editorTagId = '';
  let draftBindings = [];
  let bindingsDirty = false;
  let panelBuilt = false;
  let statusTimer = null;
  let lastMirrorSig = '';
  let lastScreensSig = '';
  let lastRoomScreensSig = '';
  let bindingsUiBusyUntil = 0;

  function markBindingsUiBusy(ms = 4000) {
    bindingsUiBusyUntil = Math.max(bindingsUiBusyUntil, Date.now() + ms);
  }

  function bindingsUiBusy() {
    if (Date.now() < bindingsUiBusyUntil) return true;
    if (bindingsPanelHasFocus()) return true;
    const panel = $('io-map-bindings-panel');
    return !!panel?.matches?.(':focus-within');
  }

  function parseRoomTag(tagId) {
    const m = /^([A-Za-z]+\d+)_(.+)$/.exec(String(tagId || '').trim());
    if (!m) return null;
    const roomNum = Number(String(m[1]).replace(/^RM/i, ''));
    return {
      prefix: m[1].toUpperCase(),
      suffix: m[2].toUpperCase(),
      roomNum: Number.isFinite(roomNum) && roomNum > 0 ? roomNum : null,
    };
  }

  function defaultRoomScreen(tagId) {
    const parsed = parseRoomTag(tagId);
    if (!parsed?.roomNum) return config.roomScreens[0] || null;
    const pad = String(parsed.roomNum).padStart(3, '0');
    return config.roomScreens.find((r) => r.screenId === `screen_rm_${pad}`)
      || config.roomScreens.find((r) => r.roomNum === parsed.roomNum)
      || null;
  }

  function defaultLampRole(tagId) {
    const parsed = parseRoomTag(tagId);
    if (!parsed) return '';
    const hit = (config.roomLampRoles || []).find(
      (r) => String(r.tagSuffix).toUpperCase() === parsed.suffix,
    );
    return hit?.elementSuffix || '';
  }

  function bindingsPanelHasFocus() {
    const host = $('io-map-bindings-body');
    const active = document.activeElement;
    if (!host || !active || !host.contains(active)) return false;
    const tag = active.tagName?.toLowerCase();
    return tag === 'select' || tag === 'input' || tag === 'textarea' || tag === 'button';
  }

  function screensSig() {
    return (config.screens || []).map((s) => s.id).join('\0');
  }

  function roomScreensSig() {
    return (config.roomScreens || []).map((r) => r.screenId).join('\0');
  }

  function mirrorCandidatesSig(tagId) {
    return mirrorCandidates(tagId).map((t) => t.id).join('\0');
  }

  function setStatus(msg, ok) {
    const el = $('io-map-bindings-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = ok === true
      ? 'io-map-bindings-status ok-text'
      : ok === false
        ? 'io-map-bindings-status err-text'
        : 'io-map-bindings-status muted';
    if (statusTimer) clearTimeout(statusTimer);
    if (msg) {
      statusTimer = setTimeout(() => {
        if (el.textContent === msg) el.textContent = '';
      }, 6000);
    }
  }

  function tagMeta(tagId) {
    return config.wiredTags.find((t) => t.id === tagId)
      || config.points?.find((p) => p.id === tagId)
      || null;
  }

  function bindingsForTag(tagId) {
    return draftBindings.filter((b) => b.tagId === tagId);
  }

  function mirrorCandidates(tagId) {
    return (config.wiredTags || []).filter((t) => t.id !== tagId && t.driverId);
  }

  function mirrorOptionLabel(t) {
    const addr = t.driverAddress?.deviceId
      ? ` · ${t.driverAddress.deviceId}.${t.driverAddress.field || ''}`
      : '';
    return `${t.id} → ${t.driverId}${addr}`;
  }

  function mirrorOptionsHtml(tagId, selectedId) {
    const mirrors = mirrorCandidates(tagId);
    const suggestedId = config.mirrorSuggestions?.[tagId] || '';
    const mkOpt = (t, preferSelect) => {
      const sel = (preferSelect || t.id === selectedId) ? ' selected' : '';
      return `<option value="${esc(t.id)}"${sel}>${esc(mirrorOptionLabel(t))}</option>`;
    };
    const suggested = suggestedId ? mirrors.find((t) => t.id === suggestedId) : null;
    const nc = mirrors.filter((t) => /^NC_/i.test(t.id) && t.id !== suggestedId);
    const other = mirrors.filter((t) => !/^NC_/i.test(t.id) && t.id !== suggestedId);
    let html = '<option value="">— select wired tag —</option>';
    if (suggested) {
      html += `<optgroup label="Suggested for this tag">${mkOpt(suggested, !selectedId)}</optgroup>`;
    }
    if (nc.length) {
      html += `<optgroup label="NextCentury (NC_*)">${nc.map((t) => mkOpt(t)).join('')}</optgroup>`;
    }
    if (other.length) {
      html += `<optgroup label="Other wired tags">${other.map((t) => mkOpt(t)).join('')}</optgroup>`;
    }
    return html;
  }

  function updateMirrorHint() {
    const el = $('io-map-mirror-hint');
    if (!el) return;
    const sug = config.mirrorSuggestions?.[selectedTagId];
    el.textContent = sug
      ? `Suggested mirror for ${selectedTagId}: ${sug}`
      : '';
    el.classList.toggle('view-hidden', !sug);
  }

  function refreshMirrorIfNeeded(force = false) {
    if (!selectedTagId) return;
    const sig = mirrorCandidatesSig(selectedTagId);
    if (!force && sig === lastMirrorSig) return;
    refreshMirrorSelect(true);
  }

  function screenOptionsHtml(selectedId, { includeRoomOnly = false } = {}) {
    const roomIds = new Set((config.roomScreens || []).map((r) => r.screenId));
    const roomScreens = (config.screens || []).filter((s) => roomIds.has(s.id));
    const otherScreens = includeRoomOnly
      ? []
      : (config.screens || []).filter((s) => !roomIds.has(s.id));

    const mkOpts = (list) => list.map((s) => {
      const id = s.id;
      const sel = id === selectedId ? ' selected' : '';
      return `<option value="${esc(id)}"${sel}>${esc(s.name || id)}</option>`;
    }).join('');

    let html = '';
    if (roomScreens.length) {
      html += `<optgroup label="Room detail screens">${mkOpts(roomScreens)}</optgroup>`;
    }
    if (otherScreens.length) {
      html += `<optgroup label="Other screens">${mkOpts(otherScreens)}</optgroup>`;
    }
    if (!html) {
      html = `<option value="screen_1"${selectedId === 'screen_1' ? ' selected' : ''}>screen_1</option>`;
    }
    return html;
  }

  function roomScreenOptionsHtml(selectedId, tagId) {
    const def = defaultRoomScreen(tagId);
    const sel = selectedId || def?.screenId || '';
    return (config.roomScreens || []).map((r) => {
      const id = r.screenId;
      const label = r.name || (r.roomNum ? `Room ${r.roomNum}` : id);
      const picked = id === sel ? ' selected' : '';
      return `<option value="${esc(id)}"${picked}>${esc(label)}</option>`;
    }).join('') || '<option value="">No room_detail screens</option>';
  }

  function lampRoleOptionsHtml(selectedSuffix, tagId) {
    const def = selectedSuffix || defaultLampRole(tagId);
    return (config.roomLampRoles || []).map((r) => {
      const picked = r.elementSuffix === def ? ' selected' : '';
      return `<option value="${esc(r.elementSuffix)}"${picked}>${esc(r.label || r.elementSuffix)}</option>`;
    }).join('');
  }

  function fillSelectOptions(selectEl, html, preferredValue) {
    if (!selectEl) return;
    const prev = selectEl.value;
    selectEl.innerHTML = html;
    const want = preferredValue || prev;
    if (want && [...selectEl.options].some((o) => o.value === want)) {
      selectEl.value = want;
    }
  }

  function updateWiredLine() {
    const el = $('io-map-wired-line');
    if (!el || !selectedTagId) return;
    const meta = tagMeta(selectedTagId);
    const wired = meta?.driverId
      ? `${esc(meta.driverId)}${meta.driverAddress?.deviceId
        ? ` · ${esc(meta.driverAddress.deviceId)}.${esc(meta.driverAddress.field || '')}`
        : ''}`
      : '<span class="err-text">Not wired</span>';
    el.innerHTML = wired;
  }

  function renderBindingsTable(force = false) {
    if (!force && bindingsUiBusy()) return;
    const tbody = $('io-map-bindings-rows');
    if (!tbody || !selectedTagId) return;
    const rows = bindingsForTag(selectedTagId).map((b) => {
      const globalIdx = draftBindings.indexOf(b);
      return `<tr data-bind-idx="${globalIdx}">
        <td><select data-bind-screen>${screenOptionsHtml(b.screenId)}</select></td>
        <td><input data-bind-element value="${esc(b.elementId || '')}" placeholder="element id" list="io-map-element-ids"></td>
        <td><select data-bind-prop>${HMI_PROPS.map((p) =>
          `<option value="${p}"${b.property === p ? ' selected' : ''}>${p}</option>`).join('')}</select></td>
        <td><button type="button" class="btn btn-sm danger" data-bind-del="${globalIdx}">×</button></td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows || '<tr><td colspan="4" class="muted">No bindings for this tag</td></tr>';
    bindTableHandlers(tbody);
  }

  function bindTableHandlers(root) {
    root.querySelectorAll('[data-bind-del]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.bindDel);
        if (Number.isFinite(idx) && idx >= 0) {
          draftBindings.splice(idx, 1);
          bindingsDirty = true;
          renderBindingsTable(true);
        }
      };
    });
    root.querySelectorAll('[data-bind-screen], [data-bind-element], [data-bind-prop]').forEach((el) => {
      el.onchange = () => { collectBindingEdits(); bindingsDirty = true; };
      el.oninput = () => { collectBindingEdits(); bindingsDirty = true; };
    });
  }

  function bindStaticHandlers() {
    $('io-map-apply-mirror')?.addEventListener('click', applyMirror);
    $('io-map-clear-wire')?.addEventListener('click', clearWire);
    $('io-map-add-binding')?.addEventListener('click', addBinding);
    $('io-map-save-bindings')?.addEventListener('click', saveBindings);
    $('io-map-bind-room-template')?.addEventListener('click', bindRoomTemplate);
  }

  function buildPanelShell() {
    const host = $('io-map-bindings-body');
    if (!host || panelBuilt) return;
    host.innerHTML = `
      <div id="io-map-tag-header" class="io-map-bindings-tag view-hidden">
        <strong id="io-map-tag-id"></strong>
        <span id="io-map-tag-meta" class="muted"></span>
      </div>
      <div id="io-map-empty-hint" class="muted">Select an I/O point to wire driver I/O and edit HMI screen bindings.</div>
      <div id="io-map-editor" class="view-hidden">
        <section class="io-map-bindings-section">
          <h3>Driver I/O</h3>
          <p class="panel-hint">Wire this tag to a field device (e.g. mirror from a NextCentury <code>NC_*</code> tag).</p>
          <p id="io-map-wired-line" class="cell-mono">—</p>
          <p id="io-map-mirror-hint" class="panel-hint view-hidden"></p>
          <div class="toolbar wrap">
            <label>Mirror from
              <select id="io-map-mirror-from">
                <option value="">— select wired tag —</option>
              </select>
            </label>
            <button type="button" class="btn btn-sm primary" id="io-map-apply-mirror">Apply mirror</button>
            <button type="button" class="btn btn-sm" id="io-map-clear-wire">Clear wire</button>
          </div>
        </section>
        <section class="io-map-bindings-section io-map-room-template-section">
          <h3>Room detail template</h3>
          <p id="io-map-room-popup-note" class="panel-hint view-hidden">Floor-plan room popups use the shared <code>@room_popup</code> template — lamps bind automatically when you open a room from the floor plan. Use this section for dedicated <code>screen_rm_###</code> detail screens.</p>
          <div class="toolbar wrap">
            <label>Room screen
              <select id="io-map-room-screen"></select>
            </label>
            <label>Lamp / element
              <select id="io-map-room-role"></select>
            </label>
            <button type="button" class="btn btn-sm primary" id="io-map-bind-room-template">Bind to room template</button>
          </div>
        </section>
        <section class="io-map-bindings-section">
          <h3>HMI screen bindings</h3>
          <p class="panel-hint">Manual bindings for any screen. Element ids on room tiles look like <code>t1_1_z0__lamp_ac_pan</code>.</p>
          <table class="data-table io-map-bindings-table">
            <thead><tr><th>Screen</th><th>Element id</th><th>Property</th><th></th></tr></thead>
            <tbody id="io-map-bindings-rows"></tbody>
          </table>
          <div class="toolbar wrap">
            <label>Screen <select id="io-map-new-screen"></select></label>
            <label>Element <input id="io-map-new-element" placeholder="e.g. t1_1_z0__lamp_ac_pan" list="io-map-element-ids"></label>
            <label>Property <select id="io-map-new-prop">${HMI_PROPS.map((p) => `<option value="${p}">${p}</option>`).join('')}</select></label>
            <button type="button" class="btn btn-sm" id="io-map-add-binding">Add binding</button>
            <button type="button" class="btn btn-sm primary" id="io-map-save-bindings">Save bindings</button>
          </div>
          <datalist id="io-map-element-ids"></datalist>
        </section>
      </div>`;
    bindStaticHandlers();
    bindPanelInteractionLock();
    panelBuilt = true;
  }

  function bindPanelInteractionLock() {
    const panel = $('io-map-bindings-panel');
    if (!panel || panel.dataset.uiLockBound === '1') return;
    panel.dataset.uiLockBound = '1';
    const busy = () => markBindingsUiBusy(5000);
    panel.addEventListener('mousedown', busy);
    panel.addEventListener('focusin', busy);
    panel.addEventListener('keydown', busy);
    panel.addEventListener('change', () => markBindingsUiBusy(1500));
    panel.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!bindingsPanelHasFocus() && !panel.matches(':focus-within')) {
          bindingsUiBusyUntil = 0;
        }
      }, 250);
    });
  }

  function refreshMirrorSelect(force = false) {
    if (!force && bindingsUiBusy()) return;
    const sel = $('io-map-mirror-from');
    if (!sel) return;
    const sig = mirrorCandidatesSig(selectedTagId);
    if (!force && sig === lastMirrorSig && sel.options.length > 1) return;
    lastMirrorSig = sig;
    const prev = sel.value;
    const suggested = config.mirrorSuggestions?.[selectedTagId] || '';
    fillSelectOptions(
      sel,
      mirrorOptionsHtml(selectedTagId, prev),
      prev || suggested,
    );
    updateMirrorHint();
  }

  function refreshRoomTemplateControls(force = false) {
    if (!force && bindingsUiBusy()) return;
    const roomSel = $('io-map-room-screen');
    const roleSel = $('io-map-room-role');
    const note = $('io-map-room-popup-note');
    const rsSig = roomScreensSig();
    if (force || rsSig !== lastRoomScreensSig) {
      lastRoomScreensSig = rsSig;
      if (roomSel) {
        fillSelectOptions(roomSel, roomScreenOptionsHtml(roomSel.value, selectedTagId));
      }
    } else if (roomSel && !roomSel.value && selectedTagId) {
      fillSelectOptions(roomSel, roomScreenOptionsHtml('', selectedTagId));
    }
    if (roleSel && (force || !roleSel.value)) {
      fillSelectOptions(roleSel, lampRoleOptionsHtml(roleSel.value, selectedTagId));
    }
    if (note) note.classList.toggle('view-hidden', !config.roomPopupEnabled);
    const section = document.querySelector('.io-map-room-template-section');
    if (section) {
      section.classList.toggle('view-hidden', !(config.roomScreens || []).length);
    }
  }

  function refreshNewBindingControls(force = false) {
    if (!force && bindingsUiBusy()) return;
    const screenSel = $('io-map-new-screen');
    const sSig = screensSig();
    if (screenSel && (force || sSig !== lastScreensSig)) {
      lastScreensSig = sSig;
      const prev = screenSel.value;
      fillSelectOptions(
        screenSel,
        screenOptionsHtml(prev || defaultRoomScreen(selectedTagId)?.screenId || config.screens[0]?.id),
        prev,
      );
    }
    const dl = $('io-map-element-ids');
    if (dl && force) {
      const ids = new Set(draftBindings.map((b) => b.elementId).filter(Boolean));
      dl.innerHTML = [...ids].map((id) => `<option value="${esc(id)}">`).join('');
    }
  }

  function showEditorForTag(force = false) {
    buildPanelShell();
    const empty = $('io-map-empty-hint');
    const editor = $('io-map-editor');
    const header = $('io-map-tag-header');
    if (!selectedTagId) {
      editorTagId = '';
      empty?.classList.remove('view-hidden');
      editor?.classList.add('view-hidden');
      header?.classList.add('view-hidden');
      return;
    }
    empty?.classList.add('view-hidden');
    editor?.classList.remove('view-hidden');
    header?.classList.remove('view-hidden');
    const meta = tagMeta(selectedTagId);
    const idEl = $('io-map-tag-id');
    const metaEl = $('io-map-tag-meta');
    if (idEl) idEl.textContent = selectedTagId;
    if (metaEl) metaEl.textContent = `${meta?.role || ''} · ${meta?.type || ''}`.trim();

    const sameTag = !force && editorTagId === selectedTagId && panelBuilt;
    editorTagId = selectedTagId;
    updateWiredLine();

    if (sameTag) return;

    lastMirrorSig = '';
    lastScreensSig = '';
    lastRoomScreensSig = '';
    refreshMirrorSelect(true);
    refreshRoomTemplateControls(true);
    refreshNewBindingControls(true);
    renderBindingsTable(true);
  }

  function collectBindingEdits() {
    const tbody = $('io-map-bindings-rows');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-bind-idx]').forEach((tr) => {
      const idx = Number(tr.dataset.bindIdx);
      if (!Number.isFinite(idx) || !draftBindings[idx]) return;
      const screenEl = tr.querySelector('[data-bind-screen]');
      const elementEl = tr.querySelector('[data-bind-element]');
      const propEl = tr.querySelector('[data-bind-prop]');
      draftBindings[idx] = {
        ...draftBindings[idx],
        screenId: screenEl?.value || draftBindings[idx].screenId,
        elementId: elementEl?.value?.trim() || draftBindings[idx].elementId,
        property: propEl?.value || draftBindings[idx].property || 'fill',
      };
    });
  }

  async function applyMirror() {
    const src = $('io-map-mirror-from')?.value?.trim();
    if (!selectedTagId) return;
    if (!src) {
      setStatus('Choose a wired tag to mirror from', false);
      return;
    }
    setStatus('Applying driver wire…');
    try {
      const r = await window.api.patchIoMapTag(selectedTagId, { mirrorFromTagId: src });
      const row = config.wiredTags.find((t) => t.id === selectedTagId);
      if (row) Object.assign(row, r.tag);
      else config.wiredTags.push(r.tag);
      setStatus(`Wired ${selectedTagId} from ${src}`, true);
      updateWiredLine();
    } catch (e) {
      setStatus(e.message || 'Wire failed', false);
    }
  }

  async function clearWire() {
    if (!selectedTagId) return;
    if (!window.confirm(`Clear driver wire for ${selectedTagId}?`)) return;
    setStatus('Clearing wire…');
    try {
      const r = await window.api.patchIoMapTag(selectedTagId, { driverId: '', driverAddress: null });
      const row = config.wiredTags.find((t) => t.id === selectedTagId);
      if (row) Object.assign(row, r.tag);
      setStatus(`Cleared wire on ${selectedTagId}`, true);
      updateWiredLine();
    } catch (e) {
      setStatus(e.message || 'Clear failed', false);
    }
  }

  async function bindRoomTemplate() {
    if (!selectedTagId) return;
    const screenId = $('io-map-room-screen')?.value?.trim();
    const elementSuffix = $('io-map-room-role')?.value?.trim();
    if (!screenId) {
      setStatus('Choose a room detail screen', false);
      return;
    }
    if (!elementSuffix) {
      setStatus('Choose a lamp / element role', false);
      return;
    }
    setStatus('Binding room template…');
    try {
      const r = await window.api.bindIoMapRoomTemplate({
        tagId: selectedTagId,
        screenId,
        elementSuffix,
      });
      config.bindings = r.bindings || config.bindings;
      draftBindings = (config.bindings || []).map((b) => ({ ...b }));
      bindingsDirty = false;
      setStatus(
        r.replaced
          ? `Updated room binding on ${screenId}`
          : `Added room binding on ${screenId} (${r.binding?.elementId || elementSuffix})`,
        true,
      );
      renderBindingsTable(true);
      refreshNewBindingControls(true);
    } catch (e) {
      setStatus(e.message || 'Room template bind failed', false);
    }
  }

  function addBinding() {
    if (!selectedTagId) return;
    const screenId = $('io-map-new-screen')?.value || (config.screens[0]?.id || 'screen_1');
    const elementId = $('io-map-new-element')?.value?.trim();
    const property = $('io-map-new-prop')?.value || 'fill';
    if (!elementId) {
      setStatus('Element id is required', false);
      return;
    }
    draftBindings.push({ screenId, elementId, tagId: selectedTagId, property });
    bindingsDirty = true;
    renderBindingsTable(true);
    refreshNewBindingControls(true);
    setStatus('Binding added — click Save bindings', true);
  }

  async function saveBindings() {
    collectBindingEdits();
    setStatus('Saving HMI bindings…');
    try {
      const r = await window.api.putIoMapBindings(draftBindings);
      config.bindings = r.bindings || draftBindings;
      draftBindings = (config.bindings || []).map((b) => ({ ...b }));
      bindingsDirty = false;
      setStatus(`Saved ${draftBindings.length} binding(s)`, true);
      renderBindingsTable(true);
    } catch (e) {
      setStatus(e.message || 'Save failed', false);
    }
  }

  function selectTag(tagId) {
    const next = String(tagId || '').trim();
    if (next === selectedTagId) return;
    selectedTagId = next;
    document.querySelectorAll('[data-io-id].io-map-selected').forEach((el) => {
      el.classList.remove('io-map-selected');
    });
    if (selectedTagId) {
      document.querySelectorAll('[data-io-id]').forEach((el) => {
        if (el.dataset.ioId === selectedTagId) el.classList.add('io-map-selected');
      });
    }
    showEditorForTag(true);
  }

  function mergeWiredTags(incoming) {
    const byId = new Map((config.wiredTags || []).map((t) => [t.id, t]));
    for (const t of incoming || []) {
      if (!t?.id) continue;
      byId.set(t.id, { ...(byId.get(t.id) || {}), ...t });
    }
    config.wiredTags = [...byId.values()];
  }

  function loadConfig(data, opts = {}) {
    const liveOnly = opts.liveOnly === true || data?.__liveOnly === true;
    const points = data?.points || [];
    config.points = points;
    if (liveOnly) {
      mergeWiredTags(data?.wiredTags);
      if (data?.mirrorSuggestions && typeof data.mirrorSuggestions === 'object') {
        config.mirrorSuggestions = data.mirrorSuggestions;
      }
      if (selectedTagId && !bindingsUiBusy() && !bindingsDirty) {
        updateWiredLine();
        refreshMirrorIfNeeded(false);
      }
      return;
    }

    config.drivers = data?.drivers || [];
    config.roomPopupEnabled = data?.roomPopupEnabled !== false;
    config.roomLampRoles = data?.roomLampRoles || config.roomLampRoles;
    config.mirrorSuggestions = data?.mirrorSuggestions || config.mirrorSuggestions || {};

    mergeWiredTags(data?.wiredTags);

    const screensChanged = screensSig() !== (data?.screens || []).map((s) => s.id).join('\0');
    const roomChanged = roomScreensSig() !== (data?.roomScreens || []).map((r) => r.screenId).join('\0');
    config.screens = data?.screens || [];
    config.roomScreens = data?.roomScreens || [];

    if (!bindingsDirty && Array.isArray(data?.bindings)) {
      config.bindings = data.bindings;
      draftBindings = data.bindings.map((b) => ({ ...b }));
    }

    if (selectedTagId && !points.some((p) => p.id === selectedTagId)) {
      // Keep selection even if tag list reordered — only clear if truly gone
      if (!points.length || !data?.points) {
        selectedTagId = '';
        editorTagId = '';
      }
    }

    buildPanelShell();

    if (!selectedTagId) {
      showEditorForTag();
      return;
    }

    // Poll path: update text only — never rebuild dropdowns while user is editing
    if (bindingsUiBusy() || bindingsDirty) {
      updateWiredLine();
      return;
    }

    updateWiredLine();

    if (screensChanged) {
      lastScreensSig = '';
      refreshNewBindingControls(true);
    }
    if (roomChanged) {
      lastRoomScreensSig = '';
      refreshRoomTemplateControls(true);
    }

    refreshMirrorIfNeeded(false);

    if (editorTagId !== selectedTagId) {
      showEditorForTag(true);
    }
  }

  function bindIoPointClicks() {
    bindPanelInteractionLock();
    const panel = $('io-map-panel');
    if (!panel || panel.dataset.bindingsBound === '1') return;
    panel.dataset.bindingsBound = '1';
    panel.addEventListener('click', (e) => {
      if (e.target.closest('#io-map-bindings-panel')) return;
      const row = e.target.closest('[data-io-id]');
      if (!row?.dataset.ioId) return;
      selectTag(row.dataset.ioId);
    });
  }

  window.PeaklogicIoMapBindings = {
    loadConfig,
    bindIoPointClicks,
    selectTag,
    isUiBusy: bindingsUiBusy,
    getSelectedTagId: () => selectedTagId,
  };
})();
