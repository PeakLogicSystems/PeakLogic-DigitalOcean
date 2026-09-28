'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatConsoleTimestamp,
  setConsoleTimezone,
  getConsoleTimezone,
} = require('../src/logger/consoleTimestamp');

describe('consoleTimestamp', () => {
  it('formatConsoleTimestamp uses workspace timezone', () => {
    const prev = getConsoleTimezone();
    try {
      setConsoleTimezone('America/New_York');
      // 2026-06-14 23:42:03.007Z → 19:42:03 EDT
      const d = new Date(Date.UTC(2026, 5, 14, 23, 42, 3, 7));
      assert.equal(formatConsoleTimestamp(d), '2026-06-14 19:42:03.007');
      setConsoleTimezone('UTC');
      assert.equal(formatConsoleTimestamp(d), '2026-06-14 23:42:03.007');
    } finally {
      setConsoleTimezone(prev);
    }
  });
});
