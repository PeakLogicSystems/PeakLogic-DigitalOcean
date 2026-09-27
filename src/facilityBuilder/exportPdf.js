'use strict';

const fs = require('fs');
const PDFDocument = require('pdfkit');
const { getSymbol, resolveHandle } = require('./symbolLibrary');
const { resolveUpload } = require('./facilityStore');
const { formatDistance } = require('./scale');
const { drawingBounds, formatExtentsSize } = require('./extents');

const PAGE_SIZES = {
  letter: [612, 792],
  tabloid: [792, 1224],
};

function edgePathPoints(edge, nodes) {
  if (Array.isArray(edge.points) && edge.points.length >= 2) return edge.points;
  const a = resolveHandle(edge.from, nodes);
  const b = resolveHandle(edge.to, nodes);
  if (!a || !b) return [];
  return [[a.x, a.y], [b.x, b.y]];
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

/**
 * @param {object} project
 * @param {{ pageSize?: string, includeBackground?: boolean }} opts
 * @returns {Promise<Buffer>}
 */
function buildFacilityPdf(project, opts = {}) {
  const doc = project || {};
  const pageKey = opts.pageSize === 'tabloid' ? 'tabloid' : 'letter';
  const [pageW, pageH] = PAGE_SIZES[pageKey];
  const margin = 48;
  const titleH = 72;
  const drawW = pageW - margin * 2;
  const drawH = pageH - margin * 2 - titleH;
  const bounds = drawingBounds(doc, boundsOf);
  const units = doc.units || 'ft';

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: pageKey, margin: 0, autoFirstPage: true });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    pdf.fontSize(16).font('Helvetica-Bold').text(doc.name || 'MV Draw layout', margin, margin);
    pdf.font('Helvetica').fontSize(10).fillColor('#475569');
    const sub = [
      doc.meta?.site ? `Site: ${doc.meta.site}` : null,
      doc.meta?.client ? `Client: ${doc.meta.client}` : null,
      `Units: ${units}`,
      doc.scale?.pixelsPerUnit ? `Scale calibrated` : 'Scale not set',
      doc.extents ? `Extents: ${formatExtentsSize(doc.extents, units)}` : null,
      `Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    ].filter(Boolean).join('  ·  ');
    pdf.text(sub, margin, margin + 22, { width: drawW });
    pdf.fillColor('#0f172a');

    const baseY = margin + titleH;

    if (opts.includeBackground !== false && doc.background?.type === 'image') {
      const full = resolveUpload(doc.background.path);
      if (full) {
        try {
          const tl = worldToPdf(bounds.minX, bounds.maxY, bounds, margin, drawW, drawH);
          const br = worldToPdf(bounds.maxX, bounds.minY, bounds, margin, drawW, drawH);
          pdf.save();
          pdf.opacity(doc.background.opacity ?? 0.4);
          pdf.image(full, tl.x, baseY + tl.y - margin - titleH + margin, {
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
      pdf.strokeColor('#2563eb').moveTo(
        worldToPdf(pts[0][0], pts[0][1], bounds, margin, drawW, drawH).x,
        baseY + worldToPdf(pts[0][0], pts[0][1], bounds, margin, drawW, drawH).y - margin - titleH + margin,
      );
      for (let i = 1; i < pts.length; i++) {
        const p = worldToPdf(pts[i][0], pts[i][1], bounds, margin, drawW, drawH);
        pdf.lineTo(p.x, baseY + p.y - margin - titleH + margin);
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
      pdf.fillColor(sym?.fill || '#94a3b8').strokeColor(sym?.stroke || '#334155');
      pdf.rect(tl.x, baseY + tl.y - margin - titleH + margin, rw, rh).fillAndStroke();
      pdf.fillColor('#0f172a').fontSize(8).text(
        node.label || sym?.label || node.type,
        tl.x,
        baseY + tl.y - margin - titleH + margin + rh + 2,
        { width: rw, align: 'center' },
      );
    }

    const barLen = units === 'm' ? 10 : 50;
    const bl = worldToPdf(bounds.maxX - barLen, bounds.minY, bounds, margin, drawW, drawH);
    const br = worldToPdf(bounds.maxX, bounds.minY, bounds, margin, drawW, drawH);
    const barY = baseY + drawH - 16;
    pdf.strokeColor('#0f172a').lineWidth(2);
    pdf.moveTo(bl.x, barY).lineTo(br.x, barY).stroke();
    pdf.fontSize(9).fillColor('#334155').text(formatDistance(units, barLen), bl.x, barY + 4, {
      width: br.x - bl.x,
      align: 'center',
    });

    pdf.end();
  });
}

module.exports = { buildFacilityPdf, boundsOf };
