/*
 * Setup HTTP server — see setup_web.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "setup_web.h"

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "cJSON.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"

#include "device_cfg.h"
#include "halow_net.h"
#include "mqtt_parc.h"
#include "sensor_templates.h"
#include "sensors.h"
#include "tx_ah.h"
#include "wifi_setup.h"

static const char *TAG = "setup_web";

static device_cfg_t s_cfg;

static const char *SETUP_HTML =
    "<!DOCTYPE html><html><head><meta charset=utf-8>"
    "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
    "<title>PeakLogic T-HaLow</title>"
    "<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:1rem auto;padding:0 1rem}"
    "label{display:block;margin:.5rem 0}input{width:100%;padding:.4rem;box-sizing:border-box}"
    "button{margin-top:.75rem;padding:.5rem 1rem}.card{border:1px solid #ccc;border-radius:8px;"
    "padding:1rem;margin:1rem 0}.muted{color:#666;font-size:.9rem}#msg{margin-top:.5rem}</style>"
    "</head><body>"
    "<h1>PeakLogic T-HaLow</h1>"
    "<p class=muted>MQTT over HaLow. Configure broker and HaLow IP here. "
    "Connect to this AP, then open <code>http://192.168.4.1:8080/setup</code>.</p>"
    "<div class=card><h2>Status</h2><pre id=status>Loading…</pre></div>"
    "<div class=card><h2>ALF sensor template</h2>"
    "<p class=muted>Select the Assisted Living Facility I/O layout for this node. "
    "Save &amp; reboot after changing.</p>"
    "<label>Template <select id=sensorTemplate>"
    "<option value=1>ALF #1 Mechanical room</option>"
    "<option value=2>ALF #2 Client room</option>"
    "<option value=3>ALF #3 Client bathroom</option>"
    "<option value=4>ALF #4 Rooftop A/C</option>"
    "<option value=5>ALF #5 Kitchen (refer/freezer)</option>"
    "<option value=6>ALF #6 Kitchen six sinks</option>"
    "</select></label>"
    "<p id=templateDesc class=muted></p>"
    "<pre id=templateTags class=muted style=font-size:.85rem></pre></div>"
    "<div class=card><h2>MQTT broker</h2>"
    "<label>Broker host (HaLow/LAN reachable IP) <input id=mqttHost></label>"
    "<label>Broker port <input id=mqttPort type=number></label>"
    "<label>Device ID <input id=devId></label>"
    "<label>Device name <input id=devName></label>"
    "<label>Global site key <input id=siteKey type=number min=1 max=65535></label>"
    "</div><div class=card><h2>HaLow static IP</h2>"
    "<label>IP <input id=halowIp></label>"
    "<label>Gateway <input id=halowGw></label>"
    "<label>Netmask <input id=halowMask></label>"
    "</div><div class=card><h2>Wi-Fi setup AP</h2>"
    "<label><input type=checkbox id=wifiAp> Enable setup AP</label>"
    "<label>AP SSID <input id=wifiSsid></label>"
    "<label>AP password (8+ chars) <input id=wifiPass type=password></label>"
    "</div>"
    "<button id=save>Save</button> <button id=reboot>Save &amp; reboot</button>"
    "<p id=msg class=muted></p>"
    "<script>"
    "async function loadStatus(){const r=await fetch('/api/status');"
    "document.getElementById('status').textContent=JSON.stringify(await r.json(),null,2);}"
    "async function loadTemplates(){const r=await fetch('/api/setup/templates');"
    "window._tpl=await r.json();updateTemplateDesc();}"
    "function updateTemplateDesc(){if(!window._tpl)return;"
    "const id=+sensorTemplate.value;const t=(window._tpl.templates||[]).find(x=>x.id===id);"
    "templateDesc.textContent=t?t.description:'';"
    "templateTags.textContent=t&&t.tags?t.tags.join('\\n'):'';}"
    "sensorTemplate.onchange=updateTemplateDesc;"
    "async function loadCfg(){await loadTemplates();const r=await fetch('/api/setup/config');const c=await r.json();"
    "sensorTemplate.value=c.sensorTemplate||1;updateTemplateDesc();"
    "mqttHost.value=c.mqttBrokerHost||'';mqttPort.value=c.mqttBrokerPort||1883;"
    "devId.value=c.deviceId||'';devName.value=c.deviceName||'';siteKey.value=c.globalSiteKey||1;"
    "halowIp.value=c.halowIp||'';halowGw.value=c.halowGw||'';halowMask.value=c.halowMask||'';"
    "wifiAp.checked=!!c.wifiApEnable;wifiSsid.value=c.wifiApSsid||'';wifiPass.value=c.wifiApPass||'';}"
    "async function save(reboot){const body={sensorTemplate:+sensorTemplate.value,"
    "mqttBrokerHost:mqttHost.value,mqttBrokerPort:+mqttPort.value,"
    "deviceId:devId.value,deviceName:devName.value,globalSiteKey:+siteKey.value,"
    "halowIp:halowIp.value,halowGw:halowGw.value,halowMask:halowMask.value,"
    "wifiApEnable:wifiAp.checked,wifiApSsid:wifiSsid.value,wifiApPass:wifiPass.value};"
    "const r=await fetch('/api/setup/config',{method:'PUT',headers:{'Content-Type':'application/json'},"
    "body:JSON.stringify(body)});const j=await r.json();"
    "msg.textContent=r.ok?'Saved.':(j.error||'Save failed');"
    "if(r.ok&&reboot){await fetch('/api/setup/reboot',{method:'POST'});msg.textContent='Rebooting…';}}"
    "save.onclick=()=>save(false);reboot.onclick=()=>save(true);"
    "loadCfg();loadStatus();setInterval(loadStatus,5000);"
    "</script></body></html>";

static void fill_config_json(cJSON *root)
{
    cJSON_AddStringToObject(root, "mqttBrokerHost", s_cfg.mqtt_broker_host);
    cJSON_AddNumberToObject(root, "mqttBrokerPort", s_cfg.mqtt_broker_port);
    cJSON_AddBoolToObject(root, "mqttBrokerSet", s_cfg.mqtt_broker_set);
    cJSON_AddStringToObject(root, "deviceId", s_cfg.device_id);
    cJSON_AddStringToObject(root, "deviceName", s_cfg.device_name);
    cJSON_AddNumberToObject(root, "globalSiteKey", s_cfg.global_site_key);
    cJSON_AddStringToObject(root, "halowIp", s_cfg.halow_ip);
    cJSON_AddStringToObject(root, "halowGw", s_cfg.halow_gw);
    cJSON_AddStringToObject(root, "halowMask", s_cfg.halow_mask);
    cJSON_AddBoolToObject(root, "wifiApEnable", s_cfg.wifi_ap_enable);
    cJSON_AddStringToObject(root, "wifiApSsid", s_cfg.wifi_ap_ssid);
    cJSON_AddStringToObject(root, "wifiApPass", s_cfg.wifi_ap_pass);
    cJSON_AddNumberToObject(root, "sensorTemplate", s_cfg.sensor_template);
    cJSON_AddStringToObject(root, "sensorTemplateName", sens_template_name(s_cfg.sensor_template));
    cJSON_AddStringToObject(root, "platform", "lilygo-t-halow");
}

static bool apply_config_json(const cJSON *root, char *err, size_t err_len)
{
    const cJSON *v;

    v = cJSON_GetObjectItem(root, "mqttBrokerHost");
    if (cJSON_IsString(v) && v->valuestring[0])
    {
        strncpy(s_cfg.mqtt_broker_host, v->valuestring, sizeof(s_cfg.mqtt_broker_host) - 1);
        s_cfg.mqtt_broker_set = true;
    }
    v = cJSON_GetObjectItem(root, "mqttBrokerPort");
    if (cJSON_IsNumber(v) && v->valueint > 0)
    {
        s_cfg.mqtt_broker_port = (uint16_t)v->valueint;
    }
    v = cJSON_GetObjectItem(root, "deviceId");
    if (cJSON_IsString(v) && v->valuestring[0])
    {
        strncpy(s_cfg.device_id, v->valuestring, sizeof(s_cfg.device_id) - 1);
    }
    v = cJSON_GetObjectItem(root, "deviceName");
    if (cJSON_IsString(v))
    {
        strncpy(s_cfg.device_name, v->valuestring, sizeof(s_cfg.device_name) - 1);
    }
    v = cJSON_GetObjectItem(root, "globalSiteKey");
    if (cJSON_IsNumber(v) && v->valueint >= 1 && v->valueint <= 65535)
    {
        s_cfg.global_site_key = v->valueint;
    }
    v = cJSON_GetObjectItem(root, "halowIp");
    if (cJSON_IsString(v) && v->valuestring[0])
    {
        strncpy(s_cfg.halow_ip, v->valuestring, sizeof(s_cfg.halow_ip) - 1);
    }
    v = cJSON_GetObjectItem(root, "halowGw");
    if (cJSON_IsString(v) && v->valuestring[0])
    {
        strncpy(s_cfg.halow_gw, v->valuestring, sizeof(s_cfg.halow_gw) - 1);
    }
    v = cJSON_GetObjectItem(root, "halowMask");
    if (cJSON_IsString(v) && v->valuestring[0])
    {
        strncpy(s_cfg.halow_mask, v->valuestring, sizeof(s_cfg.halow_mask) - 1);
    }
    v = cJSON_GetObjectItem(root, "wifiApEnable");
    if (cJSON_IsBool(v))
    {
        s_cfg.wifi_ap_enable = cJSON_IsTrue(v);
    }
    v = cJSON_GetObjectItem(root, "wifiApSsid");
    if (cJSON_IsString(v) && v->valuestring[0])
    {
        strncpy(s_cfg.wifi_ap_ssid, v->valuestring, sizeof(s_cfg.wifi_ap_ssid) - 1);
    }
    v = cJSON_GetObjectItem(root, "wifiApPass");
    if (cJSON_IsString(v) && v->valuestring[0])
    {
        if (strlen(v->valuestring) < 8)
        {
            snprintf(err, err_len, "Wi-Fi AP password must be >= 8 chars");
            return false;
        }
        strncpy(s_cfg.wifi_ap_pass, v->valuestring, sizeof(s_cfg.wifi_ap_pass) - 1);
    }

    v = cJSON_GetObjectItem(root, "sensorTemplate");
    if (cJSON_IsNumber(v) && v->valueint >= SENS_TPL_ID_MECH && v->valueint <= SENS_TPL_ID_MAX)
    {
        s_cfg.sensor_template = (uint8_t)v->valueint;
        if (!sens_template_validate(s_cfg.sensor_template, err, err_len))
        {
            return false;
        }
    }

    if (!device_cfg_save(&s_cfg))
    {
        snprintf(err, err_len, "NVS save failed");
        return false;
    }
    return true;
}

static esp_err_t handle_setup_page(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, SETUP_HTML, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t handle_config_get(httpd_req_t *req)
{
    char *out = NULL;
    cJSON *root = cJSON_CreateObject();
    fill_config_json(root);
    out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (out == NULL)
    {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "json");
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_send(req, out, HTTPD_RESP_USE_STRLEN);
    free(out);
    return err;
}

static esp_err_t handle_config_put(httpd_req_t *req)
{
    char body[768];
    int total = 0;
    while (total < (int)sizeof(body) - 1)
    {
        int n = httpd_req_recv(req, body + total, (int)sizeof(body) - 1 - total);
        if (n <= 0)
        {
            break;
        }
        total += n;
    }
    body[total] = '\0';

    cJSON *root = cJSON_Parse(body);
    if (root == NULL)
    {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "invalid json");
        return ESP_FAIL;
    }

    char err[64] = { 0 };
    bool ok = apply_config_json(root, err, sizeof(err));
    cJSON_Delete(root);

    if (!ok)
    {
        cJSON *resp = cJSON_CreateObject();
        cJSON_AddStringToObject(resp, "error", err);
        char *out = cJSON_PrintUnformatted(resp);
        cJSON_Delete(resp);
        httpd_resp_set_status(req, "400 Bad Request");
        httpd_resp_set_type(req, "application/json");
        httpd_resp_send(req, out != NULL ? out : "{}", HTTPD_RESP_USE_STRLEN);
        free(out);
        return ESP_FAIL;
    }

    httpd_resp_set_type(req, "application/json");
    return httpd_resp_send(req, "{\"ok\":true}", HTTPD_RESP_USE_STRLEN);
}

static esp_err_t handle_status(httpd_req_t *req)
{
    char ip[16] = "0.0.0.0";
    halow_net_get_ip_str(ip, sizeof(ip));

    int32_t rssi = 0;
    bool have_rssi = tx_ah_get_rssi(&rssi);

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "firmwareVersion", "0.3.0");
    cJSON_AddStringToObject(root, "platform", "lilygo-t-halow");
    cJSON_AddStringToObject(root, "deviceId", s_cfg.device_id);
    cJSON_AddBoolToObject(root, "mqttConnected", parc_mqtt_is_connected());
    cJSON_AddBoolToObject(root, "halowLink", tx_ah_is_connected());
    cJSON_AddStringToObject(root, "halowIp", ip);
    if (have_rssi)
    {
        cJSON_AddNumberToObject(root, "halowRssi", rssi);
    }
    cJSON_AddBoolToObject(root, "wifiApActive", wifi_setup_ap_active());
    cJSON_AddStringToObject(root, "sensorTemplateName", sens_template_name(s_cfg.sensor_template));
    cJSON_AddNumberToObject(root, "sensorTemplate", s_cfg.sensor_template);
    cJSON_AddNumberToObject(root, "sensorTagCount", sensors_tag_count());

    cJSON_AddStringToObject(root, "setupUrl", "http://192.168.4.1:8080/setup");

    char *out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (out == NULL)
    {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "json");
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_send(req, out, HTTPD_RESP_USE_STRLEN);
    free(out);
    return err;
}

static void template_tags_to_json(cJSON *tags, const sens_template_def_t *tpl)
{
    for (size_t i = 0; i < tpl->channel_count; i++)
    {
        const sens_template_channel_t *c = &tpl->channels[i];
        cJSON_AddItemToArray(tags, cJSON_CreateString(c->tag));
        if (c->type == SENS_CH_PULSE)
        {
            char buf[20];
            snprintf(buf, sizeof(buf), "%s_TOT", c->tag);
            cJSON_AddItemToArray(tags, cJSON_CreateString(buf));
        }
        if (c->type == SENS_CH_LEAK_ROPE)
        {
            char buf[20];
            snprintf(buf, sizeof(buf), "%s_MV", c->tag);
            cJSON_AddItemToArray(tags, cJSON_CreateString(buf));
        }
    }
}

static esp_err_t handle_templates(httpd_req_t *req)
{
    cJSON *root = cJSON_CreateObject();
    cJSON *list = cJSON_AddArrayToObject(root, "templates");

    for (uint8_t id = SENS_TPL_ID_MECH; id <= SENS_TPL_ID_MAX; id++)
    {
        const sens_template_def_t *tpl = sens_template_get(id);
        if (tpl == NULL)
        {
            continue;
        }
        cJSON *item = cJSON_CreateObject();
        cJSON_AddNumberToObject(item, "id", tpl->id);
        cJSON_AddStringToObject(item, "name", tpl->name);
        cJSON_AddStringToObject(item, "description", tpl->description);
        cJSON *tags = cJSON_AddArrayToObject(item, "tags");
        template_tags_to_json(tags, tpl);
        cJSON_AddItemToArray(list, item);
    }

    char *out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (out == NULL)
    {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "json");
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_send(req, out, HTTPD_RESP_USE_STRLEN);
    free(out);
    return err;
}

static esp_err_t handle_reboot(httpd_req_t *req)
{
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, "{\"ok\":true}", HTTPD_RESP_USE_STRLEN);
    vTaskDelay(pdMS_TO_TICKS(300));
    esp_restart();
    return ESP_OK;
}

bool setup_web_start(const device_cfg_t *cfg)
{
    if (cfg == NULL)
    {
        return false;
    }
    memcpy(&s_cfg, cfg, sizeof(s_cfg));

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = CONFIG_DEVCFG_WIFI_AP_HTTP_PORT;
    config.lru_purge_enable = true;
    config.max_uri_handlers = 10;

    httpd_handle_t server = NULL;
    if (httpd_start(&server, &config) != ESP_OK)
    {
        ESP_LOGE(TAG, "httpd_start failed");
        return false;
    }

    httpd_uri_t uris[] = {
        { .uri = "/", .method = HTTP_GET, .handler = handle_setup_page },
        { .uri = "/setup", .method = HTTP_GET, .handler = handle_setup_page },
        { .uri = "/api/setup/config", .method = HTTP_GET, .handler = handle_config_get },
        { .uri = "/api/setup/config", .method = HTTP_PUT, .handler = handle_config_put },
        { .uri = "/api/setup/templates", .method = HTTP_GET, .handler = handle_templates },
        { .uri = "/api/status", .method = HTTP_GET, .handler = handle_status },
        { .uri = "/api/setup/reboot", .method = HTTP_POST, .handler = handle_reboot },
    };
    for (size_t i = 0; i < sizeof(uris) / sizeof(uris[0]); i++)
    {
        httpd_register_uri_handler(server, &uris[i]);
    }

    ESP_LOGI(TAG, "Setup HTTP on port %d", CONFIG_DEVCFG_WIFI_AP_HTTP_PORT);
    return true;
}
