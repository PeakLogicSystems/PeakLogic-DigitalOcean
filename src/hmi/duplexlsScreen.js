'use strict';

const {
  explodeCompositeToEdit,
  listHmiComposites,
  repairCompositeBindings,
} = require('./hmiComposites');

const DUPLEXLS_GRID = { cols: 16, rows: 13, cellWidth: 64, cellHeight: 64 };
const DUPLEXLS_SVG = '/hmi/svg/library/lift-station-faceplates/peaklogic/duplexls.svg';
const DUPLEXLS_OVERVIEW = { width: 1150, height: 620 };
const DUPLEXLS_VIEWPORT = { displayMaxWidth: 1229, displayMaxHeight: 922, scale: 120 };
const DUPLEX_3D_URL = '/samples/duplex-lift-station-ortho-3d.html';

/** Fleet 3D samples shipped with zero lifts — wrong for a single commissioned store. */
const EMPTY_FLEET_3D_URLS = new Set([
  '/samples/cstore-opta-parc-fleet-3d.html',
  '/samples/circle-k-florida-fleet-3d.html',
]);

function buildDuplexlsScreen(composites) {
  const duplexManifest = composites.find((c) => c.composite?.id === 'duplexls')?.composite;
  if (!duplexManifest) return null;
  return {
    id: 'screen_2',
    number: 2,
    isHome: false,
    inheritProjectLayout: false,
    name: 'DUPLEXLS',
    svg: DUPLEXLS_SVG,
    tiles: [explodeCompositeToEdit(duplexManifest, 0, 0, {
      colSpan: DUPLEXLS_GRID.cols,
      rowSpan: DUPLEXLS_GRID.rows,
    })],
    gridCols: DUPLEXLS_GRID.cols,
    gridRows: DUPLEXLS_GRID.rows,
    cellWidth: DUPLEXLS_GRID.cellWidth,
    cellHeight: DUPLEXLS_GRID.cellHeight,
    gridSize: DUPLEXLS_GRID.cols,
    width: DUPLEXLS_OVERVIEW.width,
    height: DUPLEXLS_OVERVIEW.height,
    naturalWidth: DUPLEXLS_OVERVIEW.width,
    naturalHeight: DUPLEXLS_OVERVIEW.height,
    displayMaxWidth: DUPLEXLS_VIEWPORT.displayMaxWidth,
    displayMaxHeight: DUPLEXLS_VIEWPORT.displayMaxHeight,
    scale: DUPLEXLS_VIEWPORT.scale,
    background: '#1a1a1a',
    fit: 'contain',
    offsetX: 0,
    offsetY: 0,
  };
}

function needsDuplexlsUpgrade(hmi) {
  const screen = hmi?.screens?.find((s) => s.id === 'screen_2');
  if (!screen) return true;
  if (screen.inheritProjectLayout !== false) return true;
  if (screen.tiles?.[0]?.compositeId !== 'duplexls') return true;
  return screen.name !== 'DUPLEXLS';
}

function needsDuplex3dUpgrade(hmi) {
  const layout = hmi?.layout || {};
  if (String(layout.composerMode || '').trim().toLowerCase() !== '3d') return true;
  if (String(layout.facility3dUrl || '').trim() !== DUPLEX_3D_URL) return true;
  const s1 = hmi?.screens?.find((s) => s.id === 'screen_1');
  if (!s1) return true;
  return String(s1.facility3dUrl || '').trim() !== DUPLEX_3D_URL;
}

function isDuplexLiftProject(projectName) {
  const n = String(projectName || '').toLowerCase();
  return n.includes('duplex') && (n.includes('lift') || n.includes('circle-k') || n.includes('circlek'));
}

function isSingleSiteLiftProject(projectName) {
  const n = String(projectName || '').toLowerCase();
  if (isDuplexLiftProject(projectName)) return true;
  return /cstore|opta-parc|parc-starter|lift-station|lift_station/.test(n);
}

function usesEmptyFleet3d(hmi) {
  const urls = [
    hmi?.layout?.facility3dUrl,
    ...(Array.isArray(hmi?.screens) ? hmi.screens.map((s) => s?.facility3dUrl) : []),
  ].map((u) => String(u || '').trim()).filter(Boolean);
  return urls.some((u) => EMPTY_FLEET_3D_URLS.has(u));
}

function shouldUseDuplexSite3d(hmi, projectName) {
  return isSingleSiteLiftProject(projectName) || usesEmptyFleet3d(hmi);
}

/** Ensure screen_1 uses the duplex 3D facility view (repairs stale grid-only workspaces). */
function ensureDuplexScreen1_3d(hmi) {
  if (!hmi) return hmi;
  hmi.layout = hmi.layout || {};
  hmi.layout.composerMode = '3d';
  hmi.layout.facility3dUrl = DUPLEX_3D_URL;
  const popups = new Set(Array.isArray(hmi.layout.areaPopupScreens) ? hmi.layout.areaPopupScreens : []);
  popups.add('screen_2');
  hmi.layout.areaPopupScreens = [...popups];
  const s1 = hmi.screens?.find((s) => s.id === 'screen_1');
  if (s1) {
    s1.facility3dUrl = DUPLEX_3D_URL;
    if (!String(s1.name || '').trim()) s1.name = '3D Overview';
  }
  return hmi;
}

function isHvacSplitProject(projectName, hmi) {
  const n = String(projectName || '').toLowerCase();
  if (/opta-split-hvac|opta-double-split-hvac|hvac-split/.test(n)) return true;
  const url = String(hmi?.layout?.facility3dUrl || hmi?.screens?.[0]?.facility3dUrl || '');
  return /opta-split-hvac|opta-double-split-hvac|hvac-split/.test(url);
}

/** Ensure duplex lift HMI: screen_1 3D + screen_2 DUPLEXLS composite. */
function ensureDuplexlsScreen2(hmi, publicRoot, projectName) {
  if (!hmi) return hmi;
  if (isHvacSplitProject(projectName, hmi)) return hmi;
  const useSite3d = shouldUseDuplexSite3d(hmi, projectName);
  if (!useSite3d) return hmi;
  ensureDuplexScreen1_3d(hmi);
  if (!hmi.screens?.length) return hmi;
  if (!needsDuplexlsUpgrade(hmi)) return hmi;
  const composites = listHmiComposites(publicRoot);
  const screen = buildDuplexlsScreen(composites);
  if (!screen) return hmi;
  const idx = hmi.screens.findIndex((s) => s.id === 'screen_2');
  if (idx < 0) {
    hmi.screens.push(screen);
  } else {
    hmi.screens[idx] = screen;
  }
  hmi.bindings = (hmi.bindings || []).filter((b) => b.screenId !== 'screen_2');
  repairCompositeBindings(hmi, publicRoot);
  if (useSite3d) ensureDuplexScreen1_3d(hmi);
  return hmi;
}

module.exports = {
  ensureDuplexlsScreen2,
  ensureDuplexScreen1_3d,
  needsDuplexlsUpgrade,
  needsDuplex3dUpgrade,
  isDuplexLiftProject,
  isSingleSiteLiftProject,
  usesEmptyFleet3d,
  shouldUseDuplexSite3d,
  isHvacSplitProject,
  DUPLEX_3D_URL,
  EMPTY_FLEET_3D_URLS,
};
