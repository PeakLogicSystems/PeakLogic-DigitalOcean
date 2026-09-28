/*
 * ESP32 2.4 GHz Wi-Fi station helper for LilyGO T-HaLow.
 *
 * The TX-AH HaLow module does not expose a TCP/IP stack to the ESP32. MQTT
 * reaches the PeakLogic broker over the ESP32's built-in Wi-Fi interface.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

/** Init NVS, TCP/IP, event loop, and connect as a Wi-Fi station. Blocks until IP. */
bool wifi_net_connect(char *ip_out, size_t ip_out_len);

bool wifi_net_is_connected(void);

/** Current Wi-Fi AP RSSI in dBm (for MQTT-path telemetry). */
bool wifi_net_get_rssi(int32_t *rssi_dbm);
