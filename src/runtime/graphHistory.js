'use strict';

const { isGraphableTag, numericTagValue } = require('../tags/graphableTags');

const DEFAULT_MAX = 600;

class GraphHistory {
  constructor(maxPoints = DEFAULT_MAX) {
    this.maxPoints = maxPoints;
    this.buffers = new Map();
  }

  setMaxPoints(n) {
    this.maxPoints = n;
    for (const buf of this.buffers.values()) {
      while (buf.length > this.maxPoints) buf.shift();
    }
  }

  isGraphable(tag) {
    return isGraphableTag(tag);
  }

  record(tags) {
    const ts = Date.now();
    for (const t of tags) {
      if (!this.isGraphable(t)) continue;
      if (!this.buffers.has(t.id)) this.buffers.set(t.id, []);
      const buf = this.buffers.get(t.id);
      buf.push({ ts, value: numericTagValue(t), wordWidth: t.wordWidth || 16 });
      if (buf.length > this.maxPoints) buf.shift();
    }
  }

  getHistory(tagIds, limit) {
    const lim = Math.min(limit || this.maxPoints, this.maxPoints);
    const out = {};
    const ids = tagIds?.length ? tagIds : [...this.buffers.keys()];
    for (const id of ids) {
      const buf = this.buffers.get(id);
      if (!buf) { out[id] = []; continue; }
      out[id] = buf.slice(-lim);
    }
    return out;
  }

  clear(tagId) {
    if (tagId) this.buffers.delete(tagId);
    else this.buffers.clear();
  }
}

module.exports = { GraphHistory };
