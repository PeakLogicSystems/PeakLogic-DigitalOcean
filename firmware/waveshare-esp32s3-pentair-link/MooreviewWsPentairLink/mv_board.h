#pragma once

/*
 * Waveshare ESP32-S3-Relay-1CH / 1CH-U — Pentair-only pad link
 * Wiki: https://www.waveshare.com/wiki/ESP32-S3-Relay-1CH
 *
 * Onboard RS-485 screw terminals A+ / B− (UART1, auto direction).
 * Wire IntelliFlo + IntelliChlor on one 9600 8N1 twisted pair.
 * SH1.0 GPIO2 = optional flow switch (active low).
 * Onboard relay GPIO1 = spare contactor (not used by Pentair stack).
 */

#ifndef RELAY_GPIO
#define RELAY_GPIO 1
#endif
#ifndef DI1_GPIO
#define DI1_GPIO 2
#endif

#define MV_PLATFORM_ID "waveshare-esp32s3-pentair-link"
#define MV_FIRMWARE_VERSION "1.0.0-pentair-1ch"
#define MV_PROTOCOL_VERSION 2

#define SETUP_AP_SSID "PeakLogic-Pentair"
#define SETUP_AP_PASS "peaklogic"
#define SETUP_HTTP_PORT 8080

#define PENTAIR_BAUD 9600
#define PENTAIR_UART 1
#define PENTAIR_TX 17
#define PENTAIR_RX 18
/* Waveshare 1CH onboard transceiver — auto TX/RX direction (no DE pin). */
#define PENTAIR_DE 255
#define PENTAIR_ADDR_DEFAULT 0x60

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
