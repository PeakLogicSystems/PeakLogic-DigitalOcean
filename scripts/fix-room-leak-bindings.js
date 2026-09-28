#!/usr/bin/env node
'use strict';

/**
 * Repair resident-room detail HMI bindings so the leak/fault lamps (and A/C
 * temps) actually reflect their tags. The room_detail.svg lamps (lamp_ac_pan,
 * lamp_bath_mid, ...) need a `fill` binding to the room tag; without it the tag
 * can read TRUE while the lamp stays gray. This also removes stale bindings that
 * point at elements the SVG doesn't have (val_pan_leak, val_stove, val_ac_hi,
 * val_ac_lo).
 *
 * Introspects the live config: for every screen whose background tile uses
 * room_detail.svg, it derives the tile position + the room tag prefix (RMxxx)
 * and ensures the correct bindings exist. Only binds to tags that exist.
 *
 * Dry run by default. Run with the server STOPPED:
 *   npm run stop
 *   node scripts/fix-room-leak-bindings.js            # report only
 *   node scripts/fix-room-leak-bindings.js --apply    # write changes
 *   npm start
 */

const fs = require('fs');
const path = require('path');
const configStore = require('../src/configStore');
const { DATA_DIR } = require('../src/config');

const APPLY = process.argv.includes('--apply');

const RED = '#ef4444';
const AMBER = '#f59e0b';
const GRAY = '#64748b';

// SVG lamp element suffix -> room tag suffix (+ lamp on color).
const LAMP_MAP = {
  lamp_ac_pan: ['AC_PAN_LEAK', RED],
  lamp_ac_blower: ['AC_BLOWER_FLT', RED],
  lamp_bath_mid: ['BATH_MID_LEAK', RED],
  lamp_toilet: ['TOILET_LEAK', RED],
  lamp_stove_on: ['STOVE_ON', AMBER],
  lamp_stove_excess: ['STOVE_EXCESS', RED],
  lamp_cond_fan: ['AC_COND_FAN_FLT', RED],
  lamp_cond_comp: ['AC_COMP_FLT', RED],
  lamp_cond_alm: ['AC_FAIL_ALM', RED],
  lamp_room_alm: ['ALM', RED],
};
// SVG value text element suffix -> [room tag suffix, format].
const TEXT_MAP = {
  val_liv_temp: ['LIV_TEMP', 'fixed1'],
  val_bed_temp: ['BED_TEMP', 'fixed1'],
  val_cond_hi: ['AC_HI', 'fixed1'],
  val_cond_lo: ['AC_LO', 'fixed1'],
};
// Bindings that point at elements room_detail.svg does not contain.
const BROKEN_SUFFIXES = new Set(['val_pan_leak', 'val_stove', 'val_ac_hi', 'val_ac_lo']);

