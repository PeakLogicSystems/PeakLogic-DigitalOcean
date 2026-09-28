#include "wifi_setup.h"

#include <string.h>

#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "sdkconfig.h"

static const char *TAG = "wifi_setup";

bool wifi_setup_start_ap(const parc_st_cfg_t *cfg)
{
    if (!cfg) {
        return false;
    }
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t icfg = WIFI_INIT_CONFIG_DEFAULT();
    /* May already be inited by WAN STA — ignore ESP_ERR_WIFI_INIT_STATE */
    esp_err_t err = esp_wifi_init(&icfg);
    if (err != ESP_OK && err != ESP_ERR_WIFI_INIT_STATE) {
        ESP_LOGE(TAG, "wifi init %s", esp_err_to_name(err));
        return false;
    }

    wifi_config_t ap = { 0 };
    strncpy((char *)ap.ap.ssid, cfg->wifi_ap_ssid, sizeof(ap.ap.ssid));
    strncpy((char *)ap.ap.password, cfg->wifi_ap_pass, sizeof(ap.ap.password));
    ap.ap.ssid_len = strlen(cfg->wifi_ap_ssid);
    ap.ap.channel = 1;
    ap.ap.max_connection = 4;
    ap.ap.authmode = WIFI_AUTH_WPA2_PSK;
    if (strlen(cfg->wifi_ap_pass) < 8) {
        ap.ap.authmode = WIFI_AUTH_OPEN;
    }

#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
#else
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
#endif
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_LOGI(TAG, "setup AP '%s' @ 192.168.4.1", cfg->wifi_ap_ssid);
    return true;
}
