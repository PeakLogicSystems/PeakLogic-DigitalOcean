'use strict';

(function initProjectListSort() {
  function formatSavedAt(iso) {
    if (!iso) return '';
    if (window.PeaklogicTime?.formatFriendly) return window.PeaklogicTime.formatFriendly(iso);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
    return d.toLocaleString(undefined, {
      timeZone: window.PeaklogicTime?.getTimezone?.() || 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function typeLabel(p) {
    const f = String(p?.format || '').toLowerCase();
    if (f === 'zip' || f === 'archive') return 'est.zip';
    if (f === 'json') return 'legacy json';
    const file = String(p?.file || p?.filename || p?.path || '');
    if (/\.est\.zip$/i.test(file)) return 'est.zip';
    if (/\.mvbundle$/i.test(file)) return 'mvbundle';
    if (/\.est\.json$/i.test(file) || /\.json$/i.test(file)) return 'legacy json';
    if (p?.source === 'cloud') return 'cloud';
    if (p?.source === 'local') return 'repository';
    if (p?.version) return `v${p.version}`;
    return f || 'project';
  }

  function sortValue(p, key) {
    if (key === 'date') return String(p?.savedAt || p?.updatedAt || '');
    if (key === 'type') return typeLabel(p).toLowerCase();
    return String(p?.name || p?.file || p?.id || '').toLowerCase();
  }

  function optionLabel(p) {
    const name = p?.name || p?.file || p?.id || '';
    const type = typeLabel(p);
    const when = p?.savedAt || p?.updatedAt;
    const datePart = when ? formatSavedAt(when) : '';
    return `${name}${type ? ` · ${type}` : ''}${datePart ? ` · ${datePart}` : ''}`;
  }

  function sortItems(items, state) {
    const sort = state || { key: 'date', dir: 'desc' };
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      const na = sortValue(a, 'name');
      const nb = sortValue(b, 'name');
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });
  }

  function cycleSort(state, key) {
    if (!state || !key) return state;
    if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else {
      state.key = key;
      state.dir = key === 'date' ? 'desc' : 'asc';
    }
    return state;
  }

  function syncButtons(scope, state, btnAttr) {
    const attr = btnAttr || 'data-project-sort';
    document.querySelectorAll(`[data-project-sort-scope="${scope}"] [${attr}]`).forEach((btn) => {
      const key = btn.getAttribute(attr);
      const active = key === state.key;
      btn.classList.toggle('active', active);
      const label = btn.getAttribute('data-sort-label') || btn.textContent.replace(/\s*[▲▼]\s*$/, '').trim();
      btn.setAttribute('data-sort-label', label);
      btn.textContent = active ? `${label}${state.dir === 'asc' ? ' ▲' : ' ▼'}` : label;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function normalizeRecord(p, defaults) {
    const item = { ...(p || {}), ...(defaults || {}) };
    if (!item.format && item.id && !item.file) item.format = 'zip';
    if (!item.savedAt && item.updatedAt) item.savedAt = item.updatedAt;
    return item;
  }

  window.PeaklogicProjectListSort = {
    formatSavedAt,
    typeLabel,
    sortValue,
    optionLabel,
    sortItems,
    cycleSort,
    syncButtons,
    normalizeRecord,
    defaultState: () => ({ key: 'date', dir: 'desc' }),
  };
})();
