'use strict';

function sendJson(res, status, body) {
  res.status(status).json(body);
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { sendJson, asyncHandler };
