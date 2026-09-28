/*
 * MQTT bridge — local Opta broker <-> cloud PeakLogic Mosquitto.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "mqtt_bridge.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "mqtt_client.h"
#include "mqtt_local.h"

static const char *TAG = "mqtt_bridge";

static gateway_cfg_t s_cfg;
static esp_mqtt_client_handle_t s_cloud;
static bool s_cloud_up;
static uint32_t s_to_cloud;
static uint32_t s_to_local;

static bool topic_is_parc(const char *topic)
{
    return topic != NULL && strncmp(topic, GW_MQTT_TOPIC_PREFIX "/",
                                   strlen(GW_MQTT_TOPIC_PREFIX) + 1) == 0;
}

static bool cloud_host_ready(const gateway_cfg_t *cfg)
{
    if (cfg == NULL || !cfg->cloud_mqtt_set || cfg->cloud_mqtt_host[0] == '\0')
    {
        return false;
    }
    if (strcmp(cfg->cloud_mqtt_host, "127.0.0.1") == 0 ||
        strcmp(cfg->cloud_mqtt_host, "localhost") == 0)
    {
        return false;
    }
    return true;
}

static void on_local_publish(const char *topic, const uint8_t *payload, size_t len,
                             int qos, bool retain, void *ctx)
{
    (void)ctx;
    if (!topic_is_parc(topic) || s_cloud == NULL || !s_cloud_up)
    {
        return;
    }
    int msg_id = esp_mqtt_client_publish(s_cloud, topic, (const char *)payload, (int)len, qos, retain ? 1 : 0);
    if (msg_id >= 0)
    {
        s_to_cloud++;
        ESP_LOGD(TAG, "-> cloud %s (%u bytes)", topic, (unsigned)len);
    }
}

static void cloud_event(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)handler_args;
    (void)base;
    esp_mqtt_event_handle_t ev = event_data;

    switch ((esp_mqtt_event_id_t)event_id)
    {
        case MQTT_EVENT_CONNECTED:
            s_cloud_up = true;
            esp_mqtt_client_subscribe(s_cloud, GW_MQTT_BRIDGE_SUB, 1);
            ESP_LOGI(TAG, "cloud MQTT connected, subscribed %s", GW_MQTT_BRIDGE_SUB);
            break;

        case MQTT_EVENT_DISCONNECTED:
            s_cloud_up = false;
            ESP_LOGW(TAG, "cloud MQTT disconnected");
            break;

        case MQTT_EVENT_DATA:
            if (ev->topic_len <= 0 || ev->data_len <= 0)
            {
                break;
            }
            {
                char topic[192];
                int tl = ev->topic_len < (int)sizeof(topic) - 1 ? ev->topic_len : (int)sizeof(topic) - 1;
                memcpy(topic, ev->topic, (size_t)tl);
                topic[tl] = '\0';

                if (!topic_is_parc(topic))
                {
                    break;
                }

                if (mqtt_local_deliver(topic, (const uint8_t *)ev->data, (size_t)ev->data_len,
                                       ev->qos, ev->retain))
                {
                    s_to_local++;
                    ESP_LOGD(TAG, "<- local %s (%d bytes)", topic, ev->data_len);
                }
            }
            break;

        default:
            break;
    }
}

static esp_mqtt_client_handle_t cloud_client_create(const gateway_cfg_t *cfg)
{
    esp_mqtt_client_config_t mc = { 0 };
    char uri[96];
    snprintf(uri, sizeof(uri), "mqtt://%s:%u", cfg->cloud_mqtt_host, cfg->cloud_mqtt_port);
    mc.broker.address.uri = uri;
    mc.credentials.client_id = "mv-opta-gateway";
    if (cfg->cloud_mqtt_user[0])
    {
        mc.credentials.username = cfg->cloud_mqtt_user;
        mc.credentials.authentication.password = cfg->cloud_mqtt_pass;
    }
    mc.session.keepalive = 60;
    mc.network.reconnect_timeout_ms = 5000;
    return esp_mqtt_client_init(&mc);
}

bool mqtt_bridge_start(const gateway_cfg_t *cfg)
{
    if (cfg == NULL)
    {
        return false;
    }
    s_cfg = *cfg;
    s_to_cloud = 0;
    s_to_local = 0;

    /* Bind all interfaces — works before W5500 link; Opta uses cfg->lan_ip. */
    if (!mqtt_local_start("0.0.0.0", cfg->local_mqtt_port, on_local_publish, NULL))
    {
        ESP_LOGE(TAG, "local broker start failed");
        return false;
    }

    ESP_LOGI(TAG, "local broker :%u — Opta broker IP %s",
             cfg->local_mqtt_port, cfg->lan_ip);
    return true;
}

void mqtt_bridge_ensure_cloud(void)
{
    if (s_cloud != NULL)
    {
        if (s_cloud_up)
        {
            return;
        }
        esp_mqtt_client_stop(s_cloud);
        esp_mqtt_client_destroy(s_cloud);
        s_cloud = NULL;
    }

    if (!cloud_host_ready(&s_cfg))
    {
        return;
    }

    s_cloud = cloud_client_create(&s_cfg);
    if (s_cloud == NULL)
    {
        ESP_LOGE(TAG, "cloud client init failed");
        return;
    }
    esp_mqtt_client_register_event(s_cloud, ESP_EVENT_ANY_ID, cloud_event, NULL);
    esp_mqtt_client_start(s_cloud);
    ESP_LOGI(TAG, "cloud client -> %s:%u", s_cfg.cloud_mqtt_host, s_cfg.cloud_mqtt_port);
}

void mqtt_bridge_stop(void)
{
    if (s_cloud)
    {
        esp_mqtt_client_stop(s_cloud);
        esp_mqtt_client_destroy(s_cloud);
        s_cloud = NULL;
    }
    s_cloud_up = false;
}

void mqtt_bridge_poll(void)
{
    mqtt_local_poll();
}

void mqtt_bridge_on_config_saved(const gateway_cfg_t *cfg)
{
    mqtt_bridge_stop();
    mqtt_bridge_start(cfg);
}

bool mqtt_bridge_cloud_connected(void)
{
    return s_cloud_up;
}

bool mqtt_bridge_local_listening(void)
{
    return mqtt_local_is_listening();
}

uint32_t mqtt_bridge_fwd_to_cloud(void)
{
    return s_to_cloud;
}

uint32_t mqtt_bridge_fwd_to_local(void)
{
    return s_to_local;
}
