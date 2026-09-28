/*
 * MQTT Parc peer — put_program / runtime_* / telemetry (protocol v2).
 * SPDX-License-Identifier: Apache-2.0
 */
#include "mqtt_parc.h"

#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "mqtt_client.h"
#include "sdkconfig.h"

#include "st/mv_config.h"
#include "st/mv_bc.h"
#include "st/mv_global_key.h"
#include "st/mv_io.h"
#include "st/mv_program.h"
#include "st/mv_rtc.h"
#include "st/mv_tags.h"

static const char *TAG = "mqtt_parc";

static esp_mqtt_client_handle_t s_client;
static parc_st_cfg_t s_cfg;
static bool s_connected;
static bool s_pause_telemetry;
static bool s_force_telemetry;
static int64_t s_last_report_ms;

static void topic_build(char *out, size_t n, const char *suffix)
{
    snprintf(out, n, "%s/%s/%s", s_cfg.topic_prefix, s_cfg.device_id, suffix);
}

static void publish_online(bool on)
{
    char topic[128];
    topic_build(topic, sizeof(topic), "online");
    const char *payload = on ? "{\"online\":true}" : "{\"online\":false}";
    if (s_client) {
        esp_mqtt_client_publish(s_client, topic, payload, 0, 1, 1);
    }
}

static void send_cmd_response(const char *id, bool ok, cJSON *body, const char *err)
{
    cJSON *res = cJSON_CreateObject();
    cJSON_AddStringToObject(res, "id", id ? id : "");
    cJSON_AddBoolToObject(res, "ok", ok);
    if (err) {
        cJSON_AddStringToObject(res, "error", err);
    }
    if (body) {
        cJSON_AddItemToObject(res, "body", body);
    }
    char *out = cJSON_PrintUnformatted(res);
    cJSON_Delete(res);
    if (!out) {
        return;
    }
    char topic[128];
    topic_build(topic, sizeof(topic), "cmd/response");
    esp_mqtt_client_publish(s_client, topic, out, 0, 1, 0);
    free(out);
}

static void handle_put_program(cJSON *root, const char *id)
{
    if (mvDeviceModeRemoteIo()) {
        send_cmd_response(id, false, NULL, "remote_io rejects put_program");
        return;
    }
    cJSON *body = cJSON_GetObjectItem(root, "body");
    if (!cJSON_IsObject(body)) {
        send_cmd_response(id, false, NULL, "missing body");
        return;
    }
    cJSON *bc = cJSON_GetObjectItem(body, "bc");
    cJSON *pname = cJSON_GetObjectItem(body, "programName");
    cJSON *proto = cJSON_GetObjectItem(body, "protocolVersion");
    cJSON *ar = cJSON_GetObjectItem(body, "autoRunOnBoot");
    if (!cJSON_IsBool(ar)) {
        ar = cJSON_GetObjectItem(body, "autorun");
    }
    const char *bc_str = cJSON_IsString(bc) ? bc->valuestring : NULL;
    const char *name = cJSON_IsString(pname) ? pname->valuestring : "";
    int protocol = cJSON_IsNumber(proto) ? proto->valueint : 0;
    if (cJSON_IsBool(ar)) {
        mvSetAutoRunOnBoot(cJSON_IsTrue(ar));
        s_cfg.autorun = cJSON_IsTrue(ar);
        parc_cfg_save(&s_cfg);
    }
    char err[128];
    if (!mvProgramLoadBcB64(bc_str, name, protocol, err, sizeof(err))) {
        send_cmd_response(id, false, NULL, err[0] ? err : mvLastProgramError());
        return;
    }
    cJSON *out = cJSON_CreateObject();
    cJSON_AddBoolToObject(out, "ok", true);
    cJSON_AddBoolToObject(out, "programOk", true);
    cJSON_AddNumberToObject(out, "tagCount", mvTagCount());
    cJSON_AddNumberToObject(out, "bcCrc", mvBcDeployCrc());
    cJSON_AddBoolToObject(out, "programFromNv", mvProgramFromNv());
    cJSON_AddBoolToObject(out, "autoRunOnBoot", mvAutoRunOnBoot());
    ESP_LOGI(TAG, "put_program OK tags=%u", (unsigned)mvTagCount());
    send_cmd_response(id, true, out, NULL);
}

