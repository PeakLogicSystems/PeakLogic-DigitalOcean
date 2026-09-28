'use strict';

const { buildFromPreset } = require('../devices/devicePresets');
const { rawToEngineering } = require('../tags/tagAnalog');
const { hexToBuffer } = require('./draginoTelemetry');

function tableToReadFn(table, tagType) {
  if (tagType === 'BOOL') {
    return table === 'coil' ? 'readCoils' : 'readDiscreteInputs';
  }
  return table === 'input' ? 'readInputRegisters' : 'readHoldingRegisters';
}

function readFnToFc(fn) {
  switch (fn) {
    case 'readCoils': return 0x01;
    case 'readDiscreteInputs': return 0x02;
    case 'readHoldingRegisters': return 0x03;
    case 'readInputRegisters': return 0x04;
    default: return 0x03;
  }
}

function regSpanForSpec(spec) {
  const wordWidth = spec.wordWidth ?? (spec.type === 'REAL' ? 32 : 16);
  const enc = spec.encoding || spec.driverAddress?.encoding;
  if (enc === 'float32') return 2;
  return wordWidth > 16 ? 2 : 1;
}

/** Normalize explicit template tag → modbus map row. */
function normalizeMapTag(spec, defaults = {}) {
  const addr = spec.driverAddress || {};
  const table = spec.table || addr.table || (spec.type === 'BOOL' ? 'discrete' : 'holding');
  const address = Number(spec.address ?? addr.address ?? 0);
  const slaveId = Number(spec.slaveId ?? addr.slaveId ?? defaults.slaveId ?? 1);
  const wordWidth = spec.wordWidth ?? addr.wordWidth ?? (spec.type === 'REAL' ? 32 : 16);
  return {
    id: spec.id,
    type: spec.type || 'INT',
    role: spec.role || 'input',
    table,
    address,
    slaveId,
    wordWidth,
    signed: spec.signed !== false,
    scale: spec.scale ?? 1,
    offset: spec.offset ?? 0,
    encoding: spec.encoding || addr.encoding,
    byteOrder: spec.byteOrder || addr.byteOrder || 'BE',
    comment: spec.comment,
  };
}

function groupReadBlocks(mapTags) {
  const groups = new Map();
  for (const tag of mapTags) {
    const fn = tableToReadFn(tag.table, tag.type);
    const key = `${tag.slaveId}|${fn}`;
    if (!groups.has(key)) groups.set(key, { slaveId: tag.slaveId, fn, items: [] });
    groups.get(key).items.push({
      tag,
      address: tag.address,
      regSpan: regSpanForSpec(tag),
    });
  }
  const reads = [];
  for (const g of groups.values()) {
    g.items.sort((a, b) => a.address - b.address);
    let block = null;
    for (const item of g.items) {
      if (!block || item.address > block.end + 1) {
        block = {
          slaveId: g.slaveId,
          fn: g.fn,
          functionCode: readFnToFc(g.fn),
          startRegister: item.address,
          endRegister: item.address + item.regSpan - 1,
          registerCount: item.regSpan,
          items: [item],
        };
        reads.push(block);
      } else {
        block.endRegister = Math.max(block.endRegister, item.address + item.regSpan - 1);
        block.registerCount = block.endRegister - block.startRegister + 1;
        block.items.push(item);
      }
    }
  }
  return reads;
}

function parseModbusResponseFrames(hex) {
  const buf = hexToBuffer(hex);
  if (!buf || buf.length < 5) return [];
  const frames = [];
  let offset = 0;
  while (offset + 4 <= buf.length) {
    const slaveId = buf[offset];
    const fc = buf[offset + 1];
    if (fc !== 0x01 && fc !== 0x02 && fc !== 0x03 && fc !== 0x04) {
      offset += 1;
      continue;
    }
    const byteCount = buf[offset + 2];
    const dataStart = offset + 3;
    const dataEnd = dataStart + byteCount;
    if (byteCount <= 0 || dataEnd > buf.length) break;
    frames.push({
      slaveId,
      functionCode: fc,
      data: buf.subarray(dataStart, dataEnd),
    });
    offset = dataEnd;
  }
  return frames;
}

function decodeFloat32(words, byteOrder = 'BE') {
  if (!words || words.length < 2) return 0;
  const buf = Buffer.alloc(4);
  const be = String(byteOrder).toUpperCase() !== 'LE';
  if (be) {
    buf.writeUInt16BE(words[0] & 0xffff, 0);
    buf.writeUInt16BE(words[1] & 0xffff, 2);
    return buf.readFloatBE(0);
  }
  buf.writeUInt16LE(words[1] & 0xffff, 0);
  buf.writeUInt16LE(words[0] & 0xffff, 2);
  return buf.readFloatLE(0);
}

