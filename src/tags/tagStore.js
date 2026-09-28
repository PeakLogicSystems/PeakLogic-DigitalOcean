'use strict';

const { MAX_TAGS } = require('../config');
const { QUALITY } = require('./constants');
const { applyTagNaming, normalizeWordWidth } = require('./tagNaming');
const { normalizeTagImport } = require('../project/estFile');
const persistence = require('../persistence');
const { applyDefaultLabel } = require('./tagLabels');
const {
  buildDefaultMemoryTags,
  mergeDefaultMemoryTags,
} = require('./defaultMemoryTags');
const {
  normalizeScale,
  normalizeOffset,
  normalizeAlarmFields,
  evaluateAlarmLevel,
  isAlarmActive,
  isAlarmCapableType,
} = require('./tagAnalog');
const { pidDisplayFb } = require('../engine/functionBlocks');
const { effectiveValue, refreshEffective } = require('./tagEffective');
const { arrayLength, defaultArrayValue, normalizeArrayValue } = require('./tagArrays');

const MAX_TAG_LABEL_LEN = 80;

function normalizeTagLabel(raw) {
  if (raw == null) return '';
  return String(raw).trim().slice(0, MAX_TAG_LABEL_LEN);
}

function defaultPreset(type) {
  if (type === 'COUNTER') return 1;
  if (type === 'TIMER') return 1000;
  if (type === 'PID') return 0;
  if (type === 'AVG') return 1;
  if (type === 'FLOW') return 100;
  if (type === 'ALT') return 2;
  return 0;
}

function defaultMode(type) {
  if (type === 'COUNTER') return 'CTU';
  if (type === 'TIMER') return 'TON';
  if (type === 'PID') return 'PID';
  if (type === 'AVG') return 'MOV';
  if (type === 'FLOW') return 'GPM';
  if (type === 'ALT') return 'ALT2';
  return 'TON';
}

function defaultPidGains() {
  return { kp: 1, ki: 0, kd: 0, outMin: 0, outMax: 100 };
}

