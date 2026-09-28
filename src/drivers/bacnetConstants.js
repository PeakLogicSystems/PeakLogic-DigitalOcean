'use strict';

let Bacnet;
try {
  Bacnet = require('node-bacnet');
} catch {
  Bacnet = null;
}

const COMMON_OBJECT_TYPES = [
  'analogInput', 'analogOutput', 'analogValue',
  'binaryInput', 'binaryOutput', 'binaryValue',
  'multiStateInput', 'multiStateOutput', 'multiStateValue',
  'characterstringValue', 'device',
];

function enumMap() {
  return Bacnet?.enum || {};
}

function resolveObjectType(input) {
  if (input == null || input === '') return null;
  if (Number.isFinite(Number(input))) return Number(input);
  const e = enumMap().ObjectType;
  if (!e) return null;
  const key = String(input).replace(/[\s_-]/g, '').toUpperCase();
  for (const [name, id] of Object.entries(e)) {
    if (name.replace(/_/g, '') === key) return id;
  }
  return null;
}

function resolvePropertyId(input) {
  const e = enumMap().PropertyIdentifier;
  if (!e) return 85;
  if (input == null || input === '') return e.PRESENT_VALUE ?? 85;
  if (Number.isFinite(Number(input))) return Number(input);
  const key = String(input).replace(/[\s_-]/g, '').toUpperCase();
  for (const [name, id] of Object.entries(e)) {
    if (name.replace(/_/g, '') === key) return id;
  }
  return e.PRESENT_VALUE ?? 85;
}

function objectTypeLabel(typeId) {
  const e = enumMap().ObjectType;
  if (!e || typeId == null) return String(typeId ?? '');
  for (const [name, id] of Object.entries(e)) {
    if (id === typeId) {
      return name.charAt(0).toLowerCase() + name.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    }
  }
  return String(typeId);
}

function propertyLabel(propId) {
  const e = enumMap().PropertyIdentifier;
  if (!e || propId == null) return String(propId ?? '');
  for (const [name, id] of Object.entries(e)) {
    if (id === propId) return name;
  }
  return String(propId);
}

function normalizeTagAddress(raw) {
  const a = raw && typeof raw === 'object' ? { ...raw } : {};
  const objectType = resolveObjectType(a.objectType ?? a.type);
  const objectInstance = Number(a.objectInstance ?? a.instance);
  const property = resolvePropertyId(a.property ?? a.propertyId ?? 'presentValue');
  const deviceInstance = Number(a.deviceInstance ?? a.deviceId);
  const host = String(a.host || a.ip || '').trim();
  const out = {
    host,
    deviceInstance: Number.isFinite(deviceInstance) ? deviceInstance : null,
    objectType,
    objectInstance: Number.isFinite(objectInstance) ? objectInstance : null,
    property,
    propertyLabel: propertyLabel(property),
    objectTypeLabel: objectType != null ? objectTypeLabel(objectType) : '',
  };
  if (a.priority != null && Number.isFinite(Number(a.priority))) {
    out.priority = Number(a.priority);
  }
  return out;
}

function parsePresentValue(res) {
  const list = res?.values;
  if (!list?.length) return { ok: false, error: 'empty response' };
  const cell = list[0];
  let raw = cell;
  if (cell && cell.type != null && cell.value !== undefined) {
    raw = cell;
  } else if (cell?.value != null && typeof cell.value === 'object' && cell.value.type != null) {
    raw = cell.value;
  }
  if (raw == null) return { ok: false, error: 'no value' };
  if (typeof raw !== 'object' || raw.type == null) {
    return { ok: true, value: raw };
  }
  const appTag = enumMap().ApplicationTag || {};
  const type = raw.type;
  const val = raw.value;
  if (type === appTag.NULL) return { ok: true, value: null };
  if (type === appTag.BOOLEAN) return { ok: true, value: !!val };
  if (type === appTag.UNSIGNED_INTEGER || type === appTag.SIGNED_INTEGER
    || type === appTag.REAL || type === appTag.DOUBLE) {
    return { ok: true, value: Number(val) };
  }
  if (type === appTag.ENUMERATED) return { ok: true, value: Number(val) };
  if (type === appTag.CHARACTER_STRING) return { ok: true, value: String(val) };
  if (val != null && typeof val === 'object' && val.value != null) {
    return { ok: true, value: val.value };
  }
  return { ok: true, value: val };
}

function coerceForTag(parsed, tagType) {
  const t = String(tagType || 'REAL').toUpperCase();
  let v = parsed.value;
  if (v == null) return t === 'BOOL' ? false : 0;
  if (t === 'BOOL') {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return /^(1|true|active|on)$/i.test(v.trim());
    return !!v;
  }
  if (t === 'INT') return Math.trunc(Number(v));
  return Number(v);
}

function encodeWriteValue(tagType, value) {
  const appTag = enumMap().ApplicationTag || {};
  const t = String(tagType || 'REAL').toUpperCase();
  if (t === 'BOOL') {
    return [{ type: appTag.BOOLEAN, value: !!value }];
  }
  if (t === 'INT') {
    const n = Math.trunc(Number(value));
    return [{ type: n >= 0 ? appTag.UNSIGNED_INTEGER : appTag.SIGNED_INTEGER, value: n }];
  }
  return [{ type: appTag.REAL, value: Number(value) }];
}

function suggestTagType(objectTypeId) {
  const e = enumMap().ObjectType;
  if (!e || objectTypeId == null) return 'REAL';
  if ([e.BINARY_INPUT, e.BINARY_OUTPUT, e.BINARY_VALUE].includes(objectTypeId)) return 'BOOL';
  if ([e.MULTI_STATE_INPUT, e.MULTI_STATE_OUTPUT, e.MULTI_STATE_VALUE].includes(objectTypeId)) return 'INT';
  return 'REAL';
}

function tagIdForPoint(deviceInstance, objectTypeId, objectInstance, propertyId) {
  const ot = objectTypeLabel(objectTypeId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || `OT${objectTypeId}`;
  const prop = propertyId === 85 ? 'PV' : `P${propertyId}`;
  return `BAC_${deviceInstance}_${ot}${objectInstance}_${prop}`;
}

function senderHost(sender) {
  if (!sender) return '';
  if (typeof sender === 'string') return sender;
  return String(sender.address || sender.ip || '').trim();
}

module.exports = {
  Bacnet,
  COMMON_OBJECT_TYPES,
  resolveObjectType,
  resolvePropertyId,
  objectTypeLabel,
  propertyLabel,
  normalizeTagAddress,
  parsePresentValue,
  coerceForTag,
  encodeWriteValue,
  suggestTagType,
  tagIdForPoint,
  senderHost,
};
