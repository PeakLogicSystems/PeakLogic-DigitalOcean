'use strict';

/**
 * Reorganize HMI graphics into public/hmi/svg/library/ (and demos/).
 * Writes path-aliases.json for backward-compatible asset paths.
 */

const fs = require('fs');
const path = require('path');
const {
  classifyAsset,
  targetLibraryRelPath,
  displayName,
  isPidFaceplateCandidate,
  GROUP,
} = require('../src/hmi/hmiAssetCatalog');

const SVG_ROOT = path.join(__dirname, '..', 'public', 'hmi', 'svg');
const SKIP_DIRS = new Set(['library', 'demos', '.cache']);
const ASSET_EXT = /\.(svg|gif|png)$/i;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function walkAssets(dir, rel, out, opts = {}) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    if (/\.json$/i.test(name) && rel === '') continue;
    const fp = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (fs.statSync(fp).isDirectory()) {
      if (rel === '' && SKIP_DIRS.has(name) && !opts.includeLibrary) continue;
      walkAssets(fp, relPath, out, opts);
    } else if (ASSET_EXT.test(name)) {
      out.push({ abs: fp, rel: relPath.replace(/\\/g, '/') });
    }
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const catalogOnly = process.argv.includes('--catalog-only');
  const files = [];
  walkAssets(SVG_ROOT, '', files, { includeLibrary: catalogOnly });

  const aliases = {};
  const catalog = [];
  const pidCandidates = [];
  let moved = 0;
  let skipped = 0;

  for (const f of files) {
    if (!catalogOnly) {
      if (f.rel.startsWith('library/') || f.rel.startsWith('demos/')) {
        skipped++;
        continue;
      }
      let targetRel = targetLibraryRelPath(f.rel);
      if (/^demo_/.test(path.basename(f.rel)) && !f.rel.includes('/')) {
        targetRel = `demos/${path.basename(f.rel)}`;
      }
      const targetAbs = path.join(SVG_ROOT, targetRel.split('/').join(path.sep));
      const oldUrl = `/hmi/svg/${f.rel}`;
      const newUrl = `/hmi/svg/${targetRel.replace(/\\/g, '/')}`;

      if (oldUrl !== newUrl) aliases[oldUrl] = newUrl;

      if (!dryRun) {
        ensureDir(path.dirname(targetAbs));
        if (path.resolve(f.abs) !== path.resolve(targetAbs)) {
          if (fs.existsSync(targetAbs)) fs.unlinkSync(targetAbs);
          fs.renameSync(f.abs, targetAbs);
          moved++;
        } else skipped++;
      }
      f.rel = targetRel;
      f.catalogUrl = newUrl;
    } else {
      f.catalogUrl = `/hmi/svg/${f.rel}`;
    }

    const cls = classifyAsset(f.rel);
    catalog.push({
      path: f.catalogUrl || `/hmi/svg/${f.rel}`,
      name: path.basename(f.rel),
      type: path.extname(f.rel).slice(1).toLowerCase(),
      group: cls.group,
      subgroup: cls.subgroup,
      vendor: cls.vendor,
      label: displayName(path.basename(f.rel), cls),
    });
    if (isPidFaceplateCandidate(f.rel, cls)) pidCandidates.push(f.catalogUrl || `/hmi/svg/${f.rel}`);
  }

  catalog.sort((a, b) => a.path.localeCompare(b.path));
  pidCandidates.sort();

  const summary = {
    organizedAt: new Date().toISOString(),
    moved,
    skipped,
    total: catalog.length,
    groups: [...new Set(catalog.map((c) => c.group))].sort(),
    pidFaceplateCandidates: pidCandidates.slice(0, 80),
    pidNote: 'Use library/pid-faceplates/peaklogic/pid_loop_standard.svg or compose from MV gauge dial + bar graph + bezels.',
  };

  if (!dryRun) {
    if (!catalogOnly && Object.keys(aliases).length) {
      fs.writeFileSync(path.join(SVG_ROOT, 'path-aliases.json'), JSON.stringify(aliases, null, 2));
    }
    fs.writeFileSync(path.join(SVG_ROOT, 'graphics-catalog.json'), JSON.stringify({ summary, assets: catalog }, null, 2));
    fs.writeFileSync(path.join(SVG_ROOT, 'pid-faceplate-index.json'), JSON.stringify({
      composite: '/hmi/svg/library/pid-faceplates/peaklogic/pid_loop_standard.svg',
      parts: pidCandidates.filter((p) => !p.includes('pid_loop_standard')).slice(0, 40),
      note: summary.pidNote,
    }, null, 2));

    // Remove empty legacy dirs
    for (const legacy of ['opto22', 'mblogic', 'mv-import']) {
      const legacyPath = path.join(SVG_ROOT, legacy);
      if (fs.existsSync(legacyPath)) {
        try {
          const remaining = fs.readdirSync(legacyPath, { recursive: true });
          const hasFiles = remaining.some((x) => ASSET_EXT.test(String(x)));
          if (!hasFiles) fs.rmSync(legacyPath, { recursive: true, force: true });
        } catch { /* ignore */ }
      }
    }
  }

  console.log(dryRun ? '[dry-run]' : 'Done:', summary);
}

main();
