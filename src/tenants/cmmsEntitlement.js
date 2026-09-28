'use strict';

/** Shape a tenant's CMMS entitlement for API/UI consumption. */
function publicCmmsEntitlement(cmms) {
  return {
    enabled: !!(cmms && cmms.enabled),
    externalUrl: (cmms && cmms.externalUrl) || '',
  };
}

module.exports = { publicCmmsEntitlement };
