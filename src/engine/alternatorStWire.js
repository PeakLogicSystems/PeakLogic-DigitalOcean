'use strict';

function altTag(tagStore, altId) {
  const t = tagStore.get(altId);
  return t?.type === 'ALT' ? t : null;
}

function ensureArr4(arr) {
  const out = Array.isArray(arr) ? arr.slice(0, 4) : [];
  while (out.length < 4) out.push('');
  return out;
}

function evalConstExpr(node) {
  if (node?.type === 'num') return node.value;
  throw new Error('Expected numeric literal');
}

/** Apply one alternator wiring action from parsed ST (matches Opta firmware fb fields). */
function applyAltAction(tagStore, stmt) {
  const t = altTag(tagStore, stmt.tag);
  if (!t) return;
  const fb = { ...(t.fb || {}) };
  const name = stmt.name;
  const input = stmt.inputTag || '';

  if (name === 'AltEnable') {
    fb.enableId = input;
  } else if (name === 'AltAdvance') {
    fb.advanceId = input;
  } else if (name === 'AltAutoFault') {
    fb.autoFaultId = input;
  } else if (name === 'AltLead') {
    fb.leadOutId = input;
  } else if (name === 'AltOff') {
    fb.offId = input;
  } else if (name === 'AltHigh') {
    fb.highId = input;
  } else if (name === 'AltLow') {
    fb.lowId = input;
  } else if (name === 'AltLag2') {
    fb.low2Id = input;
  } else if (name === 'AltLevel') {
    fb.levelId = input;
    fb.levelControlEnabled = true;
  } else if (name === 'AltLevelBands') {
    const bands = stmt.levelBands || [];
    fb.levelLowLo = evalConstExpr(bands[0]);
    fb.levelLowHi = evalConstExpr(bands[1]);
    fb.levelHighLo = evalConstExpr(bands[2]);
    fb.levelHighHi = evalConstExpr(bands[3]);
    fb.levelControlEnabled = true;
  } else if (name === 'AltOnline' && stmt.unit != null) {
    const ids = ensureArr4(fb.onlineIds);
    ids[Number(stmt.unit) - 1] = input;
    fb.onlineIds = ids;
  } else if (name === 'AltUnitOut' && stmt.unit != null) {
    const ids = ensureArr4(fb.unitOutIds);
    ids[Number(stmt.unit) - 1] = input;
    fb.unitOutIds = ids;
  } else if (name === 'AltLeadSel' && stmt.unit != null) {
    const ids = ensureArr4(fb.leadSelIds);
    ids[Number(stmt.unit) - 1] = input;
    fb.leadSelIds = ids;
  } else if (name === 'AltLagSel' && stmt.unit != null) {
    const ids = ensureArr4(fb.lagSelIds);
    ids[Number(stmt.unit) - 1] = input;
    fb.lagSelIds = ids;
  } else if (name === 'AltLag2Sel' && stmt.unit != null) {
    const ids = ensureArr4(fb.lag2SelIds);
    ids[Number(stmt.unit) - 1] = input;
    fb.lag2SelIds = ids;
  } else {
    return;
  }
  t.fb = fb;
  tagStore.markDirty?.(t.id);
}

function makeAltContextMethods(tagStore) {
  return {
    setAltEnable(tag, inputTag) { applyAltAction(tagStore, { name: 'AltEnable', tag, inputTag }); },
    setAltAdvance(tag, inputTag) { applyAltAction(tagStore, { name: 'AltAdvance', tag, inputTag }); },
    pulseAltAdvance(tag) {
      const t = altTag(tagStore, tag);
      if (t) t.fb = { ...(t.fb || {}), advancePulse: true };
    },
    setAltAutoFault(tag, inputTag) { applyAltAction(tagStore, { name: 'AltAutoFault', tag, inputTag }); },
    setAltLead(tag, inputTag) { applyAltAction(tagStore, { name: 'AltLead', tag, inputTag }); },
    setAltOnline(tag, unit, inputTag) { applyAltAction(tagStore, { name: 'AltOnline', tag, unit, inputTag }); },
    setAltUnitOut(tag, unit, inputTag) { applyAltAction(tagStore, { name: 'AltUnitOut', tag, unit, inputTag }); },
    setAltOff(tag, inputTag) { applyAltAction(tagStore, { name: 'AltOff', tag, inputTag }); },
    setAltHigh(tag, inputTag) { applyAltAction(tagStore, { name: 'AltHigh', tag, inputTag }); },
    setAltLow(tag, inputTag) { applyAltAction(tagStore, { name: 'AltLow', tag, inputTag }); },
    setAltLag2(tag, inputTag) { applyAltAction(tagStore, { name: 'AltLag2', tag, inputTag }); },
    setAltLeadSel(tag, unit, inputTag) { applyAltAction(tagStore, { name: 'AltLeadSel', tag, unit, inputTag }); },
    setAltLagSel(tag, unit, inputTag) { applyAltAction(tagStore, { name: 'AltLagSel', tag, unit, inputTag }); },
    setAltLag2Sel(tag, unit, inputTag) { applyAltAction(tagStore, { name: 'AltLag2Sel', tag, unit, inputTag }); },
    setAltLevel(tag, inputTag) { applyAltAction(tagStore, { name: 'AltLevel', tag, inputTag }); },
    setAltLevelBands(tag, bands) {
      applyAltAction(tagStore, {
        name: 'AltLevelBands',
        tag,
        levelBands: bands.map((v) => ({ type: 'num', value: v })),
      });
    },
  };
}

module.exports = { applyAltAction, makeAltContextMethods, evalConstExpr };
