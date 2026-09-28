'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('facilityDrawStore saveNamedProject', () => {
  it('keeps project name separate from library file name', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'facilitydraw-store-'));
    const configPath = path.join(tmp, 'config.js');
    fs.writeFileSync(configPath, `module.exports = { DATA_DIR: ${JSON.stringify(path.join(tmp, 'data'))} };`);
    const storePath = path.join(tmp, 'facilityDrawStore.js');
    const storeSrc = fs.readFileSync(
      path.join(__dirname, '../facility-draw/src/facilityDrawStore.js'),
      'utf8',
    ).replace(
      "require('../../src/config')",
      `require(${JSON.stringify(configPath)})`,
    );
    fs.writeFileSync(storePath, storeSrc);
    const formatPath = path.dirname(storePath);
    fs.cpSync(path.join(__dirname, '../facility-draw/src/facilityDrawFormat.js'), path.join(formatPath, 'facilityDrawFormat.js'));
    fs.cpSync(path.join(__dirname, '../facility-draw/src/extents.js'), path.join(formatPath, 'extents.js'));
    fs.cpSync(path.join(__dirname, '../facility-draw/src/groups.js'), path.join(formatPath, 'groups.js'));
    const { saveNamedProject } = require(storePath);
    const { project, file } = saveNamedProject('dwts_site', {
      format: 'peaklogic-facilitydraw',
      version: 1,
      name: 'Magnolia DWTS layout',
      units: 'ft',
      nodes: [],
      edges: [],
      groups: [],
      annotations: [],
      meta: { client: '', site: '', notes: '' },
    });
    assert.equal(file, 'dwts_site.facilitydraw.json');
    assert.equal(project.libraryFile, 'dwts_site.facilitydraw.json');
    assert.equal(project.name, 'Magnolia DWTS layout');
  });
});
