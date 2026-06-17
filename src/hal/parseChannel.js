'use strict';

const { HAL_KINDS, HAL_PIN_PREFIX } = require('./halTypes');

const PIN_RE = /^(DI|DO|AI|AO|CNT)(\d+)$/i;

/** @returns {{ kind: string, index: number, field?: string } | null} */
function parseHalAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;

  if (addr.pin) {
    const m = String(addr.pin).trim().match(PIN_RE);
    if (!m) return null;
    const prefix = m[1].toLowerCase();
    const normalized = prefix === 'di' ? HAL_KINDS.DI
      : prefix === 'do' ? HAL_KINDS.DO
        : prefix === 'ai' ? HAL_KINDS.AI
          : prefix === 'ao' ? HAL_KINDS.AO
            : HAL_KINDS.CNT;
    return {
      kind: normalized,
      index: parseInt(m[2], 10),
      field: addr.field || (normalized === HAL_KINDS.CNT ? 'count' : undefined),
    };
  }

  if (addr.kind != null && addr.index != null) {
    const k = String(addr.kind).toLowerCase();
    if (!Object.values(HAL_KINDS).includes(k)) return null;
    return {
      kind: k,
      index: parseInt(addr.index, 10),
      field: addr.field,
    };
  }

  return null;
}

function formatPin(kind, index) {
  const prefix = HAL_PIN_PREFIX[kind] || kind.toUpperCase();
  return `${prefix}${index}`;
}

function isReadable(kind) {
  return kind === HAL_KINDS.DI || kind === HAL_KINDS.AI || kind === HAL_KINDS.CNT;
}

function isWritable(kind) {
  return kind === HAL_KINDS.DO || kind === HAL_KINDS.AO;
}

module.exports = {
  parseHalAddress,
  formatPin,
  isReadable,
  isWritable,
};
