'use strict';

/** Expand compact device trace + deploy map into editor overlay rows. */
function expandRemoteProgramTrace(traceMap, compact) {
  if (!Array.isArray(traceMap) || !traceMap.length || !Array.isArray(compact) || !compact.length) {
    return [];
  }
  const values = new Map();
  for (const row of compact) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const idx = Number(row[0]);
    if (!Number.isFinite(idx) || idx < 0) continue;
    values.set(idx, Number(row[1]));
  }
  const out = [];
  for (let i = 0; i < traceMap.length; i++) {
    const m = traceMap[i];
    if (!m || !values.has(i)) continue;
    const kind = m.k || m.kind || 'num';
    const start = m.s ?? m.start;
    const end = m.e ?? m.end;
    if (start == null || end == null) continue;
    const raw = values.get(i);
    const entry = {
      start,
      end,
      kind,
      value: kind === 'bool' || kind === 'out' ? !!raw : raw,
    };
    if (kind === 'out' && (m.t || m.tag)) entry.tag = m.t || m.tag;
    out.push(entry);
  }
  return out;
}

module.exports = { expandRemoteProgramTrace };
