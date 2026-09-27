'use strict';

/**
 * Lightweight ST program editor (line numbers, tab, dirty state, live expression trace overlay).
 */
window.StEditor = (function () {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatTraceAnn(t) {
    if (t.kind === 'out') return t.value ? ' ON' : '';
    if (t.kind === 'bool') return t.value ? ' \u2713' : ' \u2717';
    const v = t.value;
    if (Number.isInteger(v)) return ` = ${v}`;
    if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) return ` = ${v.toExponential(2)}`;
    return ` = ${Number(v.toFixed(3)).toString()}`;
  }

  function dedupeTrace(trace) {
    const map = new Map();
    for (const t of trace || []) {
      if (t.start == null || t.end == null || t.end <= t.start) continue;
      map.set(`${t.start}:${t.end}`, t);
    }
    return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function renderTraceHtml(source, trace) {
    const entries = dedupeTrace(trace);
    if (!entries.length) return escHtml(source);
    const opens = Array(source.length + 1).fill(null).map(() => []);
    const closes = Array(source.length + 1).fill(null).map(() => []);
    const maxIdx = opens.length - 1;
    for (const t of entries) {
      const start = Number(t.start);
      const end = Number(t.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < 0 || end <= start || end > source.length) continue;
      if (start > maxIdx || end > maxIdx) continue;
      let cls;
      if (t.kind === 'out') {
        if (!t.value) continue;
        cls = 'st-trace-out-true';
      } else if (t.kind === 'bool') {
        cls = t.value ? 'st-trace-true' : 'st-trace-false';
      } else {
        cls = 'st-trace-num';
      }
      const len = end - start;
      const ann = formatTraceAnn(t);
      opens[start].push({ len, html: `<span class="${cls}">` });
      closes[end].push({
        len,
        html: `${ann ? `</span><span class="st-trace-ann">${escHtml(ann)}</span>` : '</span>'}`,
      });
    }
    let html = '';
    for (let i = 0; i < source.length; i++) {
      if (opens[i].length) {
        opens[i].sort((a, b) => a.len - b.len);
        html += opens[i].map((o) => o.html).join('');
      }
      html += escHtml(source[i]);
      if (closes[i + 1]?.length) {
        closes[i + 1].sort((a, b) => b.len - a.len);
        html += closes[i + 1].map((c) => c.html).join('');
      }
    }
    return html;
  }

  function create(textarea, opts = {}) {
    const wrap = textarea.closest('.st-editor-wrap') || textarea.parentElement;
    const gutter = wrap?.querySelector('[data-st-gutter]');
    const main = textarea.closest('.st-editor-main') || wrap;
    let highlightEl = main?.querySelector('[data-st-highlight]');
    if (!highlightEl && main) {
      highlightEl = document.createElement('pre');
      highlightEl.className = 'st-editor-highlight';
      highlightEl.setAttribute('data-st-highlight', '');
      highlightEl.setAttribute('aria-hidden', 'true');
      main.insertBefore(highlightEl, textarea);
    }
    const statusEl = opts.statusEl ? document.getElementById(opts.statusEl) : null;
    let baseline = textarea.value;
    let lastTrace = [];
    let traceActive = false;

    function setStatus() {
      if (!statusEl) return;
      const dirty = textarea.dataset.dirty === '1';
      let msg = dirty ? 'Unsaved changes' : (opts.activePath ? `Editing \u00b7 ${opts.activePath}` : 'Saved');
      if (!dirty && traceActive && lastTrace.length) msg += ' \u00b7 live values';
      statusEl.textContent = msg;
      statusEl.className = dirty ? 'inline-msg warn' : 'inline-msg muted';
    }

    function updateGutter() {
      if (!gutter) return;
      const lines = Math.max(1, textarea.value.split('\n').length);
      let html = '';
      for (let i = 1; i <= lines; i++) html += `${i}\n`;
      gutter.textContent = html;
    }

    function renderHighlight() {
      if (!highlightEl) return;
      if (textarea.dataset.dirty === '1' || !traceActive || !lastTrace.length) {
        highlightEl.innerHTML = escHtml(textarea.value);
        return;
      }
      highlightEl.innerHTML = renderTraceHtml(textarea.value, lastTrace);
    }

    function markDirty() {
      textarea.dataset.dirty = '1';
      textarea.dispatchEvent(new CustomEvent('st-edit', { bubbles: true }));
      renderHighlight();
      setStatus();
    }

    function markClean() {
      textarea.dataset.dirty = '';
      renderHighlight();
      setStatus();
    }

    function setValue(src, { clean = false, baseline: newBase = null } = {}) {
      textarea.value = src ?? '';
      updateGutter();
      syncScroll();
      renderHighlight();
      if (clean) {
        baseline = newBase != null ? newBase : textarea.value;
        markClean();
      }
    }

    function syncScroll() {
      const top = textarea.scrollTop;
      const left = textarea.scrollLeft;
      if (gutter) gutter.scrollTop = top;
      if (highlightEl) {
        highlightEl.scrollTop = top;
        highlightEl.scrollLeft = left;
      }
    }

    textarea.addEventListener('input', () => {
      markDirty();
      updateGutter();
    });
    textarea.addEventListener('scroll', syncScroll);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = `${val.slice(0, start)}  ${val.slice(end)}`;
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        markDirty();
        updateGutter();
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        textarea.dispatchEvent(new CustomEvent('st-save', { bubbles: true }));
      }
    });

    return {
      setValue,
      markDirty,
      markClean,
      isDirty: () => textarea.dataset.dirty === '1',
      revert() {
        textarea.value = baseline;
        markClean();
        updateGutter();
        renderHighlight();
        textarea.dispatchEvent(new CustomEvent('st-edit', { bubbles: true }));
      },
      setBaseline(src) {
        baseline = src ?? textarea.value;
        markClean();
      },
      updateGutter,
      setActivePath(path) {
        opts.activePath = path;
        setStatus();
      },
      setTrace(trace, active = true) {
        lastTrace = Array.isArray(trace) ? trace : [];
        traceActive = !!active;
        renderHighlight();
        setStatus();
      },
      clearTrace() {
        lastTrace = [];
        traceActive = false;
        renderHighlight();
        setStatus();
      },
    };
  }

  return { create };
})();