function ensureFb(type, fb) {
  const f = fb && typeof fb === 'object' ? fb : {};
  if (type === 'COUNTER') {
    return {
      count: Number.isFinite(f.count) ? f.count : 0,
      done: !!f.done,
      cu: !!f.cu,
      cd: !!f.cd,
      reset: !!f.reset,
      prevCu: !!f.prevCu,
      prevCd: !!f.prevCd,
    };
  }
  if (type === 'TIMER') {
    return {
      input: !!f.input,
      elapsed: Number.isFinite(f.elapsed) ? f.elapsed : 0,
      done: !!f.done,
      running: !!f.running,
      prevIn: !!f.prevIn,
      reset: !!f.reset,
    };
  }
  if (type === 'PID') {
    return {
      pv: Number.isFinite(f.pv) ? f.pv : 0,
      sp: Number.isFinite(f.sp) ? f.sp : 0,
      out: Number.isFinite(f.out) ? f.out : 0,
      err: Number.isFinite(f.err) ? f.err : 0,
      integral: Number.isFinite(f.integral) ? f.integral : 0,
      prevPv: Number.isFinite(f.prevPv) ? f.prevPv : null,
      enabled: f.enabled !== false,
      pvId: typeof f.pvId === 'string' ? f.pvId : '',
      spId: typeof f.spId === 'string' ? f.spId : '',
      outId: typeof f.outId === 'string' ? f.outId : '',
      alarmHiId: typeof f.alarmHiId === 'string' ? f.alarmHiId : '',
      alarmLoId: typeof f.alarmLoId === 'string' ? f.alarmLoId : '',
      alarmHi: !!f.alarmHi,
      alarmLo: !!f.alarmLo,
    };
  }
  if (type === 'AVG') {
    return {
      pv: Number.isFinite(f.pv) ? f.pv : 0,
      avg: Number.isFinite(f.avg) ? f.avg : 0,
      sum: Number.isFinite(f.sum) ? f.sum : 0,
      count: Number.isFinite(f.count) ? f.count : 0,
      ready: !!f.ready,
      reset: !!f.reset,
      ema: Number.isFinite(f.ema) ? f.ema : 0,
      samples: Array.isArray(f.samples) ? f.samples.slice() : [],
    };
  }
  if (type === 'FLOW') {
    return {
      ctrId: f.ctrId || '',
      tmrId: f.tmrId || '',
      kTagId: f.kTagId || '',
      outId: f.outId || '',
      k: Number.isFinite(f.k) ? f.k : 0,
      gpm: Number.isFinite(f.gpm) ? f.gpm : 0,
      ready: !!f.ready,
      prevTmrDone: !!f.prevTmrDone,
    };
  }
  if (type === 'ALT') {
    const onlineIds = Array.isArray(f.onlineIds) ? f.onlineIds.slice(0, 4) : [];
    const unitOutIds = Array.isArray(f.unitOutIds) ? f.unitOutIds.slice(0, 4) : [];
    const leadSelIds = Array.isArray(f.leadSelIds) ? f.leadSelIds.slice(0, 4) : [];
    const lagSelIds = Array.isArray(f.lagSelIds) ? f.lagSelIds.slice(0, 4) : [];
    const lag2SelIds = Array.isArray(f.lag2SelIds) ? f.lag2SelIds.slice(0, 4) : [];
    while (onlineIds.length < 4) onlineIds.push('');
    while (unitOutIds.length < 4) unitOutIds.push('');
    while (leadSelIds.length < 4) leadSelIds.push('');
    while (lagSelIds.length < 4) lagSelIds.push('');
    while (lag2SelIds.length < 4) lag2SelIds.push('');
    return {
      enabled: !!f.enabled,
      enableId: f.enableId || '',
      advance: !!f.advance,
      advanceId: f.advanceId || '',
      advancePulse: !!f.advancePulse,
      prevAdvance: !!f.prevAdvance,
      autoFault: !!f.autoFault,
      autoFaultId: f.autoFaultId || '',
      leadOutId: f.leadOutId || '',
      lagOutId: f.lagOutId || '',
      offId: f.offId || '',
      highId: f.highId || '',
      lowId: f.lowId || '',
      low2Id: f.low2Id || '',
      levelId: f.levelId || '',
      levelControlEnabled: !!f.levelControlEnabled,
      levelInputMode: f.levelInputMode || 'both',
      levelOffLo: Number.isFinite(f.levelOffLo) ? f.levelOffLo : 0,
      levelOffHi: Number.isFinite(f.levelOffHi) ? f.levelOffHi : 0,
      levelLowLo: Number.isFinite(f.levelLowLo) ? f.levelLowLo : 0,
      levelLowHi: Number.isFinite(f.levelLowHi) ? f.levelLowHi : 0,
      levelHighLo: Number.isFinite(f.levelHighLo) ? f.levelHighLo : 0,
      levelHighHi: Number.isFinite(f.levelHighHi) ? f.levelHighHi : 0,
      leadSelIds,
      lagSelIds,
      lag2SelIds,
      onlineIds,
      unitOutIds,
      unitOnline: Array.isArray(f.unitOnline) ? f.unitOnline.slice(0, 4) : [false, false, false, false],
      unitCount: Number.isFinite(f.unitCount) ? f.unitCount : 2,
      leadIndex: Number.isInteger(f.leadIndex) ? f.leadIndex : 0,
      lagIndex: Number.isInteger(f.lagIndex) ? f.lagIndex : -1,
      lag2Index: Number.isInteger(f.lag2Index) ? f.lag2Index : -1,
      activeUnit: Number.isFinite(f.activeUnit) ? f.activeUnit : 0,
      ready: !!f.ready,
      fault: !!f.fault,
      prevLeadOnline: !!f.prevLeadOnline,
      offActive: !!f.offActive,
      highActive: !!f.highActive,
      lowActive: !!f.lowActive,
      low2Active: !!f.low2Active,
      pumpStage: f.pumpStage || 'normal',
    };
  }
  return { ...f };
}

