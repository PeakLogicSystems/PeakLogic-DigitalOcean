// Typed 3D objects for Facility Draw placements — dispatches to shared site builders.
//
// Usage:
//   import { buildPlacementObject } from './facilitydraw-symbol-3d.js';
//   const built = buildPlacementObject(THREE, placement);

import { buildLiftStation, applyLiftStationLevel } from './lift-station-3d.js';
import { buildDwtsPlant } from './dwts-plant-3d.js';

function stdMat(THREE, color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.08,
    transparent: opts.opacity != null && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
  });
  m.userData.baseColor = new THREE.Color(color);
  return m;
}

function cssColor(THREE, hex) {
  return new THREE.Color(String(hex || '#64748b'));
}

function buildBoxPlacement(THREE, p) {
  const group = new THREE.Group();
  const pickables = [];
  const isDrip = p.category === 'drip';
  const h = Math.max(p.size.heightFt, 0.2);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(p.size.widthFt, h, p.size.depthFt),
    stdMat(THREE, cssColor(THREE, p.color), {
      roughness: isDrip ? 0.95 : 0.72,
      metalness: p.category === 'lift' ? 0.2 : 0.08,
    }),
  );
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.placement = p;
  group.add(mesh);
  pickables.push(mesh);

  if (!isDrip && p.size.heightFt > 1) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: cssColor(THREE, p.stroke) }),
    );
    outline.position.copy(mesh.position);
    group.add(outline);
  }

  return {
    group,
    pickables,
    meta: { placement: p, zone: false },
  };
}

function buildTankPlacement(THREE, p) {
  const group = new THREE.Group();
  const pickables = [];
  const r = Math.max(p.size.widthFt, p.size.depthFt) / 2;
  const h = Math.max(p.size.heightFt, 1.2);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 24),
    stdMat(THREE, cssColor(THREE, p.color), { opacity: 0.55, roughness: 0.88 }),
  );
  mesh.position.y = h / 2;
  mesh.userData.placement = p;
  group.add(mesh);
  pickables.push(mesh);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r + 0.05, 0.06, 8, 24),
    stdMat(THREE, 0x475569, { metalness: 0.35 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);

  return { group, pickables, meta: { placement: p, zone: false } };
}

function addAnnulusHalf(THREE, group, ri, ro, height, color, topHalf) {
  const shape = new THREE.Shape();
  if (topHalf) {
    shape.moveTo(-ri, 0);
    shape.absarc(0, 0, ri, Math.PI, 0, true);
    shape.lineTo(ro, 0);
    shape.absarc(0, 0, ro, 0, Math.PI, false);
  } else {
    shape.moveTo(-ri, 0);
    shape.absarc(0, 0, ri, 0, Math.PI, false);
    shape.lineTo(ro, 0);
    shape.absarc(0, 0, ro, Math.PI, 0, true);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, stdMat(THREE, color, { opacity: 0.55, roughness: 0.82 }));
  mesh.position.y = 0.4;
  group.add(mesh);
  return mesh;
}

function buildMleTankPlacement(THREE, p) {
  const group = new THREE.Group();
  const pickables = [];
  const planD = Math.max(p.size.widthFt, p.size.depthFt);
  const scale = planD / 30;
  const tankR = 4.5 * scale;
  const tankH = Math.max(p.size.heightFt, 20);
  const ri = tankR * (75 / 118);
  const ro = tankR * (115 / 118);
  const clarR = ri;
  const zoneH = tankH * 0.88;

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(tankR, tankR, tankH, 40),
    stdMat(THREE, 0x64748b, { opacity: 0.42, roughness: 0.88 }),
  );
  shell.position.y = tankH / 2;
  shell.userData.placement = p;
  group.add(shell);
  pickables.push(shell);

  addAnnulusHalf(THREE, group, ri, ro, zoneH, 0x06b6d4, true);
  addAnnulusHalf(THREE, group, ri, ro, zoneH, 0x6366f1, false);

  const clarifier = new THREE.Mesh(
    new THREE.CylinderGeometry(clarR, clarR, zoneH, 32),
    stdMat(THREE, 0xdbeafe, { opacity: 0.62, roughness: 0.75 }),
  );
  clarifier.position.y = zoneH / 2 + 0.4;
  group.add(clarifier);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(tankR + 0.12 * scale, tankR + 0.12 * scale, 0.35 * scale, 32),
    stdMat(THREE, 0x475569, { metalness: 0.25 }),
  );
  cap.position.y = tankH + 0.2;
  group.add(cap);

  const scraper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45 * scale, 0.45 * scale, 0.9 * scale, 16),
    stdMat(THREE, 0xf59e0b, { metalness: 0.3 }),
  );
  scraper.position.y = tankH + 0.45 * scale;
  group.add(scraper);

  const midR = (ri + ro) * 0.5;
  const probeColors = [0x22c55e, 0x06b6d4, 0x6366f1, 0xa855f7];
  const probeAngles = [-0.35 * Math.PI, 0.25 * Math.PI, 0.75 * Math.PI, -0.7 * Math.PI];
  probeAngles.forEach((a, i) => {
    const probe = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 * scale, 10, 10),
      stdMat(THREE, probeColors[i]),
    );
    probe.position.set(
      Math.cos(a) * midR,
      tankH - 1.2 * scale,
      Math.sin(a) * midR,
    );
    group.add(probe);
  });

  return { group, pickables, meta: { placement: p, zone: true, type: 'integrated_mle' } };
}

