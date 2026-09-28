'use strict';

/**
 * Official Duplex LS I/O map — Opta + D1608E, matching 36_duplex_lift_station.st
 * and live plant wiring (mv_f2e689fd60d96bab).
 *
 * Floats (D1608E slot 1, +24 V active-high):
 *   X1_I1 HIGH · X1_I2 LEAD · X1_I3 LAG · X1_I4 OFF
 *
 * MCSA / motor PDM (Opta base I1–I6 analog CTs, LIFT6):
 *   I1–I3 → mcsa[] ch 0–2 → PDM pump-1
 *   I4–I6 → mcsa[] ch 3–5 → PDM pump-2
 *   Telemetry tags I{n}_RAW + engineering AI{n} (amps = raw × 0.48828125)
 */

const CT_SCALE_AMPS_PER_RAW = 0.48828125;
const DRIVER_ID = 'arduino_opta_st';

const DUPLEX_LS_FLOAT_MAP = [
  { io: 'X1_I1', lvl: 'LVL_HIGH', label: 'High level float' },
  { io: 'X1_I2', lvl: 'LVL_LEAD', label: 'Lead float' },
  { io: 'X1_I3', lvl: 'LVL_LAG', label: 'Lag float' },
  { io: 'X1_I4', lvl: 'LVL_OFF', label: 'Off float' },
];

const DUPLEX_LS_DI_LABELS = {
  X1_I1: 'High level float',
  X1_I2: 'Lead float',
  X1_I3: 'Lag float',
  X1_I4: 'Off float',
  X1_I5: 'Pump 1 run feedback',
  X1_I6: 'Pump 2 run feedback',
  X1_I7: 'Phase fault',
  X1_I8: 'Gen run',
  X1_I9: 'Gen fuel fault',
  X1_I10: 'Gen fault',
};

const DUPLEX_LS_MCSA_CHANNELS = [
  { ch: 0, terminal: 'I1', rawTag: 'I1_RAW', engTag: 'AI1', assetId: 'pump-1', phase: 'A' },
  { ch: 1, terminal: 'I2', rawTag: 'I2_RAW', engTag: 'AI2', assetId: 'pump-1', phase: 'B' },
  { ch: 2, terminal: 'I3', rawTag: 'I3_RAW', engTag: 'AI3', assetId: 'pump-1', phase: 'C' },
  { ch: 3, terminal: 'I4', rawTag: 'I4_RAW', engTag: 'AI4', assetId: 'pump-2', phase: 'A' },
  { ch: 4, terminal: 'I5', rawTag: 'I5_RAW', engTag: 'AI5', assetId: 'pump-2', phase: 'B' },
  { ch: 5, terminal: 'I6', rawTag: 'I6_RAW', engTag: 'AI6', assetId: 'pump-2', phase: 'C' },
];

const DUPLEX_LS_EXPANSIONS = [
  { slot: 0, type: 2, label: 'AFX00005', present: true, kind: 'D1608E' },
];

function mcsaRawLabel(row) {
  return `MCSA ch${row.ch} CT raw (${row.assetId} Ø${row.phase})`;
}

function mcsaEngLabel(row) {
  return `Motor ${row.assetId === 'pump-1' ? 1 : 2} phase ${row.phase} amps (MCSA ch${row.ch} → PDM ${row.assetId})`;
}

function mcsaTerminalLabel(row) {
  return `${row.terminal} MCSA CT ch${row.ch} (${row.assetId} Ø${row.phase}, digital image)`;
}

function hardwareTag(partial) {
  const type = String(partial.type || 'BOOL').toUpperCase();
  const role = partial.role || 'input';
  return {
    id: partial.id,
    label: partial.label || partial.id,
    type,
    role,
    driverId: partial.driverId === undefined ? DRIVER_ID : partial.driverId,
    driverAddress: partial.driverAddress || { channel: partial.channel || partial.id },
    value: partial.value ?? (type === 'BOOL' ? false : 0),
    default: partial.default ?? (type === 'BOOL' ? false : 0),
    scale: partial.scale ?? 1,
    offset: partial.offset ?? 0,
    readonly: partial.readonly != null ? !!partial.readonly : role === 'input',
    graphEnabled: !!partial.graphEnabled,
    quality: 'GOOD',
  };
}

