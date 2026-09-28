// Reusable 3D split HVAC scene objects (single or double condenser + AHU).
//
// Tag ids align with Opta Parc firmware v2.3.81 (/mcsa HVAC + /ahu-env):
//   st/logic/opta_split_hvac.st
//   st/logic/opta_double_split_hvac.st
//
// Usage:
//   import { buildHvacSplitSite, HVAC_COLORS } from './hvac-split-3d.js';
//   const { group, pickables } = buildHvacSplitSite(THREE, 'single');

export const HVAC_COLORS = {
  building: 0xcbd5e1,
  buildingTrim: 0x64748b,
  slab: 0x94a3b8,
  grass: 0x4ade80,
  ahu: 0x6366f1,
  ahuTrim: 0x312e81,
  condenser: 0xe2e8f0,
  condenserTrim: 0x334155,
  fan: 0x64748b,
  lineSet: 0xb45309,
  cabinet: 0x475569,
  alarm: 0xef4444,
  ok: 0x22c55e,
};

export const HVAC_SITE_TYPES = {
  single: {
    label: 'Split HVAC',
    short: 'Split',
    condensers: 1,
    ahus: 1,
    accent: 0x38bdf8,
    stProgram: 'logic/opta_split_hvac.st',
    template: 'arduino_opta_hvac_split',
    alarmTag: 'SYS_ALM',
    description: 'Single split system — one indoor air handler and one outdoor condenser on Opta Parc MCSA + AHU env.',
    zones: {
      ahu1: {
        label: 'Air Handler',
        description: 'Indoor AHU — supply/return NTC and condensate pan leak rope on D1608E expansion.',
        alarmTag: 'AHU_ALM',
        detailScreen: 'screen_3',
        tags: [
          ['Supply temp °F', 'AHU1_SUPPLY_TEMP_F'],
          ['Return temp °F', 'AHU1_RETURN_TEMP_F'],
          ['Pan leak', 'AHU1_PAN_LEAK'],
          ['AHU alarm', 'AHU_ALM'],
        ],
      },
      cond1: {
        label: 'Outdoor Condenser',
        description: 'Split condenser — compressor and fan MCSA CTs on Opta I1–I4, refrigerant temps on expansion NTC.',
        alarmTag: 'COND_ALM',
        detailScreen: 'screen_4',
        tags: [
          ['Fan fault', 'FAN_FLT'],
          ['Compressor fault', 'COMP_FLT'],
          ['Hi side °F', 'COND_HI_TEMP'],
          ['Lo side °F', 'COND_LO_TEMP'],
          ['Condenser alarm', 'COND_ALM'],
        ],
      },
      opta: {
        label: 'Opta IoT-Link',
        description: 'Arduino Opta with D1608E expansion — MQTT Parc ST runtime, MCSA monitor, AHU env processor.',
        alarmTag: 'SYS_ALM',
        detailScreen: 'screen_2',
        tags: [
          ['System alarm', 'SYS_ALM'],
          ['Comp amps', 'COMP_AMPS'],
          ['Fan amps', 'FAN_AMPS'],
        ],
      },
    },
  },
  double: {
    label: 'Double Split HVAC',
    short: 'Double split',
    condensers: 2,
    ahus: 2,
    accent: 0xa78bfa,
    stProgram: 'logic/opta_double_split_hvac.st',
    template: 'arduino_opta_hvac_double_split',
    alarmTag: 'SYS_ALM',
    description: 'Double split — two indoor air handlers and two outdoor condensers on one Opta Parc gateway.',
    zones: {
      ahu1: {
        label: 'Air Handler 1',
        description: 'AHU 1 — I5/I6 supply/return NTC, X1_IRAW1 pan leak.',
        alarmTag: 'AHU1_ALM',
        detailScreen: 'screen_3',
        tags: [
          ['Supply °F', 'AHU1_SUPPLY_TEMP_F'],
          ['Return °F', 'AHU1_RETURN_TEMP_F'],
          ['Pan leak', 'AHU1_PAN_LEAK'],
          ['AHU1 alarm', 'AHU1_ALM'],
        ],
      },
      ahu2: {
        label: 'Air Handler 2',
        description: 'AHU 2 — I7/I8 supply/return NTC, X1_IRAW2 pan leak.',
        alarmTag: 'AHU2_ALM',
        detailScreen: 'screen_3',
        tags: [
          ['Supply °F', 'AHU2_SUPPLY_TEMP_F'],
          ['Return °F', 'AHU2_RETURN_TEMP_F'],
          ['Pan leak', 'AHU2_PAN_LEAK'],
          ['AHU2 alarm', 'AHU2_ALM'],
        ],
      },
      cond1: {
        label: 'Condenser 1',
        description: 'Outdoor unit 1 — fan/comp start+run CTs I1–I4, U1 hi/lo temps.',
        alarmTag: 'COND1_ALM',
        detailScreen: 'screen_4',
        tags: [
          ['Fan fault', 'COND1_FAN_FLT'],
          ['Comp fault', 'COND1_COMP_FLT'],
          ['Hi °F', 'COND1_HI_TEMP'],
          ['Lo °F', 'COND1_LO_TEMP'],
          ['Unit 1 alarm', 'COND1_ALM'],
        ],
      },
      cond2: {
        label: 'Condenser 2',
        description: 'Outdoor unit 2 — fan/comp start+run CTs I5–I8, U2 hi/lo temps.',
        alarmTag: 'COND2_ALM',
        detailScreen: 'screen_5',
        tags: [
          ['Fan fault', 'COND2_FAN_FLT'],
          ['Comp fault', 'COND2_COMP_FLT'],
          ['Hi °F', 'COND2_HI_TEMP'],
          ['Lo °F', 'COND2_LO_TEMP'],
          ['Unit 2 alarm', 'COND2_ALM'],
        ],
      },
      opta: {
        label: 'Opta IoT-Link',
        description: 'Dual-cond facility preset on /mcsa + dual AHU env on /ahu-env.',
        alarmTag: 'SYS_ALM',
        detailScreen: 'screen_2',
        tags: [
          ['System alarm', 'SYS_ALM'],
          ['Condenser 1 alarm', 'COND1_ALM'],
          ['Condenser 2 alarm', 'COND2_ALM'],
        ],
      },
    },
  },
};