class TagStore {
  constructor() {
    this.tags = new Map();
    /** @type {Map<string, { level: string, acked: boolean, since: number, ackedAt: number|null }>} */
    this._alarmAnnunc = new Map();
    this.load();
  }

  _refreshAlarmLevel(t) {
    if (t.type === 'PID') {
      const pv = Number.isFinite(t.fb?.pv) ? t.fb.pv : Number(t.value);
      t.alarmLevel = evaluateAlarmLevel({ ...t, type: 'REAL' }, pv);
    } else {
      t.alarmLevel = evaluateAlarmLevel(t, t.value);
    }
    this._syncAlarmAnnunc(t);
  }

  _syncAlarmAnnunc(t) {
    const level = t.alarmLevel;
    if (!isAlarmActive(level)) {
      this._alarmAnnunc.delete(t.id);
      return;
    }
    const cur = this._alarmAnnunc.get(t.id);
    if (!cur || cur.level !== level) {
      const preserveAck = !!(cur?.acked && isAlarmActive(cur.level) && isAlarmActive(level));
      const since = cur?.since ?? Date.now();
      this._alarmAnnunc.set(t.id, {
        level,
        acked: preserveAck,
        since,
        ackedAt: preserveAck ? (cur.ackedAt ?? Date.now()) : null,
      });
      if (preserveAck) return;
      try {
        const { emit } = require('../runtime/eventBus');
        emit('alarm:transition', {
          tagId: t.id,
          level,
          previousLevel: cur?.level ?? null,
          value: t.value,
          since,
        });
      } catch { /* optional */ }
    }
  }

  _ensureAlarmAnnuncForTag(t) {
    if (!t?.alarmsEnabled || !isAlarmCapableType(t.type)) return null;
    if (!isAlarmActive(t.alarmLevel)) this._refreshAlarmLevel(t);
    if (!isAlarmActive(t.alarmLevel)) return null;
    if (!this._alarmAnnunc.has(t.id)) this._syncAlarmAnnunc(t);
    return this._alarmAnnunc.get(t.id) || null;
  }

  ackAlarm(tagId) {
    const t = this.get(tagId);
    if (!t) return false;
    const entry = this._ensureAlarmAnnuncForTag(t);
    if (!entry) return false;
    entry.acked = true;
    entry.ackedAt = Date.now();
    return true;
  }

  ackAllAlarms() {
    const now = Date.now();
    let n = 0;
    for (const t of this.list()) {
      const entry = this._ensureAlarmAnnuncForTag(t);
      if (!entry) continue;
      if (!entry.acked) n += 1;
      entry.acked = true;
      entry.ackedAt = now;
    }
    return n;
  }

  load() {
    const list = persistence.readJson('tags.json', []);
    this.tags.clear();
    const rows = Array.isArray(list) ? list : [];
    let labeled = 0;
    for (const t of rows) {
      let normalized = this._normalize(t, { siblingTags: rows });
      if (!String(normalized.label || '').trim()) {
        normalized = this._normalize(applyDefaultLabel(normalized), { siblingTags: rows });
        labeled += 1;
      }
      this.tags.set(normalized.id, normalized);
    }
    if (labeled) this.save();
    for (const t of this.tags.values()) this._refreshAlarmLevel(t);
    try {
      const { repairTpoIntTags } = require('../programs/tpoTags');
      const repaired = repairTpoIntTags(this);
      if (repaired.length) this.save();
    } catch { /* ignore */ }
  }

  save() {
    const cs = require('../configStore');
    if (cs.isConfigJsonFile('tags.json') && !cs.status().ready) return;
    persistence.writeJson('tags.json', Array.from(this.tags.values()).map((t) => {
      const out = { ...t };
      delete out.alarmLevel;
      delete out.dirty;
      delete out.updatedAt;
      return out;
    }));
  }

