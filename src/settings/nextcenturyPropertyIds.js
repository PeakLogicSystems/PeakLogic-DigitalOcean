'use strict';

/** Live NC portal properties for Ace Septic / ALF commissioning (see nextcentury-map.js). */
const COMMISSIONING_PROPERTY_IDS = [39990, 40074];

/** Synthetic villa placeholders from facility-config — not valid NC portal IDs. */
const PLACEHOLDER_BASE = 40100;

function normalizeIdList(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

function isPlaceholderNcPropertyIds(ids) {
  const list = normalizeIdList(ids);
  if (!list.length) return false;
  return list.every((id) => id >= PLACEHOLDER_BASE && id < PLACEHOLDER_BASE + 100);
}

/** Map placeholder or empty lists to commissioning IDs; pass through real configured IDs. */
function resolveNextcenturyPropertyIds(ids) {
  const configured = normalizeIdList(ids);
  if (!configured.length) return [];
  if (isPlaceholderNcPropertyIds(configured)) return [...COMMISSIONING_PROPERTY_IDS];
  return configured;
}

function propertyIdListsEqual(a, b) {
  const left = normalizeIdList(a);
  const right = normalizeIdList(b);
  return left.length === right.length && left.every((n, i) => n === right[i]);
}

module.exports = {
  COMMISSIONING_PROPERTY_IDS,
  PLACEHOLDER_BASE,
  normalizeIdList,
  isPlaceholderNcPropertyIds,
  resolveNextcenturyPropertyIds,
  propertyIdListsEqual,
};
