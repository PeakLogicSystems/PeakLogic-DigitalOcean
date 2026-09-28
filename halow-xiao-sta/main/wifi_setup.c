/*
 * Wi-Fi setup AP — see wifi_setup.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "wifi_setup.h"

#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

static const char *TAG = "wifi_setup";
static bool s_ap_active;

bool wifi_setup_start_ap(const device_cfg_t *cfg)
{
    s_ap_active = false;
    if (cfg == NULL || !cfg->wifi_ap_enable)
    {
        return false;
    }
    if (strlen(cfg->wifi_ap_pass) < 8)
    {
        ESP_LOGW(TAG, "Wi-Fi AP password must be >= 8 chars");
        return false;
    }

    esp_netif_t *ap_netif = esp_netif_create_default_wifi_ap();

    esp_netif_ip_info_t ip_info = {
        .ip = { .addr = ESP_IP4TOADDR(192, 168, 4, 1) },
        .gw = { .addr = ESP_IP4TOADDR(192, 168, 4, 1) },
        .netmask = { .addr = ESP_IP4TOADDR(255, 255, 255, 0) },
    };
    esp_netif_dhcps_stop(ap_netif);
    esp_netif_set_ip_info(ap_netif, &ip_info);
    esp_netif_dhcps_start(ap_netif);

    wifi_init_config_t wcfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&wcfg));
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));

    wifi_config_t ap = { 0 };
    strncpy((char *)ap.ap.ssid, cfg->wifi_ap_ssid, sizeof(ap.ap.ssid) - 1);
    strncpy((char *)ap.ap.password, cfg->wifi_ap_pass, sizeof(ap.ap.password) - 1);
    ap.ap.ssid_len = strlen(cfg->wifi_ap_ssid);
    ap.ap.channel = 1;
    ap.ap.max_connection = 4;
    ap.ap.authmode = WIFI_AUTH_WPA2_PSK;

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    ESP_ERROR_CHECK(esp_wifi_start());

    s_ap_active = true;
    ESP_LOGI(TAG, "Setup AP '%s' -> http://192.168.4.1:%d/setup",
             cfg->wifi_ap_ssid, CONFIG_DEVCFG_WIFI_AP_HTTP_PORT);
    return true;
}

bool wifi_setup_ap_active(void)
{
    return s_ap_active;
}
