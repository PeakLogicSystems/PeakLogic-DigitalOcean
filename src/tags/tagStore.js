'use strict';

const { MAX_TAGS } = require('../config');
const { QUALITY } = require('./constants');
const { applyTagNaming, normalizeWordWidth } = require('./tagNaming');
const { normalizeTagImport } = require('../project/estFile');
const persistence = require('../persistence');
const {
  buildDefaultMemoryTags,
  mergeDefaultMemoryTags,
  isEmptyTagList,
} = require('./defaultMemoryTags');
const {
  normalizeScale,
  normalizeOffset,
  normalizeAlarmFields,
  evaluateAlarmLevel,
  isAlarmActive,
} = require('./tagAnalog');
const { arrayLength, defaultArrayValue, normalizeArrayValue } = require('./tagArrays');

function defaultPreset(type) {
  if (type === 'COUNTER') return 1;
  if (type === 'TIMER') return 1000;
  if (type === 'PID') return 0;
  if (type === 'AVG') return 1;
  if (type === 'FLOW') return 100;
  return 0;
}

function defaultMode(type) {
  if (type === 'COUNTER') return 'CTU';
  if (type === 'TIMER') return 'TON';
  if (type === 'PID') return 'PID';
  if (type === 'AVG') return 'MOV';
  if (type === 'FLOW') return 'GPM';
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
    t.alarmLevel = evaluateAlarmLevel(t, t.value);
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
      this._alarmAnnunc.set(t.id, {
        level,
        acked: false,
        since: Date.now(),
        ackedAt: null,
      });
    }
  }

  ackAlarm(tagId) {
    const entry = this._alarmAnnunc.get(tagId);
    if (!entry) return false;
    entry.acked = true;
    entry.ackedAt = Date.now();
    return true;
  }

  ackAllAlarms() {
    const now = Date.now();
    let n = 0;
    for (const entry of this._alarmAnnunc.values()) {
      if (!entry.acked) n += 1;
      entry.acked = true;
      entry.ackedAt = now;
    }
    return n;
  }

  load() {
    let list = persistence.readJson('tags.json', []);
    let persist = false;
    if (isEmptyTagList(list)) {
      list = buildDefaultMemoryTags();
      persist = true;
    } else {
      const merged = mergeDefaultMemoryTags(list);
      if (merged.length !== list.length) {
        list = merged;
        persist = true;
      }
    }
    this.tags.clear();
    for (const t of list) this.tags.set(t.id, this._normalize(t, { siblingTags: list }));
    if (persist) this.save();
  }

  save() {
    persistence.writeJson('tags.json', Array.from(this.tags.values()).map((t) => {
      const out = { ...t };
      delete out.alarmLevel;
      delete out.dirty;
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
    const tag = {
      id,
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
      value: normalizeArrayValue(
        { type, arrayLen },
        src.value ?? (arrayLen > 1 ? defaultArrayValue({ type, arrayLen }) : (type === 'BOOL' ? false : 0)),
      ),
      kp: type === 'PID' ? (Number(src.kp) || pidGains.kp) : undefined,
      ki: type === 'PID' ? (Number(src.ki) || 0) : undefined,
      kd: type === 'PID' ? (Number(src.kd) || 0) : undefined,
      outMin: type === 'PID' ? (src.outMin != null ? Number(src.outMin) : pidGains.outMin) : undefined,
      outMax: type === 'PID' ? (src.outMax != null ? Number(src.outMax) : pidGains.outMax) : undefined,
      quality: src.quality || QUALITY.GOOD,
      wordWidth,
      signed: src.signed !== false,
      forceInput: !!src.forceInput,
      forceOutput: !!src.forceOutput,
      forceValue: src.forceValue,
      graphEnabled: src.graphEnabled !== false && (type === 'INT' || type === 'REAL' || type === 'PID' || type === 'AVG' || type === 'FLOW'),
      dirty: false,
      alarmLevel: null,
      fb: (() => {
        if (!['TIMER', 'COUNTER', 'PID', 'AVG', 'FLOW'].includes(type)) return src.fb || {};
        const fb = ensureFb(type, src.fb);
        if (type === 'PID') {
          const sp = src.preset != null && src.preset !== '' ? Number(src.preset) : defaultPreset(type);
          fb.sp = sp;
        }
        return fb;
      })(),
    };
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

  replaceAll(tags) {
    if (tags.length > MAX_TAGS) {
      const err = new Error(`Tag limit ${MAX_TAGS} exceeded`);
      err.status = 413;
      throw err;
    }
    const forceState = new Map(this.list().map((t) => [t.id, {
      forceInput: t.forceInput,
      forceOutput: t.forceOutput,
      forceValue: t.forceValue,
      value: t.value,
    }]));
    this.tags.clear();
    const normalized = [];
    for (const raw of tags) {
      const prev = forceState.get(raw.id);
      const merged = prev ? {
        ...raw,
        forceInput: prev.forceInput,
        forceOutput: prev.forceOutput,
        forceValue: prev.forceValue,
        value: (prev.forceInput || prev.forceOutput) ? (prev.forceValue ?? prev.value) : raw.value,
      } : raw;
      normalized.push(this._normalize(merged, { siblingTags: normalized }));
    }
    for (const t of normalized) this.tags.set(t.id, t);
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
    t.value = value;
    t.quality = quality;
    this._refreshAlarmLevel(t);
    return true;
  }

  markDirty(id) {
    const t = this.tags.get(id);
    if (t && (t.role === 'output' || t.role === 'memory')) {
      t.dirty = true;
    }
  }

  clearDirty() {
    for (const t of this.tags.values()) t.dirty = false;
  }

  liveSnapshot() {
    return this.list().map((t) => ({
      tagId: t.id,
      value: t.value,
      quality: t.quality,
      type: t.type,
      wordWidth: t.wordWidth,
      arrayLen: t.arrayLen > 1 ? t.arrayLen : undefined,
      preset: t.preset,
      mode: t.mode,
      fb: (t.type === 'TIMER' || t.type === 'COUNTER' || t.type === 'PID' || t.type === 'AVG' || t.type === 'FLOW')
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
      scale: t.scale,
      offset: t.offset,
      alarmsEnabled: t.alarmsEnabled,
      alarmCondition: t.alarmCondition,
      alarmLevel: t.alarmLevel,
      alarmAcked: this._alarmAnnunc.get(t.id)?.acked ?? false,
      alarmSince: this._alarmAnnunc.get(t.id)?.since ?? null,
      ts: Date.now(),
    }));
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
      t.value = t.forceValue ?? t.value;
      if (t.forceOutput) this.markDirty(id);
    }
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
    this.save();
    return t;
  }

  applyForcesAfterRead() {
    for (const t of this.tags.values()) {
      if (t.forceInput) {
        t.value = t.forceValue ?? t.value;
        t.quality = QUALITY.GOOD;
        this._refreshAlarmLevel(t);
      }
    }
  }

  applyForcesAfterLogic() {
    for (const t of this.tags.values()) {
      if (t.forceOutput) {
        t.value = t.forceValue ?? t.value;
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
