// Shared Facility Draw port placement — attach pipes to symbol outlines, not just bounding boxes.
(function portModuleFactory(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FacilityDrawPorts = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function facilityDrawPortsFactory() {
  /** Match drawSymbolShape() outlines (fractions of min(width, height) or width). */
  const SHAPE_OUTLINE = {
    treatment_tank: { kind: 'circle', scale: 0.44 },
    integrated_mle_tank: { kind: 'circle', scale: 0.46 },
    dosing_tank_duplex: { kind: 'circle', scale: 0.38, centerYOffset: -0.04 },
    simplex_lift: { kind: 'lift', wellOffsetX: -0.28, wellRadiusX: 0.18, wellRadiusY: 0.36 },
    duplex_lift: { kind: 'lift', wellOffsetX: -0.28, wellRadiusX: 0.18, wellRadiusY: 0.36 },
  };

  const CONNECTION_PORT_IDS = new Set([
    'inlet', 'outlet', 'influent', 'effluent', 'supply', 'dose', 'return',
    'head', 'tail', 'recycle', 'was', 'leg1', 'leg2', 'leg3', 'leg4', 'pipe',
  ]);

  function isConnectionPort(portId) {
    return CONNECTION_PORT_IDS.has(String(portId || ''));
  }

  function portDirVector(dir, port, sym) {
    switch (dir) {
      case 'w':
        return { dx: -1, dy: 0 };
      case 'e':
        return { dx: 1, dy: 0 };
      case 'n':
        return { dx: 0, dy: 1 };
      case 's':
        return { dx: 0, dy: -1 };
      default:
        break;
    }
    const lx = port.x - sym.width / 2;
    const ly = port.y - sym.height / 2;
    const len = Math.hypot(lx, ly);
    if (len < 1e-9) return { dx: 1, dy: 0 };
    return { dx: lx / len, dy: ly / len };
  }

  function portLocalOffset(sym, port) {
    const outline = sym?.shape ? SHAPE_OUTLINE[sym.shape] : null;
    const portLy = port.y - sym.height / 2;
    const portLx = port.x - sym.width / 2;

    if (outline?.kind === 'lift') {
      const mn = Math.min(sym.width, sym.height);
      const wrx = mn * (outline.wellRadiusX || outline.wellRadius || 0.32);
      const wry = mn * (outline.wellRadiusY || outline.wellRadius || 0.32);
      const wcx = sym.width * outline.wellOffsetX;
      if (port.id === 'inlet' || port.dir === 'w') {
        return { lx: wcx - wrx, ly: portLy };
      }
      if (port.id === 'outlet' || port.dir === 'e') {
        return { lx: sym.width / 2, ly: portLy };
      }
      return { lx: portLx, ly: portLy };
    }

    if (outline?.kind === 'circle') {
      const r = Math.min(sym.width, sym.height) * outline.scale;
      const cyOff = (outline.centerYOffset || 0) * sym.height;
      const v = portDirVector(port.dir, port, sym);
      return { lx: v.dx * r, ly: cyOff + v.dy * r };
    }

    return { lx: portLx, ly: portLy };
  }

  function rotatePortDir(dir, rotationDeg) {
    if (!dir) return null;
    const steps = Math.round((rotationDeg || 0) / 90) % 4;
    if (!steps) return dir;
    const order = ['e', 'n', 'w', 's'];
    const i = order.indexOf(dir);
    if (i < 0) return dir;
    return order[(i + steps + 4) % 4];
  }

  function nodeScale(node) {
    const sx = Number(node?.scaleX);
    const sy = Number(node?.scaleY);
    return {
      scaleX: Number.isFinite(sx) && sx > 0 ? sx : 1,
      scaleY: Number.isFinite(sy) && sy > 0 ? sy : 1,
    };
  }

  function portWorldPosition(node, sym, port) {
    if (!node || !sym || !port) return null;
    const { scaleX, scaleY } = nodeScale(node);
    const { lx, ly } = portLocalOffset(sym, port);
    const rad = ((node.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const slx = lx * scaleX;
    const sly = ly * scaleY;
    return {
      x: node.x + slx * cos - sly * sin,
      y: node.y + slx * sin + sly * cos,
      dir: rotatePortDir(port.dir || null, node.rotation || 0),
    };
  }

  return {
    SHAPE_OUTLINE,
    CONNECTION_PORT_IDS,
    isConnectionPort,
    portDirVector,
    portLocalOffset,
    portWorldPosition,
    rotatePortDir,
  };
});
