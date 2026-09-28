'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('projectDiskCatalog', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-disk-catalog-'));
    process.env.PEAKLOGIC_DATA = tmpDir;
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/project/projectDiskCatalog')];
  });

  afterEach(() => {
    delete process.env.PEAKLOGIC_DATA;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists importable project files under data/projects', () => {
    const projectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.writeFileSync(path.join(projectsDir, 'putnam-county.est.zip'), Buffer.from('PK'));
    fs.writeFileSync(path.join(projectsDir, 'notes.txt'), 'skip');

    const catalog = require('../src/project/projectDiskCatalog').listImportableProjects();
    assert.equal(catalog.files.length, 1);
    assert.equal(catalog.files[0].file, 'putnam-county.est.zip');
    assert.equal(catalog.files[0].name, 'putnam-county');
  });
});
