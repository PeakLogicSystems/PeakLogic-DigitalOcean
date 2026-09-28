'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  buildFacilityConfig,
  MAX_SUPPORTED_ROOMS,
  ROOMS_PER_WING,
  wingsOnFloor,
} = require('../scripts/assisted-living/facility-config');
const { floorHubScreenId, wingScreenId } = require('../scripts/assisted-living/alf-screen-plan');

const ROOT = path.resolve(__dirname, '..');

describe('assisted living 2000-room scale', () => {
  it('caps room count and builds campus config for 2000 rooms', () => {
    const cfg = buildFacilityConfig(2000);
    assert.equal(cfg.totalRooms, 2000);
    assert.equal(cfg.floors, 21);
    assert.equal(cfg.campusLayout, true);
    assert.equal(cfg.roomsOnFloor.reduce((a, b) => a + b, 0), 2000);
    assert.equal(cfg.totalResidentialUnits, 2075);
    assert.equal(cfg.roomTagPadWidth, 5);
    assert.ok(cfg.recommendMaxTags >= 20000);
    assert.equal(floorHubScreenId(1), 'screen_26');
    assert.equal(wingScreenId(1, 1), 'screen_100');
    assert.equal(wingsOnFloor(cfg.roomsOnFloor[0]), Math.ceil(cfg.roomsOnFloor[0] / ROOMS_PER_WING));
    assert.equal(buildFacilityConfig(9999).totalRooms, MAX_SUPPORTED_ROOMS);
  });

  it('generates 2000-room project when PEAKLOGIC_MAX_TAGS is raised', () => {
    const out = execFileSync(
      process.execPath,
      ['scripts/assisted-living/generate-est.js', '--rooms', '2000'],
      {
        cwd: ROOT,
        env: { ...process.env, PEAKLOGIC_MAX_TAGS: '25000' },
        encoding: 'utf8',
      },
    );
    assert.match(out, /assisted-living/);
    const estPath = path.join(ROOT, 'data/projects/assisted-living.est.json');
    const est = JSON.parse(fs.readFileSync(estPath, 'utf8'));
    assert.equal(est.settings.assistedLiving.facility.totalRooms, 2000);
    assert.equal(est.settings.assistedLiving.facility.campusLayout, true);
    assert.equal(est.settings.assistedLiving.facility.floors, 21);
    const wingScreens = est.settings.hmi.screens.filter((s) => /^F\d+ Wing/.test(s.name));
    assert.ok(wingScreens.length >= 80);
    const hubScreens = est.settings.hmi.screens.filter((s) => /^Floor \d+ \(/.test(s.name));
    assert.equal(hubScreens.length, 21);
    const rmTags = est.tags.filter((t) => /^RM\d+_/.test(t.id));
    assert.equal(rmTags.length, 2075 * 10);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/hmi/svg/demos/assisted-living/floor_1_hub.svg')));
    assert.ok(fs.existsSync(path.join(ROOT, 'public/hmi/svg/demos/assisted-living/floor_1_wing_1.svg')));
  });

  it('restores default 200-room project', () => {
    execFileSync(process.execPath, ['scripts/assisted-living/generate-est.js'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const est = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects/assisted-living.est.json'), 'utf8'));
    assert.equal(est.settings.assistedLiving.facility.totalRooms, 200);
    assert.equal(est.settings.assistedLiving.facility.campusLayout, false);
  });
});
