/*
 * PeakLogic "Parc" MQTT client — implementation.
 *
 * Modeled after the Arduino Opta firmware (firmware/arduino-opta-mqtt-st):
 * same "peaklogic/v1" topic map, verbose JSON telemetry with a tags[] array,
 * retained online/LWT, cmd/response, config, and global P2P tags. MQTT runs over
 * the HaLow L2 netif (TX-AH raw Ethernet). Wi-Fi AP is setup-only.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "mqtt_parc.h"

#include <stdio.h>
#include <string.h>

#include "device_cfg.h"
#include "esp_idf_version.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "mqtt_client.h"
#include "cJSON.h"

#include <sys/socket.h> /* struct ifreq for mqtt network.if_name (IDF 5.2+) */

/* Identity advertised in telemetry (mirrors the Opta's deviceId/name/platform). */
#define PARC_FW_VERSION       "0.1.0"
#define PARC_PROTOCOL_VERSION 2                    /* matches Opta MV_PROTOCOL_VERSION */
#define PARC_PLATFORM         "lilygo-t-halow"

static const char *TAG = "parc_mqtt";

static esp_mqtt_client_handle_t s_client;
static volatile bool s_connected;

static parc_global_cb_t s_global_cb;
static parc_write_cb_t s_write_cb;

static char s_device_id[DEVCFG_ID_MAX];
static char s_device_name[DEVCFG_NAME_MAX];
static char s_topic_telemetry[128];
static char s_topic_online[128];
static char s_topic_cmd[128];
static char s_topic_cmd_res[136];
static char s_topic_config[128];
static char s_global_prefix[96];   /* "peaklogic/v1/g/<addr>/" */
static char s_global_sub[100];     /* "peaklogic/v1/g/<addr>/+" */
static char s_addr_hex[5];         /* site key as 4 hex digits */
static char s_client_id[64];

/* Telemetry pacing / gating (mirrors the Opta's s_cfg.reportMs + pause + force). */
static uint32_t s_report_ms = CONFIG_PARC_PUBLISH_INTERVAL_MS;
static bool s_pause;
static bool s_force;
static int64_t s_last_report_us;
static uint32_t s_cycles;

/* Runtime state reported to the PC (runtime.running + deviceMode). */
#if defined(CONFIG_PARC_DEVICE_MODE_REMOTE_IO)
static char s_device_mode[16] = "remote_io";
static bool s_running;                 /* PC starts the loop via runtime_start */
#else
static char s_device_mode[16] = "standalone";
static bool s_running = true;
#endif

/* Registered telemetry tags (appended to the built-in RSSI/LINK/UPTIME). */
#define PARC_MAX_TAGS 32
typedef struct
{
    char id[16];
    parc_tag_type_t type;
    char role[8];
    double value;
} parc_tag_entry_t;
static parc_tag_entry_t s_tags[PARC_MAX_TAGS];
static int s_tag_count;

static parc_tag_entry_t *find_tag(const char *id)
{
    for (int i = 0; i < s_tag_count; i++)
    {
        if (strcmp(s_tags[i].id, id) == 0)
        {
            return &s_tags[i];
        }
    }
    return NULL;
}

void parc_tag_register(const char *id, parc_tag_type_t type, const char *role)
{
    if (id == NULL || id[0] == '\0' || find_tag(id) != NULL || s_tag_count >= PARC_MAX_TAGS)
    {
        return;
    }
    parc_tag_entry_t *t = &s_tags[s_tag_count++];
    strncpy(t->id, id, sizeof(t->id) - 1);
    t->id[sizeof(t->id) - 1] = '\0';
    t->type = type;
    strncpy(t->role, (role != NULL) ? role : "memory", sizeof(t->role) - 1);
    t->role[sizeof(t->role) - 1] = '\0';
    t->value = 0;
}

void parc_tag_set(const char *id, double value)
{
    parc_tag_entry_t *t = (id != NULL) ? find_tag(id) : NULL;
    if (t != NULL)
    {
        t->value = value;
    }
}

double parc_tag_get(const char *id)
{
    parc_tag_entry_t *t = (id != NULL) ? find_tag(id) : NULL;
    return (t != NULL) ? t->value : 0;
}

/* ---------------------------------------------------------------------------
 * Small publish helpers
 * ------------------------------------------------------------------------- */

static void publish_str(const char *topic, const char *payload, int qos, bool retain)
{
    if (!s_connected || topic == NULL || payload == NULL)
    {
        return;
    }
    esp_mqtt_client_publish(s_client, topic, payload, 0, qos, retain ? 1 : 0);
}

