'use strict';

const fs = require('fs');
const path = require('path');

const STRIP_DIR = path.join(__dirname, '..', 'public', 'hmi', 'svg', 'library', 'charts-trends', 'strip-charts', 'mv', 'chart-strip');

function fixStripChartSvg(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (/id="trend_pen1"/i.test(text)) return false;
  const strokeMatch = text.match(/<polyline[^>]*stroke="([^"]+)"/i);
  const pointsMatch = text.match(/points="([^"]+)"/i);
  const stroke = strokeMatch?.[1] || 'blue';
  const points = pointsMatch?.[1] || '0,50 200,50';
  const out = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <rect id="strip_bg" x="0" y="0" width="200" height="100" fill="#f8fafc" stroke="#94a3b8" stroke-width="1"/>
  <polyline id="trend_pen1" fill="none" stroke="${stroke}" stroke-width="2" points="${points}"/>
</svg>
`;
  fs.writeFileSync(filePath, out, 'utf8');
  return true;
}

const files = fs.readdirSync(STRIP_DIR).filter((n) => /^strip_chart_.*\.svg$/i.test(n));
let fixed = 0;
for (const name of files) {
  if (fixStripChartSvg(path.join(STRIP_DIR, name))) fixed += 1;
}
console.log(`Fixed ${fixed} / ${files.length} strip chart SVG(s) in ${STRIP_DIR}`);
