#pragma once

/* Local HTTP /setup needs EthernetWebServer (Library Manager: "EthernetWebServer" by Khoi Hoang). */
#ifndef PL_HAS_WEBSERVER
#if defined(__has_include)
#if __has_include(<EthernetWebServer.h>)
#define PL_HAS_WEBSERVER 1
#else
#define PL_HAS_WEBSERVER 0
#endif
#else
#define PL_HAS_WEBSERVER 0
#endif
#endif

#define PL_HTTP_PORT 80
#define PL_WIFI_HTTP_PORT 8080
#define PL_MAX_TAGS 128
#define PL_AVG_RING 16
#define PL_PROGRAM_JSON_MAX 16384
#define PL_SCAN_MS_DEFAULT 100

// WiFi setup AP (Opta WiFi variant)
#ifndef PL_WIFI_AP_SSID
#define PL_WIFI_AP_SSID "PeakLogic-Opta"
#endif
#ifndef PL_WIFI_AP_PASS
#define PL_WIFI_AP_PASS "peaklogic"
#endif
#ifndef PL_WIFI_AP_IP
#define PL_WIFI_AP_IP 192, 168, 4, 1
#endif

// Opta pin map (adjust for your model — see README)
#ifndef PL_DIN_PIN0
#define PL_DIN_PIN0 A0
#endif
#ifndef PL_RELAY_PIN0
#define PL_RELAY_PIN0 D0
#endif
