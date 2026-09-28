'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  roomDetailElementId,
  parseRoomTag,
  buildRoomDetailBinding,
  listRoomDetailScreens,
} = require('../src/hmi/roomDetailBindings');

describe('roomDetailBindings', () => {
  const roomScreen = {
    id: 'screen_rm_101',
    name: 'Rm 101',
    tiles: [{
      col: 0,
      row: 0,
      layers: [{ z: 0, svg: '/hmi/svg/demos/assisted-living/room_detail.svg' }],
    }],
  };

  it('builds composite element id for room_detail lamps', () => {
    assert.equal(roomDetailElementId(0, 0, 0, 'lamp_ac_pan'), 't1_1_z0__lamp_ac_pan');
  });

  it('parses RM101 leak tag suffix', () => {
    const p = parseRoomTag('RM101_AC_PAN_LEAK');
    assert.equal(p.prefix, 'RM101');
    assert.equal(p.roomNum, 101);
    assert.equal(p.lampSuffix, 'lamp_ac_pan');
  });

  it('creates fill binding for room template', () => {
    const built = buildRoomDetailBinding({
      screen: roomScreen,
      tagId: 'RM101_AC_PAN_LEAK',
    });
    assert.equal(built.error, undefined);
    assert.equal(built.binding.screenId, 'screen_rm_101');
    assert.equal(built.binding.elementId, 't1_1_z0__lamp_ac_pan');
    assert.equal(built.binding.tagId, 'RM101_AC_PAN_LEAK');
    assert.equal(built.binding.property, 'fill');
    assert.equal(built.binding.onValue, '#ef4444');
  });

  it('lists room detail screens', () => {
    const list = listRoomDetailScreens([roomScreen, { id: 'screen_overview', tiles: [] }]);
    assert.equal(list.length, 1);
    assert.equal(list[0].screenId, 'screen_rm_101');
    assert.equal(list[0].roomNum, 101);
  });
});
