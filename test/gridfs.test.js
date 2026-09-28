'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { fileSummary } = require('../src/storage/gridfsStore');
const { CameraRegistry } = require('../src/cameras/cameraRegistry');

describe('gridfsStore fileSummary', () => {
  it('maps GridFS file doc to summary', () => {
    const summary = fileSummary({
      _id: { toString: () => 'abc123' },
      filename: 'cam_1.jpg',
      length: 4096,
      contentType: 'image/jpeg',
      uploadDate: new Date('2026-01-01T00:00:00.000Z'),
      metadata: { cameraId: 'cam_1', reason: 'manual' },
    });
    assert.equal(summary.fileId, 'abc123');
    assert.equal(summary.metadata.cameraId, 'cam_1');
  });
});

describe('cameraRegistry project export', () => {
  it('exports and imports camera inventory', () => {
    const reg = new CameraRegistry();
    reg.createCamera({
      cameraId: `cam_exp_${Date.now()}`,
      name: 'Yard',
      host: '10.0.0.5',
      onvifUrl: 'http://10.0.0.5:8000/onvif/device_service',
      rtspUrl: 'rtsp://admin:pass@10.0.0.5:554/h264Preview_01_sub',
    });
    const exported = reg.exportForProject();
    assert.ok(exported.cameras);
    const reg2 = new CameraRegistry();
    const result = reg2.importFromProject(exported);
    assert.ok(result.imported >= 1);
  });
});