static const char *tag_type_name(parc_tag_type_t t)
{
    switch (t)
    {
        case PARC_TAG_INT:  return "INT";
        case PARC_TAG_REAL: return "REAL";
        default:            return "BOOL";
    }
}

/* ---------------------------------------------------------------------------
 * Telemetry (verbose JSON: envelope + runtime{} + tags[]), same shape as Opta
 * ------------------------------------------------------------------------- */

static void add_tag(cJSON *tags, const char *id, const char *type, const char *role,
                    cJSON *value)
{
    cJSON *row = cJSON_CreateObject();
    if (row == NULL)
    {
        cJSON_Delete(value);
        return;
    }
    cJSON_AddStringToObject(row, "id", id);
    cJSON_AddStringToObject(row, "type", type);
    cJSON_AddStringToObject(row, "role", role);
    cJSON_AddItemToObject(row, "value", value);
    cJSON_AddStringToObject(row, "quality", "GOOD");
    cJSON_AddBoolToObject(row, "forceInput", false);
    cJSON_AddBoolToObject(row, "forceOutput", false);
    cJSON_AddItemToArray(tags, row);
}

static void publish_telemetry_now(const char *ip, int32_t rssi, bool link_up)
{
    cJSON *doc = cJSON_CreateObject();
    if (doc == NULL)
    {
        return;
    }

    cJSON_AddStringToObject(doc, "deviceId", s_device_id);
    cJSON_AddStringToObject(doc, "name", s_device_name);
    cJSON_AddStringToObject(doc, "platform", PARC_PLATFORM);
    cJSON_AddStringToObject(doc, "firmwareVersion", PARC_FW_VERSION);
    cJSON_AddNumberToObject(doc, "protocolVersion", PARC_PROTOCOL_VERSION);
    cJSON_AddStringToObject(doc, "ethIp", (ip != NULL) ? ip : "");
    cJSON_AddStringToObject(doc, "ip", (ip != NULL) ? ip : "");
    cJSON_AddNumberToObject(doc, "reportIntervalSec", (double)(s_report_ms / 1000));
    cJSON_AddStringToObject(doc, "deviceMode", s_device_mode);

    cJSON *rt = cJSON_AddObjectToObject(doc, "runtime");
    if (rt != NULL)
    {
        cJSON_AddBoolToObject(rt, "running", s_running);
        cJSON_AddNumberToObject(rt, "scanMs", 0);
        cJSON_AddNumberToObject(rt, "cycles", (double)s_cycles);
        cJSON_AddBoolToObject(rt, "programOk", false);
        cJSON_AddStringToObject(rt, "deviceMode", s_device_mode);
    }

    cJSON *tags = cJSON_AddArrayToObject(doc, "tags");
    if (tags != NULL)
    {
        add_tag(tags, "RSSI", "INT", "input", cJSON_CreateNumber((double)rssi));
        add_tag(tags, "LINK", "BOOL", "input", cJSON_CreateBool(link_up));
        int64_t uptime_s = esp_timer_get_time() / 1000000;
        add_tag(tags, "UPTIME", "INT", "input", cJSON_CreateNumber((double)uptime_s));

        for (int i = 0; i < s_tag_count; i++)
        {
            const parc_tag_entry_t *t = &s_tags[i];
            cJSON *val = (t->type == PARC_TAG_BOOL)
                             ? cJSON_CreateBool(t->value != 0)
                             : cJSON_CreateNumber(t->value);
            add_tag(tags, t->id, tag_type_name(t->type), t->role, val);
        }
    }

    char *out = cJSON_PrintUnformatted(doc);
    cJSON_Delete(doc);
    if (out != NULL)
    {
        publish_str(s_topic_telemetry, out, /*qos=*/0, /*retain=*/false);
        cJSON_free(out);
    }
}

void parc_mqtt_maybe_publish_telemetry(const char *ip, int32_t rssi, bool link_up)
{
    if (!s_connected || s_pause)
    {
        return;
    }
    int64_t now = esp_timer_get_time();
    if (!s_force && (now - s_last_report_us) < ((int64_t)s_report_ms * 1000))
    {
        return;
    }
    s_last_report_us = now;
    s_force = false;
    s_cycles++;
    publish_telemetry_now(ip, rssi, link_up);
}

/* ---------------------------------------------------------------------------
 * Global (P2P) tags: peaklogic/v1/g/<addr>/<tag> = {"v":..,"t":".."} retained
 * ------------------------------------------------------------------------- */

