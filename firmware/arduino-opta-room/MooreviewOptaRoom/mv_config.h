#pragma once

/* HTTP uses native EthernetServer on Opta (see mv_http.cpp). */
#ifndef MV_HAS_WEBSERVER
#if defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)
#define MV_HAS_WEBSERVER 1
#else
#define MV_HAS_WEBSERVER 0
#endif
#endif

#ifndef MV_DEBUG_VERBOSE
#define MV_DEBUG_VERBOSE 0
#endif

#define MV_HTTP_PORT 80
#define MV_WIFI_HTTP_PORT 8080
#define MV_MAX_TAGS 128
#define MV_AVG_RING 16
#define MV_PROGRAM_JSON_MAX 16384
#define MV_BC_MAX 16384
/**
 * PubSubClient packet buffer size. MUST be defined here (the earliest, most widely
 * included header) so it reaches the PubSubClient constructor before <PubSubClient.h>
 * is first included anywhere — otherwise the library locks in its 256 B default and
 * every put_program deploy (bytecode base64 > 256 B) is silently dropped on receive.
 * The constructor allocates this at global init (before setup), when the heap is
 * pristine, so it never depends on a fragile runtime realloc.
 */
#ifndef MQTT_MAX_PACKET_SIZE
/**
 * 16 KB: an 8 KB buffer is too small for the periodic telemetry payload of a
 * fully-populated device (triplex + expansion I/O map exceeds 8 KB — cf. the
 * /api/io-map StaticJsonDocument<12288>), so PubSubClient.publish() silently
 * dropped every telemetry frame while small cmd/responses still went through.
 * Must stay >= the telemetry StaticJsonDocument in mv_mqtt.cpp.
 */
#define MQTT_MAX_PACKET_SIZE 16384
#endif
/** Max MQTT cmd JSON (PubSubClient packet size); matches MQTT_MAX_PACKET_SIZE above. */
#define MV_MQTT_CMD_BUF 16384
#define MV_SCAN_MS_DEFAULT 100

// WiFi setup AP (Opta WiFi variant)
#ifndef MV_WIFI_AP_SSID
#define MV_WIFI_AP_SSID "PeakLogic-Opta"
#endif
#ifndef MV_WIFI_AP_PASS
#define MV_WIFI_AP_PASS "peaklogic"
#endif
#ifndef MV_WIFI_AP_IP
#define MV_WIFI_AP_IP 192, 168, 4, 1
#endif

// Opta pin map (adjust for your model — see README)
#ifndef MV_DIN_PIN0
#define MV_DIN_PIN0 A0
#endif
#ifndef MV_RELAY_PIN0
#define MV_RELAY_PIN0 D0
#endif

#ifndef MV_OTA_PASSWORD
#define MV_OTA_PASSWORD ""
#endif

#ifndef MV_OTA_QSPI_OFFSET
#define MV_OTA_QSPI_OFFSET 2
#endif

/** Sketch fallback when mqttBrokerSet is false — override in PeaklogicOptaMqttSt.ino g_mqttCfg. */
#ifndef MV_MQTT_SKETCH_BROKER_DEFAULT
#define MV_MQTT_SKETCH_BROKER_DEFAULT "192.168.1.233"
#endif
