'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { siteFleetStatus } = require('../src/fleet/siteFleetStatus');
const { buildSiteHmiUrl, defaultCloudProject, defaultHmiScreen } = require('../src/fleet/siteHmi');
const { ensureDuplexlsScreen2, ensureDuplexScreen1_3d, DUPLEX_3D_URL } = require('../src/hmi/duplexlsScreen');
const { tenantStore } = require('../src/tenants/tenantStore');
const { registry } = require('../src/parc/deviceRegistry');

describe('site fleet status and HMI links', () => {
  const tid = `t_fleet_${Date.now()}`;
  const siteId = '7767_Land_O_Lakes_Blvd';

  it('builds duplex lift HMI deep link by default', () => {
    const url = buildSiteHmiUrl({ siteId });
    assert.match(url, /project=duplex-lift-station/);
    assert.match(url, /hmi=screen_1/);
    assert.match(url, /open=1/);
  });

  it('uses circle-k per-store screen when cloud project set', () => {
    assert.equal(defaultCloudProject({ cloudProject: 'circle-k-florida-duplex-100' }), 'circle-k-florida-duplex-100');
    assert.equal(
      defaultHmiScreen({ siteId, cloudProject: 'circle-k-florida-duplex-100' }),
      'screen_ck_7767_land_o_lakes_blvd',
    );
  });

  it('returns offline when no controllers assigned', () => {
    assert.equal(siteFleetStatus('missing_site', tid), 'offline');
  });

  it('returns warning for commissioned stale controller', () => {
    const deviceId = `opta_fleet_warn_${Date.now()}`;
    tenantStore.upsertDevice(tid, {
      deviceId,
      siteId,
      kind: 'controller',
      commissioning: 'commissioned',
    });
    registry.ingestReport({ deviceId, tags: [] });
    registry._store.devices[deviceId].lastReportAt = new Date(Date.now() - 3600000).toISOString();
    assert.equal(siteFleetStatus(siteId, tid), 'warning');
  });

  it('returns fault when active fault tag present', () => {
    const deviceId = `opta_fleet_fault_${Date.now()}`;
    const faultSite = `${siteId}_fault`;
    tenantStore.upsertDevice(tid, {
      deviceId,
      siteId: faultSite,
      kind: 'controller',
      commissioning: 'commissioned',
    });
    registry.ingestReport({
      deviceId,
      tags: [{ id: 'MOTOR1_FAULT', value: 1 }],
    });
    assert.equal(siteFleetStatus(faultSite, tid), 'fault');
  });
});

