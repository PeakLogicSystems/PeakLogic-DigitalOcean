'use strict';

const { userHasFeature } = require('./featureCatalog');

function requireFeature(featureKey) {
  return (req, res, next) => {
    if (!req.mvAuth?.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!userHasFeature(req.mvAuth.user, featureKey)) {
      return res.status(403).json({ error: 'Feature not enabled for this user' });
    }
    return next();
  };
}

function requireAnyFeature(...featureKeys) {
  return (req, res, next) => {
    if (!req.mvAuth?.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (featureKeys.some((k) => userHasFeature(req.mvAuth.user, k))) return next();
    return res.status(403).json({ error: 'Feature not enabled for this user' });
  };
}

module.exports = {
  requireFeature,
  requireAnyFeature,
  userHasFeature,
};
