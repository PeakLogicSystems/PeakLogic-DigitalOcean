// Infiltrator ECOPOD® — fixed-film ATU in fiberglass tank (E300 class, 3,000 GPD).
// 3D is representative of E300-VC / commercial fiberglass layout per Infiltrator standard details.

export const ECOPOD_COLORS = {
  fiberglass: 0x64748b,
  fiberglassTint: 0x475569,
  media: 0x166534,
  mediaDark: 0x14532d,
  clarifier: 0x0ea5e9,
  water: 0x38bdf8,
  pipe: 0x2563eb,
  blower: 0xf59e0b,
  panel: 0xcbd5e1,
  panelTrim: 0x475569,
  riser: 0x334155,
  drip: 0x4ade80,
  concrete: 0x9ca3af,
};

/** Representative E300 vertical fiberglass tank (not certified as-built). */
export const ECOPOD_E300_DIMS = {
  model: 'E300-VC',
  designGpd: 3000,
  tankDiameterFt: 8.5,
  tankShellHeightFt: 11,
  tankVolumeGal: 4200,
  pretreatMinGal: 1000,
  mediaPodDiameterFt: 4.2,
  buryDepthFt: 8,
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

function dripField(THREE, group, cx, cz, w, d) {
  const mat = stdMat(THREE, ECOPOD_COLORS.drip, { roughness: 0.95 });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  field.rotation.x = -Math.PI / 2;
  field.position.set(cx, 0.05, cz);
  group.add(field);
  for (let r = 0; r < 5; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const e = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.07, 6),
        stdMat(THREE, 0x166534),
      );
      e.position.set(cx - w / 2 + (c + 0.5) * (w / 8), 0.07, cz - d / 2 + (r + 0.5) * (d / 5));
      group.add(e);
    }
  }
}

/**
 * @param {object} THREE
 * @param {object} [opts] - { name, scale, designGpd, showDrip, showPretreat }
 */
