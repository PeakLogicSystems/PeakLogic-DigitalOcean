/*
 * Wi-Fi setup AP — provisioning only (192.168.4.1).
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include "device_cfg.h"

bool wifi_setup_start_ap(const gateway_cfg_t *cfg);
bool wifi_setup_ap_active(void);

/** Bench WAN: connect ESP32 STA to office Wi-Fi (menuconfig GATEWAY_WAN_WIFI_FALLBACK). */
bool wifi_wan_start_sta(void);
bool wifi_wan_is_up(void);
void wifi_wan_get_ip_str(char *buf, size_t len);
