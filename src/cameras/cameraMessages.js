'use strict';

/** Shown when camera runtime routes are blocked because camerasEnabled is false. */
const CAMERA_SYSTEM_DISABLED_MSG = 'Camera system is disabled. Enable it under Cameras → Administration… → Settings.';

function isCameraSystemDisabledMessage(msg) {
  return /camera system is disabled/i.test(String(msg || ''));
}

module.exports = {
  CAMERA_SYSTEM_DISABLED_MSG,
  isCameraSystemDisabledMessage,
};
