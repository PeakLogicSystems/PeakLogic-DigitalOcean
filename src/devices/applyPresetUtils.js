'use strict';

function busKey(driver) {
  if (!driver) return '';
  if (driver.type === 'modbus_tcp') {
    return `tcp:${driver.host || '127.0.0.1'}:${driver.port ?? 502}`;
  }
  if (driver.type === 'modbus_rtu' || driver.type === 'vgreen_epc') {
    return `rtu:${String(driver.serialPort || '').toUpperCase()}`;
  }
  return '';
}

function driversOnBus(driverList, key) {
  if (!key) return [];
  return driverList.filter((d) => busKey(d) === key);
}

function slavesInUseOnBus(driverList, tagList, key) {
  const onBus = new Set(driversOnBus(driverList, key).map((d) => d.id));
  const slaves = new Set();
  for (const t of tagList) {
    if (!onBus.has(t.driverId)) continue;
    const s = t.driverAddress?.slaveId;
    if (s != null && Number.isFinite(Number(s))) slaves.add(Number(s));
  }
  for (const d of driversOnBus(driverList, key)) {
    if (d.slaveId != null && Number.isFinite(Number(d.slaveId))) slaves.add(Number(d.slaveId));
  }
  return slaves;
}

function nextSlaveId(driverList, tagList, driver, fallback = 1) {
  const key = busKey(driver);
  const used = slavesInUseOnBus(driverList, tagList, key);
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : 1;
  if (!used.size) return base;
  return Math.max(...used) + 1;
}

/** Parse DI1, Q3, I1_RAW, HM2, etc. */
function parseChannelTag(id) {
  const m = /^(DI|Q|AI|AO|H|I|R|HM)(\d+)(.*)$/i.exec(String(id || ''));
  if (!m) return null;
  let prefix = m[1].toUpperCase();
  if (prefix === 'DI') prefix = 'DI';
  const channel = parseInt(m[2], 10);
  if (!Number.isFinite(channel) || channel < 1) return null;
  return { prefix, channel, suffix: m[3] || '' };
}

function tagFamilyKey(parsed) {
  return `${parsed.prefix}${parsed.suffix}`;
}

function formatChannelTag(parsed, channel) {
  return `${parsed.prefix}${channel}${parsed.suffix}`;
}

function maxChannelForFamily(tagList, driverId, familyKey) {
  let max = 0;
  for (const t of tagList) {
    if (t.driverId !== driverId) continue;
    const p = parseChannelTag(t.id);
    if (!p || tagFamilyKey(p) !== familyKey) continue;
    max = Math.max(max, p.channel);
  }
  return max;
}

/**
 * Append template tags onto a driver: DI/Q/… numbers continue from existing
 * (two 16-point modules → DI1–DI32). Each tag gets slaveId on driverAddress.
 */
function offsetTagsForDriver(tags, driverId, tagList, slaveId) {
  const n = Number(slaveId) || 1;
  const familyOffset = new Map();
  return tags.map((t) => {
    const parsed = parseChannelTag(t.id);
    if (!parsed) {
      return {
        ...t,
        driverAddress: { ...(t.driverAddress || {}), slaveId: n },
      };
    }
    const family = tagFamilyKey(parsed);
    if (!familyOffset.has(family)) {
      familyOffset.set(family, maxChannelForFamily(tagList, driverId, family));
    }
    const base = familyOffset.get(family);
    const channel = base + parsed.channel;
    return {
      ...t,
      id: formatChannelTag(parsed, channel),
      driverAddress: { ...(t.driverAddress || {}), slaveId: n },
    };
  });
}

/** Highest PARMn index already mapped on a driver (0 if none). */
function maxConcubeParamIndex(tagList, driverId) {
  let max = 0;
  for (const t of tagList) {
    if (t.driverId !== driverId) continue;
    const m = /^PARM(\d+)_(?:STS|VAL)$/.exec(String(t.id || ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

function hasConcubeSystemTags(tagList, driverId) {
  return tagList.some((t) => t.driverId === driverId && t.id === 'CUBE_DEV_STATUS');
}

/**
 * Build apply options for con::cube templates (groups of 4 parameters).
 * @returns {{ paramGroups?: number, paramStart: number, paramCount: number, includeSystemTags: boolean }}
 */
function concubeApplyOptions(preset, tagList, driverId, replaceTags, paramGroupsReq) {
  const perGroup = preset?.concube?.paramsPerGroup ?? 4;
  const groups = Math.max(1, Math.min(16, Number(paramGroupsReq) || preset?.concube?.defaultGroups || 1));
  let paramCount = groups * perGroup;
  if (replaceTags) {
    return {
      paramGroups: groups,
      paramStart: 1,
      paramCount,
      includeSystemTags: true,
    };
  }
  const maxParm = maxConcubeParamIndex(tagList, driverId);
  const paramStart = maxParm + 1;
  if (paramStart > 64) {
    return { error: 'All 64 con::cube parameter slots are already mapped on this driver' };
  }
  if (paramStart + paramCount - 1 > 64) {
    paramCount = 64 - paramStart + 1;
  }
  return {
    paramGroups: groups,
    paramStart,
    paramCount,
    includeSystemTags: maxParm === 0 && !hasConcubeSystemTags(tagList, driverId),
  };
}

module.exports = {
  busKey,
  driversOnBus,
  slavesInUseOnBus,
  nextSlaveId,
  parseChannelTag,
  maxChannelForFamily,
  offsetTagsForDriver,
  maxConcubeParamIndex,
  hasConcubeSystemTags,
  concubeApplyOptions,
};
