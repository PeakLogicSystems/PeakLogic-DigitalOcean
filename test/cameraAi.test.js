'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeResponse } = require('../src/cameras/inference/httpBackend');
const { notificationsFromPullXml } = require('../src/cameras/onvifEvents');
const { assetIdForCamera } = require('../src/cameras/cameraInference');

describe('http inference backend', () => {
  it('normalizes model response', () => {
    const out = normalizeResponse({
      score: 0.92,
      label: 'person',
      confidence: 0.88,
      model: 'yolov8',
      boxes: [{ x: 1, y: 2 }],
    });
    assert.equal(out.score, 0.92);
    assert.equal(out.label, 'person');
    assert.equal(out.modelId, 'yolov8');
    assert.equal(out.boxes.length, 1);
  });
});

describe('onvif event parser', () => {
  it('detects motion notifications', () => {
    const xml = `<NotificationMessage>
      <Topic>tt:RuleEngine/CellMotionDetector/Motion</Topic>
    </NotificationMessage>`;
    const notes = notificationsFromPullXml(xml);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].isMotion, true);
  });
});

describe('cameraInference helpers', () => {
  it('builds PdM asset id for camera', () => {
    assert.equal(assetIdForCamera('cam_yard', { cameraAiAssetPrefix: 'cam' }), 'cam:cam_yard');
  });
});