static void apply_tag_value(const char *tag_id, cJSON *val)
{
    if (!tag_id || !val) {
        return;
    }
    if (cJSON_IsBool(val)) {
        mvSetBool(tag_id, cJSON_IsTrue(val));
    } else if (cJSON_IsNumber(val)) {
        double d = val->valuedouble;
        if (d == (int)d) {
            mvSetInt(tag_id, (int)d);
        } else {
            mvSetReal(tag_id, (float)d);
        }
    }
}

static void handle_cmd(const char *json, int len)
{
    cJSON *root = cJSON_ParseWithLength(json, len);
    if (!root) {
        return;
    }
    cJSON *idj = cJSON_GetObjectItem(root, "id");
    cJSON *opj = cJSON_GetObjectItem(root, "op");
    const char *id = cJSON_IsString(idj) ? idj->valuestring : "";
    const char *op = cJSON_IsString(opj) ? opj->valuestring : "";
    if (!id[0] || !op[0]) {
        cJSON_Delete(root);
        return;
    }
    ESP_LOGI(TAG, "cmd %s", op);

    if (strcmp(op, "put_program") == 0) {
        handle_put_program(root, id);
    } else if (strcmp(op, "clear_program") == 0) {
        if (mvDeviceModeRemoteIo()) {
            send_cmd_response(id, false, NULL, "remote_io rejects clear_program");
        } else {
            mvProgramNvClear();
            mvRuntimeSetRunning(false);
            cJSON *out = cJSON_CreateObject();
            cJSON_AddBoolToObject(out, "cleared", true);
            send_cmd_response(id, true, out, NULL);
        }
    } else if (strcmp(op, "get_program") == 0) {
        cJSON *out = cJSON_CreateObject();
        cJSON_AddBoolToObject(out, "programLoaded", mvProgramValid());
        cJSON_AddBoolToObject(out, "programFromNv", mvProgramFromNv());
        cJSON_AddBoolToObject(out, "autoRunOnBoot", mvAutoRunOnBoot());
        cJSON_AddNumberToObject(out, "programNvCrc", mvProgramValid() ? mvBcDeployCrc() : 0);
        cJSON_AddStringToObject(out, "error", mvLastProgramError());
        cJSON_AddStringToObject(out, "programName", mvProgramName());
        if (mvProgramValid()) {
            cJSON_AddNumberToObject(out, "bcCrc", mvBcDeployCrc());
            cJSON_AddNumberToObject(out, "bcBytes", (double)mvBcBytes());
        }
        send_cmd_response(id, true, out, NULL);
    } else if (strcmp(op, "runtime_start") == 0) {
        cJSON *body = cJSON_GetObjectItem(root, "body");
        cJSON *scan = body ? cJSON_GetObjectItem(body, "scanMs") : NULL;
        if (cJSON_IsNumber(scan)) {
            mvRuntimeSetScanMs((uint32_t)scan->valuedouble);
        }
        mvOneShotReset();
        mvRuntimeSetRunning(true);
        cJSON *out = cJSON_CreateObject();
        cJSON_AddBoolToObject(out, "running", true);
        cJSON_AddNumberToObject(out, "scanMs", mvRuntimeScanMs());
        cJSON_AddStringToObject(out, "deviceMode", mvDeviceModeString(mvDeviceModeActive()));
        send_cmd_response(id, true, out, NULL);
    } else if (strcmp(op, "runtime_stop") == 0) {
        mvRuntimeSetRunning(false);
        cJSON *out = cJSON_CreateObject();
        cJSON_AddBoolToObject(out, "running", false);
        send_cmd_response(id, true, out, NULL);
    } else if (strcmp(op, "runtime_status") == 0) {
        cJSON *out = cJSON_CreateObject();
        cJSON_AddBoolToObject(out, "running", mvRuntimeIsRunning());
        cJSON_AddNumberToObject(out, "scanMs", mvRuntimeScanMs());
        cJSON_AddBoolToObject(out, "programOk", mvProgramValid());
        cJSON_AddStringToObject(out, "programError", mvLastProgramError());
        cJSON_AddStringToObject(out, "deviceMode", mvDeviceModeString(mvDeviceModeActive()));
        cJSON_AddStringToObject(out, "firmwareVersion", MV_FIRMWARE_VERSION);
        if (mvProgramValid()) {
            cJSON_AddNumberToObject(out, "bcCrc", mvBcDeployCrc());
        }
        send_cmd_response(id, true, out, NULL);
    } else if (strcmp(op, "set_autorun") == 0) {
        if (mvDeviceModeRemoteIo()) {
            send_cmd_response(id, false, NULL, "remote_io rejects set_autorun");
        } else {
            cJSON *body = cJSON_GetObjectItem(root, "body");
            cJSON *ar = body ? cJSON_GetObjectItem(body, "autorun") : NULL;
            if (!cJSON_IsBool(ar) && body) {
                ar = cJSON_GetObjectItem(body, "enabled");
            }
            if (!cJSON_IsBool(ar) && body) {
                ar = cJSON_GetObjectItem(body, "autoRunOnBoot");
            }
            if (cJSON_IsBool(ar)) {
                s_cfg.autorun = cJSON_IsTrue(ar);
                mvSetAutoRunOnBoot(cJSON_IsTrue(ar));
                parc_cfg_save(&s_cfg);
                if (mvProgramValid()) {
                    mvProgramNvSave(cJSON_IsTrue(ar));
                }
            }
            cJSON *out = cJSON_CreateObject();
            cJSON_AddBoolToObject(out, "autorun", s_cfg.autorun);
            cJSON_AddBoolToObject(out, "autoRunOnBoot", mvAutoRunOnBoot());
            send_cmd_response(id, true, out, NULL);
        }
    } else if (strcmp(op, "write_memory") == 0) {
        cJSON *body = cJSON_GetObjectItem(root, "body");
        cJSON *tags = body ? cJSON_GetObjectItem(body, "tags") : NULL;
        uint8_t n = 0;
        if (cJSON_IsArray(tags)) {
            cJSON *row;
            cJSON_ArrayForEach(row, tags)
            {
                cJSON *tid = cJSON_GetObjectItem(row, "id");
                if (!cJSON_IsString(tid)) {
                    continue;
                }
                apply_tag_value(tid->valuestring, cJSON_GetObjectItem(row, "value"));
                n++;
            }
        }
        s_force_telemetry = true;
        cJSON *out = cJSON_CreateObject();
        cJSON_AddNumberToObject(out, "written", n);
        send_cmd_response(id, true, out, NULL);
    } else if (strcmp(op, "write_outputs") == 0) {
        cJSON *body = cJSON_GetObjectItem(root, "body");
        uint8_t n = 0;
        cJSON *outputs = body ? cJSON_GetObjectItem(body, "outputs") : NULL;
        if (cJSON_IsObject(outputs)) {
            cJSON *child = outputs->child;
            while (child) {
                apply_tag_value(child->string, child);
                n++;
                child = child->next;
            }
        } else {
            cJSON *tags = body ? cJSON_GetObjectItem(body, "tags") : NULL;
            if (cJSON_IsArray(tags)) {
                cJSON *row;
                cJSON_ArrayForEach(row, tags)
                {
                    cJSON *tid = cJSON_GetObjectItem(row, "id");
                    if (!cJSON_IsString(tid)) {
                        continue;
                    }
                    apply_tag_value(tid->valuestring, cJSON_GetObjectItem(row, "value"));
                    n++;
                }
            }
        }
        mvWritePhysicalOutputs();
        s_force_telemetry = true;
        cJSON *out = cJSON_CreateObject();
        cJSON_AddNumberToObject(out, "written", n);
        send_cmd_response(id, true, out, NULL);
    } else if (strcmp(op, "set_device_mode") == 0) {
        cJSON *body = cJSON_GetObjectItem(root, "body");
        cJSON *modej = body ? cJSON_GetObjectItem(body, "mode") : NULL;
        if (!cJSON_IsString(modej) && body) {
            modej = cJSON_GetObjectItem(body, "deviceMode");
        }
        const char *mode = cJSON_IsString(modej) ? modej->valuestring : "";
        uint8_t next = MV_DEVICE_STANDALONE;
        if (strcmp(mode, "remote_io") == 0) {
            next = MV_DEVICE_REMOTE_IO;
        } else if (strcmp(mode, "standalone") == 0) {
            next = MV_DEVICE_STANDALONE;
        } else {
            send_cmd_response(id, false, NULL, "mode must be standalone or remote_io");
            cJSON_Delete(root);
            return;
        }
        if (!mvDeviceModeSet(next)) {
            send_cmd_response(id, false, NULL, "set_device_mode save failed");
        } else {
            if (next == MV_DEVICE_REMOTE_IO) {
                mvRuntimeSetRunning(true);
            }
            cJSON *out = cJSON_CreateObject();
            cJSON_AddStringToObject(out, "deviceMode", mvDeviceModeString(next));
            cJSON_AddBoolToObject(out, "rebootRecommended", true);
            send_cmd_response(id, true, out, NULL);
        }
    } else if (strcmp(op, "set_force") == 0) {
        cJSON *body = cJSON_GetObjectItem(root, "body");
        if (!cJSON_IsObject(body)) {
            send_cmd_response(id, false, NULL, "missing body");
        } else {
            cJSON *tid = cJSON_GetObjectItem(body, "tagId");
            if (!cJSON_IsString(tid)) {
                tid = cJSON_GetObjectItem(body, "id");
            }
            const char *tag_id = cJSON_IsString(tid) ? tid->valuestring : "";
            cJSON *fin = cJSON_GetObjectItem(body, "forceInput");
            cJSON *fout = cJSON_GetObjectItem(body, "forceOutput");
            cJSON *fv = cJSON_GetObjectItem(body, "forceValue");
            bool has_val = fv && !cJSON_IsNull(fv);
            bool b_val = false;
            int32_t i_val = 0;
            float r_val = 0.0f;
            if (has_val) {
                if (cJSON_IsBool(fv)) {
                    b_val = cJSON_IsTrue(fv);
                    i_val = b_val ? 1 : 0;
                    r_val = b_val ? 1.0f : 0.0f;
                } else if (cJSON_IsNumber(fv)) {
                    r_val = (float)fv->valuedouble;
                    i_val = (int32_t)fv->valuedouble;
                    b_val = i_val != 0;
                }
            }
            if (!tag_id[0] ||
                !mvTagSetForce(tag_id, cJSON_IsTrue(fin), cJSON_IsTrue(fout), has_val, b_val, i_val,
                               r_val)) {
                send_cmd_response(id, false, NULL, "set_force failed");
            } else {
                s_force_telemetry = true;
                send_cmd_response(id, true, NULL, NULL);
            }
        }
    } else if (strcmp(op, "clear_force") == 0) {
        cJSON *body = cJSON_GetObjectItem(root, "body");
        cJSON *tid = body ? cJSON_GetObjectItem(body, "tagId") : NULL;
        if (!cJSON_IsString(tid) && body) {
            tid = cJSON_GetObjectItem(body, "id");
        }
        const char *tag_id = cJSON_IsString(tid) ? tid->valuestring : "";
        if (!tag_id[0] || !mvTagClearForce(tag_id)) {
            send_cmd_response(id, false, NULL, "clear_force failed");
        } else {
            s_force_telemetry = true;
            send_cmd_response(id, true, NULL, NULL);
        }
    } else if (strcmp(op, "sync_time") == 0) {
        cJSON *body = cJSON_GetObjectItem(root, "body");
        cJSON *unixj = body ? cJSON_GetObjectItem(body, "unixUtc") : NULL;
        cJSON *tzj = body ? cJSON_GetObjectItem(body, "tzOffsetMin") : NULL;
        uint32_t unix_utc = cJSON_IsNumber(unixj) ? (uint32_t)unixj->valuedouble : 0;
        int tz = cJSON_IsNumber(tzj) ? (int)tzj->valuedouble : 0;
        if (unix_utc < 1577836800u) {
            send_cmd_response(id, false, NULL, "invalid unixUtc");
        } else {
            mvRtcSetSoftwareClock(unix_utc, tz);
            cJSON *out = cJSON_CreateObject();
            cJSON_AddNumberToObject(out, "unixUtc", unix_utc);
            cJSON_AddNumberToObject(out, "tzOffsetMin", tz);
            cJSON_AddBoolToObject(out, "wallClockSet", mvRtcHasWallClock());
            send_cmd_response(id, true, out, NULL);
        }
    } else if (strcmp(op, "scan_expansions") == 0) {
        /* LilyGO has no Opta expansion bus — acknowledge for hub parity. */
        cJSON *out = cJSON_CreateObject();
        cJSON_AddNumberToObject(out, "slots", 0);
        cJSON_AddBoolToObject(out, "smI010", mvIoSmI010Present());
        send_cmd_response(id, true, out, NULL);
    } else {
        send_cmd_response(id, false, NULL, "unknown op");
    }
    cJSON_Delete(root);
}