function box(THREE, w, h, d, color, y = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.08 }),
  );
  mesh.position.y = y + h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function fanDisc(THREE, radius, y) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.08, 8, 24),
    new THREE.MeshStandardMaterial({ color: HVAC_COLORS.fan }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  g.add(ring);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.12, radius * 0.12, 0.08, 12),
    new THREE.MeshStandardMaterial({ color: 0x475569 }),
  );
  hub.position.y = y;
  g.add(hub);
  return g;
}

function lineSet(THREE, x1, y1, z1, x2, y2, z2) {
  const points = [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: HVAC_COLORS.lineSet, linewidth: 2 }),
  );
}

function buildCondenser(THREE, x, z, label) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(THREE, 3.2, 2.4, 1.6, HVAC_COLORS.condenser));
  g.add(box(THREE, 2.8, 0.15, 1.4, HVAC_COLORS.slab, -0.08));
  const fan = fanDisc(THREE, 0.55, 1.5);
  fan.position.set(-0.7, 0, 0);
  g.add(fan);
  g.add(box(THREE, 1.0, 1.2, 0.8, 0x94a3b8, 0.6));
  g.userData.condenserLabel = label;
  return g;
}

function buildAhu(THREE, x, z, label) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(THREE, 2.4, 1.0, 1.2, HVAC_COLORS.ahu, 0.5));
  g.add(box(THREE, 2.0, 0.4, 1.0, HVAC_COLORS.ahuTrim, 1.1));
  g.userData.ahuLabel = label;
  return g;
}

export function buildHvacSplitSite(THREE, type = 'single', opts = {}) {
  const meta = HVAC_SITE_TYPES[type] || HVAC_SITE_TYPES.single;
  const group = new THREE.Group();
  const pickables = [];
  const scale = opts.scale ?? 1;
  group.scale.setScalar(scale);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 28),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshStandardMaterial({ color: HVAC_COLORS.grass, roughness: 0.9 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(8, 0.01, 0);
  group.add(pad);

  const building = box(THREE, 10, 4, 8, HVAC_COLORS.building, 0);
  building.position.set(-6, 0, 0);
  group.add(building);

  const ahu1 = buildAhu(THREE, -7, -1.5, 'AHU 1');
  group.add(ahu1);
  pickables.push({
    mesh: ahu1,
    zoneId: 'ahu1',
    ...meta.zones.ahu1,
  });

  if (meta.ahus > 1) {
    const ahu2 = buildAhu(THREE, -7, 1.8, 'AHU 2');
    group.add(ahu2);
    pickables.push({
      mesh: ahu2,
      zoneId: 'ahu2',
      ...meta.zones.ahu2,
    });
  }

  const cond1 = buildCondenser(THREE, 6, -2, 'Condenser 1');
  group.add(cond1);
  pickables.push({
    mesh: cond1,
    zoneId: 'cond1',
    ...meta.zones.cond1,
  });
  group.add(lineSet(THREE, -5.5, 1.2, -1.5, 4.5, 1.2, -2));

  if (meta.condensers > 1) {
    const cond2 = buildCondenser(THREE, 6, 2.5, 'Condenser 2');
    group.add(cond2);
    pickables.push({
      mesh: cond2,
      zoneId: 'cond2',
      ...meta.zones.cond2,
    });
    group.add(lineSet(THREE, -5.5, 1.2, 1.8, 4.5, 1.2, 2.5));
  }

  const cabinet = box(THREE, 1.2, 1.6, 0.6, HVAC_COLORS.cabinet, 0);
  cabinet.position.set(-2, 0, 3.5);
  group.add(cabinet);
  pickables.push({
    mesh: cabinet,
    zoneId: 'opta',
    ...meta.zones.opta,
  });

  group.userData.meta = meta;
  return { group, pickables, meta };
}

export function applyHvacAlarmGlow(pickables, tagLookup) {
  for (const p of pickables) {
    const alarm = p.alarmTag ? tagLookup(p.alarmTag) : false;
    const mats = [];
    p.mesh.traverse((o) => {
      if (o.isMesh && o.material) mats.push(o.material);
    });
    for (const m of mats) {
      if (m.emissive) {
        m.emissive.setHex(alarm ? HVAC_COLORS.alarm : 0x000000);
        m.emissiveIntensity = alarm ? 0.35 : 0;
      }
    }
  }
}
