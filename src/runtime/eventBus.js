'use strict';

const { EventEmitter } = require('events');

/**
 * In-process event bus for the appliance monolith.
 * Cloud will publish the same event shapes to Redis/NATS/Kafka later.
 *
 * Events:
 *   alarm:transition — { tagId, level, previousLevel, value, since }
 */
const bus = new EventEmitter();
bus.setMaxListeners(64);

function emit(event, payload) {
  bus.emit(event, payload);
}

function on(event, handler) {
  bus.on(event, handler);
  return () => bus.off(event, handler);
}

module.exports = { emit, on, bus };
