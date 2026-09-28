// Facility Draw site layout viewer — typed models at plan positions + pipe polylines + zones.
//
// Usage:
//   import { mountFacilityDrawSiteScene } from './facilitydraw-site-viewer.js';
//   mountFacilityDrawSiteScene(document.getElementById('canvas-wrap'), SITE);

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlacementObject, applyLiftStationLevel } from './facilitydraw-symbol-3d.js';

const PIPE_Y = 0.35;

function addPipeSegment(scene, x1, z1, x2, z2, y, mat) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.08) return;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 10), mat);
  const dir = new THREE.Vector3(dx, 0, dz).normalize();
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  pipe.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  scene.add(pipe);
}

function addPipeRun(scene, pts, y, mat) {
  if (!pts || pts.length < 2) return;
  for (let i = 0; i < pts.length - 1; i++) {
    addPipeSegment(scene, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, y, mat);
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat);
    joint.position.set(pts[i].x, y, pts[i].z);
    scene.add(joint);
  }
}

function fitCamera(camera, controls, plot, placements) {
  let minX = plot.minX;
  let maxX = plot.maxX;
  let minZ = plot.minZ;
  let maxZ = plot.maxZ;
  for (const p of placements) {
    const hw = p.size.widthFt / 2;
    const hd = p.size.depthFt / 2;
    minX = Math.min(minX, p.scene.x - hw);
    maxX = Math.max(maxX, p.scene.x + hw);
    minZ = Math.min(minZ, p.scene.z - hd);
    maxZ = Math.max(maxZ, p.scene.z + hd);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxZ - minZ, 20);
  camera.position.set(cx + span * 0.55, span * 0.42, cz + span * 0.55);
  controls.target.set(cx, 0, cz);
  controls.update();
}

function addZonePads(scene, zones) {
  const mats = [];
  for (const z of zones || []) {
    const b = z.bounds;
    const w = Math.max(b.maxX - b.minX, 2);
    const d = Math.max(b.maxZ - b.minZ, 2);
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 2, d + 2),
      new THREE.MeshStandardMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.08,
        roughness: 1,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(z.center.x, 0.03, z.center.z);
    pad.userData.zone = z;
    scene.add(pad);
    mats.push(pad);

    const edgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(w + 2, d + 2));
    const edge = new THREE.LineSegments(
      edgeGeom,
      new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.45 }),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(z.center.x, 0.05, z.center.z);
    scene.add(edge);
  }
  return mats;
}

/**
 * @param {HTMLElement} container
 * @param {object} site — buildSceneFromFacilityDraw() output
 * @param {{ onSelect?: (placement: object|null) => void, liveTags?: boolean }} opts
 */
