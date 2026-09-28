// Shared Facility Draw edge routing — orthogonal site-plan pipes between ports.
(function edgePathModuleFactory(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FacilityDrawEdgePath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function facilityDrawEdgePathFactory() {
  function parseHandle(handle) {
    const s = String(handle || '');
    const i = s.indexOf(':');
    if (i < 0) return null;
    return { nodeId: s.slice(0, i), portId: s.slice(i + 1) };
  }

  function normalizeVertices(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [+p[0], +p[1]]);
  }

  function dedupeConsecutive(pts) {
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.05) continue;
      out.push(p);
    }
    return out;
  }

  /**
   * Orthogonal (Manhattan) route between two ports — horizontal/vertical legs only.
   */
  function orthogonalPathBetween(ax, ay, adir, bx, by, bdir) {
    const pts = [[ax, ay]];
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.hypot(dx, dy) < 0.05) {
      pts.push([bx, by]);
      return dedupeConsecutive(pts);
    }

    const horizontal = new Set(['e', 'w']);
    const vertical = new Set(['n', 's']);
    const aH = horizontal.has(adir);
    const aV = vertical.has(adir);
    const bH = horizontal.has(bdir);
    const bV = vertical.has(bdir);

    if (aH && bH && Math.abs(ay - by) < 0.05) {
      pts.push([bx, by]);
      return dedupeConsecutive(pts);
    }
    if (aV && bV && Math.abs(ax - bx) < 0.05) {
      pts.push([bx, by]);
      return dedupeConsecutive(pts);
    }

    // East outlet → west inlet (house lifts into collection header): Z-route with horizontal finish.
    if (aH && bH && adir === 'e' && bdir === 'w') {
      const midX = (ax + bx) / 2;
      if (Math.abs(ay - by) > 0.05) pts.push([midX, ay], [midX, by]);
      pts.push([bx, by]);
      return dedupeConsecutive(pts);
    }
    if (aH && bH && adir === 'w' && bdir === 'e') {
      const midX = (ax + bx) / 2;
      if (Math.abs(ay - by) > 0.05) pts.push([midX, ay], [midX, by]);
      pts.push([bx, by]);
      return dedupeConsecutive(pts);
    }

    if (aH && bV) {
      pts.push([bx, ay], [bx, by]);
      return dedupeConsecutive(pts);
    }
    if (aV && bH) {
      pts.push([ax, by], [bx, by]);
      return dedupeConsecutive(pts);
    }

    let verticalFirst;
    if (aV && !aH) verticalFirst = true;
    else if (aH && !aV) verticalFirst = false;
    else if (bV && !bH) verticalFirst = true;
    else if (bH && !bV) verticalFirst = false;
    else verticalFirst = Math.abs(dy) > Math.abs(dx);

    if (verticalFirst) {
      if (Math.abs(dy) > 0.05) pts.push([ax, by]);
      if (Math.abs(dx) > 0.05) pts.push([bx, by]);
    } else {
      if (Math.abs(dx) > 0.05) pts.push([bx, ay]);
      if (Math.abs(dy) > 0.05) pts.push([bx, by]);
    }
    return dedupeConsecutive(pts);
  }

  /**
   * @param {object} edge
   * @param {object[]} nodes
   * @param {(node: object, portId: string) => object|null} resolvePort
   */
  function buildEdgePathPoints(edge, nodes, resolvePort) {
    const fromParts = parseHandle(edge.from);
    const toParts = parseHandle(edge.to);
    if (!fromParts || !toParts) return [];
    const nodeA = nodes.find((n) => n.id === fromParts.nodeId);
    const nodeB = nodes.find((n) => n.id === toParts.nodeId);
    if (!nodeA || !nodeB) return [];
    const a = resolvePort(nodeA, fromParts.portId);
    const b = resolvePort(nodeB, toParts.portId);
    if (!a || !b) return [];

    const verts = normalizeVertices(edge.points);
    if (verts.length) {
      return dedupeConsecutive([[a.x, a.y], ...verts, [b.x, b.y]]);
    }
    return orthogonalPathBetween(a.x, a.y, a.dir, b.x, b.y, b.dir);
  }

  const LINE_KINDS = ['src', 'return', 'electric'];

  const ELECTRIC_PORT_IDS = new Set(['electrical', 'power', 'control']);

  const EDGE_COLORS = {
    src: '#38bdf8',
    return: '#ef4444',
    electric: '#eab308',
    selected: '#fbbf24',
  };

  const EDGE_EXPORT_COLORS = {
    src: '#2563eb',
    return: '#dc2626',
    electric: '#ca8a04',
  };

  function normalizeEdgeKind(kind) {
    const k = String(kind || 'src').toLowerCase();
    if (k === 'pipe' || k === 'plumbing') return 'src';
    if (LINE_KINDS.includes(k)) return k;
    return 'src';
  }

  function isElectricPort(portId) {
    const id = String(portId || '').toLowerCase();
    if (ELECTRIC_PORT_IDS.has(id)) return true;
    return /^c\d+$/.test(id);
  }

  function isElectricHandle(handle) {
    const parts = parseHandle(handle);
    return parts ? isElectricPort(parts.portId) : false;
  }

  function edgeStrokeColor(edge, selected = false) {
    if (selected) return EDGE_COLORS.selected;
    const kind = normalizeEdgeKind(edge?.kind);
    return EDGE_COLORS[kind] || EDGE_COLORS.src;
  }

  function edgeExportColor(edge) {
    const kind = normalizeEdgeKind(edge?.kind);
    return EDGE_EXPORT_COLORS[kind] || EDGE_EXPORT_COLORS.src;
  }

  function edgeDxfLayer(edge) {
    const kind = normalizeEdgeKind(edge?.kind);
    if (kind === 'return') return 'RETURN';
    if (kind === 'electric') return 'ELECTRIC';
    return 'SRC';
  }

  return {
    parseHandle,
    normalizeVertices,
    dedupeConsecutive,
    orthogonalPathBetween,
    buildEdgePathPoints,
    LINE_KINDS,
    ELECTRIC_PORT_IDS,
    EDGE_COLORS,
    EDGE_EXPORT_COLORS,
    normalizeEdgeKind,
    isElectricPort,
    isElectricHandle,
    edgeStrokeColor,
    edgeExportColor,
    edgeDxfLayer,
  };
});
