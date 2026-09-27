'use strict';

const { getSymbol, resolveHandle } = require('./symbolLibrary');
const { normalizeExtents } = require('./extents');

function dxfNum(n) {
  return Number(n).toFixed(4);
}

function edgePathPoints(edge, nodes) {
  if (Array.isArray(edge.points) && edge.points.length >= 2) return edge.points;
  const a = resolveHandle(edge.from, nodes);
  const b = resolveHandle(edge.to, nodes);
  if (!a || !b) return [];
  return [[a.x, a.y], [b.x, b.y]];
}

/** Minimal ASCII DXF (R12-style entities). Y axis matches world coords (up = +Y). */
function buildFacilityDxf(project) {
  const doc = project || {};
  const lines = [
    '0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '5',
    '0', 'LAYER', '2', 'SEPTIC', '70', '0', '62', '5', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'PIPING', '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'SITE', '70', '0', '62', '8', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'ANNOTATIONS', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'EXTENTS', '70', '0', '62', '6', '6', 'CONTINUOUS',
    '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  const ext = normalizeExtents(doc.extents);
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
      lines.push(
        '0', 'TEXT', '8', 'ANNOTATIONS',
        '10', dxfNum(node.x), '20', dxfNum(node.y - h / 2 - 2),
        '40', '2.5', '1', String(node.label || sym.label).slice(0, 80),
      );
    }
  }

  for (const edge of doc.edges || []) {
    const pts = edgePathPoints(edge, doc.nodes);
    if (pts.length < 2) continue;
    if (pts.length === 2) {
      lines.push(
        '0', 'LINE', '8', 'PIPING',
        '10', dxfNum(pts[0][0]), '20', dxfNum(pts[0][1]),
        '11', dxfNum(pts[1][0]), '21', dxfNum(pts[1][1]),
      );
    } else {
      lines.push('0', 'LWPOLYLINE', '8', 'PIPING', '90', String(pts.length), '70', '0');
      for (const [x, y] of pts) {
        lines.push('10', dxfNum(x), '20', dxfNum(y));
      }
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return `${lines.join('\n')}\n`;
}

module.exports = { buildFacilityDxf };