static void handle_config(const char *json, int len)
{
    cJSON *root = cJSON_ParseWithLength(json, len);
    if (!root) {
        return;
    }
    cJSON *pause = cJSON_GetObjectItem(root, "pauseTelemetry");
    if (cJSON_IsBool(pause)) {
        s_pause_telemetry = cJSON_IsTrue(pause);
    }
    cJSON *report = cJSON_GetObjectItem(root, "reportMs");
    if (cJSON_IsNumber(report)) {
        uint32_t ms = (uint32_t)report->valuedouble;
        if (ms >= 100 && ms <= 600000) {
            s_cfg.report_ms = ms;
        }
    }
    cJSON_Delete(root);
}

static void mqtt_event(void *arg, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)base;
    esp_mqtt_event_handle_t ev = event_data;
    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED: {
        s_connected = true;
        char cmd[128], cfg[128], glob[128];
        topic_build(cmd, sizeof(cmd), "cmd");
        topic_build(cfg, sizeof(cfg), "config");
        esp_mqtt_client_subscribe(s_client, cmd, 1);
        esp_mqtt_client_subscribe(s_client, cfg, 1);
        if (mvGlobalTagCount() > 0) {
            char addr[5];
            mvGlobalAddrKey(addr);
            snprintf(glob, sizeof(glob), "%s/g/%s/+", s_cfg.topic_prefix, addr);
            esp_mqtt_client_subscribe(s_client, glob, 1);
        }
        publish_online(true);
        s_force_telemetry = true;
        ESP_LOGI(TAG, "connected to %s:%u as %s mode=%s", s_cfg.mqtt_host, s_cfg.mqtt_port,
                 s_cfg.device_id, mvDeviceModeString(mvDeviceModeActive()));
        break;
    }
    case MQTT_EVENT_DISCONNECTED:
        s_connected = false;
