'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public', 'hmi', 'svg');
const hits = { pid: [], face: [], gauge: [], chart: [], bezel: [], numeric: [], controller: [], loop: [], setpoint: [], meter: [], dial: [], bargraph: [], display: [], panel: [] };
function walk(dir, rel = '') {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const rp = rel ? `${rel}/${name}` : name;
    if (fs.statSync(fp).isDirectory()) walk(fp, rp);
    else if (/\.(svg|gif|png)$/i.test(name)) {
      const low = name.toLowerCase();
      for (const k of Object.keys(hits)) {
        if (low.includes(k)) hits[k].push(rp);
      }
    }
  }
}
walk(root);
for (const [k, v] of Object.entries(hits)) {
  console.log(`\n=== ${k} (${v.length}) ===`);
  v.slice(0, 25).forEach((p) => console.log(p));
}