function buildDripFieldPlacement(THREE, p) {
  const group = new THREE.Group();
  const pickables = [];
  const w = Math.max(p.size.widthFt, 4);
  const d = Math.max(p.size.depthFt, 4);
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    stdMat(THREE, 0x4ade80, { roughness: 0.95 }),
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = 0.05;
  field.userData.placement = p;
  group.add(field);
  pickables.push(field);

  const cols = Math.min(12, Math.max(4, Math.round(w / 3)));
  const rows = Math.min(8, Math.max(3, Math.round(d / 3)));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const px = -w / 2 + (c + 0.5) * (w / cols);
      const pz = -d / 2 + (r + 0.5) * (d / rows);
      const emitter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6),
        stdMat(THREE, 0x166534),
      );
      emitter.position.set(px, 0.08, pz);
      group.add(emitter);
    }
  }

  return { group, pickables, meta: { placement: p, zone: false } };
}

function applyMetaOverrides(built, p) {
  const meta = built.meta || {};
  if (p.meta?.alarmTag) meta.alarmTag = p.meta.alarmTag;
  if (p.meta?.levelTag) meta.levelTag = p.meta.levelTag;
  if (p.deviceId) meta.deviceId = p.deviceId;
  if (p.zoneId) meta.zoneId = p.zoneId;
  if (p.role) meta.role = p.role;
  meta.placement = p;
  for (const mesh of built.pickables || []) {
    Object.assign(mesh.userData, meta);
  }
  return built;
}

/**
 * @param {object} THREE
 * @param {object} placement — buildSceneFromFacilityDraw placement
 */
export function buildPlacementObject(THREE, placement) {
  const p = placement;
  const m = p.meta || {};

  if (p.model3d === 'lift_simplex' || p.model3d === 'lift_duplex') {
    const type = p.model3d === 'lift_duplex' ? 'duplex' : 'simplex';
    const built = buildLiftStation(THREE, type, {
      name: p.label,
      scale: type === 'duplex' ? 0.88 : 0.72,
      detailScreen: m.detailScreen || '',
    });
    return applyMetaOverrides(built, p);
  }

  if (p.model3d === 'dwts_plant') {
    const built = buildDwtsPlant(THREE, {
      name: p.label,
      scale: 0.95,
      alarmTag: m.alarmTag || p.alarmTag,
      levelTag: m.levelTag || p.levelTag,
      trashGal: m.trashGal || 1000,
      moduleGal: m.moduleGal || 1250,
      moduleCount: m.moduleCount || 4,
      processChain: m.processChain || [],
      tanks: m.tanks || [],
    });
    return applyMetaOverrides(built, p);
  }

  if (p.model3d === 'tank') {
    return buildTankPlacement(THREE, p);
  }

  if (p.model3d === 'mle_tank') {
    return buildMleTankPlacement(THREE, p);
  }

  if (p.model3d === 'drip_field') {
    return buildDripFieldPlacement(THREE, p);
  }

  return buildBoxPlacement(THREE, p);
}

export { applyLiftStationLevel };
