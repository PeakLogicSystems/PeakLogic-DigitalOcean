'use strict';

const { portWorldPosition } = require('../../public/js/facilityDrawPorts');

/** Evenly spaced circuit outlets along the bottom (and second row when count > 10). */
function buildPowerPanelPorts(count, width, height) {
  const ports = [];
  const margin = 0.75;
  const rows = count <= 10 ? 1 : 2;
  const perRow = Math.ceil(count / rows);
  const rowOffsets = rows === 1 ? [0] : [0, Math.min(height * 0.16, 1.2)];
  let idx = 0;
  for (let r = 0; r < rows && idx < count; r += 1) {
    const n = Math.min(perRow, count - idx);
    const step = (width - margin * 2) / (n + 1);
    for (let i = 0; i < n; i += 1) {
      idx += 1;
      ports.push({
        id: `c${idx}`,
        x: margin + step * (i + 1),
        y: rowOffsets[r],
        dir: 's',
      });
    }
  }
  return ports;
}

function powerPanelSymbol(circuits, width, height) {
  return {
    type: `power_panel_${circuits}`,
    label: `Power panel — ${circuits} circuits`,
    group: 'Power panels',
    shape: 'power_panel',
    circuits,
    width,
    height,
    ports: buildPowerPanelPorts(circuits, width, height),
    fill: '#fde68a',
    stroke: '#92400e',
  };
}

const SLD_GROUP = 'Electrical single line';

/** Shared footprint for Opta PLC + D1608E / A0602 expansion modules. */
const OPTA_PANEL_WIDTH = 50;
const OPTA_PANEL_HEIGHT = 45;

function sldOptaFamilyStyle(extra = {}) {
  return {
    fill: '#334155',
    stroke: '#e2e8f0',
    ...extra,
  };
}

/** Top line / bottom load — standard vertical SLD device ports. */
function sldLineLoadPorts(width, height) {
  const cx = width / 2;
  return [
    { id: 'line', x: cx, y: height, dir: 'n' },
    { id: 'load', x: cx, y: 0, dir: 's' },
  ];
}

function sldBusPorts(width, height, tapCount) {
  const ports = [{ id: 'line', x: 0, y: height / 2, dir: 'w' }];
  const step = width / (tapCount + 1);
  for (let i = 0; i < tapCount; i += 1) {
    ports.push({
      id: `c${i + 1}`,
      x: step * (i + 1),
      y: 0,
      dir: 's',
    });
  }
  return ports;
}

function sldPanelPorts(circuitCount, width, height) {
  return [
    { id: 'line', x: width / 2, y: height, dir: 'n' },
    ...buildPowerPanelPorts(circuitCount, width, height),
  ];
}

function sldSymbol(type, label, shape, width, height, ports, extra = {}) {
  return {
    type,
    label,
    group: SLD_GROUP,
    shape,
    width,
    height,
    ports,
    fill: '#f8fafc',
    stroke: '#1e293b',
    ...extra,
  };
}

/** Evenly spaced screw terminals along one symbol edge (y=0 bottom, y=height top). */
function sldEdgePorts(ids, labels, edge, width, height, margin = 0.5) {
  const ports = [];
  const n = ids.length;
  if (!n) return ports;
  for (let i = 0; i < n; i += 1) {
    let x;
    let y;
    if (edge === 'n' || edge === 's') {
      const step = n === 1 ? 0 : (width - margin * 2) / (n - 1);
      x = n === 1 ? width / 2 : margin + step * i;
      y = edge === 'n' ? height : 0;
    } else {
      const step = n === 1 ? 0 : (height - margin * 2) / (n - 1);
      y = n === 1 ? height / 2 : margin + step * i;
      x = edge === 'e' ? width : 0;
    }
    ports.push({
      id: ids[i],
      label: labels[i] || ids[i],
      x,
      y,
      dir: edge,
    });
  }
  return ports;
}

