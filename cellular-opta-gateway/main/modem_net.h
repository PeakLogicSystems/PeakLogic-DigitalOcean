/*
 * Cellular WAN (A7670 LTE shield) via esp_modem.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include "device_cfg.h"
#include "esp_netif.h"

bool modem_net_init(const gateway_cfg_t *cfg, esp_netif_t **out_wan_netif);
void modem_net_poll(void);
bool modem_net_is_up(void);
void modem_net_get_ip_str(char *buf, size_t len);
int modem_net_rssi(void);

/** Ping host over cellular/WAN PPP (e.g. 8.8.8.8 gateway test). */
bool modem_net_ping(const char *host, int *rtt_ms, char *msg, size_t msg_len);
