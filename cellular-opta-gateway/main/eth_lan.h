/*
 * W5500 Ethernet LAN for Opta (T-ETH-Elite).
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include "device_cfg.h"
#include "esp_netif.h"

/** Bring up LAN netif at cfg->lan_ip with DHCP server for Opta. */
bool eth_lan_init(const gateway_cfg_t *cfg, esp_netif_t **out_netif);

bool eth_lan_is_up(void);
void eth_lan_get_ip_str(char *buf, size_t len);

/** Number of DHCP leases handed out (0 if unavailable). */
int eth_lan_client_count(void);
