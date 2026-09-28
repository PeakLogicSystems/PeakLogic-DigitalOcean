'use strict';

const path = require('path');
const persistence = require('../../persistence');
const { normalizeHmi } = require('../../hmi/hmiConfig');
const { ensureDuplexlsScreen2 } = require('../../hmi/duplexlsScreen');
const { patchAssistedLivingHmi } = require('../../settings/assistedLivingSettings');
const {
  listRoomDetailScreens,
  roomLampRoles,
  parseRoomTag,
  buildRoomDetailBinding,
  upsertBinding,
  roomNumFromScreen,
} = require('../../hmi/roomDetailBindings');
const { tagIdFor } = require('../../drivers/nextcenturyTagSync');

const PUBLIC_ROOT = path.join(__dirname, '../../../public');

const NC_FIELD_SUFFIX = {
  leakActive: 'LEAK',
  temperature: 'TEMP',
  totalUsage: 'USAGE',
  currentReading: 'INTERVAL',
};

function loadSemanticMap() {
  try {
    return require('../../../scripts/assisted-living/nextcentury-map').SEMANTIC_MAP || [];
  } catch {
    return [];
  }
}

/** Map semantic ALF tag ids → wired NC_* mirror tag (e.g. RM101_AC_PAN_LEAK → NC_FA003A90_LEAK). */
function buildMirrorSuggestions(tagList) {
  const wiredIds = new Set(
    (tagList || []).filter((t) => t?.id && t.driverId).map((t) => t.id),
  );
  const out = {};
  for (const m of loadSemanticMap()) {
    if (!m?.tagId || !m.deviceId || !m.field) continue;
    const suffix = NC_FIELD_SUFFIX[m.field] || String(m.field).toUpperCase();
    const mirrorId = tagIdFor(m.deviceId, suffix);
    if (wiredIds.has(mirrorId)) out[m.tagId] = mirrorId;
  }
  return out;
}

/** Opta expansion modules use X{n}_ prefix (D1608E / A0602 sync tags). */
function isExpansionIoTag(tag) {
  return /^X(\d+)_/.test(String(tag?.id || ''));
}

function expansionSlotFromId(id) {
  const m = /^X(\d+)_/.exec(String(id || ''));
  return m ? Number(m[1]) : 0;
}

function expansionModuleKind(tags) {
  const ids = (tags || []).map((t) => t.id);
  if (ids.some((id) => /_I\d+$/.test(id) || /_R\d+$/.test(id))) return 'D1608E';
  if (ids.some((id) => /_AI\d+$/.test(id) || /_PWM\d+$/.test(id))) return 'A0602';
  return '';
}

function expansionSectionTitle(slot, tags) {
  const kind = expansionModuleKind(tags);
  return kind ? `Expansion ${slot} (${kind})` : `Expansion ${slot}`;
}

function isIoMapTag(tag) {
  if (!tag) return false;
  return tag.role === 'input' || tag.role === 'output';
}

function sortIoMapTags(a, b) {
  const ea = isExpansionIoTag(a) ? expansionSlotFromId(a.id) : 0;
  const eb = isExpansionIoTag(b) ? expansionSlotFromId(b.id) : 0;
  if (ea !== eb) {
    if (!ea) return -1;
    if (!eb) return 1;
    return ea - eb;
  }
  const roleOrder = { input: 0, output: 1 };
  const ra = roleOrder[a.role] ?? 9;
  const rb = roleOrder[b.role] ?? 9;
  if (ra !== rb) return ra - rb;
  const typeOrder = { BOOL: 0, INT: 1, REAL: 2 };
  const ta = typeOrder[a.type] ?? 9;
  const tb = typeOrder[b.type] ?? 9;
  if (ta !== tb) return ta - tb;
  return String(a.id).localeCompare(String(b.id));
}

function ioMapPointFromTag(tag) {
  return {
    id: tag.id,
    label: tag.label || '',
    type: tag.type,
    role: tag.role,
    value: tag.value,
    quality: tag.quality,
    driverId: tag.driverId || '',
    forceInput: !!tag.forceInput,
    forceOutput: !!tag.forceOutput,
    forceValue: tag.forceValue,
    logicValue: (tag.forceInput || tag.forceOutput) ? tag.logicValue : undefined,
    updatedAt: tag.updatedAt ?? null,
  };
}

function tagWireSummary(tag) {
  if (!tag) return null;
  const addr = tag.driverAddress && typeof tag.driverAddress === 'object' ? tag.driverAddress : null;
  return {
    id: tag.id,
    label: tag.label || '',
    type: tag.type,
    role: tag.role,
    driverId: tag.driverId || '',
    driverAddress: addr
      ? { deviceId: addr.deviceId || '', field: addr.field || '' }
      : null,
  };
}


function cloneBindings(bindings) {
  return (bindings || []).map((b) => ({ ...b }));
}

