/*
 * PeakLogic cellular Parc ST — ESP32 soft PLC (runs MVBC like the PC / Opta).
 *
 * Board: LilyGO T-ETH-ELITE-A7670X
 * Default WAN: Wi-Fi STA (no modem) for cloud-arduino / bench testing.
 * SPDX-License-Identifier: Apache-2.0
 */
#include <stdio.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "device_cfg.h"
#include "modem_net.h"
#include "mqtt_parc.h"
#include "setup_web.h"
#include "st/mv_config.h"
#include "st/mv_io.h"
#include "st/mv_program.h"
#include "st/mv_tags.h"
#include "wifi_setup.h"

static const char *TAG = "main";
static parc_st_cfg_t s_cfg;

void app_main(void)
{
    printf("\n\n=== PeakLogic Parc ST (ESP32 soft PLC) %s " __DATE__ " " __TIME__ " ===\n",
           MV_FIRMWARE_VERSION);

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    parc_cfg_load(&s_cfg);
    mvIoBegin();
    mvTagsBegin();
    if (mvProgramNvLoad()) {
        printf("[nv  ] program loaded name=%s autorun=%d\n", mvProgramName(),
               (int)mvAutoRunOnBoot());
    }
    if (mvIoSmI010Present()) {
        printf("[io  ] Sequent SM-I-010 online — I1..I4 / R1..R4\n");
    } else {
        printf("[io  ] SM-I-010 not found — soft I/O (RAM) for I*/R*\n");
    }
    printf("[mode] %s siteKey=0x%04x\n", mvDeviceModeString(mvDeviceModeActive()),
           (unsigned)s_cfg.global_site_key);

#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    printf("[wan ] Wi-Fi STA (no modem) — cloud-arduino / bench\n");
#else
    printf("[wan ] LTE modem\n");
#endif

    if (wifi_setup_start_ap(&s_cfg)) {
        setup_web_start(&s_cfg);
        printf("[setup] AP '%s' -> http://192.168.4.1:%d/setup\n", s_cfg.wifi_ap_ssid,
               CONFIG_DEVCFG_WIFI_AP_HTTP_PORT);
    }

    if (modem_net_init(&s_cfg)) {
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
        printf("[wan ] starting Wi-Fi STA\n");
#else
        printf("[wan ] starting (APN=%s)\n", s_cfg.modem_apn);
#endif
    }

    bool mqtt_started = false;
    int64_t last_scan_us = esp_timer_get_time();
    uint32_t since_log = 0;

    for (;;) {
        modem_net_poll();

        if (modem_net_is_up() && !mqtt_started) {
            if (mqtt_parc_start(&s_cfg)) {
                mqtt_started = true;
                printf("[mqtt] Parc client -> %s:%u deviceId=%s\n", s_cfg.mqtt_host, s_cfg.mqtt_port,
                       s_cfg.device_id);
                if ((s_cfg.autorun || mvAutoRunOnBoot()) && mvProgramValid() &&
                    !mvDeviceModeRemoteIo()) {
                    mvRuntimeSetRunning(true);
                }
                if (mvDeviceModeRemoteIo()) {
                    mvRuntimeSetRunning(true);
                }
            }
        }

        if (mqtt_started) {
            mqtt_parc_poll();
        }

        const uint32_t scan_ms = mvRuntimeScanMs();
        int64_t now = esp_timer_get_time();
        uint32_t dt_ms = (uint32_t)((now - last_scan_us) / 1000);
        if (dt_ms >= scan_ms) {
            last_scan_us = now;
            if (mvRuntimeIsRunning()) {
                if (mvDeviceModeRemoteIo()) {
                    mvExecuteIoScan();
                } else {
                    mvExecuteScan(dt_ms > 1000 ? scan_ms : dt_ms);
                }
            }
        }

        since_log += 50;
        if (since_log >= 5000) {
            since_log = 0;
            char wan[16];
            modem_net_get_ip_str(wan, sizeof(wan));
            ESP_LOGI(TAG, "wan=%s mqtt=%s mode=%s run=%d prog=%d tags=%u cycles=%lu rssi=%d",
                     modem_net_is_up() ? wan : "down", mqtt_parc_connected() ? "up" : "down",
                     mvDeviceModeString(mvDeviceModeActive()), (int)mvRuntimeIsRunning(),
                     (int)mvProgramValid(), (unsigned)mvTagCount(),
                     (unsigned long)mvRuntimeCycles(), modem_net_rssi());
        }

        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
