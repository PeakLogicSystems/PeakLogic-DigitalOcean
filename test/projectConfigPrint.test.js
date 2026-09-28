'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { buildHtml } = require('../public/js/projectConfigPrint.js');

describe('projectConfigPrint', () => {
  it('buildHtml includes project sections for documentation', () => {
    const html = buildHtml({
      projectName: 'demo_plant',
      appVersion: '2.3.8',
      printedAt: '2026-07-22T12:00:00.000Z',
      settings: {
        scanMs: 100,
        activeProgram: 'logic/program.st',
        mqttParc: { enabled: true, brokerUrl: 'mqtt://192.168.1.1:1883' },
        pdm: { assetTags: { 'pump-101': ['AI1'] }, windowMin: 5 },
      },
      tags: [{ id: 'AI1', type: 'REAL', label: 'Level' }],
      drivers: [{ id: 'modbus1', type: 'modbus_tcp', enabled: true }],
      graphPens: [{ tagId: 'AI1', color: '#f00', scale: 1, offset: 0 }],
      hmi: { screens: [{ id: 'screen_1', number: 1, name: 'Overview' }], bindings: [], activeScreen: 'screen_1' },
      programs: [{ category: 'logic', name: 'program.st', path: 'logic/program.st' }],
      runtime: { running: true, scanMs: 100 },
    });
    assert.match(html, /demo_plant/);
    assert.match(html, /Project Configuration/);
    assert.match(html, /modbus1/);
    assert.match(html, /AI1/);
    assert.match(html, /pump-101/);
    assert.match(html, /Overview/);
  });
});
