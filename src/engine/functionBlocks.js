'use strict';

const { evaluateAlarmLevel } = require('../tags/tagAnalog');
const { effectiveValue, refreshEffective } = require('../tags/tagEffective');

function altUnitIndex(unitIndex, unitCount) {
  const n = Math.trunc(Number(unitIndex));
  if (!Number.isFinite(n)) return 0;
  if (n === 0) return 0;
  return Math.max(0, Math.min(unitCount - 1, n - 1));
}

function updateTimers(tags, dtMs) {
  for (const t of tags) {
    if (t.type !== 'TIMER') continue;
    const fb = t.fb || {};
    const mode = t.mode || 'TON';
    const inVal = !!fb.input;
    const preset = Number(t.preset) || 1000;
    let elapsed = fb.elapsed || 0;
    let done = !!fb.done;
    let running = !!fb.running;

    if (fb.reset) {
      elapsed = 0;
      done = false;
      running = false;
      fb.reset = false;
      fb.prevIn = false;
    }

    if (mode === 'TON') {
      if (inVal) {
        elapsed = Math.min(preset, elapsed + dtMs);
        running = elapsed < preset;
        done = elapsed >= preset;
      } else {
        elapsed = 0;
        running = false;
        done = false;
      }
    } else if (mode === 'TOF') {
      if (inVal) {
        elapsed = 0;
        running = false;
        done = true;
      } else {
        elapsed = Math.min(preset, elapsed + dtMs);
        running = elapsed < preset;
        done = elapsed < preset;
      }
    } else if (mode === 'TP') {
      if (inVal && !fb.prevIn) {
        elapsed = 0;
        done = false;
        running = true;
      }
      if (running) {
        elapsed += dtMs;
        if (elapsed >= preset) {
          running = false;
          done = true;
        }
      }
      fb.prevIn = inVal;
    }

    fb.elapsed = elapsed;
    fb.done = done;
    fb.running = running;
    t.fb = fb;
    writeTagLogicValue(t, done);
  }
}

