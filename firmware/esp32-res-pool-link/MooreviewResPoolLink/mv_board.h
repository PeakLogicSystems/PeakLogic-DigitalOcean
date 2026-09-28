#pragma once

/*
 * Res-Pool-Link — standalone residential pool & spa controller.
 *
 * Default: Waveshare ESP32-S3-Relay-6CH (CH1–CH4 = valves).
 *   Wiki: https://www.waveshare.com/wiki/ESP32-S3-Relay-6CH
 *
 * Two RS-485 pairs (do not share):
 *   UART1  9600 8N1  Pentair  — IntelliFlo + IntelliChlor
 *   UART2  4800 8N1  Modbus   — DFRobot SEN0711 + SEN0712
 *
 * Arduino IDE: ESP32S3 Dev Module, USB CDC On Boot Enabled.
 */

#ifndef MV_BOARD
#define MV_BOARD BOARD_WS_S3_RELAY_6CH
#endif

#define BOARD_WS_S3_RELAY_6CH 1
#define BOARD_WS_S3_RELAY_4CH 2
#define BOARD_GENERIC_4RELAY  3

#define MV_PLATFORM_ID "esp32-res-pool-link"
#define MV_FIRMWARE_VERSION "2.0.1-standalone"
#define MV_PROTOCOL_VERSION 2

#define SETUP_AP_SSID "PeakLogic-ResPool"
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

#define VALVE_COUNT 4

#define PENTAIR_BAUD 9600
#define CHEM_BAUD 4800
#define PENTAIR_ADDR_DEFAULT 0x60
#define CHEM_PH_SLAVE_DEFAULT 1
#define CHEM_CL_SLAVE_DEFAULT 2

#define BW_MS_DEFAULT 180000UL
#define RINSE_MS_DEFAULT 60000UL

#if MV_BOARD == BOARD_WS_S3_RELAY_6CH || MV_BOARD == BOARD_WS_S3_RELAY_4CH
  /* CH1–CH6 = GPIO 1, 2, 41, 42, 45, 46 */
  static const uint8_t VALVE_GPIO[VALVE_COUNT] = { 1, 2, 41, 42 };
  #ifndef DI1_GPIO
  #define DI1_GPIO 4
  #endif
  /* External MAX3485 (or equivalent). Not the Pentair pair. */
  #ifndef PENTAIR_TX
  #define PENTAIR_TX 17
  #endif
  #ifndef PENTAIR_RX
  #define PENTAIR_RX 18
  #endif
  #ifndef PENTAIR_DE
  #define PENTAIR_DE 8
  #endif
  #ifndef CHEM_TX
  #define CHEM_TX 15
  #endif
  #ifndef CHEM_RX
  #define CHEM_RX 16
  #endif
  #ifndef CHEM_DE
  #define CHEM_DE 7
  #endif
#else
  /* Classic ESP32 + 4-relay module (active HIGH). GPIO 22–27 exist on ESP32, not S3. */
  static const uint8_t VALVE_GPIO[VALVE_COUNT] = { 16, 17, 18, 19 };
  #ifndef DI1_GPIO
  #define DI1_GPIO 15
  #endif
  #ifndef PENTAIR_TX
  #define PENTAIR_TX 21
  #endif
  #ifndef PENTAIR_RX
  #define PENTAIR_RX 22
  #endif
  #ifndef PENTAIR_DE
  #define PENTAIR_DE 23
  #endif
  #ifndef CHEM_TX
  #define CHEM_TX 25
  #endif
  #ifndef CHEM_RX
  #define CHEM_RX 26
  #endif
  #ifndef CHEM_DE
  #define CHEM_DE 27
  #endif
#endif

#ifndef RELAY_ACTIVE_HIGH
#define RELAY_ACTIVE_HIGH 1
#endif
