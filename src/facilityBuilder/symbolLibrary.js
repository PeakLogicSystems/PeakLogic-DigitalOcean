'use strict';

/** Septic / site-plan symbol definitions. Dimensions in real-world units (ft). */
const SYMBOLS = [
  {
    type: 'septic_tank_1000',
    label: 'Septic tank 1000 gal',
    group: 'Tanks',
    width: 8,
    height: 5,
    ports: [
      { id: 'inlet', x: 0, y: 2.5, dir: 'w' },
      { id: 'outlet', x: 8, y: 2.5, dir: 'e' },
    ],
    fill: '#94a3b8',
    stroke: '#334155',
  },
  {
    type: 'pump_chamber',
    label: 'Pump chamber',
    group: 'Tanks',
    width: 6,
    height: 4,
    ports: [
      { id: 'inlet', x: 0, y: 2, dir: 'w' },
      { id: 'outlet', x: 6, y: 2, dir: 'e' },
      { id: 'electrical', x: 3, y: 0, dir: 'n' },
    ],
    fill: '#64748b',
    stroke: '#1e293b',
  },
  {
    type: 'd_box',
    label: 'Distribution box',
    group: 'Distribution',
    width: 3,
    height: 3,
    ports: [
      { id: 'inlet', x: 0, y: 1.5, dir: 'w' },
      { id: 'leg1', x: 3, y: 0.5, dir: 'e' },
      { id: 'leg2', x: 3, y: 1.5, dir: 'e' },
      { id: 'leg3', x: 3, y: 2.5, dir: 'e' },
    ],
    fill: '#cbd5e1',
    stroke: '#475569',
  },
  {
    type: 'leach_trench',
    label: 'Leach trench',
    group: 'Drainfield',
    width: 40,
    height: 3,
    ports: [
      { id: 'head', x: 0, y: 1.5, dir: 'w' },
      { id: 'tail', x: 40, y: 1.5, dir: 'e' },
    ],
    fill: '#86efac',
    stroke: '#166534',
  },
  {
    type: 'cleanout',
    label: 'Cleanout',
    group: 'Piping',
    width: 2,
    height: 2,
    ports: [
      { id: 'pipe', x: 1, y: 2, dir: 's' },
    ],
    fill: '#fbbf24',
    stroke: '#92400e',
  },
  {
    type: 'building',
    label: 'Building / structure',
    group: 'Site',
    width: 20,
    height: 16,
    ports: [
      { id: 'sewer', x: 10, y: 16, dir: 's' },
    ],
    fill: '#e2e8f0',
    stroke: '#64748b',
  },
];

const BY_TYPE = new Map(SYMBOLS.map((s) => [s.type, s]));

function listSymbols() {
  return SYMBOLS.map(({ type, label, group, width, height, ports, fill, stroke }) => ({
    type, label, group, width, height, ports, fill, stroke,
  }));
}

function getSymbol(type) {
  return BY_TYPE.get(type) || null;
}

/** World-space port position for a placed node. */
function portWorld(node, portId) {
  const sym = getSymbol(node.type);
  if (!sym) return null;
  const port = sym.ports.find((p) => p.id === portId);
  if (!port) return null;
  const rad = ((node.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = port.x - sym.width / 2;
  const ly = port.y - sym.height / 2;
  return {
    x: node.x + lx * cos - ly * sin,
    y: node.y + lx * sin + ly * cos,
    dir: port.dir,
  };
}

/** Resolve "nodeId:portId" handle string. */
function resolveHandle(handle, nodes) {
  const [nodeId, portId] = String(handle || '').split(':');
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || !portId) return null;
  const pt = portWorld(node, portId);
  if (!pt) return null;
  return { node, portId, ...pt };
}

module.exports = {
  listSymbols,
  getSymbol,
  portWorld,
  resolveHandle,
};
