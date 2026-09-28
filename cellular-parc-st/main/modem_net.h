#pragma once
#include <stdbool.h>
#include <stddef.h>
#include "esp_netif.h"
#include "device_cfg.h"

bool modem_net_init(const parc_st_cfg_t *cfg);
void modem_net_poll(void);
bool modem_net_is_up(void);
void modem_net_get_ip_str(char *buf, size_t len);
int modem_net_rssi(void);
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
bool modem_net_apply_sta(const parc_st_cfg_t *cfg);
#endif
