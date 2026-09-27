'use strict';

/** ST PID loop editor + analog tag pick lists (VPI / VPR / I/O). */
window.StPidEditor = (function () {
  const { esc } = window.PeakLogicCore;

  function analogWireTags(allTags) {
    return (allTags || []).filter((t) =>
      (t.type === 'INT' || t.type === 'REAL')
      && ['input', 'output', 'memory'].includes(String(t.role || '')));
  }

  function boolWireTags(allTags) {
    return (allTags || []).filter((t) =>
      t.type === 'BOOL' && ['input', 'output', 'memory'].includes(String(t.role || '')));
  }

  function analogWireTagSelectHtml(allTags, selectedId, dataAttr) {
    const eligible = analogWireTags(allTags).sort((a, b) => a.id.localeCompare(b.id));
    const vpi = eligible.filter((t) => /^VPI\d*$/i.test(t.id));
    const vpr = eligible.filter((t) => /^VPR\d*$/i.test(t.id));
    const other = eligible.filter((t) => !/^VP[IR]\d*$/i.test(t.id));
    const mkOpt = (t) =>
      `<option value="${esc(t.id)}"${t.id === selectedId ? ' selected' : ''}>${esc(t.id)} (${esc(t.type)}/${esc(t.role)})</option>`;
    const mkGroup = (label, list) => (list.length
      ? `<optgroup label="${esc(label)}">${list.map(mkOpt).join('')}</optgroup>`
      : '');
    return `<select ${dataAttr} class="st-pid-tag-select">${[
      `<option value=""${selectedId ? '' : ' selected'}>—</option>`,
      mkGroup('VPI — INT memory', vpi),
      mkGroup('VPR — REAL memory', vpr),
      mkGroup('Other INT / REAL', other),
    ].join('')}</select>`;
  }

  function pidTagSelectHtml(allTags, selectedId, dataAttr) {
    const pids = (allTags || []).filter((t) => t.type === 'PID').sort((a, b) => a.id.localeCompare(b.id));
    const opts = pids.map((t) =>
      `<option value="${esc(t.id)}"${t.id === selectedId ? ' selected' : ''}>${esc(t.id)}</option>`).join('');
    return `<select ${dataAttr} class="st-pid-tag-select" required>${opts || '<option value="">(no PID tags)</option>'}</select>`;
  }

  function boolWireTagSelectHtml(allTags, selectedId, dataAttr) {
    const eligible = boolWireTags(allTags).sort((a, b) => a.id.localeCompare(b.id));
    const vpb = eligible.filter((t) => /^VPB\d*$/i.test(t.id));
    const other = eligible.filter((t) => !/^VPB\d*$/i.test(t.id));
    const mkOpt = (t) =>
      `<option value="${esc(t.id)}"${t.id === selectedId ? ' selected' : ''}>${esc(t.id)} (${esc(t.role)})</option>`;
    const mkGroup = (label, list) => (list.length
      ? `<optgroup label="${esc(label)}">${list.map(mkOpt).join('')}</optgroup>`
      : '');
    return `<select ${dataAttr} class="st-pid-tag-select">${[
      `<option value=""${selectedId ? '' : ' selected'}>—</option>`,
      mkGroup('VPB — BOOL memory', vpb),
      mkGroup('Other BOOL', other),
    ].join('')}</select>`;
  }

  function pidWireEditHtml(t, allTags) {
    const fb = t.fb || {};
    return `<div class="fb-pid-wire">
      <label class="fb-field-lbl">PV <span class="muted">(Addr)</span>
        ${analogWireTagSelectHtml(allTags, fb.pvId || '', 'data-f="pidPvId"')}</label>
      <label class="fb-field-lbl">SP <span class="muted">(Addr)</span>
        ${analogWireTagSelectHtml(allTags, fb.spId || '', 'data-f="pidSpId"')}</label>
      <label class="fb-field-lbl">CV <span class="muted">(Addr)</span>
        ${analogWireTagSelectHtml(allTags, fb.outId || '', 'data-f="pidOutId"')}</label>
      <label class="fb-field-lbl">Hi alarm <span class="muted">(VPB)</span>
        ${boolWireTagSelectHtml(allTags, fb.alarmHiId || '', 'data-f="pidAlarmHiId"')}</label>
      <label class="fb-field-lbl">Lo alarm <span class="muted">(VPB)</span>
        ${boolWireTagSelectHtml(allTags, fb.alarmLoId || '', 'data-f="pidAlarmLoId"')}</label>
    </div>`;
  }

  function pidWireSelectValue(tr, field) {
    return tr.querySelector(`select[data-f="${field}"]`)?.value?.trim() || '';
  }

  function readPidWireFromRow(tr, tag) {
    const pv = pidWireSelectValue(tr, 'pidPvId');
    const sp = pidWireSelectValue(tr, 'pidSpId');
    const cv = pidWireSelectValue(tr, 'pidOutId');
    const hi = pidWireSelectValue(tr, 'pidAlarmHiId');
    const lo = pidWireSelectValue(tr, 'pidAlarmLoId');
    tag.fb = {
      ...(tag.fb || {}),
      pvId: pv,
      spId: sp,
      outId: cv,
      alarmHiId: hi,
      alarmLoId: lo,
    };
  }

  function formatPidWire(t) {
    const fb = t.fb || {};
    const pv = fb.pvId || '—';
    const sp = fb.spId || (Number.isFinite(Number(t.preset)) ? `local ${t.preset}` : '—');
    const cv = fb.outId || '—';
    const hi = fb.alarmHiId || '—';
    const lo = fb.alarmLoId || '—';
    return `PV:${pv} SP:${sp} CV:${cv} Hi:${hi} Lo:${lo}`;
  }

  function buildPidSt({ pidId, pvId, cvId, spTagId, auto = true }) {
    if (!pidId) return '';
    const lines = [`(* PID loop ${pidId} *)`];
    if (pvId) lines.push(`PidPv(${pidId}, ${pvId});`);
    if (spTagId) lines.push(`PidSp(${pidId}, ${spTagId});`);
    lines.push(auto ? `PidAuto(${pidId});` : `PidManual(${pidId});`);
    if (cvId) {
      lines.push(`IF PidAutoMode(${pidId}) THEN\n  PidOut(${pidId}, ${cvId});\nEND_IF;`);
    }
    return `${lines.join('\n')}\n`;
  }

  function parsePidSt(text) {
    const src = String(text || '');
    const pid = src.match(/PidPv\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/i);
    const out = src.match(/PidOut\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/i);
    const sp = src.match(/PidSp\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/i);
    return {
      pidId: pid?.[1] || out?.[1] || '',
      pvId: pid?.[2] || '',
      cvId: out?.[2] || '',
      spTagId: sp?.[2] || '',
      auto: /PidAuto\s*\(/i.test(src) && !/PidManual\s*\(/i.test(src),
    };
  }

  function fillDialogFromTag(tags, pidId) {
    const tag = tags.find((t) => t.id === pidId);
    const fb = tag?.fb || {};
    const pvEl = document.getElementById('st-pid-pv');
    const cvEl = document.getElementById('st-pid-cv');
    const spEl = document.getElementById('st-pid-sp');
    const autoEl = document.getElementById('st-pid-auto');
    if (pvEl) pvEl.value = fb.pvId || '';
    if (cvEl) cvEl.value = fb.outId || '';
    if (spEl) spEl.value = fb.spId || '';
    if (autoEl) autoEl.checked = fb.enabled !== false;
  }

  function refreshDialogSelects(tags, state) {
    const pidSel = document.getElementById('st-pid-block');
    const pvSel = document.getElementById('st-pid-pv');
    const cvSel = document.getElementById('st-pid-cv');
    const spSel = document.getElementById('st-pid-sp');
    const curPid = state?.pidId || pidSel?.value || '';
    if (pidSel) replaceSelect(pidSel, pidTagSelectHtml(tags, curPid, 'id="st-pid-block"'));
    const pidId = document.getElementById('st-pid-block')?.value || curPid;
    if (pvSel) {
      replaceSelect(pvSel, analogWireTagSelectHtml(tags, state?.pvId || pvSel.value, 'id="st-pid-pv"'));
    }
    if (cvSel) {
      replaceSelect(cvSel, analogWireTagSelectHtml(tags, state?.cvId || cvSel.value, 'id="st-pid-cv"'));
    }
    if (spSel) {
      replaceSelect(spSel, analogWireTagSelectHtml(tags, state?.spTagId || spSel.value, 'id="st-pid-sp"'));
    }
    if (pidId && !state?.pvId && !state?.cvId) fillDialogFromTag(tags, pidId);
  }

  function replaceSelect(el, html) {
    if (!el?.parentNode) return null;
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const next = wrap.firstElementChild;
    if (!next) return el;
    el.parentNode.replaceChild(next, el);
    return next;
  }

  function bindProgramDialog(getTags, getEditor, markTagsDirty) {
    const dlg = document.getElementById('st-pid-dialog');
    const openBtn = document.getElementById('btn-prog-pid');
    if (!dlg || !openBtn || openBtn._bound) return;
    openBtn._bound = true;

    document.getElementById('st-pid-cancel')?.addEventListener('click', () => dlg.close('cancel'));

    openBtn.addEventListener('click', () => {
      const tags = getTags() || [];
      const ta = document.getElementById('program-src');
      let state = {};
      if (ta && ta.selectionStart !== ta.selectionEnd) {
        state = parsePidSt(ta.value.slice(ta.selectionStart, ta.selectionEnd));
      }
      refreshDialogSelects(tags, state);
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });

    dlg.addEventListener('change', (ev) => {
      if (ev.target.id === 'st-pid-block') fillDialogFromTag(getTags() || [], ev.target.value);
    });

    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'apply') return;
      const pidId = document.getElementById('st-pid-block')?.value?.trim();
      const pvId = document.getElementById('st-pid-pv')?.value?.trim() || '';
      const cvId = document.getElementById('st-pid-cv')?.value?.trim() || '';
      const spTagId = document.getElementById('st-pid-sp')?.value?.trim() || '';
      const auto = !!document.getElementById('st-pid-auto')?.checked;
      const block = buildPidSt({ pidId, pvId, cvId, spTagId, auto });
      if (!block) return;

      const tags = getTags() || [];
      const pidTag = tags.find((t) => t.id === pidId);
      if (pidTag?.type === 'PID') {
        pidTag.fb = { ...(pidTag.fb || {}), pvId, spId: spTagId, outId: cvId };
        markTagsDirty?.();
      }

      const ta = document.getElementById('program-src');
      const editor = getEditor();
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(end);
        ta.value = `${before}${block}${after}`;
        ta.selectionStart = start + block.length;
        ta.selectionEnd = start + block.length;
        ta.dataset.dirty = '1';
        ta.dispatchEvent(new CustomEvent('st-edit', { bubbles: true }));
        editor?.updateGutter?.();
      }
    });
  }

  return {
    analogWireTags,
    analogWireTagSelectHtml,
    pidWireEditHtml,
    readPidWireFromRow,
    formatPidWire,
    buildPidSt,
    parsePidSt,
    bindProgramDialog,
    refreshDialogSelects,
  };
})();