  _normalize(t, opts = {}) {
    const src = normalizeTagImport(t);
    const list = opts.siblingTags || this.list();
    const skipIndex = opts.skipIndex ?? null;
    const type = src.type || 'BOOL';
    const role = src.role || 'memory';
    const id = applyTagNaming(src.id, type, role, list, skipIndex);
    const wordWidth = normalizeWordWidth(type, src.wordWidth);
    const arrayLen = type === 'INT' || type === 'REAL'
      ? Math.max(1, Math.min(62, parseInt(src.arrayLen, 10) || 1))
      : 1;
    const pidGains = type === 'PID' ? defaultPidGains() : {};
    const alarms = normalizeAlarmFields(src);
    const logicValue = normalizeArrayValue(
      { type, arrayLen },
      src.logicValue ?? src.value ?? (arrayLen > 1 ? defaultArrayValue({ type, arrayLen }) : (type === 'BOOL' ? false : 0)),
    );
    const tag = {
      id,
      label: normalizeTagLabel(src.label),
      type,
      role,
      driverId: src.driverId ?? null,
      driverAddress: src.driverAddress ?? null,
      default: src.default ?? 0,
      scale: normalizeScale(src.scale),
      offset: normalizeOffset(src.offset),
      ...alarms,
      readonly: !!src.readonly,
      preset: src.preset != null && src.preset !== '' ? Number(src.preset) : defaultPreset(type),
      mode: src.mode || defaultMode(type),
      arrayLen,
      logicValue,
      value: logicValue,
      kp: type === 'PID'
        ? (Number.isFinite(Number(src.kp)) ? Number(src.kp) : pidGains.kp)
        : undefined,
      ki: type === 'PID'
        ? (Number.isFinite(Number(src.ki)) ? Number(src.ki) : 0)
        : undefined,
      kd: type === 'PID'
        ? (Number.isFinite(Number(src.kd)) ? Number(src.kd) : 0)
        : undefined,
      outMin: type === 'PID' ? (src.outMin != null ? Number(src.outMin) : pidGains.outMin) : undefined,
      outMax: type === 'PID' ? (src.outMax != null ? Number(src.outMax) : pidGains.outMax) : undefined,
      quality: src.quality || QUALITY.GOOD,
      wordWidth,
      signed: src.signed !== false,
      forceInput: !!src.forceInput,
      forceOutput: !!src.forceOutput,
      forceValue: src.forceValue,
      graphEnabled: src.graphEnabled !== false && (
        type === 'INT' || type === 'REAL' || type === 'BOOL'
        || type === 'PID' || type === 'AVG' || type === 'FLOW' || type === 'ALT'
      ),
      global: !!src.global,
      dirty: false,
      alarmLevel: null,
      fb: (() => {
        if (!['TIMER', 'COUNTER', 'PID', 'AVG', 'FLOW', 'ALT'].includes(type)) return src.fb || {};
        const fb = ensureFb(type, src.fb);
        if (type === 'PID') {
          const sp = src.preset != null && src.preset !== '' ? Number(src.preset) : defaultPreset(type);
          fb.sp = sp;
        }
        return fb;
      })(),
    };
    refreshEffective(tag);
    this._refreshAlarmLevel(tag);
    return tag;
  }

  list() {
    return Array.from(this.tags.values());
  }

  get(id) {
    return this.tags.get(id) || null;
  }

  count() {
    return this.tags.size;
  }

  assertCapacity(extra = 1) {
    if (this.tags.size + extra > MAX_TAGS) {
      const err = new Error(`Tag limit ${MAX_TAGS} exceeded`);
      err.status = 413;
      throw err;
    }
  }

  upsert(tag) {
    if (!tag.id) throw Object.assign(new Error('id required'), { status: 400 });
    const prev = this.get(tag.id);
    const exists = !!prev;
    if (!exists) this.assertCapacity(1);
    const merged = { ...prev, ...tag };
    const normalized = this._normalize(merged, { siblingTags: this.list() });
    if (prev && prev.id !== normalized.id) this.tags.delete(prev.id);
    this.tags.set(normalized.id, normalized);
    this.save();
    return this.get(normalized.id);
  }

