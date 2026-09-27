'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  normalizeHmi,
  defaultDemoHmi,
  listSvgAssets,
  resolveAssetPath,
  HOME_SCREEN_ID,
  reindexHmiScreens,
  HMI_MAX_LAYERS,
  HMI_OBJ_KINDS,
} = require('../src/hmi/hmiConfig');

describe('hmiConfig', () => {
  it('normalizeHmi preserves valid activeScreen after reindex', () => {
    const hmi = normalizeHmi({
      activeScreen: 's2',
      screens: [
        { id: 's1', name: 'Main', svg: '/hmi/svg/a.svg' },
        { id: 's2', name: 'Alt', svg: '/hmi/svg/b.svg' },
      ],
      bindings: [],
    }, []);
    assert.equal(hmi.activeScreen, 'screen_2');
    assert.equal(hmi.screens[1].id, 'screen_2');
  });

  it('normalizeHmi reindexes screens and falls back to screen_1', () => {
    const tags = [{ id: 'DI1' }, { id: 'Q1' }];
    const hmi = normalizeHmi({
      activeScreen: 'missing',
      screens: [{ id: 's1', name: 'Main', svg: '/hmi/svg/a.svg' }],
      bindings: [
        { screenId: 's1', elementId: 'p1', tagId: 'Q1', property: 'fill' },
        { elementId: 'bad', tagId: 'NOPE', property: 'fill' },
        { elementId: '', tagId: 'DI1', property: 'fill' },
      ],
    }, tags);
    assert.equal(hmi.activeScreen, HOME_SCREEN_ID);
    assert.equal(hmi.screens.length, 1);
    assert.equal(hmi.screens[0].id, HOME_SCREEN_ID);
    assert.equal(hmi.screens[0].number, 1);
    assert.equal(hmi.screens[0].name, 'Main');
    assert.equal(hmi.bindings.length, 1);
    assert.equal(hmi.bindings[0].tagId, 'Q1');
    assert.equal(hmi.bindings[0].screenId, HOME_SCREEN_ID);
  });

  it('reindexHmiScreens assigns numeric ids and remaps bindings', () => {
    const { screens, bindings, activeScreen } = reindexHmiScreens([
      { id: 'demo_process', name: 'Process', svg: '/a.svg' },
      { id: 'custom', name: 'Other', svg: '/b.svg' },
    ], [
      { screenId: 'demo_process', elementId: 'p1', tagId: 'Q1', property: 'fill' },
      { screenId: 'custom', elementId: 'p2', tagId: 'DI1', property: 'fill' },
    ], 'custom');
    assert.equal(activeScreen, 'screen_2');
    assert.equal(screens[0].id, 'screen_1');
    assert.equal(screens[1].id, 'screen_2');
    assert.equal(bindings[0].screenId, 'screen_1');
    assert.equal(bindings[1].screenId, 'screen_2');
  });

  it('defaultDemoHmi includes demo screens and DI1/Q1 bindings', () => {
    const hmi = defaultDemoHmi();
    assert.equal(hmi.activeScreen, HOME_SCREEN_ID);
    assert.ok(hmi.screens.some((s) => s.id === 'screen_1' && s.number === 1));
    assert.ok(hmi.screens.some((s) => s.svg.includes('demo_controls.svg')));
    assert.ok(hmi.screens.some((s) => s.svg.includes('demo_process.svg')));
    assert.ok(hmi.bindings.some((b) => b.elementId === 'pilot_di1' && b.tagId === 'DI1'));
    assert.ok(hmi.bindings.some((b) => b.elementId === 'pump1' && b.tagId === 'Q1'));
  });

  it('normalizeHmi accepts backgroundFill binding', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: '@screen',
        tagId: 'DI1',
        property: 'backgroundFill',
        onValue: '#22c55e',
        offValue: '#94a3b8',
      }],
    }, [{ id: 'DI1' }]);
    assert.equal(hmi.bindings.length, 1);
    assert.equal(hmi.bindings[0].property, 'backgroundFill');
    assert.equal(hmi.bindings[0].elementId, '@screen');
  });

  it('normalizeBinding rewrites pilot shape_0 bindings to lamp', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't4_1_z0__shape_0',
        tagId: 'DI',
        property: 'fill',
      }],
    }, [{ id: 'DI' }]);
    assert.equal(hmi.bindings[0].elementId, 't4_1_z0__lamp');
  });

  it('normalizeTile upgrades pilot light layers to dynamicImage', () => {
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 3,
          row: 0,
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/controls/pilot-lights/standard/mblogic/pilot-light/pl_round.svg',
          }],
        }],
      }],
      bindings: [],
    }, []);
    assert.equal(hmi.screens[0].tiles[0].layers[0].kind, 'dynamicImage');
  });

  it('normalizeHmi stores state3 HOA switch min/max', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't2_3__hoa_switch',
        tagId: 'HOA1',
        property: 'state3',
        min: 0,
        max: 100,
      }],
    }, [{ id: 'HOA1' }]);
    assert.equal(hmi.bindings[0].property, 'state3');
    assert.equal(hmi.bindings[0].min, 0);
    assert.equal(hmi.bindings[0].max, 2);
  });

  it('normalizeHmi caps fill5 max at 4 when saved with analog scale', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't5_6_z0__lamp',
        tagId: 'ST1',
        property: 'fill5',
        min: 0,
        max: 100,
      }],
    }, [{ id: 'ST1' }]);
    assert.equal(hmi.bindings[0].max, 4);
  });

  it('normalizeHmi upgrades legacy fill5 warn yellow to alarm exclamation yellow', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't5_6_z0__lamp',
        tagId: 'ST1',
        property: 'fill5',
        colors: ['#22c55e', '#ef4444', '#facc15', '#f97316', '#64748b'],
      }],
    }, [{ id: 'ST1' }]);
    assert.equal(hmi.bindings[0].colors[2], '#fbed20');
  });

  it('normalizeHmi upgrades legacy warn-only flash to warn and fault flash', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't5_6_z0__lamp',
        tagId: 'ST1',
        property: 'fill5',
        flashStates: [2],
      }],
    }, [{ id: 'ST1' }]);
    assert.deepEqual(hmi.bindings[0].flashStates, [2, 3]);
  });

  it('normalizeHmi stores fill5 pilot state palette and flash', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't1_1_z0__lamp',
        tagId: 'ST1',
        property: 'fill5',
        colors: ['#22c55e', '#ef4444'],
      }],
    }, [{ id: 'ST1' }]);
    assert.equal(hmi.bindings.length, 1);
    assert.equal(hmi.bindings[0].property, 'fill5');
    assert.equal(hmi.bindings[0].colors.length, 5);
    assert.equal(hmi.bindings[0].colors[0], '#22c55e');
    assert.equal(hmi.bindings[0].colors[1], '#ef4444');
    assert.equal(hmi.bindings[0].colors[2], '#fbed20');
    assert.equal(hmi.bindings[0].min, 0);
    assert.equal(hmi.bindings[0].max, 4);
    assert.deepEqual(hmi.bindings[0].flashStates, [2, 3]);
  });

  it('normalizeHmi stores fill8 color palette', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 'tank1',
        tagId: 'AI1',
        property: 'fill8',
        colors: ['#111111', '#222222'],
      }],
    }, [{ id: 'AI1' }]);
    assert.equal(hmi.bindings.length, 1);
    assert.equal(hmi.bindings[0].property, 'fill8');
    assert.equal(hmi.bindings[0].colors.length, 8);
    assert.equal(hmi.bindings[0].colors[0], '#111111');
    assert.equal(hmi.bindings[0].colors[1], '#222222');
    assert.equal(hmi.bindings[0].colors[2], '#eab308');
  });

  it('listSvgAssets finds demo and mblogic symbols', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    assert.ok(assets.some((a) => a.path.includes('demos/demo_process.svg')));
    assert.ok(assets.some((a) => a.path.includes('library/controls/pilot-lights')));
    assert.ok(assets.some((a) => a.path.includes('library/pid-faceplates/peaklogic/pid_loop_standard.svg')));
  });

  it('listSvgAssets exposes only six pilot lights (simple + multistate)', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const pilots = assets.filter((a) => a.group === 'Controls — Pilot lights');
    assert.equal(pilots.length, 6);
    const names = pilots.map((a) => a.name).sort();
    assert.deepEqual(names, [
      'pl_multi_octagonal.svg',
      'pl_multi_round.svg',
      'pl_multi_square.svg',
      'pl_octagonal.svg',
      'pl_round.svg',
      'pl_square.svg',
    ]);
    const simple = pilots.filter((a) => a.subgroup === 'simple');
    const multi = pilots.filter((a) => a.subgroup === 'multistate');
    assert.equal(simple.length, 3);
    assert.equal(multi.length, 3);
    assert.ok(pilots.every((a) => !a.path.includes('/animated/')));
    assert.ok(pilots.every((a) => !a.path.includes('/labelled/')));
    assert.ok(pilots.every((a) => !a.path.includes('/system-')));
  });

  it('normalizeHmi migrates legacy demo svg paths', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const hmi = normalizeHmi({
      activeScreen: 'demo_process',
      screens: [{ id: 'demo_process', svg: '/hmi/svg/demo_process.svg' }],
      bindings: [],
    }, [], publicRoot);
    assert.equal(hmi.screens[0].id, HOME_SCREEN_ID);
    assert.equal(hmi.screens[0].svg, '/hmi/svg/demos/demo_process.svg');
  });

  it('resolveAssetPath finds moved demo files', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const resolved = resolveAssetPath(publicRoot, '/hmi/svg/demo_process.svg');
    assert.equal(resolved, '/hmi/svg/demos/demo_process.svg');
  });

  it('normalizeTile migrates legacy svg to layers and stacks z', () => {
    const legacy = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{ col: 1, row: 2, svg: '/hmi/svg/a.svg', label: 'Cap' }],
      }],
      bindings: [],
    }, []).screens[0].tiles[0];
    assert.equal(legacy.layers.length, 1);
    assert.equal(legacy.layers[0].kind, 'staticText');
    assert.equal(legacy.layers[0].z, 0);
    assert.equal(legacy.label, 'Cap');

    const stacked = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [
            { kind: 'staticImage', z: 0, svg: '/hmi/svg/base.svg' },
            { kind: 'dynamicImage', z: 4, svg: '/hmi/svg/run.svg', tagId: 'Q1' },
          ],
        }],
      }],
      bindings: [],
    }, []).screens[0].tiles[0];
    assert.equal(stacked.layers.length, 2);
    assert.equal(stacked.layers[1].z, 4);
    assert.equal(HMI_MAX_LAYERS, 5);
    assert.ok(HMI_OBJ_KINDS.includes('dynamicImage'));
  });

  it('normalizeScreen preserves layout fields and tiles', () => {
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        svg: '/a.svg',
        width: 1024,
        height: 768,
        fit: 'cover',
        scale: 150,
        background: '#112233',
        tiles: [
          { col: 0, row: 0, svg: '/hmi/svg/demos/demo_controls.svg' },
          { col: 9, row: 0, svg: '/bad.svg' },
          { col: 1, row: 1, svg: '' },
        ],
      }],
      bindings: [],
    }, [], path.join(__dirname, '..', 'public'));
    assert.equal(hmi.screens[0].id, HOME_SCREEN_ID);
    assert.equal(hmi.screens[0].fit, 'cover');
    assert.equal(hmi.screens[0].scale, 150);
    assert.equal(hmi.screens[0].background, '#112233');
    assert.equal(hmi.screens[0].tiles.length, 1);
    assert.equal(hmi.screens[0].tiles[0].col, 0);
    assert.equal(hmi.screens[0].tiles[0].row, 0);
    assert.ok(hmi.screens[0].tiles[0].svg.includes('demo_controls.svg'));
  });
});
