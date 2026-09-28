/*
 * Wi-Fi setup AP + optional bench WAN STA — see wifi_setup.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "wifi_setup.h"

#include <string.h>

#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "sdkconfig.h"

static const char *TAG = "wifi_setup";
static bool s_ap_active;
static bool s_sta_up;
static esp_netif_t *s_sta_netif;

bool wifi_setup_start_ap(const gateway_cfg_t *cfg)
{
    s_ap_active = false;
    if (cfg == NULL || !cfg->wifi_ap_enable)
    {
        return false;
    }

    esp_netif_create_default_wifi_ap();

    wifi_init_config_t wcfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_err_t err = esp_wifi_init(&wcfg);
    if (err != ESP_OK && err != ESP_ERR_WIFI_INIT_STATE)
    {
        ESP_LOGE(TAG, "wifi init %s", esp_err_to_name(err));
        return false;
    }

    wifi_config_t ap = { 0 };
    strncpy((char *)ap.ap.ssid, cfg->wifi_ap_ssid, sizeof(ap.ap.ssid) - 1);
    ap.ap.ssid_len = strlen(cfg->wifi_ap_ssid);
    ap.ap.channel = 1;
    ap.ap.max_connection = 4;
    ap.ap.pmf_cfg.required = false;
    ap.ap.pmf_cfg.capable = false;
    /* Open AP avoids WPA/crypto crash on ESP-IDF 6 during bench provisioning. */
    ap.ap.authmode = WIFI_AUTH_OPEN;

#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
#else
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
#endif

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    ESP_ERROR_CHECK(esp_wifi_start());

    s_ap_active = true;
    ESP_LOGI(TAG, "Setup AP '%s' (open) -> http://192.168.4.1:%d/setup",
             cfg->wifi_ap_ssid, CONFIG_DEVCFG_WIFI_AP_HTTP_PORT);
    return true;
}

bool wifi_setup_ap_active(void)
{
    return s_ap_active;
}

static void on_sta_got_ip(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)base;
    (void)id;
    (void)data;
    s_sta_up = true;
    ESP_LOGI(TAG, "WAN Wi-Fi STA got IP");
}

bool wifi_wan_start_sta(void)
{
#if !CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    return false;
#else
    s_sta_up = false;
    s_sta_netif = esp_netif_create_default_wifi_sta();

    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_sta_got_ip, NULL);

    wifi_config_t sta = { 0 };
    strncpy((char *)sta.sta.ssid, CONFIG_GATEWAY_WAN_WIFI_SSID, sizeof(sta.sta.ssid) - 1);
    strncpy((char *)sta.sta.password, CONFIG_GATEWAY_WAN_WIFI_PASS, sizeof(sta.sta.password) - 1);
    sta.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    esp_wifi_set_config(WIFI_IF_STA, &sta);
    esp_wifi_connect();
    ESP_LOGI(TAG, "Bench WAN STA connecting to '%s'", CONFIG_GATEWAY_WAN_WIFI_SSID);
    return true;
#endif
}

bool wifi_wan_is_up(void)
{
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    return s_sta_up;
#else
    return false;
#endif
}

void wifi_wan_get_ip_str(char *buf, size_t len)
{
    if (buf == NULL || len == 0)
    {
        return;
    }
    buf[0] = '\0';
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    if (s_sta_netif == NULL)
    {
        return;
    }
    esp_netif_ip_info_t info;
    if (esp_netif_get_ip_info(s_sta_netif, &info) == ESP_OK)
    {
        snprintf(buf, len, IPSTR, IP2STR(&info.ip));
    }
#endif
}
