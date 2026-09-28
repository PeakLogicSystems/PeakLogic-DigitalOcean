/*
 * Raw Ethernet over TX-AH — see halow_net.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "halow_net.h"

#include <string.h>

#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_net_stack.h"

#include "tx_ah.h"

static const char *TAG = "halow_net";

static esp_netif_t *s_netif;
static bool s_up;

static void on_rx_frame(const uint8_t *frame, size_t len)
{
    if (s_netif != NULL && len >= 14)
    {
        esp_netif_receive(s_netif, (void *)frame, len, NULL);
    }
}

static esp_err_t halow_transmit(void *h, void *buffer, size_t len)
{
    (void)h;
    return tx_ah_send_frame((const uint8_t *)buffer, len) ? ESP_OK : ESP_FAIL;
}

bool halow_net_init(const device_cfg_t *cfg, esp_netif_t **netif_out)
{
    if (cfg == NULL)
    {
        return false;
    }

    esp_netif_inherent_config_t eth_cfg = ESP_NETIF_INHERENT_DEFAULT_ETH();
    eth_cfg.if_key = "HALOW_ETH";
    eth_cfg.if_desc = "halow";

    esp_netif_driver_ifconfig_t driver_cfg = {
        .handle = (void *)1, /* non-NULL required by set_driver_config */
        .transmit = halow_transmit,
    };

    esp_netif_config_t netif_config = {
        .base = &eth_cfg,
        .driver = &driver_cfg,
        .stack = ESP_NETIF_NETSTACK_DEFAULT_ETH,
    };

    s_netif = esp_netif_new(&netif_config);
    if (s_netif == NULL)
    {
        ESP_LOGE(TAG, "esp_netif_new failed");
        return false;
    }

    uint8_t mac[6];
    if (tx_ah_get_mac(mac))
    {
        esp_netif_set_mac(s_netif, mac);
    }

    esp_netif_dhcpc_stop(s_netif);
    esp_netif_ip_info_t ip = { 0 };
    ip.ip.addr = esp_ip4addr_aton(cfg->halow_ip);
    ip.gw.addr = esp_ip4addr_aton(cfg->halow_gw);
    ip.netmask.addr = esp_ip4addr_aton(cfg->halow_mask);
    esp_netif_set_ip_info(s_netif, &ip);

    tx_ah_set_frame_handler(on_rx_frame);

    esp_netif_action_start(s_netif, NULL, 0, NULL);
    esp_netif_action_connected(s_netif, NULL, 0, NULL);
    esp_netif_set_default_netif(s_netif);

    s_up = true;
    if (netif_out != NULL)
    {
        *netif_out = s_netif;
    }

    ESP_LOGI(TAG, "HaLow netif up %s gw %s", cfg->halow_ip, cfg->halow_gw);
    return true;
}

esp_netif_t *halow_net_get(void)
{
    return s_netif;
}

bool halow_net_is_up(void)
{
    return s_up && s_netif != NULL;
}

bool halow_net_get_ip_str(char *buf, size_t len)
{
    if (buf == NULL || len == 0 || s_netif == NULL)
    {
        return false;
    }
    esp_netif_ip_info_t ip;
    if (esp_netif_get_ip_info(s_netif, &ip) != ESP_OK)
    {
        strncpy(buf, "0.0.0.0", len);
        buf[len - 1] = '\0';
        return false;
    }
    esp_ip4addr_ntoa(&ip.ip, buf, len);
    return true;
}
