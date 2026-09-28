'use strict';

/**
 * Vendor three@0.170.0 into public/vendor/three for offline 3D viewers.
 * Downloads the npm tarball and copies build + controls/ only.
 *
 * Usage: node scripts/download-three.js
 *   or:  npm run three:download
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

const THREE_VERSION = '0.170.0';
const TARBALL_URL = 'https://registry.npmjs.org/three/-/three-' + THREE_VERSION + '.tgz';
const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'public', 'vendor', 'three');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, {
      headers: { 'User-Agent': 'PeakLogic-three-download' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { /* ignore */ }
        return reject(new Error('Download failed (' + res.statusCode + '): ' + url));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch (e) { /* ignore */ }
      reject(err);
    });
  });
}

function extractTarball(tgzPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execSync('tar -xzf "' + tgzPath + '" -C "' + destDir + '"', { stdio: 'inherit' });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'three-vendor-'));
  const tgzPath = path.join(tmpRoot, 'three-' + THREE_VERSION + '.tgz');
  const extractDir = path.join(tmpRoot, 'extract');
  try {
    console.log('Downloading three@' + THREE_VERSION + '...');
    await downloadFile(TARBALL_URL, tgzPath);
    console.log('Extracting...');
    extractTarball(tgzPath, extractDir);
    const pkg = path.join(extractDir, 'package');
    if (!fs.existsSync(pkg)) throw new Error('Expected package/ in tarball extract');
    rmrf(VENDOR_DIR);
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
    const moduleSrc = path.join(pkg, 'build', 'three.module.js');
    if (!fs.existsSync(moduleSrc)) throw new Error('build/three.module.js missing');
    copyFile(moduleSrc, path.join(VENDOR_DIR, 'build', 'three.module.js'));
    const coreSrc = path.join(pkg, 'build', 'three.core.js');
    if (fs.existsSync(coreSrc)) copyFile(coreSrc, path.join(VENDOR_DIR, 'build', 'three.core.js'));
    const controlsSrc = path.join(pkg, 'examples', 'jsm', 'controls');
    if (!fs.existsSync(controlsSrc)) throw new Error('examples/jsm/controls missing');
    copyDir(controlsSrc, path.join(VENDOR_DIR, 'examples', 'jsm', 'controls'));
    const pkgJsonSrc = path.join(pkg, 'package.json');
    if (fs.existsSync(pkgJsonSrc)) copyFile(pkgJsonSrc, path.join(VENDOR_DIR, 'package.json'));
    const orbitDest = path.join(VENDOR_DIR, 'examples', 'jsm', 'controls', 'OrbitControls.js');
    if (!fs.existsSync(orbitDest)) throw new Error('OrbitControls.js missing after copy');
    const size = fs.statSync(path.join(VENDOR_DIR, 'build', 'three.module.js')).size;
    const controlCount = fs.readdirSync(path.join(VENDOR_DIR, 'examples', 'jsm', 'controls')).length;
    console.log('Vendored three@' + THREE_VERSION + ' -> ' + VENDOR_DIR);
    console.log('  build/three.module.js (' + size + ' bytes)');
    console.log('  examples/jsm/controls/ (' + controlCount + ' files)');
  } finally {
    try { rmrf(tmpRoot); } catch (e) { /* ignore */ }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
