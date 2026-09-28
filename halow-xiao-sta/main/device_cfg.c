/*
 * Device configuration in NVS — see device_cfg.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "device_cfg.h"

#include "sensor_templates.h"

#include <stdio.h>
#include <string.h>

#include "nvs.h"
#include "nvs_flash.h"
#include "esp_log.h"

static const char *TAG = "device_cfg";

static void apply_defaults(device_cfg_t *cfg)
{
    memset(cfg, 0, sizeof(*cfg));
    strncpy(cfg->mqtt_broker_host, CONFIG_DEVCFG_MQTT_BROKER_DEFAULT,
            sizeof(cfg->mqtt_broker_host) - 1);
    cfg->mqtt_broker_port = CONFIG_DEVCFG_MQTT_PORT_DEFAULT;
    cfg->mqtt_broker_set = false;
    strncpy(cfg->device_id, CONFIG_PARC_DEVICE_ID, sizeof(cfg->device_id) - 1);
    strncpy(cfg->device_name, CONFIG_PARC_DEVICE_NAME, sizeof(cfg->device_name) - 1);
    cfg->global_site_key = CONFIG_PARC_GLOBAL_SITE_KEY;
    strncpy(cfg->halow_ip, CONFIG_DEVCFG_HALOW_IP_DEFAULT, sizeof(cfg->halow_ip) - 1);
    strncpy(cfg->halow_gw, CONFIG_DEVCFG_HALOW_GW_DEFAULT, sizeof(cfg->halow_gw) - 1);
    strncpy(cfg->halow_mask, CONFIG_DEVCFG_HALOW_MASK_DEFAULT, sizeof(cfg->halow_mask) - 1);
    cfg->wifi_ap_enable = true;
    strncpy(cfg->wifi_ap_ssid, CONFIG_DEVCFG_WIFI_AP_SSID_DEFAULT,
            sizeof(cfg->wifi_ap_ssid) - 1);
    strncpy(cfg->wifi_ap_pass, CONFIG_DEVCFG_WIFI_AP_PASS_DEFAULT,
            sizeof(cfg->wifi_ap_pass) - 1);
    cfg->sensor_template = CONFIG_DEVCFG_SENSOR_TEMPLATE_DEFAULT;
}

void device_cfg_load(device_cfg_t *out)
{
    apply_defaults(out);

    nvs_handle_t h;
    if (nvs_open(DEVCFG_NS, NVS_READONLY, &h) != ESP_OK)
    {
        return;
    }

    size_t sz;
    char tmp[DEVCFG_MQTT_HOST_MAX];

    sz = sizeof(tmp);
    if (nvs_get_str(h, "mqtt_host", tmp, &sz) == ESP_OK && tmp[0])
    {
        strncpy(out->mqtt_broker_host, tmp, sizeof(out->mqtt_broker_host) - 1);
        out->mqtt_broker_set = true;
    }

    uint16_t port = 0;
    if (nvs_get_u16(h, "mqtt_port", &port) == ESP_OK && port)
    {
        out->mqtt_broker_port = port;
    }

    sz = sizeof(tmp);
    if (nvs_get_str(h, "dev_id", tmp, &sz) == ESP_OK && tmp[0])
    {
        strncpy(out->device_id, tmp, sizeof(out->device_id) - 1);
    }

    sz = sizeof(out->device_name);
    if (nvs_get_str(h, "dev_name", out->device_name, &sz) == ESP_OK && out->device_name[0])
    {
        /* loaded */
    }

    int32_t site = 0;
    if (nvs_get_i32(h, "site_key", &site) == ESP_OK && site > 0)
    {
        out->global_site_key = site;
    }

    sz = sizeof(out->halow_ip);
    nvs_get_str(h, "halow_ip", out->halow_ip, &sz);
    sz = sizeof(out->halow_gw);
    nvs_get_str(h, "halow_gw", out->halow_gw, &sz);
    sz = sizeof(out->halow_mask);
    nvs_get_str(h, "halow_mask", out->halow_mask, &sz);

    uint8_t ap_en = 1;
    if (nvs_get_u8(h, "wifi_ap_en", &ap_en) == ESP_OK)
    {
        out->wifi_ap_enable = ap_en != 0;
    }

    sz = sizeof(out->wifi_ap_ssid);
    nvs_get_str(h, "wifi_ap_ssid", out->wifi_ap_ssid, &sz);
    sz = sizeof(out->wifi_ap_pass);
    nvs_get_str(h, "wifi_ap_pass", out->wifi_ap_pass, &sz);

    uint8_t tpl = 0;
    if (nvs_get_u8(h, "sensor_tpl", &tpl) == ESP_OK && tpl >= SENS_TPL_ID_MECH
        && tpl <= SENS_TPL_ID_MAX)
    {
        out->sensor_template = tpl;
    }

    nvs_close(h);
    ESP_LOGI(TAG, "config loaded broker=%s:%u halow=%s",
             out->mqtt_broker_host, out->mqtt_broker_port, out->halow_ip);
}

bool device_cfg_save(const device_cfg_t *cfg)
{
    if (cfg == NULL)
    {
        return false;
    }

    nvs_handle_t h;
    if (nvs_open(DEVCFG_NS, NVS_READWRITE, &h) != ESP_OK)
    {
        return false;
    }

    nvs_set_str(h, "mqtt_host", cfg->mqtt_broker_host);
    nvs_set_u16(h, "mqtt_port", cfg->mqtt_broker_port);
    nvs_set_u8(h, "mqtt_set", cfg->mqtt_broker_set ? 1 : 0);
    nvs_set_str(h, "dev_id", cfg->device_id);
    nvs_set_str(h, "dev_name", cfg->device_name);
    nvs_set_i32(h, "site_key", cfg->global_site_key);
    nvs_set_str(h, "halow_ip", cfg->halow_ip);
    nvs_set_str(h, "halow_gw", cfg->halow_gw);
    nvs_set_str(h, "halow_mask", cfg->halow_mask);
    nvs_set_u8(h, "wifi_ap_en", cfg->wifi_ap_enable ? 1 : 0);
    nvs_set_str(h, "wifi_ap_ssid", cfg->wifi_ap_ssid);
    nvs_set_str(h, "wifi_ap_pass", cfg->wifi_ap_pass);
    nvs_set_u8(h, "sensor_tpl", cfg->sensor_template);

    esp_err_t err = nvs_commit(h);
    nvs_close(h);
    return err == ESP_OK;
}

void device_cfg_mqtt_uri(const device_cfg_t *cfg, char *buf, size_t buf_len)
{
    if (cfg == NULL || buf == NULL || buf_len == 0)
    {
        return;
    }
    snprintf(buf, buf_len, "mqtt://%s:%u", cfg->mqtt_broker_host, cfg->mqtt_broker_port);
}
