'use strict';

(function () {
  const API = '/api/peaklogic-draw';
  const DEFAULT_PPU = 8;
  const MAX_UNDO = 50;

  const state = {
    project: null,
    symbols: [],
    symbolByType: new Map(),
    tool: 'select',
    placeType: null,
    selectedId: null,
    connectFrom: null,
    pointerWorld: null,
    pan: { x: 40, y: 40 },
    zoom: 1,
    dragging: null,
    dragUndoPushed: false,
    calibrate: null,
    extentsDraft: null,
    bgImage: null,
    dirty: false,
  };

  const undoStack = [];
  const redoStack = [];

  const canvas = document.getElementById('peaklogic-canvas');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('peaklogic-status');
  const scaleLabel = document.getElementById('peaklogic-scale-label');
  const extentsLabel = document.getElementById('peaklogic-extents-label');
  const cursorLabel = document.getElementById('peaklogic-cursor-label');

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

  async function downloadExport(path, project) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
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

  function sym(type) {
    return state.symbolByType.get(type) || null;
  }

  function portWorld(node, portId) {
    const s = sym(node.type);
    if (!s) return null;
    const port = (s.ports || []).find((p) => p.id === portId);
    if (!port) return null;
    const rad = ((node.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const lx = port.x - s.width / 2;
    const ly = port.y - s.height / 2;
    return {
      x: node.x + lx * cos - ly * sin,
      y: node.y + lx * sin + ly * cos,
      handle: `${node.id}:${portId}`,
    };
  }

  function hitTestNode(wx, wy) {
    const nodes = state.project?.nodes || [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const s = sym(n.type);
      const hw = (s?.width || 4) / 2;
      const hh = (s?.height || 4) / 2;
      if (wx >= n.x - hw && wx <= n.x + hw && wy >= n.y - hh && wy <= n.y + hh) return n;
    }
    return null;
  }

  function hitTestPort(wx, wy) {
    const tol = 1.2 / state.zoom;
    for (const n of state.project?.nodes || []) {
      for (const p of sym(n.type)?.ports || []) {
        const pt = portWorld(n, p.id);
        if (!pt) continue;
        if (Math.hypot(pt.x - wx, pt.y - wy) <= tol) return pt;
      }
    }
    return null;
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
    return `${w} × ${h} ${units}`;
  }

  function cloneProjectState() {
    const p = state.project;
    return JSON.parse(JSON.stringify({
      nodes: p.nodes,
      edges: p.edges,
      scale: p.scale,
      extents: p.extents,
      background: p.background,
      units: p.units,
    }));
  }

  function applyProjectState(snap) {
    state.project.nodes = snap.nodes || [];
    state.project.edges = snap.edges || [];
    state.project.scale = snap.scale ?? null;
    state.project.extents = snap.extents ?? null;
    state.project.background = snap.background ?? null;
    if (snap.units) state.project.units = snap.units;
    state.connectFrom = null;
    state.selectedId = null;
    state.extentsDraft = null;
    fillInspector();
    updateScaleLabel();
    updateExtentsPanel();
  }

  function updateUndoButtons() {
    const undoBtn = document.getElementById('peaklogic-btn-undo');
    const redoBtn = document.getElementById('peaklogic-btn-redo');
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
    const [nodeId, portId] = String(handle || '').split(':');
    const node = state.project?.nodes?.find((n) => n.id === nodeId);
    if (!node || !portId) return null;
    return portWorld(node, portId);
  }

  function markDirty() {
    state.dirty = true;
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
    const info = document.getElementById('peaklogic-extents-info');
    const labelInp = document.getElementById('peaklogic-extents-label-inp');
    const clearBtn = document.getElementById('peaklogic-btn-clear-extents');
    const fitBtn = document.getElementById('peaklogic-btn-fit-extents');
    const size = formatExtentsSize(ext);
    if (extentsLabel) extentsLabel.textContent = `Extents: ${size}`;
    if (info) {
      info.textContent = ext
        ? `${size} — export and Fit use this boundary.`
        : 'Not set — use Extents tool to click two opposite corners of the site/plot area.';
    }
    if (labelInp) labelInp.value = ext?.label || '';
    if (clearBtn) clearBtn.disabled = !ext;
    if (fitBtn) fitBtn.disabled = !ext;
  }

  function fitExtentsView() {
    const ext = state.project?.extents;
    if (!ext || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pad = 48;
    const spanX = ext.maxX - ext.minX;
    const spanY = ext.maxY - ext.minY;
    if (spanX <= 0 || spanY <= 0) return;
    const zoomX = (rect.width - pad * 2) / (spanX * ppu());
    const zoomY = (rect.height - pad * 2) / (spanY * ppu());
    state.zoom = Math.max(0.2, Math.min(6, Math.min(zoomX, zoomY)));
    const cx = (ext.minX + ext.maxX) / 2;
    const cy = (ext.minY + ext.maxY) / 2;
    state.pan.x = rect.width / 2 - cx * ppu() * state.zoom;
    state.pan.y = rect.height / 2 + cy * ppu() * state.zoom;
    markDirty();
    setStatus('Fit to extents');
  }

  function fillInspector() {
    const form = document.getElementById('peaklogic-inspector-form');
    const empty = document.getElementById('peaklogic-inspector-empty');
    const node = (state.project?.nodes || []).find((n) => n.id === state.selectedId);
    if (!node) {
      form.classList.add('view-hidden');
      empty.classList.remove('view-hidden');
      return;
    }
    empty.classList.add('view-hidden');
    form.classList.remove('view-hidden');
    document.getElementById('peaklogic-insp-label').value = node.label || '';
    document.getElementById('peaklogic-insp-type').value = node.type;
    document.getElementById('peaklogic-insp-x').value = node.x.toFixed(2);
    document.getElementById('peaklogic-insp-y').value = node.y.toFixed(2);
    document.getElementById('peaklogic-insp-rot').value = node.rotation || 0;
  }

  function fillProjectFields() {
    const p = state.project;
    if (!p) return;
    document.getElementById('peaklogic-proj-name').value = p.name || '';
    document.getElementById('peaklogic-proj-site').value = p.meta?.site || '';
    document.getElementById('peaklogic-proj-client').value = p.meta?.client || '';
    document.getElementById('peaklogic-proj-notes').value = p.meta?.notes || '';
  }

  function readProjectFields() {
    if (!state.project) return;
    state.project.name = document.getElementById('peaklogic-proj-name').value.trim() || 'untitled';
    state.project.meta = state.project.meta || {};
    state.project.meta.site = document.getElementById('peaklogic-proj-site').value.trim();
    state.project.meta.client = document.getElementById('peaklogic-proj-client').value.trim();
    state.project.meta.notes = document.getElementById('peaklogic-proj-notes').value.trim();
  }

  function renderSymbolLibrary() {
    const root = document.getElementById('peaklogic-symbol-list');
    if (!root) return;
    const groups = new Map();
    for (const s of state.symbols) {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(s);
    }
    root.innerHTML = '';
    for (const [group, items] of groups) {
      const gt = document.createElement('div');
      gt.className = 'peaklogic-symbol-group-title';
      gt.textContent = group;
      root.appendChild(gt);
      for (const s of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'peaklogic-symbol-btn';
        btn.dataset.type = s.type;
        btn.innerHTML = `<span class="peaklogic-symbol-thumb" style="background:#64748b"></span><span>${s.label}</span>`;
        btn.addEventListener('click', () => {
          state.placeType = s.type;
          state.tool = 'place';
          document.querySelectorAll('.peaklogic-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === 'place'));
          document.querySelectorAll('.peaklogic-symbol-btn').forEach((b) => b.classList.toggle('selected', b.dataset.type === s.type));
          setStatus(`Place: ${s.label}`);
        });
        root.appendChild(btn);
      }
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
    const step = 10;
    const s = ppu() * state.zoom;
    const w = canvas.width;
    const h = canvas.height;
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
    if (edge.points?.length >= 2) return edge.points;
    const [fromId, fromPort] = edge.from.split(':');
    const [toId, toPort] = edge.to.split(':');
    const na = state.project.nodes.find((n) => n.id === fromId);
    const nb = state.project.nodes.find((n) => n.id === toId);
    if (!na || !nb) return [];
    const a = portWorld(na, fromPort);
    const b = portWorld(nb, toPort);
    if (!a || !b) return [];
    return [[a.x, a.y], [b.x, b.y]];
  }

  function drawEdge(edge) {
    const pts = edgePoints(edge);
    if (pts.length < 2) return;
    ctx.strokeStyle = edge.id === state.selectedId ? '#fbbf24' : '#38bdf8';
    ctx.lineWidth = edge.id === state.selectedId ? 3 : 2;
    ctx.beginPath();
    const p0 = worldToScreen(pts[0][0], pts[0][1]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = worldToScreen(pts[i][0], pts[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function drawNode(node) {
    const s = sym(node.type);
    const w = s?.width || 4;
    const h = s?.height || 4;
    const tl = worldToScreen(node.x - w / 2, node.y + h / 2);
    const br = worldToScreen(node.x + w / 2, node.y - h / 2);
    const rw = br.x - tl.x;
    const rh = br.y - tl.y;
    ctx.fillStyle = s?.fill || '#64748b';
    ctx.strokeStyle = node.id === state.selectedId ? '#fbbf24' : (s?.stroke || '#334155');
    ctx.lineWidth = node.id === state.selectedId ? 3 : 2;
    ctx.fillRect(tl.x, tl.y, rw, rh);
    ctx.strokeRect(tl.x, tl.y, rw, rh);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${Math.max(10, 11 * state.zoom)}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(node.label || s?.label || node.type, tl.x + rw / 2, br.y + 14);

    if (state.tool === 'connect' || state.connectFrom) {
      for (const p of s?.ports || []) {
        const pt = portWorld(node, p.id);
        if (!pt) continue;
        const sc = worldToScreen(pt.x, pt.y);
        ctx.beginPath();
        ctx.fillStyle = state.connectFrom === pt.handle ? '#fbbf24' : '#22c55e';
        ctx.arc(sc.x, sc.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawConnectPreview() {
    if (!state.connectFrom || !state.pointerWorld) return;
    const from = resolveConnectHandle(state.connectFrom);
    if (!from) return;
    const a = worldToScreen(from.x, from.y);
    const b = worldToScreen(state.pointerWorld.x, state.pointerWorld.y);
    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
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
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(ext.label || 'Extents', tl.x + 4, tl.y + 14);
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
    for (const edge of state.project?.edges || []) drawEdge(edge);
    drawConnectPreview();
    for (const node of state.project?.nodes || []) drawNode(node);
    drawCalibrateOverlay();
  }

  async function saveProject() {
    readProjectFields();
    setStatus('Saving…');
    const data = await api('PUT', '/project', { project: state.project });
    state.project = data.project;
    state.dirty = false;
    setStatus('Saved');
  }

  function setTool(tool) {
    state.tool = tool;
    state.connectFrom = null;
    state.pointerWorld = null;
    state.extentsDraft = null;
    document.querySelectorAll('.peaklogic-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    if (tool !== 'place') state.placeType = null;
    canvas.style.cursor = (tool === 'calibrate' || tool === 'extents') ? 'crosshair' : tool === 'connect' ? 'pointer' : 'default';
  }

  function applyCalibrateScale() {
    const c = state.calibrate;
    if (!c?.p1 || !c?.p2) return;
    const dist = +document.getElementById('peaklogic-calibrate-dist').value;
    const units = document.getElementById('peaklogic-calibrate-units').value;
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
    document.getElementById('peaklogic-calibrate-dialog').close();
    updateScaleLabel();
    markDirty();
    setStatus(`Scale set: ${state.project.scale.pixelsPerUnit.toFixed(2)} px/${units}`);
  }

  function onCanvasClick(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (state.tool === 'calibrate') {
      if (!state.calibrate) state.calibrate = { p1: null, p2: null };
      if (!state.calibrate.p1) {
        state.calibrate.p1 = [w.x, w.y];
        document.getElementById('peaklogic-calibrate-step').textContent = 'Step 2: click second point';
      } else if (!state.calibrate.p2) {
        state.calibrate.p2 = [w.x, w.y];
        document.getElementById('peaklogic-calibrate-apply').disabled = false;
        document.getElementById('peaklogic-calibrate-step').textContent = 'Enter known distance and Apply';
        document.getElementById('peaklogic-calibrate-dialog').showModal();
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
        const label = document.getElementById('peaklogic-extents-label-inp')?.value.trim() || 'Site extents';
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
      if (!port) {
        if (state.connectFrom) {
          state.connectFrom = null;
          state.pointerWorld = null;
          markDirty();
          setStatus('Connect cancelled');
        }
        return;
      }
      if (!state.connectFrom) {
        state.connectFrom = port.handle;
        state.pointerWorld = { x: w.x, y: w.y };
        setStatus(`Connect from ${port.handle} — click destination port`);
        markDirty();
      } else if (state.connectFrom !== port.handle) {
        pushUndo();
        state.project.edges.push({
          id: nextId('edge', state.project.edges),
          from: state.connectFrom,
          to: port.handle,
          kind: 'pipe',
          points: [],
        });
        state.connectFrom = null;
        state.pointerWorld = null;
        markDirty();
        setStatus('Connection added');
      }
      return;
    }

    if (state.tool === 'place' && state.placeType) {
      pushUndo();
      state.project.nodes.push({
        id: nextId('node', state.project.nodes),
        type: state.placeType,
        x: w.x,
        y: w.y,
        rotation: 0,
        label: '',
      });
      markDirty();
      return;
    }

    const node = hitTestNode(w.x, w.y);
    if (!node) {
      if (state.connectFrom) {
        state.connectFrom = null;
        state.pointerWorld = null;
        markDirty();
        setStatus('Connect cancelled');
      }
      state.selectedId = null;
      fillInspector();
      markDirty();
      return;
    }
    state.selectedId = node.id;
    fillInspector();
    markDirty();
  }

  function onCanvasMouseDown(ev) {
    if (state.tool !== 'select') return;
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
    const node = hitTestNode(w.x, w.y);
    if (!node) return;
    pushUndo();
    state.dragUndoPushed = true;
    state.selectedId = node.id;
    state.dragging = { id: node.id, ox: w.x - node.x, oy: w.y - node.y, startX: node.x, startY: node.y };
    fillInspector();
  }

  function onCanvasMouseMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const units = state.project?.units || 'ft';
    cursorLabel.textContent = `${w.x.toFixed(1)}, ${w.y.toFixed(1)} ${units}`;

    const previewChanged = (state.connectFrom || state.extentsDraft?.p1)
      && (!state.pointerWorld || state.pointerWorld.x !== w.x || state.pointerWorld.y !== w.y);
    state.pointerWorld = { x: w.x, y: w.y };

    if (state.dragging) {
      const node = state.project.nodes.find((n) => n.id === state.dragging.id);
      if (node) {
        node.x = w.x - state.dragging.ox;
        node.y = w.y - state.dragging.oy;
        fillInspector();
        markDirty();
      }
    } else if (previewChanged) {
      draw();
    }
  }

  function onCanvasMouseUp() {
    if (state.dragging && state.dragUndoPushed) {
      const node = state.project.nodes.find((n) => n.id === state.dragging.id);
      if (node && node.x === state.dragging.startX && node.y === state.dragging.startY) {
        undoStack.pop();
        updateUndoButtons();
      }
    }
    state.dragging = null;
    state.dragUndoPushed = false;
  }

  function onCanvasMouseLeave() {
    onCanvasMouseUp();
  }

  function onKeyDown(ev) {
    const mod = ev.ctrlKey || ev.metaKey;
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
    if (ev.key === 'Escape') {
      if (state.connectFrom) {
        state.connectFrom = null;
        state.pointerWorld = null;
        markDirty();
        setStatus('Connect cancelled');
      } else if (state.extentsDraft) {
        state.extentsDraft = null;
        markDirty();
        setStatus('Extents cancelled');
      }
    }
  }

  function onWheel(ev) {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = ev.deltaY < 0 ? 1.1 : 0.9;
    state.zoom = Math.max(0.2, Math.min(6, state.zoom * factor));
    const after = screenToWorld(sx, sy);
    state.pan.x += (after.x - before.x) * ppu() * state.zoom;
    state.pan.y -= (after.y - before.y) * ppu() * state.zoom;
    markDirty();
  }

  function bindUi() {
    document.querySelectorAll('.peaklogic-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTool(btn.dataset.tool);
        if (btn.dataset.tool === 'calibrate') {
          state.calibrate = { p1: null, p2: null };
          document.getElementById('peaklogic-calibrate-step').textContent = 'Step 1: click first point on canvas';
          document.getElementById('peaklogic-calibrate-apply').disabled = true;
        }
      });
    });

    document.getElementById('peaklogic-btn-save')?.addEventListener('click', () => saveProject().catch((e) => setStatus(e.message, true)));
    document.getElementById('peaklogic-btn-undo')?.addEventListener('click', () => undo());
    document.getElementById('peaklogic-btn-redo')?.addEventListener('click', () => redo());
    document.getElementById('peaklogic-btn-fit-extents')?.addEventListener('click', () => fitExtentsView());
    document.getElementById('peaklogic-btn-clear-extents')?.addEventListener('click', () => {
      if (!state.project?.extents) return;
      pushUndo();
      state.project.extents = null;
      updateExtentsPanel();
      markDirty();
      setStatus('Extents cleared');
    });
    document.getElementById('peaklogic-extents-label-inp')?.addEventListener('change', () => {
      if (!state.project?.extents) return;
      pushUndo();
      state.project.extents.label = document.getElementById('peaklogic-extents-label-inp').value.trim() || 'Drawing extents';
      updateExtentsPanel();
      markDirty();
    });
    document.getElementById('peaklogic-btn-pdf')?.addEventListener('click', () => {
      readProjectFields();
      setStatus('Building PDF…');
      downloadExport('/export/pdf', state.project)
        .then(() => setStatus('PDF downloaded'))
        .catch((e) => setStatus(e.message, true));
    });
    document.getElementById('peaklogic-btn-dxf')?.addEventListener('click', () => {
      readProjectFields();
      setStatus('Building DXF…');
      downloadExport('/export/dxf', state.project)
        .then(() => setStatus('DXF downloaded'))
        .catch((e) => setStatus(e.message, true));
    });

    document.getElementById('peaklogic-btn-bg')?.addEventListener('click', () => document.getElementById('peaklogic-bg-file').click());
    document.getElementById('peaklogic-bg-file')?.addEventListener('change', async (ev) => {
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

    document.getElementById('peaklogic-calibrate-cancel')?.addEventListener('click', () => {
      state.calibrate = null;
      document.getElementById('peaklogic-calibrate-dialog').close();
      markDirty();
    });
    document.getElementById('peaklogic-calibrate-dialog')?.addEventListener('close', () => {
      if (state.calibrate?.p1 && !state.project?.scale) setTool('select');
    });
    document.getElementById('peaklogic-calibrate-dialog')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      applyCalibrateScale();
    });

    ['peaklogic-insp-label', 'peaklogic-insp-x', 'peaklogic-insp-y', 'peaklogic-insp-rot'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        const node = state.project.nodes.find((n) => n.id === state.selectedId);
        if (!node) return;
        pushUndo();
        node.label = document.getElementById('peaklogic-insp-label').value;
        node.x = +document.getElementById('peaklogic-insp-x').value || node.x;
        node.y = +document.getElementById('peaklogic-insp-y').value || node.y;
        node.rotation = +document.getElementById('peaklogic-insp-rot').value || 0;
        markDirty();
      });
    });

    document.getElementById('peaklogic-insp-delete')?.addEventListener('click', () => {
      if (!state.selectedId) return;
      pushUndo();
      state.project.nodes = state.project.nodes.filter((n) => n.id !== state.selectedId);
      state.project.edges = state.project.edges.filter(
        (e) => !e.from.startsWith(`${state.selectedId}:`) && !e.to.startsWith(`${state.selectedId}:`),
      );
      state.selectedId = null;
      fillInspector();
      markDirty();
    });

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mouseup', onCanvasMouseUp);
    canvas.addEventListener('mouseleave', onCanvasMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', () => draw());
  }

  async function init() {
    try {
      const [projData, symData] = await Promise.all([
        api('GET', '/project'),
        api('GET', '/symbols'),
      ]);
      state.project = projData.project;
      state.symbols = symData.symbols || [];
      state.symbolByType = new Map(state.symbols.map((s) => [s.type, s]));
      await loadBackground();
      renderSymbolLibrary();
      fillProjectFields();
      updateScaleLabel();
      updateExtentsPanel();
      bindUi();
      updateUndoButtons();
      draw();
      setStatus('Ready');
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  init();
})();
