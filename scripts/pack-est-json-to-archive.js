#!/usr/bin/env node
'use strict';

/**
 * Pack a peaklogic-est JSON doc + ST source into a portable .est.zip archive.
 * Usage: node scripts/pack-est-json-to-archive.js input.est.json [program.st] [output.est.zip]
 */

const fs = require('fs');
const path = require('path');
const { packArchiveFromParts } = require('../src/project/projectArchive');
const { EST_FORMAT } = require('../src/project/estFile');

function main() {
  const input = process.argv[2];
  const programPath = process.argv[3];
  const output = process.argv[4];
  if (!input) {
    console.error('Usage: node scripts/pack-est-json-to-archive.js input.est.json [program.st] [output.est.zip]');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (raw.format !== EST_FORMAT) {
    throw new Error(`Expected ${EST_FORMAT} in ${input}`);
  }
  const activeProgram = raw.activeProgram || 'logic/program.st';
  const programs = {};
  if (typeof raw.program === 'string' && raw.program) {
    programs[activeProgram] = raw.program;
  }
  if (programPath && fs.existsSync(programPath)) {
    const rel = activeProgram.includes('/') ? activeProgram : `logic/${path.basename(programPath)}`;
    programs[rel] = fs.readFileSync(programPath, 'utf8');
    raw.activeProgram = rel;
  }
  delete raw.program;
  const outPath = output || input.replace(/\.est\.json$/i, '.est.zip');
  const buf = packArchiveFromParts({
    project: raw,
    programs,
    activeProgram: raw.activeProgram,
    facilityDraw: raw.facilityDraw || null,
    meta: { name: raw.project?.name, exportedBy: 'pack-est-json-to-archive' },
  });
  fs.writeFileSync(outPath, buf);
  console.log(`Packed ${outPath} (${buf.length} bytes)`);
}

if (require.main === module) main();

module.exports = { main };
