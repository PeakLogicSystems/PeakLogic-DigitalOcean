'use strict';

/** Shared tag id / label display preference (program Live I/O, HMI bindings, tag legend). */
window.PeakLogicTagDisplay = (function () {
  const KEY = 'peaklogic-tag-display';
  const MODES = ['id', 'label', 'both'];

  function getMode() {
    const m = localStorage.getItem(KEY);
    return MODES.includes(m) ? m : 'id';
  }

  function setMode(mode) {
    if (!MODES.includes(mode)) return;
    localStorage.setItem(KEY, mode);
    document.querySelectorAll('[data-tag-display-mode]').forEach((el) => {
      el.value = mode;
    });
    window.dispatchEvent(new CustomEvent('peaklogic-tag-display', { detail: { mode } }));
  }

  function resolveTag(tagOrId, tags) {
    if (tagOrId && typeof tagOrId === 'object') return tagOrId;
    const id = String(tagOrId || '');
    const list = Array.isArray(tags) ? tags : [];
    return list.find((t) => t.id === id) || { id, label: '' };
  }

  function formatTag(tagOrId, tags) {
    const tag = resolveTag(tagOrId, tags);
    const id = String(tag.id || '');
    const label = String(tag.label || '').trim();
    const mode = getMode();
    if (mode === 'label') return label || id;
    if (mode === 'both') return label ? `${label} · ${id}` : id;
    return id;
  }

  function formatTagSub(tagOrId, tags) {
    const tag = resolveTag(tagOrId, tags);
    const id = String(tag.id || '');
    const label = String(tag.label || '').trim();
    const mode = getMode();
    if (mode === 'id' || !label) return '';
    if (mode === 'label') return id;
    return label;
  }

  function modeOptions(selected) {
    const cur = selected || getMode();
    const labels = { id: 'Tag id', label: 'Label', both: 'Label · id' };
    return MODES.map((m) =>
      `<option value="${m}" ${m === cur ? 'selected' : ''}>${labels[m]}</option>`
    ).join('');
  }

  function bindSelect(el) {
    if (!el) return;
    el.innerHTML = modeOptions(getMode());
    el.addEventListener('change', () => setMode(el.value));
  }

  function bindAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-tag-display-mode]').forEach((el) => bindSelect(el));
  }

  return {
    MODES,
    getMode,
    setMode,
    formatTag,
    formatTagSub,
    modeOptions,
    bindSelect,
    bindAll,
  };
})();
