// Home STEP — dual-compartment septic tank + filtered effluent pump vault (simplex lift).

export const STEP_COLORS = {
  septic: 0x78716c,
  septicGlass: 0x57534e,
  water: 0x38bdf8,
  riser: 0x64748b,
  pump: 0x1e293b,
  motor: 0xf59e0b,
  cabinet: 0xcbd5e1,
  grass: 0x166534,
};

function stdMat(THREE, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.1,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
  });
  m.userData.baseColor = new THREE.Color(color);
  return m;
}

/**
 * @param {object} THREE
 * @param {object} [opts] - { name, scale, capacityGal }
 */
export function buildHomeStep(THREE, opts = {}) {
  const scale = opts.scale ?? 1;
  const name = opts.name || 'Home STEP';
  const capacityGal = opts.capacityGal ?? 1000;
  const group = new THREE.Group();
  const pickables = [];

  const meta = {
    zone: true,
    type: 'home_step',
    label: name,
    typeLabel: 'Home STEP (simplex)',
    description: `${capacityGal.toLocaleString()} gal dual-compartment septic with filtered effluent pump vault.`,
    alarmTag: 'ALT_FAULT',
    levelTag: 'LVL_HIGH',
    capacityGal,
    detailTags: [
      ['Simplex alarm', 'ALT_FAULT'],
      ['High level', 'LVL_HIGH'],
      ['Pump run', 'MOTOR1_RUN'],
    ],
  };

  const gradeY = 0;
  const tankLen = 2.6;
  const tankW = 1.35;
  const tankH = 1.15;
  const bury = tankH * 0.75;

  const tank = new THREE.Mesh(
    new THREE.BoxGeometry(tankLen, tankH, tankW),
    stdMat(THREE, STEP_COLORS.septic, { opacity: 0.38, roughness: 0.9 }),
  );
  tank.position.set(0, gradeY - bury + tankH / 2, 0);
  tank.castShadow = true;
  Object.assign(tank.userData, meta);
  group.add(tank);
  pickables.push(tank);

  const partition = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, tankH - 0.2, tankW - 0.15),
    stdMat(THREE, STEP_COLORS.septicGlass),
  );
  partition.position.set(-0.35, tank.position.y, 0);
  group.add(partition);

  const water = new THREE.Mesh(
    new THREE.BoxGeometry(tankLen - 0.2, tankH - 0.35, tankW - 0.2),
    stdMat(THREE, STEP_COLORS.water, { opacity: 0.45, roughness: 0.25 }),
  );
  water.position.set(0.15, tank.position.y - 0.05, 0);
  group.add(water);
  meta.levelFill = water;

  const riser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.38, 0.55, 16),
    stdMat(THREE, STEP_COLORS.riser, { metalness: 0.35 }),
  );
  riser.position.set(0.85, gradeY + 0.28, 0);
  group.add(riser);

  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20),
    stdMat(THREE, STEP_COLORS.riser, { metalness: 0.45 }),
  );
  hatch.position.set(0.85, gradeY + 0.58, 0);
  group.add(hatch);

  const pump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.35, 12),
    stdMat(THREE, STEP_COLORS.motor, { metalness: 0.4 }),
  );
  pump.position.set(0.85, gradeY - 0.15, 0);
  group.add(pump);

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.65, 0.28),
    stdMat(THREE, STEP_COLORS.cabinet),
  );
  cab.position.set(-1.05, gradeY + 0.42, 0.55);
  group.add(cab);

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.12, 2.2),
    stdMat(THREE, STEP_COLORS.grass, { roughness: 0.98 }),
  );
  pad.position.set(0, gradeY + 0.06, 0);
  group.add(pad);

  group.scale.setScalar(scale);
  meta.pickables = pickables;
  return { group, pickables, meta };
}