  clearAlarmAnnunciator() {
    this._alarmAnnunc.clear();
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.keepForces=true] retain I/O forces when tag ids overlap
   * @param {boolean} [opts.clearAlarms=false] drop alarm annunciator state
   */
  replaceAll(tags, opts = {}) {
    if (tags.length > MAX_TAGS) {
      const err = new Error(`Tag limit ${MAX_TAGS} exceeded`);
      err.status = 413;
      throw err;
    }
    const keepForces = opts.keepForces !== false;
    if (opts.clearAlarms) this.clearAlarmAnnunciator();
    const forceState = keepForces
      ? new Map(this.list().map((t) => [t.id, {
        forceInput: t.forceInput,
        forceOutput: t.forceOutput,
        forceValue: t.forceValue,
        logicValue: t.logicValue,
        value: t.value,
      }]))
      : null;
    this.tags.clear();
    const normalized = [];
    for (const raw of tags) {
      const prev = forceState?.get(raw.id);
      const merged = prev ? {
        ...raw,
        forceInput: prev.forceInput,
        forceOutput: prev.forceOutput,
        forceValue: prev.forceValue,
        logicValue: prev.logicValue,
        value: (prev.forceInput || prev.forceOutput) ? (prev.forceValue ?? prev.value) : raw.value,
      } : raw;
      normalized.push(this._normalize(merged, { siblingTags: normalized }));
    }
    for (const t of normalized) {
      this.tags.set(t.id, t);
      this._refreshAlarmLevel(t);
    }
    this.save();
  }

  remove(id) {
    const ok = this.tags.delete(id);
    if (ok) this.save();
    return ok;
  }

  setValue(id, value, quality = QUALITY.GOOD) {
    const t = this.tags.get(id);
    if (!t) return false;
    t.logicValue = value;
    refreshEffective(t);
    t.quality = quality;
    t.updatedAt = Date.now();
    this._refreshAlarmLevel(t);
    return true;
  }

  applyDeviceTelemetry(id, row, quality = QUALITY.GOOD) {
    const t = this.tags.get(id);
    if (!t || !row) return false;
    if (row.forceInput != null) t.forceInput = !!row.forceInput;
    if (row.forceOutput != null) t.forceOutput = !!row.forceOutput;
    if (row.forceValue !== undefined) t.forceValue = row.forceValue;
    let val = row.value;
    if (t.type === 'BOOL') val = !!val;
    else if (t.type === 'INT') val = Math.trunc(Number(val) || 0);
    else if (t.type === 'REAL' || t.type === 'PID' || t.type === 'AVG') val = Number(val) || 0;
    if (row.logicValue !== undefined) {
      t.logicValue = row.logicValue;
    } else if (!t.forceInput && !t.forceOutput) {
      t.logicValue = val;
    }
    t.value = val;
    t.quality = quality;
    t.updatedAt = Date.now();
    this._refreshAlarmLevel(t);
    return true;
  }

  markDirty(id) {
    const t = this.tags.get(id);
    if (t && (t.role === 'output' || t.role === 'memory' || t.global)) {
      t.dirty = true;
    }
  }

  clearDirty() {
    for (const t of this.tags.values()) t.dirty = false;
  }

  liveSnapshotSlim() {
    return this.list().map((t) => ({
      tagId: t.id,
      value: t.value,
      quality: t.quality,
      forceInput: t.forceInput,
      forceOutput: t.forceOutput,
      forceValue: t.forceValue,
      alarmLevel: t.alarmLevel,
      updatedAt: t.updatedAt ?? null,
    }));
  }