/** Hardware I/O tags for the official Duplex LS template (live D1608E + MCSA I1–I6). */
function duplexLsHardwareTags(opts = {}) {
  const driverId = opts.driverId === undefined ? DRIVER_ID : opts.driverId;
  const tags = [];

  for (const row of DUPLEX_LS_MCSA_CHANNELS) {
    tags.push(hardwareTag({
      id: row.terminal,
      label: mcsaTerminalLabel(row),
      type: 'BOOL',
      role: 'input',
      driverId,
    }));
    tags.push(hardwareTag({
      id: row.rawTag,
      label: mcsaRawLabel(row),
      type: 'INT',
      role: 'input',
      driverId,
      graphEnabled: true,
    }));
    tags.push(hardwareTag({
      id: row.engTag,
      label: mcsaEngLabel(row),
      type: 'REAL',
      role: 'input',
      driverId,
      channel: row.rawTag,
      driverAddress: { channel: row.rawTag },
      scale: CT_SCALE_AMPS_PER_RAW,
      graphEnabled: true,
    }));
  }

  for (const id of ['I7', 'I8']) {
    tags.push(hardwareTag({
      id,
      label: `${id} spare digital`,
      type: 'BOOL',
      role: 'input',
      driverId,
    }));
  }
  for (const id of ['I7_RAW', 'I8_RAW']) {
    tags.push(hardwareTag({
      id,
      label: `${id} spare analog raw`,
      type: 'INT',
      role: 'input',
      driverId,
    }));
  }

  tags.push(hardwareTag({
    id: 'R1', label: 'Pump 1 contactor', type: 'BOOL', role: 'output', driverId, readonly: false,
  }));
  tags.push(hardwareTag({
    id: 'R2', label: 'Pump 2 contactor', type: 'BOOL', role: 'output', driverId, readonly: false,
  }));
  tags.push(hardwareTag({
    id: 'R3', label: 'Spare relay 3', type: 'BOOL', role: 'output', driverId, readonly: false,
  }));
  tags.push(hardwareTag({
    id: 'R4', label: 'Spare relay 4', type: 'BOOL', role: 'output', driverId, readonly: false,
  }));

  for (let i = 1; i <= 16; i++) {
    const id = `X1_I${i}`;
    tags.push(hardwareTag({
      id,
      label: DUPLEX_LS_DI_LABELS[id] || `Spare DI ${i}`,
      type: 'BOOL',
      role: 'input',
      driverId,
    }));
  }
  for (let i = 1; i <= 8; i++) {
    tags.push(hardwareTag({
      id: `X1_R${i}`,
      label: `Expansion relay ${i} (spare)`,
      type: 'BOOL',
      role: 'output',
      driverId,
      readonly: false,
    }));
  }

  return tags;
}

function labelForHardwareId(id) {
  if (DUPLEX_LS_DI_LABELS[id]) return DUPLEX_LS_DI_LABELS[id];
  const mcsa = DUPLEX_LS_MCSA_CHANNELS.find(
    (row) => row.terminal === id || row.rawTag === id || row.engTag === id,
  );
  if (mcsa) {
    if (id === mcsa.terminal) return mcsaTerminalLabel(mcsa);
    if (id === mcsa.rawTag) return mcsaRawLabel(mcsa);
    return mcsaEngLabel(mcsa);
  }
  if (id === 'R1') return 'Pump 1 contactor';
  if (id === 'R2') return 'Pump 2 contactor';
  return null;
}

/** Apply official Duplex LS labels / MCSA comments onto existing hardware tags. */
function applyDuplexLsIoLabels(tags) {
  if (!Array.isArray(tags)) return { tags: [], changed: 0 };
  let changed = 0;
  const next = tags.map((tag) => {
    const id = String(tag?.id || '');
    const label = labelForHardwareId(id);
    if (!label || tag.label === label) return tag;
    changed += 1;
    const patch = { ...tag, label };
    const mcsa = DUPLEX_LS_MCSA_CHANNELS.find((row) => row.engTag === id);
    if (mcsa) {
      patch.driverAddress = { ...(tag.driverAddress || {}), channel: mcsa.rawTag };
      if (patch.scale == null || patch.scale === 1) patch.scale = CT_SCALE_AMPS_PER_RAW;
      patch.graphEnabled = true;
    }
    return patch;
  });
  return { tags: next, changed };
}

/** Insert missing official hardware tags; keep existing rows (HOA / memory / HMI). */
function mergeDuplexLsHardwareTags(existing, opts = {}) {
  const incoming = duplexLsHardwareTags(opts);
  const byId = new Map((existing || []).map((t) => [String(t.id), t]));
  let added = 0;
  for (const row of incoming) {
    if (byId.has(row.id)) continue;
    byId.set(row.id, row);
    added += 1;
  }
  const { tags, changed } = applyDuplexLsIoLabels([...byId.values()]);
  return { tags, added, relabeled: changed };
}

function duplexLsPdmAssetTags() {
  return {
    'pump-1': ['MOTOR1_HRS', 'MOTOR1_STARTS', 'MOTOR1_START_MS', 'AI1', 'I1_RAW', 'I2_RAW', 'I3_RAW', 'P1_RUN_FB'],
    'pump-2': ['MOTOR2_HRS', 'MOTOR2_STARTS', 'MOTOR2_START_MS', 'AI4', 'I4_RAW', 'I5_RAW', 'I6_RAW', 'P2_RUN_FB'],
  };
}

function duplexLsMcsaFeed() {
  return DUPLEX_LS_MCSA_CHANNELS.map((row) => ({
    ...row,
    ioLayout: 'LIFT6',
    pdmAsset: row.assetId,
  }));
}

module.exports = {
  CT_SCALE_AMPS_PER_RAW,
  DRIVER_ID,
  DUPLEX_LS_FLOAT_MAP,
  DUPLEX_LS_DI_LABELS,
  DUPLEX_LS_MCSA_CHANNELS,
  DUPLEX_LS_EXPANSIONS,
  duplexLsHardwareTags,
  applyDuplexLsIoLabels,
  mergeDuplexLsHardwareTags,
  duplexLsPdmAssetTags,
  duplexLsMcsaFeed,
  labelForHardwareId,
};
