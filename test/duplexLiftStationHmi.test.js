'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { repairCompositeBindings, explodeCompositeToEdit, listHmiComposites } = require('../src/hmi/hmiComposites');
const { normalizeHmi } = require('../src/hmi/hmiConfig');

const ROOT = path.resolve(__dirname, '..');
const EST = path.join(ROOT, 'data', 'projects', 'duplex-lift-station.est.json');
const PUBLIC = path.join(ROOT, 'public');

describe('duplex lift station HMI bindings', () => {
  it('explodeCompositeToEdit expands duplexls manifest into full-grid tile', () => {
    const manifest = listHmiComposites(PUBLIC)
      .find((c) => c.composite?.id === 'duplexls')?.composite;
    assert.ok(manifest?.parts?.length);
    const tile = explodeCompositeToEdit(manifest, 0, 0, {
      colSpan: 16,
      rowSpan: 13,
    });
    assert.equal(tile.compositeId, 'duplexls');
    assert.equal(tile.layers.length, manifest.parts.length);
    assert.equal(tile.layers[0].svg, manifest.parts[0].svg);
  });

  it('area popup refresh wires HOA and command buttons', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/hmiSetupUi.js'), 'utf8');
    const areaFn = src.slice(src.indexOf('function refreshHmiAreaPopupBindings'), src.indexOf('async function openHmiAreaPopup'));
    assert.match(areaFn, /wireHmiInteractiveControls/);
    assert.match(src, /#hmi-viewport, #hmi-room-popup/);
  });

  it('project has 3D overview and DUPLEXLS control screen only', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    assert.equal(est.settings.hmi.screens.length, 2);
    assert.equal(est.settings.hmi.screens[0].id, 'screen_1');
    assert.equal(est.settings.hmi.screens[1].id, 'screen_2');
    assert.deepEqual(est.settings.hmi.layout.areaPopupScreens, ['screen_2']);
    assert.ok(!est.settings.hmi.screens.some((s) => s.id === 'screen_3'));
  });

  it('DUPLEXLS screen uses duplexls composite tile', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const screen = est.settings.hmi.screens.find((s) => s.id === 'screen_2');
    assert.ok(screen);
    assert.equal(screen.name, 'DUPLEXLS');
    assert.equal(screen.svg, '/hmi/svg/library/lift-station-faceplates/peaklogic/duplexls.svg');
    assert.equal(screen.tiles.length, 1);
    assert.equal(screen.tiles[0].compositeId, 'duplexls');
    assert.equal(screen.tiles[0].layers[0].svg, screen.svg);
    assert.equal(screen.tiles[0].colSpan, 16);
    assert.equal(screen.tiles[0].rowSpan, 13);
    assert.equal(screen.inheritProjectLayout, false);
  });

  it('normalizeHmi keeps duplexls tile on screen_2 (inheritProjectLayout false)', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const hmi = normalizeHmi(est.settings.hmi, est.tags, PUBLIC);
    const screen = hmi.screens.find((s) => s.id === 'screen_2');
    assert.equal(screen?.tiles?.length, 1);
    assert.equal(screen.tiles[0].compositeId, 'duplexls');
    assert.equal(screen.gridRows, 13);
  });

  it('repairCompositeBindings applies duplexls pump and station bindings on screen_2', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const hmi = {
      screens: est.settings.hmi.screens,
      bindings: JSON.parse(JSON.stringify(est.settings.hmi.bindings)),
    };
    repairCompositeBindings(hmi, PUBLIC);
    const find = (elementId, property = 'fill') => hmi.bindings.find(
      (b) => b.screenId === 'screen_2' && b.elementId === elementId && b.property === property,
    );
    assert.equal(find('t1_1_z0__btn_p1_start')?.tagId, 'MOTOR1_START');
    assert.equal(find('t1_1_z0__btn_p2_start')?.tagId, 'MOTOR2_START');
    assert.equal(find('t1_1_z0__btn_p1_stop')?.tagId, 'MOTOR1_STOP');
    assert.equal(find('t1_1_z0__btn_p2_stop')?.tagId, 'MOTOR2_STOP');
    assert.equal(find('t1_1_z0__btn_p1_auto', 'fill5')?.interaction, 'hoaMode');
    assert.equal(find('t1_1_z0__btn_p1_auto', 'fill5')?.hoaValue, 0);
    assert.equal(find('t1_1_z0__btn_p1_hand', 'fill5')?.hoaValue, 2);
    assert.equal(find('t1_1_z0__lamp_phase_fault')?.tagId, 'PHASE_FAULT');
    assert.equal(find('t1_1_z0__lamp_status', 'fill5')?.tagId, 'STATION_STA');
    assert.equal(find('t1_1_z0__val_tank_level', 'text')?.tagId, 'TANK_LVL');
  });

  it('duplexls composite manifest lists overview bindings', () => {
    const lift = listHmiComposites(PUBLIC)
      .find((c) => c.composite?.id === 'duplexls')?.composite;
    assert.ok(lift, 'duplexls composite');
    assert.equal(lift.parts[0].svg, '/hmi/svg/library/lift-station-faceplates/peaklogic/duplexls.svg');
    assert.ok(lift.defaultBindings.some((b) => b.elementId === 'btn_p1_start' && b.interaction === 'pulse'));
    assert.ok(lift.defaultBindings.some((b) => b.elementId === 'lamp_phase_fault' && b.tagRole === 'phaseFault'));
    assert.ok(lift.defaultBindings.some((b) => b.elementId === 'lamp_status' && b.tagRole === 'stationSta'));
  });

  it('pump command bindings declare pulse interaction', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    for (const suffix of ['btn_p1_start', 'btn_p1_stop', 'btn_p2_start', 'btn_p2_stop']) {
      const b = est.settings.hmi.bindings.find(
        (x) => x.screenId === 'screen_2' && x.elementId === `t1_1_z0__${suffix}`,
      );
      assert.ok(b, `missing t1_1_z0__${suffix}`);
      assert.equal(b.interaction, 'pulse', `${b.elementId} should be pulse`);
    }
  });

  it('normalizeHmi keeps DUPLEXLS hoaValue and stationSta format', () => {
    const est = JSON.parse(fs.readFileSync(EST, 'utf8'));
    const hmi = normalizeHmi(est.settings.hmi, est.tags, PUBLIC);
    const find = (suffix, property) => hmi.bindings.find(
      (b) => b.screenId === 'screen_2' && b.elementId === `t1_1_z0__${suffix}` && b.property === property,
    );
    assert.equal(find('btn_p1_auto', 'fill5')?.interaction, 'hoaMode');
    assert.equal(find('btn_p1_auto', 'fill5')?.hoaValue, 0);
    assert.equal(find('btn_p1_off', 'fill5')?.hoaValue, 1);
    assert.equal(find('btn_p1_hand', 'fill5')?.hoaValue, 2);
    assert.equal(find('btn_p2_hand', 'fill5')?.hoaValue, 2);
    assert.equal(find('txt_station_status', 'text')?.format, 'stationSta');
    assert.equal(find('btn_alt_off', 'fill')?.interaction, 'toggle');
  });

  it('DUPLEXLS SVG ids cover every indication and button binding', () => {
    const lift = listHmiComposites(PUBLIC)
      .find((c) => c.composite?.id === 'duplexls')?.composite;
    const svgRel = String(lift.parts[0].svg || '').replace(/^[/\\]+/, '');
    const svg = fs.readFileSync(path.join(PUBLIC, ...svgRel.split(/[/\\]/)), 'utf8');
    const svgIds = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const expected = {
      val_tank_level: { property: 'text', tagRole: 'tankLevel' },
      lamp_float_high: { property: 'fill', tagRole: 'lvlHigh' },
      lamp_float_lag: { property: 'fill', tagRole: 'lvlLag' },
      lamp_float_lead: { property: 'fill', tagRole: 'lvlLead' },
      lamp_float_off: { property: 'fill', tagRole: 'lvlOff' },
      lamp_status: { property: 'fill5', tagRole: 'stationSta' },
      txt_station_status: { property: 'text', tagRole: 'stationSta', format: 'stationSta' },
      lamp_phase_fault: { property: 'fill', tagRole: 'phaseFault' },
      lamp_gen_run: { property: 'fill', tagRole: 'genRun' },
      lamp_gen_fuel: { property: 'fill', tagRole: 'genFuelFault' },
      lamp_gen_fault: { property: 'fill', tagRole: 'genFault' },
      ind_p1_running: { property: 'fill', tagRole: 'motor1Run' },
      ind_p1_stopped: { property: 'fill', tagRole: 'motor1Run' },
      txt_p1_running: { property: 'fill', tagRole: 'motor1Run' },
      txt_p1_stopped: { property: 'fill', tagRole: 'motor1Run' },
      ind_p2_running: { property: 'fill', tagRole: 'motor2Run' },
      ind_p2_stopped: { property: 'fill', tagRole: 'motor2Run' },
      txt_p2_running: { property: 'fill', tagRole: 'motor2Run' },
      txt_p2_stopped: { property: 'fill', tagRole: 'motor2Run' },
      btn_p1_auto: { property: 'fill5', tagRole: 'motor1Hoa', interaction: 'hoaMode', hoaValue: 0 },
      btn_p1_off: { property: 'fill5', tagRole: 'motor1Hoa', interaction: 'hoaMode', hoaValue: 1 },
      btn_p1_hand: { property: 'fill5', tagRole: 'motor1Hoa', interaction: 'hoaMode', hoaValue: 2 },
      btn_p2_auto: { property: 'fill5', tagRole: 'motor2Hoa', interaction: 'hoaMode', hoaValue: 0 },
      btn_p2_off: { property: 'fill5', tagRole: 'motor2Hoa', interaction: 'hoaMode', hoaValue: 1 },
      btn_p2_hand: { property: 'fill5', tagRole: 'motor2Hoa', interaction: 'hoaMode', hoaValue: 2 },
      val_p1_starts: { property: 'text', tagRole: 'motor1Starts' },
      val_p2_starts: { property: 'text', tagRole: 'motor2Starts' },
      val_p1_hrs: { property: 'text', tagRole: 'motor1Hrs' },
      val_p2_hrs: { property: 'text', tagRole: 'motor2Hrs' },
      btn_p1_start: { property: 'fill', tagRole: 'motor1Start', interaction: 'pulse' },
      btn_p1_stop: { property: 'fill', tagRole: 'motor1Stop', interaction: 'pulse' },
      btn_p2_start: { property: 'fill', tagRole: 'motor2Start', interaction: 'pulse' },
      btn_p2_stop: { property: 'fill', tagRole: 'motor2Stop', interaction: 'pulse' },
      lamp_alt_off: { property: 'fill', tagRole: 'altOff' },
      btn_alt_off: { property: 'fill', tagRole: 'altOff', interaction: 'toggle' },
    };
    for (const [id, spec] of Object.entries(expected)) {
      assert.ok(svgIds.has(id), `SVG missing #${id}`);
      const b = lift.defaultBindings.find((x) => x.elementId === id && x.property === spec.property);
      assert.ok(b, `manifest missing ${id}/${spec.property}`);
      assert.equal(b.tagRole, spec.tagRole, `${id} tagRole`);
      if (spec.interaction) assert.equal(b.interaction, spec.interaction, `${id} interaction`);
      if (spec.hoaValue != null) assert.equal(b.hoaValue, spec.hoaValue, `${id} hoaValue`);
      if (spec.format) assert.equal(b.format, spec.format, `${id} format`);
    }
    assert.match(svg, /\.btn-text\s*\{[^}]*pointer-events:\s*none/);
  });
});