  liveSnapshot() {
    const list = this.list();
    const byId = new Map(list.map((tag) => [tag.id, tag]));
    return list.map((t) => ({
      tagId: t.id,
      label: t.label || '',
      value: t.value,
      quality: t.quality,
      type: t.type,
      wordWidth: t.wordWidth,
      arrayLen: t.arrayLen > 1 ? t.arrayLen : undefined,
      preset: t.preset,
      mode: t.mode,
      fb: t.type === 'PID'
        ? pidDisplayFb(t, byId)
        : (t.type === 'TIMER' || t.type === 'COUNTER' || t.type === 'AVG' || t.type === 'FLOW' || t.type === 'ALT')
          ? { ...(t.fb || {}) }
          : undefined,
      kp: t.kp,
      ki: t.ki,
      kd: t.kd,
      outMin: t.outMin,
      outMax: t.outMax,
      forceInput: t.forceInput,
      forceOutput: t.forceOutput,
      forceValue: t.forceValue,
      logicValue: (t.forceInput || t.forceOutput) ? t.logicValue : undefined,
      scale: t.scale,
      offset: t.offset,
      alarmsEnabled: t.alarmsEnabled,
      alarmCondition: t.alarmCondition,
      alarmLevel: t.alarmLevel,
      alarmAcked: this._alarmAnnunc.get(t.id)?.acked ?? false,
      alarmSince: this._alarmAnnunc.get(t.id)?.since ?? null,
      updatedAt: t.updatedAt ?? null,
    }));
  }

  writeHmiMemory(id, rawValue) {
    const t = this.get(id);
    if (!t) return null;
    if (t.readonly) {
      throw Object.assign(new Error('Tag is read-only'), { status: 403 });
    }
    if (t.role !== 'memory') {
      throw Object.assign(new Error('HMI may only write memory tags'), { status: 400 });
    }
    if (t.forceInput || t.forceOutput) {
      t.forceInput = false;
      t.forceOutput = false;
      t.forceValue = undefined;
    }
    let value = rawValue;
    if (t.type === 'BOOL') {
      value = !!rawValue;
    } else if (t.type === 'INT') {
      value = Math.trunc(Number(rawValue));
      if (!Number.isFinite(value)) {
        throw Object.assign(new Error('Invalid INT value'), { status: 400 });
      }
    } else if (t.type === 'REAL') {
      value = Number(rawValue);
      if (!Number.isFinite(value)) {
        throw Object.assign(new Error('Invalid REAL value'), { status: 400 });
      }
    } else {
      throw Object.assign(
        new Error(`HMI write not supported for type ${t.type}`),
        { status: 400 },
      );
    }
    this.setValue(id, value);
    return t;
  }

  setForce(id, { forceInput, forceOutput, forceValue }) {
    const t = this.get(id);
    if (!t) return null;
    if (forceInput != null) t.forceInput = !!forceInput;
    if (forceOutput != null) t.forceOutput = !!forceOutput;
    if (forceValue !== undefined) {
      if (t.type !== 'BOOL' && typeof forceValue === 'number' && !Number.isFinite(forceValue)) {
        throw Object.assign(new Error('Invalid force value'), { status: 400 });
      }
      t.forceValue = forceValue;
    }
    if (t.forceInput || t.forceOutput) {
      if (t.forceOutput) this.markDirty(id);
    }
    refreshEffective(t);
    this._refreshAlarmLevel(t);
    this.save();
    return t;
  }

  clearForce(id, which) {
    const t = this.get(id);
    if (!t) return null;
    if (!which || which === 'input') t.forceInput = false;
    if (!which || which === 'output') t.forceOutput = false;
    if (!t.forceInput && !t.forceOutput) t.forceValue = undefined;
    refreshEffective(t);
    this._refreshAlarmLevel(t);
    this.save();
    return t;
  }

  applyForcesAfterRead() {
    for (const t of this.tags.values()) {
      if (t.forceInput) {
        refreshEffective(t);
        t.quality = QUALITY.GOOD;
        this._refreshAlarmLevel(t);
      }
    }
  }

  applyForcesAfterLogic() {
    for (const t of this.tags.values()) {
      if (t.forceOutput) {
        refreshEffective(t);
        this._refreshAlarmLevel(t);
        this.markDirty(t.id);
      }
    }
  }

  isDriverReadSkipped(t) {
    return !!t.forceInput;
  }

  isDriverWriteSkipped(t) {
    return false;
  }
}

module.exports = {
  TagStore,
  buildDefaultMemoryTags,
  mergeDefaultMemoryTags,
};
