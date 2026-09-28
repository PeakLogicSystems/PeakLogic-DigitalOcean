/*
 * /setup + /api/status HTTP on AP — Opta Parc parity fields for cloud-arduino.
 * SPDX-License-Identifier: Apache-2.0
 */
#include "setup_web.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "sdkconfig.h"

#include "modem_net.h"
#include "mqtt_parc.h"
#include "st/mv_config.h"
#include "st/mv_global_key.h"
#include "st/mv_io.h"
#include "st/mv_program.h"
#include "st/mv_rtc.h"
#include "st/mv_tags.h"

static const char *TAG = "setup_web";
static parc_st_cfg_t *s_cfg;
static httpd_handle_t s_server;

static void form_get(const char *body, const char *key, char *out, size_t out_len)
{
    out[0] = '\0';
    char needle[48];
    snprintf(needle, sizeof(needle), "%s=", key);
    const char *p = strstr(body, needle);
    if (!p) {
        return;
    }
    p += strlen(needle);
    size_t i = 0;
    while (*p && *p != '&' && i + 1 < out_len) {
        if (*p == '+') {
            out[i++] = ' ';
            p++;
        } else if (*p == '%' && p[1] && p[2]) {
            char hex[3] = { p[1], p[2], 0 };
            out[i++] = (char)strtol(hex, NULL, 16);
            p += 3;
        } else {
            out[i++] = *p++;
        }
    }
    out[i] = '\0';
}

static uint16_t parse_site_key(const char *s)
{
    if (!s || !s[0]) {
        return 1;
    }
    char *end = NULL;
    unsigned long v;
    if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) {
        v = strtoul(s, &end, 16);
    } else {
        v = strtoul(s, &end, 0);
    }
    if (v < 1 || v > 65535) {
        return 1;
    }
    return (uint16_t)v;
}

static esp_err_t setup_get(httpd_req_t *req)
{
    char wan_ip[16] = "not connected";
    char wan_status[48] = "down";
    if (modem_net_is_up()) {
        modem_net_get_ip_str(wan_ip, sizeof(wan_ip));
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
        snprintf(wan_status, sizeof(wan_status), "Wi-Fi connected (RSSI %d)", modem_net_rssi());
#else
        snprintf(wan_status, sizeof(wan_status), "LTE connected (RSSI %d)", modem_net_rssi());
#endif
    } else {
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
        snprintf(wan_status, sizeof(wan_status), "Wi-Fi connecting…");
#else
        snprintf(wan_status, sizeof(wan_status), "LTE connecting…");
#endif
    }

    char addr[5];
    mvGlobalAddrKey(addr);
    const char *mode = mvDeviceModeString(s_cfg->device_mode);

    char page[5120];
    int n = snprintf(page, sizeof(page),
                     "<!DOCTYPE html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
                     "<title>Parc ST Setup</title>"
                     "<style>body{font-family:sans-serif;max-width:28rem;margin:1rem;color:#0f172a}"
                     "h1,h2{font-size:1.1rem}h2{margin-top:1.25rem}"
                     ".card{border:1px solid #cbd5e1;border-radius:8px;padding:1rem;margin:.75rem 0}"
                     "label{display:block;margin:.35rem 0;font-size:.9rem}"
                     "input,select{width:100%%;padding:.35rem .5rem;box-sizing:border-box}"
                     ".muted{color:#64748b;font-size:.85rem}"
                     "button{padding:.45rem .9rem;border:1px solid #64748b;border-radius:6px;background:#e2e8f0;cursor:pointer}"
                     "a{color:#0369a1}</style></head><body>"
                     "<h1>PeakLogic Parc ST</h1>"
                     "<p class=muted>ESP32 soft PLC — T-ETH-ELITE · fw %s · Opta Parc protocol</p>"
                     "<p class=muted><a href=/api/status>/api/status</a></p>"
                     "<form method=POST action=/setup>"
                     "<div class=card><h2>Device</h2>"
                     "<label>Device ID<br><input name=device_id value='%s'></label>"
                     "<label>Name<br><input name=device_name value='%s'></label>"
                     "<label>Device mode<br><select name=device_mode>"
                     "<option value=standalone %s>Standalone (ST on device)</option>"
                     "<option value=remote_io %s>Remote I/O (PC runs ST)</option>"
                     "</select></label>"
                     "<label>Global site key<br><input name=global_site_key value='0x%04x' "
                     "placeholder='1 or 0x0001'></label>"
                     "<p class=muted>Addr key: %s — must match Cloud Studio mqttParc.globalSiteKey</p>"
                     "</div>"
                     "<div class=card><h2>Setup Wi-Fi AP</h2>"
                     "<p class=muted>Join this network to open this page. Reboot to apply AP changes.</p>"
                     "<label>AP SSID<br><input name=wifi_ap_ssid value='%s'></label>"
                     "<label>AP password (min 8 chars)<br><input name=wifi_ap_pass type=password value='%s'></label></div>",
                     MV_FIRMWARE_VERSION, s_cfg->device_id, s_cfg->device_name,
                     strcmp(mode, "standalone") == 0 ? "selected" : "",
                     strcmp(mode, "remote_io") == 0 ? "selected" : "",
                     (unsigned)s_cfg->global_site_key, addr, s_cfg->wifi_ap_ssid,
                     s_cfg->wifi_ap_pass);

#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    n += snprintf(page + n, sizeof(page) - (size_t)n,
                  "<div class=card><h2>Router Wi-Fi (WAN)</h2>"
                  "<p class=muted>No modem — connect to office/home router for cloud-arduino testing "
                  "(same path as Opta Ethernet→cloud).</p>"
                  "<label>Router SSID<br><input name=wifi_sta_ssid value='%s'></label>"
                  "<label>Router password<br><input name=wifi_sta_pass type=password value='%s'></label>"
                  "<p class=muted>WAN: <strong>%s</strong> — IP %s</p></div>",
                  s_cfg->wifi_sta_ssid, s_cfg->wifi_sta_pass, wan_status, wan_ip);