export function mountFacilityDrawSiteScene(container, site, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x0f172a);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0f172a, 80, 400);
  const camera = new THREE.PerspectiveCamera(
    42,
    container.clientWidth / container.clientHeight,
    0.1,
    800,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.58));
  const sun = new THREE.DirectionalLight(0xffffff, 0.88);
  sun.position.set(60, 90, 40);
  scene.add(sun);

  const plot = site.plot || { minX: -50, maxX: 50, minZ: -40, maxZ: 40 };
  const plotW = plot.maxX - plot.minX;
  const plotD = plot.maxZ - plot.minZ;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(plotW + 20, 40), Math.max(plotD + 20, 40)),
    new THREE.MeshStandardMaterial({ color: 0x1a2e1a, roughness: 0.98 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((plot.minX + plot.maxX) / 2, 0, (plot.minZ + plot.maxZ) / 2);
  scene.add(ground);

  const grid = new THREE.GridHelper(Math.max(plotW, plotD, 40) + 10, 24, 0x334155, 0x1e293b);
  grid.position.y = 0.02;
  scene.add(grid);

  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(plotW, 8), Math.max(plotD, 8)),
    new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.28 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set((plot.minX + plot.maxX) / 2, 0.04, (plot.minZ + plot.maxZ) / 2);
  scene.add(pad);

  const edgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(plotW, plotD));
  const edgeLines = new THREE.LineSegments(
    edgeGeom,
    new THREE.LineBasicMaterial({ color: 0x64748b }),
  );
  edgeLines.rotation.x = -Math.PI / 2;
  edgeLines.position.set((plot.minX + plot.maxX) / 2, 0.06, (plot.minZ + plot.maxZ) / 2);
  scene.add(edgeLines);

  addZonePads(scene, site.zones);

  const srcMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.35, roughness: 0.5 });
  const returnMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.35, roughness: 0.5 });
  const electricMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.35, roughness: 0.5 });
  for (const pipe of site.pipes || []) {
    const kind = String(pipe.kind || 'src').toLowerCase();
    const mat = kind === 'electric' ? electricMat : (kind === 'return' ? returnMat : srcMat);
    addPipeRun(scene, pipe.points || [], PIPE_Y, mat);
  }

  const pickables = [];
  const objectGroups = [];

  for (const p of site.placements || []) {
    const built = buildPlacementObject(THREE, p);
    const { group } = built;
    group.position.set(p.scene.x, 0, p.scene.z);
    group.rotation.y = (-(p.scene.rotation || 0) * Math.PI) / 180;
    scene.add(group);
    objectGroups.push({ group, built, placement: p });
    for (const mesh of built.pickables || []) {
      if (!mesh.userData.placement) mesh.userData.placement = p;
      pickables.push(mesh);
    }
  }

  fitCamera(camera, controls, plot, site.placements || []);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;

  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) {
      if (onSelect) onSelect(null);
      return;
    }
    if (onSelect) onSelect(hits[0].object.userData.placement);
  }

  renderer.domElement.addEventListener('click', (ev) => pick(ev.clientX, ev.clientY));

  let parcDevices = [];
  let pollTimer = null;

  function deviceById(id) {
    return parcDevices.find((d) => d.deviceId === id);
  }

  function tagVal(dev, id) {
    return (dev?.tags || []).find((t) => t.id === id)?.value;
  }

  function isAlarm(dev, tag) {
    const v = tagVal(dev, tag);
    return v === true || v === 1;
  }

  function updateLiveColors() {
    for (const { group, built, placement } of objectGroups) {
      const dev = placement.deviceId ? deviceById(placement.deviceId) : null;
      const alarmTag = placement.alarmTag || built.meta?.alarmTag;
      const levelTag = placement.levelTag || built.meta?.levelTag;
      const alarm = dev && alarmTag ? isAlarm(dev, alarmTag) : false;

      group.traverse((obj) => {
        if (obj.isMesh && obj.material?.userData?.baseColor) {
          obj.material.color.copy(obj.material.userData.baseColor);
          obj.material.emissive = new THREE.Color(alarm ? 0x7f1d1d : 0x000000);
        }
      });

      if (built.meta?.levelFill && dev && levelTag) {
        const lvl = Number(tagVal(dev, levelTag));
        if (Number.isFinite(lvl)) applyLiftStationLevel(built.meta, lvl);
      }
    }
  }

  async function refreshParc() {
    try {
      const res = await fetch('/api/parc/devices', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      parcDevices = data.devices || [];
      updateLiveColors();
      if (opts.onLiveStatus) opts.onLiveStatus(`Live: ${parcDevices.length} device(s)`, false);
    } catch (e) {
      if (opts.onLiveStatus) opts.onLiveStatus(`Demo mode: ${e.message}`, true);
    }
  }

  if (opts.liveTags !== false) {
    refreshParc();
    pollTimer = setInterval(refreshParc, 5000);
  }

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 1 || h < 1) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return {
    renderer,
    scene,
    camera,
    controls,
    refreshParc,
    dispose() {
      if (pollTimer) clearInterval(pollTimer);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
