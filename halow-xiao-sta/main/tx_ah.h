/*
 * Taixin TX-AH Wi-Fi HaLow module driver for LilyGO T-HaLow (UART AT commands).
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum
{
    TX_AH_STA_DISABLED = 0,
    TX_AH_STA_CONNECTING,
    TX_AH_STA_CONNECTED,
} tx_ah_sta_state_t;

typedef void (*tx_ah_frame_cb_t)(const uint8_t *frame, size_t len);

bool tx_ah_init(void);
bool tx_ah_pair_and_connect(uint32_t timeout_ms);
bool tx_ah_apply_credentials(const char *ssid, const char *psk_hex_or_null);
void tx_ah_poll(void);

tx_ah_sta_state_t tx_ah_get_state(void);
bool tx_ah_is_connected(void);
bool tx_ah_get_rssi(int32_t *rssi_dbm);
bool tx_ah_get_mac(uint8_t mac[6]);

/** Raw Ethernet frame TX (includes 14-byte header; used by halow_net). */
bool tx_ah_send_frame(const uint8_t *frame, size_t len);

/** Deliver incoming Ethernet frames from the UART RX task. */
void tx_ah_set_frame_handler(tx_ah_frame_cb_t cb);