#if CONFIG_GPIO_RELAY_ENABLE
        mvIoFailsafeOff();
#endif
        ESP_LOGW(TAG, "disconnected");
        break;
    case MQTT_EVENT_DATA: {
        char topic[160];
        int tlen = ev->topic_len < (int)sizeof(topic) - 1 ? ev->topic_len : (int)sizeof(topic) - 1;
        memcpy(topic, ev->topic, tlen);
        topic[tlen] = '\0';
        char expect_cmd[128], expect_cfg[128], glob_pfx[96];
        topic_build(expect_cmd, sizeof(expect_cmd), "cmd");
        topic_build(expect_cfg, sizeof(expect_cfg), "config");
        char addr[5];
        mvGlobalAddrKey(addr);
        snprintf(glob_pfx, sizeof(glob_pfx), "%s/g/%s/", s_cfg.topic_prefix, addr);
        if (strcmp(topic, expect_cfg) == 0) {
            handle_config(ev->data, ev->data_len);
        } else if (strcmp(topic, expect_cmd) == 0) {
            handle_cmd(ev->data, ev->data_len);
        } else if (strncmp(topic, glob_pfx, strlen(glob_pfx)) == 0) {
            const char *tag_name = topic + strlen(glob_pfx);
            MvTag *t = mvFindTag(tag_name);
            if (t && t->isGlobal && ev->data_len > 0 && ev->data_len < 256) {
                char buf[256];
                memcpy(buf, ev->data, ev->data_len);
                buf[ev->data_len] = '\0';
                cJSON *doc = cJSON_Parse(buf);
                if (doc) {
                    cJSON *v = cJSON_GetObjectItem(doc, "v");
                    if (!v) {
                        v = cJSON_GetObjectItem(doc, "value");
                    }
                    apply_tag_value(t->id, v);
                    cJSON_Delete(doc);
                }
            }
        }
        break;
    }
    default:
        break;
    }
}

