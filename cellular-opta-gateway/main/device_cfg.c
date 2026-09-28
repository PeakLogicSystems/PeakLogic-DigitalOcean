/*
 * Gateway configuration in NVS — see device_cfg.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "device_cfg.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"

static const char *TAG = "device_cfg";

static void apply_defaults(gateway_cfg_t *cfg)
{
    memset(cfg, 0, sizeof(*cfg));
    strncpy(cfg->cloud_mqtt_host, CONFIG_DEVCFG_CLOUD_MQTT_HOST_DEFAULT,
            sizeof(cfg->cloud_mqtt_host) - 1);
    cfg->cloud_mqtt_port = CONFIG_DEVCFG_CLOUD_MQTT_PORT_DEFAULT;
    cfg->cloud_mqtt_set = false;
    strncpy(cfg->lan_ip, CONFIG_DEVCFG_LAN_IP_DEFAULT, sizeof(cfg->lan_ip) - 1);
    strncpy(cfg->lan_mask, CONFIG_DEVCFG_LAN_MASK_DEFAULT, sizeof(cfg->lan_mask) - 1);
    cfg->local_mqtt_port = CONFIG_DEVCFG_LOCAL_MQTT_PORT_DEFAULT;
    strncpy(cfg->modem_apn, CONFIG_DEVCFG_MODEM_APN_DEFAULT, sizeof(cfg->modem_apn) - 1);
    strncpy(cfg->gateway_id, "gw_lift_01", sizeof(cfg->gateway_id) - 1);
    cfg->wifi_ap_enable = true;
    strncpy(cfg->wifi_ap_ssid, CONFIG_DEVCFG_WIFI_AP_SSID_DEFAULT,
            sizeof(cfg->wifi_ap_ssid) - 1);
    strncpy(cfg->wifi_ap_pass, CONFIG_DEVCFG_WIFI_AP_PASS_DEFAULT,
            sizeof(cfg->wifi_ap_pass) - 1);
}

void gateway_cfg_load(gateway_cfg_t *out)
{
    apply_defaults(out);

    nvs_handle_t h;
    if (nvs_open(GWCFG_NS, NVS_READONLY, &h) != ESP_OK)
    {
        return;
    }

    char tmp[GWCFG_HOST_MAX];
    size_t sz;

    sz = sizeof(tmp);
    if (nvs_get_str(h, "cloud_host", tmp, &sz) == ESP_OK && tmp[0])
    {
        strncpy(out->cloud_mqtt_host, tmp, sizeof(out->cloud_mqtt_host) - 1);
        out->cloud_mqtt_set = true;
    }

    uint16_t port = 0;
    if (nvs_get_u16(h, "cloud_port", &port) == ESP_OK && port)
    {
        out->cloud_mqtt_port = port;
    }

    sz = sizeof(out->cloud_mqtt_user);
    nvs_get_str(h, "cloud_user", out->cloud_mqtt_user, &sz);
    sz = sizeof(out->cloud_mqtt_pass);
    nvs_get_str(h, "cloud_pass", out->cloud_mqtt_pass, &sz);

    sz = sizeof(out->lan_ip);
    nvs_get_str(h, "lan_ip", out->lan_ip, &sz);
    sz = sizeof(out->lan_mask);
    nvs_get_str(h, "lan_mask", out->lan_mask, &sz);

    if (nvs_get_u16(h, "local_port", &port) == ESP_OK && port)
    {
        out->local_mqtt_port = port;
    }

    sz = sizeof(out->modem_apn);
    nvs_get_str(h, "modem_apn", out->modem_apn, &sz);
    sz = sizeof(out->gateway_id);
    nvs_get_str(h, "gateway_id", out->gateway_id, &sz);

    uint8_t ap_en = 1;
    if (nvs_get_u8(h, "wifi_ap_en", &ap_en) == ESP_OK)
    {
        out->wifi_ap_enable = ap_en != 0;
    }

    sz = sizeof(out->wifi_ap_ssid);
    nvs_get_str(h, "wifi_ap_ssid", out->wifi_ap_ssid, &sz);
    sz = sizeof(out->wifi_ap_pass);
    nvs_get_str(h, "wifi_ap_pass", out->wifi_ap_pass, &sz);

    nvs_close(h);
    ESP_LOGI(TAG, "loaded cloud=%s:%u lan=%s local_mqtt=%u",
             out->cloud_mqtt_host, out->cloud_mqtt_port,
             out->lan_ip, out->local_mqtt_port);
}

bool gateway_cfg_save(const gateway_cfg_t *cfg)
{
    if (cfg == NULL)
    {
        return false;
    }

    nvs_handle_t h;
    if (nvs_open(GWCFG_NS, NVS_READWRITE, &h) != ESP_OK)
    {
        return false;
    }

    nvs_set_str(h, "cloud_host", cfg->cloud_mqtt_host);
    nvs_set_u16(h, "cloud_port", cfg->cloud_mqtt_port);
    nvs_set_u8(h, "cloud_set", cfg->cloud_mqtt_set ? 1 : 0);
    nvs_set_str(h, "cloud_user", cfg->cloud_mqtt_user);
    nvs_set_str(h, "cloud_pass", cfg->cloud_mqtt_pass);
    nvs_set_str(h, "lan_ip", cfg->lan_ip);
    nvs_set_str(h, "lan_mask", cfg->lan_mask);
    nvs_set_u16(h, "local_port", cfg->local_mqtt_port);
    nvs_set_str(h, "modem_apn", cfg->modem_apn);
    nvs_set_str(h, "gateway_id", cfg->gateway_id);
    nvs_set_u8(h, "wifi_ap_en", cfg->wifi_ap_enable ? 1 : 0);
    nvs_set_str(h, "wifi_ap_ssid", cfg->wifi_ap_ssid);
    nvs_set_str(h, "wifi_ap_pass", cfg->wifi_ap_pass);

    esp_err_t err = nvs_commit(h);
    nvs_close(h);
    return err == ESP_OK;
}

void gateway_cfg_cloud_uri(const gateway_cfg_t *cfg, char *buf, size_t buf_len)
{
    if (cfg == NULL || buf == NULL || buf_len == 0)
    {
        return;
    }
    snprintf(buf, buf_len, "mqtt://%s:%u", cfg->cloud_mqtt_host, cfg->cloud_mqtt_port);
}