static void publish_global(const char *tag, parc_tag_type_t type, double value, bool is_bool)
{
    if (!s_connected || tag == NULL || tag[0] == '\0')
    {
        return;
    }
    char topic[160];
    int n = snprintf(topic, sizeof(topic), "%s%s", s_global_prefix, tag);
    if (n <= 0 || n >= (int)sizeof(topic))
    {
        return;
    }

    char payload[64];
    if (type == PARC_TAG_REAL)
    {
        n = snprintf(payload, sizeof(payload), "{\"v\":%.6g,\"t\":\"REAL\"}", value);
    }
    else if (type == PARC_TAG_INT)
    {
        n = snprintf(payload, sizeof(payload), "{\"v\":%ld,\"t\":\"INT\"}", (long)value);
    }
    else
    {
        n = snprintf(payload, sizeof(payload), "{\"v\":%s,\"t\":\"BOOL\"}",
                     is_bool && value != 0 ? "true" : "false");
    }
    if (n <= 0 || n >= (int)sizeof(payload))
    {
        return;
    }
    esp_mqtt_client_publish(s_client, topic, payload, n, /*qos=*/1, /*retain=*/1);
}

void parc_mqtt_publish_global_bool(const char *tag, bool v)
{
    publish_global(tag, PARC_TAG_BOOL, v ? 1 : 0, true);
}

void parc_mqtt_publish_global_int(const char *tag, int32_t v)
{
    publish_global(tag, PARC_TAG_INT, (double)v, false);
}

void parc_mqtt_publish_global_real(const char *tag, double v)
{
    publish_global(tag, PARC_TAG_REAL, v, false);
}

static void handle_global(const char *topic, const char *payload, int len)
{
    /* topic is s_global_prefix + <tag>; extract the tag. */
    size_t plen = strlen(s_global_prefix);
    if (strncmp(topic, s_global_prefix, plen) != 0)
    {
        return;
    }
    const char *tag = topic + plen;
    if (tag[0] == '\0')
    {
        return;
    }

    cJSON *doc = cJSON_ParseWithLength(payload, len);
    if (doc == NULL)
    {
        return;
    }
    cJSON *v = cJSON_GetObjectItem(doc, "v");
    if (v == NULL)
    {
        v = cJSON_GetObjectItem(doc, "value");
    }
    if (v != NULL)
    {
        parc_tag_type_t type = PARC_TAG_REAL;
        const cJSON *t = cJSON_GetObjectItem(doc, "t");
        if (cJSON_IsString(t) && t->valuestring != NULL)
        {
            if (strcmp(t->valuestring, "BOOL") == 0) type = PARC_TAG_BOOL;
            else if (strcmp(t->valuestring, "INT") == 0) type = PARC_TAG_INT;
        }
        else if (cJSON_IsBool(v))
        {
            type = PARC_TAG_BOOL;
        }

        double value = cJSON_IsBool(v) ? (cJSON_IsTrue(v) ? 1.0 : 0.0)
                                       : cJSON_GetNumberValue(v);
        if (s_global_cb != NULL)
        {
            s_global_cb(tag, type, value);
        }
        else
        {
            ESP_LOGI(TAG, "global %s = %.6g (%s)", tag, value, tag_type_name(type));
        }
    }
    cJSON_Delete(doc);
}

/* ---------------------------------------------------------------------------
 * Commands: peaklogic/v1/<id>/cmd -> peaklogic/v1/<id>/cmd/response
 * ------------------------------------------------------------------------- */

static void publish_cmd_response(cJSON *res)
{
    char *out = cJSON_PrintUnformatted(res);
    if (out != NULL)
    {
        publish_str(s_topic_cmd_res, out, /*qos=*/1, /*retain=*/false);
        cJSON_free(out);
    }
}

static void cmd_error(const char *id, const char *err)
{
    cJSON *res = cJSON_CreateObject();
    if (res == NULL)
    {
        return;
    }
    cJSON_AddStringToObject(res, "id", (id != NULL) ? id : "");
    cJSON_AddBoolToObject(res, "ok", false);
    cJSON_AddStringToObject(res, "error", (err != NULL) ? err : "error");
    publish_cmd_response(res);
    cJSON_Delete(res);
}

