'use strict';

(() => {
  function liveTagValue(liveList, tagId) {
    if (!Array.isArray(liveList)) return null;
    const row = liveList.find((t) => (t.tagId ?? t.id) === tagId);
    if (!row) return null;
    const v = Number(row.value);
    return Number.isFinite(v) ? Math.trunc(v) : null;
  }

  function isHoaTagId(tagId) {
    return /_HOA$/i.test(String(tagId || '')) || /HOA/i.test(String(tagId || ''));
  }

  function relatedHoaTagId(tagId) {
    const id = String(tagId || '');
    const motor = /^(.+?)_(START|STOP|RUN|OFF|HAND|START_PB|STOP_PB)$/i.exec(id);
    if (motor) return `${motor[1]}_HOA`;
    if (isHoaTagId(id)) return id;
    return null;
  }

  function userFeatures(user) {
    return user?.features || {};
  }

  function canWriteHmiTag(user, tagId, value, liveList) {
    if (!user) return true;
    if (user.role === 'platform_admin' || user.role === 'tenant_admin' || user.role === 'partner_admin') return true;

    const feats = userFeatures(user);
    if (feats.studioEdit || user.role === 'technician' || user.role === 'supervisor' || user.role === 'partner_technician') {
      return !!feats.hmiHand || !!feats.studioEdit;
    }
    if (user.role !== 'operator') return !!feats.hmiHand;
    if (!feats.hmiHand) return false;

    if (isHoaTagId(tagId)) {
      const v = Math.trunc(Number(value));
      return v === 1 || v === 2;
    }

    const hoaId = relatedHoaTagId(tagId);
    if (hoaId) {
      return liveTagValue(liveList, hoaId) === 2;
    }
    return false;
  }

  function hmiWriteDeniedReason(user, tagId, value, liveList) {
    if (canWriteHmiTag(user, tagId, value, liveList)) return '';
    if (!userFeatures(user).hmiHand) {
      return 'Operator view-only — hand control is not enabled for your account.';
    }
    if (isHoaTagId(tagId)) {
      return 'Operators may set HOA to Off or Hand only — not Auto.';
    }
    const hoaId = relatedHoaTagId(tagId);
    if (hoaId) {
      return `Switch ${hoaId.replace(/_/g, ' ')} to Hand before operating.`;
    }
    return 'This control is not available for operator hand mode.';
  }

  window.PeaklogicCloudHmiPolicy = {
    canWriteHmiTag,
    hmiWriteDeniedReason,
    isHoaTagId,
    relatedHoaTagId,
  };
})();
