'use strict';

/**
 * Rename vendor folders opto22 / mblogic → mv under public/hmi/svg.
 * Merges when both exist under the same parent.
 */

const fs = require('fs');
const path = require('path');

const SVG_ROOT = path.join(__dirname, '..', 'public', 'hmi', 'svg');
const OLD_VENDORS = new Set(['opto22', 'mblogic']);

function mergeInto(target, source) {
  if (!fs.existsSync(source)) return;
  if (!fs.existsSync(target)) {
    fs.renameSync(source, target);
    return;
  }
  for (const name of fs.readdirSync(source)) {
    const srcChild = path.join(source, name);
    const dstChild = path.join(target, name);
    if (fs.statSync(srcChild).isDirectory()) {
      mergeInto(dstChild, srcChild);
    } else if (!fs.existsSync(dstChild)) {
      fs.renameSync(srcChild, dstChild);
    } else {
      fs.unlinkSync(srcChild);
    }
  }
  fs.rmdirSync(source);
}

function rebrandDir(dir) {
  let renamed = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const full = path.join(dir, ent.name);
    if (OLD_VENDORS.has(ent.name)) {
      const mvPath = path.join(dir, 'mv');
      mergeInto(mvPath, full);
      renamed += 1;
      continue;
    }
    renamed += rebrandDir(full);
  }
  return renamed;
}

const n = rebrandDir(SVG_ROOT);
const topOpto = path.join(SVG_ROOT, 'opto22');
if (fs.existsSync(topOpto)) {
  mergeInto(path.join(SVG_ROOT, 'mv-legacy-opto'), topOpto);
  console.log('Moved top-level opto22 → mv-legacy-opto (run organize-hmi-graphics to classify)');
}
console.log(`Rebranded ${n} vendor folder(s) to mv`);