static void handle_cmd(const char *payload, int len)
{
    cJSON *doc = cJSON_ParseWithLength(payload, len);
    if (doc == NULL)
    {
        cmd_error(NULL, "cmd json invalid");
        return;
    }

    const cJSON *jid = cJSON_GetObjectItem(doc, "id");
    const cJSON *jop = cJSON_GetObjectItem(doc, "op");
    const char *id = cJSON_IsString(jid) ? jid->valuestring : "";
    const char *op = cJSON_IsString(jop) ? jop->valuestring : NULL;
    cJSON *body = cJSON_GetObjectItem(doc, "body");

    if (op == NULL)
    {
        cmd_error(id, "missing op");
        cJSON_Delete(doc);
        return;
    }
    ESP_LOGI(TAG, "cmd op=%s", op);

    cJSON *res = cJSON_CreateObject();
    if (res == NULL)
    {
        cJSON_Delete(doc);
        return;
    }
    cJSON_AddStringToObject(res, "id", id);
    bool ok = true;
    const char *err = NULL;

    if (strcmp(op, "runtime_status") == 0)
    {
        s_force = true;   /* also emit a fresh telemetry frame shortly */
        cJSON *out = cJSON_AddObjectToObject(res, "body");
        cJSON_AddBoolToObject(out, "running", s_running);
        cJSON_AddStringToObject(out, "deviceMode", s_device_mode);
        cJSON_AddStringToObject(out, "platform", PARC_PLATFORM);
        cJSON_AddStringToObject(out, "firmwareVersion", PARC_FW_VERSION);
        cJSON_AddNumberToObject(out, "protocolVersion", PARC_PROTOCOL_VERSION);
    }
    else if (strcmp(op, "runtime_start") == 0)
    {
        s_running = true;
        s_force = true;
        int scan_ms = 100;
        if (body != NULL)
        {
            const cJSON *sm = cJSON_GetObjectItem(body, "scanMs");
            if (cJSON_IsNumber(sm)) scan_ms = (int)sm->valuedouble;
        }
        cJSON *out = cJSON_AddObjectToObject(res, "body");
        cJSON_AddBoolToObject(out, "running", true);
        cJSON_AddNumberToObject(out, "scanMs", scan_ms);
        cJSON_AddStringToObject(out, "deviceMode", s_device_mode);
    }
    else if (strcmp(op, "runtime_stop") == 0)
    {
        s_running = false;
        s_force = true;
        cJSON *out = cJSON_AddObjectToObject(res, "body");
        cJSON_AddBoolToObject(out, "running", false);
    }
    else if (strcmp(op, "set_device_mode") == 0)
    {
        const char *mode = NULL;
        if (body != NULL)
        {
            const cJSON *m = cJSON_GetObjectItem(body, "mode");
            if (!cJSON_IsString(m)) m = cJSON_GetObjectItem(body, "deviceMode");
            if (cJSON_IsString(m)) mode = m->valuestring;
        }
        if (mode == NULL || (strcmp(mode, "standalone") != 0 && strcmp(mode, "remote_io") != 0))
        {
            ok = false;
            err = "mode must be standalone or remote_io";
        }
        else
        {
            strncpy(s_device_mode, mode, sizeof(s_device_mode) - 1);
            s_device_mode[sizeof(s_device_mode) - 1] = '\0';
            if (strcmp(s_device_mode, "remote_io") == 0)
            {
                s_running = true;   /* PC will drive I/O */
            }
            s_force = true;
            cJSON *out = cJSON_AddObjectToObject(res, "body");
            cJSON_AddStringToObject(out, "deviceMode", s_device_mode);
            cJSON_AddBoolToObject(out, "rebootRecommended", false);
        }
    }
    else if (strcmp(op, "write_outputs") == 0)
    {
        cJSON *outputs = (body != NULL) ? cJSON_GetObjectItem(body, "outputs") : NULL;
        if (!cJSON_IsObject(outputs))
        {
            ok = false;
            err = "missing outputs";
        }
        else
        {
            int written = 0;
            cJSON *kv = NULL;
            cJSON_ArrayForEach(kv, outputs)
            {
                if (kv->string == NULL)
                {
                    continue;
                }
                double val = cJSON_IsBool(kv) ? (cJSON_IsTrue(kv) ? 1.0 : 0.0)
                                              : cJSON_GetNumberValue(kv);
                bool applied = false;
                /* Reflect in the registered tag so telemetry echoes the new state. */
                if (find_tag(kv->string) != NULL)
                {
                    parc_tag_set(kv->string, val);
                    applied = true;
                }
                /* Drive the physical output (GPIO/relay) via the app hook. */
                if (s_write_cb != NULL && s_write_cb(kv->string, val))
                {
                    applied = true;
                }
                if (applied)
                {
                    written++;
                }
            }
            s_force = true;
            cJSON *out = cJSON_AddObjectToObject(res, "body");
            cJSON_AddNumberToObject(out, "written", written);
        }
    }
    else if (strcmp(op, "sync_time") == 0)
    {
        /* No RTC requirement; accept and echo so PeakLogic is happy. */
        uint32_t unix_utc = 0;
        int tz = 0;
        if (body != NULL)
        {
            const cJSON *u = cJSON_GetObjectItem(body, "unixUtc");
            const cJSON *z = cJSON_GetObjectItem(body, "tzOffsetMin");
            if (cJSON_IsNumber(u)) unix_utc = (uint32_t)u->valuedouble;
            if (cJSON_IsNumber(z)) tz = (int)z->valuedouble;
        }
        cJSON *out = cJSON_AddObjectToObject(res, "body");
        cJSON_AddNumberToObject(out, "unixUtc", unix_utc);
        cJSON_AddNumberToObject(out, "tzOffsetMin", tz);
    }
    else
    {
        ok = false;
        err = "unknown op";
    }

    cJSON_AddBoolToObject(res, "ok", ok);
    if (!ok && err != NULL)
    {
        cJSON_AddStringToObject(res, "error", err);
    }
    publish_cmd_response(res);
    cJSON_Delete(res);
    cJSON_Delete(doc);
}

