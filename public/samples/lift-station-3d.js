// Reusable 3D lift-station objects (simplex / duplex / triplex).
//
// These match the PeakLogic lift-station device templates + ST programs:
//   src/devices/templates/lift_station_{simplex,duplex,triplex}.json
//   st/logic/lift_station_{simplex,duplex,triplex}.st
//
// The module is renderer-agnostic: pass in the THREE namespace so it can be
// shared by any Three.js scene (e.g. the FL service-area map) without its own
// import map.
//
// Usage:
//   import { LIFT_STATION_TYPES, buildLiftStation } from './lift-station-3d.js';
//   const { group, pickables } = buildLiftStation(THREE, 'duplex', { name: 'LS-01 Bayshore' });
//   scene.add(group);
//   // pickables[].userData carries { label, description, alarmTag, detailTags, levelTag, levelFill }

export const LS_COLORS = {
  well: 0x475569,
  wellRing: 0x64748b,
  slab: 0x94a3b8,
  water: 0x0ea5e9,
  pump: 0x334155,
  motor: 0xf59e0b,
  pipe: 0x64748b,
  cabinet: 0xcbd5e1,
  cabinetTrim: 0x475569,
  vent: 0x78716c,
  hatch: 0x1e293b,
};

// Per-type metadata. Tag ids match the shipped tag fixtures so a station on the
// map reflects live SCADA values as soon as a device of that type is added.
export const LIFT_STATION_TYPES = {
  simplex: {
    label: 'Simplex lift station',
    short: 'Simplex',
    pumps: 1,
    accent: 0x38bdf8,
    stProgram: 'logic/lift_station_simplex.st',
    template: 'lift_station_simplex',
    alarmTag: 'SPX_ALM',
    levelTag: 'SPX_LEVEL',
    description: 'Single-pump submersible wet-well station with redundant level floats. ST runs on the device; alarm + status tags publish to SCADA.',
    detailTags: [
      ['Station alarm', 'SPX_ALM'],
      ['Wet well level %', 'SPX_LEVEL'],
      ['Pump 1 run', 'SPX_P1_RUN'],
      ['Pump 1 fault', 'SPX_P1_FAIL'],
      ['High level alarm', 'SPX_HI_ALM'],
      ['Low level alarm', 'SPX_LO_ALM'],
    ],
  },
  duplex: {
    label: 'Duplex lift station',
    short: 'Duplex',
    pumps: 2,
    accent: 0x34d399,
    stProgram: 'logic/36_duplex_lift_station.st',
    template: 'lift_station_dual_duplex',
    alarmTag: 'ALT_FAULT',
    levelTag: 'TANK_LVL',
    description: 'Two-pump lead/lag alternating wet-well station (ALT2) with HOA faceplates and level floats. ST runs on the device; alarm + status tags publish to SCADA.',
    detailTags: [
      ['Alternator fault', 'ALT_FAULT'],
      ['Wet well level %', 'TANK_LVL'],
      ['Lead running', 'LEAD_RUN'],
      ['Pump 1 run', 'MOTOR1_RUN'],
      ['Pump 2 run', 'MOTOR2_RUN'],
      ['High level', 'LVL_HIGH'],
      ['Lag request', 'LVL_LAG'],
      ['System run', 'SYS_RUN'],
    ],
  },
  triplex: {
    label: 'Triplex lift station',
    short: 'Triplex',
    pumps: 3,
    accent: 0xa78bfa,
    stProgram: 'logic/lift_station_triplex.st',
    template: 'lift_station_triplex',
    alarmTag: 'TPX_ALM',
    levelTag: 'TPX_LEVEL',
    description: 'Three-pump lead/lag/lag2 alternating wet-well station. ST runs on the device; alarm + status tags publish to SCADA.',
    detailTags: [
      ['Station alarm', 'TPX_ALM'],
      ['Alternator fault', 'TPX_FAULT'],
      ['Wet well level %', 'TPX_LEVEL'],
      ['Lead running', 'TPX_LEAD_RUN'],
      ['Pump 1 run', 'TPX_P1_RUN'],
      ['Pump 2 run', 'TPX_P2_RUN'],
      ['Pump 3 run', 'TPX_P3_RUN'],
      ['High level alarm', 'TPX_HI_ALM'],
    ],
  },
};

function stdMat(THREE, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.1,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
  });
  m.userData.baseColor = new THREE.Color(color);
  return m;
}

/**
 * Build a lift-station 3D object.
 * @param {object} THREE - the three namespace
 * @param {'simplex'|'duplex'|'triplex'} type
 * @param {object} [opts] - { name, scale }
 * @returns {{ group: THREE.Group, pickables: THREE.Mesh[], meta: object }}
 */
