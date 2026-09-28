'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('mvDrawStore saveNamedProject', () => {
  it('keeps project name separate from library file name', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mvdraw-store-'));
    const configPath = path.join(tmp, 'config.js');
    fs.writeFileSync(configPath, `module.exports = { DATA_DIR: ${JSON.stringify(path.join(tmp, 'data'))} };`);
    const storePath = path.join(tmp, 'mvDrawStore.js');
    const storeSrc = fs.readFileSync(
      path.join(__dirname, '../mv-draw/src/mvDrawStore.js'),
      'utf8',
    ).replace(
      "require('../../src/config')",
      `require(${JSON.stringify(configPath)})`,
    );
    fs.writeFileSync(storePath, storeSrc);
    const formatPath = path.dirname(storePath);
    fs.cpSync(path.join(__dirname, '../mv-draw/src/mvDrawFormat.js'), path.join(formatPath, 'mvDrawFormat.js'));
    fs.cpSync(path.join(__dirname, '../mv-draw/src/extents.js'), path.join(formatPath, 'extents.js'));
    fs.cpSync(path.join(__dirname, '../mv-draw/src/groups.js'), path.join(formatPath, 'groups.js'));
    const { saveNamedProject } = require(storePath);
    const { project, file } = saveNamedProject('dwts_site', {
      format: 'peaklogic-mvdraw',
      version: 1,
      name: 'Magnolia DWTS layout',
      units: 'ft',
      nodes: [],
      edges: [],
      groups: [],
      annotations: [],
      meta: { client: '', site: '', notes: '' },
    });
    assert.equal(file, 'dwts_site.mvdraw.json');
    assert.equal(project.libraryFile, 'dwts_site.mvdraw.json');
    assert.equal(project.name, 'Magnolia DWTS layout');
  });
});
