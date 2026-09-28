'use strict';

function parsePayload(payload, template) {
  const raw = payload == null ? '' : String(payload);
  if (!template || template === 'raw') return raw;
  if (template === 'bool') {
    return raw === '1' || raw === 'true' || raw === 'ON' || raw === 'on';
  }
  if (template === 'number') return parseFloat(raw) || 0;
  try {
    const j = JSON.parse(raw);
    if (template.startsWith('json:')) {
      const path = template.slice(5).split('.');
      let cur = j;
      for (const p of path) cur = cur?.[p];
      return cur;
    }
    return j;
  } catch {
    return raw;
  }
}

function formatPayloadForWrite(value, template) {
  if (template === 'bool') return value ? '1' : '0';
  if (template === 'json') return JSON.stringify({ value });
  if (template && template.startsWith('edgepoint:output:')) {
    const reg = Number(template.slice('edgepoint:output:'.length));
    return JSON.stringify({ outputs: [{ reg, state: value ? 1 : 0 }] });
  }
  return String(value);
}

function tagValueFromParsed(tag, parsed) {
  if (tag.type === 'BOOL') return !!parsed;
  const n = Number(parsed);
  return Number.isFinite(n) ? n : 0;
}

module.exports = {
  parsePayload,
  formatPayloadForWrite,
  tagValueFromParsed,
};
