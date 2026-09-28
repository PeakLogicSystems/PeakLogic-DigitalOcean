'use strict';

/**
 * Import MBLogic / HMIServer SVG symbol library (HMIBuilder HMISVGArt).
 * Source: MBLogic-All bundle on SourceForge (hmibuilder_2011-03-24.zip).
 * https://sourceforge.net/projects/mblogic/files/MBLogic-All/
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const MBLOGIC_ALL_URL =
  'https://sourceforge.net/projects/mblogic/files/MBLogic-All/MBLogic_All_Release-32/mblogic_all_2011-04-16.zip/download';
const HMIBUILDER_ZIP = 'hmibuilder_2011-03-24.zip';
const HMISVG_ROOT = 'HMISVGArt';
const OUT_ROOT = path.join(__dirname, '..', 'public', 'hmi', 'svg', 'library');
const CACHE_DIR = path.join(__dirname, '..', 'data', '.cache', 'mblogic');
const { MV_SYMBOL_MAP, slugPart, libraryGroupDir } = require('../src/hmi/hmiAssetCatalog');

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PeakLogic/1.0 (MBLogic library sync)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchBuffer(new URL(res.headers.location, url).href));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function expandZip(zipPath, destDir) {
  ensureDir(destDir);
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`],
      { stdio: 'pipe' }
    );
    return;
  }
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'pipe' });
}

function findHmibuilderZip(extractRoot) {
  const direct = path.join(extractRoot, HMIBUILDER_ZIP);
  if (fs.existsSync(direct)) return direct;
  const nested = path.join(extractRoot, 'mblogic_all', HMIBUILDER_ZIP);
  if (fs.existsSync(nested)) return nested;
  const hits = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const fp = path.join(dir, name);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (name === HMIBUILDER_ZIP) hits.push(fp);
    }
  }
  walk(extractRoot);
  return hits[0] || null;
}

function findHmiSvgArtRoot(extractRoot) {
  const hits = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const fp = path.join(dir, name);
      if (fs.statSync(fp).isDirectory()) {
        if (name === HMISVG_ROOT) hits.push(fp);
        else walk(fp);
      }
    }
  }
  walk(extractRoot);
  return hits[0] || null;
}

function categoryFolder(absPath, artRoot) {
  const folder = path.basename(path.dirname(absPath));
  const mapped = MV_SYMBOL_MAP[folder] || { group: 'Misc', subgroup: slugPart(folder) };
  const base = libraryGroupDir({ group: mapped.group });
  const sub = slugPart(mapped.subgroup) || 'general';
  return `${base}/${sub}/mv`;
}

/** Strip MBLogic HMIBuilder metadata; add PeakLogic-friendly element ids. */
function sanitizeMblogicSvg(text, fileName) {
  let s = text.replace(/^\uFEFF/, '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/\s*xmlns:mblogic="[^"]*"/gi, '');
  s = s.replace(/\s*mblogic:[^\s=]+=(?:'[^']*'|"[^"]*")/gi, '');
  s = s.replace(/\s*class="buttonactivate"/gi, '');

  const base = fileName.replace(/\.svg$/i, '');
  const isPilot = /^pl_/i.test(base) || /pilot_light/i.test(text);
  const isButton = /^pb_/i.test(base) || /pb_momentary|pb_toggle|pb_pulse|pb_menu|pb_masks/i.test(text);

  if (isPilot && !/\bid=["']lamp["']/i.test(s)) {
    const m = s.match(/<circle\b[^>]*>/i);
    if (m && !/\bid=/i.test(m[0])) {
      s = s.replace(m[0], m[0].replace('<circle', '<circle id="lamp"'));
    }
  }

  if (isButton && !/\bid=["']button["']/i.test(s)) {
    const m = s.match(/<rect\b[^>]*fill="url\(#[^"]+"[^>]*>/i)
      || s.match(/<rect\b[^>]*rx="[^"]+"[^>]*>/i);
    if (m && !/\bid=/i.test(m[0])) {
      s = s.replace(m[0], m[0].replace('<rect', '<rect id="button"'));
    }
  }

  return s;
}

function walkSvgs(dir, out, artRoot) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) walkSvgs(fp, out, artRoot);
    else if (/\.svg$/i.test(name)) out.push({ src: fp, category: categoryFolder(fp, artRoot), name });
  }
}

async function main() {
  ensureDir(CACHE_DIR);
  ensureDir(OUT_ROOT);

  const allZip = path.join(CACHE_DIR, 'mblogic_all_2011-04-16.zip');
  if (!fs.existsSync(allZip) || fs.statSync(allZip).size < 1_000_000) {
    console.log('Downloading MBLogic-All bundle…');
    const buf = await fetchBuffer(MBLOGIC_ALL_URL);
    fs.writeFileSync(allZip, buf);
    console.log(`Saved ${buf.length} bytes`);
  }

  const allExtract = path.join(CACHE_DIR, 'mblogic_all_extract');
  console.log('Extracting MBLogic-All…');
  expandZip(allZip, allExtract);

  const builderZip = findHmibuilderZip(allExtract);
  if (!builderZip) throw new Error(`Could not find ${HMIBUILDER_ZIP} in MBLogic-All bundle`);

  const builderExtract = path.join(CACHE_DIR, 'hmibuilder_extract');
  console.log(`Extracting ${path.basename(builderZip)}…`);
  expandZip(builderZip, builderExtract);

  const artRoot = findHmiSvgArtRoot(builderExtract);
  if (!artRoot) throw new Error(`Could not find ${HMISVG_ROOT} folder in HMIBuilder package`);

  const files = [];
  walkSvgs(artRoot, files, artRoot);
  console.log(`Copying ${files.length} SVG(s) to ${OUT_ROOT}`);

  const categories = {};
  let copied = 0;
  let skipped = 0;
  for (const f of files) {
    const outDir = path.join(OUT_ROOT, f.category);
    ensureDir(outDir);
    const outFile = path.join(outDir, f.name);
    const raw = fs.readFileSync(f.src, 'utf8');
    const clean = sanitizeMblogicSvg(raw, f.name);
    if (fs.existsSync(outFile) && fs.readFileSync(outFile, 'utf8') === clean) {
      skipped++;
    } else {
      fs.writeFileSync(outFile, clean, 'utf8');
      copied++;
    }
    categories[f.category] = (categories[f.category] || 0) + 1;
  }

  const summary = {
    downloadedAt: new Date().toISOString(),
    source: MBLOGIC_ALL_URL,
    hmibuilderZip: HMIBUILDER_ZIP,
    total: files.length,
    copied,
    skipped,
    categories: Object.entries(categories)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, count]) => ({ folder, count })),
  };
  fs.writeFileSync(path.join(OUT_ROOT, '..', 'mv-import-manifest.json'), JSON.stringify(summary, null, 2));
  console.log('Done:', summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
