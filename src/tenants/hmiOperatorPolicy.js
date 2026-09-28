'use strict';

const { effectiveFeaturesForUser } = require('./cloudCapabilityMatrix');

function isHoaTagId(tagId) {
  return /_HOA$/i.test(String(tagId || '')) || /HOA/i.test(String(tagId || ''));
}

function relatedHoaTagId(tagId) {
  const id = String(tagId || '');
  const motor = /^(.+?)_(START|STOP|RUN|OFF|START_PB|STOP_PB)$/i.exec(id);
  if (motor) return `${motor[1]}_HOA`;
  if (isHoaTagId(id)) return id;
  return null;
}

function hoaValue(tagStore, tagId) {
  const hoaId = relatedHoaTagId(tagId) || (isHoaTagId(tagId) ? tagId : null);
  if (!hoaId) return null;
  const t = tagStore.get(hoaId);
  if (!t) return null;
  return Math.trunc(Number(t.value));
}

/** Operator may select Hand (2) or Off (1) on HOA — not Auto (0). */
function operatorHoaValueAllowed(value) {
  const v = Math.trunc(Number(value));
  return v === 1 || v === 2;
}

function userMayUseHmiHand(user) {
  if (!user) return true;
  if (user.role === 'platform_admin' || user.role === 'tenant_admin' || user.role === 'partner_admin') return true;
  const feats = effectiveFeaturesForUser(user);
  return !!feats.hmiHand;
}

function userMayEditStudio(user) {
  if (!user) return true;
  if (user.role === 'platform_admin' || user.role === 'tenant_admin' || user.role === 'partner_admin') return true;
  return !!effectiveFeaturesForUser(user).studioEdit;
}

/**
 * Cloud HMI tag write policy.
 * Operators: view HMI; hand-mode HOA (Off/Hand only); bool commands only when HOA is Hand.
 */
function canWriteHmiTag(user, tagId, value, tagStore) {
  if (!user) return true;
  if (user.role === 'platform_admin' || user.role === 'tenant_admin' || user.role === 'partner_admin') return true;

  const feats = effectiveFeaturesForUser(user);
  if (!feats.hmiView && !feats.hmiHand && !feats.studioEdit) return false;
  if (feats.studioEdit || user.role === 'technician' || user.role === 'supervisor' || user.role === 'partner_technician') {
    return !!feats.hmiHand || !!feats.studioEdit;
  }

  if (user.role !== 'operator') return !!feats.hmiHand;

  if (!feats.hmiHand) return false;

  const tag = tagStore.get(tagId);
  if (!tag || tag.readonly || tag.role !== 'memory') return false;
  if (tag.hmiOperatorHand === true) return true;

  if (isHoaTagId(tagId)) {
    return operatorHoaValueAllowed(value);
  }

  const hoa = hoaValue(tagStore, tagId);
  if (hoa != null) {
    return hoa === 2;
  }

  return false;
}

module.exports = {
  isHoaTagId,
  relatedHoaTagId,
  canWriteHmiTag,
  userMayUseHmiHand,
  userMayEditStudio,
  operatorHoaValueAllowed,
};
