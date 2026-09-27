'use strict';

function safeId(name) {
  const s = String(name || '').trim().toLowerCase();
  const id = s
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return id || 'project';
}

module.exports = { safeId };
