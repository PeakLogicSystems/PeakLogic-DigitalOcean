/*
 * PeakLogic "Parc" MQTT client for the LilyGO T-HaLow node.
 *
 * Speaks the same protocol as the Arduino Opta firmware
 * (firmware/arduino-opta-mqtt-st, namespace "peaklogic/v1"), so PeakLogic and
 * the Opta see this board as a native Parc peer:
 *
 *   peaklogic/v1/<deviceId>/telemetry     (pub)  verbose JSON snapshot + tags[]
 *   peaklogic/v1/<deviceId>/online        (pub)  retained {"online":true|false} (LWT)
 *   peaklogic/v1/<deviceId>/cmd           (sub)  {"id","op","body"}
 *   peaklogic/v1/<deviceId>/cmd/response  (pub)  {"id","ok",...}
 *   peaklogic/v1/<deviceId>/config        (sub)  {"pauseTelemetry","reportMs"}
 *   peaklogic/v1/g/<siteKeyHex>/<tag>     (pub/sub, retained) {"v":..,"t":".."}
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "device_cfg.h"
#include "esp_netif.h"

/** Parc tag value type (the telemetry "type" / global-tag "t" field). */
typedef enum
{
    PARC_TAG_BOOL = 0,
    PARC_TAG_INT = 1,
    PARC_TAG_REAL = 2,
} parc_tag_type_t;

/**
 * Called when a global (peer-to-peer) tag arrives on
 * peaklogic/v1/g/<siteKeyHex>/<tag>. This is how the node reacts to values the
 * Opta (or any peer sharing the same site key) publishes.
 *
 * @param tag    Tag name (last topic segment), NUL-terminated.
 * @param type   Declared type from the payload "t" field.
 * @param value  Numeric value from the payload "v" field (bools are 0/1).
 */
typedef void (*parc_global_cb_t)(const char *tag, parc_tag_type_t type, double value);

/**
 * Called for each entry of a `write_outputs` command's `body.outputs` object
 * (peaklogic/v1/<deviceId>/cmd). Use it to drive a GPIO/relay/setpoint.
 *
 * @return true if the write was applied (counted in the response).
 */
typedef bool (*parc_write_cb_t)(const char *tag, double value);

/**
 * Register a telemetry tag so it appears in the telemetry `tags[]` array (same
 * row shape the Opta/PeakLogic expect). Call before parc_mqtt_start().
 *
 * @param id    Tag id (<=15 chars), e.g. "O1", "AI1".
 * @param type  Value type.
 * @param role  "input", "output", or "memory". The PC treats "output" tags as
 *              writable (drives them via write_outputs in remote_io mode).
 */
void parc_tag_register(const char *id, parc_tag_type_t type, const char *role);

/** Update a registered tag's value; reflected in the next telemetry frame. */
void parc_tag_set(const char *id, double value);

/** Read a registered tag's value (0 if unknown). */
double parc_tag_get(const char *id);

/** Register the global-tag (peer reaction) handler. Call before parc_mqtt_start(). */
void parc_mqtt_set_global_handler(parc_global_cb_t cb);

/** Register the write_outputs handler. Call before parc_mqtt_start(). */
void parc_mqtt_set_write_handler(parc_write_cb_t cb);

/**
 * Start the MQTT client over the HaLow netif (or default route if netif is NULL).
 * Non-blocking: connection happens asynchronously.
 */
void parc_mqtt_start_with_cfg(const device_cfg_t *cfg, esp_netif_t *netif);

/** @return true once connected to the broker. */
bool parc_mqtt_is_connected(void);

/**
 * Publish a telemetry frame *if* connected, not paused, and the report interval
 * has elapsed (or a command forced one). Call this frequently from the main
 * loop; it rate-limits internally, mirroring the Opta.
 *
 * @param ip       Current IPv4 address string (telemetry "ethIp"/"ip").
 * @param rssi     Current Wi-Fi RSSI in dBm (tag "RSSI").
 * @param link_up  Wi-Fi link state (tag "LINK").
 */
void parc_mqtt_maybe_publish_telemetry(const char *ip, int32_t rssi, bool link_up);

/**
 * Publish a global (P2P) tag, retained, to peaklogic/v1/g/<siteKeyHex>/<tag>.
 * Peers sharing the site key (e.g. the Opta) receive it as a global tag.
 */
void parc_mqtt_publish_global_bool(const char *tag, bool v);
void parc_mqtt_publish_global_int(const char *tag, int32_t v);
void parc_mqtt_publish_global_real(const char *tag, double v);
