'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');

/**
 * Open a native file picker defaulting to initialDir (PeakLogic PC appliance).
 * Returns absolute path, or null when cancelled / unavailable.
 */
function pickProjectImportFile(initialDir) {
  const dir = String(initialDir || '').trim();
  if (!dir || !fs.existsSync(dir)) return null;

  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$d = New-Object System.Windows.Forms.OpenFileDialog',
      `$d.InitialDirectory = ${JSON.stringify(dir)}`,
      "$d.Filter = 'PeakLogic projects (*.est.zip;*.est.json)|*.est.zip;*.est.json;*.mvbundle;*.json|All files (*.*)|*.*'",
      "$d.Title = 'Import PeakLogic project'",
      'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }',
    ].join('; ');
    try {
      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-STA', '-Command', script],
        { encoding: 'utf8', timeout: 300000, windowsHide: false },
      );
      const picked = String(out || '').trim();
      return picked && fs.existsSync(picked) ? picked : null;
    } catch {
      return null;
    }
  }

  if (process.platform === 'darwin') {
    try {
      const out = execFileSync(
        'osascript',
        ['-e', `POSIX path of (choose file with prompt "Import PeakLogic project" default location (POSIX file ${JSON.stringify(dir)}))`],
        { encoding: 'utf8', timeout: 300000 },
      );
      const picked = String(out || '').trim();
      return picked && fs.existsSync(picked) ? picked : null;
    } catch {
      return null;
    }
  }

  try {
    const out = execFileSync(
      'zenity',
      [
        '--file-selection',
        '--title=Import PeakLogic project',
        `--filename=${dir.replace(/\/$/, '')}/`,
        '--file-filter=*.est.zip *.est.json *.mvbundle *.json',
      ],
      { encoding: 'utf8', timeout: 300000 },
    );
    const picked = String(out || '').trim();
    return picked && fs.existsSync(picked) ? picked : null;
  } catch {
    return null;
  }
}

module.exports = { pickProjectImportFile };