function sldOptaPorts(width, height) {
  const inputIds = ['ai1', 'ai2', 'ai3', 'ai4', 'ai5', 'ai6', 'i7', 'i8', 'rs485_a', 'rs485_b'];
  const inputLabels = ['AI1', 'AI2', 'AI3', 'AI4', 'AI5', 'AI6', 'I7', 'I8', 'A', 'B'];
  return [
    ...sldEdgePorts(
      ['dc_plus_1', 'dc_plus_2', 'com_1', 'com_2', ...inputIds],
      ['+24', '+24', 'COM', 'COM', ...inputLabels],
      'n',
      width,
      height,
      0.8,
    ),
    ...sldEdgePorts(['r1', 'r2', 'r3', 'r4'], ['R1', 'R2', 'R3', 'R4'], 's', width, height, 1.0),
    ...sldEdgePorts(['exp'], ['EXP'], 'e', width, height, 0),
  ];
}

function sldExpansionEwBusPorts(width, height) {
  return [
    ...sldEdgePorts(['bus_w'], ['BUS'], 'w', width, height, 0),
    ...sldEdgePorts(['bus_e'], ['BUS'], 'e', width, height, 0),
  ];
}

function sldD1608ePorts(width, height) {
  const diIds = Array.from({ length: 16 }, (_, i) => `x1_i${i + 1}`);
  const diLabels = Array.from({ length: 16 }, (_, i) => `I${i + 1}`);
  const relayIds = Array.from({ length: 8 }, (_, i) => `x1_r${i + 1}`);
  const relayLabels = Array.from({ length: 8 }, (_, i) => `R${i + 1}`);
  return [
    ...sldExpansionEwBusPorts(width, height),
    ...sldEdgePorts(
      ['dc_plus_1', 'dc_plus_2', 'com_1', 'com_2', ...diIds],
      ['+24', '+24', 'COM', 'COM', ...diLabels],
      'n',
      width,
      height,
      0.8,
    ),
    ...sldEdgePorts(relayIds, relayLabels, 's', width, height, 1.0),
  ];
}

function sldA0602Ports(width, height) {
  const aiIds = Array.from({ length: 8 }, (_, i) => `x2_ai${i + 1}`);
  const aiLabels = Array.from({ length: 8 }, (_, i) => `AI${i + 1}`);
  const aoIds = Array.from({ length: 4 }, (_, i) => `x2_pwm${i + 1}`);
  const aoLabels = Array.from({ length: 4 }, (_, i) => `AO${i + 1}`);
  return [
    ...sldExpansionEwBusPorts(width, height),
    ...sldEdgePorts(
      ['dc_plus_1', 'dc_plus_2', 'com_1', 'com_2', ...aiIds],
      ['+24', '+24', 'COM', 'COM', ...aiLabels],
      'n',
      width,
      height,
      0.8,
    ),
    ...sldEdgePorts(aoIds, aoLabels, 's', width, height, 1.0),
  ];
}

