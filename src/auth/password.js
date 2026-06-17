'use strict';

const bcrypt = require('bcryptjs');

const ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(String(plain), hash);
}

module.exports = { hashPassword, verifyPassword };
