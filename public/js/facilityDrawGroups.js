'use strict';

window.FacilityDrawGroups = (function () {
  function normalizeGroup(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const nodeIds = Array.isArray(raw.nodeIds)
      ? [...new Set(raw.nodeIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    if (nodeIds.length < 2) return null;
    return {
      id: String(raw.id || `group_${index + 1}`).trim(),
      name: String(raw.name || `Group ${index + 1}`).slice(0, 80),
      nodeIds,
    };
  }

  function groupContaining(groups, nodeId) {
    const id = String(nodeId || '').trim();
    if (!id) return null;
    return (groups || []).find((g) => g.nodeIds.includes(id)) || null;
  }

  function membersOfNode(groups, nodeId) {
    const g = groupContaining(groups, nodeId);
    return g ? [...g.nodeIds] : [String(nodeId)];
  }

  function expandNodeIdsWithGroups(groups, ids) {
    const out = new Set();
    for (const id of ids || []) {
      for (const mid of membersOfNode(groups, id)) out.add(mid);
    }
    return [...out];
  }

  function removeNodesFromGroups(groups, nodeIds) {
    const drop = new Set(nodeIds || []);
    return (groups || [])
      .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !drop.has(id)) }))
      .filter((g) => g.nodeIds.length >= 2);
  }

  function createGroup(groups, nodeIds, id, name) {
    const ids = [...new Set((nodeIds || []).map(String).filter(Boolean))];
    if (ids.length < 2) return groups || [];
    const next = removeNodesFromGroups(groups || [], ids);
    next.push({
      id: String(id || `group_${next.length + 1}`),
      name: String(name || `Group ${next.length + 1}`).slice(0, 80),
      nodeIds: ids,
    });
    return next;
  }

  function ungroupNodes(groups, nodeIds) {
    const touched = new Set(expandNodeIdsWithGroups(groups, nodeIds));
    return (groups || []).filter((g) => !g.nodeIds.some((id) => touched.has(id)));
  }

  function rectsIntersect(a, b) {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  }

  function nodeBounds(node, getSymbol) {
    const s = getSymbol(node?.type);
    const sx = Number(node?.scaleX);
    const sy = Number(node?.scaleY);
    const scaleX = Number.isFinite(sx) && sx > 0 ? sx : 1;
    const scaleY = Number.isFinite(sy) && sy > 0 ? sy : 1;
    const hw = ((s?.width || 4) * scaleX) / 2;
    const hh = ((s?.height || 4) * scaleY) / 2;
    const x = Number(node?.x) || 0;
    const y = Number(node?.y) || 0;
    return { minX: x - hw, maxX: x + hw, minY: y - hh, maxY: y + hh, cx: x, cy: y };
  }

  function nodesInWorldRect(nodes, rect, getSymbol, mode) {
    if (!rect || !nodes?.length) return [];
    const r = {
      minX: Math.min(rect.minX, rect.maxX),
      maxX: Math.max(rect.minX, rect.maxX),
      minY: Math.min(rect.minY, rect.maxY),
      maxY: Math.max(rect.minY, rect.maxY),
    };
    return nodes.filter((n) => {
      const b = nodeBounds(n, getSymbol);
      if (mode === 'center') {
        return b.cx >= r.minX && b.cx <= r.maxX && b.cy >= r.minY && b.cy <= r.maxY;
      }
      return rectsIntersect(r, b);
    });
  }

  function groupBounds(nodeIds, nodes, getSymbol) {
    const set = new Set(nodeIds || []);
    const list = (nodes || []).filter((n) => set.has(n.id));
    if (!list.length) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of list) {
      const b = nodeBounds(n, getSymbol);
      minX = Math.min(minX, b.minX);
      maxX = Math.max(maxX, b.maxX);
      minY = Math.min(minY, b.minY);
      maxY = Math.max(maxY, b.maxY);
    }
    return { minX, maxX, minY, maxY };
  }

  return {
    groupContaining,
    membersOfNode,
    expandNodeIdsWithGroups,
    removeNodesFromGroups,
    createGroup,
    ungroupNodes,
    nodesInWorldRect,
    groupBounds,
    nodeBounds,
  };
})();
