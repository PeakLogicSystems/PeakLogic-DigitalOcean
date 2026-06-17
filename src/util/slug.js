'use strict';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isValidSlug(slug) {
  return Boolean(slug) && SLUG_RE.test(slug);
}

module.exports = { normalizeSlug, isValidSlug, SLUG_RE };
