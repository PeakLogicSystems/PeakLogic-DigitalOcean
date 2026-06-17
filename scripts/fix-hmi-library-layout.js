'use strict';

/** Move category folders from hmi/svg/* into hmi/svg/library/* after organize fix. */
const fs = require('fs');
const path = require('path');

const SVG_ROOT = path.join(__dirname, '..', 'public', 'hmi', 'svg');
const LIBRARY = path.join(SVG_ROOT, 'library');
const MOVE_DIRS = [
  'animations', 'charts-trends', 'controls', 'gauges-meters', 'misc',
  'numeric-displays', 'piping', 'process-equipment', 'products-logos',
  'pumps', 'tanks-vessels', 'text-labels', 'valves',
];

function mergeDir(src, dest) {
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) mergeDir(s, d);
    else {
      ensureDir(path.dirname(d));
      if (fs.existsSync(d)) fs.unlinkSync(d);
      fs.renameSync(s, d);
    }
  }
  fs.rmdirSync(src);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(LIBRARY);
for (const name of MOVE_DIRS) {
  const src = path.join(SVG_ROOT, name);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(LIBRARY, name);
  console.log(`Merge ${name} -> library/${name}`);
  mergeDir(src, dest);
}
console.log('Done.');
