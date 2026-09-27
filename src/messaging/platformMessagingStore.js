'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');
const {
  normalizePlatformMessaging,
  maskPlatformMessaging,
} = require('./messagingSettings');

const STORE_PATH = path.join(DATA_DIR, 'platform-messaging.json');

function readPlatformMessagingRaw() {
  try {
    if (!fs.existsSync(STORE_PATH)) return { mail: {}, sms: {} };
    const doc = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return {
      mail: doc.mail && typeof doc.mail === 'object' ? doc.mail : {},
      sms: doc.sms && typeof doc.sms === 'object' ? doc.sms : {},
      updatedAt: doc.updatedAt || null,
    };
  } catch {
    return { mail: {}, sms: {} };
  }
}

function writePlatformMessaging(patch) {
  const prev = readPlatformMessagingRaw();
  const next = normalizePlatformMessaging(patch, prev);
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function readPlatformMessagingMasked() {
  return maskPlatformMessaging(readPlatformMessagingRaw());
}

module.exports = {
  readPlatformMessagingRaw,
  readPlatformMessagingMasked,
  writePlatformMessaging,
  STORE_PATH,
};
