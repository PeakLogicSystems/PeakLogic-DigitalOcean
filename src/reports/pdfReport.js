'use strict';

const PDFDocument = require('pdfkit');
const { normalizeReportConfig } = require('./reportConfig');
const { penStatistics } = require('./penStats');

function fmtNum(n, digits = 3) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits);
}

function fmtTs(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  try {
    const persistence = require('../persistence');
    const { formatInTimezone, resolveTimezone } = require('../settings/timezoneSettings');
    return formatInTimezone(new Date(ms), resolveTimezone(persistence));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function decodeChartImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, height, config) {
  const bottom = doc.page.height - doc.page.margins.bottom - 20;
  if (doc.y + height <= bottom) return;
  drawFooter(doc, config, doc._mvPageNum || 1);
  doc._mvPageNum = (doc._mvPageNum || 1) + 1;
  doc.addPage({ size: config.pageSize, layout: config.orientation, margin: 48 });
}

function drawFooter(doc, config, pageNum) {
  const savedY = doc.y;
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const y = doc.page.height - 28;
  doc.fontSize(8).fillColor('#64748b');
  const line = [
    config.footer || '',
    `Page ${pageNum}`,
  ].filter(Boolean).join(' · ');
  doc.text(line, left, y, { width, align: 'left', lineBreak: false });
  doc.fillColor('#0f172a').fontSize(10);
  doc.y = savedY;
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 28, doc._mvReportConfig);
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#0f172a').font('Helvetica-Bold').text(title);
  doc.font('Helvetica');
  doc.moveDown(0.25);
}

function drawPenTable(doc, rows) {
  const config = doc._mvReportConfig;
  const cols = [
    { label: 'Tag', w: 0.22 },
    { label: 'Scale', w: 0.1 },
    { label: 'Offset', w: 0.1 },
    { label: 'Samples', w: 0.1 },
    { label: 'Last raw', w: 0.18 },
    { label: 'Last scaled', w: 0.2 },
  ];
  const width = contentWidth(doc);
  const rowH = 16;
  ensureSpace(doc, rowH * (rows.length + 2), config);

  let x = doc.page.margins.left;
  let y = doc.y;
  doc.fontSize(9).fillColor('#f8fafc');
  doc.rect(x, y, width, rowH).fill('#e2e8f0').stroke('#cbd5e1');
  doc.fillColor('#0f172a').font('Helvetica-Bold');
  cols.forEach((c) => {
    const cw = width * c.w;
    doc.text(c.label, x + 4, y + 4, { width: cw - 8, lineBreak: false });
    x += cw;
  });
  doc.font('Helvetica');
  y += rowH;

  rows.forEach((row, idx) => {
    x = doc.page.margins.left;
    if (y + rowH > doc.page.height - doc.page.margins.bottom - 20) {
      drawFooter(doc, config, doc._mvPageNum || 1);
      doc._mvPageNum = (doc._mvPageNum || 1) + 1;
      doc.addPage({ size: config.pageSize, layout: config.orientation, margin: 48 });
      y = doc.page.margins.top;
    }
    if (idx % 2 === 0) {
      doc.rect(x, y, width, rowH).fill('#f8fafc');
    }
    doc.fillColor('#0f172a').fontSize(9);
    const cells = [
      row.tagId,
      String(row.scale),
      String(row.offset),
      String(row.samples),
      fmtNum(row.raw.last),
      fmtNum(row.scaled.last),
    ];
    cols.forEach((c, i) => {
      const cw = width * c.w;
      doc.text(cells[i], x + 4, y + 4, { width: cw - 8, lineBreak: false });
      x += cw;
    });
    y += rowH;
  });
  doc.y = y + 6;
}

