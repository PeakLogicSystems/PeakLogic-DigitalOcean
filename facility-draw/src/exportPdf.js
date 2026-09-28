'use strict';

const fs = require('fs');
const PDFDocument = require('pdfkit');
const { getSymbol } = require('./symbolLibrary');
const { resolveUpload } = require('./facilityDrawStore');
const { formatDistance } = require('./scale');
const { drawingBounds, formatExtentsSize, exportPlotExtents } = require('./extents');
const { pdfPagePoints, pdfPortraitBasePoints, pdfPageDimensions, normalizeSheetKey, normalizeOrientation } = require('./sheetSizes');
const { wrapLabel } = require('./labelWrap');
const { edgePathPoints } = require('./edgePath');
const { edgeExportColor } = require('../../public/js/facilityDrawEdgePath');

const BUILTIN_CAPTION_SHAPES = new Set([
  'treatment_tank',
  'integrated_mle_tank',
  'trash_tank_2comp',
  'dosing_tank',
  'simplex_lift',
  'duplex_lift',
  'atu_control_panel',
  'drip_field',
  'drip_irrigation_4leg',
]);

const PAGE_SIZES = {
  letter: [612, 792],
  tabloid: [792, 1224],
};

function resolvePdfPage(doc, opts = {}) {
  const orientation = normalizeOrientation(opts.orientation, 'landscape');
  const sheetKey = normalizeSheetKey(opts.pageSize || doc?.extents?.sheetSize);
  if (sheetKey) {
    const base = pdfPortraitBasePoints(sheetKey);
    if (base) {
      const { pageW, pageH } = pdfPageDimensions(base.width, base.height, orientation);
      return {
        pageW,
        pageH,
        sheetKey,
        orientation,
        pdfDocOptions: { size: [base.width, base.height], layout: orientation },
      };
    }
  }
  const pageKey = opts.pageSize === 'tabloid' ? 'tabloid' : 'letter';
  const [baseW, baseH] = PAGE_SIZES[pageKey];
  const { pageW, pageH } = pdfPageDimensions(baseW, baseH, orientation);
  return {
    pageW,
    pageH,
    pageKey,
    orientation,
    pdfDocOptions: { size: pageKey, layout: orientation },
  };
}

