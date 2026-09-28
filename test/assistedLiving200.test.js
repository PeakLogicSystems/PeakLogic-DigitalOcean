'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  distributeRooms,
  buildFacilityConfig,
  DEFAULT_TOTAL_ROOMS,
} = require('../scripts/assisted-living/facility-config');
const { buildSemanticMap } = require('../scripts/assisted-living/nextcentury-map');

const ROOT = path.resolve(__dirname, '..');

describe('assisted living 200-room NextCentury', () => {
  it('defaults to 200 rooms across 3 floors', () => {
    const cfg = buildFacilityConfig();
    assert.equal(cfg.totalRooms, DEFAULT_TOTAL_ROOMS);
    assert.equal(cfg.totalRooms, 200);
    assert.deepEqual(cfg.roomsOnFloor, distributeRooms(200, 3));
    assert.equal(cfg.roomsOnFloor.reduce((a, b) => a + b, 0), 200);
    assert.equal(cfg.includesInteriorOffice, false);
    assert.equal(cfg.totalVillaUnits, 75);
    assert.equal(cfg.totalResidentialUnits, 275);
    assert.equal(cfg.villas.length, 3);
  });

  it('builds per-room NextCentury semantic map', () => {
    const rooms = [];
    for (let f = 1; f <= 3; f++) {
      const count = distributeRooms(200, 3)[f - 1];
      for (let i = 1; i <= count; i++) rooms.push(f * 100 + i);
    }
    const map = buildSemanticMap(rooms);
    assert.ok(map.length > 1000);
    assert.ok(map.some((m) => m.tagId === 'RM366_BED_TEMP'));
    assert.ok(map.some((m) => m.tagId === 'RM101_TOILET_LEAK'));
    assert.ok(map.some((m) => m.tagId === 'MECH_METER_KWH'));
  });

  it('generated assisted-living.est.json uses nextcentury driver', () => {
    const estPath = path.join(ROOT, 'data/projects/assisted-living.est.json');
    assert.ok(fs.existsSync(estPath));
    const est = JSON.parse(fs.readFileSync(estPath, 'utf8'));
    const nc = est.drivers.find((d) => d.type === 'nextcentury');
    assert.ok(nc?.enabled);
    assert.equal(est.settings.assistedLiving.facility.totalRooms, 200);
    assert.equal(est.settings.assistedLiving.facility.totalVillaUnits, 75);
    assert.equal(est.settings.assistedLiving.facility.totalResidentialUnits, 275);
    assert.equal(est.settings.assistedLiving.facility.villas.length, 3);
    assert.equal(est.settings.assistedLiving.nextCentury.driverId, 'nextcentury1');
    assert.ok(est.settings.assistedLiving.nextCentury.semanticMap.length >= 1300);
    const rmTags = est.tags.filter((t) => /^RM\d{3}_/.test(t.id));
    assert.equal(rmTags.length, 275 * 10);
    const villaScreens = est.settings.hmi.screens.filter((s) => /^screen_2[3-5]$/.test(s.id));
    assert.equal(villaScreens.length, 3);
    assert.ok(villaScreens.some((s) => s.name === 'Villa North'));
    assert.ok(!est.settings.hmi.layout.areaPopupScreens.includes('screen_23'));
  });

  it('villa screens keep room numbers above 500 (501–725)', () => {
    const estPath = path.join(ROOT, 'data/projects/assisted-living.est.json');
    const est = JSON.parse(fs.readFileSync(estPath, 'utf8'));
    const bases = [501, 601, 701];
    for (let i = 0; i < bases.length; i += 1) {
      const screen = est.settings.hmi.screens.find((s) => s.id === `screen_${23 + i}`);
      assert.ok(screen, `screen_${23 + i}`);
      const hotspots = (screen.tiles || []).flatMap((t) => t.layers || [])
        .filter((l) => l.kind === 'roomHotspot');
      assert.equal(hotspots.length, 25, screen.name);
      assert.equal(hotspots[0].roomNum, bases[i]);
      assert.equal(hotspots[24].roomNum, bases[i] + 24);
      assert.ok(hotspots.every((h) => h.roomNum > 500));
    }
  });

  it('site artifacts include 3 villas in 3D config and ortho DXF', () => {
    const cfgPath = path.join(ROOT, 'public/samples/assisted-living-site-config.js');
    const dxfPath = path.join(ROOT, 'public/samples/assisted-living-site-ortho.dxf');
    assert.ok(fs.existsSync(cfgPath));
    assert.ok(fs.existsSync(dxfPath));
    const cfgText = fs.readFileSync(cfgPath, 'utf8');
    assert.match(cfgText, /"totalResidentialUnits": 275/);
    assert.match(cfgText, /Villa North/);
    assert.match(cfgText, /Villa East/);
    assert.match(cfgText, /Villa South/);
    const dxf = fs.readFileSync(dxfPath, 'utf8');
    assert.match(dxf, /VILLA/);
    assert.match(dxf, /Main tower 200/);
  });
});
