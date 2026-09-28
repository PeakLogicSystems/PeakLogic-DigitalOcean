'use strict';

(function () {
  const API = '/api/mv-draw';
  const EXPORT_ORIENTATION_KEY = 'mvDrawExportOrientation';
  const DEFAULT_PPU = 8;
  const MAX_UNDO = 50;

  const state = {
    project: null,
    symbols: [],
    symbolByType: new Map(),
    tool: 'select',
    placeType: null,
    selectedId: null,
    selectedIds: [],
    selectedEdgeId: null,
    selectedEdgeVertex: null,
    connectFrom: null,
    connectVerts: [],
    connectLineKind: 'src',
    pointerWorld: null,
    pan: { x: 40, y: 40 },
    zoom: 1,
    dragging: null,
    dragUndoPushed: false,
    suppressClick: false,
    calibrate: null,
    extentsDraft: null,
    bgImage: null,
    dirty: false,
    snapEnabled: true,
    snapGrid: true,
    snapObjects: true,
    snapGridStep: 5,
    snapGuides: [],
    activeFile: null,
    localFilePath: null,
    storage: null,
    fileMenuOpen: false,
    peaklogicContext: null,
    estProjectPath: null,
    exportOrientation: 'landscape',
    marquee: null,
    edgeDrag: null,
    edgeDragUndoPushed: false,
    panDrag: null,
    spacePan: false,
    rotating: null,
    rotateUndoPushed: false,
    stretching: null,
    stretchUndoPushed: false,
    librarySearch: '',
    openListProjects: [],
    openListSort: { key: 'date', dir: 'desc' },
  };

  const hmiImageCache = new Map();

  const ROTATE_SNAP_DEG = 15;
  const ROTATE_HANDLE_OFFSET_FT = 1.2;
  const MIN_NODE_SCALE = 0.2;
  const MAX_NODE_SCALE = 8;
  const STRETCH_HANDLES = [
    { id: 'e', lx: 1, ly: 0 },
    { id: 'w', lx: -1, ly: 0 },
    { id: 'n', lx: 0, ly: 1 },
    { id: 's', lx: 0, ly: -1 },
    { id: 'ne', lx: 1, ly: 1 },
    { id: 'nw', lx: -1, ly: 1 },
    { id: 'se', lx: 1, ly: -1 },
    { id: 'sw', lx: -1, ly: -1 },
  ];

  const snapApi = typeof MvDrawSnap !== 'undefined' ? MvDrawSnap : null;
  const groupApi = typeof MvDrawGroups !== 'undefined' ? MvDrawGroups : null;
  const sheetApi = typeof MvDrawSheetSizes !== 'undefined' ? MvDrawSheetSizes : null;
  const labelWrapApi = typeof MvDrawLabelWrap !== 'undefined' ? MvDrawLabelWrap : null;

  const LABEL_MAX_LEN = 8;

  function wrapLabel(text, maxLen = LABEL_MAX_LEN) {
    if (labelWrapApi?.wrapLabel) return labelWrapApi.wrapLabel(text, maxLen);
    const raw = String(text || '').trim();
    const limit = Math.max(4, +maxLen || LABEL_MAX_LEN);
    if (!raw) return [''];
    if (raw.length <= limit) return [raw];
    const words = raw.split(/\s+/);
    const out = [];
    let current = '';
    const flush = () => {
      if (current) {
        out.push(current);
        current = '';
      }
    };
    for (const word of words) {
      if (word.length > limit) {
        flush();
        for (let i = 0; i < word.length; i += limit) out.push(word.slice(i, i + limit));
        continue;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length <= limit) current = next;
      else {
        flush();
        current = word;
      }
    }
    flush();
    return out.length ? out : [raw];
  }

  function drawTextWrapped(text, x, y, opts = {}) {
    const fontSize = opts.fontSize ?? Math.max(10, 11 * state.zoom);
    const lines = wrapLabel(text, opts.maxLen ?? LABEL_MAX_LEN);
    const lh = fontSize * 1.15;
    const weight = opts.fontWeight ? `${opts.fontWeight} ` : '';
    ctx.font = `${weight}${fontSize}px Segoe UI, sans-serif`;
    ctx.fillStyle = opts.fillStyle ?? ctx.fillStyle;
    ctx.textAlign = opts.align || 'center';
    const baseline = opts.baseline || 'top';
    ctx.textBaseline = baseline === 'middle' ? 'middle' : 'top';
    const startY = baseline === 'middle' ? y - ((lines.length - 1) * lh) / 2 : y;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lh);
    }
  }

  /** Text drawn inside symbol local coords (after scale sy = -1). */
  function drawSymbolText(text, x, y) {
    ctx.save();
    ctx.scale(1, -1);
    ctx.fillText(String(text), x, -y);
    ctx.restore();
  }

  function drawSymbolTextWrapped(text, x, y, opts = {}) {
    ctx.save();
    ctx.scale(1, -1);
    drawTextWrapped(text, x, -y, opts);
    ctx.restore();
  }

  function nodeCaption(node, s) {
    const custom = String(node.label ?? '').trim();
    if (custom) return custom;
    return String(s?.label || node.type || '').trim();
  }

  function shapeHasBuiltinCaption(s) {
    const builtIn = new Set([
      'treatment_tank',
      'integrated_mle_tank',
      'trash_tank_2comp',
      'dosing_tank',
      'simplex_lift',
      'duplex_lift',
      'atu_control_panel',
      'power_panel',
      'drip_field',
      'drip_irrigation_4leg',
    ]);
    return builtIn.has(s?.shape);
  }

  const undoStack = [];
  const redoStack = [];

  const canvas = document.getElementById('mv-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const statusEl = document.getElementById('mv-status');
  const scaleLabel = document.getElementById('mv-scale-label');
  const extentsLabel = document.getElementById('mv-extents-label');
  const cursorLabel = document.getElementById('mv-cursor-label');

  function ppu() {
    return state.project?.scale?.pixelsPerUnit || DEFAULT_PPU;
  }

  function worldToScreen(x, y) {
    const s = ppu() * state.zoom;
    return {
      x: state.pan.x + x * s,
      y: state.pan.y - y * s,
    };
  }

  function screenToWorld(sx, sy) {
    const s = ppu() * state.zoom;
    return {
      x: (sx - state.pan.x) / s,
      y: (state.pan.y - sy) / s,
    };
  }

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = isErr ? 'muted cell-mono err-text' : 'muted cell-mono';
  }

  async function api(method, path, body) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function downloadExport(path, project, options = {}) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, options }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText);
    }
    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(dispo);
    const name = match ? match[1] : 'export';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function syncExportOrientationFromUi() {
    const sel = document.getElementById('mv-export-orientation');
    if (sel) {
      state.exportOrientation = sel.value === 'portrait' ? 'portrait' : 'landscape';
    }
    return state.exportOrientation || 'landscape';
  }

  function exportOrientationOptions() {
    return { orientation: syncExportOrientationFromUi() };
  }

  function restoreExportOrientation() {
    const sel = document.getElementById('mv-export-orientation');
    if (!sel) return;
    try {
      const saved = localStorage.getItem(EXPORT_ORIENTATION_KEY);
      if (saved === 'portrait' || saved === 'landscape') {
        sel.value = saved;
        state.exportOrientation = saved;
      }
    } catch {
      /* ignore */
    }
    state.exportOrientation = sel.value === 'portrait' ? 'portrait' : 'landscape';
    sel.addEventListener('change', () => {
      state.exportOrientation = sel.value === 'portrait' ? 'portrait' : 'landscape';
      try {
        localStorage.setItem(EXPORT_ORIENTATION_KEY, state.exportOrientation);
      } catch {
        /* ignore */
      }
    });
  }

  function sym(type) {
    return state.symbolByType.get(type) || null;
  }

  function preloadHmiSymbolImages(symbols) {
    for (const s of symbols || []) {
      if (s?.shape !== 'hmi_image' || !s.hmiSvg || hmiImageCache.has(s.hmiSvg)) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      hmiImageCache.set(s.hmiSvg, { img: null, ok: false, loading: true });
      img.onload = () => {
        hmiImageCache.set(s.hmiSvg, { img, ok: true, loading: false });
        draw();
      };
      img.onerror = () => {
        hmiImageCache.set(s.hmiSvg, { img: null, ok: false, loading: false });
      };
      img.src = s.hmiSvg;
    }
  }

  function ensureGroups() {
    if (!state.project) return [];
    if (!Array.isArray(state.project.groups)) state.project.groups = [];
    return state.project.groups;
  }

  function expandWithGroups(ids) {
    if (!groupApi) return [...new Set(ids || [])];
    return groupApi.expandNodeIdsWithGroups(ensureGroups(), ids);
  }

  function toggleSelectionIds(ids, primaryId) {
    const addIds = expandWithGroups(ids);
    const cur = new Set(state.selectedIds.length ? state.selectedIds : (state.selectedId ? [state.selectedId] : []));
    const allIn = addIds.every((id) => cur.has(id));
    if (allIn) addIds.forEach((id) => cur.delete(id));
    else addIds.forEach((id) => cur.add(id));
    const next = [...cur];
    setSelection(next, primaryId || next[next.length - 1] || null);
    setStatus(next.length > 1 ? `${next.length} selected` : next.length ? 'Selected' : 'Selection cleared');
  }

  function groupSelection() {
    const selected = getSelectedNodes();
    if (selected.length < 2) {
      setStatus('Select 2 or more symbols to group', true);
      return;
    }
    if (!groupApi) return;
    pushUndo();
    const ids = selected.map((n) => n.id);
    const groups = ensureGroups();
    state.project.groups = groupApi.createGroup(
      groups,
      ids,
      nextId('group', groups),
      `Group ${groups.length + 1}`,
    );
    setSelection(expandWithGroups(ids), ids[0]);
    markDirty();
    setStatus(`Grouped ${ids.length} symbols`);
  }

  function ungroupSelection() {
    const ids = state.selectedIds.length
      ? state.selectedIds
      : (state.selectedId ? [state.selectedId] : []);
    if (!ids.length || !groupApi) return;
    const expanded = expandWithGroups(ids);
    const groups = ensureGroups();
    const touched = groups.filter((g) => g.nodeIds.some((id) => expanded.includes(id)));
    if (!touched.length) {
      setStatus('Selection is not in a group', true);
      return;
    }
    pushUndo();
    state.project.groups = groupApi.ungroupNodes(groups, ids);
    setSelection(expanded, expanded[expanded.length - 1]);
    markDirty();
    setStatus(`Ungrouped ${touched.length} group${touched.length === 1 ? '' : 's'}`);
  }

  function pruneGroupsAfterNodeDelete(nodeIds) {
    if (!groupApi || !nodeIds?.length) return;
    state.project.groups = groupApi.removeNodesFromGroups(ensureGroups(), nodeIds);
  }

  function getSelectedNodes() {
    const ids = state.selectedIds.length
      ? state.selectedIds
      : (state.selectedId ? [state.selectedId] : []);
    const set = new Set(ids);
    return (state.project?.nodes || []).filter((n) => set.has(n.id));
  }

  function setSelection(ids, primaryId) {
    state.selectedIds = [...new Set(ids)];
    state.selectedId = primaryId || state.selectedIds[state.selectedIds.length - 1] || null;
    state.selectedEdgeId = null;
    state.selectedEdgeVertex = null;
    fillInspector();
    updateAlignButtons();
    updateGroupButtons();
    updateDeleteButton();
    markDirty();
  }

  function setEdgeSelection(edgeId, vertexIndex = null) {
    state.selectedEdgeId = edgeId || null;
    state.selectedEdgeVertex = edgeId != null ? vertexIndex : null;
    state.selectedId = null;
    state.selectedIds = [];
    fillInspector();
    updateAlignButtons();
    updateGroupButtons();
    updateDeleteButton();
    markDirty();
  }

  function isNodeSelected(nodeId) {
    if (!nodeId) return false;
    if (state.selectedIds.length) return state.selectedIds.includes(nodeId);
    return state.selectedId === nodeId;
  }

  function isSnapActive(opts = {}) {
    if (opts.altKey) return false;
    return state.snapEnabled;
  }

  function snapThreshold() {
    return Math.max(0.75 / Math.max(0.35, state.zoom), 12 / (ppu() * state.zoom));
  }

  function snapToGridPoint(x, y, opts = {}) {
    if (!isSnapActive(opts) || !state.snapGrid) return { x, y, guides: [] };
    const step = state.snapGridStep;
    if (!Number.isFinite(step) || step <= 0) return { x, y, guides: [] };
    const sx = Math.round(x / step) * step;
    const sy = Math.round(y / step) * step;
    const guides = [];
    if (Math.abs(sx - x) > 1e-6) guides.push({ axis: 'x', value: sx });
    if (Math.abs(sy - y) > 1e-6) guides.push({ axis: 'y', value: sy });
    return { x: sx, y: sy, guides };
  }

  function snapToPorts(x, y, threshold) {
    const pts = allPortPoints();
    if (!pts.length || threshold <= 0) return { x, y };
    let best = threshold;
    let px = x;
    let py = y;
    for (const p of pts) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < best) {
        best = d;
        px = p.x;
        py = p.y;
      }
    }
    return { x: px, y: py };
  }

  function applySnap(node, x, y, excludeIds, opts = {}) {
    if (!isSnapActive(opts)) return { x, y, guides: [] };
    if (snapApi) {
      return snapApi.snapNodeCenter(node, x, y, {
        nodes: state.project?.nodes || [],
        getSymbol: sym,
        excludeIds,
        extents: state.project?.extents || null,
        gridStep: state.snapGridStep,
        snapGrid: state.snapGrid,
        snapObjects: state.snapObjects,
        threshold: snapThreshold(),
      });
    }
    return snapToGridPoint(x, y);
  }

  function allPortPoints() {
    const pts = [];
    for (const n of state.project?.nodes || []) {
      for (const p of sym(n.type)?.ports || []) {
        const pt = portWorld(n, p.id);
        if (pt) pts.push({ x: pt.x, y: pt.y });
      }
    }
    return pts;
  }

  function applySnapPoint(x, y, excludeIds, snapPorts = false, opts = {}) {
    if (!isSnapActive(opts)) return { x, y, guides: [] };
    if (snapApi?.snapPoint) {
      return snapApi.snapPoint(x, y, {
        nodes: state.project?.nodes || [],
        getSymbol: sym,
        excludeIds,
        extents: state.project?.extents || null,
        gridStep: state.snapGridStep,
        snapGrid: state.snapGrid,
        snapObjects: state.snapObjects,
        threshold: snapThreshold(),
        portPoints: snapPorts ? allPortPoints() : [],
      });
    }
    let r = snapToGridPoint(x, y, opts);
    if (snapPorts) {
      const p = snapToPorts(r.x, r.y, snapThreshold());
      r = { x: p.x, y: p.y, guides: r.guides };
    }
    if (snapApi && state.snapObjects) {
      const obj = snapApi.snapNodeCenter(
        { type: 'd_box', x: r.x, y: r.y },
        r.x,
        r.y,
        {
          nodes: state.project?.nodes || [],
          getSymbol: sym,
          excludeIds,
          extents: state.project?.extents || null,
          gridStep: state.snapGridStep,
          snapGrid: false,
          snapObjects: true,
          threshold: snapThreshold(),
        },
      );
      return { x: obj.x, y: obj.y, guides: [...r.guides, ...(obj.guides || [])] };
    }
    return r;
  }

  function distPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) {
      return { dist: Math.hypot(px - x1, py - y1), x: x1, y: y1 };
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const x = x1 + t * dx;
    const y = y1 + t * dy;
    return { dist: Math.hypot(px - x, py - y), x, y };
  }

  function nearestSegmentOnPath(pathPoints, wx, wy) {
    if (!pathPoints || pathPoints.length < 2) return null;
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

  function edgeHitTolerance() {
    return Math.max(1.4 / Math.max(0.35, state.zoom), 14 / (ppu() * state.zoom));
  }

  function edgeVertexHitTolerance() {
    return Math.max(1.0 / Math.max(0.35, state.zoom), 12 / (ppu() * state.zoom));
  }

  function hitTestEdgeHandles(wx, wy) {
    const edgeId = state.selectedEdgeId;
    if (!edgeId || state.tool !== 'select') return null;
    const edge = (state.project?.edges || []).find((e) => e.id === edgeId);
    if (!edge) return null;
    const tol = edgeVertexHitTolerance();
    const verts = ensureEdgePoints(edge);
    for (let i = 0; i < verts.length; i++) {
      const [vx, vy] = verts[i];
      if (Math.hypot(vx - wx, vy - wy) <= tol) {
        return { edgeId: edge.id, vertexIndex: i, kind: 'vertex' };
      }
    }
    const pts = edgePoints(edge);
    for (let i = 0; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      if (Math.hypot(mx - wx, my - wy) <= tol) {
        return { edgeId: edge.id, segmentIndex: i, kind: 'midpoint', x: mx, y: my };
      }
    }
    return null;
  }

  function hitTestEdgeVertex(wx, wy, edgeId = state.selectedEdgeId) {
    const hit = hitTestEdgeHandles(wx, wy);
    if (!hit || hit.kind !== 'vertex') return null;
    if (edgeId && hit.edgeId !== edgeId) return null;
    return { edgeId: hit.edgeId, vertexIndex: hit.vertexIndex };
  }

  function hitTestEdge(wx, wy) {
    const tol = edgeHitTolerance();
    const edges = state.project?.edges || [];
    for (let i = edges.length - 1; i >= 0; i--) {
      const edge = edges[i];
      const pts = edgePoints(edge);
      for (let j = 0; j < pts.length - 1; j++) {
        const [x1, y1] = pts[j];
        const [x2, y2] = pts[j + 1];
        const r = distPointToSegment(wx, wy, x1, y1, x2, y2);
        if (r.dist <= tol) return edge;
      }
    }
    return null;
  }

  function ensureEdgePoints(edge) {
    if (!Array.isArray(edge.points)) edge.points = [];
    return edge.points;
  }

  function toggleSnap(force) {
    state.snapEnabled = typeof force === 'boolean' ? force : !state.snapEnabled;
    const cb = document.getElementById('mv-snap-enabled');
    if (cb) cb.checked = state.snapEnabled;
    updateSnapLabel();
    setStatus(state.snapEnabled ? 'Snap on' : 'Snap off');
  }

  function updateSnapLabel() {
    const el = document.getElementById('mv-snap-label');
    if (!el) return;
    if (state.snapGuides?.length) {
      el.textContent = 'Snap guides active';
    } else if (state.snapEnabled) {
      el.textContent = `Snap: ${state.snapGridStep} ft grid + align (S off · Alt hold)`;
    } else {
      el.textContent = 'Snap: off';
    }
  }

  function updateGroupButtons() {
    const count = getSelectedNodes().length;
    const groups = ensureGroups();
    const ids = state.selectedIds.length
      ? state.selectedIds
      : (state.selectedId ? [state.selectedId] : []);
    const inGroup = groupApi && ids.length
      ? groups.some((g) => g.nodeIds.some((id) => ids.includes(id)))
      : false;
    const groupBtn = document.getElementById('mv-btn-group');
    const ungroupBtn = document.getElementById('mv-btn-ungroup');
    if (groupBtn) groupBtn.disabled = count < 2;
    if (ungroupBtn) ungroupBtn.disabled = !inGroup;
  }

  function updateAlignButtons() {
    const count = getSelectedNodes().length;
    const hasExtents = !!state.project?.extents;
    document.querySelectorAll('.mv-align-btn').forEach((btn) => {
      const mode = btn.dataset.align;
      if (mode?.startsWith('distribute')) btn.disabled = count < 3;
      else btn.disabled = count < 1;
    });
    const extBtn = document.getElementById('mv-align-extents');
    if (extBtn) extBtn.disabled = count < 1 || !hasExtents;
  }

  function alignSelected(mode) {
    if (!snapApi) return;
    const selected = getSelectedNodes();
    if (!selected.length) return;
    const reference = snapApi.boundsOfNodes(selected, sym);
    if (!reference) return;
    pushUndo();
    let updated;
    if (mode === 'distributeH') {
      updated = snapApi.distributeNodes(selected, sym, 'x');
    } else if (mode === 'distributeV') {
      updated = snapApi.distributeNodes(selected, sym, 'y');
    } else {
      updated = snapApi.alignNodes(selected, sym, mode, reference);
    }
    const byId = new Map(updated.map((n) => [n.id, n]));
    state.project.nodes = state.project.nodes.map((n) => {
      const next = byId.get(n.id);
      return next ? { ...n, x: next.x, y: next.y } : n;
    });
    fillInspector();
    markDirty();
    setStatus(`Aligned: ${mode}`);
  }

  function alignSelectionToExtents() {
    if (!snapApi) return;
    const selected = getSelectedNodes();
    const ext = state.project?.extents;
    if (!selected.length || !ext) return;
    pushUndo();
    const ref = {
      minX: ext.minX,
      maxX: ext.maxX,
      minY: ext.minY,
      maxY: ext.maxY,
      cx: (ext.minX + ext.maxX) / 2,
      cy: (ext.minY + ext.maxY) / 2,
    };
    let updated = snapApi.alignNodes(selected, sym, 'centerH', ref);
    updated = snapApi.alignNodes(updated, sym, 'centerV', ref);
    const byId = new Map(updated.map((n) => [n.id, n]));
    state.project.nodes = state.project.nodes.map((n) => {
      const next = byId.get(n.id);
      return next ? { ...n, x: next.x, y: next.y } : n;
    });
    fillInspector();
    markDirty();
    setStatus('Centered on site extents');
  }

  function portHitTolerance() {
    return Math.max(1.2 / Math.max(0.35, state.zoom), 14 / (ppu() * state.zoom));
  }

  function nodeScale(node) {
    const sx = Number(node?.scaleX);
    const sy = Number(node?.scaleY);
    return {
      scaleX: Number.isFinite(sx) && sx > 0 ? sx : 1,
      scaleY: Number.isFinite(sy) && sy > 0 ? sy : 1,
    };
  }

  function nodeSymbolSize(node, s) {
    const symDef = s || sym(node?.type);
    const { scaleX, scaleY } = nodeScale(node);
    const baseW = symDef?.width || 4;
    const baseH = symDef?.height || 4;
    return { w: baseW * scaleX, h: baseH * scaleY, baseW, baseH, scaleX, scaleY };
  }

  function clampNodeScale(v) {
    return Math.min(MAX_NODE_SCALE, Math.max(MIN_NODE_SCALE, v));
  }

  function worldToNodeLocal(node, wx, wy) {
    const dx = wx - node.x;
    const dy = wy - node.y;
    const rad = ((node.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      lx: dx * cos + dy * sin,
      ly: -dx * sin + dy * cos,
    };
  }

  function localToWorld(node, lx, ly) {
    const rad = ((node.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: node.x + lx * cos - ly * sin,
      y: node.y + lx * sin + ly * cos,
    };
  }

  function stretchHandleWorld(node, handleId) {
    const s = sym(node.type);
    const { w, h } = nodeSymbolSize(node, s);
    const def = STRETCH_HANDLES.find((item) => item.id === handleId);
    if (!def) return null;
    return localToWorld(node, def.lx * w / 2, def.ly * h / 2);
  }

  function portWorld(node, portId) {
    const s = sym(node.type);
    if (!s) return null;
    const port = (s.ports || []).find((p) => p.id === portId);
    if (!port) return null;
    let pos = null;
    if (typeof MvDrawPorts !== 'undefined') {
      pos = MvDrawPorts.portWorldPosition(node, s, port);
    }
    if (!pos) {
      const { scaleX, scaleY } = nodeScale(node);
      const rad = ((node.rotation || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = (port.x - s.width / 2) * scaleX;
      const ly = (port.y - s.height / 2) * scaleY;
      pos = {
        x: node.x + lx * cos - ly * sin,
        y: node.y + lx * sin + ly * cos,
        dir: port.dir || null,
      };
    }
    return { ...pos, handle: `${node.id}:${portId}` };
  }

  function hitTestNode(wx, wy) {
    const nodes = state.project?.nodes || [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const { w, h } = nodeSymbolSize(n, sym(n.type));
      const hw = w / 2;
      const hh = h / 2;
      if (wx >= n.x - hw && wx <= n.x + hw && wy >= n.y - hh && wy <= n.y + hh) return n;
    }
    return null;
  }

  function normalizeRotation(deg) {
    let r = (+deg || 0) % 360;
    if (r > 180) r -= 360;
    if (r <= -180) r += 360;
    return r;
  }

  function snapRotationDelta(deg) {
    return Math.round(deg / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
  }

  function rotationHandleWorld(node, s) {
    const h = nodeSymbolSize(node, s).h;
    const offset = Math.max(0.8, h * 0.25 + ROTATE_HANDLE_OFFSET_FT);
    const rad = ((node.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ly = h / 2 + offset;
    return {
      x: node.x - ly * sin,
      y: node.y + ly * cos,
    };
  }

  function selectedNodeIdsForTool() {
    return state.selectedIds.length
      ? [...state.selectedIds]
      : (state.selectedId ? [state.selectedId] : []);
  }

  function hitTestRotationHandle(wx, wy) {
    if (state.tool !== 'rotate') return null;
    const tol = portHitTolerance();
    for (const id of selectedNodeIdsForTool()) {
      const n = state.project?.nodes?.find((x) => x.id === id);
      if (!n) continue;
      const hp = rotationHandleWorld(n, sym(n.type));
      if (Math.hypot(hp.x - wx, hp.y - wy) <= tol) return n;
    }
    return null;
  }

  function drawRotationHandles() {
    if (state.tool !== 'rotate') return;
    const ids = selectedNodeIdsForTool();
    if (!ids.length) return;
    for (const id of ids) {
      const node = state.project.nodes.find((n) => n.id === id);
      if (!node) continue;
      const hp = rotationHandleWorld(node, sym(node.type));
      const sc = worldToScreen(hp.x, hp.y);
      const center = worldToScreen(node.x, node.y);
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(sc.x, sc.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.fillStyle = state.rotating?.pivotId === id ? '#fde68a' : '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.arc(sc.x, sc.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = '#38bdf8';
      ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function beginRotateDrag(node, w, ev) {
    const groupIds = expandWithGroups([node.id]);
    if (!ev.shiftKey && !state.selectedIds.includes(node.id)) setSelection(groupIds, node.id);
    else if (ev.shiftKey) toggleSelectionIds([node.id], node.id);
    const movingIds = expandWithGroups([...state.selectedIds]);
    if (!movingIds.includes(node.id)) return;
    const startAngles = new Map();
    for (const id of movingIds) {
      const n = state.project.nodes.find((x) => x.id === id);
      if (n) startAngles.set(id, n.rotation || 0);
    }
    pushUndo();
    state.rotateUndoPushed = true;
    state.rotating = {
      pivotId: node.id,
      movingIds,
      startAngles,
      startMouseAngle: Math.atan2(w.y - node.y, w.x - node.x) * 180 / Math.PI,
    };
    state.selectedId = node.id;
    fillInspector();
    state.suppressClick = true;
    updateCanvasCursor();
  }

  function applyRotateDrag(w, shiftKey) {
    const rot = state.rotating;
    if (!rot) return;
    const anchor = state.project.nodes.find((n) => n.id === rot.pivotId);
    if (!anchor) return;
    let delta = Math.atan2(w.y - anchor.y, w.x - anchor.x) * 180 / Math.PI - rot.startMouseAngle;
    if (shiftKey) delta = snapRotationDelta(delta);
    for (const id of rot.movingIds) {
      const n = state.project.nodes.find((x) => x.id === id);
      const start = rot.startAngles?.get(id);
      if (n && start != null) n.rotation = normalizeRotation(start + delta);
    }
    fillInspector();
    markDirty();
  }

  function endRotateDrag() {
    if (!state.rotating || !state.rotateUndoPushed) {
      state.rotating = null;
      state.rotateUndoPushed = false;
      return;
    }
    let moved = false;
    for (const id of state.rotating.movingIds) {
      const n = state.project.nodes.find((x) => x.id === id);
      const start = state.rotating.startAngles?.get(id);
      if (n && start != null && normalizeRotation(n.rotation || 0) !== normalizeRotation(start)) moved = true;
    }
    if (!moved) {
      undoStack.pop();
      updateUndoButtons();
    } else {
      state.suppressClick = true;
    }
    state.rotating = null;
    state.rotateUndoPushed = false;
    updateCanvasCursor();
    markDirty();
  }

  function stretchTargetNode() {
    const id = state.selectedId || state.selectedIds[state.selectedIds.length - 1];
    if (!id) return null;
    return state.project?.nodes?.find((n) => n.id === id) || null;
  }

  function hitTestStretchHandle(wx, wy) {
    if (state.tool !== 'stretch') return null;
    const node = stretchTargetNode();
    if (!node) return null;
    const tol = portHitTolerance();
    for (const handle of STRETCH_HANDLES) {
      const hp = stretchHandleWorld(node, handle.id);
      if (!hp) continue;
      if (Math.hypot(hp.x - wx, hp.y - wy) <= tol) return { node, handle: handle.id };
    }
    return null;
  }

  function drawStretchHandles() {
    if (state.tool !== 'stretch') return;
    const node = stretchTargetNode();
    if (!node) return;
    const corners = STRETCH_HANDLES.map((handle) => ({
      id: handle.id,
      world: stretchHandleWorld(node, handle.id),
    })).filter((item) => item.world);
    if (!corners.length) return;

    ctx.save();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    const c = worldToScreen(node.x, node.y);
    for (const handle of STRETCH_HANDLES) {
      if (handle.lx === 0 || handle.ly === 0) continue;
      const edge = stretchHandleWorld(node, handle.id);
      if (!edge) continue;
      const sc = worldToScreen(edge.x, edge.y);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(sc.x, sc.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const item of corners) {
      const sc = worldToScreen(item.world.x, item.world.y);
      const active = state.stretching?.handle === item.id;
      ctx.beginPath();
      ctx.fillStyle = active ? '#a5f3fc' : '#22d3ee';
      ctx.strokeStyle = '#0e7490';
      ctx.lineWidth = 1.5;
      const r = item.id.length === 1 ? 6 : 5;
      ctx.rect(sc.x - r, sc.y - r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function applyStretchFromPointer(node, handleId, lx, ly, shiftKey, startScales) {
    const { baseW, baseH } = nodeSymbolSize(node, sym(node.type));
    let scaleX = startScales.scaleX;
    let scaleY = startScales.scaleY;
    const affectsX = handleId.includes('e') || handleId.includes('w');
    const affectsY = handleId.includes('n') || handleId.includes('s');

    if (affectsX) {
      let half = handleId.includes('e') ? lx : handleId.includes('w') ? -lx : Math.abs(lx);
      half = Math.max(half, (baseW * MIN_NODE_SCALE) / 2);
      scaleX = clampNodeScale((2 * half) / baseW);
    }
    if (affectsY) {
      let half = handleId.includes('n') ? ly : handleId.includes('s') ? -ly : Math.abs(ly);
      half = Math.max(half, (baseH * MIN_NODE_SCALE) / 2);
      scaleY = clampNodeScale((2 * half) / baseH);
    }
    if (shiftKey && (affectsX || affectsY)) {
      const uniform = affectsX && affectsY ? Math.max(scaleX, scaleY) : (affectsX ? scaleX : scaleY);
      scaleX = uniform;
      scaleY = uniform;
    }
    node.scaleX = scaleX;
    node.scaleY = scaleY;
  }

  function beginStretchDrag(node, handleId, w) {
    if (state.selectedId !== node.id) setSelection([node.id], node.id);
    const scales = nodeScale(node);
    pushUndo();
    state.stretchUndoPushed = true;
    state.stretching = {
      nodeId: node.id,
      handle: handleId,
      startScaleX: scales.scaleX,
      startScaleY: scales.scaleY,
    };
    state.suppressClick = true;
    updateCanvasCursor();
    const local = worldToNodeLocal(node, w.x, w.y);
    applyStretchFromPointer(node, handleId, local.lx, local.ly, false, scales);
    fillInspector();
    markDirty();
  }

  function applyStretchDrag(w, shiftKey) {
    const st = state.stretching;
    if (!st) return;
    const node = state.project.nodes.find((n) => n.id === st.nodeId);
    if (!node) return;
    const local = worldToNodeLocal(node, w.x, w.y);
    applyStretchFromPointer(
      node,
      st.handle,
      local.lx,
      local.ly,
      shiftKey,
      { scaleX: st.startScaleX, scaleY: st.startScaleY },
    );
    fillInspector();
    markDirty();
  }

  function endStretchDrag() {
    if (!state.stretching || !state.stretchUndoPushed) {
      state.stretching = null;
      state.stretchUndoPushed = false;
      return;
    }
    const node = state.project.nodes.find((n) => n.id === state.stretching.nodeId);
    const moved = node && (
      Math.abs((node.scaleX ?? 1) - state.stretching.startScaleX) > 1e-4
      || Math.abs((node.scaleY ?? 1) - state.stretching.startScaleY) > 1e-4
    );
    if (!moved) {
      undoStack.pop();
      updateUndoButtons();
    } else {
      state.suppressClick = true;
    }
    state.stretching = null;
    state.stretchUndoPushed = false;
    updateCanvasCursor();
    markDirty();
  }

  function hitTestPort(wx, wy) {
    const tol = portHitTolerance();
    let best = null;
    let bestDist = tol;
    for (const n of state.project?.nodes || []) {
      for (const p of sym(n.type)?.ports || []) {
        const pt = portWorld(n, p.id);
        if (!pt) continue;
        const d = Math.hypot(pt.x - wx, pt.y - wy);
        if (d <= bestDist) {
          bestDist = d;
          best = pt;
        }
      }
    }
    return best;
  }

  function nextId(prefix, list) {
    let i = list.length + 1;
    while (list.some((x) => x.id === `${prefix}_${i}`)) i++;
    return `${prefix}_${i}`;
  }

  function extentsFromCorners(p1, p2, label) {
    const minX = Math.min(p1[0], p2[0]);
    const maxX = Math.max(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const maxY = Math.max(p1[1], p2[1]);
    if (maxX - minX < 0.01 || maxY - minY < 0.01) return null;
    return {
      minX,
      minY,
      maxX,
      maxY,
      label: String(label || 'Drawing extents').slice(0, 120),
    };
  }

  function formatExtentsSize(ext) {
    if (!ext) return 'Not set';
    const units = state.project?.units || 'ft';
    const w = (ext.maxX - ext.minX).toFixed(1);
    const h = (ext.maxY - ext.minY).toFixed(1);
    const sheet = ext.sheetSize ? ` · Sheet ${ext.sheetSize}` : '';
    return `${w} × ${h} ${units}${sheet}`;
  }

  function cloneProjectState() {
    const p = state.project;
    return JSON.parse(JSON.stringify({
      nodes: p.nodes,
      edges: p.edges,
      groups: p.groups || [],
      scale: p.scale,
      extents: p.extents,
      background: p.background,
      units: p.units,
    }));
  }

  function applyProjectState(snap) {
    state.project.nodes = snap.nodes || [];
    state.project.edges = snap.edges || [];
    state.project.groups = snap.groups || [];
    state.project.scale = snap.scale ?? null;
    state.project.extents = snap.extents ?? null;
    state.project.background = snap.background ?? null;
    if (snap.units) state.project.units = snap.units;
    clearConnectState();
    state.selectedId = null;
    state.selectedIds = [];
    state.selectedEdgeId = null;
    state.selectedEdgeVertex = null;
    state.extentsDraft = null;
    state.snapGuides = [];
    fillInspector();
    updateScaleLabel();
    updateExtentsPanel();
  }

  function updateUndoButtons() {
    const undoBtn = document.getElementById('mv-btn-undo');
    const redoBtn = document.getElementById('mv-btn-redo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function pushUndo() {
    if (!state.project) return;
    undoStack.push(cloneProjectState());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }

  function undo() {
    if (!undoStack.length || !state.project) return;
    redoStack.push(cloneProjectState());
    applyProjectState(undoStack.pop());
    loadBackground().finally(() => markDirty());
    updateUndoButtons();
    setStatus('Undo');
  }

  function redo() {
    if (!redoStack.length || !state.project) return;
    undoStack.push(cloneProjectState());
    applyProjectState(redoStack.pop());
    loadBackground().finally(() => markDirty());
    updateUndoButtons();
    setStatus('Redo');
  }

  function resolveConnectHandle(handle) {
    if (typeof MvDrawEdgePath !== 'undefined') {
      const parts = MvDrawEdgePath.parseHandle(handle);
      if (!parts) return null;
      const node = state.project?.nodes?.find((n) => n.id === parts.nodeId);
      if (!node) return null;
      const pt = portWorld(node, parts.portId);
      if (!pt) return null;
      return { ...pt, node, portId: parts.portId };
    }
    const s = String(handle || '');
    const i = s.indexOf(':');
    if (i < 0) return null;
    const node = state.project?.nodes?.find((n) => n.id === s.slice(0, i));
    if (!node) return null;
    return portWorld(node, s.slice(i + 1));
  }

  function clearConnectState() {
    state.connectFrom = null;
    state.connectVerts = [];
    state.pointerWorld = null;
    state.snapGuides = [];
  }

  function connectStatusHint() {
    const n = state.connectVerts.length;
    if (!n) return 'click canvas for bend points, or a destination port to finish';
    return `${n} bend${n === 1 ? '' : 's'} — click canvas for more, destination port to finish, Backspace to undo bend`;
  }

  function markDirty() {
    state.dirty = true;
    updateProjectTitle();
    draw();
  }

  function updateScaleLabel() {
    const sc = state.project?.scale;
    const units = state.project?.units || 'ft';
    if (sc?.pixelsPerUnit) {
      scaleLabel.textContent = `Scale: ${sc.pixelsPerUnit.toFixed(2)} px/${units}`;
    } else {
      scaleLabel.textContent = `Scale: default (${DEFAULT_PPU} px/${units}) — calibrate for site plan`;
    }
  }

  function updateExtentsPanel() {
    const ext = state.project?.extents;
    const units = state.project?.units || 'ft';
    const info = document.getElementById('mv-extents-info');
    const labelInp = document.getElementById('mv-extents-label-inp');
    const clearBtn = document.getElementById('mv-btn-clear-extents');
    const zoomBtn = document.getElementById('mv-btn-zoom-extents');
    const wpiInp = document.getElementById('mv-workspace-wpi');
    const wpiUnits = document.getElementById('mv-workspace-wpi-units');
    const sheetHint = document.getElementById('mv-sheet-hint');
    const size = formatExtentsSize(ext);
    if (extentsLabel) extentsLabel.textContent = `Extents: ${size}`;
    if (info) {
      info.textContent = ext
        ? `${size} — PDF export and Zoom extents use this boundary.`
        : 'Not set — pick a sheet above or use Extents to click two opposite corners.';
    }
    if (labelInp) labelInp.value = ext?.label || '';
    if (clearBtn) clearBtn.disabled = !ext;
    if (zoomBtn) zoomBtn.disabled = !ext && !contentBounds();
    if (wpiUnits) wpiUnits.textContent = units;
    if (wpiInp && ext?.worldPerInch) wpiInp.value = String(ext.worldPerInch);
    else if (wpiInp && sheetApi) wpiInp.value = String(sheetApi.defaultWorldPerInch(units));
    document.querySelectorAll('.mv-sheet-btn').forEach((btn) => {
      const on = !!ext?.sheetSize && btn.dataset.sheet === ext.sheetSize;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    updateSheetHint(sheetHint, ext?.sheetSize || 'D', units, wpiInp?.value);
  }

  function workspaceWorldPerInch() {
    const units = state.project?.units || 'ft';
    const raw = +document.getElementById('mv-workspace-wpi')?.value;
    if (Number.isFinite(raw) && raw > 0) return raw;
    return sheetApi ? sheetApi.defaultWorldPerInch(units) : (units === 'm' ? 3 : 10);
  }

  function workspaceCenter() {
    const rect = canvas?.getBoundingClientRect();
    if (rect) {
      const w = screenToWorld(rect.width / 2, rect.height / 2);
      return { x: w.x, y: w.y };
    }
    const bounds = contentBounds();
    if (bounds) {
      return {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      };
    }
    return { x: 0, y: 0 };
  }

  function updateSheetHint(el, sheetKey, units, worldPerInch) {
    if (!el || !sheetApi) return;
    el.textContent = sheetApi.formatSheetDescription(
      sheetKey,
      units,
      worldPerInch || workspaceWorldPerInch(),
    );
  }

  function applySheetWorkspace(sheetKey) {
    if (!sheetApi) return;
    const units = state.project?.units || 'ft';
    const center = workspaceCenter();
    const ext = sheetApi.extentsFromSheet(sheetKey, center.x, center.y, {
      units,
      worldPerInch: workspaceWorldPerInch(),
    });
    if (!ext) return;
    pushUndo();
    state.project.extents = ext;
    updateExtentsPanel();
    markDirty();
    zoomExtents();
    setStatus(`Workspace set to sheet ${sheetKey} — ${formatExtentsSize(ext)}`);
  }

  function zoomExtents() {
    if (state.project?.extents) {
      fitExtentsView();
      return;
    }
    const bounds = contentBounds();
    if (bounds) fitViewToBounds(bounds, 'Zoom to drawing');
    else setStatus('Nothing to zoom to', true);
  }

  function fitViewToBounds(bounds, statusMsg) {
    if (!bounds || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const pad = 48;
    let spanX = bounds.maxX - bounds.minX;
    let spanY = bounds.maxY - bounds.minY;
    if (spanX <= 0) spanX = 10;
    if (spanY <= 0) spanY = 10;
    const zoomX = (rect.width - pad * 2) / (spanX * ppu());
    const zoomY = (rect.height - pad * 2) / (spanY * ppu());
    state.zoom = Math.max(0.2, Math.min(6, Math.min(zoomX, zoomY)));
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    state.pan.x = rect.width / 2 - cx * ppu() * state.zoom;
    state.pan.y = rect.height / 2 + cy * ppu() * state.zoom;
    draw();
    if (statusMsg) setStatus(statusMsg);
    return true;
  }

  function contentBounds() {
    const ext = state.project?.extents;
    if (ext) {
      return { minX: ext.minX, minY: ext.minY, maxX: ext.maxX, maxY: ext.maxY };
    }
    let bounds = null;
    const nodes = state.project?.nodes || [];
    if (nodes.length && snapApi) {
      bounds = snapApi.boundsOfNodes(nodes, sym);
    }
    if (!bounds && state.bgImage && state.project?.background) {
      const w = state.bgImage.width / ppu();
      const h = state.bgImage.height / ppu();
      if (w > 0 && h > 0) bounds = { minX: 0, minY: 0, maxX: w, maxY: h };
    }
    for (const edge of state.project?.edges || []) {
      for (const [x, y] of edgePoints(edge)) {
        if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
        else {
          bounds.minX = Math.min(bounds.minX, x);
          bounds.minY = Math.min(bounds.minY, y);
          bounds.maxX = Math.max(bounds.maxX, x);
          bounds.maxY = Math.max(bounds.maxY, y);
        }
      }
    }
    return bounds;
  }

  function fitViewToContent() {
    if (state.project?.extents) {
      fitExtentsView();
      return;
    }
    const bounds = contentBounds();
    if (bounds) fitViewToBounds(bounds, 'Zoom to drawing');
    else {
      state.pan = { x: 40, y: 40 };
      state.zoom = 1;
      draw();
    }
  }

  function fitExtentsView() {
    const ext = state.project?.extents;
    if (!ext || !canvas) return;
    fitViewToBounds(
      { minX: ext.minX, minY: ext.minY, maxX: ext.maxX, maxY: ext.maxY },
      'Zoom extents',
    );
  }

  function fillInspector() {
    const form = document.getElementById('mv-inspector-form');
    const edgeForm = document.getElementById('mv-edge-inspector-form');
    const empty = document.getElementById('mv-inspector-empty');
    const node = (state.project?.nodes || []).find((n) => n.id === state.selectedId);
    const edge = (state.project?.edges || []).find((e) => e.id === state.selectedEdgeId);

    if (edge) {
      form?.classList.add('view-hidden');
      empty?.classList.add('view-hidden');
      edgeForm?.classList.remove('view-hidden');
      const fromLbl = edge.from || '';
      const toLbl = edge.to || '';
      const bends = ensureEdgePoints(edge).length;
      const labelEl = document.getElementById('mv-edge-insp-route');
      const bendsEl = document.getElementById('mv-edge-insp-bends');
      if (labelEl) labelEl.value = `${fromLbl} → ${toLbl}`;
      if (bendsEl) bendsEl.value = String(bends);
      const kindEl = document.getElementById('mv-edge-insp-kind');
      if (kindEl) {
        const kind = typeof MvDrawEdgePath?.normalizeEdgeKind === 'function'
          ? MvDrawEdgePath.normalizeEdgeKind(edge.kind)
          : (edge.kind || 'src');
        kindEl.value = kind;
      }
      updateAlignButtons();
      return;
    }

    edgeForm?.classList.add('view-hidden');
    if (!node) {
      form?.classList.add('view-hidden');
      empty?.classList.remove('view-hidden');
      updateAlignButtons();
      return;
    }
    empty?.classList.add('view-hidden');
    form?.classList.remove('view-hidden');
    document.getElementById('mv-insp-label').value = node.label || '';
    document.getElementById('mv-insp-type').value = node.type;
    document.getElementById('mv-insp-x').value = node.x.toFixed(2);
    document.getElementById('mv-insp-y').value = node.y.toFixed(2);
    document.getElementById('mv-insp-rot').value = node.rotation || 0;
    document.getElementById('mv-insp-scale-x').value = nodeScale(node).scaleX.toFixed(2);
    document.getElementById('mv-insp-scale-y').value = nodeScale(node).scaleY.toFixed(2);
    fillInspectorMeta(node);
    updateAlignButtons();
  }

  function ensureNodeMeta(node) {
    node.meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
    return node.meta;
  }

  function fillInspectorMeta(node) {
    const meta = node?.meta || {};
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };
    set('mv-insp-device-id', meta.deviceId);
    set('mv-insp-zone-id', meta.zoneId);
    set('mv-insp-role', meta.role);
    set('mv-insp-alarm-tag', meta.alarmTag);
    set('mv-insp-level-tag', meta.levelTag);
  }

  function readInspectorMeta(node) {
    if (!node) return;
    const meta = ensureNodeMeta(node);
    const set = (key, id) => {
      const v = document.getElementById(id)?.value.trim() || '';
      if (v) meta[key] = v;
      else delete meta[key];
    };
    set('deviceId', 'mv-insp-device-id');
    set('zoneId', 'mv-insp-zone-id');
    set('role', 'mv-insp-role');
    set('alarmTag', 'mv-insp-alarm-tag');
    set('levelTag', 'mv-insp-level-tag');
  }

  function fillProjectFields() {
    const p = state.project;
    if (!p) return;
    document.getElementById('mv-proj-name').value = displayProjectName();
    document.getElementById('mv-proj-site').value = p.meta?.site || '';
    document.getElementById('mv-proj-client').value = p.meta?.client || '';
    document.getElementById('mv-proj-notes').value = p.meta?.notes || '';
  }

  function readProjectFields() {
    if (!state.project) return;
    const inp = document.getElementById('mv-proj-name')?.value.trim() || '';
    if (inp) state.project.name = inp;
    else if (!state.project.name) state.project.name = 'untitled';
    state.project.meta = state.project.meta || {};
    state.project.meta.site = document.getElementById('mv-proj-site').value.trim();
    state.project.meta.client = document.getElementById('mv-proj-client').value.trim();
    state.project.meta.notes = document.getElementById('mv-proj-notes').value.trim();
  }

  function renderSymbolLibrary() {
    const root = document.getElementById('mv-symbol-list');
    if (!root) return;
    const GROUP_ORDER = [
      'Tanks',
      'Lift & ATU panels',
      'Power panels',
      'Drainfield',
      'Distribution',
      'Piping',
      'Site',
      'HMI — Tanks & vessels',
      'HMI — Pumps',
      'HMI — Piping',
      'HMI — Valves',
      'HMI — Process equipment',
    ];
    const DEFAULT_OPEN = new Set(['Tanks', 'Lift & ATU panels', 'Power panels', 'Drainfield', 'Site plan (MV Draw)']);
    const q = String(state.librarySearch || '').trim().toLowerCase();
    let expanded = null;
    try {
      const raw = sessionStorage.getItem('mvDrawLibraryExpanded');
      if (raw) expanded = JSON.parse(raw);
    } catch {
      expanded = null;
    }

    const groups = new Map();
    for (const s of state.symbols) {
      if (q) {
        const hay = `${s.label} ${s.type} ${s.group} ${s.hmiSvg || ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(s);
    }
    const ordered = [
      ...GROUP_ORDER.filter((g) => groups.has(g)),
      ...[...groups.keys()].filter((g) => !GROUP_ORDER.includes(g)).sort(),
    ];

    root.innerHTML = '';
    if (!ordered.length) {
      root.innerHTML = '<p class="panel-hint">No symbols match the filter.</p>';
      return;
    }
    for (const group of ordered) {
      const items = groups.get(group) || [];
      const details = document.createElement('details');
      details.className = 'mv-symbol-group';
      details.dataset.group = group;
      const isOpen = expanded && Object.prototype.hasOwnProperty.call(expanded, group)
        ? !!expanded[group]
        : DEFAULT_OPEN.has(group) || (q.length > 0);
      details.open = isOpen;

      const summary = document.createElement('summary');
      summary.className = 'mv-symbol-group-summary';
      summary.innerHTML = `<span class="mv-symbol-group-label">${group}</span><span class="mv-symbol-group-meta"><span class="mv-symbol-group-count">${items.length}</span><span class="mv-symbol-group-caret" aria-hidden="true">▾</span></span>`;

      const panel = document.createElement('div');
      panel.className = 'mv-symbol-group-panel';
      for (const s of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mv-symbol-btn';
        btn.dataset.type = s.type;
        const thumbHtml = s.shape === 'hmi_image' && s.hmiSvg
          ? `<span class="mv-symbol-thumb mv-symbol-thumb-hmi"><img src="${s.hmiSvg}" alt="" loading="lazy"></span>`
          : `<span class="mv-symbol-thumb" style="background:${s.fill || '#64748b'}"></span>`;
        btn.innerHTML = `${thumbHtml}<span>${s.label}</span>`;
        btn.addEventListener('click', () => {
          setTool('place');
          state.placeType = s.type;
          document.querySelectorAll('.mv-symbol-btn').forEach((b) => b.classList.toggle('selected', b.dataset.type === s.type));
          setStatus(`Place: ${s.label}`);
        });
        panel.appendChild(btn);
      }

      details.addEventListener('toggle', () => {
        let stateMap = {};
        try {
          const raw = sessionStorage.getItem('mvDrawLibraryExpanded');
          if (raw) stateMap = JSON.parse(raw) || {};
        } catch {
          stateMap = {};
        }
        stateMap[group] = details.open;
        try {
          sessionStorage.setItem('mvDrawLibraryExpanded', JSON.stringify(stateMap));
        } catch {
          /* ignore quota */
        }
      });

      details.append(summary, panel);
      root.appendChild(details);
    }
  }

  async function loadBackground() {
    const bg = state.project?.background;
    state.bgImage = null;
    if (bg?.type !== 'image' || !bg.path) return;
    const file = bg.path.replace(/^uploads[/\\]/, '');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `${API}/background/${encodeURIComponent(file)}`;
    });
    state.bgImage = img;
  }

  function drawGrid() {
    const step = state.snapEnabled && state.snapGrid ? state.snapGridStep : 10;
    const s = ppu() * state.zoom;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const tl = screenToWorld(0, h);
    const br = screenToWorld(w, 0);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const startX = Math.floor(tl.x / step) * step;
    const startY = Math.floor(tl.y / step) * step;
    for (let x = startX; x <= br.x; x += step) {
      const sx = worldToScreen(x, 0).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = startY; y <= br.y; y += step) {
      const sy = worldToScreen(0, y).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
    if (state.snapEnabled && state.snapGrid && step >= 5) {
      ctx.strokeStyle = '#243044';
      ctx.lineWidth = 1.5;
      const major = step * 5;
      const majorStartX = Math.floor(tl.x / major) * major;
      const majorStartY = Math.floor(tl.y / major) * major;
      for (let x = majorStartX; x <= br.x; x += major) {
        const sx = worldToScreen(x, 0).x;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
      for (let y = majorStartY; y <= br.y; y += major) {
        const sy = worldToScreen(0, y).y;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }
    }
  }

  function drawBackground() {
    const bg = state.project?.background;
    if (!state.bgImage || !bg) return;
    const w = state.bgImage.width / ppu();
    const h = state.bgImage.height / ppu();
    const tl = worldToScreen(0, h);
    const br = worldToScreen(w, 0);
    ctx.save();
    ctx.globalAlpha = bg.opacity ?? 0.55;
    ctx.drawImage(state.bgImage, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.restore();
  }

  function edgePoints(edge) {
    if (typeof MvDrawEdgePath !== 'undefined') {
      return MvDrawEdgePath.buildEdgePathPoints(edge, state.project?.nodes || [], (node, portId) => {
        const pt = portWorld(node, portId);
        if (!pt) return null;
        return { x: pt.x, y: pt.y, dir: pt.dir || null };
      });
    }
    const a = resolveConnectHandle(edge.from);
    const b = resolveConnectHandle(edge.to);
    if (!a || !b) return [];
    const verts = (edge.points || [])
      .filter((p) => Array.isArray(p) && p.length >= 2)
      .map((p) => [+p[0], +p[1]]);
    if (!verts.length) {
      if (typeof MvDrawEdgePath !== 'undefined' && MvDrawEdgePath.orthogonalPathBetween) {
        return MvDrawEdgePath.orthogonalPathBetween(a.x, a.y, a.dir, b.x, b.y, b.dir);
      }
      return [
        [a.x, a.y],
        [b.x, a.y],
        [b.x, b.y],
      ].filter((p, i, arr) => i === 0 || Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) > 0.05);
    }
    return [[a.x, a.y], ...verts, [b.x, b.y]];
  }

  function drawEdge(edge) {
    const pts = edgePoints(edge);
    if (pts.length < 2) return;
    const selected = edge.id === state.selectedEdgeId;
    const stroke = typeof MvDrawEdgePath?.edgeStrokeColor === 'function'
      ? MvDrawEdgePath.edgeStrokeColor(edge, selected)
      : (selected ? '#fbbf24' : '#38bdf8');
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = worldToScreen(pts[i][0], pts[i][1]);
      const p1 = worldToScreen(pts[i + 1][0], pts[i + 1][1]);
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.restore();

    if (!selected || state.tool !== 'select') return;
    const verts = ensureEdgePoints(edge);
    for (let i = 0; i < verts.length; i++) {
      const [vx, vy] = verts[i];
      const sc = worldToScreen(vx, vy);
      const active = state.selectedEdgeVertex === i;
      ctx.beginPath();
      ctx.fillStyle = active ? '#fde68a' : '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.5;
      ctx.arc(sc.x, sc.y, active ? 7 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const pathPts = edgePoints(edge);
    for (let i = 0; i < pathPts.length - 1; i++) {
      const mx = (pathPts[i][0] + pathPts[i + 1][0]) / 2;
      const my = (pathPts[i][1] + pathPts[i + 1][1]) / 2;
      const sc = worldToScreen(mx, my);
      ctx.beginPath();
      ctx.fillStyle = '#0f172a';
      ctx.arc(sc.x, sc.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function isConnectionPort(portId) {
    if (typeof MvDrawPorts !== 'undefined' && MvDrawPorts.isConnectionPort) {
      return MvDrawPorts.isConnectionPort(portId);
    }
    return /^(inlet|outlet|influent|effluent|supply|dose|return|head|tail|recycle|was|leg\d|pipe)$/i.test(String(portId || ''));
  }

  function drawNodePorts(node, s) {
    const ports = s?.ports || [];
    if (!ports.length) return;
    const connectMode = state.tool === 'connect' || state.connectFrom;
    for (const p of ports) {
      if (!isConnectionPort(p.id) && !connectMode) continue;
      const pt = portWorld(node, p.id);
      if (!pt) continue;
      const sc = worldToScreen(pt.x, pt.y);
      const active = state.connectFrom === pt.handle;
      const selected = isNodeSelected(node.id);
      ctx.beginPath();
      if (connectMode) {
        const isElectric = typeof MvDrawEdgePath?.isElectricPort === 'function'
          && MvDrawEdgePath.isElectricPort(p.id);
        ctx.fillStyle = state.connectFrom === pt.handle ? '#fbbf24' : (isElectric ? '#eab308' : '#22c55e');
        ctx.arc(sc.x, sc.y, active ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const isElectric = typeof MvDrawEdgePath?.isElectricPort === 'function'
          && MvDrawEdgePath.isElectricPort(p.id);
        ctx.fillStyle = selected ? '#38bdf8' : (isElectric ? '#eab308' : 'rgba(34, 197, 94, 0.85)');
        ctx.arc(sc.x, sc.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function nodeScreenScale() {
    return ppu() * state.zoom;
  }

  /** Bottom-center of rotated symbol hull in screen space (for captions). */
  function nodeLabelScreenAnchor(node, s) {
    const h = nodeSymbolSize(node, s).h;
    const rad = ((node.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = 0;
    const ly = -h / 2;
    const wx = node.x + lx * cos - ly * sin;
    const wy = node.y + lx * sin + ly * cos;
    return worldToScreen(wx, wy);
  }

  function drawNodeSymbol(node, s, w, h) {
    const scale = nodeScreenScale();
    const rot = ((node.rotation || 0) * Math.PI) / 180;
    const center = worldToScreen(node.x, node.y);
    ctx.save();
    ctx.translate(center.x, center.y);
    if (rot) ctx.rotate(-rot);
    ctx.scale(scale, -scale);
    const hw = w / 2;
    const hh = h / 2;
    drawSymbolShape(node, s, { x: -hw, y: -hh }, { x: hw, y: hh }, w, h, scale);
    ctx.restore();
  }

  function drawSymbolShape(node, s, tl, br, rw, rh, localScale) {
    const sc = localScale || 1;
    const fs = (base) => Math.max(base * 0.85, base * state.zoom) / sc;
    const cx = tl.x + rw / 2;
    const cy = tl.y + rh / 2;
    const stroke = isNodeSelected(node.id) ? '#fbbf24' : (s?.stroke || '#334155');
    const fill = s?.fill || '#64748b';
    ctx.lineWidth = (isNodeSelected(node.id) ? 3 : 2) / sc;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;

    const shape = s?.shape || 'rect';

    if (shape === 'treatment_tank') {
      const r = Math.min(rw, rh) * 0.44;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ecfdf5';
      ctx.font = `bold ${fs(10)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawSymbolText('1250', cx, cy - 4 / sc);
      ctx.font = `${fs(9)}px Segoe UI, sans-serif`;
      drawSymbolText('gal', cx, cy + 7 / sc);
      return;
    }

    if (shape === 'integrated_mle_tank') {
      const r = Math.min(rw, rh) * 0.46;
      const clarR = r * (75 / 118);
      const ri = r * (75 / 118);
      const ro = r * (115 / 118);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, ro, Math.PI, 0);
      ctx.arc(cx, cy, ri, 0, Math.PI, true);
      ctx.closePath();
      ctx.fillStyle = '#06b6d4';
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, ro, 0, Math.PI);
      ctx.arc(cx, cy, ri, Math.PI, 0, true);
      ctx.closePath();
      ctx.fillStyle = '#6366f1';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, clarR, 0, Math.PI * 2);
      ctx.fillStyle = '#dbeafe';
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, r * 0.06), 0, Math.PI * 2);
      ctx.fill();

      const midR = (ri + ro) * 0.5;
      const probeColors = ['#22c55e', '#06b6d4', '#6366f1', '#a855f7'];
      const probeAngles = [-Math.PI * 0.35, Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.7];
      probeAngles.forEach((a, i) => {
        ctx.fillStyle = probeColors[i];
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * midR, cy - Math.sin(a) * midR, Math.max(1.5, r * 0.04), 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = '#f8fafc';
      ctx.font = `bold ${fs(10)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawSymbolText('125K', cx, cy - 5);
      ctx.font = `${fs(9)}px Segoe UI, sans-serif`;
      drawSymbolText('MLE', cx, cy + 7);
      return;
    }

    if (shape === 'trash_tank_2comp') {
      const baffleX = tl.x + rw * 0.42;
      const pad = rh * 0.1;
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeRect(tl.x, tl.y, rw, rh);
      ctx.fillStyle = '#57534e';
      ctx.fillRect(baffleX - 1.5, tl.y + pad, 3, rh - pad * 2);
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(baffleX, tl.y + pad);
      ctx.lineTo(baffleX, br.y - pad);
      ctx.stroke();
      ctx.fillStyle = '#fafaf9';
      ctx.font = `bold ${fs(9)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawSymbolText('1', tl.x + (baffleX - tl.x) / 2, cy - rh * 0.12);
      drawSymbolText('2', baffleX + (br.x - baffleX) / 2, cy - rh * 0.12);
      ctx.fillStyle = '#e7e5e4';
      ctx.font = `bold ${fs(10)}px Segoe UI, sans-serif`;
      drawSymbolText('1250', cx, cy + rh * 0.08);
      ctx.font = `${fs(8)}px Segoe UI, sans-serif`;
      drawSymbolTextWrapped('gal · 2-comp trash', cx, cy + rh * 0.18, {
        fontSize: fs(8),
        baseline: 'top',
        fillStyle: '#fafaf9',
      });
      return;
    }

    if (shape === 'dosing_tank_duplex') {
      const pad = rw * 0.08;
      const r = Math.min(rw, rh) * 0.38;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy + rh * 0.04, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const p1x = cx - rw * 0.14;
      const p2x = cx + rw * 0.14;
      const py = cy + rh * 0.06;
      const pr = Math.min(rw, rh) * 0.11;
      ctx.fillStyle = '#0c4a6e';
      [p1x, p2x].forEach((px) => {
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      const cabW = rw * 0.24;
      const cabH = rh * 0.22;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(br.x - cabW - pad, tl.y + pad, cabW, cabH);
      ctx.strokeRect(br.x - cabW - pad, tl.y + pad, cabW, cabH);
      ctx.fillStyle = '#f0f9ff';
      ctx.font = `bold ${fs(9)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawSymbolText('P1', p1x, py);
      drawSymbolText('P2', p2x, py);
      ctx.fillStyle = '#e0f2fe';
      ctx.font = `bold ${fs(10)}px Segoe UI, sans-serif`;
      drawSymbolText('1500', cx, cy - rh * 0.22);
      ctx.font = `${fs(8)}px Segoe UI, sans-serif`;
      drawSymbolText('gal dose', cx, cy - rh * 0.08);
      return;
    }

    if (shape === 'simplex_lift' || shape === 'duplex_lift') {
      const pad = rw * 0.08;
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeRect(tl.x, tl.y, rw, rh);

      const wellRx = Math.min(rw, rh) * 0.18;
      const wellRy = Math.min(rw, rh) * 0.36;
      const wellCx = tl.x + rw * 0.22;
      const wellCy = cy;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(wellCx, wellCy, wellRx, wellRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const stubLen = Math.max(rw * 0.12, 0.35 / sc);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.5, 2) / sc;
      for (const portId of ['inlet', 'outlet']) {
        const port = (s?.ports || []).find((p) => p.id === portId);
        if (!port) continue;
        let lx = port.x - (s?.width || rw) / 2;
        let ly = port.y - (s?.height || rh) / 2;
        if (typeof MvDrawPorts !== 'undefined') {
          const off = MvDrawPorts.portLocalOffset(s, port);
          lx = off.lx;
          ly = off.ly;
        }
        const px = cx + lx;
        const py = cy - ly;
        const dir = port.dir || (portId === 'inlet' ? 'w' : 'e');
        let ex = px;
        let ey = py;
        if (dir === 'e') ex += stubLen;
        else if (dir === 'w') ex -= stubLen;
        else if (dir === 'n') ey -= stubLen;
        else if (dir === 's') ey += stubLen;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.strokeStyle = stroke;

      const cabW = rw * 0.22;
      const cabH = rh * 0.28;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(br.x - cabW - pad, tl.y + pad, cabW, cabH);
      ctx.strokeRect(br.x - cabW - pad, tl.y + pad, cabW, cabH);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `bold ${fs(9)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (shape === 'simplex_lift') {
        drawSymbolText('P1', wellCx, wellCy);
      } else {
        drawSymbolText('P1', wellCx - wellRx * 0.35, wellCy - wellRy * 0.2);
        drawSymbolText('P2', wellCx + wellRx * 0.35, wellCy + wellRy * 0.2);
      }
      return;
    }

    if (shape === 'atu_control_panel') {
      const pad = rw * 0.07;
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeRect(tl.x, tl.y, rw, rh);
      const trains = Math.max(1, s.trains || 1);
      const tpoCount = Math.max(1, s.tpoCount || trains);
      const cabW = rw * 0.24;
      const cabH = rh * 0.3;
      const trainLeft = tl.x + pad * 1.4;
      const trainW = Math.max(rw - cabW - pad * 3.2, rw * 0.4);
      const step = trainW / trains;
      const pr = Math.min(step * 0.16, rh * 0.1);
      for (let i = 0; i < trains; i += 1) {
        const tx = trainLeft + step * (i + 0.5);
        const py = cy + rh * 0.06;
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(tx - pr * 0.65, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tx + pr * 0.65, py, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ecfdf5';
        ctx.font = `bold ${fs(8)}px Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        drawSymbolText(`ALT${i + 1}`, tx, cy - rh * 0.14);
      }
      const cabX = br.x - cabW - pad;
      const cabY = tl.y + pad;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(cabX, cabY, cabW, cabH);
      ctx.strokeRect(cabX, cabY, cabW, cabH);
      const lampR = Math.min(cabW * 0.09, rh * 0.045);
      const lampCols = Math.min(tpoCount, 4);
      const lampGap = cabW / (lampCols + 1);
      for (let t = 0; t < lampCols; t += 1) {
        const lx = cabX + lampGap * (t + 1);
        const ly = cabY + cabH * 0.38;
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(lx, ly, lampR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#1e293b';
      ctx.font = `bold ${fs(8)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      drawSymbolText(`TPO×${tpoCount}`, cabX + cabW / 2, cabY + cabH * 0.72);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `bold ${fs(9)}px Segoe UI, sans-serif`;
      drawSymbolText('ATU', trainLeft + trainW / 2, tl.y + rh * 0.1);
      return;
    }

    if (shape === 'power_panel') {
      const pad = rw * 0.08;
      ctx.fillStyle = fill;
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeRect(tl.x, tl.y, rw, rh);
      const doorW = rw * 0.88;
      const doorH = rh * 0.72;
      const doorX = cx - doorW / 2;
      const doorY = tl.y + pad;
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(doorX, doorY, doorW, doorH);
      ctx.strokeRect(doorX, doorY, doorW, doorH);
      const circuits = Math.max(1, s.circuits || (s.ports || []).filter((p) => /^c\d+$/.test(p.id)).length || 1);
      ctx.fillStyle = '#78350f';
      ctx.font = `bold ${fs(10)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawSymbolText('PWR', cx, doorY + doorH * 0.38);
      ctx.font = `bold ${fs(9)}px Segoe UI, sans-serif`;
      drawSymbolText(`×${circuits}`, cx, doorY + doorH * 0.68);
      const circuitPorts = (s.ports || []).filter((p) => /^c\d+$/.test(p.id));
      const dotR = Math.max(1.2, Math.min(rw * 0.018, rh * 0.045));
      ctx.fillStyle = '#eab308';
      for (const port of circuitPorts) {
        let lx = port.x - (s.width || rw) / 2;
        let ly = port.y - (s.height || rh) / 2;
        if (typeof MvDrawPorts !== 'undefined') {
          const off = MvDrawPorts.portLocalOffset(s, port);
          lx = off.lx;
          ly = off.ly;
        }
        const px = cx + lx;
        const py = cy - ly;
        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      return;
    }

    if (shape === 'drip_field') {
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeRect(tl.x, tl.y, rw, rh);
      const rows = 4;
      const cols = 10;
      ctx.fillStyle = '#166534';
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const dx = tl.x + (c + 0.5) * (rw / cols);
          const dy = tl.y + (r + 0.5) * (rh / rows);
          ctx.beginPath();
          ctx.arc(dx, dy, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }

    if (shape === 'drip_irrigation_4leg') {
      const headerH = rh * 0.22;
      const headerY = tl.y + rh * 0.12;
      const legTop = headerY + headerH;
      const legBot = br.y - rh * 0.08;
      const legXs = [0.14, 0.36, 0.64, 0.86].map((f) => tl.x + rw * f);
      ctx.fillStyle = s.fill || '#4ade80';
      ctx.fillRect(tl.x, headerY, rw, headerH);
      ctx.strokeRect(tl.x, headerY, rw, headerH);
      ctx.fillStyle = '#166534';
      ctx.font = `bold ${fs(8)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      drawSymbolText('SUPPLY', tl.x + rw * 0.12, headerY + headerH * 0.62);
      drawSymbolText('RETURN', tl.x + rw * 0.88, headerY + headerH * 0.62);
      legXs.forEach((lx, i) => {
        ctx.strokeStyle = s.stroke || '#166534';
        ctx.lineWidth = Math.max(2, 2.5 * state.zoom) / sc;
        ctx.beginPath();
        ctx.moveTo(lx, legTop);
        ctx.lineTo(lx, legBot);
        ctx.stroke();
        const emitters = 6;
        for (let e = 0; e < emitters; e += 1) {
          const ey = legTop + ((e + 0.5) / emitters) * (legBot - legTop);
          ctx.beginPath();
          ctx.arc(lx, ey, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `${fs(8)}px Segoe UI, sans-serif`;
        drawSymbolText(`L${i + 1}`, lx, br.y - rh * 0.02);
        ctx.fillStyle = '#166534';
      });
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = Math.max(1.5, 2 * state.zoom) / sc;
      ctx.beginPath();
      ctx.moveTo(legXs[0], legBot);
      ctx.lineTo(legXs[3], legBot);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0f766e';
      ctx.font = `${fs(8)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      drawSymbolTextWrapped('return manifold', cx, legBot + rh * 0.02, {
        fontSize: fs(9),
        baseline: 'top',
        fillStyle: '#e2e8f0',
      });
      return;
    }

    if (shape === 'drip_leg') {
      ctx.fillStyle = s.fill || '#86efac';
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeRect(tl.x, tl.y, rw, rh);
      ctx.fillStyle = '#15803d';
      const emitters = 12;
      for (let e = 0; e < emitters; e += 1) {
        const ex = tl.x + ((e + 0.5) / emitters) * rw;
        const ey = cy;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (shape === 'hmi_image' && s.hmiSvg) {
      const cached = hmiImageCache.get(s.hmiSvg);
      if (cached?.ok && cached.img) {
        ctx.drawImage(cached.img, tl.x, tl.y, rw, rh);
        ctx.strokeRect(tl.x, tl.y, rw, rh);
        return;
      }
      if (!cached) preloadHmiSymbolImages([s]);
      ctx.fillStyle = s.fill || '#cbd5e1';
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeRect(tl.x, tl.y, rw, rh);
      ctx.fillStyle = '#475569';
      ctx.font = `${fs(8)}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawSymbolText('HMI', cx, cy);
      return;
    }

    ctx.fillRect(tl.x, tl.y, rw, rh);
    ctx.strokeRect(tl.x, tl.y, rw, rh);
  }

  function drawNode(node) {
    const s = sym(node.type);
    const { w, h } = nodeSymbolSize(node, s);
    drawNodeSymbol(node, s, w, h);
    drawNodePorts(node, s);
    const custom = String(node.label ?? '').trim();
    const caption = nodeCaption(node, s);
    if (caption && (custom || !shapeHasBuiltinCaption(s))) {
      const anchor = nodeLabelScreenAnchor(node, s);
      drawTextWrapped(caption, anchor.x, anchor.y + 6, {
        fontSize: Math.max(10, 11 * state.zoom),
        baseline: 'top',
        fillStyle: '#e2e8f0',
      });
    }

    if (state.tool === 'connect' || state.connectFrom) {
      for (const p of s?.ports || []) {
        if (!isConnectionPort(p.id)) {
          const pt = portWorld(node, p.id);
          if (!pt) continue;
          const sc = worldToScreen(pt.x, pt.y);
          ctx.beginPath();
          ctx.fillStyle = state.connectFrom === pt.handle ? '#fbbf24' : (MvDrawEdgePath?.isElectricPort?.(p.id) ? '#eab308' : '#a3e635');
          ctx.arc(sc.x, sc.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function connectPreviewColor() {
    const kind = state.connectLineKind || 'src';
    if (typeof MvDrawEdgePath?.edgeStrokeColor === 'function') {
      return MvDrawEdgePath.edgeStrokeColor({ kind }, false);
    }
    return '#38bdf8';
  }

  function lineKindLabel(kind) {
    if (kind === 'return') return 'Return (red)';
    if (kind === 'electric') return 'Electric (yellow)';
    return 'Src (blue)';
  }

  function updateLinePaletteUi() {
    const palette = document.getElementById('mv-line-palette');
    if (palette) palette.hidden = state.tool !== 'connect';
    document.querySelectorAll('.mv-line-kind').forEach((btn) => {
      const on = btn.dataset.lineKind === (state.connectLineKind || 'src');
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setConnectLineKind(kind) {
    state.connectLineKind = kind || 'src';
    updateLinePaletteUi();
    if (state.tool === 'connect') {
      setStatus(`Connect — ${lineKindLabel(state.connectLineKind)}`);
    }
    markDirty();
  }

  function drawConnectPreview() {
    if (!state.connectFrom || !state.pointerWorld) return;
    const from = resolveConnectHandle(state.connectFrom);
    if (!from) return;
    const chain = [
      [from.x, from.y],
      ...state.connectVerts,
      [state.pointerWorld.x, state.pointerWorld.y],
    ];
    const previewColor = connectPreviewColor();
    ctx.save();
    ctx.strokeStyle = previewColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    const p0 = worldToScreen(chain[0][0], chain[0][1]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < chain.length; i++) {
      const p = worldToScreen(chain[i][0], chain[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    for (let i = 1; i < chain.length; i++) {
      const sc = worldToScreen(chain[i][0], chain[i][1]);
      ctx.beginPath();
      ctx.fillStyle = i === chain.length - 1 ? '#fde68a' : previewColor;
      ctx.arc(sc.x, sc.y, i === chain.length - 1 ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawExtentsRect(ext, stroke, dash) {
    if (!ext) return;
    const tl = worldToScreen(ext.minX, ext.maxY);
    const br = worldToScreen(ext.maxX, ext.minY);
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    if (dash) ctx.setLineDash([10, 6]);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
    ctx.fillStyle = stroke;
    drawTextWrapped(ext.label || 'Extents', tl.x + 4, tl.y + 4, {
      fontSize: 11,
      align: 'left',
      baseline: 'top',
      fillStyle: stroke,
    });
    ctx.restore();
  }

  function drawExtentsOverlay() {
    const ext = state.project?.extents;
    if (ext) drawExtentsRect(ext, '#c084fc', false);

    const draft = state.extentsDraft;
    if (!draft?.p1) return;
    const p1 = draft.p1;
    const p2 = draft.p2 || (state.pointerWorld ? [state.pointerWorld.x, state.pointerWorld.y] : null);
    if (!p2) {
      const sc = worldToScreen(p1[0], p1[1]);
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, 6, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const preview = extentsFromCorners(p1, p2, 'Draft');
    if (preview) drawExtentsRect(preview, '#e879f9', true);
  }

  function drawCalibrateOverlay() {
    if (!state.calibrate?.p1) return;
    const p1 = worldToScreen(state.calibrate.p1[0], state.calibrate.p1[1]);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2);
    ctx.fill();
    if (state.calibrate.p2) {
      const p2 = worldToScreen(state.calibrate.p2[0], state.calibrate.p2[1]);
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  function marqueeWorldRect(marquee) {
    if (!marquee) return null;
    return {
      minX: Math.min(marquee.p1[0], marquee.p2[0]),
      maxX: Math.max(marquee.p1[0], marquee.p2[0]),
      minY: Math.min(marquee.p1[1], marquee.p2[1]),
      maxY: Math.max(marquee.p1[1], marquee.p2[1]),
    };
  }

  function drawGroupOutlines() {
    if (!groupApi || !state.project?.groups?.length) return;
    const selected = new Set(
      state.selectedIds.length
        ? state.selectedIds
        : (state.selectedId ? [state.selectedId] : []),
    );
    if (!selected.size) return;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#a78bfa';
    for (const g of state.project.groups) {
      if (!g.nodeIds.some((id) => selected.has(id))) continue;
      const b = groupApi.groupBounds(g.nodeIds, state.project.nodes, sym);
      if (!b) continue;
      const tl = worldToScreen(b.minX, b.maxY);
      const br = worldToScreen(b.maxX, b.minY);
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawMarquee() {
    if (!state.marquee) return;
    const r = marqueeWorldRect(state.marquee);
    if (!r) return;
    const tl = worldToScreen(r.minX, r.maxY);
    const br = worldToScreen(r.maxX, r.minY);
    ctx.save();
    ctx.fillStyle = 'rgba(96, 165, 250, 0.12)';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawSnapGuides() {
    if (!state.snapGuides?.length || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    for (const g of state.snapGuides) {
      if (g.axis === 'x') {
        const sx = worldToScreen(g.value, 0).x;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, rect.height);
        ctx.stroke();
      } else if (g.axis === 'y') {
        const sy = worldToScreen(0, g.value).y;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(rect.width, sy);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const w = rect.width;
    const h = rect.height;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);
    drawGrid();
    drawBackground();
    drawExtentsOverlay();
    for (const node of state.project?.nodes || []) drawNode(node);
    drawGroupOutlines();
    drawRotationHandles();
    drawStretchHandles();
    for (const edge of state.project?.edges || []) drawEdge(edge);
    drawConnectPreview();
    drawMarquee();
    drawSnapGuides();
    drawCalibrateOverlay();
  }

  async function saveProject() {
    readProjectFields();
    setStatus('Saving…');
    const data = await api('PUT', '/project', { project: state.project });
    applyProjectPayload(data);
    state.dirty = false;
    updateProjectStatus();
    setStatus('Saved');
  }

  function applyProjectPayload(data) {
    if (data?.project) state.project = data.project;
    if (data?.storage) state.storage = data.storage;
    if (data?.project?.libraryFile) state.activeFile = data.project.libraryFile;
    else if (data?.file) state.activeFile = data.file;
    fillProjectFields();
  }

  function nameFromLibraryFile(file) {
    const base = String(file || '')
      .replace(/^.*[/\\]/, '')
      .replace(/\.mvdraw\.json$/i, '')
      .replace(/\.mvbundle$/i, '')
      .replace(/\.json$/i, '')
      .trim();
    return base || '';
  }

  function isDefaultProjectName(name) {
    const n = String(name || '').trim().toLowerCase();
    return !n || n === 'untitled';
  }

  function projectFileBaseName() {
    return nameFromLibraryFile(state.project?.libraryFile || state.activeFile || state.localFilePath);
  }

  /** Display title — project.name, or saved file name when still untitled. */
  function displayProjectName() {
    const raw = String(state.project?.name || '').trim();
    if (!isDefaultProjectName(raw)) return raw;
    const fromFile = projectFileBaseName();
    return fromFile || raw || 'untitled';
  }

  function projectPathDisplay() {
    if (state.localFilePath) return state.localFilePath;
    if (state.storage?.libraryPath) return state.storage.libraryPath;
    if (state.project?.libraryFile) return `data/mv-draw/projects/${state.project.libraryFile}`;
    if (state.activeFile) return `data/mv-draw/projects/${state.activeFile}`;
    return 'data/mv-draw/active.json (not saved to library)';
  }

  function peaklogicProjectLabel() {
    const name = state.peaklogicContext?.projectName;
    if (!name) return 'PeakLogic project: —';
    const synced = state.project?.meta?.peaklogicProject === name;
    const est = state.estProjectPath || state.peaklogicContext?.estPath;
    const estNote = synced && est ? ` · ${est}` : '';
    return `PeakLogic project: ${name}${synced ? ' (synced)' : ''}${estNote}`;
  }

  function closeFileMenu() {
    const panel = document.getElementById('mv-file-menu-panel');
    const btn = document.getElementById('mv-file-menu-btn');
    if (panel) panel.classList.add('view-hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    state.fileMenuOpen = false;
  }

  function openFileMenu() {
    updateProjectStatus();
    const panel = document.getElementById('mv-file-menu-panel');
    const btn = document.getElementById('mv-file-menu-btn');
    if (panel) panel.classList.remove('view-hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    state.fileMenuOpen = true;
  }

  function toggleFileMenu() {
    if (state.fileMenuOpen) closeFileMenu();
    else openFileMenu();
  }

  function updateProjectStatus() {
    const nameEl = document.getElementById('mv-project-name');
    const pathEl = document.getElementById('mv-project-path');
    const menuPathEl = document.getElementById('mv-file-menu-path');
    const menuPeaklogicEl = document.getElementById('mv-file-menu-peaklogic');
    const menuSessionEl = document.getElementById('mv-file-menu-session');
    const name = displayProjectName();
    const dirtyMark = state.dirty ? ' •' : '';
    const path = projectPathDisplay();
    const sessionPath = state.storage?.activePath || 'data/mv-draw/active.json';
    if (nameEl) {
      nameEl.textContent = `${name}${dirtyMark}`;
      nameEl.title = `Project: ${name}\nFile: ${path}`;
    }
    if (pathEl) {
      pathEl.textContent = path;
      pathEl.title = path;
    }
    if (menuPathEl) menuPathEl.textContent = path;
    if (menuPeaklogicEl) menuPeaklogicEl.textContent = peaklogicProjectLabel();
    if (menuSessionEl) menuSessionEl.textContent = `Session: ${sessionPath}`;
    document.title = `${name}${state.dirty ? ' *' : ''} — MV Draw`;
  }

  function updateProjectTitle() {
    updateProjectStatus();
  }

  function confirmDiscard() {
    if (!state.dirty) return true;
    return window.confirm('Discard unsaved changes?');
  }

  async function loadProject(project, file, options = {}) {
    state.project = project;
    state.activeFile = file || project?.libraryFile || null;
    if (options.localPath) state.localFilePath = options.localPath;
    else if (file || project?.libraryFile) state.localFilePath = null;
    undoStack.length = 0;
    redoStack.length = 0;
    clearConnectState();
    state.selectedId = null;
    state.selectedIds = [];
    state.selectedEdgeId = null;
    state.selectedEdgeVertex = null;
    state.extentsDraft = null;
    state.snapGuides = [];
    state.dragging = null;
    state.calibrate = null;
    await loadBackground();
    fillProjectFields();
    fillInspector();
    updateScaleLabel();
    updateExtentsPanel();
    updateAlignButtons();
    updateGroupButtons();
    updateSnapLabel();
    updateUndoButtons();
    updateProjectStatus();
    state.dirty = false;
    draw();
    requestAnimationFrame(() => {
      if (options.fit !== false) fitViewToContent();
    });
  }

  async function newProject() {
    if (!confirmDiscard()) return;
    closeFileMenu();
    setStatus('Creating project…');
    const data = await api('POST', '/project/new', { name: 'untitled' });
    applyProjectPayload(data);
    await loadProject(data.project, null);
    setStatus('New project');
  }

  function formatSavedAt(iso) {
    if (!iso) return 'Unknown date';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function mvProjectTypeLabel(p) {
    const file = String(p?.file || p?.path || '');
    if (/\.mvbundle$/i.test(file)) return 'mvbundle';
    if (/\.mvdraw\.json$/i.test(file)) return 'mvdraw.json';
    if (/\.json$/i.test(file)) return 'json';
    return 'project';
  }

  function sortMvOpenProjects(items) {
    const { key, dir } = state.openListSort;
    const mul = dir === 'asc' ? 1 : -1;
    const value = (p) => {
      if (key === 'date') return String(p.savedAt || '');
      if (key === 'type') return mvProjectTypeLabel(p);
      return String(p.name || p.file || '').toLowerCase();
    };
    return [...items].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      return String(a.name || a.file || '').localeCompare(String(b.name || b.file || ''));
    });
  }

  function syncMvOpenSortButtons() {
    const { key, dir } = state.openListSort;
    document.querySelectorAll('[data-mv-project-sort]').forEach((btn) => {
      const k = btn.getAttribute('data-mv-project-sort');
      const active = k === key;
      btn.classList.toggle('active', active);
      const label = btn.getAttribute('data-sort-label') || btn.textContent.replace(/\s*[▲▼]\s*$/, '').trim();
      btn.setAttribute('data-sort-label', label);
      btn.textContent = active ? `${label}${dir === 'asc' ? ' ▲' : ' ▼'}` : label;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function paintOpenList() {
    const list = document.getElementById('mv-open-list');
    const empty = document.getElementById('mv-open-empty');
    if (!list) return;
    const projects = sortMvOpenProjects(state.openListProjects);
    syncMvOpenSortButtons();
    list.innerHTML = '';
    if (empty) empty.classList.toggle('view-hidden', projects.length > 0);
    if (!projects.length) return;
    for (const p of projects) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mv-project-item';
      btn.dataset.file = p.file;
      const path = p.path || `data/mv-draw/projects/${p.file}`;
      const type = mvProjectTypeLabel(p);
      btn.innerHTML = `<span class="mv-project-item-name">${p.name || p.file}</span><span class="mv-project-item-path cell-mono">${path}</span><span class="mv-project-item-meta">${type} · ${formatSavedAt(p.savedAt)}</span>`;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        btn.disabled = true;
        openServerProject(p.file).catch((e) => setStatus(e.message, true)).finally(() => {
          btn.disabled = false;
        });
      });
      list.appendChild(btn);
    }
  }

  async function renderOpenList() {
    const list = document.getElementById('mv-open-list');
    const empty = document.getElementById('mv-open-empty');
    if (!list) return;
    list.innerHTML = '<p class="panel-hint mv-open-loading">Loading projects…</p>';
    if (empty) empty.classList.add('view-hidden');
    const data = await api('GET', '/projects');
    state.openListProjects = data.projects || [];
    paintOpenList();
  }

  function showMvOpenOverlay(show) {
    const overlay = document.getElementById('mv-open-overlay');
    const dlg = document.getElementById('mv-open-dialog');
    if (dlg && typeof dlg.showModal === 'function' && typeof dlg.close === 'function') {
      if (show) {
        if (!dlg.open) dlg.showModal();
      } else if (dlg.open) dlg.close();
      return;
    }
    if (!overlay) return;
    overlay.classList.toggle('view-hidden', !show);
    overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  async function showOpenDialog() {
    closeFileMenu();
    showMvOpenOverlay(true);
    try {
      await renderOpenList();
    } catch (e) {
      const list = document.getElementById('mv-open-list');
      if (list) list.innerHTML = '';
      setStatus(e.message, true);
    }
  }

  async function openServerProject(file) {
    if (!confirmDiscard()) return;
    setStatus('Opening…');
    const data = await api('POST', '/project/open', { file });
    showMvOpenOverlay(false);
    applyProjectPayload(data);
    await loadProject(data.project, data.file || file);
    setStatus(`Opened ${data.project?.name || file}`);
  }

  async function openLocalProject(raw, localPath) {
    if (!confirmDiscard()) return;
    setStatus('Opening…');
    const data = await api('POST', '/project/import', raw);
    showMvOpenOverlay(false);
    applyProjectPayload(data);
    await loadProject(data.project, null, { localPath: localPath || null });
    const warn = Array.isArray(data.importWarnings) && data.importWarnings.length
      ? ` (${data.importWarnings.length} note(s))`
      : '';
    setStatus(`Opened ${data.project?.name || 'project'}${warn}`);
  }

  async function exportPackage() {
    closeFileMenu();
    readProjectFields();
    await saveProject().catch(() => {});
    setStatus('Exporting package…');
    const res = await fetch(`${API}/project/bundle`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText || 'Export failed');
    }
    const blob = await res.blob();
    const base = String(displayProjectName() || 'layout').trim().replace(/[^\w.-]+/g, '_') || 'layout';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.mvbundle`;
    a.click();
    URL.revokeObjectURL(a.href);
    state.localFilePath = `${base}.mvbundle`;
    updateProjectStatus();
    setStatus(`Exported ${base}.mvbundle`);
  }

  function showSaveAsDialog() {
    closeFileMenu();
    const inp = document.getElementById('mv-save-as-name');
    const fileBase = nameFromLibraryFile(state.project?.libraryFile || state.activeFile);
    if (inp) inp.value = fileBase || 'untitled';
    document.getElementById('mv-save-as-dialog')?.showModal();
    inp?.focus();
    inp?.select();
  }

  async function saveProjectAs(name) {
    readProjectFields();
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('File name is required');
    setStatus('Saving…');
    const data = await api('POST', '/project/save-as', { file: trimmed, project: state.project });
    applyProjectPayload(data);
    state.localFilePath = null;
    state.dirty = false;
    updateProjectStatus();
    document.getElementById('mv-save-as-dialog')?.close();
    const savedFile = data.file || `${trimmed.replace(/[^\w.-]+/g, '_')}.mvdraw.json`;
    setStatus(`Saved to ${savedFile}`);
  }

  async function fetchPeaklogicContext() {
    const data = await api('GET', '/project/context');
    state.peaklogicContext = data.context || null;
    if (data.context?.estPath) state.estProjectPath = data.context.estPath;
    if (data.storage) state.storage = data.storage;
    fillProjectFields();
    updateProjectStatus();
    syncComposerModeButtons(state.peaklogicContext?.composer?.composerMode || 'plan');
    return data.context;
  }

  async function saveToPeaklogicProject() {
    closeFileMenu();
    readProjectFields();
    const peaklogicName = String(state.peaklogicContext?.projectName || '').trim() || 'PeakLogic project';
    const linkComposer = window.confirm(
      `Save site plan to PeakLogic project "${peaklogicName}"?\n\n`
      + 'This aligns the layout name with the PeakLogic project, embeds it in the .est snapshot, and links the HMI composer (Plan mode).',
    );
    if (!linkComposer) return;
    setStatus('Saving to PeakLogic project…');
    const data = await api('POST', '/project/save-to-project', {
      project: state.project,
      linkComposer: true,
      setComposerMode: true,
    });
    applyProjectPayload(data);
    if (data.context) state.peaklogicContext = data.context;
    if (data.estPath) state.estProjectPath = data.estPath;
    state.localFilePath = null;
    state.dirty = false;
    updateProjectStatus();
    const composerNote = data.composerMode === 'plan'
      ? ' HMI composer set to Plan mode.'
      : '';
    setStatus(`Saved to ${data.estPath || peaklogicName}.${composerNote}`);
  }

  function formatCompileSummary(data) {
    const lines = [];
    const screenLabel = data.screen?.name || data.screen?.id || 'screen_mvdraw_mcc';
    lines.push(`Screen: ${screenLabel}`);
    lines.push(`Tiles: ${data.stats?.tileCount ?? 0}, bindings: ${data.stats?.bindingCount ?? 0}`);
    for (const s of data.summaries || []) {
      if (s.recipe === 'duplex_mcc') {
        lines.push(`• ${s.nodeType}: ${s.motor1}, ${s.motor2}${s.levelTag ? `, level ${s.levelTag}` : ''}`);
      } else if (s.recipe === 'simplex_motor') {
        lines.push(`• ${s.nodeType}: motor ${s.prefix}`);
      }
    }
    if (data.warnings?.length) {
      lines.push('');
      lines.push('Warnings:');
      for (const w of data.warnings) lines.push(`• ${w}`);
    }
    return lines.join('\n');
  }

  async function compileHmiFromPlan() {
    closeFileMenu();
    readProjectFields();
    setStatus('Analyzing site plan for HMI compile…');
    let preview;
    try {
      preview = await api('POST', '/compile-hmi', { project: state.project });
    } catch (e) {
      setStatus(e.message, true);
      return;
    }
    if (!preview.stats?.nodesCompiled) {
      setStatus('No symbols with SCADA meta (device ID, alarm tag, level tag) found.', true);
      return;
    }
    const apply = window.confirm(
      `Compile HMI faceplates from this site plan?\n\n${formatCompileSummary(preview)}\n\n`
      + 'Apply will merge the screen into PeakLogic settings (Composer grid).',
    );
    if (!apply) {
      setStatus('Compile preview — not applied.');
      return;
    }
    setStatus('Applying HMI compile…');
    try {
      const data = await api('POST', '/compile-hmi', {
        project: state.project,
        apply: true,
        screenId: preview.screen?.id,
        screenName: preview.screen?.name,
      });
      setStatus(
        `HMI screen "${data.screen?.name || data.screen?.id}" applied `
        + `(${data.stats?.bindingCount ?? 0} bindings). Open Composer (Grid) to review.`,
      );
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  async function loadFromPeaklogicProject() {
    closeFileMenu();
    if (!confirmDiscard()) return;
    setStatus('Loading from PeakLogic project…');
    const data = await api('POST', '/project/load-from-project');
    showMvOpenOverlay(false);
    applyProjectPayload(data);
    if (data.context) state.peaklogicContext = data.context;
    if (data.estPath) state.estProjectPath = data.estPath;
    await loadProject(data.project, data.file || data.project?.libraryFile);
    setStatus(`Loaded from ${data.estPath || state.peaklogicContext?.projectName || 'project'}`);
  }

  async function maybeAutoLoadFromPeaklogicProject(context) {
    if (!context?.hasProjectMvDraw) return false;
    const nodes = state.project?.nodes || [];
    const isBlank = nodes.length === 0 && !state.project?.background && !state.project?.scale;
    const isUntitled = !String(state.project?.name || '').trim()
      || String(state.project?.name || '').trim().toLowerCase() === 'untitled';
    if (!isBlank || !isUntitled || context.synced) return false;
    await loadFromPeaklogicProject();
    return true;
  }

  function updateCanvasCursor() {
    if (!canvas) return;
    if (state.panDrag || state.spacePan) {
      canvas.style.cursor = 'grab';
      return;
    }
    if (state.tool === 'calibrate' || state.tool === 'extents') {
      canvas.style.cursor = 'crosshair';
    } else if (state.tool === 'connect') {
      canvas.style.cursor = 'pointer';
    } else if (state.rotating) {
      canvas.style.cursor = 'grabbing';
    } else if (state.tool === 'rotate') {
      canvas.style.cursor = 'grab';
    } else if (state.tool === 'stretch') {
      canvas.style.cursor = state.stretching ? 'grabbing' : 'nwse-resize';
    } else if (state.edgeDrag) {
      canvas.style.cursor = 'grabbing';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  function setTool(tool) {
    state.tool = tool;
    clearConnectState();
    state.marquee = null;
    state.extentsDraft = null;
    state.rotating = null;
    state.rotateUndoPushed = false;
    state.stretching = null;
    state.stretchUndoPushed = false;
    document.querySelectorAll('.mv-tool').forEach((b) => {
      const on = b.dataset.tool === tool;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    updateLinePaletteUi();
    if (tool !== 'place') state.placeType = null;
    updateCanvasCursor();
    if (tool === 'connect') {
      setStatus(`Connect — pick line type, then ports (${lineKindLabel(state.connectLineKind || 'src')})`);
    } else if (tool === 'rotate') {
      setStatus('Rotate — drag symbol or yellow handle; Shift snaps to 15°');
    } else if (tool === 'stretch') {
      setStatus('Stretch — drag cyan handles to resize; Shift keeps aspect ratio');
    }
  }

  function applyCalibrateScale() {
    const c = state.calibrate;
    if (!c?.p1 || !c?.p2) return;
    const dist = +document.getElementById('mv-calibrate-dist').value;
    const units = document.getElementById('mv-calibrate-units').value;
    const s1 = worldToScreen(c.p1[0], c.p1[1]);
    const s2 = worldToScreen(c.p2[0], c.p2[1]);
    const pixelDist = Math.hypot(s2.x - s1.x, s2.y - s1.y);
    if (!Number.isFinite(dist) || dist <= 0 || pixelDist <= 0) return;
    pushUndo();
    state.project.units = units;
    state.project.scale = {
      method: 'twoPoint',
      pixelsPerUnit: pixelDist / dist,
      unitLabel: units,
      p1: c.p1,
      p2: c.p2,
      distance: dist,
    };
    state.calibrate = null;
    document.getElementById('mv-calibrate-dialog').close();
    updateScaleLabel();
    markDirty();
    setStatus(`Scale set: ${state.project.scale.pixelsPerUnit.toFixed(2)} px/${units}`);
  }

  function onCanvasClick(ev) {
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (state.tool === 'calibrate') {
      if (!state.calibrate) state.calibrate = { p1: null, p2: null };
      if (!state.calibrate.p1) {
        state.calibrate.p1 = [w.x, w.y];
        document.getElementById('mv-calibrate-step').textContent = 'Step 2: click second point';
      } else if (!state.calibrate.p2) {
        state.calibrate.p2 = [w.x, w.y];
        document.getElementById('mv-calibrate-apply').disabled = false;
        document.getElementById('mv-calibrate-step').textContent = 'Enter known distance and Apply';
        document.getElementById('mv-calibrate-dialog').showModal();
      }
      markDirty();
      return;
    }

    if (state.tool === 'extents') {
      if (!state.extentsDraft) state.extentsDraft = { p1: null };
      if (!state.extentsDraft.p1) {
        state.extentsDraft.p1 = [w.x, w.y];
        setStatus('Extents: click opposite corner');
        markDirty();
      } else {
        const label = document.getElementById('mv-extents-label-inp')?.value.trim() || 'Site extents';
        const ext = extentsFromCorners(state.extentsDraft.p1, [w.x, w.y], label);
        if (!ext) {
          setStatus('Extents too small — try again', true);
          state.extentsDraft = null;
          markDirty();
          return;
        }
        pushUndo();
        state.project.extents = ext;
        state.extentsDraft = null;
        updateExtentsPanel();
        markDirty();
        setStatus(`Extents set: ${formatExtentsSize(ext)}`);
      }
      return;
    }

    if (state.tool === 'connect') {
      const port = hitTestPort(w.x, w.y);
      if (port) {
        if (!state.connectFrom) {
          state.connectFrom = port.handle;
          state.connectVerts = [];
          state.pointerWorld = { x: w.x, y: w.y };
          setStatus(`Connect from ${port.handle} — ${connectStatusHint()}`);
          markDirty();
        } else if (state.connectFrom !== port.handle) {
          pushUndo();
          const verts = state.connectVerts.map(([x, y]) => [x, y]);
          const edgeKind = state.connectLineKind || 'src';
          state.project.edges.push({
            id: nextId('edge', state.project.edges),
            from: state.connectFrom,
            to: port.handle,
            kind: edgeKind,
            points: verts,
          });
          clearConnectState();
          markDirty();
          setStatus(verts.length
            ? `Polyline connection added (${verts.length} bend${verts.length === 1 ? '' : 's'})`
            : 'Connection added');
        }
        return;
      }
      if (state.connectFrom) {
        let vx = w.x;
        let vy = w.y;
        const snapped = applySnapPoint(vx, vy, new Set(), true, { altKey: ev?.altKey });
        vx = snapped.x;
        vy = snapped.y;
        state.snapGuides = snapped.guides || [];
        state.connectVerts.push([vx, vy]);
        state.pointerWorld = { x: vx, y: vy };
        markDirty();
        setStatus(`Connect — ${connectStatusHint()}`);
        updateSnapLabel();
      }
      return;
    }

    if (state.tool === 'place' && state.placeType) {
      pushUndo();
      const preview = { type: state.placeType, x: w.x, y: w.y };
      const snapped = applySnap(preview, w.x, w.y, new Set(), { altKey: ev?.altKey });
      state.snapGuides = snapped.guides || [];
      state.project.nodes.push({
        id: nextId('node', state.project.nodes),
        type: state.placeType,
        x: snapped.x,
        y: snapped.y,
        rotation: 0,
        label: '',
      });
      setSelection([state.project.nodes[state.project.nodes.length - 1].id], state.project.nodes[state.project.nodes.length - 1].id);
      updateSnapLabel();
      markDirty();
      return;
    }

    if (state.tool === 'select') return;
    if (state.tool === 'rotate') return;
    if (state.tool === 'stretch') return;
  }

  function onCanvasMouseDown(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (ev.button === 1 || (ev.button === 0 && state.spacePan)) {
      ev.preventDefault();
      state.panDrag = { sx, sy, panX: state.pan.x, panY: state.pan.y };
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (state.tool === 'rotate') {
      const handleNode = hitTestRotationHandle(w.x, w.y);
      const node = handleNode || hitTestNode(w.x, w.y);
      if (!node) {
        state.marquee = { p1: [w.x, w.y], p2: [w.x, w.y], shift: !!ev.shiftKey };
        markDirty();
        return;
      }
      beginRotateDrag(node, w, ev);
      return;
    }

    if (state.tool === 'stretch') {
      const handleHit = hitTestStretchHandle(w.x, w.y);
      const node = handleHit?.node || hitTestNode(w.x, w.y);
      if (!node) {
        setSelection([], null);
        markDirty();
        return;
      }
      if (handleHit) {
        beginStretchDrag(node, handleHit.handle, w);
        return;
      }
      setSelection([node.id], node.id);
      markDirty();
      return;
    }

    if (state.tool !== 'select') return;

    const edge = hitTestEdge(w.x, w.y);
    if (edge) {
      setEdgeSelection(edge.id, null);
      const handleHit = hitTestEdgeHandles(w.x, w.y);
      if (handleHit) {
        pushUndo();
        state.edgeDragUndoPushed = true;
        if (handleHit.kind === 'midpoint') {
          const snapped = applySnapPoint(handleHit.x, handleHit.y, new Set(), true, { altKey: ev.altKey });
          const pts = ensureEdgePoints(edge);
          pts.splice(handleHit.segmentIndex, 0, [snapped.x, snapped.y]);
          state.edgeDrag = {
            edgeId: handleHit.edgeId,
            vertexIndex: handleHit.segmentIndex,
            start: [snapped.x, snapped.y],
          };
          setStatus('Drag bend handle — snaps to grid when enabled');
        } else {
          state.edgeDrag = {
            edgeId: handleHit.edgeId,
            vertexIndex: handleHit.vertexIndex,
            start: [...edge.points[handleHit.vertexIndex]],
          };
        }
        state.suppressClick = true;
        return;
      }
      state.suppressClick = true;
      setStatus('Connection selected — drag yellow/silver handles, or double-click line to add bend');
      return;
    }

    const node = hitTestNode(w.x, w.y);
    if (!node) {
      state.marquee = { p1: [w.x, w.y], p2: [w.x, w.y], shift: !!ev.shiftKey };
      markDirty();
      return;
    }
    const groupIds = expandWithGroups([node.id]);
    if (!ev.shiftKey) {
      if (!state.selectedIds.includes(node.id)) setSelection(groupIds, node.id);
    } else {
      toggleSelectionIds([node.id], node.id);
    }
    if (!state.selectedIds.includes(node.id)) return;
    const movingIds = expandWithGroups([...state.selectedIds]);
    const startPositions = new Map();
    for (const id of movingIds) {
      const n = state.project.nodes.find((x) => x.id === id);
      if (n) startPositions.set(id, { x: n.x, y: n.y });
    }
    pushUndo();
    state.dragUndoPushed = true;
    state.selectedId = node.id;
    state.dragging = {
      id: node.id,
      ox: w.x - node.x,
      oy: w.y - node.y,
      movingIds,
      startPositions,
      startAnchor: { x: node.x, y: node.y },
      startX: node.x,
      startY: node.y,
    };
    fillInspector();
  }

  function onCanvasMouseMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const units = state.project?.units || 'ft';
    cursorLabel.textContent = `${w.x.toFixed(1)}, ${w.y.toFixed(1)} ${units}`;

    if (state.panDrag) {
      const dx = sx - state.panDrag.sx;
      const dy = sy - state.panDrag.sy;
      state.pan.x = state.panDrag.panX + dx;
      state.pan.y = state.panDrag.panY + dy;
      markDirty();
      return;
    }

    const previewChanged = (state.connectFrom || state.extentsDraft?.p1)
      && (!state.pointerWorld || state.pointerWorld.x !== w.x || state.pointerWorld.y !== w.y);

    const snapOpts = { altKey: ev.altKey };

    if (state.connectFrom) {
      const snapped = applySnapPoint(w.x, w.y, new Set(), true, snapOpts);
      state.pointerWorld = { x: snapped.x, y: snapped.y };
      state.snapGuides = snapped.guides || [];
      updateSnapLabel();
    } else {
      state.pointerWorld = { x: w.x, y: w.y };
    }

    if (state.rotating) {
      applyRotateDrag(w, !!ev.shiftKey);
      return;
    }

    if (state.stretching) {
      applyStretchDrag(w, !!ev.shiftKey);
      return;
    }

    if (state.edgeDrag) {
      const edge = state.project.edges.find((e) => e.id === state.edgeDrag.edgeId);
      if (edge) {
        const snapped = applySnapPoint(w.x, w.y, new Set(), true, snapOpts);
        const pts = ensureEdgePoints(edge);
        if (pts[state.edgeDrag.vertexIndex]) {
          pts[state.edgeDrag.vertexIndex] = [snapped.x, snapped.y];
        }
        state.snapGuides = snapped.guides || [];
        updateSnapLabel();
        markDirty();
      }
    } else if (state.dragging) {
      const anchor = state.project.nodes.find((n) => n.id === state.dragging.id);
      if (anchor) {
        let nx = w.x - state.dragging.ox;
        let ny = w.y - state.dragging.oy;
        const exclude = new Set(state.dragging.movingIds || [anchor.id]);
        const snapped = applySnap(anchor, nx, ny, exclude, snapOpts);
        nx = snapped.x;
        ny = snapped.y;
        state.snapGuides = snapped.guides || [];
        const ddx = nx - state.dragging.startAnchor.x;
        const ddy = ny - state.dragging.startAnchor.y;
        for (const id of state.dragging.movingIds || [anchor.id]) {
          const n = state.project.nodes.find((x) => x.id === id);
          const sp = state.dragging.startPositions?.get(id);
          if (n && sp) {
            n.x = sp.x + ddx;
            n.y = sp.y + ddy;
          }
        }
        fillInspector();
        updateSnapLabel();
        markDirty();
      }
    } else if (state.marquee) {
      state.marquee.p2 = [w.x, w.y];
      markDirty();
    } else if (previewChanged || state.edgeDrag) {
      draw();
    }
  }

  function onCanvasDblClick(ev) {
    if (state.tool !== 'select') return;
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
    const edge = hitTestEdge(w.x, w.y);
    if (!edge) return;
    ev.preventDefault();
    const ins = nearestSegmentOnPath(edgePoints(edge), w.x, w.y);
    if (!ins || ins.dist > edgeHitTolerance() * 1.5) return;
    pushUndo();
    const snapped = applySnapPoint(ins.point[0], ins.point[1], new Set(), true);
    const pts = ensureEdgePoints(edge);
    pts.splice(ins.segmentIndex, 0, [snapped.x, snapped.y]);
    setEdgeSelection(edge.id, ins.segmentIndex);
    markDirty();
    setStatus('Bend added — drag handle to adjust');
  }

  function onCanvasMouseUp(ev) {
    if (state.panDrag) {
      state.panDrag = null;
      updateCanvasCursor();
      markDirty();
      return;
    }
    if (state.rotating) {
      endRotateDrag();
      return;
    }
    if (state.stretching) {
      endStretchDrag();
      return;
    }
    if (state.edgeDrag && state.edgeDragUndoPushed) {
      const edge = state.project.edges.find((e) => e.id === state.edgeDrag.edgeId);
      const start = state.edgeDrag.start;
      const cur = edge?.points?.[state.edgeDrag.vertexIndex];
      const moved = cur && (cur[0] !== start[0] || cur[1] !== start[1]);
      if (!moved) {
        undoStack.pop();
        updateUndoButtons();
      } else {
        state.suppressClick = true;
      }
      state.edgeDrag = null;
      state.edgeDragUndoPushed = false;
      state.snapGuides = [];
      updateSnapLabel();
      markDirty();
      return;
    }
    if (state.marquee) {
      const r = marqueeWorldRect(state.marquee);
      const dx = Math.abs(r.maxX - r.minX);
      const dy = Math.abs(r.maxY - r.minY);
      const shift = !!state.marquee.shift;
      state.marquee = null;
      if (dx > 0.35 || dy > 0.35) {
        const hits = groupApi
          ? groupApi.nodesInWorldRect(state.project?.nodes || [], r, sym, 'intersect')
          : [];
        const ids = hits.map((n) => n.id);
        if (shift) {
          const cur = new Set(state.selectedIds);
          const allIn = ids.length > 0 && ids.every((id) => cur.has(id));
          if (allIn) ids.forEach((id) => cur.delete(id));
          else ids.forEach((id) => cur.add(id));
          setSelection([...cur], ids[ids.length - 1] || state.selectedId);
        } else {
          setSelection(ids, ids[ids.length - 1] || null);
        }
        setStatus(ids.length ? `${ids.length} selected` : 'No symbols in area');
        state.suppressClick = true;
      } else if (!shift) {
        setSelection([], null);
        setEdgeSelection(null);
        state.suppressClick = true;
      }
      markDirty();
      return;
    }
    if (state.dragging && state.dragUndoPushed) {
      let moved = false;
      for (const id of state.dragging.movingIds || [state.dragging.id]) {
        const node = state.project.nodes.find((n) => n.id === id);
        const start = state.dragging.startPositions?.get(id);
        if (node && start && (node.x !== start.x || node.y !== start.y)) moved = true;
      }
      if (!moved) {
        undoStack.pop();
        updateUndoButtons();
      } else {
        state.suppressClick = true;
      }
    }
    state.dragging = null;
    state.dragUndoPushed = false;
    state.snapGuides = [];
    updateSnapLabel();
    markDirty();
  }

  function onCanvasMouseLeave() {
    onCanvasMouseUp();
  }

  function onKeyDown(ev) {
    const tag = ev.target?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable;
    if (ev.key === 'F1') {
      ev.preventDefault();
      openHelp();
      return;
    }
    if (typing) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key === 's' && !ev.shiftKey) {
      ev.preventDefault();
      saveProject().catch((e) => setStatus(e.message, true));
      return;
    }
    if (mod && ev.key === 's' && ev.shiftKey) {
      ev.preventDefault();
      showSaveAsDialog();
      return;
    }
    if (mod && ev.key === 'o') {
      ev.preventDefault();
      showOpenDialog().catch((e) => setStatus(e.message, true));
      return;
    }
    if (mod && ev.key === 'z' && !ev.shiftKey) {
      ev.preventDefault();
      undo();
      return;
    }
    if (mod && (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey))) {
      ev.preventDefault();
      redo();
      return;
    }
    if (mod && ev.key === 'g' && !ev.shiftKey) {
      ev.preventDefault();
      groupSelection();
      return;
    }
    if (mod && ev.key === 'g' && ev.shiftKey) {
      ev.preventDefault();
      ungroupSelection();
      return;
    }
    if (!state.connectFrom && ev.key === 'Delete' && getSelectedNodes().length) {
      ev.preventDefault();
      deleteSelectedNodes();
      return;
    }
    if (state.selectedEdgeId && !state.connectFrom && (ev.key === 'Delete' || ev.key === 'Backspace')) {
      const edge = state.project.edges.find((e) => e.id === state.selectedEdgeId);
      if (edge) {
        ev.preventDefault();
        const pts = ensureEdgePoints(edge);
        if (ev.key === 'Backspace' && state.selectedEdgeVertex != null && pts.length) {
          pushUndo();
          pts.splice(state.selectedEdgeVertex, 1);
          state.selectedEdgeVertex = null;
          markDirty();
          setStatus('Bend removed');
          return;
        }
        if (ev.key === 'Backspace' && pts.length) {
          pushUndo();
          pts.pop();
          state.selectedEdgeVertex = null;
          markDirty();
          setStatus('Last bend removed');
          return;
        }
        pushUndo();
        state.project.edges = state.project.edges.filter((e) => e.id !== state.selectedEdgeId);
        setEdgeSelection(null);
        markDirty();
        setStatus('Connection deleted');
        return;
      }
    }
    if (ev.key === 'Backspace' && state.connectFrom && state.connectVerts.length) {
      ev.preventDefault();
      state.connectVerts.pop();
      const last = state.connectVerts[state.connectVerts.length - 1];
      const from = resolveConnectHandle(state.connectFrom);
      if (last) state.pointerWorld = { x: last[0], y: last[1] };
      else if (from) state.pointerWorld = { x: from.x, y: from.y };
      markDirty();
      setStatus(state.connectVerts.length
        ? `Connect — ${connectStatusHint()}`
        : `Connect from ${state.connectFrom} — ${connectStatusHint()}`);
      return;
    }
    if (ev.key === 'Home') {
      ev.preventDefault();
      zoomExtents();
      return;
    }
    const step = nudgeStep(ev.shiftKey);
    const nudge = arrowNudgeDelta(ev.key, step)
      || (getSelectedNodes().length ? letterNudgeDelta(ev.key, step) : null);
    if (nudge && !state.connectFrom && !state.selectedEdgeId && getSelectedNodes().length) {
      ev.preventDefault();
      nudgeSelectedNodes(nudge[0], nudge[1]);
      return;
    }
    if (!mod && (ev.key === 'r' || ev.key === 'R')) {
      setTool('rotate');
      return;
    }
    if (!mod && (ev.key === 'x' || ev.key === 'X')) {
      setTool('stretch');
      return;
    }
    if (!mod && (ev.key === 's' || ev.key === 'S')) {
      ev.preventDefault();
      toggleSnap();
      return;
    }
    if (!mod && (ev.key === 'v' || ev.key === 'V')) {
      setTool('select');
      return;
    }
    if (ev.code === 'Space' && !state.spacePan) {
      state.spacePan = true;
      updateCanvasCursor();
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
      if (state.fileMenuOpen) {
        closeFileMenu();
        return;
      }
      if (state.connectFrom) {
        clearConnectState();
        markDirty();
        setStatus('Connect cancelled');
      } else if (state.marquee) {
        state.marquee = null;
        markDirty();
      } else if (state.extentsDraft) {
        state.extentsDraft = null;
        markDirty();
        setStatus('Extents cancelled');
      } else if (state.rotating) {
        endRotateDrag();
        setStatus('Rotate cancelled');
      } else if (state.stretching) {
        endStretchDrag();
        setStatus('Stretch cancelled');
      } else if (state.selectedEdgeId) {
        setEdgeSelection(null);
        setStatus('Selection cleared');
      }
    }
  }

  function onKeyUp(ev) {
    if (ev.code === 'Space') {
      state.spacePan = false;
      if (state.panDrag) {
        state.panDrag = null;
        updateCanvasCursor();
      }
    }
  }

  function onWheel(ev) {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;

    if (ev.shiftKey) {
      state.pan.x -= ev.deltaX * 0.85;
      state.pan.y -= ev.deltaY * 0.85;
      markDirty();
      return;
    }

    const before = screenToWorld(sx, sy);
    const factor = ev.deltaY < 0 ? 1.1 : 0.9;
    state.zoom = Math.max(0.2, Math.min(6, state.zoom * factor));
    const after = screenToWorld(sx, sy);
    state.pan.x += (after.x - before.x) * ppu() * state.zoom;
    state.pan.y -= (after.y - before.y) * ppu() * state.zoom;
    markDirty();
  }

  function openHelp() {
    closeFileMenu();
    window.MvDrawHelp?.open();
  }

  function deleteSelectedEdge() {
    if (!state.selectedEdgeId) return false;
    pushUndo();
    state.project.edges = state.project.edges.filter((e) => e.id !== state.selectedEdgeId);
    setEdgeSelection(null);
    markDirty();
    setStatus('Connection deleted');
    return true;
  }

  function deleteSelectedNodes() {
    const ids = new Set(getSelectedNodes().map((n) => n.id));
    if (!ids.size && state.selectedId) ids.add(state.selectedId);
    if (!ids.size) return false;
    pushUndo();
    state.project.nodes = state.project.nodes.filter((n) => !ids.has(n.id));
    state.project.edges = state.project.edges.filter(
      (e) => ![...ids].some((id) => e.from.startsWith(`${id}:`) || e.to.startsWith(`${id}:`)),
    );
    pruneGroupsAfterNodeDelete([...ids]);
    setSelection([], null);
    markDirty();
    setStatus(`${ids.size} symbol${ids.size === 1 ? '' : 's'} deleted`);
    return true;
  }

  function deleteSelectedObjects() {
    if (state.selectedEdgeId) return deleteSelectedEdge();
    return deleteSelectedNodes();
  }

  function nudgeStep(shiftKey) {
    const base = state.snapEnabled && state.snapGrid ? state.snapGridStep : 1;
    return shiftKey ? base * 5 : base;
  }

  function nudgeSelectedNodes(dx, dy) {
    const ids = expandWithGroups(getSelectedNodes().map((n) => n.id));
    if (!ids.length) return false;
    const anchor = state.project.nodes.find((n) => n.id === (state.selectedId || ids[0]));
    if (!anchor) return false;
    pushUndo();
    const exclude = new Set(ids);
    const snapped = applySnap(anchor, anchor.x + dx, anchor.y + dy, exclude);
    const ddx = snapped.x - anchor.x;
    const ddy = snapped.y - anchor.y;
    if (Math.abs(ddx) < 1e-9 && Math.abs(ddy) < 1e-9) {
      undoStack.pop();
      updateUndoButtons();
      return false;
    }
    for (const id of ids) {
      const n = state.project.nodes.find((x) => x.id === id);
      if (n) {
        n.x += ddx;
        n.y += ddy;
      }
    }
    state.snapGuides = snapped.guides || [];
    fillInspector();
    updateSnapLabel();
    markDirty();
    const units = state.project?.units || 'ft';
    setStatus(`Moved ${ids.length} symbol${ids.length === 1 ? '' : 's'} (${ddx.toFixed(2)}, ${ddy.toFixed(2)} ${units})`);
    return true;
  }

  function arrowNudgeDelta(key, step) {
    switch (key) {
      case 'ArrowUp': return [0, step];
      case 'ArrowDown': return [0, -step];
      case 'ArrowLeft': return [-step, 0];
      case 'ArrowRight': return [step, 0];
      default: return null;
    }
  }

  function letterNudgeDelta(key, step) {
    switch (String(key || '').toLowerCase()) {
      case 'u': return [0, step];
      case 'd': return [0, -step];
      case 'l': return [-step, 0];
      case 'r': return [step, 0];
      default: return null;
    }
  }

  function updateDeleteButton() {
    const btn = document.getElementById('mv-btn-delete');
    if (!btn) return;
    const nodeCount = getSelectedNodes().length;
    const count = nodeCount + (state.selectedEdgeId ? 1 : 0);
    btn.disabled = count === 0;
    if (state.selectedEdgeId) {
      btn.title = 'Delete selected connection (Delete)';
    } else if (nodeCount > 1) {
      btn.title = `Delete ${nodeCount} symbols (Delete)`;
    } else if (nodeCount === 1) {
      btn.title = 'Delete selected symbol (Delete)';
    } else {
      btn.title = 'Delete selected object (Delete)';
    }
  }

  function isMvDrawEmbedded() {
    return document.body.classList.contains('mv-draw-embedded')
      || new URLSearchParams(window.location.search).get('embedded') === '1';
  }

  /** Prefer history.back() when opened from the dashboard — avoids a full reload and blank HMI. */
  function returnToDashboard(ev) {
    if (ev) ev.preventDefault();
    if (!confirmDiscard()) return;
    try {
      const ref = document.referrer;
      if (ref) {
        const refUrl = new URL(ref, window.location.origin);
        if (refUrl.origin === window.location.origin && (refUrl.pathname === '/' || refUrl.pathname === '')) {
          window.history.back();
          return;
        }
      }
    } catch {
      /* fall through */
    }
    window.location.href = '/';
  }

  function normalizeComposerModeUi(mode) {
    const v = String(mode ?? '').trim().toLowerCase();
    if (v === '3d') return '3d';
    if (v === 'plan') return 'plan';
    return 'grid';
  }

  function syncComposerModeButtons(mode) {
    const m = normalizeComposerModeUi(mode ?? 'plan');
    document.querySelectorAll('.mv-composer-mode-btn').forEach((btn) => {
      const on = btn.dataset.composerMode === m;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function requestComposerMode(mode) {
    const m = normalizeComposerModeUi(mode);
    if (m === 'plan') {
      syncComposerModeButtons('plan');
      setStatus('Site plan view — edit symbols and pipes on the canvas');
      if (isMvDrawEmbedded() && window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'mv-composer-mode', mode: 'plan' }, window.location.origin);
        } catch { /* ignore */ }
      }
      return;
    }
    if (isMvDrawEmbedded() && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'mv-composer-mode', mode: m }, window.location.origin);
        syncComposerModeButtons(m);
        setStatus(m === 'grid'
          ? 'Opening HMI Composer 2D grid…'
          : 'Opening HMI Composer 3D preview…');
      } catch (e) {
        setStatus(e.message || 'Could not open composer', true);
      }
      return;
    }
    window.location.href = `/?composerOpen=${encodeURIComponent(m)}`;
  }

  function bindComposerModeUi() {
    syncComposerModeButtons(
      state.peaklogicContext?.composer?.composerMode || 'plan',
    );
    document.querySelectorAll('.mv-composer-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        requestComposerMode(btn.dataset.composerMode);
      });
    });
    document.getElementById('mv-library-search')?.addEventListener('input', (ev) => {
      state.librarySearch = ev.target.value || '';
      renderSymbolLibrary();
    });
  }

  function bindUi() {
    restoreExportOrientation();
    bindComposerModeUi();
    document.querySelectorAll('.page-close, .standalone-home-link').forEach((el) => {
      el.addEventListener('click', returnToDashboard);
    });
    const snapCb = document.getElementById('mv-snap-enabled');
    if (snapCb) snapCb.checked = state.snapEnabled;
    updateSnapLabel();
    setTool(state.tool || 'select');
    document.querySelectorAll('.mv-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTool(btn.dataset.tool);
        if (btn.dataset.tool === 'calibrate') {
          state.calibrate = { p1: null, p2: null };
          document.getElementById('mv-calibrate-step').textContent = 'Step 1: click first point on canvas';
          document.getElementById('mv-calibrate-apply').disabled = true;
        }
      });
    });

    document.querySelectorAll('.mv-line-kind').forEach((btn) => {
      btn.addEventListener('click', () => {
        setConnectLineKind(btn.dataset.lineKind);
      });
    });

    document.getElementById('mv-edge-insp-kind')?.addEventListener('change', (ev) => {
      const edge = (state.project?.edges || []).find((e) => e.id === state.selectedEdgeId);
      if (!edge) return;
      pushUndo();
      edge.kind = ev.target.value || 'src';
      markDirty();
      fillInspector();
    });

    document.getElementById('mv-btn-save')?.addEventListener('click', () => saveProject().catch((e) => setStatus(e.message, true)));
    document.getElementById('mv-file-menu-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleFileMenu();
    });
    document.addEventListener('click', (ev) => {
      const wrap = document.querySelector('.mv-file-menu-wrap');
      if (!state.fileMenuOpen || !wrap || wrap.contains(ev.target)) return;
      closeFileMenu();
    });
    document.getElementById('mv-menu-new')?.addEventListener('click', () => {
      newProject().catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-menu-open')?.addEventListener('click', () => {
      showOpenDialog().catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-menu-save')?.addEventListener('click', () => {
      saveProject().catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-menu-save-as')?.addEventListener('click', () => showSaveAsDialog());
    document.getElementById('mv-menu-export-package')?.addEventListener('click', () => {
      exportPackage().catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-menu-save-to-project')?.addEventListener('click', () => {
      saveToPeaklogicProject().catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-menu-compile-hmi')?.addEventListener('click', () => {
      compileHmiFromPlan().catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-menu-load-from-project')?.addEventListener('click', () => {
      loadFromPeaklogicProject().catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-menu-help')?.addEventListener('click', () => openHelp());
    document.getElementById('mv-btn-help')?.addEventListener('click', () => openHelp());
    document.getElementById('mv-help-close')?.addEventListener('click', () => {
      window.MvDrawHelp?.close();
    });
    document.getElementById('mv-open-cancel')?.addEventListener('click', () => {
      showMvOpenOverlay(false);
    });
    document.querySelectorAll('[data-mv-project-sort]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const key = btn.getAttribute('data-mv-project-sort');
        if (!key) return;
        if (state.openListSort.key === key) {
          state.openListSort.dir = state.openListSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.openListSort.key = key;
          state.openListSort.dir = key === 'date' ? 'desc' : 'asc';
        }
        paintOpenList();
      });
    });
    document.getElementById('mv-open-browse')?.addEventListener('click', () => {
      document.getElementById('mv-open-file')?.click();
    });
    document.getElementById('mv-open-file')?.addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        await openLocalProject(raw, file.name);
      } catch (e) {
        setStatus(e.message, true);
      }
    });
    document.getElementById('mv-save-as-cancel')?.addEventListener('click', () => {
      document.getElementById('mv-save-as-dialog')?.close();
    });
    document.getElementById('mv-save-as-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = document.getElementById('mv-save-as-name')?.value;
      saveProjectAs(name).catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-btn-undo')?.addEventListener('click', () => undo());
    document.getElementById('mv-btn-redo')?.addEventListener('click', () => redo());
    document.getElementById('mv-btn-delete')?.addEventListener('click', () => deleteSelectedObjects());
    document.getElementById('mv-btn-zoom-extents')?.addEventListener('click', () => zoomExtents());
    document.getElementById('mv-btn-clear-extents')?.addEventListener('click', () => {
      if (!state.project?.extents) return;
      pushUndo();
      state.project.extents = null;
      updateExtentsPanel();
      markDirty();
      setStatus('Extents cleared');
    });
    document.querySelectorAll('.mv-sheet-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.sheet) return;
        applySheetWorkspace(btn.dataset.sheet);
      });
    });
    document.getElementById('mv-workspace-wpi')?.addEventListener('change', () => {
      const units = state.project?.units || 'ft';
      const active = state.project?.extents?.sheetSize || 'D';
      updateSheetHint(
        document.getElementById('mv-sheet-hint'),
        active,
        units,
        workspaceWorldPerInch(),
      );
    });
    document.getElementById('mv-extents-label-inp')?.addEventListener('change', () => {
      if (!state.project?.extents) return;
      pushUndo();
      state.project.extents.label = document.getElementById('mv-extents-label-inp').value.trim() || 'Drawing extents';
      updateExtentsPanel();
      markDirty();
    });
    document.getElementById('mv-btn-pdf')?.addEventListener('click', () => {
      readProjectFields();
      const exportOpts = exportOrientationOptions();
      setStatus(`Building PDF (${exportOpts.orientation})…`);
      downloadExport('/export/pdf', state.project, exportOpts)
        .then(() => setStatus('PDF downloaded'))
        .catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-btn-dxf')?.addEventListener('click', () => {
      readProjectFields();
      setStatus('Building DXF…');
      downloadExport('/export/dxf', state.project, exportOrientationOptions())
        .then(() => setStatus('DXF downloaded'))
        .catch((e) => setStatus(e.message, true));
    });
    document.getElementById('mv-btn-3d')?.addEventListener('click', async () => {
      readProjectFields();
      const node = state.project.nodes.find((n) => n.id === state.selectedId);
      if (node) readInspectorMeta(node);
      setStatus('Building 3D view…');
      try {
        const data = await api('POST', '/view-3d', {
          project: state.project,
          linkComposer: true,
        });
        window.open(data.url, '_blank', 'noopener');
        setStatus(`3D view opened — ${data.placements} symbols, ${data.zones} zones`);
      } catch (e) {
        setStatus(e.message, true);
      }
    });

    document.getElementById('mv-btn-bg')?.addEventListener('click', () => document.getElementById('mv-bg-file').click());
    document.getElementById('mv-bg-file')?.addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          setStatus('Uploading background…');
          pushUndo();
          const data = await api('POST', '/background', { dataUrl: reader.result });
          state.project = data.project;
          await loadBackground();
          markDirty();
          setStatus('Background loaded — calibrate scale next');
        } catch (e) {
          setStatus(e.message, true);
        }
      };
      reader.readAsDataURL(file);
      ev.target.value = '';
    });

    document.getElementById('mv-calibrate-cancel')?.addEventListener('click', () => {
      state.calibrate = null;
      document.getElementById('mv-calibrate-dialog').close();
      markDirty();
    });
    document.getElementById('mv-calibrate-dialog')?.addEventListener('close', () => {
      if (state.calibrate?.p1 && !state.project?.scale) setTool('select');
    });
    document.getElementById('mv-calibrate-dialog')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      applyCalibrateScale();
    });

    ['mv-insp-label', 'mv-insp-x', 'mv-insp-y', 'mv-insp-rot', 'mv-insp-scale-x', 'mv-insp-scale-y',
      'mv-insp-device-id', 'mv-insp-zone-id', 'mv-insp-role',
      'mv-insp-alarm-tag', 'mv-insp-level-tag'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        const node = state.project.nodes.find((n) => n.id === state.selectedId);
        if (!node) return;
        pushUndo();
        node.label = document.getElementById('mv-insp-label').value;
        node.x = +document.getElementById('mv-insp-x').value || node.x;
        node.y = +document.getElementById('mv-insp-y').value || node.y;
        node.rotation = +document.getElementById('mv-insp-rot').value || 0;
        const sx = +document.getElementById('mv-insp-scale-x').value;
        const sy = +document.getElementById('mv-insp-scale-y').value;
        if (Number.isFinite(sx) && sx > 0) node.scaleX = clampNodeScale(sx);
        if (Number.isFinite(sy) && sy > 0) node.scaleY = clampNodeScale(sy);
        readInspectorMeta(node);
        markDirty();
      });
    });

    document.getElementById('mv-insp-delete')?.addEventListener('click', () => deleteSelectedNodes());

    document.getElementById('mv-edge-insp-delete')?.addEventListener('click', () => deleteSelectedEdge());

    document.getElementById('mv-snap-enabled')?.addEventListener('change', (ev) => {
      toggleSnap(!!ev.target.checked);
    });
    document.getElementById('mv-snap-grid')?.addEventListener('change', (ev) => {
      state.snapGridStep = Math.max(0.1, +ev.target.value || 5);
      updateSnapLabel();
    });
    document.querySelectorAll('.mv-align-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        alignSelected(btn.dataset.align);
      });
    });
    document.getElementById('mv-align-extents')?.addEventListener('click', () => {
      alignSelectionToExtents();
    });
    document.getElementById('mv-btn-group')?.addEventListener('click', () => groupSelection());
    document.getElementById('mv-btn-ungroup')?.addEventListener('click', () => ungroupSelection());

    if (!canvas) return;
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dblclick', onCanvasDblClick);
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mouseup', onCanvasMouseUp);
    canvas.addEventListener('mouseleave', onCanvasMouseLeave);
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => draw());
  }

  async function init() {
    bindUi();
    try {
      if (isMvDrawEmbedded() && window.parent === window) {
        window.location.replace('/');
        return;
      }
      if (!canvas || !ctx) {
        setStatus('Canvas not found — reload the page', true);
        return;
      }
      const [projData, symData, context] = await Promise.all([
        api('GET', '/project'),
        api('GET', '/symbols?includeHmi=1'),
        fetchPeaklogicContext().catch(() => null),
      ]);
      state.project = projData.project;
      state.storage = projData.storage || state.storage || null;
      if (projData.project?.libraryFile) state.activeFile = projData.project.libraryFile;
      state.symbols = symData.symbols || [];
      state.symbolByType = new Map(state.symbols.map((s) => [s.type, s]));
      preloadHmiSymbolImages(state.symbols);
      try {
        await loadBackground();
      } catch {
        /* missing or broken background must not block the editor */
      }
      renderSymbolLibrary();
      fillProjectFields();
      updateScaleLabel();
      updateExtentsPanel();
      updateUndoButtons();
      updateAlignButtons();
      updateGroupButtons();
      updateDeleteButton();
      updateProjectStatus();
      if (context && await maybeAutoLoadFromPeaklogicProject(context)) {
        draw();
        requestAnimationFrame(() => fitViewToContent());
        return;
      }
      draw();
      requestAnimationFrame(() => fitViewToContent());
      setStatus('Ready');
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  init();
})();
