'use strict';

const persistence = require('../persistence');

const STORE_FILE = 'bacnet-profiles.json';

function listProfiles() {
  const raw = persistence.readJson(STORE_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

function saveProfiles(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  persistence.writeJson(STORE_FILE, list);
  return list;
}

function getProfile(id) {
  return listProfiles().find((p) => p.id === id) || null;
}

function upsertProfile(profile) {
  if (!profile?.id) throw new Error('profile id required');
  const list = listProfiles();
  const idx = list.findIndex((p) => p.id === profile.id);
  const next = { ...profile, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.push({ ...next, createdAt: next.updatedAt });
  saveProfiles(list);
  return next;
}

function deleteProfile(id) {
  const list = listProfiles().filter((p) => p.id !== id);
  saveProfiles(list);
  return { ok: true, count: list.length };
}

module.exports = {
  STORE_FILE,
  listProfiles,
  saveProfiles,
  getProfile,
  upsertProfile,
  deleteProfile,
};
