// Dual ATU (DWTU) — pretreatment, two parallel trains with TPO aeration, discharge dosing.
// Matches logic/33_dual_atu.st and lift_station_dual_atu template.

export const ATU_COLORS = {
  concrete: 0x9ca3af,
  tank: 0x64748b,
  tankGlass: 0x475569,
  water: 0x0ea5e9,
  reactor: 0x22c55e,
  blower: 0xf59e0b,
  pipe: 0x2563eb,
  cabinet: 0xcbd5e1,
  hatch: 0x334155,
};

function stdMat(THREE, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.12,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
  });
  m.userData.baseColor = new THREE.Color(color);
  return m;
}

function buriedTank(THREE, group, { x, z, radius, height, color, label, opacity = 0.32 }) {
  const y = -height / 2 + 0.15;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 36);
  const mesh = new THREE.Mesh(geo, stdMat(THREE, color, { opacity, roughness: 0.85 }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.tankLabel = label;
  group.add(mesh);

  const waterH = height - 0.4;
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(radius - 0.12, radius - 0.12, waterH, 28),
    stdMat(THREE, ATU_COLORS.water, { opacity: 0.5, roughness: 0.3 }),
  );
  water.position.set(x, y - height / 2 + waterH / 2 + 0.2, z);
  group.add(water);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.05, 0.06, 8, 36),
    stdMat(THREE, ATU_COLORS.hatch, { metalness: 0.4 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.18, z);
  group.add(ring);

  return mesh;
}

/**
 * @param {object} THREE
 * @param {object} [opts] - { name, scale, designGpd }
 */
export function buildDualAtu(THREE, opts = {}) {
  const scale = opts.scale ?? 1;
  const name = opts.name || 'Dual ATU';
  const group = new THREE.Group();
  const pickables = [];

  const meta = {
    zone: true,
    type: 'dual_atu',
    label: name,
    typeLabel: 'Dual ATU (duplex + TPO)',
    description: 'Pretreatment tank, two parallel ATU trains with ALT2 alternation and TPO aeration schedules, discharge dosing chamber.',
    alarmTag: 'ALT_FAULT',
    alarmTags: ['ALT_FAULT', 'ALT_FAULT2'],
    levelTag: 'LVL_HIGH',
    designGpd: opts.designGpd ?? 5000,
    detailTags: [
      ['ATU-1 alternator fault', 'ALT_FAULT'],
      ['ATU-2 alternator fault', 'ALT_FAULT2'],
      ['TPO-1 aeration out', 'TPO1_OUT'],
      ['TPO-2 aeration out', 'TPO2_OUT'],
      ['Train 1 lead run', 'LEAD_RUN'],
      ['Train 2 lead run', 'LEAD_RUN2'],
    ],
  };

  const padW = 14;
  const padD = 9;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(padW, 0.28, padD),
    stdMat(THREE, ATU_COLORS.concrete, { roughness: 0.95 }),
  );
  slab.position.y = 0.14;
  slab.receiveShadow = true;
  group.add(slab);

  // Pretreatment 2,500 gal — largest buried cylinder
  buriedTank(THREE, group, {
    x: -3.8, z: 0, radius: 1.65, height: 2.8, color: ATU_COLORS.tank, label: 'Pretreatment 2,500 gal',
  });

  // Two ATU reactor vessels (dual trains)
  for (const [i, x] of [[0, 0.8], [1, 3.2]].entries()) {
    const reactor = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.15, 2.4, 24),
      stdMat(THREE, ATU_COLORS.reactor, { opacity: 0.45, roughness: 0.8 }),
    );
    reactor.position.set(x, 0.35, 0);
    reactor.castShadow = true;
    reactor.userData.train = i + 1;
    group.add(reactor);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      stdMat(THREE, ATU_COLORS.reactor, { metalness: 0.2 }),
    );
    dome.position.set(x, 1.55, 0);
    group.add(dome);

    const blower = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.7, 0.45),
      stdMat(THREE, ATU_COLORS.blower, { metalness: 0.35 }),
    );
    blower.position.set(x, 2.05, 0.75);
    group.add(blower);

    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8),
      stdMat(THREE, ATU_COLORS.pipe, { metalness: 0.3 }),
    );
    pipe.position.set(x, 1.85, 0.38);
    group.add(pipe);
  }

  // Discharge / dosing 1,500 gal
  buriedTank(THREE, group, {
    x: 5.5, z: 0, radius: 1.25, height: 2.2, color: ATU_COLORS.tankGlass, label: 'Discharge 1,500 gal',
  });

  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.6, 0.55),
    stdMat(THREE, ATU_COLORS.cabinet),
  );
  cabinet.position.set(-5.8, 1.05, 2.8);
  cabinet.castShadow = true;
  Object.assign(cabinet.userData, meta);
  group.add(cabinet);
  pickables.push(cabinet);

  const header = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, padW - 2, 12),
    stdMat(THREE, ATU_COLORS.pipe, { metalness: 0.35 }),
  );
  header.rotation.z = Math.PI / 2;
  header.position.set(0, 0.55, -3.2);
  group.add(header);

  group.scale.setScalar(scale);
  meta.pickables = pickables;
  return { group, pickables, meta };
}