describe('duplex lift HMI repair', () => {
  it('forces screen_1 3D url and composer mode', () => {
    const hmi = ensureDuplexScreen1_3d({
      layout: { composerMode: 'grid' },
      screens: [{ id: 'screen_1', number: 1, isHome: true, tiles: [] }],
    });
    assert.equal(hmi.layout.composerMode, '3d');
    assert.equal(hmi.layout.facility3dUrl, DUPLEX_3D_URL);
    assert.equal(hmi.screens[0].facility3dUrl, DUPLEX_3D_URL);
  });

  it('repairs 3d on duplex project open even when screen_2 is fine', () => {
    const hmi = ensureDuplexlsScreen2({
      layout: { composerMode: 'grid', facility3dUrl: '' },
      screens: [
        { id: 'screen_1', number: 1, isHome: true, tiles: [] },
        {
          id: 'screen_2',
          number: 2,
          name: 'DUPLEXLS',
          inheritProjectLayout: false,
          tiles: [{ compositeId: 'duplexls' }],
        },
      ],
      bindings: [],
    }, require('path').join(__dirname, '../public'), 'duplex-lift-station');
    assert.equal(hmi.layout.composerMode, '3d');
    assert.equal(hmi.screens[0].facility3dUrl, DUPLEX_3D_URL);
  });

  it('replaces empty c-store fleet 3d with single lift station view', () => {
    const hmi = ensureDuplexlsScreen2({
      layout: { composerMode: 'list' },
      screens: [{
        id: 'screen_1',
        number: 1,
        isHome: true,
        facility3dUrl: '/samples/cstore-opta-parc-fleet-3d.html',
        tiles: [],
      }],
      bindings: [],
    }, require('path').join(__dirname, '../public'), 'cstore-opta-parc-starter');
    assert.equal(hmi.layout.composerMode, '3d');
    assert.equal(hmi.screens[0].facility3dUrl, DUPLEX_3D_URL);
  });

  it('repairs svg-only DUPLEXLS screen that lost its composite tile', () => {
    const hmi = ensureDuplexlsScreen2({
      layout: { composerMode: '3d', facility3dUrl: DUPLEX_3D_URL, gridCols: 16, gridRows: 12 },
      screens: [
        { id: 'screen_1', number: 1, isHome: true, name: '3D Overview', facility3dUrl: DUPLEX_3D_URL, tiles: [] },
        {
          id: 'screen_2',
          number: 2,
          name: 'DUPLEXLS',
          svg: '/hmi/svg/library/lift-station-faceplates/peaklogic/duplexls.svg',
          inheritProjectLayout: true,
          tiles: [],
        },
      ],
      bindings: [],
    }, require('path').join(__dirname, '../public'), 'duplex-lift-station');
    const s2 = hmi.screens.find((s) => s.id === 'screen_2');
    assert.equal(s2.inheritProjectLayout, false);
    assert.equal(s2.tiles?.[0]?.compositeId, 'duplexls');
    assert.ok((hmi.bindings || []).some((b) => b.tagId === 'MOTOR1_HOA'));
  });

  it('does not inject DUPLEXLS into blank or unrelated projects', () => {
    const { defaultBlankHmi } = require('../src/hmi/hmiConfig');
    const blank = defaultBlankHmi();
    const hmi = ensureDuplexlsScreen2(blank, require('path').join(__dirname, '../public'), 'untitled');
    assert.equal(hmi.screens.length, 1);
    assert.equal(hmi.screens[0].id, 'screen_1');
    assert.notEqual(hmi.screens[0]?.name, 'DUPLEXLS');
  });

  it('repairs corrupted HVAC bundled HMI on open', () => {
    const { ensureHvacSplitHmi } = require('../src/hmi/hvacSplitScreen');
    const { DUPLEX_3D_URL } = require('../src/hmi/duplexlsScreen');
    const hmi = ensureHvacSplitHmi({
      layout: { composerMode: '3d', facility3dUrl: DUPLEX_3D_URL },
      screens: [
        { id: 'screen_1', number: 1, isHome: true, name: '3D Overview', tiles: [] },
        {
          id: 'screen_2',
          number: 2,
          name: 'DUPLEXLS',
          svg: '/hmi/svg/library/lift-station-faceplates/peaklogic/duplexls.svg',
          tiles: [],
        },
        {
          id: 'screen_3',
          number: 3,
          name: 'Air Handler',
          svg: '/hmi/svg/demos/opta-split-hvac/air_handler.svg',
          tiles: [],
        },
      ],
      bindings: [],
    }, 'opta-split-hvac');
    assert.equal(hmi.layout.facility3dUrl, '/samples/opta-split-hvac-ortho-3d.html');
    assert.equal(hmi.screens[1].name, 'System Overview');
    assert.match(hmi.screens[1].svg, /opta-split-hvac\/system_overview\.svg$/);
    assert.match(hmi.screens[2].svg, /opta-split-hvac\/air_handler\.svg$/);
    assert.equal(hmi.screens.length, 4);
  });

  it('does not replace HVAC split HMI with duplex lift screens', () => {
    const hvac3d = '/samples/opta-split-hvac-ortho-3d.html';
    const hmi = ensureDuplexlsScreen2({
      layout: { composerMode: '3d', facility3dUrl: hvac3d },
      screens: [
        { id: 'screen_1', number: 1, isHome: true, name: '3D Overview', facility3dUrl: hvac3d, tiles: [] },
        {
          id: 'screen_2',
          number: 2,
          name: 'System Overview',
          svg: '/hmi/svg/demos/opta-split-hvac/system_overview.svg',
          tiles: [],
        },
        {
          id: 'screen_3',
          number: 3,
          name: 'Air Handler',
          svg: '/hmi/svg/demos/opta-split-hvac/air_handler.svg',
          tiles: [],
        },
      ],
      bindings: [{ screenId: 'screen_3', elementId: 'val_supply', tagId: 'AHU1_SUPPLY_TEMP_F' }],
    }, require('path').join(__dirname, '../public'), 'opta-split-hvac');
    assert.equal(hmi.layout.facility3dUrl, hvac3d);
    assert.equal(hmi.screens[1].name, 'System Overview');
    assert.equal(hmi.screens[1].svg, '/hmi/svg/demos/opta-split-hvac/system_overview.svg');
    assert.equal(hmi.screens[2].svg, '/hmi/svg/demos/opta-split-hvac/air_handler.svg');
    assert.equal(hmi.bindings.length, 1);
  });
});
