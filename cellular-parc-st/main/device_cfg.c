#include "device_cfg.h"

#include <string.h>

#include "nvs.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "st/mv_global_key.h"

#define NVS_NS "parc_st"

static parc_st_cfg_t *s_active;

void parc_cfg_set_defaults(parc_st_cfg_t *cfg)
{
    memset(cfg, 0, sizeof(*cfg));
    strncpy(cfg->device_id, "eth_parc_st_01", sizeof(cfg->device_id) - 1);
    strncpy(cfg->device_name, "T-ETH Parc ST", sizeof(cfg->device_name) - 1);
    strncpy(cfg->mqtt_host, CONFIG_DEVCFG_CLOUD_MQTT_HOST_DEFAULT, sizeof(cfg->mqtt_host) - 1);
    cfg->mqtt_port = CONFIG_DEVCFG_CLOUD_MQTT_PORT_DEFAULT;
    strncpy(cfg->topic_prefix, "peaklogic/v1", sizeof(cfg->topic_prefix) - 1);
    cfg->report_ms = 180000;
    strncpy(cfg->modem_apn, CONFIG_DEVCFG_MODEM_APN_DEFAULT, sizeof(cfg->modem_apn) - 1);
    strncpy(cfg->wifi_ap_ssid, CONFIG_DEVCFG_WIFI_AP_SSID_DEFAULT, sizeof(cfg->wifi_ap_ssid) - 1);
    strncpy(cfg->wifi_ap_pass, CONFIG_DEVCFG_WIFI_AP_PASS_DEFAULT, sizeof(cfg->wifi_ap_pass) - 1);
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    strncpy(cfg->wifi_sta_ssid, CONFIG_GATEWAY_WAN_WIFI_SSID, sizeof(cfg->wifi_sta_ssid) - 1);
    strncpy(cfg->wifi_sta_pass, CONFIG_GATEWAY_WAN_WIFI_PASS, sizeof(cfg->wifi_sta_pass) - 1);
#endif
    cfg->autorun = true;
    cfg->device_mode = MV_DEVICE_STANDALONE;
    cfg->global_site_key = 1;
}

static void nvs_get_str_def(nvs_handle_t h, const char *key, char *out, size_t out_len, const char *def)
{
    size_t len = out_len;
    if (nvs_get_str(h, key, out, &len) != ESP_OK) {
        strncpy(out, def, out_len - 1);
        out[out_len - 1] = '\0';
    }
}

void parc_cfg_load(parc_st_cfg_t *cfg)
{
    parc_cfg_set_defaults(cfg);
    s_active = cfg;
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) {
        mvGlobalKeySet(cfg->global_site_key);
        return;
    }
    nvs_get_str_def(h, "device_id", cfg->device_id, sizeof(cfg->device_id), cfg->device_id);
    nvs_get_str_def(h, "device_name", cfg->device_name, sizeof(cfg->device_name), cfg->device_name);
    nvs_get_str_def(h, "mqtt_host", cfg->mqtt_host, sizeof(cfg->mqtt_host), cfg->mqtt_host);
    nvs_get_str_def(h, "mqtt_user", cfg->mqtt_user, sizeof(cfg->mqtt_user), cfg->mqtt_user);
    nvs_get_str_def(h, "mqtt_pass", cfg->mqtt_pass, sizeof(cfg->mqtt_pass), cfg->mqtt_pass);
    nvs_get_str_def(h, "topic_pfx", cfg->topic_prefix, sizeof(cfg->topic_prefix), cfg->topic_prefix);
    nvs_get_str_def(h, "modem_apn", cfg->modem_apn, sizeof(cfg->modem_apn), cfg->modem_apn);
    nvs_get_str_def(h, "ap_ssid", cfg->wifi_ap_ssid, sizeof(cfg->wifi_ap_ssid), cfg->wifi_ap_ssid);
    nvs_get_str_def(h, "ap_pass", cfg->wifi_ap_pass, sizeof(cfg->wifi_ap_pass), cfg->wifi_ap_pass);
    nvs_get_str_def(h, "sta_ssid", cfg->wifi_sta_ssid, sizeof(cfg->wifi_sta_ssid), cfg->wifi_sta_ssid);
    nvs_get_str_def(h, "sta_pass", cfg->wifi_sta_pass, sizeof(cfg->wifi_sta_pass), cfg->wifi_sta_pass);
    uint16_t port = cfg->mqtt_port;
    nvs_get_u16(h, "mqtt_port", &port);
    cfg->mqtt_port = port;
    uint32_t report = cfg->report_ms;
    nvs_get_u32(h, "report_ms", &report);
    cfg->report_ms = report;
    uint8_t autorun = cfg->autorun ? 1 : 0;
    nvs_get_u8(h, "autorun", &autorun);
    cfg->autorun = autorun != 0;
    uint8_t mode = cfg->device_mode;
    nvs_get_u8(h, "dev_mode", &mode);
    cfg->device_mode = (mode == MV_DEVICE_REMOTE_IO) ? MV_DEVICE_REMOTE_IO : MV_DEVICE_STANDALONE;
    uint16_t site = cfg->global_site_key;
    nvs_get_u16(h, "site_key", &site);
    cfg->global_site_key = (site < 1) ? 1 : site;
    nvs_close(h);
    mvGlobalKeySet(cfg->global_site_key);
}