#else
    n += snprintf(page + n, sizeof(page) - (size_t)n,
                  "<div class=card><h2>Cellular</h2>"
                  "<p class=muted>WAN: <strong>%s</strong> — IP %s</p>"
                  "<label>APN<br><input name=modem_apn value='%s'></label></div>",
                  wan_status, wan_ip, s_cfg->modem_apn);
#endif

    n += snprintf(page + n, sizeof(page) - (size_t)n,
                  "<div class=card><h2>Cloud MQTT (arduino / Opta path)</h2>"
                  "<p class=muted>Droplet Mosquitto :1883 — user/pass from MOSQUITTO_* on cloud.</p>"
                  "<label>Host<br><input name=mqtt_host value='%s'></label>"
                  "<label>Port<br><input name=mqtt_port value='%u'></label>"
                  "<label>User<br><input name=mqtt_user value='%s'></label>"
                  "<label>Password (≤47 chars)<br><input name=mqtt_pass type=password value='%s'></label>"
                  "<p class=muted>MQTT %s · ST %s · program %s</p></div>"
                  "<button type=submit>Save</button></form></body></html>",
                  s_cfg->mqtt_host, s_cfg->mqtt_port, s_cfg->mqtt_user, s_cfg->mqtt_pass,
                  mqtt_parc_connected() ? "up" : "down",
                  mvRuntimeIsRunning() ? "running" : "stopped",
                  mvProgramValid() ? mvProgramName() : "(none)");

    if (n < 0 || n >= (int)sizeof(page)) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "page too large");
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, page, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t setup_post(httpd_req_t *req)
{
    char buf[1400];
    int r = httpd_req_recv(req, buf, sizeof(buf) - 1);
    if (r <= 0) {
        return ESP_FAIL;
    }
    buf[r] = '\0';
    form_get(buf, "device_id", s_cfg->device_id, sizeof(s_cfg->device_id));
    form_get(buf, "device_name", s_cfg->device_name, sizeof(s_cfg->device_name));
    form_get(buf, "mqtt_host", s_cfg->mqtt_host, sizeof(s_cfg->mqtt_host));
    form_get(buf, "mqtt_user", s_cfg->mqtt_user, sizeof(s_cfg->mqtt_user));
    form_get(buf, "mqtt_pass", s_cfg->mqtt_pass, sizeof(s_cfg->mqtt_pass));
    form_get(buf, "wifi_ap_ssid", s_cfg->wifi_ap_ssid, sizeof(s_cfg->wifi_ap_ssid));
    form_get(buf, "wifi_ap_pass", s_cfg->wifi_ap_pass, sizeof(s_cfg->wifi_ap_pass));
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    form_get(buf, "wifi_sta_ssid", s_cfg->wifi_sta_ssid, sizeof(s_cfg->wifi_sta_ssid));
    form_get(buf, "wifi_sta_pass", s_cfg->wifi_sta_pass, sizeof(s_cfg->wifi_sta_pass));
#else
    form_get(buf, "modem_apn", s_cfg->modem_apn, sizeof(s_cfg->modem_apn));
#endif
    char port[16], mode[24], site[24];
    form_get(buf, "mqtt_port", port, sizeof(port));
    form_get(buf, "device_mode", mode, sizeof(mode));
    form_get(buf, "global_site_key", site, sizeof(site));
    if (port[0]) {
        s_cfg->mqtt_port = (uint16_t)atoi(port);
    }
    if (strcmp(mode, "remote_io") == 0) {
        s_cfg->device_mode = MV_DEVICE_REMOTE_IO;
    } else if (mode[0]) {
        s_cfg->device_mode = MV_DEVICE_STANDALONE;
    }
    if (site[0]) {
        s_cfg->global_site_key = parse_site_key(site);
    }
    parc_cfg_save(s_cfg);
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    modem_net_apply_sta(s_cfg);
#endif
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req,
                           "<html><body><h2>Saved</h2>"
                           "<p>WAN reconnecting. Reboot recommended after mode / AP changes.</p>"
                           "<p><a href=/setup>Back to setup</a> · <a href=/api/status>status</a></p>"
                           "</body></html>",
                           HTTPD_RESP_USE_STRLEN);
}