function combineWords(words, wordWidth, signed) {
  if (wordWidth <= 16 || words.length < 1) {
    let v = words[0] ?? 0;
    if (signed && v > 0x7fff) v -= 0x10000;
    return v;
  }
  let v = ((words[0] & 0xffff) << 16) | (words[1] & 0xffff);
  if (signed && v > 0x7fffffff) v -= 0x100000000;
  return v;
}

function findFrameForRead(frames, read) {
  return frames.find(
    (f) => f.slaveId === read.slaveId && f.functionCode === read.functionCode,
  );
}

function decodeTagsFromModbusMap(payloadHex, modbusMap) {
  if (!modbusMap) return [];
  const reads = modbusMap.reads?.length
    ? modbusMap.reads
    : (modbusMap.tags?.length ? groupReadBlocks(modbusMap.tags) : []);
  if (!reads.length) return [];
  const frames = parseModbusResponseFrames(payloadHex);
  if (!frames.length) return [];
  const out = [];
  for (const read of reads) {
    const frame = findFrameForRead(frames, read);
    if (!frame) continue;
    for (const item of read.items) {
      const tag = item.tag;
      let raw;
      if (tag.type === 'BOOL' && (read.functionCode === 0x01 || read.functionCode === 0x02)) {
        const bitIndex = item.address - read.startRegister;
        const byteIdx = Math.floor(bitIndex / 8);
        const bit = bitIndex % 8;
        if (byteIdx >= frame.data.length) continue;
        raw = (frame.data[byteIdx] >> bit) & 1;
        out.push({
          id: tag.id,
          type: tag.type,
          role: tag.role || 'input',
          value: !!raw,
          quality: 'GOOD',
        });
        continue;
      }
      const offsetWords = item.address - read.startRegister;
      const span = item.regSpan;
      const words = [];
      for (let i = 0; i < span; i += 1) {
        const idx = offsetWords + i;
        if (idx * 2 + 1 >= frame.data.length) break;
        words.push(frame.data.readUInt16BE(idx * 2));
      }
      if (!words.length) continue;
      if (tag.encoding === 'float32') {
        raw = decodeFloat32(words, tag.byteOrder);
      } else if (tag.type === 'BOOL') {
        raw = (words[0] >> (tag.address % 16)) & 1;
      } else {
        raw = combineWords(words, tag.wordWidth, tag.signed);
      }
      let value = raw;
      if (tag.type !== 'BOOL') {
        value = rawToEngineering(raw, tag);
      } else {
        value = !!raw;
      }
      out.push({
        id: tag.id,
        type: tag.type,
        role: tag.role || 'input',
        value,
        quality: 'GOOD',
      });
    }
  }
  return out;
}

function modbusMapFromPreset(presetId, options = {}) {
  const built = buildFromPreset(presetId, options);
  const driver = built.driver || {};
  if (driver.type !== 'modbus_rtu' && driver.type !== 'modbus_tcp') {
    throw Object.assign(
      new Error(`Preset ${presetId} is not Modbus RTU/TCP — use a modbus_rtu device template`),
      { status: 400 },
    );
  }
  const defaults = {
    slaveId: options.slaveId ?? driver.slaveId ?? 1,
    baud: options.baud ?? driver.baud ?? 9600,
    parity: options.parity ?? driver.parity ?? 'none',
    stopBits: options.stopBits ?? driver.stopBits ?? 1,
  };
  const tags = (built.tags || []).map((t) => normalizeMapTag({
    id: t.id,
    type: t.type,
    role: t.role,
    table: t.driverAddress?.table,
    address: t.driverAddress?.address,
    slaveId: t.driverAddress?.slaveId,
    wordWidth: t.wordWidth,
    signed: t.signed,
    scale: t.scale,
    offset: t.offset,
    encoding: t.driverAddress?.encoding,
    byteOrder: t.driverAddress?.byteOrder,
    comment: t.comment,
  }, defaults));
  const reads = groupReadBlocks(tags);
  return {
    presetId,
    presetLabel: built.preset?.label || presetId,
    ...defaults,
    reads,
    tags,
  };
}

function loadDraginoModbusMapForDevice(deviceId) {
  const persistence = require('../persistence');
  const drivers = persistence.readJson('drivers.json', []);
  const row = drivers.find(
    (d) => d && d.enabled !== false && d.type === 'mqtt_parc'
      && String(d.deviceId || '').trim() === String(deviceId || '').trim()
      && d.draginoModbus && Array.isArray(d.draginoModbus.tags) && d.draginoModbus.tags.length,
  );
  return row?.draginoModbus || null;
}

module.exports = {
  normalizeMapTag,
  groupReadBlocks,
  parseModbusResponseFrames,
  decodeTagsFromModbusMap,
  modbusMapFromPreset,
  loadDraginoModbusMapForDevice,
  tableToReadFn,
  readFnToFc,
};
