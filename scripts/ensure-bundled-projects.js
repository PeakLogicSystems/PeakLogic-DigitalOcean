#!/usr/bin/env node
'use strict';

/**
 * Generate all bundled PeakLogic demo projects as portable .est.zip under data/projects/.
 *
 * Usage:
 *   node scripts/ensure-bundled-projects.js
 *   node scripts/ensure-bundled-projects.js --force
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { packArchiveFromParts } = require('../src/project/projectArchive');
const { ZIP_EXT } = require('../src/project/projectStore');

const ROOT = path.join(__dirname, '..');

/** Generator scripts — run when any listed project json is missing (or --force). */
const GENERATORS = [
  { script: 'scripts/duplex-lift-station/generate-est.js', projects: ['duplex-lift-station'] },
  { script: 'scripts/assisted-living/generate-est.js', projects: ['assisted-living'] },
  { script: 'scripts/clendenning-tampa/generate-est.js', projects: ['clendenning-tampa'] },
  { script: 'scripts/demo-american-house/generate-est.js', projects: ['demo-american-house'] },
  { script: 'scripts/mle-wastewater/generate-est.js', projects: ['mle-wastewater'] },
  {
    script: 'scripts/hvac-opta-parc/generate-est.js',
    projects: ['hvac-opta-parc'],
  },
  {
    script: 'scripts/facility-hvac-iot-link/generate-est.js',
    projects: ['facility-hvac-iot-link'],
  },
  {
    script: 'scripts/hvac-rtu-opta/generate-est.js',
    projects: ['hvac-rtu-opta'],
  },
  {
    script: 'scripts/hvac-split-unit-ahu/generate-est.js',
    projects: ['hvac-split-unit-ahu'],
  },
  {
    script: 'scripts/hvac-split-unit-cond/generate-est.js',
    projects: ['hvac-split-unit-cond'],
  },
  { script: 'scripts/bootstrap-do3500-project.js', projects: ['icon-do3500'] },
  {
    script: 'scripts/assisted-living-halow/generate-artifacts.js',
    projects: ['assisted-living-halow', 'assisted-living-pool-iot-link'],
    requires: ['assisted-living'],
  },
  {
    script: 'scripts/putnam-fleet/generate-artifacts.js',
    projects: ['putnam-county-cloud', 'putnam-mle-plant', 'putnam-county'],
    requires: ['mle-wastewater'],
  },
  {
    script: 'scripts/atu-fleet/generate-artifacts.js',
    projects: ['atu-cloud-residential', 'atu-cloud-commercial', 'atu-cloud-dwts'],
  },
  {
    script: 'scripts/pool-fleet/generate-artifacts.js',
    projects: ['pool-cloud-residential'],
  },
  {
    script: 'scripts/circlek-fleet/generate-artifacts.js',
    projects: ['cstore-opta-parc-starter', 'circle-k-florida-fleet'],
    scriptArgs: ['--fleet'],
  },
];

/** s::can MLE scan variants (unique output files only). */
const SCAN_VARIANTS = [
  { arg: 'mle-poc-50gpd', projectId: 'mle-poc-50gpd' },
  { arg: 'pasco-rv-120kgpd', projectId: 'pasco-rv-mle' },
];

/** Optional ST file when not embedded in .est.json. */
const PROGRAM_FILES = {
  'duplex-lift-station': 'st/logic/36_duplex_lift_station.st',
  'assisted-living': 'st/logic/assisted_living_facility.st',
  'demo-american-house': 'st/logic/demo_american_house.st',
  'mle-wastewater': 'st/logic/mle_wastewater_plant.st',
  'putnam-county-cloud': 'st/logic/putnam_fleet_rollup.st',
  'putnam-mle-plant': 'st/logic/putnam_fleet_rollup.st',
  'putnam-county': 'st/logic/putnam_county_combined.st',
  'pool-cloud-residential': 'st/logic/30_pool_controller.st',
  'cstore-opta-parc-starter': 'st/logic/cstore_opta_parc_fleet_rollup.st',
  'circle-k-florida-demo': 'st/logic/circle_k_fleet_rollup.st',
  'circle-k-florida-fleet': 'st/logic/circle_k_florida_fleet_rollup.st',
  'hvac-opta-parc': 'st/logic/hvac_opta_parc.st',
  'facility-hvac-iot-link': 'st/logic/facility_hvac_iot_link.st',
  'hvac-rtu-opta': 'st/logic/hvac_rtu_opta.st',
  'hvac-split-unit-ahu': 'st/logic/hvac_split_unit_ahu.st',
  'hvac-split-unit-cond': 'st/logic/hvac_split_unit_cond.st',
};

const BUNDLED = [
  ...GENERATORS.flatMap((g) => g.projects),
  ...SCAN_VARIANTS.map((v) => v.projectId),
];

function parseArgs(argv) {
  return { force: argv.includes('--force') };
}

function jsonPath(root, id) {
  return path.join(root, 'data', 'projects', `${id}.est.json`);
}

