'use strict';

const { verifyToken } = require('./jwt');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const claims = verifyToken(match[1]);
    req.auth = {
      userId: claims.userId,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

module.exports = { authenticate, requireRole };
