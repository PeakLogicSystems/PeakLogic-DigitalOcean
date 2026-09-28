#pragma once

/* Waveshare ESP32-S3-Relay-1CH / 1CH-U
 * Wiki: https://www.waveshare.com/wiki/ESP32-S3-Relay-1CH
 * Onboard relay is driven through an optocoupler. GPIO1 matches the 6CH CH1
 * map and Waveshare 1CH demos; change RELAY_GPIO if your rev differs.
 * SH1.0 header: GND, 3V3, GPIO2, GPIO1 — GPIO2 is the aux DI.
 */
#ifndef RELAY_GPIO
#define RELAY_GPIO 1
#endif
#ifndef DI1_GPIO
#define DI1_GPIO 2
#endif

#define MV_PLATFORM_ID "waveshare-esp32s3-relay-1ch"
#define SETUP_AP_SSID "PeakLogic-Relay1CH"
#define SETUP_AP_PASS "peaklogic"
#define SETUP_HTTP_PORT 8080

/* Same sketch defaults as Opta MQTT Parc (mv_config.h). */
#ifndef MV_MQTT_SKETCH_BROKER_DEFAULT
#define MV_MQTT_SKETCH_BROKER_DEFAULT "mqtt.peaklogic.io"
#endif
#ifndef MV_MQTT_SKETCH_PORT_DEFAULT
#define MV_MQTT_SKETCH_PORT_DEFAULT 8883
#endif
#ifndef MV_MQTT_SKETCH_TLS_DEFAULT
#define MV_MQTT_SKETCH_TLS_DEFAULT 1
#endif
#ifndef MV_MQTT_SKETCH_USER_DEFAULT
#define MV_MQTT_SKETCH_USER_DEFAULT "peaklogic"
#endif
#ifndef MV_MQTT_SKETCH_PASS_DEFAULT
#define MV_MQTT_SKETCH_PASS_DEFAULT "f20ba87c93b64d6b5b0606357385b9e528af2a10bb883d1f"
#endif
#define MV_MQTT_PASSWORD_SIZE 80

#define MV_FIRMWARE_VERSION "0.2.6-ws-relay-1ch"
#define MV_PROTOCOL_VERSION 2