function zipPath(root, id) {
  return path.join(root, 'data', 'projects', `${id}${ZIP_EXT}`);
}

function runScript(root, relScript, ...args) {
  const label = args.length ? `${relScript} ${args.join(' ')}` : relScript;
  console.log(`[bundled] run ${label}`);
  execFileSync(process.execPath, [relScript, ...args], { cwd: root, stdio: 'inherit' });
}

function needsGenerate(root, generator, force) {
  if (force) return true;
  return generator.projects.some((id) => !fs.existsSync(jsonPath(root, id)));
}

function needsScanVariant(root, variant, force) {
  if (force) return true;
  return !fs.existsSync(jsonPath(root, variant.projectId));
}

function resolvePrograms(root, raw, id) {
  const activeProgram = raw.activeProgram
    || raw.settings?.activeProgram
    || raw.settings?.project?.activeProgram
    || null;
  const programs = {};

  if (typeof raw.program === 'string' && raw.program.trim()) {
    const rel = activeProgram || `logic/${id.replace(/-/g, '_')}.st`;
    programs[rel] = raw.program;
    raw.activeProgram = rel;
  }

  const programFile = PROGRAM_FILES[id];
  if (programFile) {
    const stPath = path.join(root, programFile);
    if (fs.existsSync(stPath)) {
      const rel = activeProgram || `logic/${path.basename(stPath)}`;
      programs[rel] = fs.readFileSync(stPath, 'utf8');
      raw.activeProgram = rel;
    }
  } else if (activeProgram) {
    const stPath = path.join(root, 'st', activeProgram);
    if (fs.existsSync(stPath)) {
      programs[activeProgram] = fs.readFileSync(stPath, 'utf8');
    }
  }

  return { activeProgram: raw.activeProgram || activeProgram, programs };
}

function packProject(root, id) {
  const srcJson = jsonPath(root, id);
  if (!fs.existsSync(srcJson)) {
    throw new Error(`Missing project JSON: ${srcJson}`);
  }
  const raw = JSON.parse(fs.readFileSync(srcJson, 'utf8'));
  const { activeProgram, programs } = resolvePrograms(root, raw, id);
  delete raw.program;

  const buf = packArchiveFromParts({
    project: raw,
    programs,
    activeProgram: activeProgram || undefined,
    mvDraw: raw.mvDraw || null,
    meta: { name: raw.project?.name || id, exportedBy: 'ensure-bundled-projects' },
  });

  const outZip = zipPath(root, id);
  fs.writeFileSync(outZip, buf);
  console.log(`[bundled] packed ${outZip} (${(buf.length / 1024).toFixed(1)} KB)`);
  return outZip;
}

function needsPack(root, id, force) {
  const jp = jsonPath(root, id);
  const zp = zipPath(root, id);
  if (force) return fs.existsSync(jp);
  if (!fs.existsSync(jp)) return false;
  if (!fs.existsSync(zp)) return true;
  return fs.statSync(jp).mtimeMs > fs.statSync(zp).mtimeMs;
}

function ensureBundledProjects(root = ROOT, opts = {}) {
  const force = !!opts.force;
  const projectsDir = path.join(root, 'data', 'projects');
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });

  for (const generator of GENERATORS) {
    if (generator.requires) {
      const missingReq = generator.requires.find((id) => !fs.existsSync(jsonPath(root, id)));
      if (missingReq && !force) {
        throw new Error(`Prerequisite project missing: ${missingReq} (needed for ${generator.script})`);
      }
    }
    if (!needsGenerate(root, generator, force)) continue;
    runScript(root, path.relative(root, path.join(root, generator.script)), ...(generator.scriptArgs || []));
    for (const id of generator.projects) {
      if (!fs.existsSync(jsonPath(root, id))) {
        throw new Error(`Expected ${jsonPath(root, id)} after ${generator.script}`);
      }
    }
  }

  if (fs.existsSync(jsonPath(root, 'mle-wastewater'))) {
    for (const variant of SCAN_VARIANTS) {
      if (!needsScanVariant(root, variant, force)) continue;
      runScript(root, path.relative(root, path.join(root, 'scripts/mle-wastewater/generate-scan-est.js')), variant.arg);
      if (!fs.existsSync(jsonPath(root, variant.projectId))) {
        throw new Error(`Expected ${jsonPath(root, variant.projectId)} after scan variant ${variant.arg}`);
      }
    }
  }

  let packed = 0;
  for (const id of BUNDLED) {
    if (!needsPack(root, id, force)) continue;
    packProject(root, id);
    packed += 1;
  }

  const zipCount = fs.readdirSync(projectsDir).filter((f) => f.toLowerCase().endsWith(ZIP_EXT)).length;
  console.log(`[bundled] library: ${zipCount} .est.zip (${packed} packed this run)`);
  return { packed, zipCount, projectIds: BUNDLED.slice() };
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  ensureBundledProjects(ROOT, opts);
}

module.exports = { ensureBundledProjects, packProject, BUNDLED, GENERATORS, SCAN_VARIANTS, PROGRAM_FILES };
