'use strict';

const fs = require('fs');
const path = require('path');
const { isHvacSplitProject } = require('./duplexlsScreen');

const DATA_PROJECTS = path.join(__dirname, '../../data/projects');
const DUPLEX_3D_URL = '/samples/duplex-lift-station-ortho-3d.html';
const DUPLEXLS_SVG = '/hmi/svg/library/lift-station-faceplates/peaklogic/duplexls.svg';

function resolveHvacProjectId(projectName, hmi) {
  const n = String(projectName || '').toLowerCase();
  if (/opta-double-split-hvac|double-split-hvac/.test(n)) return 'opta-double-split-hvac';
  if (/opta-split-hvac|hvac-split/.test(n)) return 'opta-split-hvac';
  const url = String(hmi?.layout?.facility3dUrl || hmi?.screens?.[0]?.facility3dUrl || '');
  if (/opta-double-split-hvac/.test(url)) return 'opta-double-split-hvac';
  if (/opta-split-hvac/.test(url)) return 'opta-split-hvac';
  return null;
}

function isDuplexlsHmiScreen(screen) {
  if (!screen) return false;
  if (String(screen.name || '').trim().toUpperCase() === 'DUPLEXLS') return true;
  const svg = String(screen.svg || '').trim();
  if (/lift-station-faceplates\/peaklogic\/duplexls|\/duplexls\.svg/i.test(svg)) return true;
  return screen.tiles?.[0]?.compositeId === 'duplexls';
}

function needsHvacHmiRepair(hmi, projectId) {
  if (!projectId || !hmi) return false;
  const layoutUrl = String(hmi.layout?.facility3dUrl || '').trim();
  const screen1Url = String(hmi.screens?.find((s) => s.id === 'screen_1')?.facility3dUrl || '').trim();
  const expected3d = `/samples/${projectId}-ortho-3d.html`;
  if (layoutUrl === DUPLEX_3D_URL || screen1Url === DUPLEX_3D_URL) return true;
  if (layoutUrl && layoutUrl !== expected3d) return true;
  const screen2 = hmi.screens?.find((s) => s.id === 'screen_2');
  if (isDuplexlsHmiScreen(screen2)) return true;
  const expectedSvgPrefix = `/hmi/svg/demos/${projectId}/`;
  if (screen2 && !String(screen2.svg || '').startsWith(expectedSvgPrefix)) return true;
  return false;
}

function loadCanonicalHvacHmi(projectId) {
  const jsonFp = path.join(DATA_PROJECTS, `${projectId}.est.json`);
  if (fs.existsSync(jsonFp)) {
    try {
      const doc = JSON.parse(fs.readFileSync(jsonFp, 'utf8'));
      if (doc.settings?.hmi) return doc.settings.hmi;
    } catch { /* fall through */ }
  }
  const zipFp = path.join(DATA_PROJECTS, `${projectId}.est.zip`);
  if (fs.existsSync(zipFp)) {
    try {
      const { unpackArchive } = require('../project/projectArchive');
      const doc = unpackArchive(fs.readFileSync(zipFp)).project;
      if (doc.settings?.hmi) return doc.settings.hmi;
    } catch { /* fall through */ }
  }
  return embeddedCanonicalHvacHmi(projectId);
}

function hvacScreen(id, number, name, svg, extra = {}) {
  const grid = { cols: 16, rows: 12, cellWidth: 64, cellHeight: 64 };
  return {
    id,
    number,
    isHome: number === 1,
    name,
    svg,
    tiles: [],
    gridCols: grid.cols,
    gridRows: grid.rows,
    cellWidth: grid.cellWidth,
    cellHeight: grid.cellHeight,
    gridSize: grid.cols,
    width: grid.cols * grid.cellWidth,
    height: grid.rows * grid.cellHeight,
    displayMaxWidth: extra.displayMaxWidth ?? 1024,
    displayMaxHeight: extra.displayMaxHeight ?? 768,
    fit: 'contain',
    scale: 100,
    background: svg ? '#f8fafc' : '#0f172a',
    offsetX: 0,
    offsetY: 0,
    naturalWidth: null,
    naturalHeight: null,
  };
}

/** Built-in fallback when bundled est.json/.est.zip are missing on disk. */
function embeddedCanonicalHvacHmi(projectId) {
  const html3d = `/samples/${projectId}-ortho-3d.html`;
  const svgBase = `/hmi/svg/demos/${projectId}`;
  const layout = {
    gridCols: 16,
    gridRows: 12,
    cellWidth: 64,
    cellHeight: 64,
    gridSize: 16,
    width: 1024,
    height: 768,
    displayMaxWidth: 1024,
    displayMaxHeight: 768,
    fit: 'contain',
    showGridChrome: false,
    showLiveStatus: true,
    composerMode: '3d',
    facility3dUrl: html3d,
  };
  if (projectId === 'opta-double-split-hvac') {
    return {
      activeScreen: 'screen_1',
      testMode: false,
      layout: {
        ...layout,
        areaPopupScreens: ['screen_2', 'screen_3', 'screen_4', 'screen_5'],
      },
      screens: [
        hvacScreen('screen_1', 1, '3D Overview', null),
        hvacScreen('screen_2', 2, 'System Overview', `${svgBase}/system_overview.svg`),
        hvacScreen('screen_3', 3, 'Air Handlers', `${svgBase}/air_handlers.svg`, { displayMaxWidth: 1200 }),
        hvacScreen('screen_4', 4, 'Condenser 1', `${svgBase}/condenser_1.svg`, { displayMaxWidth: 480 }),
        hvacScreen('screen_5', 5, 'Condenser 2', `${svgBase}/condenser_2.svg`, { displayMaxWidth: 480 }),
      ],
      bindings: [],
    };
  }
  if (projectId === 'opta-split-hvac') {
    return {
      activeScreen: 'screen_1',
      testMode: false,
      layout: {
        ...layout,
        areaPopupScreens: ['screen_2', 'screen_3', 'screen_4'],
      },
      screens: [
        hvacScreen('screen_1', 1, '3D Overview', null),
        hvacScreen('screen_2', 2, 'System Overview', `${svgBase}/system_overview.svg`),
        hvacScreen('screen_3', 3, 'Air Handler', `${svgBase}/air_handler.svg`, { displayMaxWidth: 480 }),
        hvacScreen('screen_4', 4, 'Condenser', `${svgBase}/condenser.svg`, { displayMaxWidth: 480 }),
      ],
      bindings: [],
    };
  }
  return null;
}

/** Restore HVAC demo HMI when a workspace or bundled zip was corrupted by duplex lift repair. */
function ensureHvacSplitHmi(hmi, projectName) {
  if (!hmi) return hmi;
  if (!isHvacSplitProject(projectName, hmi)) return hmi;
  const projectId = resolveHvacProjectId(projectName, hmi);
  if (!projectId || !needsHvacHmiRepair(hmi, projectId)) return hmi;
  const canonical = loadCanonicalHvacHmi(projectId);
  if (!canonical) return hmi;
  return {
    ...canonical,
    activeScreen: hmi.activeScreen || canonical.activeScreen || 'screen_1',
    bindings: Array.isArray(canonical.bindings) && canonical.bindings.length
      ? canonical.bindings
      : (hmi.bindings || []),
  };
}

module.exports = {
  ensureHvacSplitHmi,
  resolveHvacProjectId,
  needsHvacHmiRepair,
  isDuplexlsHmiScreen,
  loadCanonicalHvacHmi,
  embeddedCanonicalHvacHmi,
};
