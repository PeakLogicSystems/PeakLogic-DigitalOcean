'use strict';

/** @returns {boolean} */
function isArrayTag(tag) {
  return Number(tag?.arrayLen) > 1;
}

function arrayLength(tag) {
  const n = Number(tag?.arrayLen);
  return n > 1 ? Math.min(n, 125) : 1;
}

function wordsPerElement(tag) {
  const ww = tag?.driverAddress?.wordWidth || tag?.wordWidth || 16;
  return ww > 16 ? 2 : 1;
}

/** Modbus register span for one array tag. */
function modbusRegSpan(tag) {
  if (tag?.type === 'BOOL') return 1;
  return arrayLength(tag) * wordsPerElement(tag);
}

function defaultArrayValue(tag) {
  const len = arrayLength(tag);
  if (len <= 1) return tag?.type === 'BOOL' ? false : 0;
  return Array.from({ length: len }, () => (tag?.type === 'BOOL' ? false : 0));
}

function normalizeArrayValue(tag, raw) {
  const len = arrayLength(tag);
  if (len <= 1) {
    if (Array.isArray(raw)) return raw.length ? raw[0] : (tag?.type === 'BOOL' ? false : 0);
    return raw;
  }
  const out = defaultArrayValue(tag);
  const src = Array.isArray(raw) ? raw : [raw];
  for (let i = 0; i < len; i++) {
    const v = src[i];
    if (v == null) continue;
    out[i] = tag?.type === 'BOOL' ? !!v : (tag?.type === 'INT' ? Math.trunc(Number(v)) : Number(v));
  }
  return out;
}

function getArrayElement(tag, index) {
  const i = Math.trunc(Number(index));
  if (!isArrayTag(tag)) return tag?.value ?? 0;
  const arr = normalizeArrayValue(tag, tag.value);
  if (i < 0 || i >= arr.length) return 0;
  return arr[i];
}

function setArrayElement(tag, index, value) {
  const i = Math.trunc(Number(index));
  if (!isArrayTag(tag)) {
    tag.value = tag?.type === 'BOOL' ? !!value : (tag?.type === 'INT' ? Math.trunc(Number(value)) : Number(value));
    return tag.value;
  }
  const arr = normalizeArrayValue(tag, tag.value);
  if (i < 0 || i >= arr.length) return arr;
  arr[i] = tag?.type === 'BOOL' ? !!value : (tag?.type === 'INT' ? Math.trunc(Number(value)) : Number(value));
  tag.value = arr;
  return arr[i];
}

/** Split one 32-bit signed value into two Modbus registers (big-endian word order). */
function splitDint32(raw, signed = true) {
  let v = Math.trunc(Number(raw));
  if (signed && v > 0x7fffffff) v = 0x7fffffff;
  if (signed && v < -0x80000000) v = -0x80000000;
  const u = signed && v < 0 ? v + 0x100000000 : v;
  return [(u >> 16) & 0xffff, u & 0xffff];
}

/** Combine register slice into 32-bit int. */
function combineDint32(data, signed = true) {
  if (!data?.length) return 0;
  if (data.length < 2) {
    let v = data[0] & 0xffff;
    if (signed && v > 0x7fff) v -= 0x10000;
    return v;
  }
  let v = ((data[0] & 0xffff) << 16) | (data[1] & 0xffff);
  if (signed && v > 0x7fffffff) v -= 0x100000000;
  return v;
}

/** Flatten array tag value to Modbus register words (for FC16). */
function arrayToRegisterWords(tag, scaledValues) {
  const vals = Array.isArray(scaledValues) ? scaledValues : normalizeArrayValue(tag, scaledValues);
  const wpe = wordsPerElement(tag);
  const words = [];
  for (const v of vals) {
    if (wpe >= 2) words.push(...splitDint32(v, tag.signed !== false));
    else {
      let w = Math.trunc(Number(v)) & 0xffff;
      if (tag.signed !== false && w > 0x7fff) w -= 0x10000;
      words.push(w & 0xffff);
    }
  }
  return words;
}

/** Decode Modbus register block into array of engineering values. */
function registersToArray(tag, data, scaleFn) {
  const len = arrayLength(tag);
  const wpe = wordsPerElement(tag);
  const out = [];
  for (let i = 0; i < len; i++) {
    const off = i * wpe;
    const slice = data.slice(off, off + wpe);
    let raw = wpe >= 2 ? combineDint32(slice, tag.signed !== false) : slice[0];
    if (tag.signed !== false && wpe < 2 && raw > 0x7fff) raw -= 0x10000;
    out.push(typeof scaleFn === 'function' ? scaleFn(raw, tag) : raw);
  }
  return out;
}

module.exports = {
  isArrayTag,
  arrayLength,
  wordsPerElement,
  modbusRegSpan,
  defaultArrayValue,
  normalizeArrayValue,
  getArrayElement,
  setArrayElement,
  splitDint32,
  combineDint32,
  arrayToRegisterWords,
  registersToArray,
};