function boundsOf(doc) {
  let minX = 0;
  let minY = 0;
  let maxX = 100;
  let maxY = 80;
  for (const node of doc.nodes || []) {
    const sym = getSymbol(node.type);
    const w = sym?.width || 4;
    const h = sym?.height || 4;
    minX = Math.min(minX, node.x - w / 2);
    minY = Math.min(minY, node.y - h / 2);
    maxX = Math.max(maxX, node.x + w / 2);
    maxY = Math.max(maxY, node.y + h / 2);
  }
  for (const edge of doc.edges || []) {
    for (const [x, y] of edgePathPoints(edge, doc.nodes)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const pad = 10;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function worldToPdf(x, y, bounds, margin, drawW, drawH) {
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(drawW / spanX, drawH / spanY);
  return {
    x: margin + (x - bounds.minX) * scale,
    y: margin + (bounds.maxY - y) * scale,
    scale,
  };
}

function nodePdfCaption(node, sym) {
  const custom = String(node.label ?? '').trim();
  if (custom) return custom;
  if (BUILTIN_CAPTION_SHAPES.has(sym?.shape)) return '';
  return String(sym?.label || node.type || '').trim();
}

function maxLabelCharsForWidth(widthPt, fontSize = 8) {
  return Math.max(12, Math.floor(widthPt / (fontSize * 0.52)));
}

function drawPdfLabel(pdf, text, centerX, topY, symWidthPt, opts = {}) {
  const raw = String(text || '').trim();
  if (!raw) return;
  const fontSize = opts.fontSize || 8;
  const labelW = Math.max(symWidthPt, opts.minWidth || 56);
  const lines = wrapLabel(raw, maxLabelCharsForWidth(labelW, fontSize));
  const lineH = fontSize * 1.2;
  const left = centerX - labelW / 2;
  pdf.fillColor(opts.color || '#0f172a').fontSize(fontSize);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    pdf.text(line, left, topY + i * lineH, {
      width: labelW,
      align: 'center',
      lineBreak: false,
    });
  }
}

/**
 * @param {object} project
 * @param {{ pageSize?: string, orientation?: string, includeBackground?: boolean }} opts
 * @returns {Promise<Buffer>}
 */
function buildFacilityDrawPdf(project, opts = {}) {
  const doc = project || {};
  const { pageW, pageH, orientation, pdfDocOptions } = resolvePdfPage(doc, opts);
  const margin = 48;
  const titleH = 72;
  const drawW = pageW - margin * 2;
  const drawH = pageH - margin * 2 - titleH;
  const plotExtents = exportPlotExtents(doc, opts);
  const bounds = drawingBounds(doc, boundsOf, plotExtents);
  const units = doc.units || 'ft';

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ ...pdfDocOptions, margin: 0, autoFirstPage: true });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    pdf.fontSize(16).font('Helvetica-Bold').text(doc.name || 'Facility Draw layout', margin, margin);
    pdf.font('Helvetica').fontSize(10).fillColor('#475569');
    const sub = [
      doc.meta?.site ? `Site: ${doc.meta.site}` : null,
      doc.meta?.client ? `Client: ${doc.meta.client}` : null,
      `Units: ${units}`,
      `Orientation: ${orientation}`,
      doc.scale?.pixelsPerUnit ? `Scale calibrated` : 'Scale not set',
      doc.extents ? `Extents: ${formatExtentsSize(plotExtents || doc.extents, units)}` : null,
      `Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    ].filter(Boolean).join('  ·  ');
    pdf.text(sub, margin, margin + 22, { width: drawW });
    pdf.fillColor('#0f172a');

    if (opts.includeBackground !== false && doc.background?.type === 'image') {
      const full = resolveUpload(doc.background.path);
      if (full) {
        try {
          const tl = worldToPdf(bounds.minX, bounds.maxY, bounds, margin, drawW, drawH);
          const br = worldToPdf(bounds.maxX, bounds.minY, bounds, margin, drawW, drawH);
          pdf.save();
          pdf.opacity(doc.background.opacity ?? 0.4);
          pdf.image(full, tl.x, titleH + tl.y, {
            fit: [br.x - tl.x, br.y - tl.y],
            align: 'left',
            valign: 'top',
          });
          pdf.opacity(1);
          pdf.restore();
        } catch {
          /* skip bad image */
        }
      }
    }

    pdf.lineWidth(1.5);
    for (const edge of doc.edges || []) {
      const pts = edgePathPoints(edge, doc.nodes);
      if (pts.length < 2) continue;
      const p0 = worldToPdf(pts[0][0], pts[0][1], bounds, margin, drawW, drawH);
      pdf.strokeColor(edgeExportColor(edge)).moveTo(p0.x, titleH + p0.y);
      for (let i = 1; i < pts.length; i++) {
        const p = worldToPdf(pts[i][0], pts[i][1], bounds, margin, drawW, drawH);
        pdf.lineTo(p.x, titleH + p.y);
      }
      pdf.stroke();
    }

    for (const node of doc.nodes || []) {
      const sym = getSymbol(node.type);
      const w = sym?.width || 4;
      const h = sym?.height || 4;
      const tl = worldToPdf(node.x - w / 2, node.y + h / 2, bounds, margin, drawW, drawH);
      const br = worldToPdf(node.x + w / 2, node.y - h / 2, bounds, margin, drawW, drawH);
      const rw = br.x - tl.x;
      const rh = br.y - tl.y;
      const rectY = titleH + tl.y;
      pdf.fillColor(sym?.fill || '#94a3b8').strokeColor(sym?.stroke || '#334155');
      pdf.rect(tl.x, rectY, rw, rh).fillAndStroke();
      const caption = nodePdfCaption(node, sym);
      if (caption) {
        drawPdfLabel(pdf, caption, tl.x + rw / 2, rectY + rh + 2, rw);
      }
    }

    const barLen = units === 'm' ? 10 : 50;
    const bl = worldToPdf(bounds.maxX - barLen, bounds.minY, bounds, margin, drawW, drawH);
    const br = worldToPdf(bounds.maxX, bounds.minY, bounds, margin, drawW, drawH);
    const barY = titleH + drawH - 16;
    pdf.strokeColor('#0f172a').lineWidth(2);
    pdf.moveTo(bl.x, barY).lineTo(br.x, barY).stroke();
    pdf.fontSize(9).fillColor('#334155').text(formatDistance(units, barLen), bl.x, barY + 4, {
      width: Math.max(br.x - bl.x, 24),
      align: 'center',
      lineBreak: false,
    });

    pdf.end();
  });
}

module.exports = {
  buildFacilityDrawPdf,
  boundsOf,
  maxLabelCharsForWidth,
  nodePdfCaption,
  resolvePdfPage,
};