function createIoMapRoutes(deps) {
  const { tagStore, scanEngine, driverManager } = deps;
  const router = require('express').Router();

  router.get('/io-map', (req, res) => {
    const { syncMqttParcLiveIo } = require('../../parc/parcLiveIoSync');
    syncMqttParcLiveIo(tagStore, driverManager);
    const runtime = scanEngine.status();
    const tagList = tagStore.list();
    const points = tagList.filter(isIoMapTag).sort(sortIoMapTags).map(ioMapPointFromTag);
    const settings = persistence.readJson('settings.json', {});
    const rawHmi = patchAssistedLivingHmi(settings.hmi?.screens?.length ? settings.hmi : { screens: [], bindings: [] });
    ensureDuplexlsScreen2(rawHmi, PUBLIC_ROOT, settings.project?.name);
    const hmi = normalizeHmi(rawHmi, tagList, PUBLIC_ROOT);
    const drivers = (driverManager?.list?.() || []).map((d) => ({
      id: d.id,
      type: d.type,
      enabled: d.enabled !== false,
    }));
    const wiredTags = tagList
      .filter((t) => t.driverId)
      .map(tagWireSummary)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const mirrorSuggestions = buildMirrorSuggestions(tagList);
    const roomScreens = listRoomDetailScreens(hmi.screens, hmi.bindings);
    const roomPopupEnabled = settings.hmi?.layout?.roomPopup?.enabled !== false;
    res.json({
      runtime: {
        running: !!runtime.running,
        paused: !!runtime.paused,
        scanMs: runtime.scanMs,
        remoteExec: !!(runtime.remoteExecution ?? runtime.remoteExec),
      },
      updatedAt: Date.now(),
      count: points.length,
      points,
      screens: (hmi.screens || []).map((s) => ({
        id: s.id,
        name: s.name || s.title || s.id,
        isRoomDetail: roomScreens.some((r) => r.screenId === s.id),
      })),
      bindings: cloneBindings(hmi.bindings),
      roomScreens,
      roomLampRoles: roomLampRoles(),
      roomPopupEnabled,
      drivers,
      wiredTags,
      mirrorSuggestions,
    });
  });

  router.post('/io-map/bindings/room-template', async (req, res) => {
    const tagId = String(req.body?.tagId || '').trim();
    const screenId = String(req.body?.screenId || '').trim();
    const elementSuffix = String(req.body?.elementSuffix || '').trim();
    if (!tagId) return res.status(400).json({ error: 'tagId required' });

    const prev = persistence.readJson('settings.json', {});
    const tagList = tagStore.list();
    const baseHmi = patchAssistedLivingHmi(prev.hmi?.screens?.length ? prev.hmi : { screens: [], bindings: [] });
    const hmi = normalizeHmi(baseHmi, tagList, PUBLIC_ROOT);
    const parsed = parseRoomTag(tagId);

    let screen = screenId
      ? hmi.screens.find((s) => s.id === screenId)
      : null;
    if (!screen && parsed?.roomNum != null) {
      const pad = String(parsed.roomNum).padStart(3, '0');
      screen = hmi.screens.find((s) => s.id === `screen_rm_${pad}`)
        || hmi.screens.find((s) => roomNumFromScreen(s) === parsed.roomNum);
    }
    if (!screen) {
      return res.status(404).json({ error: screenId ? `Screen not found: ${screenId}` : 'No room detail screen for this tag' });
    }

    const built = buildRoomDetailBinding({
      screen,
      tagId,
      elementSuffix: elementSuffix || undefined,
      property: req.body?.property,
    });
    if (built.error) return res.status(400).json({ error: built.error });

    const { bindings, replaced } = upsertBinding(hmi.bindings, built.binding);
    const nextHmi = normalizeHmi({ ...hmi, bindings }, tagList, PUBLIC_ROOT);
    const next = { ...prev, hmi: nextHmi };
    persistence.writeJson('settings.json', next);
    await persistence.flushConfig();
    if (scanEngine) scanEngine.loadSettings();
    res.json({
      ok: true,
      replaced,
      binding: built.binding,
      bindings: cloneBindings(nextHmi.bindings),
    });
  });

  router.patch('/io-map/tags/:id', (req, res) => {
    const tagId = String(req.params.id || '').trim();
    if (!tagId) return res.status(400).json({ error: 'tag id required' });
    const tag = tagStore.get(tagId);
    if (!tag) return res.status(404).json({ error: `Tag not found: ${tagId}` });
    const body = req.body || {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, 'driverId')) {
      patch.driverId = body.driverId ? String(body.driverId).trim() : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'driverAddress')) {
      patch.driverAddress = body.driverAddress && typeof body.driverAddress === 'object'
        ? {
          deviceId: body.driverAddress.deviceId ? String(body.driverAddress.deviceId).trim() : undefined,
          field: body.driverAddress.field ? String(body.driverAddress.field).trim() : undefined,
        }
        : undefined;
    }
    const mirrorFrom = String(body.mirrorFromTagId || '').trim();
    if (mirrorFrom) {
      const src = tagStore.get(mirrorFrom);
      if (!src?.driverId) {
        return res.status(400).json({ error: `Source tag "${mirrorFrom}" is not wired to a driver` });
      }
      patch.driverId = src.driverId;
      patch.driverAddress = src.driverAddress;
    }
    const updated = tagStore.upsert({ ...tag, ...patch });
    res.json({ ok: true, tag: tagWireSummary(updated) });
  });

  router.put('/io-map/bindings', async (req, res) => {
    const incoming = req.body?.bindings;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: 'bindings array required' });
    }
    const prev = persistence.readJson('settings.json', {});
    const tagList = tagStore.list();
    const baseHmi = patchAssistedLivingHmi(prev.hmi?.screens?.length ? prev.hmi : { screens: [], bindings: [] });
    const hmi = normalizeHmi(
      { ...baseHmi, bindings: incoming },
      tagList,
      PUBLIC_ROOT,
    );
    const next = { ...prev, hmi };
    persistence.writeJson('settings.json', next);
    await persistence.flushConfig();
    if (scanEngine) scanEngine.loadSettings();
    res.json({ ok: true, bindings: cloneBindings(hmi.bindings) });
  });

  return router;
}

module.exports = {
  createIoMapRoutes,
  isIoMapTag,
  isExpansionIoTag,
  expansionSlotFromId,
  expansionModuleKind,
  expansionSectionTitle,
  sortIoMapTags,
  ioMapPointFromTag,
  buildMirrorSuggestions,
};
