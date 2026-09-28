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
  MAX_SCREENS,
  MAX_ROOM_NUM,
  normalizeRoomPopup,
  normalizeRoomNum,
} = require('../src/hmi/hmiConfig');
const { listHmiComposites } = require('../src/hmi/hmiComposites');

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
            svg: '/hmi/svg/library/controls/pilot-lights/standard/mv/pilot-light/pl_round.svg',
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

  it('normalizeHmi stores strip chart pen count on tile layer', () => {
    const stripPath = '/hmi/svg/library/charts-trends/strip-charts/mv/chart-strip/strip_chart.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{ kind: 'staticImage', z: 0, svg: stripPath, stripChart: { penCount: 3 } }],
        }],
      }],
      bindings: [],
    }, []);
    assert.equal(hmi.screens[0].tiles.length, 1);
    assert.equal(hmi.screens[0].tiles[0].layers[0].stripChart.penCount, 3);
    assert.equal(hmi.screens[0].tiles[0].layers[0].stripChart.chartScale.min, 0);
    assert.equal(hmi.screens[0].tiles[0].layers[0].stripChart.chartScale.max, 100);
    assert.equal(hmi.screens[0].tiles[0].layers[0].stripChart.chartScale.show, true);
  });

  it('normalizeHmi stores gauge column count and chart scale on tile layer', () => {
    const colPath = '/hmi/svg/library/gauges-meters/column/mv/gauge-column/gauge_column_green.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{
            kind: 'dynamicImage',
            z: 0,
            svg: colPath,
            gaugeColumn: { columnCount: 4, chartScale: { min: 10, max: 90, divisions: 4, show: false } },
          }],
        }],
      }],
      bindings: [],
    }, []);
    const layer = hmi.screens[0].tiles[0].layers[0];
    assert.match(layer.svg, /gauge_column\.svg$/);
    assert.equal(layer.gaugeColumn.columnCount, 4);
    assert.equal(layer.gaugeColumn.chartScale.min, 10);
    assert.equal(layer.gaugeColumn.chartScale.max, 90);
    assert.equal(layer.gaugeColumn.chartScale.divisions, 4);
    assert.equal(layer.gaugeColumn.chartScale.show, false);
  });

  it('normalizeChartScale applies defaults for invalid values', () => {
    const { normalizeChartScale } = require('../src/hmi/hmiConfig');
    const scale = normalizeChartScale({ min: 'x', max: null, divisions: 99 });
    assert.equal(scale.min, 0);
    assert.equal(scale.max, 100);
    assert.equal(scale.divisions, 20);
    assert.equal(scale.labelColor, '#64748b');
  });

  it('normalizeHmi infers push button mode from asset path subgroup', () => {
    const momentPath = '/hmi/svg/library/controls/push-buttons/momentary/mv/pb-momentary/pb_moment_square_green.svg';
    const togglePath = '/hmi/svg/library/controls/push-buttons/toggle/mv/pb-toggle1/pb_toggle1_square_green.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [
          { col: 0, row: 0, layers: [{ kind: 'dynamicImage', z: 0, svg: momentPath }] },
          { col: 1, row: 0, layers: [{ kind: 'dynamicImage', z: 0, svg: togglePath }] },
        ],
      }],
      bindings: [],
    }, []);
    assert.equal(hmi.screens[0].tiles[0].layers[0].pushButton.mode, 'momentary');
    assert.equal(hmi.screens[0].tiles[1].layers[0].pushButton.mode, 'latched');
  });

  it('normalizeHmi keeps explicit push button mode on tile layer', () => {
    const path = '/hmi/svg/library/controls/push-buttons/momentary/mv/pb-momentary/pb_moment_square_green.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{ kind: 'dynamicImage', z: 0, svg: path, pushButton: { mode: 'latched' } }],
        }],
      }],
      bindings: [],
    }, []);
    assert.equal(hmi.screens[0].tiles[0].layers[0].pushButton.mode, 'latched');
  });

  it('pushButtonInteractionForMode maps mode to binding interaction', () => {
    const { pushButtonInteractionForMode } = require('../src/hmi/hmiConfig');
    assert.equal(pushButtonInteractionForMode('momentary'), 'pulse');
    assert.equal(pushButtonInteractionForMode('latched'), 'toggle');
  });

  it('normalizeHmi migrates legacy colored push button to canonical asset', () => {
    const legacy = '/hmi/svg/library/controls/push-buttons/momentary/mv/pb-momentary/pb_moment_oblong_red.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{ kind: 'dynamicImage', z: 0, svg: legacy }],
        }],
      }],
      bindings: [],
    }, []);
    const layer = hmi.screens[0].tiles[0].layers[0];
    assert.match(layer.svg, /pb-canonical\/push_button_oblong\.svg$/);
    assert.equal(layer.pushButton.shape, 'oblong');
    assert.equal(layer.pushButton.colors.background, '#ef4444');
    assert.equal(layer.pushButton.mode, 'momentary');
  });

  it('normalizeHmi keeps explicit push button shape and colors', () => {
    const path = '/hmi/svg/library/controls/push-buttons/mv/pb-canonical/push_button_square.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{
            kind: 'dynamicImage',
            z: 0,
            svg: path,
            pushButton: {
              mode: 'latched',
              shape: 'round',
              colors: { background: '#2563eb', text: '#ffffff', bezel: '#334155' },
            },
          }],
        }],
      }],
      bindings: [],
    }, []);
    const pb = hmi.screens[0].tiles[0].layers[0].pushButton;
    assert.equal(pb.mode, 'latched');
    assert.equal(pb.shape, 'round');
    assert.equal(pb.colors.background, '#2563eb');
    assert.equal(pb.colors.text, '#ffffff');
    assert.equal(pb.colors.bezel, '#334155');
    assert.match(hmi.screens[0].tiles[0].layers[0].svg, /push_button_round\.svg$/);
  });

  it('normalizeHmi infers pilot light kind from asset path', () => {
    const simplePath = '/hmi/svg/library/controls/pilot-lights/standard/mv/pilot-light/pl_round.svg';
    const complexPath = '/hmi/svg/library/controls/pilot-lights/multicolor/mv/pilot-light-multi-colour/pl_multi_square.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [
          { col: 0, row: 0, layers: [{ kind: 'dynamicImage', z: 0, svg: simplePath }] },
          { col: 1, row: 0, layers: [{ kind: 'dynamicImage', z: 0, svg: complexPath }] },
        ],
      }],
      bindings: [],
    }, []);
    assert.equal(hmi.screens[0].tiles[0].layers[0].pilotLight.kind, 'simple');
    assert.equal(hmi.screens[0].tiles[1].layers[0].pilotLight.kind, 'complex');
  });

  it('normalizeHmi migrates legacy pilot light to canonical asset', () => {
    const legacy = '/hmi/svg/library/controls/pilot-lights/standard/mv/pilot-light/pl_square.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{ kind: 'dynamicImage', z: 0, svg: legacy }],
        }],
      }],
      bindings: [],
    }, []);
    const layer = hmi.screens[0].tiles[0].layers[0];
    assert.match(layer.svg, /pl-canonical\/pilot_light_square\.svg$/);
    assert.equal(layer.pilotLight.shape, 'square');
    assert.equal(layer.pilotLight.kind, 'simple');
    assert.equal(layer.pilotLight.colors.off, '#22c55e');
    assert.equal(layer.pilotLight.colors.on, '#ef4444');
  });

  it('normalizeHmi keeps explicit pilot light shape and colors', () => {
    const path = '/hmi/svg/library/controls/pilot-lights/mv/pl-canonical/pilot_light_round.svg';
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{
            kind: 'dynamicImage',
            z: 0,
            svg: path,
            pilotLight: {
              kind: 'complex',
              shape: 'octagonal',
              colors: ['#111111', '#222222', '#333333', '#444444', '#555555'],
            },
          }],
        }],
      }],
      bindings: [],
    }, []);
    const pl = hmi.screens[0].tiles[0].layers[0].pilotLight;
    assert.equal(pl.kind, 'complex');
    assert.equal(pl.shape, 'octagonal');
    assert.deepEqual(pl.colors, ['#111111', '#222222', '#333333', '#444444', '#555555']);
    assert.match(hmi.screens[0].tiles[0].layers[0].svg, /pilot_light_octagonal\.svg$/);
  });

  it('pilotLightBindingPropertyForKind maps kind to binding property', () => {
    const { pilotLightBindingPropertyForKind } = require('../src/hmi/hmiConfig');
    assert.equal(pilotLightBindingPropertyForKind('simple'), 'fill');
    assert.equal(pilotLightBindingPropertyForKind('complex'), 'fill5');
  });

  it('inferPushButtonShapeFromPath reads shape from legacy filename', () => {
    const {
      inferPushButtonShapeFromPath,
      inferPushButtonColorsFromPath,
      canonicalPushButtonPath,
    } = require('../src/hmi/hmiConfig');
    const p = '/hmi/svg/library/controls/push-buttons/toggle/mv/pb-toggle1/pb_toggle1_rectangular_blue.svg';
    assert.equal(inferPushButtonShapeFromPath(p), 'rectangle');
    assert.equal(inferPushButtonColorsFromPath(p).background, '#2563eb');
    assert.equal(canonicalPushButtonPath('rectangle'), '/hmi/svg/library/controls/push-buttons/mv/pb-canonical/push_button_rectangle.svg');
  });

  it('normalizeHmi stores trend useTagScale on bindings', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't1_1_z0__trend_pen1',
        tagId: 'VPR1',
        property: 'trend',
        useTagScale: true,
        samples: 64,
      }],
    }, [{ id: 'VPR1', type: 'REAL' }]);
    assert.equal(hmi.bindings[0].useTagScale, true);
  });

  it('normalizeHmi stores PID faceplate tagField on bindings', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 's1', svg: '/hmi/svg/demos/demo_process.svg' }],
      bindings: [{
        screenId: 's1',
        elementId: 't3_4_z0__pv_value',
        tagId: 'PID1',
        property: 'text',
        tagField: 'pv',
        format: 'fixed2',
      }],
    }, [{ id: 'PID1', type: 'PID' }]);
    assert.equal(hmi.bindings.length, 1);
    assert.equal(hmi.bindings[0].tagField, 'pv');
    assert.equal(hmi.bindings[0].tagId, 'PID1');
  });

  it('listSvgAssets finds demo and MV library symbols', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    assert.ok(assets.some((a) => a.path.includes('demos/demo_process.svg')));
    assert.ok(assets.some((a) => a.path.includes('library/controls/pilot-lights')));
    assert.ok(assets.some((a) => a.path.includes('library/pid-faceplates/peaklogic/pid_loop_standard.svg')));
  });

  it('normalizeHmi keeps PID faceplate tile layers as staticImage', () => {
    const hmi = normalizeHmi({
      screens: [{
        id: 's1',
        svg: '/hmi/svg/demos/demo_process.svg',
        gridCols: 12,
        gridRows: 12,
        tiles: [{
          col: 3,
          row: 4,
          colSpan: 5,
          rowSpan: 5,
          label: 'PMP-100',
          layers: [{
            kind: 'staticText',
            z: 0,
            svg: '/hmi/svg/library/pid-faceplates/peaklogic/pid_loop_standard.svg',
            label: 'PMP-100',
          }],
        }],
      }],
      bindings: [{
        screenId: 's1',
        elementId: 't4_5_z0__hmi_label',
        tagId: 'PID1',
        property: 'text',
        tagField: 'label',
      }],
    }, [{ id: 'PID1', type: 'PID' }]);
    const tile = hmi.screens[0].tiles[0];
    assert.equal(tile.layers[0].kind, 'staticImage');
    assert.equal(tile.compositeId, 'pid_loop_standard');
    assert.equal(hmi.bindings[0].elementId, 't4_5_z0__loop_label');
  });

  it('normalizeHmi preserves motor_hoa compositeId on faceplate tile', () => {
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'Motor',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 1,
          row: 1,
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/motor-faceplates/peaklogic/motor_hoa.svg',
          }],
        }],
      }],
      bindings: [],
    }, []);
    const tile = hmi.screens[0].tiles[0];
    assert.equal(tile.layers[0].kind, 'staticImage');
    assert.equal(tile.compositeId, 'motor_hoa');
  });

  it('normalizeHmi repairs tpo_daily faceplate saved as staticText', () => {
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'TPO',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          colSpan: 4,
          rowSpan: 4,
          compositeId: 'tpo_daily',
          label: 'TPO-1 DAILY CYCLE',
          layers: [{
            kind: 'staticText',
            z: 0,
            svg: '/hmi/svg/library/schedules/peaklogic/tpo_daily.svg',
            label: 'TPO-1 DAILY CYCLE',
          }],
        }],
      }],
      bindings: [],
    }, []);
    const tile = hmi.screens[0].tiles[0];
    assert.equal(tile.layers[0].kind, 'staticImage');
    assert.equal(tile.compositeId, 'tpo_daily');
    assert.equal(tile.layers[0].label, undefined);
  });

  it('normalizeHmi repairs tpo_daily bindings from composite manifest', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'TPO',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          colSpan: 4,
          rowSpan: 4,
          compositeId: 'tpo_daily',
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/schedules/peaklogic/tpo_daily.svg',
          }],
        }],
      }],
      bindings: [
        {
          screenId: 's1',
          elementId: 't1_1_z0__status_lamp',
          tagId: 'TPO1_EN',
          property: 'fill',
        },
        {
          screenId: 's1',
          elementId: 't1_1_z0__window_start',
          tagId: 'TPO1_START',
          property: 'text',
          format: '',
        },
      ],
    }, [], publicRoot);
    const start = hmi.bindings.find((b) => b.elementId === 't1_1_z0__window_start');
    assert.equal(start?.format, 'hhmm');
    assert.equal(start?.interaction, 'edit');
    assert.equal(start?.tagId, 'TPO1_START');
    assert.ok(!hmi.bindings.some((b) => b.elementId === 't1_1_z0__status_lamp' && b.property === 'fill5'));
    const status = hmi.bindings.find((b) => b.elementId === 't1_1_z0__status_lamp' && b.property === 'fill');
    assert.equal(status?.tagId, 'TPO1_OUT');
    assert.equal(status?.onValue, '#22c55e');
    assert.equal(status?.offValue, '#ef4444');
  });

  it('normalizeHmi preserves custom composite fill colors on repair', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'Motor',
        tiles: [{
          col: 0,
          row: 4,
          colSpan: 4,
          rowSpan: 4,
          compositeId: 'motor_hoa',
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/motor-faceplates/peaklogic/motor_hoa.svg',
          }],
        }],
      }],
      bindings: [{
        screenId: 's1',
        elementId: 't1_1_z0__btn_offline',
        tagId: 'MOTOR1_OFFLINE',
        property: 'fill',
        onValue: '#111111',
        offValue: '#222222',
        interaction: 'toggle',
      }],
    }, [], publicRoot);
    const offline = hmi.bindings.find((b) => b.elementId === 't1_1_z0__btn_offline' && b.property === 'fill');
    assert.equal(offline?.onValue, '#111111');
    assert.equal(offline?.offValue, '#222222');
  });

  it('listHmiComposites includes motor_hoa fill5 colors', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const composites = listHmiComposites(publicRoot);
    const motor = composites.find((c) => c.composite?.id === 'motor_hoa');
    assert.ok(motor, 'motor_hoa composite');
    const status = motor.composite.defaultBindings.find((b) => b.elementId === 'status_lamp');
    assert.equal(status?.property, 'fill5');
    assert.ok(Array.isArray(status?.colors) && status.colors.length >= 5);
    const hrs = motor.composite.defaultBindings.find((b) => b.elementId === 'run_hrs');
    assert.equal(hrs?.property, 'text');
    assert.equal(hrs?.format, 'fixed1');
    const starts = motor.composite.defaultBindings.find((b) => b.elementId === 'starts_count');
    assert.equal(starts?.property, 'text');
    assert.equal(starts?.format, 'int');
  });

  it('listHmiComposites includes tpo_daily composite', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const composites = listHmiComposites(publicRoot);
    const tpo = composites.find((c) => c.composite?.id === 'tpo_daily');
    assert.ok(tpo, 'tpo_daily composite');
    const enable = tpo.composite.defaultBindings.find((b) => b.elementId === 'btn_enable');
    assert.equal(enable?.interaction, 'toggle');
    const tod = tpo.composite.defaultBindings.find((b) => b.elementId === 'tod_value');
    assert.equal(tod?.format, 'hhmm');
    const winStart = tpo.composite.defaultBindings.find((b) => b.elementId === 'window_start');
    assert.equal(winStart?.interaction, 'edit');
    assert.equal(winStart?.format, 'hhmm');
    const onMin = tpo.composite.defaultBindings.find((b) => b.elementId === 'param_app_min');
    assert.equal(onMin?.interaction, 'edit');
    assert.equal(onMin?.format, 'int');
    const allDay = tpo.composite.defaultBindings.find((b) => b.elementId === 'chk_24hr');
    assert.equal(allDay?.interaction, 'toggle');
    assert.equal(allDay?.tagRole, 'allDay');
    const offlineBtn = tpo.composite.defaultBindings.find((b) => b.elementId === 'btn_offline');
    assert.equal(offlineBtn?.interaction, 'toggle');
    assert.equal(offlineBtn?.tagRole, 'offline');
    const offlineLabel = tpo.composite.defaultBindings.find((b) => b.elementId === 'btn_offline_label');
    assert.equal(offlineLabel?.onValue, 'OFFLINE');
    assert.equal(offlineLabel?.offValue, 'ONLINE');
  });

  it('listHmiComposites includes pool faceplate composites', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const composites = listHmiComposites(publicRoot);
    const overview = composites.find((c) => c.composite?.id === 'pool_overview');
    assert.ok(overview, 'pool_overview composite');
    assert.match(overview.composite.preview, /pool_overview\.svg$/);
    assert.match(overview.composite.parts[0].svg, /pool_overview\.svg$/);
    const orpSp = overview.composite.defaultBindings.find((b) => b.elementId === 'orp_sp_value');
    assert.equal(orpSp?.interaction, 'edit');
    assert.equal(orpSp?.format, 'fixed1');
    const bwSta = overview.composite.defaultBindings.find((b) => b.elementId === 'bw_state');
    assert.equal(bwSta?.format, 'poolBwSta');
    assert.equal(bwSta?.tagRole, 'bwSta');

    const pump = composites.find((c) => c.composite?.id === 'pool_pump');
    assert.ok(pump, 'pool_pump composite');
    assert.equal(pump.composite.tagRoles?.pumpSpeed?.tagId, 'PUMP_SPEED');

    const chem = composites.find((c) => c.composite?.id === 'pool_chemistry');
    assert.ok(chem, 'pool_chemistry composite');
    const phAuto = chem.composite.defaultBindings.find((b) => b.elementId === 'btn_ph_auto');
    assert.equal(phAuto?.tagRole, 'phAuto');
    assert.equal(phAuto?.interaction, 'toggle');

    const bw = composites.find((c) => c.composite?.id === 'pool_backwash');
    assert.ok(bw, 'pool_backwash composite');
    const bwTimer = bw.composite.defaultBindings.find((b) => b.elementId === 'bw_timer');
    assert.equal(bwTimer?.tagField, 'elapsed');
    assert.equal(bwTimer?.tagRole, 'tmrBw');
  });

  it('normalizeHmi preserves pool_overview compositeId on faceplate tile', () => {
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'Pool',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          colSpan: 5,
          rowSpan: 5,
          compositeId: 'pool_overview',
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_controller.svg',
          }],
        }],
      }],
      bindings: [],
    }, []);
    const tile = hmi.screens[0].tiles[0];
    assert.equal(tile.layers[0].kind, 'staticImage');
    assert.equal(tile.compositeId, 'pool_overview');
  });

  it('normalizeHmi preserves pool_controller compositeId on stationary faceplate tile', () => {
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'Pool',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          colSpan: 5,
          rowSpan: 5,
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_controller.svg',
          }],
        }],
      }],
      bindings: [],
    }, []);
    const tile = hmi.screens[0].tiles[0];
    assert.equal(tile.compositeId, 'pool_controller');
  });

  it('normalizeHmi infers pool_pump compositeId from modular faceplate svg', () => {
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'Pool mobile',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_pump.svg',
          }],
        }],
      }],
      bindings: [],
    }, []);
    assert.equal(hmi.screens[0].tiles[0].compositeId, 'pool_pump');
  });

  it('normalizeHmi repairs pool_overview bindings from composite manifest', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const hmi = normalizeHmi({
      activeScreen: 's1',
      screens: [{
        id: 's1',
        name: 'Pool',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 1,
          row: 2,
          colSpan: 5,
          rowSpan: 4,
          compositeId: 'pool_overview',
          layers: [{
            kind: 'staticImage',
            z: 0,
            svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_controller.svg',
          }],
        }],
      }],
      bindings: [{
        screenId: 's1',
        elementId: 't2_3_z0__orp_sp_value',
        tagId: 'ORP_SP',
        property: 'text',
        format: '',
      }],
    }, [], publicRoot);
    const orpSp = hmi.bindings.find((b) => b.elementId === 't2_3_z0__orp_sp_value');
    assert.equal(orpSp?.format, 'fixed1');
    assert.equal(orpSp?.interaction, 'edit');
    const bwState = hmi.bindings.find((b) => b.elementId === 't2_3_z0__bw_state');
    assert.equal(bwState?.format, 'poolBwSta');
    assert.equal(bwState?.tagId, 'POOL_BW_STA');
  });

  it('listHmiComposites includes pool mobile composites and pool_overview alias', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const composites = listHmiComposites(publicRoot);
    const ids = composites.map((c) => c.composite?.id).filter(Boolean);
    for (const id of ['pool_pump', 'pool_chemistry', 'pool_backwash', 'pool_lighting', 'pool_overview', 'pool_controller', 'pool_filter_schedule']) {
      assert.ok(ids.includes(id), `${id} composite`);
    }

    const pump = composites.find((c) => c.composite?.id === 'pool_pump');
    assert.match(pump.composite.preview, /pool_pump\.svg$/);
    const flowLamp = pump.composite.defaultBindings.find((b) => b.elementId === 'flow_lamp');
    assert.equal(flowLamp?.tagRole, 'flowOk');
    const pumpSpeed = pump.composite.defaultBindings.find((b) => b.elementId === 'pump_speed_sp');
    assert.equal(pumpSpeed?.interaction, 'edit');

    const chem = composites.find((c) => c.composite?.id === 'pool_chemistry');
    assert.match(chem.composite.preview, /pool_chemistry\.svg$/);
    const phAuto = chem.composite.defaultBindings.find((b) => b.elementId === 'btn_ph_auto');
    assert.equal(phAuto?.interaction, 'toggle');
    assert.equal(phAuto?.tagRole, 'phAuto');
    const condAuto = chem.composite.defaultBindings.find((b) => b.elementId === 'btn_cond_auto');
    assert.equal(condAuto?.tagRole, 'condAuto');

    const bw = composites.find((c) => c.composite?.id === 'pool_backwash');
    assert.match(bw.composite.preview, /pool_backwash\.svg$/);
    const bwSta = bw.composite.defaultBindings.find((b) => b.elementId === 'bw_state');
    assert.equal(bwSta?.format, 'poolBwSta');
    const bwDone = bw.composite.defaultBindings.find((b) => b.elementId === 'bw_done_lamp');
    assert.equal(bwDone?.tagRole, 'bwDone');

    const overview = composites.find((c) => c.composite?.id === 'pool_overview');
    assert.match(overview.composite.preview, /pool_overview\.svg$/);
    assert.match(overview.composite.parts[0].svg, /pool_overview\.svg$/);
  });

  it('normalizeHmi infers mobile pool compositeId from faceplate svg', () => {
    const cases = [
      { svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_pump.svg', compositeId: 'pool_pump' },
      { svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_chemistry.svg', compositeId: 'pool_chemistry' },
      { svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_backwash.svg', compositeId: 'pool_backwash' },
      { svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_lighting.svg', compositeId: 'pool_lighting' },
      { svg: '/hmi/svg/library/pool-faceplates/peaklogic/pool_controller.svg', compositeId: 'pool_controller' },
    ];
    for (const { svg, compositeId } of cases) {
      const hmi = normalizeHmi({
        activeScreen: 's1',
        screens: [{
          id: 's1',
          name: 'Pool',
          svg: '/hmi/svg/demos/demo_process.svg',
          tiles: [{
            col: 0,
            row: 0,
            colSpan: 3,
            rowSpan: 3,
            layers: [{ kind: 'staticImage', z: 0, svg }],
          }],
        }],
        bindings: [],
      }, []);
      assert.equal(hmi.screens[0].tiles[0].compositeId, compositeId, svg);
    }
  });

  it('listHmiComposites includes PID loop faceplate manifest', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const composites = listHmiComposites(publicRoot);
    const pid = composites.find((c) => c.id === 'pid_loop_standard' || c.path === '@composite/pid_loop_standard');
    assert.ok(pid, 'pid_loop_standard composite');
    assert.ok(pid.composite?.defaultBindings?.some((b) => b.tagField === 'pv'));
    assert.ok(pid.composite?.defaultBindings?.some((b) => b.tagField === 'label' && b.elementId === 'loop_label'));
    assert.ok(pid.composite?.defaultBindings?.some((b) => b.elementId === 'mode_auto' && b.tagField === 'auto'));
    assert.ok(pid.composite?.defaultBindings?.some((b) => b.elementId === 'alarm_hi' && b.tagField === 'alarmHi'));
  });

  it('listHmiComposites includes alternator faceplate manifest', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const composites = listHmiComposites(publicRoot);
    const alt = composites.find((c) => c.composite?.id === 'alternator');
    assert.ok(alt, 'alternator composite');
    assert.equal(alt.composite.tagRoles?.alt?.pick, 'firstAlt');
    assert.ok(alt.composite?.defaultBindings?.some((b) => b.tagField === 'activeUnit' && b.elementId === 'lead_unit'));
    assert.ok(alt.composite?.defaultBindings?.some((b) => b.tagField === 'pumpStage' && b.format === 'altStage'));
    assert.ok(alt.composite?.defaultBindings?.some((b) => b.tagField === 'fault' && b.elementId === 'lamp_fault'));
    assert.ok(alt.composite?.defaultBindings?.some((b) => b.tagField === 'offActive' && b.elementId === 'lamp_off'));
  });

  it('listHmiComposites includes alarm list composite manifest', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const composites = listHmiComposites(publicRoot);
    const alarmList = composites.find((c) => c.composite?.id === 'alarm_list');
    assert.ok(alarmList, 'alarm_list composite');
    assert.equal(alarmList.composite.parts[0].kind, 'alarmList');
    assert.match(alarmList.composite.preview, /alarm_list\.svg$/);
  });

  it('normalizeTile upgrades alarm list layer to alarmList kind with compositeId', () => {
    const hmi = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          colSpan: 2,
          rowSpan: 3,
          layers: [{
            kind: 'alarmList',
            z: 0,
            svg: '/hmi/svg/composites/alarm_list.svg',
            alarmList: { showAcked: false },
          }],
        }],
      }],
      bindings: [],
    }, []);
    const tile = hmi.screens[0].tiles[0];
    assert.equal(tile.compositeId, 'alarm_list');
    assert.equal(tile.layers[0].kind, 'alarmList');
    assert.equal(tile.layers[0].alarmList.showAcked, false);
  });

  it('listSvgAssets exposes only three canonical pilot lights', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const pilots = assets.filter((a) => a.group === 'Controls — Pilot lights');
    assert.equal(pilots.length, 3);
    const names = pilots.map((a) => a.name).sort();
    assert.deepEqual(names, [
      'pilot_light_octagonal.svg',
      'pilot_light_round.svg',
      'pilot_light_square.svg',
    ]);
    assert.ok(pilots.every((a) => a.subgroup === 'canonical'));
    assert.ok(pilots.every((a) => !a.path.includes('/animated/')));
    assert.ok(pilots.every((a) => !a.path.includes('/labelled/')));
    assert.ok(pilots.every((a) => !a.path.includes('/system-')));
  });

  it('listSvgAssets exposes only four canonical push buttons', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const buttons = assets.filter((a) => a.group === 'Controls — Push buttons');
    assert.equal(buttons.length, 4);
    const names = buttons.map((a) => a.name).sort();
    assert.deepEqual(names, [
      'push_button_oblong.svg',
      'push_button_rectangle.svg',
      'push_button_round.svg',
      'push_button_square.svg',
    ]);
    assert.ok(buttons.every((a) => a.subgroup === 'canonical'));
    assert.ok(buttons.every((a) => a.path.includes('/pb-canonical/')));
  });

  it('listSvgAssets exposes only canonical strip chart in strip-charts subgroup', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const charts = assets.filter((a) => a.group === 'Charts & trends' && a.subgroup === 'canonical');
    const strip = charts.filter((a) => a.name === 'strip_chart.svg');
    assert.equal(strip.length, 1);
    assert.match(strip[0].path, /\/chart-strip\/strip_chart\.svg$/);
    assert.equal(strip[0].label, 'Strip chart');
    const legacyStrip = assets.filter((a) =>
      a.group === 'Charts & trends'
      && a.subgroup === 'strip-charts'
      && /strip_chart/i.test(a.name)
      && a.name !== 'strip_chart.svg');
    assert.equal(legacyStrip.length, 0);
  });

  it('listSvgAssets exposes only canonical gauge column in column subgroup', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const columns = assets.filter((a) => a.group === 'Gauges & meters' && a.subgroup === 'canonical');
    const gaugeCol = columns.filter((a) => a.name === 'gauge_column.svg');
    assert.equal(gaugeCol.length, 1);
    assert.match(gaugeCol[0].path, /\/gauge-column\/gauge_column\.svg$/);
    assert.equal(gaugeCol[0].label, 'Gauge column');
    const legacyCols = assets.filter((a) =>
      a.group === 'Gauges & meters'
      && a.subgroup === 'column'
      && /gauge_column/i.test(a.name)
      && a.name !== 'gauge_column.svg');
    assert.equal(legacyCols.length, 0);
  });

  it('listSvgAssets exposes only canonical dial background and pointer', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const canonical = assets.filter((a) => a.group === 'Gauges & meters' && a.subgroup === 'canonical');
    const dialBg = canonical.filter((a) => a.name === 'gauge_dialbg.svg');
    const dialPtr = canonical.filter((a) => a.name === 'gauge_dialpointer.svg');
    assert.equal(dialBg.length, 1);
    assert.equal(dialPtr.length, 1);
    assert.match(dialBg[0].path, /\/gd-canonical\/gauge_dialbg\.svg$/);
    assert.match(dialPtr[0].path, /\/gd-canonical\/gauge_dialpointer\.svg$/);
    assert.equal(dialBg[0].label, 'Dial background');
    assert.equal(dialPtr[0].label, 'Dial pointer');
    const legacyBg = assets.filter((a) =>
      a.group === 'Gauges & meters'
      && a.subgroup === 'dial-backgrounds'
      && /gauge_dialbg/i.test(a.name));
    const legacyPtr = assets.filter((a) =>
      a.group === 'Gauges & meters'
      && a.subgroup === 'dial-pointers'
      && /gauge_dialpointer/i.test(a.name));
    assert.equal(legacyBg.length, 0);
    assert.equal(legacyPtr.length, 0);
  });

  it('listSvgAssets trims Gauges & meters to canonical symbols only', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const gauges = assets.filter((a) => a.group === 'Gauges & meters');
    assert.equal(gauges.length, 18);
    const canonical = gauges.filter((a) => a.subgroup === 'canonical');
    assert.equal(canonical.length, 16);
    assert.equal(gauges.filter((a) => a.subgroup === 'composites').length, 2);
    assert.equal(gauges.filter((a) => a.subgroup === 'animated').length, 0);
    assert.equal(gauges.filter((a) => a.subgroup === 'column-backgrounds').length, 0);
    assert.equal(gauges.filter((a) => a.subgroup === 'tank-column').length, 0);
    assert.equal(gauges.filter((a) => a.subgroup === 'tank-backgrounds').length, 0);
    assert.equal(gauges.filter((a) => a.subgroup === 'standard' && a.subgroup !== 'canonical').length, 0);
    const canonNames = canonical.map((a) => a.name).sort();
    assert.ok(canonNames.includes('gauge_columnbg.svg'));
    assert.ok(canonNames.includes('tank_column.svg'));
    assert.ok(canonNames.includes('tank_gauge_bg.svg'));
    assert.ok(canonNames.includes('bargraph.svg'));
  });

  it('listSvgAssets exposes only canonical text labels in labels subgroup', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const labels = assets.filter((a) => a.group === 'Text & labels' && a.subgroup === 'canonical');
    assert.equal(labels.length, 9);
    const names = labels.map((a) => a.name).sort();
    assert.deepEqual(names, [
      'text_digits_float.svg',
      'text_digits_int.svg',
      'text_label_centred.svg',
      'text_label_left.svg',
      'text_list_centred.svg',
      'text_list_left.svg',
      'text_msgid.svg',
      'text_serverid_centred.svg',
      'text_serverid_left.svg',
    ]);
    const legacyLabels = assets.filter((a) =>
      a.group === 'Text & labels'
      && a.subgroup === 'labels'
      && /^(text_left|text_centred|digits_int|digits_float)_/i.test(a.name));
    const legacyMsgId = assets.filter((a) =>
      a.group === 'Text & labels'
      && a.subgroup === 'message-id'
      && /^digits_msgid_/i.test(a.name));
    const legacyServerId = assets.filter((a) =>
      a.group === 'Text & labels'
      && a.subgroup === 'server-id'
      && /^(textleft|textcentre)_serverid_/i.test(a.name));
    const legacyLists = assets.filter((a) =>
      a.group === 'Text & labels'
      && a.subgroup === 'lists'
      && /^textlist_(left|centred)_/i.test(a.name));
    assert.equal(legacyLabels.length, 0);
    assert.equal(legacyMsgId.length, 0);
    assert.equal(legacyServerId.length, 0);
    assert.equal(legacyLists.length, 0);
  });

  it('listSvgAssets exposes only canonical numeric bezels and keypad entry', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const assets = listSvgAssets(publicRoot);
    const canonical = assets.filter((a) => a.group === 'Numeric displays' && a.subgroup === 'canonical');
    const names = canonical.map((a) => a.name).sort();
    assert.deepEqual(names, [
      'numeric_bezel_simple.svg',
      'numeric_display.svg',
      'numeric_keypad.svg',
    ]);
    const legacyBezels = assets.filter((a) =>
      a.group === 'Numeric displays'
      && a.subgroup === 'bezels'
      && /^bezel_/i.test(a.name));
    const legacyEntry = assets.filter((a) =>
      a.group === 'Numeric displays'
      && a.subgroup === 'entry'
      && /^(numeric_pad|pb_numeric_)/i.test(a.name));
    assert.equal(legacyBezels.length, 0);
    assert.equal(legacyEntry.length, 0);
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

  it('resolveAssetPath rewrites legacy opto22/mblogic paths to mv', () => {
    const publicRoot = path.join(__dirname, '..', 'public');
    const legacy = resolveAssetPath(
      publicRoot,
      '/hmi/svg/library/controls/pilot-lights/standard/mblogic/pilot-light/pl_round.svg',
    );
    assert.equal(legacy, '/hmi/svg/library/controls/pilot-lights/standard/mv/pilot-light/pl_round.svg');
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

  it('normalizeHmi stores project-wide layout and applies to all screens', () => {
    const hmi = normalizeHmi({
      activeScreen: 'screen_1',
      layout: {
        gridCols: 10,
        gridRows: 6,
        cellWidth: 100,
        cellHeight: 80,
        displayMaxWidth: 1200,
        displayMaxHeight: 600,
        fit: 'stretch',
        showGridChrome: false,
        showLiveStatus: false,
      },
      screens: [
        {
          id: 'screen_1',
          name: 'Home',
          svg: '/hmi/svg/demos/demo_process.svg',
          width: 800,
          height: 600,
          gridCols: 8,
          gridRows: 8,
          tiles: [],
        },
        {
          id: 'screen_2',
          name: 'Page 2',
          svg: '/hmi/svg/demos/demo_controls.svg',
          width: 1024,
          height: 800,
          gridCols: 12,
          gridRows: 10,
          tiles: [],
        },
      ],
      bindings: [],
    }, []);
    assert.equal(hmi.layout.gridCols, 10);
    assert.equal(hmi.layout.gridRows, 6);
    assert.equal(hmi.layout.showGridChrome, false);
    assert.equal(hmi.layout.showLiveStatus, false);
    assert.equal(hmi.layout.fit, 'stretch');
    assert.equal(hmi.screens[0].gridCols, 10);
    assert.equal(hmi.screens[1].gridCols, 10);
    assert.equal(hmi.screens[0].width, 1000);
    assert.equal(hmi.screens[1].height, 480);
  });

  it('normalizeHmiLayout preserves composerMode grid vs 3d', () => {
    const grid = normalizeHmi({ activeScreen: 'screen_1', screens: [{ id: 'screen_1', svg: '/a.svg', tiles: [] }], bindings: [] }, [], path.join(__dirname, '..', 'public'));
    assert.equal(grid.layout.composerMode, 'grid');
    const threeD = normalizeHmi({
      activeScreen: 'screen_1',
      layout: { composerMode: '3d' },
      screens: [{ id: 'screen_1', svg: '/a.svg', tiles: [] }],
      bindings: [],
    }, [], path.join(__dirname, '..', 'public'));
    assert.equal(threeD.layout.composerMode, '3d');
    const invalid = normalizeHmi({
      activeScreen: 'screen_1',
      layout: { composerMode: 'vr' },
      screens: [{ id: 'screen_1', svg: '/a.svg', tiles: [] }],
      bindings: [],
    }, [], path.join(__dirname, '..', 'public'));
    assert.equal(invalid.layout.composerMode, 'grid');
  });

  it('MAX_SCREENS allows up to 500 screens', () => {
    assert.equal(MAX_SCREENS, 500);
    assert.equal(MAX_ROOM_NUM, 500);
    assert.ok(HMI_OBJ_KINDS.includes('roomHotspot'));
  });

  it('normalizeHmiLayout preserves facility3dUrl for 3d projects', () => {
    const hmi = normalizeHmi({
      activeScreen: 'screen_1',
      layout: {
        composerMode: '3d',
        facility3dUrl: '/samples/mle-wastewater-ortho-3d.html',
      },
      screens: [{ id: 'screen_1', svg: '/a.svg', tiles: [] }],
      bindings: [],
    }, [], path.join(__dirname, '..', 'public'));
    assert.equal(hmi.layout.composerMode, '3d');
    assert.equal(hmi.layout.facility3dUrl, '/samples/mle-wastewater-ortho-3d.html');
  });

  it('normalizeHmiLayout preserves roomPopup defaults', () => {
    const hmi = normalizeHmi({
      activeScreen: 'screen_1',
      screens: [{ id: 'screen_1', svg: '/a.svg', tiles: [] }],
      bindings: [],
    }, [], path.join(__dirname, '..', 'public'));
    assert.equal(hmi.layout.roomPopup.enabled, true);
    assert.match(hmi.layout.roomPopup.roomSvg, /room/);
    assert.match(hmi.layout.roomPopup.condenserSvg, /condenser/);
    const custom = normalizeRoomPopup({
      enabled: false,
      roomSvg: '/custom/room.svg',
      condenserSvg: '/custom/cond.svg',
    });
    assert.equal(custom.enabled, false);
    assert.equal(custom.roomSvg, '/custom/room.svg');
    assert.equal(normalizeRoomNum(42), 42);
    assert.equal(normalizeRoomNum(9999), 500);
    assert.equal(normalizeRoomNum(0), null);
  });

  it('normalizeHmi preserves roomHotspot layers on tiles', () => {
    const hmi = normalizeHmi({
      activeScreen: 'screen_1',
      screens: [{
        id: 'screen_1',
        svg: '/a.svg',
        tiles: [{
          col: 2,
          row: 3,
          colSpan: 3,
          rowSpan: 2,
          layers: [{
            kind: 'roomHotspot',
            z: 1,
            roomNum: 17,
            label: 'Room 017',
            hotspotCol: 2,
            hotspotRow: 3,
          }],
        }],
      }],
      bindings: [],
    }, [], path.join(__dirname, '..', 'public'));
    const layer = hmi.screens[0].tiles[0].layers[0];
    assert.equal(layer.kind, 'roomHotspot');
    assert.equal(layer.roomNum, 17);
    assert.equal(layer.label, 'Room 017');
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

  it('normalizeTile accepts pageHotspot on Z1-4 with target screen', () => {
    const tile = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 2,
          row: 1,
          colSpan: 2,
          rowSpan: 2,
          layers: [
            { kind: 'staticImage', z: 0, svg: '/hmi/svg/base.svg' },
            {
              kind: 'pageHotspot',
              z: 2,
              targetScreenId: 'screen_3',
              label: 'Go alarms',
            },
          ],
        }],
      }],
      bindings: [],
    }, []).screens[0].tiles[0];
    assert.equal(tile.colSpan, 2);
    assert.equal(tile.rowSpan, 2);
    assert.equal(tile.layers.length, 2);
    const hotspot = tile.layers.find((l) => l.kind === 'pageHotspot');
    assert.ok(hotspot);
    assert.equal(hotspot.z, 2);
    assert.equal(hotspot.targetScreenId, 'screen_3');
    assert.equal(hotspot.label, 'Go alarms');
    assert.ok(HMI_OBJ_KINDS.includes('pageHotspot'));
  });

  it('normalizeTile preserves pageHotspot region independent of tile span', () => {
    const tile = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          colSpan: 4,
          rowSpan: 3,
          layers: [
            { kind: 'staticImage', z: 0, svg: '/hmi/svg/base.svg' },
            {
              kind: 'pageHotspot',
              z: 1,
              targetScreenId: 'screen_2',
              hotspotCol: 2,
              hotspotRow: 1,
              hotspotColSpan: 2,
              hotspotRowSpan: 1,
            },
          ],
        }],
      }],
      bindings: [],
    }, []).screens[0].tiles[0];
    assert.equal(tile.colSpan, 4);
    assert.equal(tile.rowSpan, 3);
    const hotspot = tile.layers.find((l) => l.kind === 'pageHotspot');
    assert.equal(hotspot.hotspotCol, 2);
    assert.equal(hotspot.hotspotRow, 1);
    assert.equal(hotspot.hotspotColSpan, 2);
    assert.equal(hotspot.hotspotRowSpan, undefined);
  });

  it('normalizeTile keeps 10x10 graphic tile with 10x1 pageHotspot band', () => {
    const tile = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        gridCols: 10,
        gridRows: 10,
        tiles: [{
          col: 0,
          row: 0,
          colSpan: 10,
          rowSpan: 10,
          layers: [
            { kind: 'staticImage', z: 0, svg: '/hmi/svg/base.svg' },
            {
              kind: 'pageHotspot',
              z: 1,
              targetScreenId: 'screen_2',
              hotspotCol: 0,
              hotspotRow: 0,
              hotspotColSpan: 10,
            },
          ],
        }],
      }],
      bindings: [],
    }, []).screens[0].tiles[0];
    assert.equal(tile.colSpan, 10);
    assert.equal(tile.rowSpan, 10);
    const hotspot = tile.layers.find((l) => l.kind === 'pageHotspot');
    assert.equal(hotspot.hotspotCol, 0);
    assert.equal(hotspot.hotspotRow, 0);
    assert.equal(hotspot.hotspotColSpan, 10);
    assert.equal(hotspot.hotspotRowSpan, undefined);
  });

  it('normalizeTile clamps pageHotspot Z0 to Z1 and drops missing target', () => {
    const hmi = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [
            { kind: 'pageHotspot', z: 0, targetScreenId: 'screen_2' },
            { kind: 'pageHotspot', z: 3, targetScreenId: '' },
          ],
        }],
      }],
      bindings: [],
    }, []);
    const layers = hmi.screens[0].tiles[0].layers;
    assert.equal(layers.length, 1);
    assert.equal(layers[0].z, 1);
    assert.equal(layers[0].targetScreenId, 'screen_2');
  });

  it('reindexHmiScreens remaps pageHotspot targetScreenId', () => {
    const hmi = normalizeHmi({
      screens: [
        { id: 'home', svg: '/a.svg', tiles: [] },
        {
          id: 'alarms',
          svg: '/b.svg',
          tiles: [{
            col: 1,
            row: 1,
            layers: [{ kind: 'pageHotspot', z: 1, targetScreenId: 'home' }],
          }],
        },
      ],
      bindings: [],
    }, []);
    assert.equal(hmi.screens[1].tiles[0].layers[0].targetScreenId, 'screen_1');
  });

  it('normalizeTile accepts flashOverlay on Z1-4 with color and region', () => {
    const tile = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 1,
          row: 2,
          colSpan: 3,
          rowSpan: 2,
          layers: [
            { kind: 'staticImage', z: 0, svg: '/hmi/svg/base.svg' },
            {
              kind: 'flashOverlay',
              z: 3,
              color: 'amber',
              tagId: 'ALM1',
              hotspotCol: 2,
              hotspotRow: 2,
              hotspotColSpan: 2,
              hotspotRowSpan: 1,
            },
          ],
        }],
      }],
      bindings: [],
    }, []).screens[0].tiles[0];
    assert.equal(tile.layers.length, 2);
    const overlay = tile.layers.find((l) => l.kind === 'flashOverlay');
    assert.ok(overlay);
    assert.equal(overlay.z, 3);
    assert.equal(overlay.color, 'amber');
    assert.equal(overlay.tagId, 'ALM1');
    assert.equal(overlay.hotspotCol, 2);
    assert.equal(overlay.hotspotRow, 2);
    assert.equal(overlay.hotspotColSpan, 2);
    assert.ok(HMI_OBJ_KINDS.includes('flashOverlay'));
  });

  it('normalizeTile clamps flashOverlay Z0 to Z1 and defaults color to red', () => {
    const tile = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [
            { kind: 'flashOverlay', z: 0, color: 'invalid' },
          ],
        }],
      }],
      bindings: [],
    }, []).screens[0].tiles[0];
    const overlay = tile.layers.find((l) => l.kind === 'flashOverlay');
    assert.ok(overlay);
    assert.equal(overlay.z, 1);
    assert.equal(overlay.color, 'red');
  });

  it('normalizeTile preserves cellFraction on pageHotspot and flashOverlay', () => {
    const hmi = normalizeHmi({
      screens: [{
        id: 'screen_1',
        svg: '/hmi/svg/demos/demo_process.svg',
        tiles: [{
          col: 0,
          row: 0,
          layers: [
            { kind: 'pageHotspot', z: 1, targetScreenId: 'screen_2', cellFraction: 0.5 },
            { kind: 'flashOverlay', z: 2, color: 'red', cellFraction: 0.25 },
            { kind: 'pageHotspot', z: 3, targetScreenId: 'screen_2', cellFraction: 1 },
            { kind: 'flashOverlay', z: 4, color: 'amber', cellFraction: 0.33 },
          ],
        }],
      }],
      bindings: [],
    }, []);
    const layers = hmi.screens[0].tiles[0].layers;
    assert.equal(layers[0].cellFraction, 0.5);
    assert.equal(layers[1].cellFraction, 0.25);
    assert.equal(layers[2].cellFraction, undefined);
    assert.equal(layers[3].cellFraction, undefined);
  });

  it('normalizeBinding accepts flashState on flash_overlay element id', () => {
    const hmi = normalizeHmi({
      screens: [{ id: 'screen_1', svg: '/hmi/svg/demos/demo_process.svg', tiles: [] }],
      bindings: [{
        screenId: 'screen_1',
        elementId: 't10_4_z1__flash_overlay',
        tagId: 'ALM1',
        property: 'flashState',
        onValue: 'amber',
        offValue: 'hidden',
      }],
    }, [{ id: 'ALM1' }]);
    assert.equal(hmi.bindings.length, 1);
    assert.equal(hmi.bindings[0].elementId, 't10_4_z1__flash_overlay');
    assert.equal(hmi.bindings[0].property, 'flashState');
    assert.equal(hmi.bindings[0].onValue, 'amber');
    assert.equal(hmi.bindings[0].offValue, 'hidden');
  });
});
