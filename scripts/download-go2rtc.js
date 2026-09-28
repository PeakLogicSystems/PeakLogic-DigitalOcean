'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { VENDOR_DIR, go2rtcExeName } = require('./go2rtc-paths');

const GITHUB_API = 'https://api.github.com/repos/AlexxIT/go2rtc/releases/latest';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'PeakLogic-go2rtc-download' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, {
      headers: { 'User-Agent': 'PeakLogic-go2rtc-download' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Download failed (${res.statusCode})`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      reject(err);
    });
  });
}

function pickAsset(release) {
  const assets = release.assets || [];
  const isWin = process.platform === 'win32';
  const isLinux = process.platform === 'linux';
  const isArm = process.arch === 'arm64';

  if (isWin) {
    return assets.find((a) => /go2rtc_win64\.zip$/i.test(a.name));
  }
  if (isLinux && isArm) {
    return assets.find((a) => /go2rtc_linux_arm64\.zip$/i.test(a.name));
  }
  if (isLinux) {
    return assets.find((a) => /go2rtc_linux_amd64\.zip$/i.test(a.name));
  }
  if (process.platform === 'darwin' && isArm) {
    return assets.find((a) => /go2rtc_mac_arm64\.zip$/i.test(a.name));
  }
  if (process.platform === 'darwin') {
    return assets.find((a) => /go2rtc_mac_amd64\.zip$/i.test(a.name));
  }
  return null;
}

function extractZip(zipPath, destDir) {
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' },
    );
    return;
  }
  execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
}

async function main() {
  const exeName = go2rtcExeName();
  const destExe = path.join(VENDOR_DIR, exeName);
  if (fs.existsSync(destExe)) {
    console.log(`go2rtc already installed: ${destExe}`);
    return;
  }

  console.log('Fetching latest go2rtc release…');
  const release = await fetchJson(GITHUB_API);
  const asset = pickAsset(release);
  if (!asset) {
    throw new Error(`No go2rtc binary for ${process.platform}/${process.arch} in release ${release.tag_name}`);
  }

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const zipPath = path.join(VENDOR_DIR, asset.name);
  console.log(`Downloading ${asset.name}…`);
  await downloadFile(asset.browser_download_url, zipPath);
  console.log('Extracting…');
  extractZip(zipPath, VENDOR_DIR);
  try { fs.unlinkSync(zipPath); } catch { /* ignore */ }

  if (!fs.existsSync(destExe)) {
    const entries = fs.readdirSync(VENDOR_DIR);
    const nested = entries.find((e) => e === exeName || e.endsWith('.exe'));
    if (nested && nested !== exeName) {
      fs.renameSync(path.join(VENDOR_DIR, nested), destExe);
    }
  }

  if (!fs.existsSync(destExe)) {
    throw new Error(`Expected ${destExe} after extract`);
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(destExe, 0o755);
  }
  console.log(`Installed go2rtc: ${destExe} (${release.tag_name})`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
