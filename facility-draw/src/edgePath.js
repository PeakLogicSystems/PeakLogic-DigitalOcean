'use strict';

const { resolveHandle } = require('./symbolLibrary');
const {
  normalizeVertices,
  orthogonalPathBetween,
  buildEdgePathPoints,
  dedupeConsecutive,
} = require('../../public/js/facilityDrawEdgePath');

/** Distance from point to line segment; returns closest point on segment and param t in [0,1]. */
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    return { dist: Math.hypot(px - x1, py - y1), t: 0, x: x1, y: y1 };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return { dist: Math.hypot(px - x, py - y), t, x, y };
}

/**
 * Find where to insert a bend on a full port-to-port path (including endpoints).
 * segmentIndex equals the insert index in edge.points.
 */
function nearestSegmentOnPath(pathPoints, wx, wy) {
  if (!Array.isArray(pathPoints) || pathPoints.length < 2) return null;
  let bestDist = Infinity;
  let bestSeg = -1;
  let bestPoint = null;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const [x1, y1] = pathPoints[i];
    const [x2, y2] = pathPoints[i + 1];
    const r = distPointToSegment(wx, wy, x1, y1, x2, y2);
    if (r.dist < bestDist) {
      bestDist = r.dist;
      bestSeg = i;
      bestPoint = [r.x, r.y];
    }
  }
  if (bestSeg < 0) return null;
  return { segmentIndex: bestSeg, point: bestPoint, dist: bestDist };
}

function resolvePortForPath(node, portId) {
  const h = resolveHandle(`${node.id}:${portId}`, [node]);
  if (!h) return null;
  return { x: h.x, y: h.y, dir: h.dir || null };
}

/** Full world-space path from port to port, including intermediate bend vertices. */
function edgePathPoints(edge, nodes) {
  return buildEdgePathPoints(edge, nodes, resolvePortForPath);
}

module.exports = {
  edgePathPoints,
  normalizeVertices,
  distPointToSegment,
  nearestSegmentOnPath,
  orthogonalPathBetween,
  dedupeConsecutive,
};
