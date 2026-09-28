#pragma once

/* HTTP uses native EthernetServer on Opta (see mv_http.cpp). */
#ifndef MV_HAS_WEBSERVER
#if defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)
#define MV_HAS_WEBSERVER 1
#else
#define MV_HAS_WEBSERVER 0
#endif
#endif

#define MV_HTTP_PORT 80
#define MV_WIFI_HTTP_PORT 8080
#define MV_MAX_TAGS 128
#define MV_AVG_RING 16
#define MV_PROGRAM_JSON_MAX 16384
/** ArduinoJson pool — must exceed raw JSON size (nested AST needs ~2×). */
#define MV_PROGRAM_JSON_POOL 32768
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

// Optional HTTP / WiFi OTA password (empty = no auth). Set before build to enable.
#ifndef MV_OTA_PASSWORD
#define MV_OTA_PASSWORD ""
#endif

/* Serial trace: 1 = verbose [MV] lines on Serial @ 115200. Set 0 to disable. */
#ifndef MV_DEBUG_VERBOSE
#define MV_DEBUG_VERBOSE 1
#endif

#ifndef MV_OTA_QSPI_OFFSET
#define MV_OTA_QSPI_OFFSET 2
#endif
