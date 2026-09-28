'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseProgram } = require('../src/engine/parser');
const { createContext, execute } = require('../src/engine/executor');
const { updateAlternators } = require('../src/engine/functionBlocks');

function makeAltTags(extra = []) {
  return [
    {
      id: 'ALT1',
      type: 'ALT',
      role: 'fb',
      mode: 'ALT2',
      preset: 2,
      value: 0,
      fb: {
        enabled: true,
        leadIndex: 0,
        onlineIds: ['', '', '', ''],
        unitOutIds: ['', '', '', ''],
        leadSelIds: ['', '', '', ''],
        lagSelIds: ['', '', '', ''],
        lag2SelIds: ['', '', '', ''],
      },
    },
    { id: 'P1_ONL', type: 'BOOL', role: 'memory', value: true },
    { id: 'P2_ONL', type: 'BOOL', role: 'memory', value: true },
    { id: 'P1_RUN', type: 'BOOL', role: 'memory', value: false },
    { id: 'P2_RUN', type: 'BOOL', role: 'memory', value: false },
    { id: 'VPB1', type: 'BOOL', role: 'memory', value: true },
    ...extra,
  ];
}

function wireTwoPumpAlt(fb) {
  fb.onlineIds = ['P1_ONL', 'P2_ONL', '', ''];
  fb.unitOutIds = ['P1_RUN', 'P2_RUN', '', ''];
}

function makeTriplexTags(extra = []) {
  return [
    {
      id: 'ALT1',
      type: 'ALT',
      role: 'fb',
      mode: 'ALT3',
      preset: 3,
      value: 0,
      fb: {
        enabled: true,
        leadIndex: 0,
        onlineIds: ['', '', '', ''],
        unitOutIds: ['', '', '', ''],
        leadSelIds: ['', '', '', ''],
        lagSelIds: ['', '', '', ''],
        lag2SelIds: ['', '', '', ''],
      },
    },
    { id: 'P1_ONL', type: 'BOOL', role: 'memory', value: true },
    { id: 'P2_ONL', type: 'BOOL', role: 'memory', value: true },
    { id: 'P3_ONL', type: 'BOOL', role: 'memory', value: true },
    { id: 'P1_RUN', type: 'BOOL', role: 'memory', value: false },
    { id: 'P2_RUN', type: 'BOOL', role: 'memory', value: false },
    { id: 'P3_RUN', type: 'BOOL', role: 'memory', value: false },
    { id: 'VPB1', type: 'BOOL', role: 'memory', value: true },
    ...extra,
  ];
}

function wireTriplexAlt(fb) {
  fb.onlineIds = ['P1_ONL', 'P2_ONL', 'P3_ONL', ''];
  fb.unitOutIds = ['P1_RUN', 'P2_RUN', 'P3_RUN', ''];
}

function runOutputs(tags) {
  return [tags[3].value, tags[4].value, tags[5].value];
}

function tagStoreFrom(list) {
  const map = new Map(list.map((t) => [t.id, t]));
  return {
    get(id) { return map.get(id) || null; },
    list() { return list; },
    setValue(id, val) {
      const t = map.get(id);
      if (t) t.value = val;
    },
    markDirty() {},
  };
}

