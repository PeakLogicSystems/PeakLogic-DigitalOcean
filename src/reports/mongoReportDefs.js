'use strict';

const { getSource } = require('./mongoReportCatalog');

const MAX_DEFS = 50;
const MAX_NAME = 80;

function normalizeReportSpec(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sourceId = String(src.sourceId || 'sys_log').slice(0, 64);
  const source = getSource(sourceId);
  const limit = Math.min(Math.max(Number(src.limit) || 500, 10), 5000);
  const sortDir = Number(src.sortDir) === 1 ? 1 : -1;
  const columns = Array.isArray(src.columns)
    ? src.columns.map((c) => String(c).slice(0, 64)).filter(Boolean)
    : (source?.defaultColumns || []);
  const filter = src.filter && typeof src.filter === 'object' ? { ...src.filter } : {};
  return {
    id: String(src.id || '').slice(0, 64) || null,
    name: String(src.name || '').slice(0, MAX_NAME),
    sourceId,
    collection: String(src.collection || '').slice(0, 64) || null,
    columns,
    filter,
    since: src.since ? String(src.since) : null,
    until: src.until ? String(src.until) : null,
    limit,
    sortField: String(src.sortField || source?.dateField || 'at').slice(0, 64),
    sortDir,
    title: String(src.title || src.name || 'MongoDB report').slice(0, 120),
  };
}

function normalizeReportDefs(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.slice(0, MAX_DEFS).map((d, idx) => {
    const spec = normalizeReportSpec(d);
    return {
      ...spec,
      id: spec.id || `def_${idx + 1}`,
      name: spec.name || `Report ${idx + 1}`,
    };
  });
}

module.exports = {
  normalizeReportSpec,
  normalizeReportDefs,
};