bool parc_cfg_save(const parc_st_cfg_t *cfg)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READWRITE, &h) != ESP_OK) {
        return false;
    }
    nvs_set_str(h, "device_id", cfg->device_id);
    nvs_set_str(h, "device_name", cfg->device_name);
    nvs_set_str(h, "mqtt_host", cfg->mqtt_host);
    nvs_set_str(h, "mqtt_user", cfg->mqtt_user);
    nvs_set_str(h, "mqtt_pass", cfg->mqtt_pass);
    nvs_set_str(h, "topic_pfx", cfg->topic_prefix);
    nvs_set_str(h, "modem_apn", cfg->modem_apn);
    nvs_set_str(h, "ap_ssid", cfg->wifi_ap_ssid);
    nvs_set_str(h, "ap_pass", cfg->wifi_ap_pass);
    nvs_set_str(h, "sta_ssid", cfg->wifi_sta_ssid);
    nvs_set_str(h, "sta_pass", cfg->wifi_sta_pass);
    nvs_set_u16(h, "mqtt_port", cfg->mqtt_port);
    nvs_set_u32(h, "report_ms", cfg->report_ms);
    nvs_set_u8(h, "autorun", cfg->autorun ? 1 : 0);
    nvs_set_u8(h, "dev_mode", cfg->device_mode);
    nvs_set_u16(h, "site_key", cfg->global_site_key < 1 ? 1 : cfg->global_site_key);
    nvs_commit(h);
    nvs_close(h);
    mvGlobalKeySet(cfg->global_site_key);
    if (s_active && s_active != cfg) {
        *s_active = *cfg;
    } else if (!s_active) {
        /* keep pointer if caller passes stable buffer */
    }
    return true;
}

const char *mvDeviceModeString(uint8_t mode)
{
    return (mode == MV_DEVICE_REMOTE_IO) ? "remote_io" : "standalone";
}

uint8_t mvDeviceModeActive(void)
{
    return s_active ? s_active->device_mode : MV_DEVICE_STANDALONE;
}

bool mvDeviceModeRemoteIo(void)
{
    return mvDeviceModeActive() == MV_DEVICE_REMOTE_IO;
}

bool mvDeviceModeSet(uint8_t mode)
{
    if (!s_active) {
        return false;
    }
    if (mode != MV_DEVICE_STANDALONE && mode != MV_DEVICE_REMOTE_IO) {
        return false;
    }
    s_active->device_mode = mode;
    return parc_cfg_save(s_active);
}