bool mqtt_parc_start(const parc_st_cfg_t *cfg)
{
    if (!cfg || !cfg->mqtt_host[0]) {
        return false;
    }
    s_cfg = *cfg;
    s_connected = false;
    s_pause_telemetry = false;
    s_force_telemetry = true;
    s_last_report_ms = 0;

    char uri[128];
    snprintf(uri, sizeof(uri), "mqtt://%s:%u", s_cfg.mqtt_host, s_cfg.mqtt_port);

    char lwt_topic[128];
    topic_build(lwt_topic, sizeof(lwt_topic), "online");

    char client_id[80];
    snprintf(client_id, sizeof(client_id), "mv-parc-st-%s", s_cfg.device_id);

    esp_mqtt_client_config_t mqtt_cfg = {
        .broker.address.uri = uri,
        .credentials.client_id = client_id,
        .session.last_will.topic = lwt_topic,
        .session.last_will.msg = "{\"online\":false}",
        .session.last_will.qos = 1,
        .session.last_will.retain = true,
        .buffer.size = 20480,
    };
    if (s_cfg.mqtt_user[0]) {
        mqtt_cfg.credentials.username = s_cfg.mqtt_user;
        mqtt_cfg.credentials.authentication.password = s_cfg.mqtt_pass;
    }

    s_client = esp_mqtt_client_init(&mqtt_cfg);
    if (!s_client) {
        return false;
    }
    esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, mqtt_event, NULL);
    esp_mqtt_client_start(s_client);
    return true;
}

