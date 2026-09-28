'use strict';

/**
 * Download Opto 22 Image Library assets for local HMI use (SVG, GIF, PNG).
 * Source catalog is embedded in:
 * https://www.opto22.com/support/resources-tools/image-library-svg-editors
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PAGE_URL = 'https://www.opto22.com/support/resources-tools/image-library-svg-editors';
const BASE = 'https://www.opto22.com';
const OUT_ROOT = path.join(__dirname, '..', 'public', 'hmi', 'svg', 'mv-import');

const LIBRARIES = [
  { array: 'images_editable', folder: 'editable', urlPath: '/Opto22/media/imagelibrary/editable/', extensions: ['.svg'] },
  { array: 'images_asis', folder: 'asis', urlPath: '/Opto22/media/imagelibrary/asis/', extensions: ['.svg'] },
  { array: 'products', folder: 'products', urlPath: '/Opto22/media/imagelibrary/products/', extensions: ['.svg'] },
  { array: 'logos', folder: 'logos', urlPath: '/Opto22/media/imagelibrary/logos/', extensions: ['.svg'] },
  { array: 'bitmapobjects', folder: 'animations', urlPath: '/Opto22/media/imagelibrary/gifpng/', extensions: ['.gif', '.png'] },
];

const CONCURRENCY = 12;
const RETRIES = 3;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PeakLogic/1.0 (Opto library sync)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).href));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${url} -> HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PeakLogic/1.0 (Opto library sync)' } }, (res) => {
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

function extractArray(html, name, extensions) {
  const start = html.indexOf(`var ${name} = [`);
  if (start < 0) return [];
  let i = start + `var ${name} = `.length;
  let depth = 0;
  let inStr = false;
  let quote = '';
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        const body = html.slice(start + `var ${name} = `.length, i + 1);
        const filenames = [...body.matchAll(/"filename"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
        const exts = extensions || ['.svg'];
        return filenames.filter((f) => exts.some((e) => f.toLowerCase().endsWith(e.toLowerCase())));
      }
    }
  }
  return [];
}

async function downloadOne(item) {
  const outDir = path.join(OUT_ROOT, item.folder);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, item.filename);
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
    return { ...item, status: 'skipped' };
  }
  const url = `${BASE}${item.urlPath}${item.filename}`;
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const buf = await fetchBuffer(url);
      if (!buf.length) throw new Error('empty file');
      fs.writeFileSync(outFile, buf);
      return { ...item, status: 'ok', bytes: buf.length };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return { ...item, status: 'failed', error: String(lastErr?.message || lastErr) };
}

async function runPool(items, worker) {
  const results = [];
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
      if ((i + 1) % 50 === 0 || i + 1 === items.length) {
        const ok = results.filter((r) => r?.status === 'ok').length;
        const skip = results.filter((r) => r?.status === 'skipped').length;
        const fail = results.filter((r) => r?.status === 'failed').length;
        process.stdout.write(`\rProgress ${i + 1}/${items.length}  ok=${ok} skip=${skip} fail=${fail}   `);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => next()));
  process.stdout.write('\n');
  return results;
}

async function main() {
  console.log('Fetching Opto 22 image library catalog…');
  const html = await fetchText(PAGE_URL);
  const items = [];
  for (const lib of LIBRARIES) {
    const files = extractArray(html, lib.array, lib.extensions);
    const extLabel = lib.extensions.join(', ');
    console.log(`${lib.array}: ${files.length} file(s) [${extLabel}]`);
    for (const filename of files) {
      items.push({ filename, folder: lib.folder, urlPath: lib.urlPath, library: lib.array });
    }
  }
  const seen = new Set();
  const unique = items.filter((it) => {
    const key = `${it.folder}/${it.filename}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`Downloading ${unique.length} asset(s) to ${OUT_ROOT}`);

  const results = await runPool(unique, downloadOne);
  const summary = {
    downloadedAt: new Date().toISOString(),
    source: PAGE_URL,
    total: unique.length,
    ok: results.filter((r) => r.status === 'ok').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    failures: results.filter((r) => r.status === 'failed').map((r) => ({
      file: `${r.folder}/${r.filename}`,
      error: r.error,
    })),
    libraries: LIBRARIES.map((lib) => ({
      name: lib.array,
      folder: lib.folder,
      extensions: lib.extensions,
      count: unique.filter((u) => u.library === lib.array).length,
    })),
  };
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'manifest.json'), JSON.stringify(summary, null, 2));
  console.log('Done:', summary);
  if (summary.failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
