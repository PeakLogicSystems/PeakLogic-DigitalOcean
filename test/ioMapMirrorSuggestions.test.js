'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildMirrorSuggestions } = require('../src/api/routes/ioMap');

describe('buildMirrorSuggestions', () => {
  it('maps RM101_AC_PAN_LEAK to NC_FA003A90_LEAK when wired', () => {
    const tags = [
      { id: 'RM101_AC_PAN_LEAK', driverId: '' },
      { id: 'NC_FA003A90_LEAK', driverId: 'nextcentury1' },
    ];
    const out = buildMirrorSuggestions(tags);
    assert.equal(out.RM101_AC_PAN_LEAK, 'NC_FA003A90_LEAK');
  });

  it('omits suggestions when NC mirror is not wired', () => {
    const tags = [{ id: 'RM101_AC_PAN_LEAK', driverId: '' }];
    const out = buildMirrorSuggestions(tags);
    assert.equal(out.RM101_AC_PAN_LEAK, undefined);
  });
});