static void handle_config(const char *payload, int len)
{
    cJSON *doc = cJSON_ParseWithLength(payload, len);
    if (doc == NULL)
    {
        return;
    }
    const cJSON *pause = cJSON_GetObjectItem(doc, "pauseTelemetry");
    if (cJSON_IsBool(pause))
    {
        s_pause = cJSON_IsTrue(pause);
        ESP_LOGI(TAG, "pauseTelemetry=%d", (int)s_pause);
    }
    const cJSON *rep = cJSON_GetObjectItem(doc, "reportMs");
    if (cJSON_IsNumber(rep))
    {
        uint32_t ms = (uint32_t)rep->valuedouble;
        if (ms >= 100 && ms <= 600000)
        {
            s_report_ms = ms;
            ESP_LOGI(TAG, "reportMs=%lu", (unsigned long)s_report_ms);
        }
    }
    cJSON_Delete(doc);
}

/* ---------------------------------------------------------------------------
 * MQTT event routing
 * ------------------------------------------------------------------------- */

static void dispatch_data(esp_mqtt_event_handle_t event)
{
    char topic[160];
    int tlen = event->topic_len;
    if (tlen <= 0 || tlen >= (int)sizeof(topic))
    {
        return;
    }
    memcpy(topic, event->topic, tlen);
    topic[tlen] = '\0';

    const char *data = event->data;
    int dlen = event->data_len;
    if (dlen < 0)
    {
        dlen = 0;
    }

    if (strcmp(topic, s_topic_cmd) == 0)
    {
        handle_cmd(data, dlen);
    }
    else if (strcmp(topic, s_topic_config) == 0)
    {
        handle_config(data, dlen);
    }
    else if (strncmp(topic, s_global_prefix, strlen(s_global_prefix)) == 0)
    {
        handle_global(topic, data, dlen);
    }
}

static void mqtt_event_handler(void *args, esp_event_base_t base,
                               int32_t event_id, void *event_data)
{
    (void)args;
    (void)base;
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

    switch ((esp_mqtt_event_id_t)event_id)
    {
        case MQTT_EVENT_CONNECTED:
            s_connected = true;
            ESP_LOGI(TAG, "Connected to broker as %s", s_client_id);
            /* Retained birth, matching the Opta's {"online":true}. */
            publish_str(s_topic_online, "{\"online\":true}", 1, /*retain=*/true);
            esp_mqtt_client_subscribe(s_client, s_topic_cmd, 1);
            esp_mqtt_client_subscribe(s_client, s_topic_config, 1);
            esp_mqtt_client_subscribe(s_client, s_global_sub, 1);
            ESP_LOGI(TAG, "Subscribed cmd/config + global %s", s_global_sub);
            s_force = true;   /* publish a telemetry frame promptly on connect */
            break;

        case MQTT_EVENT_DISCONNECTED:
            s_connected = false;
            ESP_LOGW(TAG, "Disconnected from broker");
            break;

        case MQTT_EVENT_DATA:
            dispatch_data(event);
            break;

        case MQTT_EVENT_ERROR:
            ESP_LOGE(TAG, "MQTT error");
            break;

        default:
            break;
    }
}

