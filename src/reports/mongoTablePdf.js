'use strict';

const PDFDocument = require('pdfkit');

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function drawTablePdf({ title, subtitle, columns, rows, pageSize = 'A4', orientation = 'landscape' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: pageSize, layout: orientation, margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#0f172a').font('Helvetica-Bold').text(title || 'MongoDB report', { align: 'left' });
    doc.font('Helvetica');
    if (subtitle) {
      doc.moveDown(0.25);
      doc.fontSize(10).fillColor('#64748b').text(subtitle);
    }
    doc.moveDown(0.75);
    doc.fontSize(9).fillColor('#0f172a');

    const cols = columns.length ? columns : [{ id: 'value', label: 'Value' }];
    const width = contentWidth(doc);
    const colW = width / cols.length;
    const rowH = 14;
    let y = doc.y;

    function drawHeader() {
      let x = doc.page.margins.left;
      doc.rect(x, y, width, rowH).fill('#e2e8f0');
      doc.fillColor('#0f172a').font('Helvetica-Bold');
      cols.forEach((c) => {
        doc.text(String(c.label || c.id), x + 2, y + 3, { width: colW - 4, lineBreak: false });
        x += colW;
      });
      doc.font('Helvetica');
      y += rowH;
    }

    drawHeader();
    rows.forEach((row, idx) => {
      if (y + rowH > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage({ size: pageSize, layout: orientation, margin: 40 });
        y = doc.page.margins.top;
        drawHeader();
      }
      if (idx % 2 === 0) {
        doc.rect(doc.page.margins.left, y, width, rowH).fill('#f8fafc');
      }
      let x = doc.page.margins.left;
      doc.fillColor('#0f172a');
      cols.forEach((c) => {
        const val = String(row[c.id] ?? '').slice(0, 120);
        doc.text(val, x + 2, y + 3, { width: colW - 4, lineBreak: false });
        x += colW;
      });
      y += rowH;
    });

    doc.end();
  });
}

module.exports = { drawTablePdf };
