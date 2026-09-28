'use strict';

/** SVG lamp suffix -> [room tag suffix, on color]. */
const ROOM_LAMP_MAP = {
  lamp_ac_pan: ['AC_PAN_LEAK', '#ef4444'],
  lamp_ac_blower: ['AC_BLOWER_FLT', '#ef4444'],
  lamp_bath_mid: ['BATH_MID_LEAK', '#ef4444'],
  lamp_toilet: ['TOILET_LEAK', '#ef4444'],
  lamp_stove_on: ['STOVE_ON', '#f59e0b'],
  lamp_stove_excess: ['STOVE_EXCESS', '#ef4444'],
  lamp_cond_fan: ['AC_COND_FAN_FLT', '#ef4444'],
  lamp_cond_comp: ['AC_COMP_FLT', '#ef4444'],
  lamp_cond_alm: ['AC_FAIL_ALM', '#ef4444'],
  lamp_room_alm: ['ALM', '#ef4444'],
};

const ROOM_TEXT_MAP = {
  val_liv_temp: ['LIV_TEMP', 'fixed1'],
  val_bed_temp: ['BED_TEMP', 'fixed1'],
  val_cond_hi: ['AC_HI', 'fixed1'],
  val_cond_lo: ['AC_LO', 'fixed1'],
};

const ROOM_LAMP_OFF = '#64748b';

const ROOM_TAG_SUFFIXES = new Set([
  ...Object.values(ROOM_LAMP_MAP).map((v) => v[0]),
  ...Object.values(ROOM_TEXT_MAP).map((v) => v[0]),
  'ANY_ALM',
]);

function roomDetailElementId(col, row, z, suffix) {
  return `t${col + 1}_${row + 1}_z${z}__${suffix}`;
}

function roomDetailTile(screen) {
  for (const tile of screen?.tiles || []) {
    for (const layer of tile.layers || []) {
      const svg = String(layer.svg || '');
      if (/room_detail\.svg$/i.test(svg)) {
        return {
          col: Number(tile.col) || 0,
          row: Number(tile.row) || 0,
          z: Number(layer.z) || 0,
        };
      }
    }
  }
  return null;
}

function roomNumFromScreen(screen) {
  const src = `${screen?.id || ''} ${screen?.name || ''} ${screen?.title || ''}`;
  const d = /(?:screen_rm_|rm[_\s]*)?(\d{2,4})/i.exec(src);
  if (!d) return null;
  const n = Number(d[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function roomPrefixFromNum(roomNum) {
  return `RM${String(roomNum).padStart(3, '0')}`;
}

function roomPrefixFromScreen(screen, bindings = []) {
  for (const b of bindings) {
    if (b.screenId !== screen?.id) continue;
    const m = /^([A-Za-z]+\d+)_(.+)$/.exec(String(b.tagId || ''));
    if (m && ROOM_TAG_SUFFIXES.has(m[2])) return m[1].toUpperCase();
  }
  const n = roomNumFromScreen(screen);
  return n ? roomPrefixFromNum(n) : null;
}

function parseRoomTag(tagId) {
  const m = /^([A-Za-z]+\d+)_(.+)$/.exec(String(tagId || '').trim());
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const suffix = m[2].toUpperCase();
  let lampSuffix = null;
  for (const [el, [tagSuffix]] of Object.entries(ROOM_LAMP_MAP)) {
    if (tagSuffix.toUpperCase() === suffix) {
      lampSuffix = el;
      break;
    }
  }
  let textSuffix = null;
  let textFormat = null;
  for (const [el, [tagSuffix, format]] of Object.entries(ROOM_TEXT_MAP)) {
    if (tagSuffix.toUpperCase() === suffix) {
      textSuffix = el;
      textFormat = format;
      break;
    }
  }
  const roomNum = Number(String(prefix).replace(/^RM/i, ''));
  return {
    prefix,
    suffix,
    roomNum: Number.isFinite(roomNum) && roomNum > 0 ? roomNum : null,
    lampSuffix,
    textSuffix,
    textFormat,
  };
}

function listRoomDetailScreens(screens, bindings = []) {
  const out = [];
  for (const screen of screens || []) {
    const tile = roomDetailTile(screen);
    if (!tile) continue;
    const roomNum = roomNumFromScreen(screen);
    const prefix = roomPrefixFromScreen(screen, bindings);
    out.push({
      screenId: screen.id,
      name: screen.name || screen.title || screen.id,
      roomNum,
      prefix,
      tileCol: tile.col,
      tileRow: tile.row,
      tileZ: tile.z,
    });
  }
  out.sort((a, b) => {
    if (a.roomNum != null && b.roomNum != null) return a.roomNum - b.roomNum;
    return String(a.screenId).localeCompare(String(b.screenId));
  });
  return out;
}

function roomLampRoles() {
  return Object.entries(ROOM_LAMP_MAP).map(([elementSuffix, [tagSuffix, onColor]]) => ({
    elementSuffix,
    tagSuffix,
    onColor,
    label: tagSuffix.replace(/_/g, ' ').toLowerCase(),
  }));
}

function buildRoomDetailBinding({ screen, tagId, elementSuffix, property = 'fill' }) {
  const tile = roomDetailTile(screen);
  if (!tile) return { error: 'Screen has no room_detail.svg tile' };
  const parsed = parseRoomTag(tagId);
  if (!parsed) return { error: 'Tag is not a room semantic tag (expected RM###_SUFFIX)' };

  let suffix = elementSuffix;
  let prop = property;
  let format;
  let onValue;
  let offValue;

  if (!suffix && parsed.lampSuffix) {
    suffix = parsed.lampSuffix;
    prop = 'fill';
  } else if (!suffix && parsed.textSuffix) {
    suffix = parsed.textSuffix;
    prop = 'text';
    format = parsed.textFormat;
  }
  if (!suffix) return { error: 'Unknown room tag suffix — pick a lamp role' };

  if (prop === 'fill') {
    const lamp = ROOM_LAMP_MAP[suffix];
    if (!lamp) return { error: `Unknown lamp element: ${suffix}` };
    onValue = lamp[1];
    offValue = ROOM_LAMP_OFF;
  } else if (prop === 'text') {
    const text = ROOM_TEXT_MAP[suffix];
    if (text) format = text[1];
  }

  const binding = {
    screenId: screen.id,
    elementId: roomDetailElementId(tile.col, tile.row, tile.z, suffix),
    tagId: String(tagId).trim(),
    property: prop,
  };
  if (onValue) binding.onValue = onValue;
  if (offValue) binding.offValue = offValue;
  if (format) binding.format = format;
  return { binding };
}

function upsertBinding(bindings, binding) {
  const list = Array.isArray(bindings) ? bindings : [];
  const idx = list.findIndex(
    (b) => b.screenId === binding.screenId
      && b.elementId === binding.elementId
      && b.property === binding.property,
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...binding };
    return { bindings: list, replaced: true };
  }
  return { bindings: [...list, binding], replaced: false };
}

module.exports = {
  ROOM_LAMP_MAP,
  ROOM_TEXT_MAP,
  ROOM_LAMP_OFF,
  roomDetailElementId,
  roomDetailTile,
  roomNumFromScreen,
  roomPrefixFromNum,
  roomPrefixFromScreen,
  parseRoomTag,
  listRoomDetailScreens,
  roomLampRoles,
  buildRoomDetailBinding,
  upsertBinding,
};