function drawStatsTable(doc, rows) {
  const config = doc._mvReportConfig;
  const cols = [
    { label: 'Tag', w: 0.2 },
    { label: 'Min', w: 0.13 },
    { label: 'Max', w: 0.13 },
    { label: 'Avg', w: 0.13 },
    { label: 'Last', w: 0.13 },
    { label: 'Samples', w: 0.1 },
  ];
  const width = contentWidth(doc);
  const rowH = 16;
  ensureSpace(doc, rowH * (rows.length + 2), config);

  let x = doc.page.margins.left;
  let y = doc.y;
  doc.fontSize(9);
  doc.rect(x, y, width, rowH).fill('#e2e8f0');
  doc.fillColor('#0f172a').font('Helvetica-Bold');
  cols.forEach((c) => {
    const cw = width * c.w;
    doc.text(c.label, x + 4, y + 4, { width: cw - 8, lineBreak: false });
    x += cw;
  });
  doc.font('Helvetica');
  y += rowH;

  rows.forEach((row, idx) => {
    x = doc.page.margins.left;
    if (y + rowH > doc.page.height - doc.page.margins.bottom - 20) {
      drawFooter(doc, config, doc._mvPageNum || 1);
      doc._mvPageNum = (doc._mvPageNum || 1) + 1;
      doc.addPage({ size: config.pageSize, layout: config.orientation, margin: 48 });
      y = doc.page.margins.top;
    }
    if (idx % 2 === 0) doc.rect(x, y, width, rowH).fill('#f8fafc');
    doc.fillColor('#0f172a').fontSize(9);
    const s = row.scaled;
    const cells = [row.tagId, fmtNum(s.min), fmtNum(s.max), fmtNum(s.avg), fmtNum(s.last), String(row.samples)];
    cols.forEach((c, i) => {
      const cw = width * c.w;
      doc.text(cells[i], x + 4, y + 4, { width: cw - 8, lineBreak: false });
      x += cw;
    });
    y += rowH;
  });
  doc.y = y + 6;
}

/**
 * @param {object} payload
 * @returns {Promise<Buffer>}
 */
function buildPdfReport(payload) {
  const config = normalizeReportConfig(payload?.reportConfig);
  const meta = payload?.meta || {};
  const pens = Array.isArray(payload?.pens) ? payload.pens : [];
  const history = payload?.history && typeof payload.history === 'object' ? payload.history : {};
  const stats = penStatistics(history, pens);
  const chartBuf = config.sections.chart ? decodeChartImage(payload?.chartImage) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: config.pageSize,
      layout: config.orientation,
      margin: 48,
      info: {
        Title: config.title,
        Author: config.company || 'PeakLogic',
        Subject: meta.rangeLabel || 'Historian report',
      },
    });
    doc._mvReportConfig = config;
    const chunks = [];
    doc._mvPageNum = 1;

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (config.sections.cover) {
      doc.fontSize(20).font('Helvetica-Bold').text(config.title, { align: 'left' });
      doc.font('Helvetica');
      if (config.subtitle) {
        doc.moveDown(0.25);
        doc.fontSize(12).fillColor('#475569').text(config.subtitle);
        doc.fillColor('#0f172a');
      }
      if (config.company) {
        doc.moveDown(0.5);
        doc.fontSize(11).text(config.company);
      }
      doc.moveDown(0.75);
      doc.fontSize(10).fillColor('#64748b');
      const lines = [
        meta.projectName ? `Project: ${meta.projectName}` : null,
        meta.rangeLabel ? `Range: ${meta.rangeLabel}` : null,
        meta.source ? `Source: ${meta.source}` : null,
        meta.penCount != null ? `Pens: ${meta.penCount}` : null,
        meta.sampleCount != null ? `Samples: ${meta.sampleCount}` : null,
        `Generated: ${meta.exportedAt || new Date().toISOString()}`,
      ].filter(Boolean);
      lines.forEach((line) => doc.text(line));
      doc.fillColor('#0f172a');
      doc.moveDown(1);
    }

    if (config.sections.chart && chartBuf) {
      drawSectionTitle(doc, 'Trend chart');
      const w = contentWidth(doc);
      const maxH = config.chartMaxHeight;
      ensureSpace(doc, maxH + 20, config);
      try {
        doc.image(chartBuf, doc.page.margins.left, doc.y, {
          fit: [w, maxH],
          align: 'center',
          valign: 'top',
        });
        doc.y += maxH + 8;
      } catch (e) {
        doc.fontSize(10).fillColor('#b91c1c').text(`Chart image error: ${e.message}`);
        doc.fillColor('#0f172a');
      }
    }

    if (config.sections.penTable && stats.length) {
      drawSectionTitle(doc, 'Pen summary');
      drawPenTable(doc, stats);
    }

    if (config.sections.statistics && stats.length) {
      drawSectionTitle(doc, 'Statistics (scaled values)');
      drawStatsTable(doc, stats);
    }

    if (config.sections.notes && config.notes.trim()) {
      drawSectionTitle(doc, 'Notes');
      doc.fontSize(10).text(config.notes.trim(), { width: contentWidth(doc) });
    }

    drawFooter(doc, config, doc._mvPageNum || 1);
    doc.end();
  });
}

module.exports = {
  buildPdfReport,
  fmtNum,
  fmtTs,
};
