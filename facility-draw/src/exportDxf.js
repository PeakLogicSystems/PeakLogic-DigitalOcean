'use strict';

const { getSymbol, resolveHandle } = require('./symbolLibrary');
const { normalizeExtents, exportPlotExtents } = require('./extents');
const { edgePathPoints } = require('./edgePath');
const { edgeDxfLayer } = require('../../public/js/facilityDrawEdgePath');
const { wrapLabel } = require('./labelWrap');

function dxfNum(n) {
  return Number(n).toFixed(4);
}

/** Minimal ASCII DXF (R12-style entities). Y axis matches world coords (up = +Y). */
function buildFacilityDrawDxf(project, opts = {}) {
  const doc = project || {};
  const lines = [
    '0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '7',
    '0', 'LAYER', '2', 'SEPTIC', '70', '0', '62', '5', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'SRC', '70', '0', '62', '5', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'RETURN', '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'ELECTRIC', '70', '0', '62', '2', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'SITE', '70', '0', '62', '8', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'ANNOTATIONS', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'EXTENTS', '70', '0', '62', '6', '6', 'CONTINUOUS',
    '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  const ext = exportPlotExtents(doc, opts) || normalizeExtents(doc.extents);
  if (ext) {
    lines.push(
      '0', 'LWPOLYLINE', '8', 'EXTENTS', '90', '4', '70', '1',
      '10', dxfNum(ext.minX), '20', dxfNum(ext.minY),
      '10', dxfNum(ext.maxX), '20', dxfNum(ext.minY),
      '10', dxfNum(ext.maxX), '20', dxfNum(ext.maxY),
      '10', dxfNum(ext.minX), '20', dxfNum(ext.maxY),
    );
  }

  for (const node of doc.nodes || []) {
    const sym = getSymbol(node.type);
    const w = sym?.width || 4;
    const h = sym?.height || 4;
    const x = node.x - w / 2;
    const y = node.y - h / 2;
    lines.push(
      '0', 'LWPOLYLINE', '8', 'SEPTIC', '90', '4', '70', '1',
      '10', dxfNum(x), '20', dxfNum(y),
      '10', dxfNum(x + w), '20', dxfNum(y),
      '10', dxfNum(x + w), '20', dxfNum(y + h),
      '10', dxfNum(x), '20', dxfNum(y + h),
    );
    if (node.label || sym?.label) {
      const labelText = String(node.label || sym.label).slice(0, 80);
      const labelLines = wrapLabel(labelText);
      const lineStep = 2.8;
      for (let i = 0; i < labelLines.length; i++) {
        lines.push(
          '0', 'TEXT', '8', 'ANNOTATIONS',
          '10', dxfNum(node.x), '20', dxfNum(node.y - h / 2 - 2 - i * lineStep),
          '40', '2.5', '1', labelLines[i].slice(0, 80),
        );
      }
    }
  }

  for (const edge of doc.edges || []) {
    const pts = edgePathPoints(edge, doc.nodes);
    if (pts.length < 2) continue;
    const layer = edgeDxfLayer(edge);
    if (pts.length === 2) {
      lines.push(
        '0', 'LINE', '8', layer,
        '10', dxfNum(pts[0][0]), '20', dxfNum(pts[0][1]),
        '11', dxfNum(pts[1][0]), '21', dxfNum(pts[1][1]),
      );
    } else {
      lines.push('0', 'LWPOLYLINE', '8', layer, '90', String(pts.length), '70', '0');
      for (const [x, y] of pts) {
        lines.push('10', dxfNum(x), '20', dxfNum(y));
      }
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return `${lines.join('\n')}\n`;
}

module.exports = { buildFacilityDrawDxf };