function updateCounters(tags) {
  for (const t of tags) {
    if (t.type !== 'COUNTER') continue;
    const fb = t.fb || {};
    const mode = t.mode || 'CTU';
    const preset = Number(t.preset) || 1;
    const cu = !!fb.cu;
    const cd = !!fb.cd;
    const reset = !!fb.reset;
    let count = fb.count || 0;
    let done = !!fb.done;

    if (reset) {
      count = 0;
      done = false;
      fb.reset = false;
    } else if (mode === 'CTU' && cu && !fb.prevCu) {
      count++;
      if (count >= preset) done = true;
    } else if (mode === 'CTD' && cd && !fb.prevCd) {
      count = Math.max(0, count - 1);
      if (count <= 0) done = true;
    }
    fb.prevCu = cu;
    fb.prevCd = cd;
    fb.count = count;
    fb.done = done;
    t.fb = fb;
    writeTagLogicValue(t, count);
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function effectiveAnalogValue(tag) {
  if (!tag) return 0;
  const v = Number(effectiveValue(tag));
  return Number.isFinite(v) ? v : 0;
}

function analogTagValue(tag) {
  return effectiveAnalogValue(tag);
}

function writeTagLogicValue(t, val) {
  t.logicValue = val;
  refreshEffective(t);
}

function pidDisplayFb(tag, byId) {
  const fb = { ...(tag?.fb || {}) };
  if (fb.pvId) fb.pv = effectiveAnalogValue(byId.get(fb.pvId));
  if (fb.spId) {
    fb.sp = effectiveAnalogValue(byId.get(fb.spId));
  } else {
    const sp = Number(tag?.preset);
    fb.sp = Number.isFinite(sp) ? sp : 0;
  }
  if (fb.outId) {
    fb.out = effectiveAnalogValue(byId.get(fb.outId));
  } else if (tag?.forceOutput) {
    const fv = Number(tag.forceValue);
    if (Number.isFinite(fv)) fb.out = fv;
  } else if (!Number.isFinite(fb.out)) {
    const v = Number(tag?.value);
    fb.out = Number.isFinite(v) ? v : 0;
  }
  const pv = Number.isFinite(fb.pv) ? fb.pv : 0;
  const level = evaluatePidPvAlarmLevel(tag, pv);
  fb.alarmHi = level === 'innerHigh' || level === 'outerHigh';
  fb.alarmLo = level === 'innerLow' || level === 'outerLow';
  return fb;
}

function wirePidTagInputs(tags, byId) {
  for (const t of tags) {
    if (t.type !== 'PID') continue;
    const fb = { ...(t.fb || {}) };
    if (fb.pvId) fb.pv = effectiveAnalogValue(byId.get(fb.pvId));
    if (fb.spId) {
      const sp = effectiveAnalogValue(byId.get(fb.spId));
      fb.sp = sp;
      t.preset = sp;
    } else {
      const sp = Number(t.preset);
      fb.sp = Number.isFinite(sp) ? sp : 0;
    }
    t.fb = fb;
  }
}

function writePidTagOutputs(tags, byId) {
  for (const t of tags) {
    if (t.type !== 'PID') continue;
    const outId = t.fb?.outId;
    if (!outId) continue;
    const out = byId.get(outId);
    if (!out || out.readonly) continue;
    if (out.type !== 'INT' && out.type !== 'REAL' && out.role !== 'memory' && out.role !== 'output') continue;
    const val = Number.isFinite(t.fb?.out) ? t.fb.out : Number(t.value);
    if (!Number.isFinite(val)) continue;
    out.logicValue = out.type === 'INT' ? Math.trunc(val) : val;
    refreshEffective(out);
    out.dirty = true;
  }
}

function evaluatePidPvAlarmLevel(tag, pv) {
  if (!tag?.alarmsEnabled) return null;
  return evaluateAlarmLevel({ ...tag, type: 'REAL' }, pv);
}

function writeBoolTag(byId, tagId, value) {
  if (!tagId) return;
  const out = byId.get(tagId);
  if (!out || out.type !== 'BOOL' || out.readonly) return;
  if (out.role !== 'memory' && out.role !== 'output') return;
  const next = !!value;
  if (out.logicValue !== next) {
    out.logicValue = next;
    refreshEffective(out);
    out.dirty = true;
  }
}

function writeAnalogTag(byId, tagId, value) {
  if (!tagId) return;
  const out = byId.get(tagId);
  if (!out || out.readonly) return;
  if (out.type !== 'INT' && out.type !== 'REAL' && out.role !== 'memory' && out.role !== 'output') return;
  const val = out.type === 'INT' ? Math.trunc(value) : value;
  if (!Number.isFinite(val)) return;
  if (out.logicValue !== val) {
    out.logicValue = val;
    refreshEffective(out);
    out.dirty = true;
  }
}

function rmotorReadBool(byId, tagId) {
  if (!tagId) return false;
  const src = byId.get(tagId);
  return src ? !!effectiveValue(src) : false;
}

function rmotorReadInt(byId, tagId, fallback = 0) {
  if (!tagId) return fallback;
  const src = byId.get(tagId);
  if (!src) return fallback;
  const v = Math.trunc(Number(effectiveValue(src)));
  return Number.isFinite(v) ? v : fallback;
}

function updatePidAlarms(tags, byId) {
  for (const t of tags) {
    if (t.type !== 'PID') continue;
    const fb = { ...(t.fb || {}) };
    const pv = Number.isFinite(fb.pv) ? fb.pv : 0;
    const level = evaluatePidPvAlarmLevel(t, pv);
    t.alarmLevel = level;
    const hiActive = level === 'innerHigh' || level === 'outerHigh';
    const loActive = level === 'innerLow' || level === 'outerLow';
    fb.alarmHi = hiActive;
    fb.alarmLo = loActive;
    t.fb = fb;
    writeBoolTag(byId, fb.alarmHiId, hiActive);
    writeBoolTag(byId, fb.alarmLoId, loActive);
  }
}

function updatePids(tags, dtMs) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  wirePidTagInputs(tags, byId);
  updatePidAlarms(tags, byId);
  const dt = Math.max(dtMs / 1000, 0.001);
  for (const t of tags) {
    if (t.type !== 'PID') continue;
    const fb = t.fb || {};
    const sp = Number.isFinite(fb.sp) ? fb.sp : Number(t.preset) || 0;
    const pv = Number.isFinite(fb.pv) ? fb.pv : 0;
    const kp = Number(t.kp) || 0;
    const ki = Number(t.ki) || 0;
    const kd = Number(t.kd) || 0;
    const outMin = Number.isFinite(t.outMin) ? t.outMin : 0;
    const outMax = Number.isFinite(t.outMax) ? t.outMax : 100;
    const mode = t.mode || 'PID';

    fb.sp = sp;
    if (!fb.enabled) {
      fb.err = sp - pv;
      t.fb = fb;
      writeTagLogicValue(t, Number.isFinite(fb.out) ? fb.out : 0);
      continue;
    }

    const err = sp - pv;
    let integral = Number.isFinite(fb.integral) ? fb.integral : 0;
    integral += err * dt;

    const prevPv = Number.isFinite(fb.prevPv) ? fb.prevPv : pv;
    const dPv = (pv - prevPv) / dt;

    let pTerm = kp * err;
    let iTerm = ki * integral;
    let dTerm = (mode === 'PID') ? (-kd * dPv) : 0;
    let out = pTerm + iTerm + dTerm;

    if (out > outMax) {
      out = outMax;
      if (err > 0) integral = Number.isFinite(fb.integral) ? fb.integral : integral;
    } else if (out < outMin) {
      out = outMin;
      if (err < 0) integral = Number.isFinite(fb.integral) ? fb.integral : integral;
    }

    out = clamp(out, outMin, outMax);

    fb.pv = pv;
    fb.err = err;
    fb.integral = integral;
    fb.prevPv = pv;
    fb.out = out;
    t.fb = fb;
    writeTagLogicValue(t, out);
  }
  writePidTagOutputs(tags, byId);
}

const AVG_WINDOW_MAX = 256;

function updateAverages(tags) {
  for (const t of tags) {
    if (t.type !== 'AVG') continue;
    const fb = t.fb || {};
    const mode = t.mode || 'MOV';
    const window = Math.max(1, Math.min(AVG_WINDOW_MAX, Math.trunc(Number(t.preset) || 1)));

    if (fb.reset) {
      fb.samples = [];
      fb.sum = 0;
      fb.count = 0;
      fb.avg = Number.isFinite(fb.pv) ? fb.pv : 0;
      fb.ready = false;
      fb.reset = false;
      fb.ema = fb.avg;
      t.fb = fb;
      writeTagLogicValue(t, fb.avg);
      continue;
    }

    const sample = Number.isFinite(fb.pv) ? fb.pv : 0;
    let avg = sample;

    if (mode === 'EMA') {
      const alpha = 2 / (window + 1);
      const prev = Number.isFinite(fb.ema) ? fb.ema : sample;
      avg = alpha * sample + (1 - alpha) * prev;
      fb.ema = avg;
      fb.count = Math.min((fb.count || 0) + 1, window);
      fb.ready = fb.count >= window;
      fb.sum = avg;
      fb.samples = [];
    } else {
      let samples = Array.isArray(fb.samples) ? fb.samples.slice() : [];
      samples.push(sample);
      if (samples.length > window) samples = samples.slice(-window);
      const sum = samples.reduce((a, b) => a + b, 0);
      avg = samples.length ? sum / samples.length : sample;
      fb.samples = samples;
      fb.sum = sum;
      fb.count = samples.length;
      fb.ready = samples.length >= window;
    }

    fb.pv = sample;
    fb.avg = avg;
    t.fb = fb;
    writeTagLogicValue(t, avg);
  }
}

function altUnitCount(t) {
  const mode = String(t.mode || 'ALT2').toUpperCase();
  const preset = Number(t.preset);
  if (mode === 'ALT4' || preset === 4) return 4;
  if (mode === 'ALT3' || preset === 3) return 3;
  return 2;
}

function firstOnlineUnit(online, unitCount, start = 0) {
  for (let n = 0; n < unitCount; n++) {
    const idx = (start + n) % unitCount;
    if (online[idx]) return idx;
  }
  return -1;
}

function nextOnlineUnit(from, online, unitCount) {
  return firstOnlineUnit(online, unitCount, from + 1);
}

function altReadBool(byId, tagId) {
  if (!tagId) return false;
  const src = byId.get(tagId);
  return src ? !!effectiveValue(src) : false;
}

function altReadLevel(byId, tagId) {
  if (!tagId) return NaN;
  const src = byId.get(tagId);
  return src ? Number(effectiveValue(src)) : NaN;
}

function altWithin(v, lo, hi) {
  if (!Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return false;
  return v >= lo && v <= hi;
}

function altSelIds(fb, key) {
  const ids = Array.isArray(fb[key]) ? fb[key].slice(0, 4) : [];
  while (ids.length < 4) ids.push('');
  return ids;
}

function altManualUnit(selIds, online, unitCount, byId, skipIndex = -1) {
  for (let i = 0; i < unitCount; i++) {
    if (i === skipIndex) continue;
    if (selIds[i] && online[i] && altReadBool(byId, selIds[i])) return i;
  }
  return -1;
}

/** Resolve off/high/low from digital inputs and optional analog level bands. */
function altLevelState(fb, byId) {
  const mode = String(fb.levelInputMode || 'both').toLowerCase();
  const useDigital = mode === 'digital' || mode === 'both';
  const useAnalog = (mode === 'analog' || mode === 'both') && fb.levelControlEnabled && fb.levelId;

  let offActive = useDigital && altReadBool(byId, fb.offId);
  let highActive = useDigital && altReadBool(byId, fb.highId);
  let lowActive = useDigital && altReadBool(byId, fb.lowId);
  let low2Active = useDigital && altReadBool(byId, fb.low2Id);

  if (useAnalog) {
    const level = altReadLevel(byId, fb.levelId);
    if (Number.isFinite(level)) {
      if (altWithin(level, fb.levelOffLo, fb.levelOffHi)) offActive = true;
      if (altWithin(level, fb.levelHighLo, fb.levelHighHi)) highActive = true;
      if (altWithin(level, fb.levelLowLo, fb.levelLowHi)) lowActive = true;
    }
  }

  if (offActive) return { off: true, high: false, low: false, low2: false, stage: 'off' };
  if (highActive) return { off: false, high: true, low: false, low2: false, stage: 'high' };
  if (low2Active) return { off: false, high: false, low: lowActive, low2: true, stage: 'lag2' };
  if (lowActive) return { off: false, high: false, low: true, low2: false, stage: 'lag' };
  return { off: false, high: false, low: false, low2: false, stage: 'normal' };
}

/** Lead/lag alternator: round-robin among online units; Off/High/Lag stage outputs (ALT2: 0/2/2/1 pumps). */
function updateAlternators(tags) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  for (const t of tags) {
    if (t.type !== 'ALT') continue;
    const fb = { ...(t.fb || {}) };
    const unitCount = altUnitCount(t);
    fb.unitCount = unitCount;

    if (fb.enableId) {
      const src = byId.get(fb.enableId);
      if (src) fb.enabled = !!effectiveValue(src);
    }
    if (fb.advanceId) {
      const src = byId.get(fb.advanceId);
      if (src) fb.advance = !!effectiveValue(src);
    }
    if (fb.autoFaultId) {
      const src = byId.get(fb.autoFaultId);
      if (src) fb.autoFault = !!effectiveValue(src);
    }

    const onlineIds = Array.isArray(fb.onlineIds) ? fb.onlineIds : [];
    const online = [false, false, false, false];
    const anyOnlineLinked = onlineIds.slice(0, unitCount).some(Boolean);
    for (let i = 0; i < unitCount; i++) {
      const id = onlineIds[i];
      if (!anyOnlineLinked) {
        online[i] = true;
      } else if (id) {
        const src = byId.get(id);
        online[i] = src ? !!effectiveValue(src) : false;
      }
    }
    fb.unitOnline = online;

    let levelState = altLevelState(fb, byId);
    if (unitCount < 3) {
      if (levelState.low2) {
        levelState = {
          ...levelState,
          low2: false,
          stage: levelState.low ? 'lag' : levelState.stage === 'lag2' ? 'normal' : levelState.stage,
        };
      }
    }
    fb.offActive = levelState.off;
    fb.highActive = levelState.high;
    fb.lowActive = levelState.low;
    fb.low2Active = levelState.low2;
    fb.pumpStage = levelState.stage;

    const leadSelIds = altSelIds(fb, 'leadSelIds');
    const lagSelIds = altSelIds(fb, 'lagSelIds');
    const lag2SelIds = altSelIds(fb, 'lag2SelIds');

    let leadIndex = Number.isInteger(fb.leadIndex) ? fb.leadIndex : 0;
    if (leadIndex < 0 || leadIndex >= unitCount) leadIndex = 0;

    let advancePulse = !!fb.advancePulse;
    fb.advancePulse = false;
    if (fb.advanceId) {
      const adv = !!fb.advance;
      if (adv && !fb.prevAdvance) advancePulse = true;
      fb.prevAdvance = adv;
    } else {
      fb.prevAdvance = false;
    }

    const onlineCount = online.slice(0, unitCount).filter(Boolean).length;
    fb.ready = onlineCount > 0;
    fb.fault = onlineCount === 0;
    const prevLeadOnline = !!fb.prevLeadOnline;
    const paused = levelState.off || levelState.high || levelState.low || levelState.low2;

    if (!fb.enabled || fb.fault) {
      leadIndex = fb.fault ? -1 : firstOnlineUnit(online, unitCount, 0);
    } else if (!paused) {
      if (!online[leadIndex]) {
        const first = firstOnlineUnit(online, unitCount, 0);
        leadIndex = first >= 0 ? first : 0;
      }
      if (advancePulse) {
        const next = nextOnlineUnit(leadIndex, online, unitCount);
        if (next >= 0) leadIndex = next;
      } else if (fb.autoFault && prevLeadOnline && !online[leadIndex]) {
        const next = nextOnlineUnit(leadIndex, online, unitCount);
        if (next >= 0) leadIndex = next;
      }
    } else if (!online[leadIndex]) {
      const first = firstOnlineUnit(online, unitCount, 0);
      leadIndex = first >= 0 ? first : -1;
    }

    const manualLead = altManualUnit(leadSelIds, online, unitCount, byId);
    if (manualLead >= 0) leadIndex = manualLead;

    let lagIndex = (leadIndex >= 0) ? nextOnlineUnit(leadIndex, online, unitCount) : -1;
    let lag2Index = (lagIndex >= 0) ? nextOnlineUnit(lagIndex, online, unitCount) : -1;

    const manualLag = altManualUnit(lagSelIds, online, unitCount, byId, leadIndex);
    if (manualLag >= 0) lagIndex = manualLag;
    const manualLag2 = altManualUnit(lag2SelIds, online, unitCount, byId, leadIndex);
    if (manualLag2 >= 0) lag2Index = manualLag2;

    fb.prevLeadOnline = leadIndex >= 0 ? online[leadIndex] : false;
    fb.leadIndex = leadIndex;
    fb.lagIndex = lagIndex;
    fb.lag2Index = lag2Index;
    fb.activeUnit = leadIndex >= 0 ? leadIndex + 1 : 0;

    const runAllowed = !!fb.enabled && !fb.fault && !levelState.off && leadIndex >= 0;
    const runUnits = new Set();
    if (runAllowed) {
      if (levelState.high) {
        for (let i = 0; i < unitCount; i++) {
          if (online[i]) runUnits.add(i);
        }
      } else {
        runUnits.add(leadIndex);
        const needLag = levelState.low || (levelState.low2 && unitCount >= 3);
        if (needLag && lagIndex >= 0 && online[lagIndex]) runUnits.add(lagIndex);
        if (levelState.low2 && unitCount >= 3 && lag2Index >= 0 && online[lag2Index]) runUnits.add(lag2Index);
      }
    }

    for (let i = 0; i < unitCount; i++) {
      writeBoolTag(byId, fb.unitOutIds?.[i], runUnits.has(i));
    }
    writeBoolTag(byId, fb.leadOutId, runUnits.has(leadIndex));
    writeBoolTag(byId, fb.lagOutId, lagIndex >= 0 && runUnits.has(lagIndex));

    t.fb = fb;
    writeTagLogicValue(t, fb.activeUnit);
  }
}

/** Flow meter: on linked 1-minute timer done, GPM = pulse count / K (K = counts per gallon). */
function updateFlowMeters(tags) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  for (const t of tags) {
    if (t.type !== 'FLOW') continue;
    const fb = t.fb || {};
    const ctr = fb.ctrId ? byId.get(fb.ctrId) : null;
    const tmr = fb.tmrId ? byId.get(fb.tmrId) : null;
    if (!ctr || !tmr || tmr.type !== 'TIMER' || ctr.type !== 'COUNTER') continue;

    const tmrFb = tmr.fb || {};
    const done = !!tmrFb.done;
    let k = Number(fb.k);
    if (!Number.isFinite(k) || k <= 0) {
      if (fb.kTagId) {
        const kTag = byId.get(fb.kTagId);
        k = Number(kTag?.value);
      }
      if (!Number.isFinite(k) || k <= 0) k = Number(t.preset) || 1;
    }

    if (done && !fb.prevTmrDone) {
      const count = Number(ctr.fb?.count ?? ctr.value) || 0;
      const gpm = k > 0 ? count / k : 0;
      fb.gpm = gpm;
      fb.ready = true;
      ctr.fb = { ...(ctr.fb || {}), reset: true };
      tmr.fb = { ...(tmr.fb || {}), reset: true };
      if (fb.outId) {
        const out = byId.get(fb.outId);
        if (out && (out.type === 'INT' || out.type === 'REAL' || out.role === 'memory' || out.role === 'output')) {
          writeTagLogicValue(out, out.type === 'INT' ? Math.trunc(gpm) : gpm);
          out.dirty = true;
        }
      }
    } else if (!done) {
      fb.ready = false;
    }

    fb.prevTmrDone = done;
    t.fb = fb;
    writeTagLogicValue(t, fb.gpm);
  }
}

