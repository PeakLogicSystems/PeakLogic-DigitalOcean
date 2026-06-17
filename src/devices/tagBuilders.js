'use strict';

function diTags(driverId, count = 8, prefix = 'DI', start = 0) {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = `${prefix}${i + 1}`;
    tags.push({
      id: n,
      type: 'BOOL',
      role: 'input',
      value: false,
      driverId,
      driverAddress: { table: 'discrete', address: start + i },
    });
  }
  return tags;
}

function doTags(driverId, count = 8, prefix = 'Q', start = 0) {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = `${prefix}${i + 1}`;
    tags.push({
      id: n,
      type: 'BOOL',
      role: 'output',
      value: false,
      driverId,
      driverAddress: { table: 'coil', address: start + i },
    });
  }
  return tags;
}

function holdingRegTags(driverId, count, startAddr = 0, idPrefix = 'H') {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = count <= 8 ? `${idPrefix}${i + 1}` : `${idPrefix}${String(i + 1).padStart(2, '0')}`;
    tags.push({
      id: n,
      type: 'INT',
      role: 'memory',
      value: 0,
      wordWidth: 16,
      signed: false,
      driverId,
      driverAddress: { table: 'holding', address: startAddr + i },
    });
  }
  return tags;
}

function inputRegTags(driverId, count, startAddr, idPrefix, idSuffix = '') {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = count <= 8
      ? `${idPrefix}${i + 1}${idSuffix}`
      : `${idPrefix}${String(i + 1).padStart(2, '0')}${idSuffix}`;
    tags.push({
      id: n,
      type: 'INT',
      role: 'input',
      value: 0,
      wordWidth: 16,
      signed: false,
      driverId,
      driverAddress: { table: 'input', address: startAddr + i },
    });
  }
  return tags;
}

/** Explicit Modbus tags from template JSON (non-uniform addresses / REAL float32). */
function explicitModbusTags(driverId, list) {
  if (!Array.isArray(list)) return [];
  return list.map((spec) => {
    const type = spec.type || 'INT';
    const table = spec.table || 'input';
    const wordWidth = spec.wordWidth ?? (type === 'REAL' ? 32 : 16);
    const addr = {
      table,
      address: Number(spec.address) || 0,
    };
    if (spec.slaveId != null) addr.slaveId = Number(spec.slaveId);
    if (spec.encoding) addr.encoding = spec.encoding;
    if (spec.byteOrder) addr.byteOrder = spec.byteOrder;
    if (wordWidth > 16) addr.wordWidth = wordWidth;
    return {
      id: spec.id,
      type,
      role: spec.role || (table === 'holding' ? 'memory' : 'input'),
      value: spec.value ?? (type === 'BOOL' ? false : 0),
      wordWidth,
      signed: spec.signed !== false,
      scale: spec.scale ?? 1,
      offset: spec.offset ?? 0,
      driverId,
      driverAddress: addr,
      graphEnabled: spec.graphEnabled !== false && (type === 'INT' || type === 'REAL'),
    };
  });
}

function halDiTags(driverId, count = 8, prefix = 'DI') {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = `${prefix}${i + 1}`;
    tags.push({
      id: n,
      type: 'BOOL',
      role: 'input',
      value: false,
      driverId,
      driverAddress: { pin: `DI${i}` },
    });
  }
  return tags;
}

function halDoTags(driverId, count = 8, prefix = 'Q') {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = `${prefix}${i + 1}`;
    tags.push({
      id: n,
      type: 'BOOL',
      role: 'output',
      value: false,
      driverId,
      driverAddress: { pin: `DO${i}` },
    });
  }
  return tags;
}

function halAiTags(driverId, count = 4, prefix = 'AI', startIndex = 0) {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = `${prefix}${i + 1}`;
    tags.push({
      id: n,
      type: 'INT',
      role: 'input',
      value: 0,
      wordWidth: 16,
      signed: true,
      driverId,
      driverAddress: { pin: `AI${startIndex + i}` },
    });
  }
  return tags;
}

function halAoTags(driverId, count = 2, prefix = 'AO', startIndex = 0) {
  const tags = [];
  for (let i = 0; i < count; i++) {
    const n = `${prefix}${i + 1}`;
    tags.push({
      id: n,
      type: 'REAL',
      role: 'output',
      value: 0,
      driverId,
      driverAddress: { pin: `AO${startIndex + i}` },
    });
  }
  return tags;
}

/** Hardware pulse counters (distinct from ST COUNTER function-block tags). */
/** Modbus holding block: N consecutive 32-bit INT values (FC3 read / FC16 write). */
function modbusDintArrayTags(driverId, count, startAddr = 0, idPrefix = 'DINT') {
  const tags = [];
  const n = Math.max(1, Math.min(62, count || 1));
  if (n <= 1) {
    tags.push({
      id: idPrefix,
      type: 'INT',
      role: 'memory',
      value: 0,
      wordWidth: 32,
      signed: true,
      driverId,
      driverAddress: { table: 'holding', address: startAddr, wordWidth: 32 },
    });
    return tags;
  }
  tags.push({
    id: `${idPrefix}_ARR`,
    type: 'INT',
    role: 'memory',
    value: Array.from({ length: n }, () => 0),
    wordWidth: 32,
    signed: true,
    arrayLen: n,
    driverId,
    driverAddress: { table: 'holding', address: startAddr, wordWidth: 32 },
  });
  return tags;
}

function halCntTags(driverId, count = 2, prefix = 'HWCNT') {
  const tags = [];
  for (let i = 0; i < count; i++) {
    tags.push({
      id: `${prefix}${i + 1}`,
      type: 'INT',
      role: 'input',
      value: 0,
      wordWidth: 32,
      signed: false,
      driverId,
      driverAddress: { pin: `CNT${i}`, field: 'count' },
    });
    tags.push({
      id: `${prefix}${i + 1}_HZ`,
      type: 'REAL',
      role: 'input',
      value: 0,
      driverId,
      driverAddress: { pin: `CNT${i}`, field: 'freq' },
    });
  }
  return tags;
}

module.exports = {
  diTags,
  doTags,
  holdingRegTags,
  inputRegTags,
  explicitModbusTags,
  halDiTags,
  halDoTags,
  halAiTags,
  halAoTags,
  halCntTags,
  modbusDintArrayTags,
};
