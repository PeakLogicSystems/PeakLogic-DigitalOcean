/**
 * PeakLogic 3D map — north compass overlay.
 * World north defaults to -Z (matches lat/lng fleet maps: increasing latitude → -Z).
 */
import * as THREE from 'three';

const STYLE_ID = 'mv-north-indicator-style';

const COMPASS_SIZE = 54;
const COMPASS_INSET = 14;
const COMPASS_GAP = 8;

const CSS = `
.mv-north-indicator {
  position: absolute;
  z-index: 15;
  pointer-events: none;
  user-select: none;
  left: ${COMPASS_INSET}px;
  bottom: ${COMPASS_INSET}px;
}
body:has(.mv-north-indicator) #legend {
  left: ${COMPASS_INSET + COMPASS_SIZE + COMPASS_GAP}px;
}
.mv-north-compass {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.35);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  position: relative;
}
.mv-north-rose {
  position: absolute;
  inset: 0;
  transition: transform 0.06s linear;
}
.mv-north-needle-n {
  position: absolute;
  left: 50%;
  top: 8px;
  width: 0;
  height: 0;
  margin-left: -5px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 14px solid #ef4444;
}
.mv-north-needle-s {
  position: absolute;
  left: 50%;
  bottom: 8px;
  width: 0;
  height: 0;
  margin-left: -4px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 10px solid #64748b;
}
.mv-north-label {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  font: 700 10px/1 "Segoe UI", system-ui, sans-serif;
  color: #f8fafc;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
`;

export const WORLD_NORTH = new THREE.Vector3(0, 0, -1);

export function ensureNorthIndicatorStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * @param {object} [opts]
 * @param {HTMLElement} [opts.parent]
 * @param {THREE.Vector3} [opts.worldNorth]
 * @param {number} [opts.bottom] CSS bottom offset px
 * @param {number} [opts.left] CSS left offset px
 */
export function mountNorthIndicator(opts = {}) {
  ensureNorthIndicatorStyles();
  const parent = opts.parent || document.body;
  const worldNorth = opts.worldNorth?.clone?.() || WORLD_NORTH.clone();

  const root = document.createElement('div');
  root.className = 'mv-north-indicator';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'North indicator');
  if (opts.bottom != null) root.style.bottom = `${opts.bottom}px`;
  if (opts.left != null) root.style.left = `${opts.left}px`;
  root.innerHTML = `
    <div class="mv-north-compass">
      <div class="mv-north-rose">
        <div class="mv-north-needle-n"></div>
        <div class="mv-north-needle-s"></div>
      </div>
      <span class="mv-north-label">N</span>
    </div>
  `;
  parent.appendChild(root);
  const rose = root.querySelector('.mv-north-rose');
  const scratch = new THREE.Vector3();

  return {
    el: root,
    update(camera) {
      scratch.copy(worldNorth).applyQuaternion(camera.quaternion);
      const deg = Math.atan2(scratch.x, -scratch.y) * (180 / Math.PI);
      rose.style.transform = `rotate(${deg}deg)`;
    },
  };
}
