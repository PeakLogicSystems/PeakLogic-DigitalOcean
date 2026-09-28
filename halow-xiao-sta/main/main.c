/*
 * PeakLogic Parc MQTT peer for LilyGO T-HaLow.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "nvs_flash.h"

#include "device_cfg.h"
#include "halow_net.h"
#include "mqtt_parc.h"
#include "sensor_templates.h"
#include "sensors.h"
#include "setup_web.h"
#include "tx_ah.h"
#include "wifi_setup.h"

#define PUBLISH_PERIOD_MS CONFIG_PARC_PUBLISH_INTERVAL_MS

static device_cfg_t s_cfg;

static parc_tag_type_t parc_type_from_sensor(sens_value_type_t vt)
{
    switch (vt)
    {
        case SENS_VAL_BOOL:
            return PARC_TAG_BOOL;
        case SENS_VAL_INT:
            return PARC_TAG_INT;
        default:
            return PARC_TAG_REAL;
    }
}

static void register_sensor_parc_tags(void)
{
    for (int i = 0; i < sensors_tag_count(); i++)
    {
        sens_tag_reading_t tr;
        if (!sensors_get_tag(i, &tr))
        {
            continue;
        }
        parc_tag_register(tr.tag, parc_type_from_sensor(tr.val_type), "input");
    }
}

static void on_global_tag(const char *tag, parc_tag_type_t type, double value)
{
    (void)type;
    printf("[peer] global %s = %.3f\n", tag, value);
}

static bool on_write_output(const char *tag, double value)
{
    printf("[cmd ] write %s = %.3f\n", tag, value);
    if (value != 0 && sensors_leak_reset_tag(tag))
    {
        return true;
    }
    return false;
}

static bool halow_connect(void)
{
    if (!tx_ah_init())
    {
        ESP_LOGE("main", "TX-AH init failed");
        return false;
    }

#if CONFIG_TX_AH_USE_PAIRING
    if (!tx_ah_pair_and_connect(CONFIG_TX_AH_PAIR_TIMEOUT_MS))
    {
        ESP_LOGW("main", "HaLow pairing/connect failed — check AP pairing mode");
        return false;
    }
#else
    if (!tx_ah_apply_credentials(CONFIG_HALOW_SSID, CONFIG_HALOW_PSK_HEX))
    {
        return false;
    }
    uint32_t start = xTaskGetTickCount();
    while ((xTaskGetTickCount() - start) < pdMS_TO_TICKS(CONFIG_TX_AH_PAIR_TIMEOUT_MS))
    {
        tx_ah_poll();
        if (tx_ah_is_connected())
        {
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    if (!tx_ah_is_connected())
    {
        ESP_LOGW("main", "HaLow connect timed out");
        return false;
    }
#endif

    uint8_t mac[6];
    if (tx_ah_get_mac(mac))
    {
        printf("[halow] MAC %02x:%02x:%02x:%02x:%02x:%02x\n",
               mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    }
    return true;
}

void app_main(void)
{
    printf("\n\n=== LilyGO T-HaLow PeakLogic Parc (MQTT over HaLow) "
           __DATE__ " " __TIME__ " ===\n");

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    device_cfg_load(&s_cfg);

    if (wifi_setup_start_ap(&s_cfg))
    {
        setup_web_start(&s_cfg);
        printf("[setup] Wi-Fi AP '%s' -> http://192.168.4.1:%d/setup\n",
               s_cfg.wifi_ap_ssid, CONFIG_DEVCFG_WIFI_AP_HTTP_PORT);
    }

    esp_netif_t *halow_netif = NULL;
    if (halow_connect() && halow_net_init(&s_cfg, &halow_netif))
    {
        char ip[16];
        halow_net_get_ip_str(ip, sizeof(ip));
        printf("[net ] HaLow UP  IP=%s  (MQTT uses this interface)\n", ip);
    }
    else
    {
        printf("[net ] HaLow network not ready — MQTT will retry when link is up\n");
    }

    sensors_init(s_cfg.sensor_template);
    printf("[sens] template #%u: %s (%d tags)\n",
           s_cfg.sensor_template, sens_template_name(s_cfg.sensor_template),
           sensors_tag_count());

    register_sensor_parc_tags();

    parc_mqtt_set_global_handler(on_global_tag);
    parc_mqtt_set_write_handler(on_write_output);
    parc_mqtt_start_with_cfg(&s_cfg, halow_netif);

    const uint32_t tick_ms = 250;
    uint32_t since_log_ms = 0;
    for (;;)
    {
        tx_ah_poll();

        int32_t halow_rssi = 0;
        bool have_rssi = tx_ah_get_rssi(&halow_rssi);
        bool halow_up = tx_ah_is_connected() && halow_net_is_up();

        char ip[16] = "0.0.0.0";
        halow_net_get_ip_str(ip, sizeof(ip));

        for (int i = 0; i < sensors_tag_count(); i++)
        {
            sens_tag_reading_t tr;
            if (sensors_get_tag(i, &tr))
            {
                parc_tag_set(tr.tag, tr.value);
            }
        }

        parc_mqtt_maybe_publish_telemetry(ip, have_rssi ? halow_rssi : 0, halow_up);

        since_log_ms += tick_ms;
        if (since_log_ms >= PUBLISH_PERIOD_MS)
        {
            since_log_ms = 0;
            printf("[stat] halow=%s  RSSI=%s%ld dBm  ip=%s  mqtt=%s\n",
                   halow_up ? "up" : "down", have_rssi ? "" : "(n/a) ",
                   (long)(have_rssi ? halow_rssi : 0), ip,
                   parc_mqtt_is_connected() ? "up" : "down");
        }

        vTaskDelay(pdMS_TO_TICKS(tick_ms));
    }
}
