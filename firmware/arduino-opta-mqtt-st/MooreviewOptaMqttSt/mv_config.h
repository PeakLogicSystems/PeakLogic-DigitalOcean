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
#define MV_DEBUG_VERBOSE 1
#endif

#define MV_HTTP_PORT 80
#define MV_WIFI_HTTP_PORT 8080
#define MV_MAX_TAGS 192
#define MV_AVG_RING 16
#define MV_PROGRAM_JSON_MAX 16384
#define MV_BC_MAX 16384
/**
 * PubSubClient packet buffer — must be defined before <PubSubClient.h> is first included,
 * otherwise the library locks in its 256 B default and put_program is silently dropped.
 */
#ifndef MQTT_MAX_PACKET_SIZE
#define MQTT_MAX_PACKET_SIZE 16384
#endif
#define MV_MQTT_CMD_BUF 16384
#ifndef MV_MQTT_MIN_PACKET_SIZE
#define MV_MQTT_MIN_PACKET_SIZE 2048
#endif
#define MV_SCAN_MS_DEFAULT 100
#ifndef MV_REPORT_MS_DEFAULT
#define MV_REPORT_MS_DEFAULT 180000
#endif
#ifndef MV_REPORT_MS_MIN
#define MV_REPORT_MS_MIN 100
#endif
#ifndef MV_REPORT_MS_MAX
#define MV_REPORT_MS_MAX 600000
#endif

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

/** mbed_opta Opta — WiFi library in core (AP needs WiFi hardware + WiFiFirmwareUpdater). */
#if defined(ARDUINO_OPTA) || defined(MV_FORCE_WIFI)
#define MV_HAS_WIFI 1
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

/** Sketch / empty-NV defaults — mqtt.peaklogic.io (Phase 1 ATL MOSQUITTO_*). */
#ifndef MV_MQTT_SKETCH_BROKER_DEFAULT
#define MV_MQTT_SKETCH_BROKER_DEFAULT "mqtt.peaklogic.io"
#endif
/** Local PeakLogic appliance / PC broker when TLS is off (plain :1883). */
#ifndef MV_MQTT_LAN_BROKER_DEFAULT
#define MV_MQTT_LAN_BROKER_DEFAULT "192.168.1.233"
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

/* Hardware + liveness watchdog (mv_watchdog.cpp) */
#ifndef MV_WATCHDOG_ENABLE
#if defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)
#define MV_WATCHDOG_ENABLE 1
#else
#define MV_WATCHDOG_ENABLE 0
#endif
#endif
#ifndef MV_WATCHDOG_TIMEOUT_MS
#define MV_WATCHDOG_TIMEOUT_MS 30000
#endif
#ifndef MV_WATCHDOG_LIVENESS_MS
#define MV_WATCHDOG_LIVENESS_MS 120000
#endif
#ifndef MV_WATCHDOG_BOOT_GRACE_MS
#define MV_WATCHDOG_BOOT_GRACE_MS 120000
#endif

/** RS485 fieldbus master on Opta (edge poll → MQTT tags). Compile with -DMV_FIELDBUS=1 */
#ifndef MV_FIELDBUS
#define MV_FIELDBUS 0
#endif

/** Opta M4 FFT MCSA: M7 ingests I1–I6 every MV_MCSA_INGEST_MS, M4 cooks spectra. */
#ifndef MV_MCSA_M4
#define MV_MCSA_M4 1
#endif
#ifndef MV_MCSA_INGEST_MS
#define MV_MCSA_INGEST_MS 300000ul
#endif
/**
 * 0 = DC RMS 0–1 V transmitters (final default): 16-bit ADC, scan oversample,
 * M4 residual ripple / load modulation (not 60 Hz sidebands).
 * 1 = AC CT + mid-rail bias (true line MCSA).
 */
#ifndef MV_CT_WAVEFORM
#define MV_CT_WAVEFORM 0
#endif
/**
 * 50 mA CT secondary: burden/shunt ohms from analog input to GND (not series).
 * 0 = voltage transmitter (0–1 V). Example: 180 Ω → 9 V at 50 mA on 0–10 V inputs.
 * Do not use AFX00007 current mode (25 mA max) with a 50 mA CT.
 */
#ifndef MV_CT_BURDEN_OHM
#define MV_CT_BURDEN_OHM 0
#endif
#ifndef MV_CT_MA_FS
#define MV_CT_MA_FS 50.0f
#endif