function serverLooksRunning() {
  try {
    const pid = Number(fs.readFileSync(path.join(DATA_DIR, 'peaklogic.pid'), 'utf8').trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return pid;
  } catch {
    return false;
  }
}

function suffixOf(elementId) {
  const id = String(elementId || '');
  const i = id.lastIndexOf('__');
  return i >= 0 ? id.slice(i + 2) : id;
}

/** Find the room_detail bg tile on a screen; return { col, row, z } or null. */
function roomDetailTile(screen) {
  for (const tile of screen.tiles || []) {
    for (const layer of tile.layers || []) {
      const svg = String(layer.svg || '');
      if (/room_detail\.svg$/i.test(svg)) {
        return { col: Number(tile.col) || 0, row: Number(tile.row) || 0, z: Number(layer.z) || 0 };
      }
    }
  }
  return null;
}

/** Derive the room tag prefix (e.g. RM101) for a screen. */
function roomPrefix(screen, bindings) {
  // 1) From an existing binding tagId on this screen (most reliable).
  const known = new Set([...Object.values(LAMP_MAP).map((v) => v[0]), ...Object.values(TEXT_MAP).map((v) => v[0]), 'ANY_ALM']);
  for (const b of bindings) {
    if (b.screenId !== screen.id) continue;
    const m = /^([A-Za-z]+\d+)_(.+)$/.exec(String(b.tagId || ''));
    if (m && known.has(m[2])) return m[1].toUpperCase();
  }
  // 2) From the screen id/name digits (screen_rm_101, "Rm 101", ...).
  const src = `${screen.id || ''} ${screen.name || ''} ${screen.title || ''}`;
  const d = /(?:rm[_\s]*)?(\d{2,4})/i.exec(src);
  if (d) return `RM${d[1]}`;
  return null;
}

function elementId(col, row, z, suffix) {
  return `t${col + 1}_${row + 1}_z${z}__${suffix}`;
}

/** Ensure room-detail bindings for one screen. Mutates `bindings`; returns a change log. */
function fixScreen(screen, bindings, tagIds) {
  const tile = roomDetailTile(screen);
  if (!tile) return null;
  const prefix = roomPrefix(screen, bindings);
  if (!prefix) return { screen: screen.id, skipped: 'no room prefix' };

  const added = [];
  const removed = [];
  const has = (eid, prop) => bindings.some(
    (b) => b.screenId === screen.id && b.elementId === eid && b.property === prop,
  );

  const ensureFill = (suffix, tagSuffix, onColor) => {
    const tagId = `${prefix}_${tagSuffix}`;
    if (!tagIds.has(tagId)) return;
    const eid = elementId(tile.col, tile.row, tile.z, suffix);
    if (has(eid, 'fill')) return;
    bindings.push({
      screenId: screen.id, elementId: eid, tagId, property: 'fill', onValue: onColor, offValue: GRAY,
    });
    added.push(`${suffix} -> ${tagId}`);
  };
  const ensureText = (suffix, tagSuffix, format) => {
    const tagId = `${prefix}_${tagSuffix}`;
    if (!tagIds.has(tagId)) return;
    const eid = elementId(tile.col, tile.row, tile.z, suffix);
    if (has(eid, 'text')) return;
    bindings.push({
      screenId: screen.id, elementId: eid, tagId, property: 'text', format,
    });
    added.push(`${suffix} -> ${tagId}`);
  };

  for (const [suffix, [tagSuffix, color]] of Object.entries(LAMP_MAP)) ensureFill(suffix, tagSuffix, color);
  for (const [suffix, [tagSuffix, format]] of Object.entries(TEXT_MAP)) ensureText(suffix, tagSuffix, format);

  // Drop stale bindings that target non-existent SVG elements on this screen.
  for (let i = bindings.length - 1; i >= 0; i -= 1) {
    const b = bindings[i];
    if (b.screenId === screen.id && BROKEN_SUFFIXES.has(suffixOf(b.elementId))) {
      removed.push(`${suffixOf(b.elementId)} (${b.tagId || '?'})`);
      bindings.splice(i, 1);
    }
  }
  return { screen: screen.id, prefix, added, removed };
}

function fixHmi(hmi, tagIds) {
  if (!hmi || !Array.isArray(hmi.screens) || !Array.isArray(hmi.bindings)) return [];
  const logs = [];
  for (const screen of hmi.screens) {
    const res = fixScreen(screen, hmi.bindings, tagIds);
    if (res) logs.push(res);
  }
  return logs;
}

function report(logs) {
  let changes = 0;
  for (const l of logs) {
    if (l.skipped) { console.log(`  ${l.screen}: skipped (${l.skipped})`); continue; }
    if (!l.added.length && !l.removed.length) continue;
    changes += l.added.length + l.removed.length;
    console.log(`  ${l.screen} (${l.prefix}):`);
    for (const a of l.added) console.log(`    + ${a}`);
    for (const r of l.removed) console.log(`    - remove ${r}`);
  }
  if (!changes) console.log('  no changes needed');
  return changes;
}

async function main() {
  const running = serverLooksRunning();
  if (running && APPLY && !process.env.FORCE) {
    console.error(
      `PeakLogic appears to be running (pid ${running}). Stop it first (npm run stop) `
      + 'or re-run with FORCE=1 to override.',
    );
    process.exit(1);
  }

  await configStore.init();
  console.log(APPLY ? '=== APPLY MODE (writing changes) ===' : '=== DRY RUN (no changes) — pass --apply to write ===');

  const tags = configStore.readSync('tags.json', []);
  const tagIds = new Set((Array.isArray(tags) ? tags : []).map((t) => t && t.id).filter(Boolean));

  // Active settings document.
  const settings = configStore.readSync('settings.json', {});
  console.log('settings.json:');
  const changes = settings && settings.hmi ? report(fixHmi(settings.hmi, tagIds)) : (console.log('  no hmi'), 0);
  if (APPLY && changes) {
    configStore.writeSync('settings.json', settings);
    await configStore.flushPending();
    console.log('  settings.json written');
  }

  // Saved project snapshots.
  const projects = configStore.listProjectsSync();
  for (const p of projects) {
    try {
      const doc = await configStore.loadProjectDoc(p.id);
      const hmi = doc && doc.settings && doc.settings.hmi ? doc.settings.hmi : (doc && doc.hmi);
      if (!hmi) continue;
      console.log(`project "${p.id}":`);
      const c = report(fixHmi(hmi, tagIds));
      if (APPLY && c) {
        await configStore.saveProjectDoc(p.id, doc);
        console.log(`  project "${p.id}" written`);
      }
    } catch (e) {
      console.warn(`project "${p.id}": skipped (${e.message})`);
    }
  }

  await configStore.shutdown();
  console.log(APPLY ? '\nDone. Start the server (npm start).' : '\nDry run complete. Re-run with --apply to write.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
