/*
 * Minimal MQTT 3.1.1 broker on the LAN interface for Arduino Opta.
 *
 * Opta connects here (192.168.1.1:1883). Anonymous auth only.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

typedef void (*mqtt_local_publish_cb_t)(const char *topic, const uint8_t *payload,
                                        size_t len, int qos, bool retain, void *ctx);

/**
 * Start TCP listener on bind_ip:port (typically 192.168.1.1:1883).
 * @param on_publish  Called when a local client (Opta) publishes.
 */
bool mqtt_local_start(const char *bind_ip, uint16_t port,
                      mqtt_local_publish_cb_t on_publish, void *ctx);

void mqtt_local_poll(void);

/** Deliver a cloud-originated message to local subscribers (Opta). */
bool mqtt_local_deliver(const char *topic, const uint8_t *payload, size_t len,
                        int qos, bool retain);

int mqtt_local_client_count(void);
bool mqtt_local_is_listening(void);