void mqtt_parc_force_telemetry(void)
{
    s_force_telemetry = true;
}

bool mqtt_parc_connected(void)
{
    return s_connected;
}

void mqtt_parc_publish_telemetry(void)
{
    if (!s_connected || s_pause_telemetry || !s_client) {
        return;
    }
    int64_t now = esp_timer_get_time() / 1000;
    if (!s_force_telemetry && (now - s_last_report_ms) < (int64_t)s_cfg.report_ms) {
        return;
    }
    s_last_report_ms = now;
    s_force_telemetry = false;

    cJSON *doc = cJSON_CreateObject();
    cJSON_AddStringToObject(doc, "deviceId", s_cfg.device_id);
    cJSON_AddStringToObject(doc, "name", s_cfg.device_name);
    cJSON_AddStringToObject(doc, "platform", MV_PLATFORM_ID);
    cJSON_AddNumberToObject(doc, "protocolVersion", MV_PROTOCOL_VERSION);
    cJSON_AddStringToObject(doc, "firmwareVersion", MV_FIRMWARE_VERSION);
    cJSON_AddStringToObject(doc, "deviceMode", mvDeviceModeString(mvDeviceModeActive()));
    cJSON_AddNumberToObject(doc, "globalSiteKey", mvGlobalSiteKey());
    char addr[5];
    mvGlobalAddrKey(addr);
    cJSON_AddStringToObject(doc, "globalAddrKey", addr);
    cJSON_AddNumberToObject(doc, "reportIntervalSec", (int)(s_cfg.report_ms / 1000));
    cJSON_AddBoolToObject(doc, "smI010", mvIoSmI010Present());
    if (mvIoSmI010Present()) {
        cJSON_AddStringToObject(doc, "ioHat", "SM-I-010");
    }
    if (mvRtcHasWallClock()) {
        cJSON_AddNumberToObject(doc, "unixUtc", mvRtcUnixUtc());
    }

    cJSON *rt = cJSON_AddObjectToObject(doc, "runtime");
    cJSON_AddBoolToObject(rt, "running", mvRuntimeIsRunning());
    cJSON_AddNumberToObject(rt, "scanMs", mvRuntimeScanMs());
    cJSON_AddNumberToObject(rt, "cycles", mvRuntimeCycles());
    cJSON_AddNumberToObject(rt, "lastCycleUs", mvRuntimeLastCycleUs());
    cJSON_AddBoolToObject(rt, "programOk", mvProgramValid());
    cJSON_AddStringToObject(rt, "deviceMode", mvDeviceModeString(mvDeviceModeActive()));
    cJSON_AddBoolToObject(rt, "autoRunOnBoot", mvAutoRunOnBoot());
    cJSON_AddBoolToObject(rt, "programFromNv", mvProgramFromNv());

    cJSON *tags = cJSON_AddArrayToObject(doc, "tags");
    for (uint8_t i = 0; i < mvTagCount(); i++) {
        MvTag *t = mvTagAt(i);
        if (!t) {
            continue;
        }
        cJSON *row = cJSON_CreateObject();
        cJSON_AddStringToObject(row, "id", t->id);
        cJSON_AddStringToObject(row, "type", mvTagKindName(t->kind));
        if (mvIsPhysicalInput(t->id)) {
            cJSON_AddStringToObject(row, "role", "input");
        } else if (mvIsPhysicalOutput(t->id)) {
            cJSON_AddStringToObject(row, "role", "output");
        } else {
            cJSON_AddStringToObject(row, "role", "memory");
        }
        cJSON_AddStringToObject(row, "quality", "GOOD");
        if (t->forceInput || t->forceOutput) {
            cJSON_AddBoolToObject(row, "forceInput", t->forceInput);
            cJSON_AddBoolToObject(row, "forceOutput", t->forceOutput);
        }
        if (t->isGlobal) {
            cJSON_AddBoolToObject(row, "global", true);
        }
        switch (t->kind) {
        case MV_BOOL:
            cJSON_AddBoolToObject(row, "value", mvTagEffectiveBool(t));
            break;
        case MV_INT:
            cJSON_AddNumberToObject(row, "value", mvTagEffectiveInt(t));
            break;
        case MV_REAL:
            cJSON_AddNumberToObject(row, "value", mvTagEffectiveReal(t));
            break;
        case MV_TIMER:
            cJSON_AddBoolToObject(row, "value", t->tmrDone);
            break;
        case MV_COUNTER:
            cJSON_AddNumberToObject(row, "value", t->count);
            break;
        case MV_PID:
            cJSON_AddNumberToObject(row, "value", t->out);
            break;
        case MV_AVG:
            cJSON_AddNumberToObject(row, "value", t->avgVal);
            break;
        case MV_FLOW:
            cJSON_AddNumberToObject(row, "value", t->flowGpm);
            break;
        case MV_ALT:
            cJSON_AddNumberToObject(row, "value", t->altActiveUnit);
            break;
        }
        cJSON_AddItemToArray(tags, row);

        if (t->isGlobal && s_client) {
            char gtopic[128];
            if (mvGlobalTopic(t->id, s_cfg.topic_prefix, gtopic, sizeof(gtopic))) {
                cJSON *gdoc = cJSON_CreateObject();
                const char *type_str = "BOOL";
                switch (t->kind) {
                case MV_INT:
                    type_str = "INT";
                    cJSON_AddNumberToObject(gdoc, "v", mvTagEffectiveInt(t));
                    break;
                case MV_REAL:
                    type_str = "REAL";
                    cJSON_AddNumberToObject(gdoc, "v", mvTagEffectiveReal(t));
                    break;
                default:
                    cJSON_AddBoolToObject(gdoc, "v", mvTagEffectiveBool(t));
                    break;
                }
                cJSON_AddStringToObject(gdoc, "t", type_str);
                char *gp = cJSON_PrintUnformatted(gdoc);
                cJSON_Delete(gdoc);
                if (gp) {
                    esp_mqtt_client_publish(s_client, gtopic, gp, 0, 1, 1);
                    free(gp);
                }
            }
        }
    }

    char *out = cJSON_PrintUnformatted(doc);
    cJSON_Delete(doc);
    if (!out) {
        return;
    }
    char topic[128];
    topic_build(topic, sizeof(topic), "telemetry");
    esp_mqtt_client_publish(s_client, topic, out, 0, 0, 0);
    free(out);
}

void mqtt_parc_poll(void)
{
    mqtt_parc_publish_telemetry();
}
