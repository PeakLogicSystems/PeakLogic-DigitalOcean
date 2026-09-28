/*
 * Setup HTTP server — cloud broker + APN provisioning.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "setup_web.h"

#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "eth_lan.h"
#include "modem_net.h"
#include "mqtt_bridge.h"
#include "mqtt_local.h"

static const char *TAG = "setup_web";
static gateway_cfg_t *s_cfg;

static const char *SETUP_HTML =
    "<!DOCTYPE html><html><head><meta charset=utf-8>"
    "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
    "<title>PeakLogic Opta Gateway</title>"
    "<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:1rem auto;padding:0 1rem}"
    "label{display:block;margin:.5rem 0}input{width:100%;padding:.4rem;box-sizing:border-box}"
    "button{margin-top:.75rem;padding:.5rem 1rem}.card{border:1px solid #ccc;border-radius:8px;"
    "padding:1rem;margin:1rem 0}.muted{color:#666;font-size:.9rem}#msg{margin-top:.5rem}</style>"
    "</head><body>"
    "<h1>PeakLogic Opta Gateway</h1>"
    "<p class=muted>MQTT bridge: Opta connects to <code>192.168.1.1:1883</code> on the LAN; "
    "this board forwards <code>peaklogic/v1/#</code> to the cloud broker over cellular.</p>"
    "<div class=card><h2>Status</h2><pre id=status>Loading…</pre></div>"
    "<div class=card><h2>Cloud MQTT (PeakLogic droplet)</h2>"
    "<label>Broker host (public IP) <input id=cloudHost></label>"
    "<label>Broker port <input id=cloudPort type=number></label>"
    "<label>Username <input id=cloudUser></label>"
    "<label>Password <input id=cloudPass type=password></label>"
    "<label>Gateway ID <input id=gatewayId placeholder=gw_lift_01></label>"
    "</div><div class=card><h2>LAN (Opta side)</h2>"
    "<label>LAN IP <input id=lanIp value=192.168.1.1></label>"
    "<label>Local MQTT port <input id=localPort type=number value=1883></label>"
    "</div><div class=card><h2>Cellular</h2>"
    "<label>APN <input id=apn placeholder=teal></label>"
    "</div><div class=card><h2>Wi-Fi setup AP</h2>"
    "<label><input type=checkbox id=wifiAp> Enable setup AP</label>"
    "<label>AP SSID <input id=wifiSsid></label>"
    "<label>AP password <input id=wifiPass type=password></label>"
    "</div>"
    "<button id=save>Save</button> <button id=reboot>Save &amp; reboot</button>"
    "<p id=msg class=muted></p>"
    "<script>"
    "async function loadStatus(){const r=await fetch('/api/status');"
    "document.getElementById('status').textContent=JSON.stringify(await r.json(),null,2);}"
    "async function loadCfg(){const r=await fetch('/api/setup/config');const c=await r.json();"
    "cloudHost.value=c.cloudMqttHost||'';cloudPort.value=c.cloudMqttPort||1883;"
    "cloudUser.value=c.cloudMqttUser||'';cloudPass.value=c.cloudMqttPass||'';"
    "gatewayId.value=c.gatewayId||'';lanIp.value=c.lanIp||'192.168.1.1';"
    "localPort.value=c.localMqttPort||1883;apn.value=c.modemApn||'';"
    "wifiAp.checked=!!c.wifiApEnable;wifiSsid.value=c.wifiApSsid||'';wifiPass.value=c.wifiApPass||'';}"
    "async function save(reboot){const body={cloudMqttHost:cloudHost.value,"
    "cloudMqttPort:+cloudPort.value,cloudMqttUser:cloudUser.value,cloudMqttPass:cloudPass.value,"
    "gatewayId:gatewayId.value,lanIp:lanIp.value,localMqttPort:+localPort.value,"
    "modemApn:apn.value,wifiApEnable:wifiAp.checked,wifiApSsid:wifiSsid.value,wifiApPass:wifiPass.value};"
    "const r=await fetch('/api/setup/config',{method:'PUT',headers:{'Content-Type':'application/json'},"
    "body:JSON.stringify(body)});const j=await r.json();"
    "msg.textContent=r.ok?'Saved. Bridge restarted.':(j.error||'Save failed');"
    "if(r.ok&&reboot){await fetch('/api/setup/reboot',{method:'POST'});msg.textContent='Rebooting…';}}"
    "save.onclick=()=>save(false);reboot.onclick=()=>save(true);"
    "loadCfg();loadStatus();setInterval(loadStatus,5000);"
    "</script></body></html>";

static void fill_config_json(cJSON *root)
{
    cJSON_AddStringToObject(root, "cloudMqttHost", s_cfg->cloud_mqtt_host);
    cJSON_AddNumberToObject(root, "cloudMqttPort", s_cfg->cloud_mqtt_port);
    cJSON_AddBoolToObject(root, "cloudMqttSet", s_cfg->cloud_mqtt_set);
    cJSON_AddStringToObject(root, "cloudMqttUser", s_cfg->cloud_mqtt_user);
    cJSON_AddStringToObject(root, "cloudMqttPass", s_cfg->cloud_mqtt_pass);
    cJSON_AddStringToObject(root, "lanIp", s_cfg->lan_ip);
    cJSON_AddStringToObject(root, "lanMask", s_cfg->lan_mask);
    cJSON_AddNumberToObject(root, "localMqttPort", s_cfg->local_mqtt_port);
    cJSON_AddStringToObject(root, "modemApn", s_cfg->modem_apn);
    cJSON_AddStringToObject(root, "gatewayId", s_cfg->gateway_id);
    cJSON_AddBoolToObject(root, "wifiApEnable", s_cfg->wifi_ap_enable);
    cJSON_AddStringToObject(root, "wifiApSsid", s_cfg->wifi_ap_ssid);
    cJSON_AddStringToObject(root, "wifiApPass", s_cfg->wifi_ap_pass);
}

static esp_err_t get_root(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, SETUP_HTML, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t get_config(httpd_req_t *req)
{
    cJSON *root = cJSON_CreateObject();
    fill_config_json(root);
    char *json = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_sendstr(req, json ? json : "{}");
    cJSON_free(json);
    return err;
}

static esp_err_t put_config(httpd_req_t *req)
{
    char buf[1024];
    int n = httpd_req_recv(req, buf, sizeof(buf) - 1);
    if (n <= 0)
    {
        return ESP_FAIL;
    }
    buf[n] = '\0';

    cJSON *root = cJSON_Parse(buf);
    if (root == NULL)
    {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "invalid JSON");
        return ESP_FAIL;
    }

    const cJSON *h = cJSON_GetObjectItem(root, "cloudMqttHost");
    if (cJSON_IsString(h) && h->valuestring[0])
    {
        strncpy(s_cfg->cloud_mqtt_host, h->valuestring, sizeof(s_cfg->cloud_mqtt_host) - 1);
        s_cfg->cloud_mqtt_set = true;
    }
    const cJSON *p = cJSON_GetObjectItem(root, "cloudMqttPort");
    if (cJSON_IsNumber(p))
    {
        s_cfg->cloud_mqtt_port = (uint16_t)p->valueint;
    }
    const cJSON *u = cJSON_GetObjectItem(root, "cloudMqttUser");
    if (cJSON_IsString(u))
    {
        strncpy(s_cfg->cloud_mqtt_user, u->valuestring, sizeof(s_cfg->cloud_mqtt_user) - 1);
    }
    const cJSON *pw = cJSON_GetObjectItem(root, "cloudMqttPass");
    if (cJSON_IsString(pw))
    {
        strncpy(s_cfg->cloud_mqtt_pass, pw->valuestring, sizeof(s_cfg->cloud_mqtt_pass) - 1);
    }
    const cJSON *gid = cJSON_GetObjectItem(root, "gatewayId");
    if (cJSON_IsString(gid))
    {
        strncpy(s_cfg->gateway_id, gid->valuestring, sizeof(s_cfg->gateway_id) - 1);
    }
    const cJSON *lip = cJSON_GetObjectItem(root, "lanIp");
    if (cJSON_IsString(lip))
    {
        strncpy(s_cfg->lan_ip, lip->valuestring, sizeof(s_cfg->lan_ip) - 1);
    }
    const cJSON *lp = cJSON_GetObjectItem(root, "localMqttPort");
    if (cJSON_IsNumber(lp))
    {
        s_cfg->local_mqtt_port = (uint16_t)lp->valueint;
    }
    const cJSON *apn = cJSON_GetObjectItem(root, "modemApn");
    if (cJSON_IsString(apn))
    {
        strncpy(s_cfg->modem_apn, apn->valuestring, sizeof(s_cfg->modem_apn) - 1);
    }
    const cJSON *ap = cJSON_GetObjectItem(root, "wifiApEnable");
    if (cJSON_IsBool(ap))
    {
        s_cfg->wifi_ap_enable = cJSON_IsTrue(ap);
    }
    const cJSON *ssid = cJSON_GetObjectItem(root, "wifiApSsid");
    if (cJSON_IsString(ssid))
    {
        strncpy(s_cfg->wifi_ap_ssid, ssid->valuestring, sizeof(s_cfg->wifi_ap_ssid) - 1);
    }
    const cJSON *wpass = cJSON_GetObjectItem(root, "wifiApPass");
    if (cJSON_IsString(wpass) && strlen(wpass->valuestring) >= 8)
    {
        strncpy(s_cfg->wifi_ap_pass, wpass->valuestring, sizeof(s_cfg->wifi_ap_pass) - 1);
    }

    cJSON_Delete(root);

    if (!gateway_cfg_save(s_cfg))
    {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "NVS save failed");
        return ESP_FAIL;
    }

    mqtt_bridge_on_config_saved(s_cfg);

    cJSON *ok = cJSON_CreateObject();
    cJSON_AddBoolToObject(ok, "ok", true);
    char *json = cJSON_PrintUnformatted(ok);
    cJSON_Delete(ok);
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_sendstr(req, json ? json : "{\"ok\":true}");
    cJSON_free(json);
    return err;
}

static esp_err_t get_status(httpd_req_t *req)
{
    char lan_ip[16] = "?";
    char wan_ip[16] = "?";
    eth_lan_get_ip_str(lan_ip, sizeof(lan_ip));
    modem_net_get_ip_str(wan_ip, sizeof(wan_ip));

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "role", "opta_mqtt_gateway");
    cJSON_AddStringToObject(root, "gatewayId", s_cfg->gateway_id);
    cJSON_AddBoolToObject(root, "ethLink", eth_lan_is_up());
    cJSON_AddStringToObject(root, "lanIp", lan_ip);
    cJSON_AddStringToObject(root, "wanIp", wan_ip);
    cJSON_AddBoolToObject(root, "wanUp", modem_net_is_up());
    cJSON_AddNumberToObject(root, "wanRssi", modem_net_rssi());
    cJSON_AddBoolToObject(root, "localMqtt", mqtt_bridge_local_listening());
    cJSON_AddBoolToObject(root, "cloudMqtt", mqtt_bridge_cloud_connected());
    cJSON_AddNumberToObject(root, "fwdToCloud", mqtt_bridge_fwd_to_cloud());
    cJSON_AddNumberToObject(root, "fwdToLocal", mqtt_bridge_fwd_to_local());
    cJSON_AddNumberToObject(root, "optaClients", mqtt_local_client_count());
    cJSON_AddStringToObject(root, "cloudBroker", s_cfg->cloud_mqtt_host);
    cJSON_AddNumberToObject(root, "cloudPort", s_cfg->cloud_mqtt_port);
    cJSON_AddStringToObject(root, "optaBrokerHint", "192.168.1.1:1883");

    char *json = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_sendstr(req, json ? json : "{}");
    cJSON_free(json);
    return err;
}

static esp_err_t post_reboot(httpd_req_t *req)
{
    httpd_resp_sendstr(req, "{\"ok\":true}");
    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();
    return ESP_OK;
}

static esp_err_t post_wan_ping(httpd_req_t *req)
{
    char host[64] = "8.8.8.8";
    char buf[128];
    int n = httpd_req_recv(req, buf, sizeof(buf) - 1);
    if (n > 0)
    {
        buf[n] = '\0';
        cJSON *root = cJSON_Parse(buf);
        if (root != NULL)
        {
            const cJSON *h = cJSON_GetObjectItem(root, "host");
            if (cJSON_IsString(h) && h->valuestring[0])
            {
                strncpy(host, h->valuestring, sizeof(host) - 1);
            }
            cJSON_Delete(root);
        }
    }

    char msg[80];
    int rtt = -1;
    bool ok = modem_net_ping(host, &rtt, msg, sizeof(msg));

    cJSON *out = cJSON_CreateObject();
    cJSON_AddBoolToObject(out, "ok", ok);
    cJSON_AddStringToObject(out, "host", host);
    cJSON_AddNumberToObject(out, "rttMs", rtt);
    cJSON_AddStringToObject(out, "detail", msg);
    cJSON_AddBoolToObject(out, "wanUp", modem_net_is_up());
    char wan_ip[16];
    modem_net_get_ip_str(wan_ip, sizeof(wan_ip));
    cJSON_AddStringToObject(out, "wanIp", wan_ip);

    char *json = cJSON_PrintUnformatted(out);
    cJSON_Delete(out);
    httpd_resp_set_type(req, "application/json");
    esp_err_t err = httpd_resp_sendstr(req, json ? json : "{}");
    cJSON_free(json);
    return err;
}

void setup_web_start(gateway_cfg_t *cfg)
{
    s_cfg = cfg;

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = CONFIG_DEVCFG_WIFI_AP_HTTP_PORT;
    config.lru_purge_enable = true;

    httpd_handle_t server = NULL;
    if (httpd_start(&server, &config) != ESP_OK)
    {
        ESP_LOGE(TAG, "httpd_start failed");
        return;
    }

    httpd_uri_t uris[] = {
        { .uri = "/", .method = HTTP_GET, .handler = get_root },
        { .uri = "/setup", .method = HTTP_GET, .handler = get_root },
        { .uri = "/api/setup/config", .method = HTTP_GET, .handler = get_config },
        { .uri = "/api/setup/config", .method = HTTP_PUT, .handler = put_config },
        { .uri = "/api/status", .method = HTTP_GET, .handler = get_status },
        { .uri = "/api/setup/reboot", .method = HTTP_POST, .handler = post_reboot },
        { .uri = "/api/setup/wan-ping", .method = HTTP_POST, .handler = post_wan_ping },
    };

    for (size_t i = 0; i < sizeof(uris) / sizeof(uris[0]); i++)
    {
        httpd_register_uri_handler(server, &uris[i]);
    }

    ESP_LOGI(TAG, "setup HTTP on port %d", config.server_port);
}
