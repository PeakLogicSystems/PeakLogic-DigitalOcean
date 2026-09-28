'use strict';

const fs = require('fs');
const path = require('path');
const projectStore = require('./projectStore');

function projectsDir() {
  return projectStore.projectsDir();
}

function isImportFile(name) {
  const base = path.basename(String(name || '').trim());
  if (!base || base.includes('..')) return false;
  return /\.est\.json$/i.test(base)
    || /\.est\.zip$/i.test(base)
    || /\.mvbundle$/i.test(base)
    || (/\.json$/i.test(base) && !/\.est\.json$/i.test(base));
}

function fileFormat(name) {
  if (/\.est\.zip$/i.test(name)) return 'archive';
  if (/\.est\.json$/i.test(name) || /\.mvbundle$/i.test(name) || /\.json$/i.test(name)) return 'json';
  return 'json';
}

function displayName(file) {
  return file
    .replace(/\.est\.zip$/i, '')
    .replace(/\.est\.json$/i, '')
    .replace(/\.mvbundle$/i, '')
    .replace(/\.json$/i, '');
}

function listImportableProjects() {
  const dir = projectsDir();
  if (!fs.existsSync(dir)) {
    return { projectsDir: dir, files: [] };
  }
  const files = fs.readdirSync(dir)
    .filter(isImportFile)
    .map((file) => {
      const fp = path.join(dir, file);
      const st = fs.statSync(fp);
      return {
        file,
        name: displayName(file),
        format: fileFormat(file),
        size: st.size,
        savedAt: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  return { projectsDir: dir, files };
}

function readImportableFile(filename) {
  const file = path.basename(String(filename || '').trim());
  if (!file || !isImportFile(file)) {
    throw Object.assign(new Error('Invalid project file name'), { status: 400 });
  }
  const fp = path.join(projectsDir(), file);
  if (!fs.existsSync(fp)) {
    throw Object.assign(new Error(`Project file not found: ${file}`), { status: 404 });
  }
  return { file, path: fp, buffer: fs.readFileSync(fp) };
}

function readImportablePath(absPath) {
  const fp = path.resolve(String(absPath || '').trim());
  const dir = path.resolve(projectsDir());
  if (fp !== dir && !fp.startsWith(`${dir}${path.sep}`)) {
    throw Object.assign(new Error('Path must be under data/projects/'), { status: 400 });
  }
  const file = path.basename(fp);
  if (!isImportFile(file)) {
    throw Object.assign(new Error('Not a PeakLogic project file'), { status: 400 });
  }
  if (!fs.existsSync(fp)) {
    throw Object.assign(new Error(`Project file not found: ${file}`), { status: 404 });
  }
  return { file, path: fp, buffer: fs.readFileSync(fp) };
}

module.exports = {
  projectsDir,
  listImportableProjects,
  readImportableFile,
  readImportablePath,
  isImportFile,
};