function sldDcSupplyPorts(width, height) {
  return [
    ...sldEdgePorts(['ac_l', 'ac_n'], ['L', 'N'], 'n', width, height, 0.45),
    ...sldEdgePorts(['dc_plus', 'com'], ['+24V', 'COM'], 's', width, height, 0.45),
  ];
}

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
    type: 'treatment_tank_1250',
    label: 'Treatment tank 1,250 gal',
    group: 'Tanks',
    shape: 'treatment_tank',
    capacityGal: 1250,
    width: 6,
    height: 6,
    ports: [
      { id: 'inlet', x: 0, y: 3, dir: 'w' },
      { id: 'outlet', x: 6, y: 3, dir: 'e' },
      { id: 'vent', x: 3, y: 6, dir: 'n' },
    ],
    fill: '#22c55e',
    stroke: '#166534',
  },
  {
    type: 'trash_tank_1250_2comp',
    label: 'Trash tank 1,250 gal (2-compartment)',
    group: 'Tanks',
    shape: 'trash_tank_2comp',
    capacityGal: 1250,
    compartments: 2,
    width: 12,
    height: 6,
    ports: [
      { id: 'inlet', x: 0, y: 3, dir: 'w' },
      { id: 'outlet', x: 12, y: 3, dir: 'e' },
      { id: 'vent', x: 6, y: 6, dir: 'n' },
    ],
    fill: '#78716c',
    stroke: '#44403c',
  },
  {
    type: 'dosing_tank_1500',
    label: 'Dosing tank 1,500 gal (2 pumps)',
    group: 'Tanks',
    shape: 'dosing_tank_duplex',
    capacityGal: 1500,
    pumps: 2,
    width: 8,
    height: 7,
    ports: [
      { id: 'inlet', x: 0, y: 3.5, dir: 'w' },
      { id: 'dose', x: 8, y: 3.5, dir: 'e' },
      { id: 'return', x: 4, y: 0, dir: 's' },
      { id: 'electrical', x: 6.4, y: 7, dir: 'n' },
    ],
    fill: '#38bdf8',
    stroke: '#0369a1',
  },
  {
    type: 'integrated_mle_tank_125k',
    label: 'Integrated MLE tank 125K gal',
    group: 'Tanks',
    shape: 'integrated_mle_tank',
    capacityGal: 125000,
    width: 30,
    height: 30,
    ports: [
      { id: 'influent', x: 0, y: 15, dir: 'w' },
      { id: 'effluent', x: 30, y: 15, dir: 'e' },
      { id: 'recycle', x: 15, y: 0, dir: 'n' },
      { id: 'was', x: 15, y: 30, dir: 's' },
    ],
    fill: '#64748b',
    stroke: '#334155',
  },
  {
    type: 'lift_simplex',
    label: 'Simplex lift station',
    group: 'Lift & ATU panels',
    shape: 'simplex_lift',
    pumps: 1,
    width: 7,
    height: 7,
    ports: [
      { id: 'inlet', x: 0, y: 3.5, dir: 'w' },
      { id: 'outlet', x: 7, y: 3.5, dir: 'e' },
      { id: 'electrical', x: 5.8, y: 7, dir: 'n' },
    ],
    fill: '#64748b',
    stroke: '#1e293b',
  },
  {
    type: 'lift_duplex',
    label: 'Duplex lift station',
    group: 'Lift & ATU panels',
    shape: 'duplex_lift',
    pumps: 2,
    width: 9,
    height: 9,
    ports: [
      { id: 'inlet', x: 0, y: 4.5, dir: 'w' },
      { id: 'outlet', x: 9, y: 4.5, dir: 'e' },
      { id: 'electrical', x: 7.2, y: 9, dir: 'n' },
    ],
    fill: '#64748b',
    stroke: '#334155',
  },
  {
    type: 'atu_single',
    label: 'Single ATU control panel (duplex + TPO)',
    group: 'Lift & ATU panels',
    shape: 'atu_control_panel',
    trains: 1,
    tpoCount: 1,
    width: 8,
    height: 8,
    ports: [
      { id: 'inlet', x: 0, y: 4, dir: 'w' },
      { id: 'outlet', x: 8, y: 4, dir: 'e' },
      { id: 'electrical', x: 6.6, y: 8, dir: 'n' },
    ],
    fill: '#dcfce7',
    stroke: '#15803d',
  },
  {
    type: 'atu_dual',
    label: 'Dual ATU control panel (2 duplex + TPO)',
    group: 'Lift & ATU panels',
    shape: 'atu_control_panel',
    trains: 2,
    tpoCount: 2,
    width: 11,
    height: 8,
    ports: [
      { id: 'inlet', x: 0, y: 4, dir: 'w' },
      { id: 'outlet', x: 11, y: 4, dir: 'e' },
      { id: 'electrical', x: 9.2, y: 8, dir: 'n' },
    ],
    fill: '#dcfce7',
    stroke: '#15803d',
  },
  {
    type: 'atu_quad_dual_duplex',
    label: 'Quad ATU control panel (4 duplex + TPO)',
    group: 'Lift & ATU panels',
    shape: 'atu_control_panel',
    trains: 4,
    tpoCount: 4,
    width: 16,
    height: 9,
    ports: [
      { id: 'inlet', x: 0, y: 4.5, dir: 'w' },
      { id: 'outlet', x: 16, y: 4.5, dir: 'e' },
      { id: 'electrical', x: 13.4, y: 9, dir: 'n' },
    ],
    fill: '#dcfce7',
    stroke: '#15803d',
  },
  powerPanelSymbol(5, 7, 5),
  powerPanelSymbol(10, 12, 5),
  powerPanelSymbol(20, 18, 7),
  powerPanelSymbol(40, 32, 8),
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
    type: 'drip_drainfield',
    label: 'Drip drainfield',
    group: 'Drainfield',
    shape: 'drip_field',
    width: 30,
    height: 12,
    ports: [
      { id: 'supply', x: 0, y: 6, dir: 'w' },
    ],
    fill: '#4ade80',
    stroke: '#166534',
  },
  {
    type: 'drip_irrigation_4leg',
    label: 'Drip irrigation — 4 legs + return',
    group: 'Drainfield',
    shape: 'drip_irrigation_4leg',
    legCount: 4,
    width: 28,
    height: 22,
    ports: [
      { id: 'supply', x: 0, y: 18, dir: 'w' },
      { id: 'return', x: 28, y: 18, dir: 'e' },
      { id: 'leg1', x: 4, y: 0, dir: 's' },
      { id: 'leg2', x: 10, y: 0, dir: 's' },
      { id: 'leg3', x: 18, y: 0, dir: 's' },
      { id: 'leg4', x: 24, y: 0, dir: 's' },
    ],
    fill: '#4ade80',
    stroke: '#166534',
  },
  {
    type: 'drip_leg',
    label: 'Drip leg / lateral',
    group: 'Drainfield',
    shape: 'drip_leg',
    width: 35,
    height: 2.5,
    ports: [
      { id: 'head', x: 0, y: 1.25, dir: 'w' },
      { id: 'tail', x: 35, y: 1.25, dir: 'e' },
    ],
    fill: '#86efac',
    stroke: '#15803d',
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
  sldSymbol('sld_service', 'Service entrance', 'sld_service', 2, 3, sldLineLoadPorts(2, 3)),
  sldSymbol('sld_disconnect', 'Main disconnect', 'sld_disconnect', 2.5, 2.5, sldLineLoadPorts(2.5, 2.5)),
  sldSymbol('sld_breaker', 'Circuit breaker', 'sld_breaker', 2, 2.5, sldLineLoadPorts(2, 2.5)),
  sldSymbol('sld_fuse', 'Fuse', 'sld_fuse', 2, 2.5, sldLineLoadPorts(2, 2.5)),
  sldSymbol('sld_no_contact', 'NO contact (normally open)', 'sld_no_contact', 2, 2, sldLineLoadPorts(2, 2)),
  sldSymbol('sld_nc_contact', 'NC contact (normally closed)', 'sld_nc_contact', 2, 2, sldLineLoadPorts(2, 2)),
  sldSymbol('sld_coil', 'Relay / contactor coil', 'sld_coil', 2, 2.5, sldLineLoadPorts(2, 2.5)),
  sldSymbol('sld_motor', 'Motor', 'sld_motor', 2.5, 2.5, sldLineLoadPorts(2.5, 2.5)),
  sldSymbol('sld_light', 'Light / pilot lamp', 'sld_light', 2, 2.5, sldLineLoadPorts(2, 2.5)),
  sldSymbol('sld_horn', 'Horn / buzzer', 'sld_horn', 2, 2.5, sldLineLoadPorts(2, 2.5)),
  sldSymbol('sld_starter', 'Motor starter / contactor', 'sld_starter', 3, 2.5, [
    { id: 'line', x: 1.5, y: 2.5, dir: 'n' },
    { id: 'load', x: 1.5, y: 0, dir: 's' },
    { id: 'control', x: 3, y: 1.25, dir: 'e' },
  ]),
  sldSymbol('sld_vfd', 'VFD / soft starter', 'sld_vfd', 3, 2.5, [
    { id: 'line', x: 1.5, y: 2.5, dir: 'n' },
    { id: 'load', x: 1.5, y: 0, dir: 's' },
    { id: 'control', x: 3, y: 1.25, dir: 'e' },
  ]),
  sldSymbol('sld_transformer', 'Transformer', 'sld_transformer', 3, 2.5, [
    { id: 'primary', x: 1.5, y: 2.5, dir: 'n' },
    { id: 'secondary', x: 1.5, y: 0, dir: 's' },
  ]),
  sldSymbol('sld_bus', 'Bus bar (5 taps)', 'sld_bus', 8, 1.2, sldBusPorts(8, 1.2, 5)),
  sldSymbol('sld_meter', 'kWh meter', 'sld_meter', 2.5, 2.5, sldLineLoadPorts(2.5, 2.5)),
  sldSymbol('sld_ground', 'Ground / earth', 'sld_ground', 2, 2, [
    { id: 'bond', x: 1, y: 2, dir: 'n' },
  ]),
  sldSymbol('sld_panel_6', 'Distribution panel — 6 circuits', 'sld_panel', 5, 3, sldPanelPorts(6, 5, 3), { circuits: 6 }),
  sldSymbol('sld_ats', 'Automatic transfer switch', 'sld_ats', 4, 3, [
    { id: 'normal', x: 0, y: 1.5, dir: 'w' },
    { id: 'emergency', x: 4, y: 1.5, dir: 'e' },
    { id: 'load', x: 2, y: 0, dir: 's' },
  ]),
  sldSymbol('sld_generator', 'Generator', 'sld_generator', 3, 2.5, [
    { id: 'line', x: 1.5, y: 2.5, dir: 'n' },
  ]),
  sldSymbol('sld_dc_supply', 'DC power supply (24 VDC)', 'sld_dc_supply', 3.5, 3.5, sldDcSupplyPorts(3.5, 3.5)),
  sldSymbol(
    'sld_opta',
    'Arduino Opta PLC',
    'sld_opta',
    OPTA_PANEL_WIDTH,
    OPTA_PANEL_HEIGHT,
    sldOptaPorts(OPTA_PANEL_WIDTH, OPTA_PANEL_HEIGHT),
    sldOptaFamilyStyle(),
  ),
  sldSymbol(
    'sld_expansion_d1608e',
    'Opta expansion — D1608E (DI/relay)',
    'sld_expansion',
    OPTA_PANEL_WIDTH,
    OPTA_PANEL_HEIGHT,
    sldD1608ePorts(OPTA_PANEL_WIDTH, OPTA_PANEL_HEIGHT),
    sldOptaFamilyStyle({ expansion: 'D1608E', slot: 1 }),
  ),
  sldSymbol(
    'sld_expansion_a0602',
    'Opta expansion — A0602 (AI/AO)',
    'sld_expansion',
    OPTA_PANEL_WIDTH,
    OPTA_PANEL_HEIGHT,
    sldA0602Ports(OPTA_PANEL_WIDTH, OPTA_PANEL_HEIGHT),
    sldOptaFamilyStyle({ expansion: 'A0602', slot: 2 }),
  ),
];

const BY_TYPE = new Map(SYMBOLS.map((s) => [s.type, s]));

function listSymbols() {
  return SYMBOLS.map(({
    type, label, group, width, height, ports, fill, stroke, shape, capacityGal, pumps, trains, moduleGal, tpoCount, legCount, compartments, circuits, expansion, slot,
  }) => ({
    type, label, group, width, height, ports, fill, stroke, shape,
    capacityGal, pumps, trains, moduleGal, tpoCount, legCount, compartments, circuits, expansion, slot,
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
  return portWorldPosition(node, sym, port);
}

/** Resolve "nodeId:portId" handle string. */
function resolveHandle(handle, nodes) {
  const s = String(handle || '');
  const i = s.indexOf(':');
  if (i < 0) return null;
  const nodeId = s.slice(0, i);
  const portId = s.slice(i + 1);
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
  buildPowerPanelPorts,
  OPTA_PANEL_WIDTH,
  OPTA_PANEL_HEIGHT,
};
