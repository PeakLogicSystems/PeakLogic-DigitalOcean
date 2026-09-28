'use strict';

const DEFAULT_SECTIONS = {
  cover: true,
  chart: true,
  penTable: true,
  statistics: true,
  notes: true,
};

const DEFAULT_REPORT_CONFIG = {
  title: 'Historian Report',
  subtitle: '',
  company: '',
  footer: 'PeakLogic historian export',
  pageSize: 'A4',
  orientation: 'landscape',
  sections: { ...DEFAULT_SECTIONS },
  notes: '',
  chartMaxHeight: 220,
};

function normalizeReportConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sections = { ...DEFAULT_SECTIONS, ...(src.sections || {}) };
  const pageSize = String(src.pageSize || 'A4').toUpperCase() === 'LETTER' ? 'LETTER' : 'A4';
  const orientation = String(src.orientation || 'landscape').toLowerCase() === 'portrait'
    ? 'portrait'
    : 'landscape';
  return {
    title: String(src.title ?? DEFAULT_REPORT_CONFIG.title).slice(0, 120) || DEFAULT_REPORT_CONFIG.title,
    subtitle: String(src.subtitle ?? '').slice(0, 200),
    company: String(src.company ?? '').slice(0, 120),
    footer: String(src.footer ?? DEFAULT_REPORT_CONFIG.footer).slice(0, 200),
    pageSize,
    orientation,
    sections: {
      cover: sections.cover !== false,
      chart: sections.chart !== false,
      penTable: sections.penTable !== false,
      statistics: sections.statistics !== false,
      notes: sections.notes !== false,
    },
    notes: String(src.notes ?? '').slice(0, 4000),
    chartMaxHeight: Math.max(80, Math.min(400, Number(src.chartMaxHeight) || DEFAULT_REPORT_CONFIG.chartMaxHeight)),
  };
}

module.exports = {
  DEFAULT_REPORT_CONFIG,
  normalizeReportConfig,
};