export function buildLiftStation(THREE, type, opts = {}) {
  const spec = LIFT_STATION_TYPES[type] || LIFT_STATION_TYPES.simplex;
  const scale = opts.scale ?? 1;
  const name = opts.name || spec.label;

  const group = new THREE.Group();
  const pickables = [];

  const meta = {
    zone: true,
    type,
    label: name,
    typeLabel: spec.label,
    description: spec.description,
    alarmTag: spec.alarmTag,
    levelTag: spec.levelTag,
    detailTags: spec.detailTags,
    detailScreen: opts.detailScreen || '',
  };

  const WELL_R = 1.7;
  const WELL_H = 2.6;

  // Buried wet-well shell (top slightly above grade)
  const wellGeo = new THREE.CylinderGeometry(WELL_R, WELL_R, WELL_H, 40);
  const well = new THREE.Mesh(wellGeo, stdMat(THREE, LS_COLORS.well));
  well.position.y = WELL_H / 2 - WELL_H * 0.55;
  well.castShadow = true;
  well.receiveShadow = true;
  Object.assign(well.userData, meta);
  group.add(well);
  pickables.push(well);

  // Wet-well water column (scaled live by level %)
  const waterGeo = new THREE.CylinderGeometry(WELL_R - 0.18, WELL_R - 0.18, WELL_H - 0.3, 36);
  const water = new THREE.Mesh(waterGeo, stdMat(THREE, LS_COLORS.water, { opacity: 0.6, roughness: 0.3 }));
  water.position.y = well.position.y - 0.1;
  group.add(water);
  meta.levelFill = water;
  meta.levelFillBaseY = water.position.y;
  meta.levelFillHeight = WELL_H - 0.3;

  // Top slab / access deck
  const slabGeo = new THREE.CylinderGeometry(WELL_R + 0.35, WELL_R + 0.35, 0.28, 40);
  const slab = new THREE.Mesh(slabGeo, stdMat(THREE, LS_COLORS.slab));
  slab.position.y = well.position.y + WELL_H / 2 + 0.14;
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);
  const deckY = slab.position.y + 0.14;

  // Access hatch
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.06, 0.7),
    stdMat(THREE, LS_COLORS.hatch, { metalness: 0.3 }),
  );
  hatch.position.set(0, deckY + 0.03, 0);
  group.add(hatch);

  // Pumps around the wet well (submersible motors shown above deck for clarity)
  const pumpCount = spec.pumps;
  for (let i = 0; i < pumpCount; i++) {
    const ang = pumpCount === 1 ? Math.PI : (i / pumpCount) * Math.PI * 2 + Math.PI / 4;
    const r = pumpCount === 1 ? 0 : WELL_R * 0.55;
    const px = Math.cos(ang) * r;
    const pz = Math.sin(ang) * r;

    const pumpBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.7, 20),
      stdMat(THREE, LS_COLORS.pump, { metalness: 0.35, roughness: 0.5 }),
    );
    pumpBody.position.set(px, deckY + 0.35, pz);
    pumpBody.castShadow = true;
    group.add(pumpBody);

    const motor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.4, 16),
      stdMat(THREE, LS_COLORS.motor, { metalness: 0.4, roughness: 0.4 }),
    );
    motor.position.set(px, deckY + 0.9, pz);
    motor.castShadow = true;
    group.add(motor);

    // Discharge pipe up + over to header
    const riser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1.2, 12),
      stdMat(THREE, LS_COLORS.pipe, { metalness: 0.4 }),
    );
    riser.position.set(px, deckY + 0.9, pz);
    group.add(riser);
  }

  // Discharge header manifold across the deck
  const header = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, WELL_R * 2 + 1.4, 14),
    stdMat(THREE, LS_COLORS.pipe, { metalness: 0.4 }),
  );
  header.rotation.z = Math.PI / 2;
  header.position.set(0, deckY + 1.5, 0);
  group.add(header);

  // Control / RTU cabinet (where the ST program lives) beside the station
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.5, 0.55),
    stdMat(THREE, LS_COLORS.cabinet),
  );
  cabinet.position.set(WELL_R + 1.1, 0.75, WELL_R * 0.2);
  cabinet.castShadow = true;
  Object.assign(cabinet.userData, meta);
  group.add(cabinet);
  pickables.push(cabinet);

  const cabinetFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.1, 0.04),
    stdMat(THREE, LS_COLORS.cabinetTrim, { metalness: 0.3 }),
  );
  cabinetFace.position.set(WELL_R + 1.1, 0.85, WELL_R * 0.2 + 0.29);
  group.add(cabinetFace);

  // Antenna (cellular/MQTT uplink to cloud)
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8),
    stdMat(THREE, LS_COLORS.cabinetTrim, { metalness: 0.6 }),
  );
  antenna.position.set(WELL_R + 1.1, 2.05, WELL_R * 0.2);
  group.add(antenna);

  // Vent pipe
  const vent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 1.1, 12),
    stdMat(THREE, LS_COLORS.vent),
  );
  vent.position.set(-WELL_R - 0.4, 0.55, -WELL_R * 0.3);
  group.add(vent);

  group.scale.setScalar(scale);

  meta.pickables = pickables;
  return { group, pickables, meta };
}

/** Scale a station's water column mesh to a level percentage (0..100). */
export function applyLiftStationLevel(meta, levelPct) {
  const fill = meta?.levelFill;
  if (!fill) return;
  const pct = Math.max(0, Math.min(100, Number(levelPct) || 0)) / 100;
  const h = meta.levelFillHeight || 1;
  fill.scale.y = Math.max(0.02, pct);
  // keep the water column sitting on the well floor as it grows
  fill.position.y = (meta.levelFillBaseY - h / 2) + (h * pct) / 2;
}