export function buildEcopod(THREE, opts = {}) {
  const scale = opts.scale ?? 1;
  const name = opts.name || 'ECOPOD E300';
  const dims = { ...ECOPOD_E300_DIMS, ...(opts.dims || {}) };
  const showDrip = opts.showDrip !== false;
  const showPretreat = opts.showPretreat !== false;
  const group = new THREE.Group();
  const pickables = [];

  const FT = 0.32;
  const tankR = (dims.tankDiameterFt * FT) / 2;
  const tankH = dims.tankShellHeightFt * FT;
  const bury = dims.buryDepthFt * FT;
  const gradeY = 0;
  const tankCY = gradeY - bury + tankH / 2;

  const meta = {
    zone: true,
    type: 'ecopod',
    label: name,
    typeLabel: `ECOPOD ${dims.model}`,
    description: `Infiltrator fixed-film ECOPOD — ${dims.designGpd.toLocaleString()} GPD. Fiberglass tank with submerged media pod, intra-tank clarifier, external blower.`,
    designGpd: dims.designGpd,
    model: dims.model,
    dims,
    dispersal: 'drip_drainfield',
    tanks: [
      ...(showPretreat ? [{
        id: 'pretreat',
        label: 'Pretreatment / septic (min.)',
        capacityGal: dims.pretreatMinGal,
      }] : []),
      {
        id: 'ecopod_vessel',
        label: 'ECOPOD fiberglass treatment tank',
        capacityGal: dims.tankVolumeGal,
      },
      {
        id: 'media_pod',
        label: 'Fixed-film media pod (submerged)',
        note: 'No internal moving parts',
      },
      ...(showDrip ? [{
        id: 'drip',
        label: 'Drip drainfield',
        dispersal: 'pressure_compensated_drip',
      }] : []),
    ],
    components: [
      '4" PVC influent',
      'Aerobic fixed-film media',
      'Intra-tank clarifier annulus',
      'External blower / air distribution',
      'Control panel with alarm',
      '4" treated effluent outlet',
    ],
  };

  if (showPretreat) {
    const ptR = 1.35;
    const ptH = 2.2;
    const pt = new THREE.Mesh(
      new THREE.CylinderGeometry(ptR, ptR, ptH, 32),
      stdMat(THREE, 0x78716c, { opacity: 0.38, roughness: 0.9 }),
    );
    pt.position.set(-tankR - 2.2, gradeY - bury * 0.55 + ptH / 2, 0);
    pt.userData.tankLabel = `Pretreat ≥${dims.pretreatMinGal} gal`;
    group.add(pt);
    pickables.push(pt);

    const ptRiser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.4, 0.5, 16),
      stdMat(THREE, ECOPOD_COLORS.riser, { metalness: 0.35 }),
    );
    ptRiser.position.set(-tankR - 2.2, gradeY + 0.25, 0);
    group.add(ptRiser);
  }

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(tankR, tankR * 1.02, tankH, 48),
    stdMat(THREE, ECOPOD_COLORS.fiberglass, { opacity: 0.32, roughness: 0.85 }),
  );
  shell.position.y = tankCY;
  shell.castShadow = true;
  shell.userData.tankLabel = `Fiberglass ${dims.tankVolumeGal.toLocaleString()} gal`;
  group.add(shell);
  pickables.push(shell);

  for (let band = 0; band < 3; band += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(tankR + 0.03, 0.04, 8, 48),
      stdMat(THREE, ECOPOD_COLORS.fiberglassTint, { metalness: 0.35 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = tankCY - tankH / 2 + 0.5 + band * (tankH - 1) / 2;
    group.add(ring);
  }

  const waterH = tankH - 0.5;
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(tankR - 0.15, tankR - 0.15, waterH, 40),
    stdMat(THREE, ECOPOD_COLORS.water, { opacity: 0.45, roughness: 0.25 }),
  );
  water.position.y = tankCY - 0.1;
  group.add(water);

  const podR = (dims.mediaPodDiameterFt * FT) / 2;
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(podR, podR * 0.95, tankH * 0.72, 32),
    stdMat(THREE, ECOPOD_COLORS.media, { opacity: 0.55, roughness: 0.8 }),
  );
  pod.position.y = tankCY - 0.15;
  pod.userData.tankLabel = 'ECOPOD media pod';
  group.add(pod);
  pickables.push(pod);

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.5, 0.35),
      stdMat(THREE, ECOPOD_COLORS.mediaDark),
    );
    block.position.set(
      Math.cos(angle) * podR * 0.55,
      tankCY - 0.2 + (i % 4) * 0.55,
      Math.sin(angle) * podR * 0.55,
    );
    group.add(block);
  }

  const clarifier = new THREE.Mesh(
    new THREE.TorusGeometry(tankR - 0.35, 0.28, 12, 48),
    stdMat(THREE, ECOPOD_COLORS.clarifier, { opacity: 0.35 }),
  );
  clarifier.rotation.x = Math.PI / 2;
  clarifier.position.y = tankCY + tankH * 0.12;
  group.add(clarifier);

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(tankR + 0.8, tankR + 0.9, 0.22, 48),
    stdMat(THREE, ECOPOD_COLORS.concrete, { roughness: 0.95 }),
  );
  pad.position.y = gradeY + 0.11;
  group.add(pad);

  const riser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.58, 0.65, 20),
    stdMat(THREE, ECOPOD_COLORS.riser, { metalness: 0.4 }),
  );
  riser.position.set(0, gradeY + 0.45, 0);
  group.add(riser);

  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.08, 24),
    stdMat(THREE, ECOPOD_COLORS.panelTrim, { metalness: 0.45 }),
  );
  hatch.position.set(0, gradeY + 0.78, 0);
  group.add(hatch);

  const inlet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 2.2, 12),
    stdMat(THREE, ECOPOD_COLORS.pipe, { metalness: 0.3 }),
  );
  inlet.rotation.z = Math.PI / 2;
  inlet.position.set(-tankR - 1.1, gradeY + 0.35, -0.8);
  group.add(inlet);

  const outlet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 3.5, 12),
    stdMat(THREE, ECOPOD_COLORS.pipe, { metalness: 0.3 }),
  );
  outlet.rotation.x = Math.PI / 2;
  outlet.position.set(0.5, gradeY + 0.35, tankR + 1.75);
  group.add(outlet);

  const blower = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.85, 0.55),
    stdMat(THREE, ECOPOD_COLORS.blower, { metalness: 0.35 }),
  );
  blower.position.set(tankR + 1.1, gradeY + 0.55, 0);
  group.add(blower);

  const airLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8),
    stdMat(THREE, ECOPOD_COLORS.pipe),
  );
  airLine.position.set(tankR + 0.55, gradeY + 0.55, 0);
  airLine.rotation.z = Math.PI / 2;
  group.add(airLine);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.15, 0.28),
    stdMat(THREE, ECOPOD_COLORS.panel),
  );
  panel.position.set(tankR + 1.1, gradeY + 1.15, 0.85);
  panel.castShadow = true;
  Object.assign(panel.userData, meta);
  group.add(panel);
  pickables.push(panel);

  const panelFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.75, 0.03),
    stdMat(THREE, ECOPOD_COLORS.panelTrim, { metalness: 0.25 }),
  );
  panelFace.position.set(tankR + 1.1, gradeY + 1.2, 1.0);
  group.add(panelFace);

  if (showDrip) {
    dripField(THREE, group, 0, tankR + 5.5, 10, 6);
  }

  group.scale.setScalar(scale);
  meta.pickables = pickables;
  return { group, pickables, meta };
}
