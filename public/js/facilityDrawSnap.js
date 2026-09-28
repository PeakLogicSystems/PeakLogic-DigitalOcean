'use strict';

function nodeScale(node) {
  const sx = Number(node?.scaleX);
  const sy = Number(node?.scaleY);
  return {
    scaleX: Number.isFinite(sx) && sx > 0 ? sx : 1,
    scaleY: Number.isFinite(sy) && sy > 0 ? sy : 1,
  };
}

function symbolSize(getSymbol, type, node) {
  const s = getSymbol(type);
  const { scaleX, scaleY } = nodeScale(node);
  return { w: (s?.width || 4) * scaleX, h: (s?.height || 4) * scaleY };
}

function nodeBounds(node, getSymbol) {
  const { w, h } = symbolSize(getSymbol, node.type, node);
  const hw = w / 2;
  const hh = h / 2;
  return {
    cx: node.x,
    cy: node.y,
    minX: node.x - hw,
    maxX: node.x + hw,
    minY: node.y - hh,
    maxY: node.y + hh,
    w,
    h,
  };
}

function boundsOfNodes(nodes, getSymbol) {
  if (!nodes.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const b = nodeBounds(n, getSymbol);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function snapAxis(center, half, targets, threshold) {
  const anchors = [
    { offset: -half },
    { offset: 0 },
    { offset: half },
  ];
  let bestDelta = 0;
  let bestDist = threshold;
  let guide = null;
  for (const anchor of anchors) {
    const value = center + anchor.offset;
    for (const t of targets) {
      const d = Math.abs(value - t);
      if (d < bestDist) {
        bestDist = d;
        bestDelta = t - value;
        guide = t;
      }
    }
  }
  return { center: center + bestDelta, guide };
}

function collectTargets(nodes, getSymbol, excludeIds, extents) {
  const targetsX = [];
  const targetsY = [];
  for (const n of nodes) {
    if (excludeIds.has(n.id)) continue;
    const b = nodeBounds(n, getSymbol);
    targetsX.push(b.minX, b.cx, b.maxX);
    targetsY.push(b.minY, b.cy, b.maxY);
  }
  if (extents) {
    targetsX.push(extents.minX, (extents.minX + extents.maxX) / 2, extents.maxX);
    targetsY.push(extents.minY, (extents.minY + extents.maxY) / 2, extents.maxY);
  }
  return { targetsX, targetsY };
}

function snapNodeCenter(node, x, y, opts) {
  const {
    nodes = [],
    getSymbol,
    excludeIds = new Set(),
    extents = null,
    gridStep = 1,
    snapGrid = true,
    snapObjects = true,
    threshold = 0.75,
  } = opts;

  const { w, h } = symbolSize(getSymbol, node.type, node);
  const hw = w / 2;
  const hh = h / 2;
  let sx = x;
  let sy = y;
  const guides = [];

  if (snapGrid && gridStep > 0) {
    sx = Math.round(sx / gridStep) * gridStep;
    sy = Math.round(sy / gridStep) * gridStep;
  }

  if (snapObjects) {
    const { targetsX, targetsY } = collectTargets(nodes, getSymbol, excludeIds, extents);
    if (targetsX.length) {
      const rx = snapAxis(sx, hw, targetsX, threshold);
      sx = rx.center;
      if (rx.guide != null) guides.push({ axis: 'x', value: rx.guide });
    }
    if (targetsY.length) {
      const ry = snapAxis(sy, hh, targetsY, threshold);
      sy = ry.center;
      if (ry.guide != null) guides.push({ axis: 'y', value: ry.guide });
    }
  }

  return { x: sx, y: sy, guides };
}

function snapPoint(x, y, opts) {
  const {
    nodes = [],
    getSymbol,
    excludeIds = new Set(),
    extents = null,
    gridStep = 1,
    snapGrid = true,
    snapObjects = true,
    threshold = 0.75,
    portPoints = [],
  } = opts;

  let sx = x;
  let sy = y;
  const guides = [];

  if (snapGrid && gridStep > 0) {
    sx = Math.round(sx / gridStep) * gridStep;
    sy = Math.round(sy / gridStep) * gridStep;
  }

  if (snapObjects) {
    const { targetsX, targetsY } = collectTargets(nodes, getSymbol, excludeIds, extents);
    if (targetsX.length) {
      const rx = snapAxis(sx, 0, targetsX, threshold);
      sx = rx.center;
      if (rx.guide != null) guides.push({ axis: 'x', value: rx.guide });
    }
    if (targetsY.length) {
      const ry = snapAxis(sy, 0, targetsY, threshold);
      sy = ry.center;
      if (ry.guide != null) guides.push({ axis: 'y', value: ry.guide });
    }
  }

  if (portPoints.length && threshold > 0) {
    let best = threshold;
    let px = sx;
    let py = sy;
    for (const p of portPoints) {
      const d = Math.hypot(sx - p.x, sy - p.y);
      if (d < best) {
        best = d;
        px = p.x;
        py = p.y;
      }
    }
    sx = px;
    sy = py;
  }

  return { x: sx, y: sy, guides };
}

function moveNodeToBounds(node, bounds, getSymbol, mode) {
  const b = nodeBounds(node, getSymbol);
  let dx = 0;
  let dy = 0;
  switch (mode) {
    case 'left':
      dx = bounds.minX - b.minX;
      break;
    case 'right':
      dx = bounds.maxX - b.maxX;
      break;
    case 'centerH':
      dx = bounds.cx - b.cx;
      break;
    case 'bottom':
      dy = bounds.minY - b.minY;
      break;
    case 'top':
      dy = bounds.maxY - b.maxY;
      break;
    case 'centerV':
      dy = bounds.cy - b.cy;
      break;
    default:
      break;
  }
  return { x: node.x + dx, y: node.y + dy };
}

function alignNodes(nodes, getSymbol, mode, referenceBounds) {
  if (!nodes.length || !referenceBounds) return nodes;
  return nodes.map((n) => {
    const pos = moveNodeToBounds(n, referenceBounds, getSymbol, mode);
    return { ...n, x: pos.x, y: pos.y };
  });
}

function distributeNodes(nodes, getSymbol, axis) {
  if (nodes.length < 3) return nodes;
  const sorted = [...nodes].sort((a, b) => {
    const ba = nodeBounds(a, getSymbol);
    const bb = nodeBounds(b, getSymbol);
    return axis === 'x' ? ba.cx - bb.cx : ba.cy - bb.cy;
  });
  const first = nodeBounds(sorted[0], getSymbol);
  const last = nodeBounds(sorted[sorted.length - 1], getSymbol);
  const span = axis === 'x' ? last.cx - first.cx : last.cy - first.cy;
  const step = span / (sorted.length - 1);
  const out = new Map();
  sorted.forEach((n, i) => {
    const b = nodeBounds(n, getSymbol);
    if (axis === 'x') {
      out.set(n.id, { x: first.cx + step * i, y: n.y });
    } else {
      out.set(n.id, { x: n.x, y: first.cy + step * i });
    }
  });
  return nodes.map((n) => {
    const pos = out.get(n.id);
    return pos ? { ...n, ...pos } : n;
  });
}

const snapApi = {
  nodeBounds,
  boundsOfNodes,
  snapNodeCenter,
  snapPoint,
  alignNodes,
  distributeNodes,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = snapApi;
}
if (typeof globalThis !== 'undefined') {
  globalThis.FacilityDrawSnap = snapApi;
}