/** Reversing motor: Fwd/Rev contactors with interlock and reversal deadtime (preset ms). */
function updateReversingMotors(tags, dtMs) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const dt = Math.max(0, Number(dtMs) || 0);
  for (const t of tags) {
    if (t.type !== 'RMOTOR') continue;
    const fb = { ...(t.fb || {}) };
    const deadtimeMs = Math.max(0, Number(t.preset) || 500);

    const overload = rmotorReadBool(byId, fb.overloadId);
    const offline = rmotorReadBool(byId, fb.offlineId);
    const reset = rmotorReadBool(byId, fb.resetId);
    const hoa = fb.hoaId ? rmotorReadInt(byId, fb.hoaId, 0) : 0;
    const fwdCmdRaw = rmotorReadBool(byId, fb.fwdCmdId);
    const revCmdRaw = rmotorReadBool(byId, fb.revCmdId);
    const fwdAux = rmotorReadBool(byId, fb.fwdAuxId);
    const revAux = rmotorReadBool(byId, fb.revAuxId);

    if (reset) {
      fb.hours = 0;
      fb.starts = 0;
      fb.phase = 'idle';
      fb.deadElapsed = 0;
      fb.pendingDir = null;
      if (fb.offlineId) writeBoolTag(byId, fb.offlineId, false);
    }

    let fwdCmd = false;
    let revCmd = false;
    if (!offline && !overload && hoa !== 1) {
      fwdCmd = fwdCmdRaw;
      revCmd = revCmdRaw;
    }

    const bothCmd = fwdCmd && revCmd;
    let fault = overload || bothCmd;
    let phase = fb.phase || 'idle';
    let deadElapsed = Number(fb.deadElapsed) || 0;
    let pendingDir = fb.pendingDir || null;
    let fwdOut = false;
    let revOut = false;
    let reversing = false;

    if (offline || fault) {
      phase = 'idle';
      deadElapsed = 0;
      pendingDir = null;
    } else if (phase === 'deadtime') {
      deadElapsed += dt;
      if (deadElapsed >= deadtimeMs) {
        phase = pendingDir === 'fwd' ? 'fwd' : pendingDir === 'rev' ? 'rev' : 'idle';
        pendingDir = null;
        deadElapsed = 0;
      } else {
        reversing = true;
      }
    }

    if (!offline && !fault && phase !== 'deadtime') {
      const wantFwd = fwdCmd && !revCmd;
      const wantRev = revCmd && !fwdCmd;
      if (phase === 'fwd') {
        if (wantRev) {
          phase = 'deadtime';
          pendingDir = 'rev';
          deadElapsed = 0;
          reversing = true;
        } else if (!wantFwd) {
          phase = 'idle';
        } else {
          fwdOut = true;
        }
      } else if (phase === 'rev') {
        if (wantFwd) {
          phase = 'deadtime';
          pendingDir = 'fwd';
          deadElapsed = 0;
          reversing = true;
        } else if (!wantRev) {
          phase = 'idle';
        } else {
          revOut = true;
        }
      } else if (wantFwd) {
        phase = 'fwd';
        fwdOut = true;
      } else if (wantRev) {
        phase = 'rev';
        revOut = true;
      }
    } else if (reversing) {
      phase = 'deadtime';
    }

    const running = fwdOut || revOut;
    let hours = Number.isFinite(fb.hours) ? fb.hours : 0;
    let starts = Number.isInteger(fb.starts) ? fb.starts : 0;
    if (running) hours += dt / 3600000;
    if (running && !fb.prevRunning) starts += 1;

    let status = 0;
    if (offline) status = 4;
    else if (fault) status = 3;
    else if (fwdOut) status = 1;
    else if (revOut) status = 2;
    else if (reversing || phase === 'deadtime') status = 5;

    writeBoolTag(byId, fb.fwdOutId, fwdOut);
    writeBoolTag(byId, fb.revOutId, revOut);
    writeAnalogTag(byId, fb.hrsOutId, hours);
    writeAnalogTag(byId, fb.startsOutId, starts);
    writeAnalogTag(byId, fb.staOutId, status);

    fb.fwdAux = fwdAux;
    fb.revAux = revAux;
    fb.fwdRun = fwdOut;
    fb.revRun = revOut;
    fb.fault = fault;
    fb.reversing = reversing || phase === 'deadtime';
    fb.status = status;
    fb.hours = hours;
    fb.starts = starts;
    fb.phase = phase;
    fb.deadElapsed = deadElapsed;
    fb.pendingDir = pendingDir;
    fb.prevRunning = running;
    t.fb = fb;
    writeTagLogicValue(t, status);
  }
}

module.exports = {
  updateTimers, updateCounters, updatePids, updateAverages, updateAlternators, updateFlowMeters,
  updateReversingMotors,
  pidDisplayFb, effectiveAnalogValue,
};
