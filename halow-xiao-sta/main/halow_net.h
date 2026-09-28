/*
 * Raw Ethernet over the TX-AH HaLow link (L2). Used by lwIP for MQTT/TCP.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include "device_cfg.h"
#include "esp_netif.h"

/** Create esp_netif, static IP from cfg, attach TX-AH frame driver. */
bool halow_net_init(const device_cfg_t *cfg, esp_netif_t **netif_out);

esp_netif_t *halow_net_get(void);
bool halow_net_is_up(void);
bool halow_net_get_ip_str(char *buf, size_t len);
