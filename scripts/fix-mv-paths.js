#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'data/.cache']);

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (/\.(json|svg)$/i.test(e.name) || e.name.endsWith('.est.json')) files.push(p);
  }
  return files;
}

let n = 0;
for (const fp of walk(ROOT)) {
  if (fp.includes(`${path.sep}scripts${path.sep}fix-mv-paths.js`)) continue;
  let s = fs.readFileSync(fp, 'utf8');
  const o = s;
  s = s.replace(/\/opto22\//g, '/mv/').replace(/\/mblogic\//g, '/mv/');
  if (s !== o) {
    fs.writeFileSync(fp, s);
    n += 1;
    console.log(path.relative(ROOT, fp));
  }
}
console.log(`Updated ${n} files`);
