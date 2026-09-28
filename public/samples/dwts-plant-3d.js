// DWTS treatment plant — trash tank, parallel 1,250 gal ATU modules, drip drainfield.

export const PLANT_COLORS = {
  concrete: 0x9ca3af,
  trash: 0x78716c,
  treatment: 0x22c55e,
  water: 0x0ea5e9,
  drip: 0x4ade80,
  dripTube: 0x166534,
  cabinet: 0xcbd5e1,
};

function stdMat(THREE, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.1,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
  });
  m.userData.baseColor = new THREE.Color(color);
  return m;
}

function buriedCylinder(THREE, group, { x, z, r, h, color, opacity = 0.35 }) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 32),
    stdMat(THREE, color, { opacity, roughness: 0.88 }),
  );
  mesh.position.set(x, -h / 2 + 0.2, z);
  mesh.castShadow = true;
  group.add(mesh);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r + 0.04, 0.05, 8, 32),
    stdMat(THREE, 0x475569, { metalness: 0.35 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.2, z);
  group.add(ring);
  return mesh;
}

function dripDrainfield(THREE, group, cx, cz, w, d) {
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    stdMat(THREE, PLANT_COLORS.drip, { roughness: 0.95 }),
  );
  field.rotation.x = -Math.PI / 2;
  field.position.set(cx, 0.04, cz);
  group.add(field);

  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      const px = cx - w / 2 + (c + 0.5) * (w / 10);
      const pz = cz - d / 2 + (r + 0.5) * (d / 6);
      const emitter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6),
        stdMat(THREE, PLANT_COLORS.dripTube),
      );
      emitter.position.set(px, 0.08, pz);
      group.add(emitter);
    }
  }

  const header = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, w * 0.85, 10),
    stdMat(THREE, 0x2563eb, { metalness: 0.3 }),
  );
  header.rotation.z = Math.PI / 2;
  header.position.set(cx, 0.35, cz - d / 2 - 0.6);
  group.add(header);
}

/**
 * @param {object} THREE
 * @param {object} [opts]
 */
export function buildDwtsPlant(THREE, opts = {}) {
  const scale = opts.scale ?? 1;
  const name = opts.name || 'DWTU Plant';
  const trashGal = opts.trashGal ?? 1000;
  const moduleGal = opts.moduleGal ?? 1250;
  const moduleCount = opts.moduleCount ?? 4;
  const group = new THREE.Group();
  const pickables = [];

  const meta = {
    zone: true,
    type: 'dwts_plant',
    label: name,
    typeLabel: 'DWTU treatment plant',
    description: `Trash ≥${trashGal.toLocaleString()} gal → ${moduleCount}× parallel ${moduleGal.toLocaleString()} gal ATU → drip drainfield.`,
    alarmTag: opts.alarmTag || 'ALT_FAULT',
    levelTag: opts.levelTag || 'LVL_HIGH',
    trashGal,
    moduleGal,
    moduleCount,
    dispersal: 'drip_drainfield',
    processChain: opts.processChain || [],
    tanks: opts.tanks || [],
    detailTags: opts.detailTags || [],
  };

  const padW = 16;
  const padD = 22;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(padW, 0.26, padD),
    stdMat(THREE, PLANT_COLORS.concrete, { roughness: 0.95 }),
  );
  slab.position.set(0, 0.13, 4);
  group.add(slab);

  const trashR = trashGal >= 1500 ? 1.5 : 1.35;
  const trashMesh = buriedCylinder(THREE, group, {
    x: -5.5, z: 2, r: trashR, h: 2.4, color: PLANT_COLORS.trash,
  });
  trashMesh.userData.tankLabel = `Trash ${trashGal.toLocaleString()} gal`;
  pickables.push(trashMesh);

  const spacing = 2.6;
  const startX = -((moduleCount - 1) * spacing) / 2;
  for (let i = 0; i < moduleCount; i += 1) {
    const x = startX + i * spacing;
    const tank = buriedCylinder(THREE, group, {
      x, z: 2, r: 1.05, h: 2.1, color: PLANT_COLORS.treatment, opacity: 0.42,
    });
    tank.userData.tankLabel = `ATU ${i + 1} — ${moduleGal.toLocaleString()} gal`;
    const reactor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.85, 1.6, 20),
      stdMat(THREE, PLANT_COLORS.treatment, { opacity: 0.55 }),
    );
    reactor.position.set(x, 0.95, 2);
    group.add(reactor);
    const blower = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.5, 0.35),
      stdMat(THREE, 0xf59e0b, { metalness: 0.35 }),
    );
    blower.position.set(x, 1.85, 2.6);
    group.add(blower);
    pickables.push(tank);
  }

  dripDrainfield(THREE, group, 0, 11, 12, 7);

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.5, 0.5),
    stdMat(THREE, PLANT_COLORS.cabinet),
  );
  cab.position.set(6.5, 0.95, 0);
  Object.assign(cab.userData, meta);
  group.add(cab);
  pickables.push(cab);

  const influent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 6, 10),
    stdMat(THREE, 0x2563eb, { metalness: 0.3 }),
  );
  influent.rotation.x = Math.PI / 2;
  influent.position.set(-5.5, 0.4, -1);
  group.add(influent);

  group.scale.setScalar(scale);
  meta.pickables = pickables;
  return { group, pickables, meta };
}