static esp_err_t api_status_get(httpd_req_t *req)
{
    char wan_ip[16] = "";
    if (modem_net_is_up()) {
        modem_net_get_ip_str(wan_ip, sizeof(wan_ip));
    }
    char addr[5];
    mvGlobalAddrKey(addr);

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "firmwareVersion", MV_FIRMWARE_VERSION);
    cJSON_AddStringToObject(root, "platform", MV_PLATFORM_ID);
    cJSON_AddNumberToObject(root, "protocolVersion", MV_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "deviceId", s_cfg->device_id);
    cJSON_AddStringToObject(root, "deviceMode", mvDeviceModeString(mvDeviceModeActive()));
    cJSON_AddNumberToObject(root, "globalSiteKey", mvGlobalSiteKey());
    cJSON_AddStringToObject(root, "globalAddrKey", addr);
    cJSON_AddBoolToObject(root, "mqttConnected", mqtt_parc_connected());
    cJSON_AddBoolToObject(root, "wanUp", modem_net_is_up());
    cJSON_AddStringToObject(root, "wanIp", wan_ip);
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    cJSON_AddStringToObject(root, "wanType", "wifi");
#else
    cJSON_AddStringToObject(root, "wanType", "lte");
#endif
    cJSON_AddBoolToObject(root, "smI010", mvIoSmI010Present());
    cJSON_AddBoolToObject(root, "programOk", mvProgramValid());
    cJSON_AddBoolToObject(root, "programFromNv", mvProgramFromNv());
    cJSON_AddBoolToObject(root, "autoRunOnBoot", mvAutoRunOnBoot());
    cJSON_AddStringToObject(root, "programName", mvProgramName());
    cJSON_AddBoolToObject(root, "runtimeRunning", mvRuntimeIsRunning());
    cJSON_AddNumberToObject(root, "tagCount", mvTagCount());
    if (mvRtcHasWallClock()) {
        cJSON_AddNumberToObject(root, "unixUtc", mvRtcUnixUtc());
    }

    char *out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!out) {
        return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "json");
    }
    httpd_resp_set_type(req, "application/json");
    esp_err_t e = httpd_resp_send(req, out, HTTPD_RESP_USE_STRLEN);
    free(out);
    return e;
}

bool setup_web_start(parc_st_cfg_t *cfg)
{
    s_cfg = cfg;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = CONFIG_DEVCFG_WIFI_AP_HTTP_PORT;
    config.max_uri_handlers = 8;
    if (httpd_start(&s_server, &config) != ESP_OK) {
        ESP_LOGE(TAG, "httpd_start failed");
        return false;
    }
    httpd_uri_t get = { .uri = "/setup", .method = HTTP_GET, .handler = setup_get };
    httpd_uri_t post = { .uri = "/setup", .method = HTTP_POST, .handler = setup_post };
    httpd_uri_t status = { .uri = "/api/status", .method = HTTP_GET, .handler = api_status_get };
    httpd_uri_t root = { .uri = "/", .method = HTTP_GET, .handler = setup_get };
    httpd_register_uri_handler(s_server, &get);
    httpd_register_uri_handler(s_server, &post);
    httpd_register_uri_handler(s_server, &status);
    httpd_register_uri_handler(s_server, &root);
    ESP_LOGI(TAG, "http://192.168.4.1:%d/setup", CONFIG_DEVCFG_WIFI_AP_HTTP_PORT);
    return true;
}