describe('alternator', () => {
  it('selects first online unit as lead', () => {
    const tags = makeAltTags();
    wireTwoPumpAlt(tags[0].fb);
    updateAlternators(tags);
    assert.equal(tags[0].fb.activeUnit, 1);
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, false);
  });

  it('skips offline units on advance pulse', () => {
    const tags = makeAltTags();
    wireTwoPumpAlt(tags[0].fb);
    tags[1].value = false;
    tags[0].fb.advancePulse = true;
    updateAlternators(tags);
    assert.equal(tags[0].fb.activeUnit, 2);
    assert.equal(tags[4].value, true);
  });

  it('sets fault when no units online', () => {
    const tags = makeAltTags();
    wireTwoPumpAlt(tags[0].fb);
    tags[1].value = false;
    tags[2].value = false;
    updateAlternators(tags);
    assert.equal(tags[0].fb.fault, true);
    assert.equal(tags[0].fb.activeUnit, 0);
  });

  it('auto-rotates when lead goes offline with autoFault enabled', () => {
    const tags = makeAltTags();
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.autoFault = true;
    tags[0].fb.leadIndex = 0;
    tags[0].fb.prevLeadOnline = true;
    tags[1].value = false;
    updateAlternators(tags);
    assert.equal(tags[0].fb.activeUnit, 2);
  });

  it('Off input shuts all automatic outputs off', () => {
    const tags = makeAltTags([
      { id: 'ALT_OFF', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.offId = 'ALT_OFF';
    updateAlternators(tags);
    assert.equal(tags[0].fb.offActive, true);
    assert.equal(tags[0].fb.pumpStage, 'off');
    assert.equal(tags[3].value, false);
    assert.equal(tags[4].value, false);
  });

  it('High input runs lead and lag (both pumps)', () => {
    const tags = makeAltTags([
      { id: 'LVL_HIGH', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.highId = 'LVL_HIGH';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'high');
    assert.equal(tags[0].fb.highActive, true);
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, true);
  });

  it('Low (lag request) runs lead and lag (both pumps)', () => {
    const tags = makeAltTags([
      { id: 'LVL_LAG', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.lowId = 'LVL_LAG';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'lag');
    assert.equal(tags[0].fb.lowActive, true);
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, true);
  });

  it('normal rotation runs lead only (one pump)', () => {
    const tags = makeAltTags();
    wireTwoPumpAlt(tags[0].fb);
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'normal');
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, false);
  });

  it('Off overrides high and lag — all outputs off', () => {
    const tags = makeAltTags([
      { id: 'ALT_OFF', type: 'BOOL', role: 'memory', value: true },
      { id: 'LVL_HIGH', type: 'BOOL', role: 'memory', value: true },
      { id: 'LVL_LAG', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.offId = 'ALT_OFF';
    tags[0].fb.highId = 'LVL_HIGH';
    tags[0].fb.lowId = 'LVL_LAG';
    updateAlternators(tags);
    assert.equal(tags[3].value, false);
    assert.equal(tags[4].value, false);
  });

  it('High wins over lag when both active', () => {
    const tags = makeAltTags([
      { id: 'LVL_HIGH', type: 'BOOL', role: 'memory', value: true },
      { id: 'LVL_LAG', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.highId = 'LVL_HIGH';
    tags[0].fb.lowId = 'LVL_LAG';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'high');
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, true);
  });

  it('analog level within lag band triggers both pumps', () => {
    const tags = makeAltTags([
      { id: 'TANK_LVL', type: 'REAL', role: 'memory', value: 10 },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.levelId = 'TANK_LVL';
    tags[0].fb.levelControlEnabled = true;
    tags[0].fb.levelInputMode = 'analog';
    tags[0].fb.levelLowLo = 0;
    tags[0].fb.levelLowHi = 20;
    updateAlternators(tags);
    assert.equal(tags[0].fb.lowActive, true);
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, true);
  });

  it('manual lead selection overrides rotation', () => {
    const tags = makeAltTags([
      { id: 'SEL_P2', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.leadSelIds = ['', 'SEL_P2', '', ''];
    updateAlternators(tags);
    assert.equal(tags[0].fb.activeUnit, 2);
    assert.equal(tags[4].value, true);
    assert.equal(tags[3].value, false);
  });

  it('ALT4 High runs all online units; Lag runs lead+lag only (cumulative)', () => {
    const tags = makeAltTags([
      { id: 'P3_ONL', type: 'BOOL', role: 'memory', value: true },
      { id: 'P4_ONL', type: 'BOOL', role: 'memory', value: true },
      { id: 'P3_RUN', type: 'BOOL', role: 'memory', value: false },
      { id: 'P4_RUN', type: 'BOOL', role: 'memory', value: false },
      { id: 'LVL_HIGH', type: 'BOOL', role: 'memory', value: true },
    ]);
    tags[0].mode = 'ALT4';
    tags[0].preset = 4;
    tags[0].fb.onlineIds = ['P1_ONL', 'P2_ONL', 'P3_ONL', 'P4_ONL'];
    tags[0].fb.unitOutIds = ['P1_RUN', 'P2_RUN', 'P3_RUN', 'P4_RUN'];
    tags[0].fb.highId = 'LVL_HIGH';
    updateAlternators(tags);
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, true);
    assert.equal(tags[8].value, true);
    assert.equal(tags[9].value, true);

    tags[10].value = false;
    tags[0].fb.highId = '';
    tags[0].fb.lowId = 'LVL_LAG';
    tags.push({ id: 'LVL_LAG', type: 'BOOL', role: 'memory', value: true });
    updateAlternators(tags);
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, true);
    assert.equal(tags[8].value, false);
    assert.equal(tags[9].value, false);

    tags[11].value = true;
    tags[0].fb.low2Id = 'LVL_LAG2';
    tags.push({ id: 'LVL_LAG2', type: 'BOOL', role: 'memory', value: true });
    updateAlternators(tags);
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, true);
    assert.equal(tags[8].value, true);
    assert.equal(tags[9].value, false);
  });

  function makeTriplexAltTags(extra = []) {
    return [
      {
        id: 'ALT1',
        type: 'ALT',
        role: 'fb',
        mode: 'ALT3',
        preset: 3,
        value: 0,
        fb: {
          enabled: true,
          leadIndex: 0,
          onlineIds: ['', '', '', ''],
          unitOutIds: ['', '', '', ''],
          leadSelIds: ['', '', '', ''],
          lagSelIds: ['', '', '', ''],
          lag2SelIds: ['', '', '', ''],
        },
      },
      { id: 'P1_ONL', type: 'BOOL', role: 'memory', value: true },
      { id: 'P2_ONL', type: 'BOOL', role: 'memory', value: true },
      { id: 'P3_ONL', type: 'BOOL', role: 'memory', value: true },
      { id: 'P1_RUN', type: 'BOOL', role: 'memory', value: false },
      { id: 'P2_RUN', type: 'BOOL', role: 'memory', value: false },
      { id: 'P3_RUN', type: 'BOOL', role: 'memory', value: false },
      ...extra,
    ];
  }

  function wireTriplexAlt(fb) {
    fb.onlineIds = ['P1_ONL', 'P2_ONL', 'P3_ONL', ''];
    fb.unitOutIds = ['P1_RUN', 'P2_RUN', 'P3_RUN', ''];
  }

  it('ALT3 normal rotation runs lead only (one pump)', () => {
    const tags = makeTriplexAltTags();
    wireTriplexAlt(tags[0].fb);
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'normal');
    assert.equal(tags[4].value, true);
    assert.equal(tags[5].value, false);
    assert.equal(tags[6].value, false);
  });

  it('ALT3 Lag float runs lead and lag (two pumps)', () => {
    const tags = makeTriplexAltTags([
      { id: 'LVL_LAG', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTriplexAlt(tags[0].fb);
    tags[0].fb.lowId = 'LVL_LAG';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'lag');
    assert.equal(tags[4].value, true);
    assert.equal(tags[5].value, true);
    assert.equal(tags[6].value, false);
  });

  it('ALT3 Lag2 float alone runs all three pumps (cumulative)', () => {
    const tags = makeTriplexAltTags([
      { id: 'LVL_LAG2', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTriplexAlt(tags[0].fb);
    tags[0].fb.low2Id = 'LVL_LAG2';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'lag2');
    assert.equal(tags[0].fb.low2Active, true);
    assert.equal(tags[4].value, true);
    assert.equal(tags[5].value, true);
    assert.equal(tags[6].value, true);
  });

  it('ALT3 High runs all three online pumps', () => {
    const tags = makeTriplexAltTags([
      { id: 'LVL_HIGH', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTriplexAlt(tags[0].fb);
    tags[0].fb.highId = 'LVL_HIGH';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'high');
    assert.equal(tags[4].value, true);
    assert.equal(tags[5].value, true);
    assert.equal(tags[6].value, true);
  });

  it('ALT3 Off shuts all outputs off', () => {
    const tags = makeTriplexAltTags([
      { id: 'ALT_OFF', type: 'BOOL', role: 'memory', value: true },
      { id: 'LVL_LAG2', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTriplexAlt(tags[0].fb);
    tags[0].fb.offId = 'ALT_OFF';
    tags[0].fb.low2Id = 'LVL_LAG2';
    updateAlternators(tags);
    assert.equal(tags[4].value, false);
    assert.equal(tags[5].value, false);
    assert.equal(tags[6].value, false);
  });

  it('ALT3 Lag2 wins stage over Lag when both active', () => {
    const tags = makeTriplexAltTags([
      { id: 'LVL_LAG', type: 'BOOL', role: 'memory', value: true },
      { id: 'LVL_LAG2', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTriplexAlt(tags[0].fb);
    tags[0].fb.lowId = 'LVL_LAG';
    tags[0].fb.low2Id = 'LVL_LAG2';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'lag2');
    assert.equal(tags[4].value, true);
    assert.equal(tags[5].value, true);
    assert.equal(tags[6].value, true);
  });

  it('ALT2 ignores Lag2 float input', () => {
    const tags = makeAltTags([
      { id: 'LVL_LAG2', type: 'BOOL', role: 'memory', value: true },
    ]);
    wireTwoPumpAlt(tags[0].fb);
    tags[0].fb.low2Id = 'LVL_LAG2';
    updateAlternators(tags);
    assert.equal(tags[0].fb.pumpStage, 'normal');
    assert.equal(tags[3].value, true);
    assert.equal(tags[4].value, false);
  });

  it('parses AltLag2 wiring via ST', () => {
    const src = `
AltLow(ALT1, LVL_LAG);
AltLag2(ALT1, LVL_LAG2);
`;
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0);
    const tags = makeTriplexAltTags([
      { id: 'LVL_LAG', type: 'BOOL', role: 'memory', value: false },
      { id: 'LVL_LAG2', type: 'BOOL', role: 'memory', value: false },
    ]);
    const store = tagStoreFrom(tags);
    execute(ast, createContext(store), []);
    assert.equal(tags[0].fb.lowId, 'LVL_LAG');
    assert.equal(tags[0].fb.low2Id, 'LVL_LAG2');
  });

  it('parses and wires control inputs via ST', () => {
    const src = `
AltEnable(ALT1, VPB1);
AltOnline(ALT1, 1, P1_ONL);
AltOnline(ALT1, 2, P2_ONL);
AltUnitOut(ALT1, 1, P1_RUN);
AltUnitOut(ALT1, 2, P2_RUN);
AltOff(ALT1, ALT_OFF);
AltHigh(ALT1, LVL_HIGH);
AltLow(ALT1, LVL_LOW);
AltLevel(ALT1, TANK_LVL);
AltLevelBands(ALT1, 0, 15, 85, 100);
AltLeadSel(ALT1, 2, SEL_P2);
`;
    const { ast, errors } = parseProgram(src);
    assert.equal(errors.length, 0);
    const tags = makeAltTags([
      { id: 'ALT_OFF', type: 'BOOL', role: 'memory', value: false },
      { id: 'LVL_HIGH', type: 'BOOL', role: 'memory', value: false },
      { id: 'LVL_LOW', type: 'BOOL', role: 'memory', value: false },
      { id: 'TANK_LVL', type: 'REAL', role: 'memory', value: 50 },
      { id: 'SEL_P2', type: 'BOOL', role: 'memory', value: false },
    ]);
    const store = tagStoreFrom(tags);
    execute(ast, createContext(store), []);
    assert.equal(tags[0].fb.offId, 'ALT_OFF');
    assert.equal(tags[0].fb.highId, 'LVL_HIGH');
    assert.equal(tags[0].fb.lowId, 'LVL_LOW');
    assert.equal(tags[0].fb.levelId, 'TANK_LVL');
    assert.equal(tags[0].fb.levelLowHi, 15);
    assert.equal(tags[0].fb.levelHighLo, 85);
    assert.equal(tags[0].fb.leadSelIds[1], 'SEL_P2');
    assert.equal(tags[0].fb.levelControlEnabled, true);
  });
});
