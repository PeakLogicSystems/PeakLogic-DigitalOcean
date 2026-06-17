'use strict';
const fs = require('fs');
const path = require('path');
const { normalizeHmi } = require('../src/hmi/hmiConfig');

const settingsPath = path.join(__dirname, '../data/settings.json');
const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

function layerLayoutSnapshot(layer) {
  if (!layer || typeof layer !== 'object') return null;
  const kind = layer.kind || 'staticImage';
  const snap = { kind, z: Number(layer.z) || 0 };
  if (kind === 'navButton') {
    snap.targetScreenId = String(layer.targetScreenId || '');
    if (layer.label != null) snap.label = String(layer.label);
    return snap;
  }
  snap.svg = String(layer.svg || '');
  if (layer.label != null) snap.label = String(layer.label);
  if (layer.tagId) snap.tagId = String(layer.tagId);
  return snap;
}

function tilesLayoutKey(screen) {
  const tiles = (screen.tiles || []).slice().sort((a, b) => a.row - b.row || a.col - b.col);
  return JSON.stringify({
    tiles: tiles.map((t) => [
      t.col,
      t.row,
      t.colSpan || 1,
      t.rowSpan || 1,
      (t.layers || []).map(layerLayoutSnapshot).filter(Boolean),
    ]),
  });
}

try {
  const h = normalizeHmi(raw.hmi, []);
  console.log('normalize ok screens=', h.screens.length);
  for (const s of h.screens) {
    const key = tilesLayoutKey(s);
    console.log('screen', s.id, 'tiles', (s.tiles || []).length, 'keyLen', key.length);
  }
} catch (e) {
  console.error('FAIL', e.message);
  console.error(e.stack);
  process.exit(1);
}
