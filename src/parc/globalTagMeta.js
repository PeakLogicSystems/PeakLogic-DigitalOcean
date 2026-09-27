'use strict';

/** Global P2P tag type aliases (tag store + ST bytecode META_GLOBAL). */
const GLOBAL_TYPE_ALIASES = {
  GLOBAL_BOOL: 'BOOL',
  GLOBAL_INT: 'INT',
  GLOBAL_REAL: 'REAL',
  GB: 'BOOL',
  GI: 'INT',
  GR: 'REAL',
};

function normalizeGlobalType(type) {
  const t = String(type || '').trim().toUpperCase();
  return GLOBAL_TYPE_ALIASES[t] || null;
}

function isGlobalTagMeta(tag) {
  if (!tag || tag.global === true) return true;
  const t = String(tag.type || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(GLOBAL_TYPE_ALIASES, t);
}

/** Base BOOL/INT/REAL for bytecode header (META_GLOBAL carries scope). */
function globalBaseType(tag) {
  const t = String(tag?.type || '').trim().toUpperCase();
  const fromAlias = normalizeGlobalType(t);
  if (fromAlias) return fromAlias;
  if (tag?.global === true) return t || 'BOOL';
  return null;
}

function tagMetaWithGlobal(tag) {
  if (!tag || !isGlobalTagMeta(tag)) return tag;
  const base = globalBaseType(tag) || 'BOOL';
  return { ...tag, type: base, global: true };
}

module.exports = {
  GLOBAL_TYPE_ALIASES,
  normalizeGlobalType,
  isGlobalTagMeta,
  globalBaseType,
  tagMetaWithGlobal,
};
