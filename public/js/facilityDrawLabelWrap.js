'use strict';

const DEFAULT_MAX_LINE = 8;

/**
 * Split label text into lines (max 8 chars per line when total length > 8).
 * Prefers word breaks; hard-splits long tokens.
 */
function wrapLabel(text, maxLen = DEFAULT_MAX_LINE) {
  const raw = String(text || '').trim();
  const limit = Math.max(4, +maxLen || DEFAULT_MAX_LINE);
  if (!raw) return [''];
  if (raw.length <= limit) return [raw];

  const words = raw.split(/\s+/);
  const lines = [];
  let current = '';

  const flush = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };

  for (const word of words) {
    if (word.length > limit) {
      flush();
      for (let i = 0; i < word.length; i += limit) {
        lines.push(word.slice(i, i + limit));
      }
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length <= limit) {
      current = next;
    } else {
      flush();
      current = word;
    }
  }
  flush();
  return lines.length ? lines : [raw];
}

function wrapLabelText(text, maxLen = DEFAULT_MAX_LINE) {
  return wrapLabel(text, maxLen).join('\n');
}

const labelWrapApi = {
  DEFAULT_MAX_LINE,
  wrapLabel,
  wrapLabelText,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = labelWrapApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.FacilityDrawLabelWrap = labelWrapApi;
}
