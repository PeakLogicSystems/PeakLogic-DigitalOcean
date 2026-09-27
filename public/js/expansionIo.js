'use strict';

/** Shared Opta expansion module I/O helpers (X{n}_ tags from D1608E / A0602). */
window.PeakLogicExpansionIo = (function () {
  const EXPANSION_RE = /^X(\d+)_/;

  function isExpansionIoTag(tag) {
    return EXPANSION_RE.test(String(tag?.id || ''));
  }

  function expansionSlotFromId(id) {
    const m = EXPANSION_RE.exec(String(id || ''));
    return m ? Number(m[1]) : 0;
  }

  function expansionModuleKind(tags) {
    const ids = (tags || []).map((t) => t.id);
    if (ids.some((id) => /_I\d+$/.test(id) || /_R\d+$/.test(id))) return 'D1608E';
    if (ids.some((id) => /_AI\d+$/.test(id) || /_PWM\d+$/.test(id))) return 'A0602';
    return '';
  }

  function expansionSectionTitle(slot, tags) {
    const kind = expansionModuleKind(tags);
    return kind ? `Expansion ${slot} (${kind})` : `Expansion ${slot}`;
  }

  /** Split I/O tags into on-board base vs expansion slots. */
  function partitionIoTags(tags) {
    const base = [];
    const bySlot = new Map();
    for (const tag of tags || []) {
      const slot = expansionSlotFromId(tag.id);
      if (slot) {
        if (!bySlot.has(slot)) bySlot.set(slot, []);
        bySlot.get(slot).push(tag);
      } else {
        base.push(tag);
      }
    }
    return { base, bySlot };
  }

  return {
    isExpansionIoTag,
    expansionSlotFromId,
    expansionModuleKind,
    expansionSectionTitle,
    partitionIoTags,
  };
})();
