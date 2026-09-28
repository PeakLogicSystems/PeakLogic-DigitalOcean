'use strict';

/** ST program editor, library, and scan runtime controls */
window.PeaklogicProgram = (function () {
  const { $, esc, on, onChange } = window.PeaklogicCore;

  let deps = null;
  let programActivePath = '';
  let programStDir = '';
  let programEditLock = false;
  let programLoadGuardUntil = 0;
  let programTagRefs = [];
  let programCatalog = [];
  let programLoading = false;
  let lastProgramMetaKey = '';
  let stEditor = null;
  let traceDebugOn = false;
  let lastDebugTrace = [];

  const ST_NEW_TEMPLATE = '(* New ST program — edit and Save program *)\nIF IsON(DI) THEN TurnON(Q); END_IF;\n';
  let stParcMaxLines = 500;
  const liveIoPref = () => window.PeaklogicLiveIoUpdate || {};

  function programMetaKey(meta, activeProgram) {
    const m = meta && typeof meta === 'object' ? meta : {};
    const path = String(m.path || activeProgram || programActivePath || '');
    const mtimeMs = Number(m.mtimeMs) || 0;
    const size = Number(m.size) || 0;
    return `${path}|${mtimeMs}|${size}`;
  }

  function countStLines(source) {
    if (source == null || source === '') return 0;
    const lines = String(source).split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      return lines.length - 1;
    }
    return lines.length;
  }

  function assessLinesClient(source, forParc) {
    const lines = countStLines(source);
    if (!forParc) {
      return { lines, limit: null, overLimit: false, pct: 0 };
    }
    const limit = stParcMaxLines;
    return {
      lines,
      limit,
      overLimit: lines > limit,
      pct: limit > 0 ? Math.min(100, Math.round((lines / limit) * 100)) : 0,
    };
  }

  function isRemoteExecutionOn() {
    return d().getLastSettings?.()?.remoteExecution === true
      || $('prog-remote-exec')?.checked === true;
  }

  function renderProgramLineStatus() {
    const el = $('prog-line-status');
    if (!el) return;
    const src = $('program-src')?.value ?? '';
    const local = assessLinesClient(src, false);
    const parc = assessLinesClient(src, true);
    const remote = isRemoteExecutionOn();
    const parts = [`${local.lines} lines (PC)`];
    if (remote) parts.push(`${parc.lines} / ${parc.limit} (Parc deploy)`);
    el.textContent = parts.join(' · ');
    const overParc = remote && parc.overLimit;
    el.className = overParc
      ? 'prog-line-status err cell-mono'
      : ((remote && parc.pct >= 85)
        ? 'prog-line-status warn cell-mono'
        : 'prog-line-status muted cell-mono');
    el.title = overParc
      ? `Trim ST program to ${parc.limit} lines or less for Parc/Opta deploy`
      : (remote
        ? `PC/Linux: no size limit · Parc/Opta deploy limit ${parc.limit} lines`
        : 'PC/Linux runtime — no program size limit');
  }

  function syncProgramLineStatusFromDashboard(data) {
    if (data?.programLimits?.parcMaxLines) stParcMaxLines = data.programLimits.parcMaxLines;
    renderProgramLineStatus();
  }

  function readLiveIoUpdatePref() {
    return liveIoPref().readLiveIoUpdatePref?.() ?? true;
  }

  function writeLiveIoUpdatePref(on) {
    liveIoPref().writeLiveIoUpdatePref?.(on);
  }

  function isLiveIoUpdateEnabled() {
    const cb = $('live-io-update');
    if (cb) return cb.checked;
    return readLiveIoUpdatePref();
  }

  function shouldRefreshLiveIo(runtime) {
    return liveIoPref().shouldUpdateLiveIo?.(runtime, isLiveIoUpdateEnabled()) ?? true;
  }

  function bindLiveIoUpdateCheckbox() {
    const cb = $('live-io-update');
    if (!cb || cb.dataset.bound === '1') return;
    cb.dataset.bound = '1';
    cb.checked = readLiveIoUpdatePref();
    cb.addEventListener('change', () => {
      writeLiveIoUpdatePref(cb.checked);
      if (cb.checked && isLiveIoPanelOpen()) {
        updateProgramIoLive(d().getLastLive?.() || [], d().getLastRuntime?.() || {});
      }
    });
  }

  function d() {
    return deps;
  }

  function expIo() {
    return window.PeaklogicExpansionIo || {};
  }

  function programIoTags() {
    return window.PeaklogicProgramIoTags || {};
  }

  function programIoTagList() {
    const tags = d().getTags();
    const list = programIoTags().programIoTagList?.(tags, programTagRefs)
      || tags.filter((t) => t.role === 'input' || t.role === 'output');
    return list.slice().sort((a, b) => {
      const sa = expIo().expansionSlotFromId?.(a.id) || 0;
      const sb = expIo().expansionSlotFromId?.(b.id) || 0;
      if (sa !== sb) {
        if (!sa) return -1;
        if (!sb) return 1;
        return sa - sb;
      }
      const order = { BOOL: 0, INT: 1, REAL: 2 };
      const ta = order[a.type] ?? 9;
      const tb = order[b.type] ?? 9;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  }

  function formatIoTagName(tag) {
    const fmt = window.PeaklogicTagDisplay?.formatTag;
    return fmt ? fmt(tag, d().getTags()) : tag.id;
  }

  function formatIoTagSub(tag) {
    const fmt = window.PeaklogicTagDisplay?.formatTagSub;
    return fmt ? fmt(tag, d().getTags()) : '';
  }

  function renderProgramTagLegend() {
    const host = $('program-tag-legend');
    if (!host) return;
    const tags = d().getTags();
    const refs = programTagRefs.length ? programTagRefs : programIoTagList().map((t) => t.id);
    if (!refs.length) {
      host.innerHTML = '';
      host.classList.add('view-hidden');
      return;
    }
    host.classList.remove('view-hidden');
    const fmt = window.PeaklogicTagDisplay?.formatTag || ((t) => t.id || t);
    const rows = refs.map((id) => {
      const tag = tags.find((t) => t.id === id) || { id, label: '' };
      const main = esc(fmt(tag, tags));
      const sub = formatIoTagSub(tag);
      return `<span class="program-tag-chip" title="${esc(tag.id)}${tag.label ? ` — ${esc(tag.label)}` : ''}">${main}${sub ? `<span class="muted"> · ${esc(sub)}</span>` : ''}</span>`;
    }).join('');
    host.innerHTML = `<span class="muted program-tag-legend-label">Program tags:</span> ${rows}`;
  }

  function isLiveIoPanelOpen() {
    const chrome = document.getElementById('live-io-chrome');
    return chrome && !chrome.classList.contains('view-hidden');
  }

  function liveIoHintText(runtime) {
    const opta = d().getLastOptaRuntime?.();
    if (!runtime?.running && opta?.running) return '(Opta ST running — live from device)';
    if (!runtime?.running) return '(stopped — last values shown)';
    return runtime.paused ? '(paused — values frozen)' : '(runtime active)';
  }

  function renderProgramIoPanel(live, runtime) {
    const host = $('program-io-panel');
    const hint = $('program-io-hint');
    if (!host) return;
    if (!isLiveIoPanelOpen()) return;
    const scanActive = d().runtimeScanActive(runtime);
    host.classList.toggle('io-stopped', !scanActive);
    if (hint) hint.textContent = liveIoHintText(runtime);
    const list = programIoTagList();
    if (!list.length) {
      host.innerHTML = '<p class="program-io-empty">No tags in program. Apply a valid ST file that references DI, Q, AI, etc.</p>';
      return;
    }
    const mkDigital = (tag) => {
      const entry = d().liveEntryFor(tag.id, live);
      const on = d().isDigitalOn(entry);
      const highlight = scanActive && on;
      const forced = entry && (entry.forceInput || entry.forceOutput);
      const stopped = !scanActive;
      const ts = window.PeaklogicIoTimestamp;
      return `<div class="io-point digital ${highlight ? 'on' : 'off'}${forced ? ' forced' : ''}" data-io="${esc(tag.id)}" data-io-type="BOOL">
        <span class="io-name">${esc(formatIoTagName(tag))}</span>
        ${formatIoTagSub(tag) ? `<span class="io-tag-id muted">${esc(formatIoTagSub(tag))}</span>` : ''}
        <span class="io-role">${esc(tag.role)}</span>
        <span class="io-val" data-io-val>${esc(d().formatIoValue(entry))}</span>
        ${ts?.ioTsSpan?.(entry?.updatedAt, { stopped }) || ''}
        ${forced ? '<span class="io-force-badge">FORCED</span>' : ''}
      </div>`;
    };
    const mkAnalog = (tag) => {
      const entry = d().liveEntryFor(tag.id, live);
      const forced = entry && (entry.forceInput || entry.forceOutput);
      const stopped = !scanActive;
      const ts = window.PeaklogicIoTimestamp;
      return `<div class="io-point analog${forced ? ' forced' : ''}" data-io="${esc(tag.id)}" data-io-type="${esc(tag.type)}">
        <span class="io-name">${esc(formatIoTagName(tag))}</span>
        ${formatIoTagSub(tag) ? `<span class="io-tag-id muted">${esc(formatIoTagSub(tag))}</span>` : ''}
        <span class="io-role">${esc(tag.type)} · ${esc(tag.role)}</span>
        <span class="io-val" data-io-val>${esc(d().formatIoValue(entry))}</span>
        ${ts?.ioTsSpan?.(entry?.updatedAt, { stopped }) || ''}
        ${forced ? '<span class="io-force-badge">FORCED</span>' : ''}
      </div>`;
    };
    const renderGroup = (tags, opts = {}) => {
      const { sectionTitle = '', flat = false } = opts;
      const digital = tags.filter((t) => t.type === 'BOOL');
      const analog = tags.filter((t) => t.type === 'INT' || t.type === 'REAL' || t.type === 'PID' || t.type === 'AVG');
      if (!digital.length && !analog.length) return '';
      const digBlock = digital.length ? `<div class="program-io-digital">${digital.map(mkDigital).join('')}</div>` : '';
      const anaBlock = analog.length ? `<div class="program-io-digital">${analog.map(mkAnalog).join('')}</div>` : '';
      if (flat) {
        return `
          ${digital.length ? `<div class="program-io-section"><h3>Digital</h3>${digBlock}</div>` : ''}
          ${analog.length ? `<div class="program-io-section"><h3>Analog (INT / REAL)</h3>${anaBlock}</div>` : ''}`;
      }
      return `
        <div class="program-io-section${sectionTitle.startsWith('Expansion') ? ' program-io-expansion' : ''}">
          <h3>${esc(sectionTitle)}</h3>
          ${digital.length ? `<div class="program-io-subsection"><h4>Digital</h4>${digBlock}</div>` : ''}
          ${analog.length ? `<div class="program-io-subsection"><h4>Analog (INT / REAL)</h4>${anaBlock}</div>` : ''}
        </div>`;
    };
    const { base, bySlot } = expIo().partitionIoTags?.(list) || { base: list, bySlot: new Map() };
    const slots = [...bySlot.keys()].sort((a, b) => a - b);
    const hasExpansion = slots.length > 0;
    let html = renderGroup(base, hasExpansion && base.length
      ? { sectionTitle: 'On-board I/O' }
      : { flat: true });
    for (const slot of slots) {
      const slotTags = bySlot.get(slot) || [];
      const title = expIo().expansionSectionTitle?.(slot, slotTags) || `Expansion ${slot}`;
      html += renderGroup(slotTags, { sectionTitle: title });
    }
    host.innerHTML = html;
    renderProgramTagLegend();
  }

  function isProgramPopupOpen() {
    const chrome = document.getElementById('program-chrome');
    return chrome && !chrome.classList.contains('view-hidden');
  }

  function updateTraceDebugButton() {
    const btn = $('btn-prog-debug-trace');
    if (!btn) return;
    btn.classList.toggle('active', traceDebugOn);
    btn.setAttribute('aria-pressed', traceDebugOn ? 'true' : 'false');
  }

  function clearDebugTrace() {
    traceDebugOn = false;
    lastDebugTrace = [];
    updateTraceDebugButton();
    stEditor?.clearTrace();
  }

  async function refreshDebugTrace(opts = {}) {
    const src = $('program-src')?.value ?? '';
    if (!src.trim()) {
      showProgramError('Enter program source first');
      return;
    }
    const runtime = d().getLastRuntime?.() || {};
    if (d().runtimeScanActive(runtime)) {
      traceDebugOn = true;
      updateTraceDebugButton();
      updateProgramTrace(runtime.programTrace, runtime);
      if (!opts.quiet) {
        $('program-errors').textContent = 'Live trace (runtime running)';
        $('program-errors').className = 'inline-msg ok';
      }
      return;
    }
    try {
      await api.putProgram(src).catch(() => {});
      const r = await api.programTrace(src);
      if (!r.ok) {
        showProgramError((r.errors || []).join('; ') || 'Trace failed');
        return;
      }
      lastDebugTrace = r.trace || [];
      traceDebugOn = true;
      updateTraceDebugButton();
      stEditor?.setTrace(lastDebugTrace, true);
      if (!opts.quiet) {
        $('program-errors').textContent = lastDebugTrace.length
          ? `Debug trace: ${lastDebugTrace.length} point(s) — green ✓ true, red ✗ false, outputs red when ON`
          : 'Debug trace: no trace points (add IF / TurnON / assignments)';
        $('program-errors').className = 'inline-msg ok';
      }
    } catch (e) {
      showProgramError(e.message || 'Trace failed');
    }
  }

  function updateProgramTrace(trace, runtime) {
    if (!isProgramPopupOpen() || !stEditor) return;
    if (stEditor.isDirty()) {
      stEditor.clearTrace();
      return;
    }
    const live = d().runtimeScanActive(runtime);
    let rows = [];
    if (live && Array.isArray(trace) && trace.length) {
      rows = trace;
    } else if (traceDebugOn && lastDebugTrace.length) {
      rows = lastDebugTrace;
    } else if (Array.isArray(trace) && trace.length && runtime?.programOk) {
      rows = trace;
    }
    if (!rows.length) {
      if (!traceDebugOn) stEditor.clearTrace();
      return;
    }
    try {
      stEditor.setTrace(rows, true);
    } catch (e) {
      console.error('program trace overlay', e);
      stEditor.clearTrace();
    }
  }

  function updateProgramIoLive(live, runtime) {
    if (!isLiveIoPanelOpen()) return;
    if (!shouldRefreshLiveIo(runtime)) return;
    const host = $('program-io-panel');
    if (!host || !host.querySelector('[data-io]')) {
      renderProgramIoPanel(live, runtime);
      return;
    }
    const tags = d().getTags();
    const scanActive = d().runtimeScanActive(runtime);
    host.classList.toggle('io-stopped', !scanActive);
    host.querySelectorAll('[data-io]').forEach((el) => {
      const id = el.dataset.io;
      const tag = tags.find((x) => x.id === id);
      const entry = d().liveEntryFor(id, live);
      if (!tag || !entry) return;
      const forced = entry.forceInput || entry.forceOutput;
      el.classList.toggle('forced', forced);
      if (entry.type === 'BOOL') {
        const on = d().isDigitalOn(entry);
        const highlight = scanActive && on;
        el.classList.toggle('on', highlight);
        el.classList.toggle('off', !highlight);
      }
      const valEl = el.querySelector('[data-io-val]');
      if (valEl) valEl.textContent = d().formatIoValue(entry);
      const tsApi = window.PeaklogicIoTimestamp;
      let tsEl = el.querySelector('.io-ts');
      if (!tsEl && tsApi?.ioTsSpan) {
        tsEl = document.createElement('span');
        valEl?.insertAdjacentElement('afterend', tsEl);
      }
      tsApi?.updateIoTsEl?.(tsEl, entry.updatedAt, { stopped: !scanActive });
      let badge = el.querySelector('.io-force-badge');
      if (forced && !badge) {
        badge = document.createElement('span');
        badge.className = 'io-force-badge';
        badge.textContent = 'FORCED';
        el.appendChild(badge);
      } else if (!forced && badge) {
        badge.remove();
      }
    });
    const hint = $('program-io-hint');
    if (hint) hint.textContent = liveIoHintText(runtime);
  }

  async function syncProgramTagRefs() {
    const src = $('program-src')?.value ?? '';
    if (!src.trim()) {
      programTagRefs = [];
      renderProgramTagLegend();
      scheduleDeployEstimate();
      return;
    }
    try {
      const r = await api.validateProgram(src);
      programTagRefs = r.programTags || [];
    } catch {
      programTagRefs = [];
    }
    renderProgramTagLegend();
    scheduleDeployEstimate();
  }

  function updateProgramFolderLabel(stDir, active) {
    const el = $('program-folder');
    if (!el) return;
    const dir = stDir || programStDir;
    if (!dir) {
      el.textContent = '';
      return;
    }
    el.textContent = active
      ? `Programs folder: ${dir} · active: ${active}`
      : `Programs folder: ${dir}`;
  }

  function applyProgramToEditor(r) {
    const prog = $('program-src');
    const errEl = $('program-errors');
    if (!prog) return;
    programActivePath = r.active || programActivePath;
    if (stEditor) {
      stEditor.setValue(r.source || '', { clean: true });
      stEditor.setActivePath(programActivePath);
      stEditor.setBaseline(r.source || '');
    } else {
      prog.value = r.source || '';
      prog.dataset.dirty = '';
    }
    programEditLock = false;
    programLoadGuardUntil = Math.max(programLoadGuardUntil, Date.now() + 4000);
    updateProgramFolderLabel(r.stDir || programStDir, r.active);
    if ($('program-active')) $('program-active').textContent = r.active ? `Active: ${r.active}` : '';
    if (r.active && $('program-library')) {
      const sel = $('program-library');
      sel.dataset.userPick = r.active;
      let opt = [...sel.options].find((o) => o.value === r.active);
      if (!opt) {
        opt = document.createElement('option');
        opt.value = r.active;
        opt.textContent = r.active;
        sel.appendChild(opt);
      }
      sel.value = r.active;
    }
    if (errEl) {
      if (r.errors?.length) {
        errEl.textContent = r.errors.join('; ');
        errEl.className = 'inline-msg err';
      } else {
        errEl.textContent = r.ok === false ? 'Loaded (see validation)' : `Loaded ${r.active || ''}`;
        errEl.className = r.ok === false ? 'inline-msg warn' : 'inline-msg ok';
      }
    }
    scheduleDeployEstimate();
  }

  function programHasFixtureBundle(rel) {
    const norm = String(rel || '').replace(/\\/g, '/');
    return /waveshare/i.test(norm)
      || norm.startsWith('opta/')
      || norm.startsWith('opta-mqtt/')
      || norm.startsWith('mqtt/')
      || norm.startsWith('modbus/')
      || norm.startsWith('logic/');
  }

  /** Library pick, userPick, or last active path (matches Load fixtures resolution). */
  function selectedProgramRel() {
    const sel = $('program-library');
    return (sel?.value || sel?.dataset?.userPick || programActivePath || '').trim();
  }

  async function loadFixturesForSelected() {
    const rel = selectedProgramRel();
    if (!rel) {
      showProgramError('Select a program in Library first.');
      return null;
    }
    if (!programHasFixtureBundle(rel)) {
      showProgramError(`No fixture bundle for ${rel}.`);
      return null;
    }
    if (!window.confirm(
      `Load fixtures for "${rel}"?\n\nThis replaces all tags and drivers with the st/fixtures/ demo bundle.`
    )) {
      return null;
    }
    programLoading = true;
    programLoadGuardUntil = Date.now() + 4000;
    try {
      const r = await api.loadProgramFixtures(rel);
      applyProgramToEditor({
        ...r,
        active: r.active || rel,
        source: r.source ?? '',
        stDir: r.stDir || programStDir,
        ok: r.programOk !== false,
      });
      await syncProgramTagRefs();
      renderProgramIoPanel(d().getLastLive(), d().getLastRuntime());
      await d().refreshAll({ force: true });
      const n = r.fixturesLoaded?.tagCount ?? 0;
      showProgramError(`Fixtures loaded (${n} tags).`);
      $('program-errors').className = 'inline-msg ok';
      return r;
    } catch (e) {
      showProgramError(e.message);
      return null;
    } finally {
      programLoading = false;
    }
  }

  async function createTagsFromProgram() {
    const src = $('program-src')?.value ?? '';
    if (!src.trim()) {
      showProgramError('No program source — load a program first.');
      return null;
    }
    try {
      const r = await api.ensureProgramTags(src);
      const parts = [];
      if (r.added?.length) parts.push(`Added ${r.added.length} tag(s): ${r.added.join(', ')}`);
      if (r.labeled?.length) parts.push(`Labels set: ${r.labeled.join(', ')}`);
      const msg = parts.length ? parts.join('. ') : 'All program tags already exist.';
      showProgramError(msg);
      $('program-errors').className = 'inline-msg ok';
      await syncProgramTagRefs();
      renderProgramIoPanel(d().getLastLive(), d().getLastRuntime());
      await d().refreshAll();
      return r;
    } catch (e) {
      showProgramError(e.message);
      return null;
    }
  }

  async function reloadProgramFromDisk({ force = false } = {}) {
    const rel = programActivePath || $('program-library')?.value || '';
    if (!rel) {
      showProgramError('No active program — select one in Library or Open from st/.');
      return null;
    }
    if (!force && stEditor?.isDirty() && !window.confirm('Discard unsaved edits and reload from disk?')) {
      return null;
    }
    programLoading = true;
    programEditLock = true;
    programLoadGuardUntil = Date.now() + 4000;
    try {
      const r = await api.reloadProgram(rel);
      applyProgramToEditor({ ...r, stDir: r.stDir || programStDir });
      await syncProgramTagRefs();
      renderProgramIoPanel(d().getLastLive(), d().getLastRuntime());
      await d().refreshAll();
      return r;
    } catch (e) {
      showProgramError(e.message);
      return null;
    } finally {
      programLoading = false;
      setTimeout(() => {
        if (!$('program-src')?.matches(':focus')) programEditLock = false;
      }, 300);
    }
  }

  async function clearActiveProgram() {
    const rt = d().getLastRuntime?.() || {};
    if (rt.running && !window.confirm('Stop runtime and clear the active program?')) return null;
    if (stEditor?.isDirty() && !window.confirm('Discard unsaved program edits and clear active program?')) {
      return null;
    }
    programLoading = true;
    programEditLock = true;
    programLoadGuardUntil = Date.now() + 4000;
    try {
      const r = await api.clearActiveProgram();
      programActivePath = '';
      applyProgramToEditor({ ...r, active: '', source: '', stDir: r.stDir || programStDir, ok: true, errors: [] });
      if ($('program-library')) {
        $('program-library').value = '';
        $('program-library').dataset.userPick = '';
      }
      programTagRefs = [];
      renderProgramIoPanel(d().getLastLive(), d().getLastRuntime());
      await d().refreshAll();
      return r;
    } catch (e) {
      showProgramError(e.message);
      return null;
    } finally {
      programLoading = false;
      programEditLock = false;
    }
  }

  async function loadProgramFromServer(path, { refresh = true } = {}) {
    const rel = (path || selectedProgramRel()).trim();
    if (!rel) {
      showProgramError('Select a program in Library, or use Open from st/.');
      return null;
    }
    if (stEditor?.isDirty() && !window.confirm('Discard unsaved program edits and load from server?')) {
      return null;
    }
    programLoading = true;
    programEditLock = true;
    programLoadGuardUntil = Date.now() + 4000;
    try {
      const r = await api.loadProgram(rel, { loadFixtures: false });
      applyProgramToEditor({ ...r, stDir: r.stDir || programStDir });
      await syncProgramTagRefs();
      renderProgramIoPanel(d().getLastLive(), d().getLastRuntime());
      if (refresh) await d().refreshAll({ force: true });
      return r;
    } catch (e) {
      showProgramError(e.message);
      return null;
    } finally {
      programLoading = false;
      setTimeout(() => {
        if (!$('program-src')?.matches(':focus')) programEditLock = false;
      }, 300);
    }
  }

  function fillProgramPickerList(programs, selected) {
    const sel = $('program-picker-list');
    if (!sel) return;
    const list = programs || [];
    sel.innerHTML = list.length
      ? list.map((p) => `<option value="${esc(p.path)}">${esc(p.path)}</option>`).join('')
      : '<option value="">(no .st files in st/)</option>';
    const pick = selected && list.some((p) => p.path === selected)
      ? selected
      : ($('program-library')?.value || list[0]?.path || '');
    if (pick) sel.value = pick;
  }

  async function openProgramPicker() {
    const dlg = $('program-picker-dialog');
    if (!dlg) return;
    try {
      const opened = await api.openProgramFolder();
      if (opened?.stDir) {
        programStDir = opened.stDir;
        updateProgramFolderLabel(opened.stDir, programActivePath);
      }
    } catch (e) {
      showProgramError(e.message);
    }
    if (!programCatalog.length) {
      try {
        const r = await api.listPrograms();
        programCatalog = r.programs || [];
        if (r.stDir) programStDir = r.stDir;
        updateProgramFolderLabel(r.stDir, r.active);
      } catch (e) {
        showProgramError(e.message);
        return;
      }
    }
    const dirEl = $('program-picker-dir');
    if (dirEl) {
      dirEl.textContent = programStDir
        ? `Programs in: ${programStDir}`
        : 'Programs folder not configured';
    }
    fillProgramPickerList(programCatalog, $('program-library')?.value || programActivePath);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function catalogSignature(list) {
    return (list || []).map((p) => p.path).join('\0');
  }

  function fillProgramLibrary(programs, active) {
    const sel = $('program-library');
    const label = $('program-active');
    if (!sel) return;
    const list = programs || [];

    // Rebuilding while the dropdown is open cancels the click — wait until blur.
    if (document.activeElement === sel) return;

    const sig = catalogSignature(list);
    const prev = sel.value;
    const userPick = sel.dataset.userPick || '';
    const needsRebuild = sel.dataset.catalogSig !== sig || sel.options.length === 0;

    if (needsRebuild) {
      sel.dataset.catalogSig = sig;
      const opts = ['<option value="">(none — no active program)</option>'];
      if (list.length) {
        opts.push(...list.map((p) =>
          `<option value="${esc(p.path)}">${esc(p.category)}/${esc(p.name)}</option>`
        ));
      } else {
        opts.push('<option value="" disabled>(no .st files in st/)</option>');
      }
      sel.innerHTML = opts.join('');
    }

    let pick = '';
    if (userPick && list.some((p) => p.path === userPick)) {
      pick = userPick;
    } else if (prev && list.some((p) => p.path === prev)) {
      pick = prev;
    } else if (active && list.some((p) => p.path === active)) {
      pick = active;
    }
    if (sel.value !== pick) sel.value = pick;
    if (label) label.textContent = active ? `Active: ${active}` : 'No active program';
  }

  function suggestNewStPath() {
    const list = programCatalog || [];
    let n = 1;
    while (list.some((p) => p.path === `logic/new_${n}.st`)) n += 1;
    return `logic/new_${n}.st`;
  }

  function newProgramInEditor() {
    if (stEditor?.isDirty() && !window.confirm('Discard unsaved edits and create a new program?')) {
      return;
    }
    const path = window.prompt('New program path under st/ (e.g. logic/my_prog.st):', suggestNewStPath());
    if (!path) return;
    const rel = path.trim().replace(/\\/g, '/');
    if (!/\.st$/i.test(rel)) {
      showProgramError('Path must end with .st');
      return;
    }
    programActivePath = rel;
    programEditLock = true;
    programLoadGuardUntil = Date.now() + 3000;
    if (stEditor) {
      stEditor.setValue(ST_NEW_TEMPLATE, { clean: false });
      stEditor.markDirty();
      stEditor.setActivePath(rel);
      stEditor.setBaseline('');
    } else {
      const prog = $('program-src');
      if (prog) {
        prog.value = ST_NEW_TEMPLATE;
        prog.dataset.dirty = '1';
      }
    }
    if ($('program-active')) $('program-active').textContent = `New: ${rel} (not saved)`;
    if ($('program-library')) {
      const sel = $('program-library');
      const exists = [...sel.options].some((o) => o.value === rel);
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = rel;
        opt.textContent = rel;
        sel.appendChild(opt);
      }
      sel.value = rel;
    }
    $('program-errors').textContent = 'New program — click Save program to write to st/';
    $('program-errors').className = 'inline-msg warn';
    syncProgramTagRefs().then(() => renderProgramIoPanel(d().getLastLive(), d().getLastRuntime()));
  }

  function suggestStPathFromFile(file) {
    const rel = file.webkitRelativePath || file.name || 'program.st';
    const norm = rel.replace(/\\/g, '/');
    const base = norm.split('/').pop() || 'program.st';
    const name = base.toLowerCase().endsWith('.st') ? base : `${base.replace(/\.[^.]+$/, '') || 'program'}.st`;
    if (norm.includes('/')) {
      const dir = norm.slice(0, norm.lastIndexOf('/'));
      return `${dir}/${name}`;
    }
    return `logic/${name}`;
  }

  function showProgramError(msg) {
    const errEl = $('program-errors');
    if (errEl) {
      errEl.textContent = msg;
      errEl.className = 'inline-msg err';
    } else {
      alert(msg);
    }
  }

  function findOptaRemoteDriver() {
    return (d().getDrivers?.() || []).find(
      (drv) => (drv.type === 'opta_remote' || drv.type === 'mqtt_parc') && drv.enabled !== false
    );
  }

  function formatDeployKb(bytes) {
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function renderDeployEstimate(est) {
    const el = $('prog-deploy-estimate');
    if (!el) return;
    if (!est?.remoteApplicable) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'prog-deploy-estimate muted cell-mono';
      return;
    }
    el.hidden = false;
    if (!est.ok) {
      const lineHint = est.lineCount?.overLimit
        ? ` · ${est.lineCount.lines}/${est.lineCount.limit} lines`
        : '';
      el.textContent = `Parc deploy: invalid — ${(est.errors || ['parse error']).join('; ')}${lineHint}`;
      el.className = 'prog-deploy-estimate err cell-mono';
      return;
    }
    const limitLabel = formatDeployKb(est.limit);
    const bytesLabel = formatDeployKb(est.bytes);
    const linePart = est.lineCount
      ? ` · ${est.lineCount.lines}/${est.lineCount.limit} lines`
      : '';
    el.textContent = `Parc deploy: ${bytesLabel} / ${limitLabel}${linePart} · ${est.tagCount} tags · ${formatDeployKb(est.codeBytes || 0)} code + ${formatDeployKb(est.dataBytes || est.bcBytes || 0)} data (${est.pct}%)`;
    el.title = est.overLimit
      ? 'Deploy exceeds Opta limit — trim program or reduce tag count'
      : `Wire ${formatDeployKb(est.bytes)} · bytecode ${formatDeployKb(est.bcTotalBytes || est.bcBytes)} (code + tag table data). Headroom ${formatDeployKb(Math.max(0, est.headroom))}.`;
    el.className = est.overLimit
      ? 'prog-deploy-estimate err cell-mono'
      : (est.pct >= 80 ? 'prog-deploy-estimate warn cell-mono' : 'prog-deploy-estimate muted cell-mono');
  }

  let deployEstimateTimer = null;
  async function syncDeployEstimate() {
    if (!isRemoteExecutionOn()) {
      renderDeployEstimate({ remoteApplicable: false });
      return;
    }
    const opta = findOptaRemoteDriver();
    if (!opta) {
      renderDeployEstimate({ remoteApplicable: false });
      return;
    }
    const src = $('program-src')?.value ?? '';
    if (!src.trim()) {
      renderDeployEstimate({ remoteApplicable: true, ok: true, bytes: 0, astBytes: 0, tagCount: 0, limit: 32768, overLimit: false, headroom: 32768, pct: 0 });
      return;
    }
    try {
      const est = await api.deployEstimate(src, opta.id);
      renderDeployEstimate(est);
    } catch (e) {
      renderDeployEstimate({
        remoteApplicable: true,
        ok: false,
        errors: e.errors?.length ? e.errors : [e.message || 'Estimate failed'],
      });
    }
  }

  function scheduleDeployEstimate() {
    clearTimeout(deployEstimateTimer);
    deployEstimateTimer = setTimeout(() => { syncDeployEstimate(); }, 450);
  }

  function updateProgramRemoteUi(data) {
    const remoteCb = $('prog-remote-exec');
    const connectBtn = $('btn-remote-connect');
    const disconnectBtn = $('btn-remote-disconnect');
    if (!remoteCb) return;

    const settings = data?.settings || d().getLastSettings?.() || {};
    const runtime = data?.runtime || d().getLastRuntime?.() || {};
    const remoteOn = settings.remoteExecution === true;
    const hubMqtt = data?.parc?.mqtt || {};
    if (document.activeElement !== remoteCb) remoteCb.checked = remoteOn;

    const opta = findOptaRemoteDriver();
    const healthMap = data?.driverHealth
      ? Object.fromEntries((data.driverHealth || []).map((h) => [h.id, h]))
      : (d().getDriverHealthMap?.() || {});
    const health = opta ? healthMap[opta.id] : null;
    const connected = !!health?.connected;
    const running = !!runtime.running;
    const paused = !!runtime.paused;

    // Connect/Disconnect always visible when an Opta remote driver exists (not only when Remote is on).
    const showOptaLink = !!opta;
    if (connectBtn) {
      connectBtn.hidden = !showOptaLink;
      connectBtn.disabled = !showOptaLink || connected || running;
    }
    if (disconnectBtn) {
      disconnectBtn.hidden = !showOptaLink;
      disconnectBtn.disabled = !showOptaLink || !connected || running;
    }

    const badgeEl = $('prog-runtime-badge');
    const detailEl = $('prog-runtime-detail');
    const statusBar = $('prog-remote-status');
    if (badgeEl) {
      let badgeText = 'Stopped';
      let badgeMod = 'stopped';
      if (running) {
        badgeText = paused ? 'Paused' : 'Running';
        badgeMod = paused ? 'paused' : 'running';
      }
      badgeEl.textContent = badgeText;
      badgeEl.className = `prog-runtime-badge prog-runtime-badge--${badgeMod}`;
    }
    if (detailEl || statusBar) {
      const link = opta
        ? (opta.type === 'mqtt_parc' ? (opta.deviceId || 'MQTT') : (opta.host || '—'))
        : '';
      const hubLine = remoteOn && opta?.type === 'mqtt_parc'
        ? (hubMqtt.connected
          ? `Hub OK (${hubMqtt.brokerUrl || settings.mqttParc?.brokerUrl || 'MQTT'})`
          : `Hub offline${hubMqtt.brokerUrl ? ` → ${hubMqtt.brokerUrl}` : ''} — enable MQTT Parc in System setup`)
        : '';
      const detailParts = [];
      if (running) {
        const where = runtime.remoteScanOnDevice && opta
          ? `ST on ${link}`
          : 'ST on this PC';
        detailParts.push(where);
        if (paused) detailParts.push('scan paused');
        if (runtime.remoteTracePending) {
          detailParts.push('waiting for trace telemetry');
        }
      } else if (remoteOn && !opta) {
        detailParts.push('Add mqtt_parc driver in Drivers');
      } else if (opta) {
        if (!remoteOn) {
          detailParts.push(connected
            ? `Linked ${link} · enable Remote to run ST on device`
            : `Not linked (${link}) · Connect, then Remote for ST on Opta`);
        } else if (connected) {
          detailParts.push(`Linked ${link} · press Download & Start to deploy ST`);
        } else {
          const err = (health?.message || '').trim();
          detailParts.push(err
            ? `Not linked (${link}): ${err}`
            : `Not linked (${link})`);
        }
      }
      if (hubLine) detailParts.push(hubLine);
      const detailText = detailParts.join(' · ');
      if (detailEl) {
        detailEl.textContent = detailText;
        detailEl.title = detailText;
      }
      if (statusBar) statusBar.title = detailText;
    }
    scheduleDeployEstimate();
    renderProgramLineStatus();

    const startBtn = $('btn-start');
    if (startBtn) {
      if (paused) {
        startBtn.textContent = 'Resume';
        startBtn.title = remoteOn
          ? 'Resume ST scan on Opta'
          : 'Resume ST scan on this PC';
      } else {
        startBtn.textContent = remoteOn ? 'Download & Start' : 'Start';
        startBtn.title = remoteOn
          ? 'Compile ST to bytecode, deploy to Opta via MQTT, then start scan on device'
          : 'Validate and run ST on this PC';
      }
    }
  }

  function bindProgramRemoteControls() {
    const remoteCb = $('prog-remote-exec');
    if (remoteCb && !remoteCb._bound) {
      remoteCb._bound = true;
      remoteCb.addEventListener('change', async () => {
        const next = remoteCb.checked;
        const rt = d().getLastRuntime?.() || {};
        if (rt.running) {
          const ok = window.confirm(
            'Stop the runtime before changing Remote mode, then Start again to apply.\n\nStop now?'
          );
          if (!ok) {
            remoteCb.checked = !next;
            return;
          }
          try {
            await api.runtimeStop();
          } catch { /* ignore */ }
        }
        try {
          await api.putSettings({ remoteExecution: next });
          d().patchLastSettings?.({ remoteExecution: next });
          if (next && !findOptaRemoteDriver()) {
            alert(
              'Remote is on but no mqtt_parc driver.\n\n'
              + 'Drivers → Device templates → Apply template → Arduino Opta — MQTT Parc ST runtime,\n'
              + 'then Connect before Download & Start.'
            );
          }
          await d().refreshAll();
        } catch (e) {
          remoteCb.checked = !next;
          alert(e.message || 'Could not save remote setting');
        }
      });
    }

    const connect = async () => {
      const opta = findOptaRemoteDriver();
      if (!opta) return alert('No enabled mqtt_parc driver. Apply the Opta MQTT Parc template in Drivers.');
      try {
        await api.connectDriver(opta.id);
        await d().refreshAll();
      } catch (e) {
        alert(e.message || 'Connect failed');
      }
    };

    const disconnect = async () => {
      const opta = findOptaRemoteDriver();
      if (!opta) return;
      try {
        await api.disconnectDriver(opta.id);
        await d().refreshAll();
      } catch (e) {
        alert(e.message || 'Disconnect failed');
      }
    };

    if ($('btn-remote-connect') && !$('btn-remote-connect')._bound) {
      $('btn-remote-connect')._bound = true;
      $('btn-remote-connect').onclick = connect;
    }
    if ($('btn-remote-disconnect') && !$('btn-remote-disconnect')._bound) {
      $('btn-remote-disconnect')._bound = true;
      $('btn-remote-disconnect').onclick = disconnect;
    }
  }

  function extractUnknownTags(errors, unknownTags) {
    if (Array.isArray(unknownTags) && unknownTags.length) {
      return [...new Set(unknownTags.map((x) => String(x).trim()).filter(Boolean))];
    }
    return [...new Set((errors || [])
      .filter((x) => /^Unknown tag:/i.test(String(x)))
      .map((x) => String(x).replace(/^Unknown tag:\s*/i, '').trim())
      .filter(Boolean))];
  }

  function missingTagsConfirmMessage(unknown, activePath) {
    const ids = unknown.join(', ');
    const motorHint = /motor_hoa/i.test(activePath || '')
      ? '\n\nFor motor_hoa: Load fixtures replaces tags with MOTOR1_* ids (recommended demo).'
      : '';
    return (
      `The program references tag id(s) not in the tag table:\n${ids}\n\n`
      + 'Tag Labels are display names only — ST always uses Tag id (not Label).\n\n'
      + `Create ${unknown.length} missing tag(s) from the program?\n`
      + '(Existing tags like VPI1/VPB1 are unchanged.)'
      + motorHint
    );
  }

  async function createMissingProgramTagsAndStart(src) {
    const created = await api.ensureProgramTags(src);
    await d().refreshAll();
    const put = await api.putProgram(src);
    $('program-src').dataset.dirty = '';
    if (!put.programOk) {
      const still = extractUnknownTags(put.errors, put.unknownTags);
      throw new Error(still.length
        ? `Still missing tags: ${still.join(', ')}`
        : (put.errors?.join('; ') || 'Program validation failed after creating tags'));
    }
    const parts = [];
    if (created.added?.length) parts.push(`Added: ${created.added.join(', ')}`);
    if (created.labeled?.length) parts.push(`Labels: ${created.labeled.join(', ')}`);
    if (parts.length) {
      showProgramError(parts.join(' · '));
      $('program-errors').className = 'inline-msg ok';
    }
    await api.runtimeStart();
    await d().refreshAll();
    showProgramError('Running');
    $('program-errors').className = 'inline-msg ok';
    return true;
  }

  async function offerCreateMissingTagsAndStart(unknown, src, activePath) {
    if (!unknown?.length) return false;
    if (!window.confirm(missingTagsConfirmMessage(unknown, activePath))) return false;
    await createMissingProgramTagsAndStart(src);
    return true;
  }

  function bindRuntimeControls() {
    bindProgramRemoteControls();
    $('btn-start').onclick = async () => {
      const src = $('program-src')?.value ?? '';
      const activePath = programActivePath || $('program-library')?.value || '';
      const remoteOn = isRemoteExecutionOn();
      try {
        if (remoteOn) {
          const opta = findOptaRemoteDriver();
          if (opta) {
            const parcLines = assessLinesClient(src, true);
            if (parcLines.overLimit) {
              alert(`Cannot download to Opta: ST program is ${parcLines.lines} lines (Parc limit ${parcLines.limit}). Trim the program or uncheck Remote to run on PC only.`);
              return;
            }
            try {
              const est = await api.deployEstimate(src, opta.id);
              if (est.overLimit) {
                alert(`Cannot download to Opta: deploy payload is ${formatDeployKb(est.bytes)} (Opta limit ${formatDeployKb(est.limit)}). Trim the program or uncheck Remote to run on PC only.`);
                return;
              }
              if (est.ok === false && est.errors?.length) {
                alert(`Cannot download to Opta: ${est.errors.join('; ')}`);
                return;
              }
            } catch (e) {
              alert(e.message || 'Deploy estimate failed');
              return;
            }
          }
        }
        const put = await api.putProgram(src);
        $('program-src').dataset.dirty = '';
        if (put.errors?.length) {
          $('program-errors').textContent = put.errors.join('; ');
          $('program-errors').className = 'inline-msg err';
        }
        if (!put.programOk) {
          const unknown = extractUnknownTags(put.errors, put.unknownTags);
          if (await offerCreateMissingTagsAndStart(unknown, src, activePath)) return;
          const msg = put.errors?.length
            ? put.errors.join('; ')
            : 'Program validation failed (unknown tags or syntax). Use Create tags from program or Load fixtures.';
          alert(`Cannot start: ${msg}`);
          return;
        }
        await api.runtimeStart();
        await d().refreshAll();
      } catch (e) {
        let msg = e.errors?.length
          ? (e.message || `Program invalid: ${e.errors.join('; ')}`)
          : (e.message || 'Start failed');
        const unknown = extractUnknownTags(e.errors, e.unknownTags);
        try {
          if (await offerCreateMissingTagsAndStart(unknown, src, activePath)) return;
        } catch (e2) {
          msg = e2.message || msg;
        }
        alert(msg);
        showProgramError(msg);
        d().refreshAll().catch(console.error);
      }
    };
    $('btn-pause').onclick = () => api.runtimePause().then(d().refreshAll);
    $('btn-stop').onclick = () => api.runtimeStop().then(d().refreshAll);
  }

  function bindProgramToolbar() {
    bindLiveIoUpdateCheckbox();
    bindRuntimeControls();

    on('btn-prog-new', () => newProgramInEditor());
    on('btn-prog-open', () => { openProgramPicker().catch((e) => showProgramError(e.message)); });
    $('program-picker-dialog')?.addEventListener('close', () => {
      const dlg = $('program-picker-dialog');
      if (dlg?.returnValue === 'open') {
        const path = $('program-picker-list')?.value;
        if (path) loadProgramFromServer(path);
      }
    });
    $('program-picker-cancel')?.addEventListener('click', () => {
      $('program-picker-dialog')?.close('cancel');
    });
    on('btn-prog-import', () => $('file-open-st')?.click());
    onChange('file-open-st', (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const rel = suggestStPathFromFile(f);
        const use = window.prompt('Save opened file under st/ as (relative path):', rel);
        if (!use) return;
        programLoading = true;
        programEditLock = true;
        programLoadGuardUntil = Date.now() + 4000;
        api.importProgram(use.trim(), r.result).then((res) => {
          applyProgramToEditor({ ...res, stDir: res.stDir || programStDir });
          return syncProgramTagRefs().then(() => d().refreshAll());
        }).catch((e) => showProgramError(e.message)).finally(() => {
          programLoading = false;
          setTimeout(() => {
            if (!$('program-src')?.matches(':focus')) programEditLock = false;
          }, 300);
        });
      };
      r.readAsText(f);
      ev.target.value = '';
    });

    on('btn-prog-save', () => {
      const src = $('program-src')?.value ?? '';
      const path = programActivePath || $('program-library')?.value || '';
      if (!path) return showProgramError('No active program path. Load from library or Open program first.');
      api.saveProgram(path, src).then((res) => {
        applyProgramToEditor(res);
        if (stEditor) stEditor.setBaseline(res.source || src);
        $('program-errors').textContent = `Saved to st/${res.active}`;
        $('program-errors').className = 'inline-msg ok';
        return d().refreshAll();
      }).catch((e) => showProgramError(e.message));
    });

    on('btn-prog-save-as', () => {
      const src = $('program-src')?.value ?? '';
      const def = $('program-library')?.value || programActivePath || 'logic/program.st';
      const path = window.prompt('Save under st/ as (relative path, e.g. logic/my_prog.st):', def);
      if (!path) return;
      api.saveProgram(path.trim(), src).then((res) => {
        applyProgramToEditor(res);
        $('program-errors').textContent = `Saved to st/${res.active}`;
        $('program-errors').className = 'inline-msg ok';
        return d().refreshAll();
      }).catch((e) => showProgramError(e.message));
    });

    on('btn-prog-load', () => {
      loadProgramFromServer(selectedProgramRel()).catch((e) => showProgramError(e.message));
    });

    onChange('program-library', (ev) => {
      const path = (ev.target?.value || '').trim();
      if (path) ev.target.dataset.userPick = path;
    });

    on('btn-prog-load-fixtures', () => { loadFixturesForSelected().catch((e) => showProgramError(e.message)); });

    on('btn-prog-create-tags', () => { createTagsFromProgram().catch((e) => showProgramError(e.message)); });

    on('btn-prog-reload', () => { reloadProgramFromDisk().catch((e) => showProgramError(e.message)); });

    on('btn-prog-clear', () => { clearActiveProgram().catch((e) => showProgramError(e.message)); });

    on('btn-prog-revert', () => {
      if (!stEditor) return;
      if (stEditor.isDirty() && !window.confirm('Discard unsaved edits?')) return;
      stEditor.revert();
      programEditLock = false;
      syncProgramTagRefs().then(() => renderProgramIoPanel(d().getLastLive(), d().getLastRuntime()));
    });

    const progEl = $('program-src');
    if (progEl && window.StEditor) {
      stEditor = StEditor.create(progEl, { statusEl: 'program-edit-status' });
      stEditor.updateGutter();
      progEl.addEventListener('st-edit', () => {
        if (traceDebugOn) clearDebugTrace();
        programEditLock = true;
        clearTimeout(window._progTagRefTimer);
        window._progTagRefTimer = setTimeout(() => {
          syncProgramTagRefs().then(() => renderProgramIoPanel(d().getLastLive(), d().getLastRuntime()));
          scheduleDeployEstimate();
          renderProgramLineStatus();
        }, 400);
      });
      progEl.addEventListener('st-save', () => $('btn-prog-save')?.click());
      progEl.addEventListener('focus', () => { programEditLock = true; });
      progEl.addEventListener('blur', () => {
        setTimeout(() => {
          if (!progEl.matches(':focus') && !stEditor.isDirty()) programEditLock = false;
        }, 150);
      });
    }

    if (window.StPidEditor) {
      window.StPidEditor.bindProgramDialog(
        () => d().getTags(),
        () => stEditor,
        () => d().markTagsDirty?.(),
      );
    }

    $('btn-prog-validate').onclick = async () => {
      const r = await api.validateProgram($('program-src').value);
      programTagRefs = r.programTags || [];
      renderProgramIoPanel(d().getLastLive(), d().getLastRuntime());
      $('program-errors').textContent = r.ok ? 'OK' : (r.errors || []).join('; ');
      $('program-errors').className = r.ok ? 'inline-msg ok' : 'inline-msg err';
      await syncDeployEstimate();
    };

    on('btn-prog-debug-trace', async () => {
      if (traceDebugOn) {
        clearDebugTrace();
        $('program-errors').textContent = 'Debug trace off';
        $('program-errors').className = 'inline-msg muted';
        return;
      }
      await refreshDebugTrace();
    });

    on('btn-prog-apply', () => api.putProgram($('program-src').value).then((r) => {
      if (stEditor) {
        stEditor.setBaseline($('program-src').value);
        stEditor.markClean();
      } else {
        $('program-src').dataset.dirty = '';
      }
      programEditLock = false;
      if (r.active) programActivePath = r.active;
      if (stEditor) stEditor.setActivePath(programActivePath);
      programLoadGuardUntil = Date.now() + 1500;
      $('program-errors').textContent = r.programOk ? 'Loaded for runtime' : (r.errors || []).join('; ');
      $('program-errors').className = r.programOk ? 'inline-msg ok' : 'inline-msg err';
      return syncProgramTagRefs().then(() => d().refreshAll());
    }).catch((e) => showProgramError(e.message)));
    window.PeaklogicTagDisplay?.bindAll(document);
    window.addEventListener('peaklogic-tag-display', () => {
      renderProgramTagLegend();
      renderProgramIoPanel(d().getLastLive(), d().getLastRuntime());
    });
  }

  function forceReloadFromDashboard(data) {
    programEditLock = false;
    programLoading = false;
    programLoadGuardUntil = 0;
    programTagRefs = data?.programTagRefs || [];
    programCatalog = data?.programs || [];
    if (data?.stDir) programStDir = data.stDir;
    if (data?.activeProgram) programActivePath = data.activeProgram;
    lastProgramMetaKey = programMetaKey(data?.programMeta, data?.activeProgram);
    updateProgramFolderLabel(programStDir, programActivePath);
    fillProgramLibrary(programCatalog, programActivePath);
    const prog = $('program-src');
    const src = data?.program ?? '';
    if (prog) {
      if (stEditor) {
        stEditor.setValue(src, { clean: true });
        stEditor.setActivePath(programActivePath);
        stEditor.setBaseline(src);
        stEditor.markClean();
      } else {
        prog.value = src;
      }
      prog.dataset.dirty = '';
    }
    syncProgramLineStatusFromDashboard(data);
  }

  function handleDashboardPoll(data) {
    syncProgramLineStatusFromDashboard(data);
    if (data.programTagRefs?.length) programTagRefs = data.programTagRefs;
    if (data.stDir) programStDir = data.stDir;
    updateProgramFolderLabel(data.stDir, data.activeProgram);
    programCatalog = data.programs || [];
    fillProgramLibrary(programCatalog, data.activeProgram);

    const runtime = data.runtime || d().getLastRuntime?.() || {};
    if (traceDebugOn) {
      const rows = Array.isArray(runtime.programTrace) && runtime.programTrace.length
        ? runtime.programTrace
        : lastDebugTrace;
      if (rows.length) {
        lastDebugTrace = rows;
        updateProgramTrace(rows, runtime);
      }
    } else {
      updateProgramTrace(runtime.programTrace, runtime);
    }

    const prog = $('program-src');
    const guard = Date.now() < programLoadGuardUntil;
    const editorDirty = prog?.dataset.dirty === '1';
    const metaKey = programMetaKey(data.programMeta, data.activeProgram);
    const pathChanged = !!(data.activeProgram && data.activeProgram !== programActivePath);
    const bodyChanged = metaKey !== lastProgramMetaKey;
    if (prog && !programLoading && !prog.matches(':focus') && !editorDirty && !programEditLock && !guard
      && (pathChanged || bodyChanged)) {
      if (data.activeProgram) programActivePath = data.activeProgram;
      if (!programActivePath || data.activeProgram === programActivePath) {
        const src = typeof data.program === 'string' ? data.program : '';
        if (stEditor) {
          stEditor.setValue(src, { clean: true });
          stEditor.setActivePath(programActivePath);
          stEditor.setBaseline(src);
        } else {
          prog.value = src;
        }
        lastProgramMetaKey = metaKey;
      }
    }
  }

  function init(appDeps) {
    deps = appDeps;
  }

  return {
    init,
    bindProgramToolbar,
    updateProgramRemoteUi,
    syncDeployEstimate,
    renderProgramIoPanel,
    updateProgramIoLive,
    updateProgramTrace,
    syncProgramTagRefs,
    handleDashboardPoll,
    forceReloadFromDashboard,
    getProgramActivePath: () => programActivePath,
    getProgramCatalog: () => programCatalog.slice(),
    setProgramActivePath: (p) => { programActivePath = p; },
    getProgramTagRefs: () => programTagRefs,
    isProgramLoading: () => programLoading,
    isProgramEditLocked: () => programEditLock,
    setStEditorPath: (p) => { if (stEditor) stEditor.setActivePath(p); },
  };
})();