/* ---------------------------------------------------------------------------
 * Setup
 * ------------------------------------------------------------------------- */

void parc_mqtt_set_global_handler(parc_global_cb_t cb) { s_global_cb = cb; }
void parc_mqtt_set_write_handler(parc_write_cb_t cb) { s_write_cb = cb; }

void parc_mqtt_start_with_cfg(const device_cfg_t *cfg, esp_netif_t *netif)
{
    const char *prefix = CONFIG_PARC_TOPIC_PREFIX;
    const char *id = (cfg != NULL && cfg->device_id[0]) ? cfg->device_id : CONFIG_PARC_DEVICE_ID;
    const char *name = (cfg != NULL && cfg->device_name[0]) ? cfg->device_name : CONFIG_PARC_DEVICE_NAME;
    int site_key = (cfg != NULL) ? cfg->global_site_key : CONFIG_PARC_GLOBAL_SITE_KEY;

    strncpy(s_device_id, id, sizeof(s_device_id) - 1);
    s_device_id[sizeof(s_device_id) - 1] = '\0';
    strncpy(s_device_name, name, sizeof(s_device_name) - 1);
    s_device_name[sizeof(s_device_name) - 1] = '\0';

    char broker_uri[96];
    if (cfg != NULL)
    {
        device_cfg_mqtt_uri(cfg, broker_uri, sizeof(broker_uri));
    }
    else
    {
        strncpy(broker_uri, CONFIG_PARC_MQTT_BROKER_URI, sizeof(broker_uri) - 1);
        broker_uri[sizeof(broker_uri) - 1] = '\0';
    }

    snprintf(s_addr_hex, sizeof(s_addr_hex), "%04x", (unsigned)(site_key & 0xffff));

    snprintf(s_topic_telemetry, sizeof(s_topic_telemetry), "%s/%s/telemetry", prefix, id);
    snprintf(s_topic_online, sizeof(s_topic_online), "%s/%s/online", prefix, id);
    snprintf(s_topic_cmd, sizeof(s_topic_cmd), "%s/%s/cmd", prefix, id);
    snprintf(s_topic_cmd_res, sizeof(s_topic_cmd_res), "%s/%s/cmd/response", prefix, id);
    snprintf(s_topic_config, sizeof(s_topic_config), "%s/%s/config", prefix, id);
    snprintf(s_global_prefix, sizeof(s_global_prefix), "%s/g/%s/", prefix, s_addr_hex);
    snprintf(s_global_sub, sizeof(s_global_sub), "%s/g/%s/+", prefix, s_addr_hex);
    snprintf(s_client_id, sizeof(s_client_id), "mv-thalow-%s", id);

    esp_mqtt_client_config_t mqtt_cfg = {
        .broker.address.uri = broker_uri,
        .credentials.client_id = s_client_id,
        .session.keepalive = 30,
        .session.last_will = {
            .topic = s_topic_online,
            .msg = "{\"online\":false}",
            .msg_len = 0,
            .qos = 1,
            .retain = 1,
        },
        .buffer.size = 2048,
    };

    if (netif != NULL)
    {
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 2, 0)
        static struct ifreq s_if_req;
        memset(&s_if_req, 0, sizeof(s_if_req));
        esp_netif_get_netif_impl_name(netif, s_if_req.ifr_name);
        mqtt_cfg.network.if_name = &s_if_req;
#else
        esp_netif_set_default_netif(netif);
#endif
    }

    if (strlen(CONFIG_PARC_MQTT_USERNAME) > 0)
    {
        mqtt_cfg.credentials.username = CONFIG_PARC_MQTT_USERNAME;
    }
    if (strlen(CONFIG_PARC_MQTT_PASSWORD) > 0)
    {
        mqtt_cfg.credentials.authentication.password = CONFIG_PARC_MQTT_PASSWORD;
    }

    s_client = esp_mqtt_client_init(&mqtt_cfg);
    if (s_client == NULL)
    {
        ESP_LOGE(TAG, "Failed to init MQTT client");
        return;
    }

    esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
    esp_mqtt_client_start(s_client);
    ESP_LOGI(TAG, "PeakLogic Parc peer '%s' -> %s", id, broker_uri);
    ESP_LOGI(TAG, "telemetry=%s  global=%s", s_topic_telemetry, s_global_prefix);
}

bool parc_mqtt_is_connected(void)
{
    return s_connected;
}
