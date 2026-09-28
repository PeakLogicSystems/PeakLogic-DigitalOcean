'use strict';

const gridfs = require('./gridfsStore');

async function mirrorEnabled() {
  try {
    const { registry } = require('../cameras/cameraRegistry');
    if (!registry.settings().gridfsMirrorAssets) return false;
    return gridfs.enabled();
  } catch {
    return false;
  }
}

async function mirrorUpload(bucketName, buffer, { filename, contentType, metadata = {} } = {}) {
  if (!(await mirrorEnabled())) return null;
  return gridfs.upload(bucketName, buffer, { filename, contentType, metadata });
}

module.exports = {
  mirrorEnabled,
  mirrorUpload,
};
