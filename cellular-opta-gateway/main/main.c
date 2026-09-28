/*

 * PeakLogic Opta cellular gateway — MQTT bridge (Option B).

 *

 * SPDX-License-Identifier: Apache-2.0

 */



#include <stdio.h>



#include "esp_event.h"

#include "esp_log.h"

#include "esp_netif.h"

#include "freertos/FreeRTOS.h"

#include "freertos/task.h"

#include "nvs_flash.h"



#include "device_cfg.h"

#include "eth_lan.h"

#include "modem_net.h"

#include "mqtt_bridge.h"

#include "mqtt_local.h"

#include "setup_web.h"

#include "wifi_setup.h"



static gateway_cfg_t s_cfg;



static void gateway_services_task(void *arg)

{

    gateway_cfg_t *cfg = (gateway_cfg_t *)arg;



    /* Let the open setup AP come up before modem/MQTT/Ethernet work starts. */

    vTaskDelay(pdMS_TO_TICKS(5000));



    esp_netif_t *lan_netif = NULL;

    if (eth_lan_init(cfg, &lan_netif))

    {

        char ip[16];

        eth_lan_get_ip_str(ip, sizeof(ip));

        printf("[lan ] Opta side %s — broker mqtt://%s:%u\n",

               ip, cfg->lan_ip, cfg->local_mqtt_port);

    }



    esp_netif_t *wan_netif = NULL;

    if (modem_net_init(cfg, &wan_netif))

    {

        printf("[wan ] cellular/Wi-Fi WAN starting (APN=%s)\n", cfg->modem_apn);

    }



    if (mqtt_bridge_start(cfg))

    {

        printf("[mqtt] bridge: Opta @ %s:%u -> cloud %s:%u\n",

               cfg->lan_ip, cfg->local_mqtt_port,

               cfg->cloud_mqtt_host, cfg->cloud_mqtt_port);

    }



    vTaskDelete(NULL);

}



void app_main(void)

{

    printf("\n\n=== PeakLogic Opta Gateway (MQTT bridge) " __DATE__ " " __TIME__ " ===\n");



    esp_err_t err = nvs_flash_init();

    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND)

    {

        ESP_ERROR_CHECK(nvs_flash_erase());

        ESP_ERROR_CHECK(nvs_flash_init());

    }

    ESP_ERROR_CHECK(esp_netif_init());

    ESP_ERROR_CHECK(esp_event_loop_create_default());



    gateway_cfg_load(&s_cfg);



    if (wifi_setup_start_ap(&s_cfg))

    {

        setup_web_start(&s_cfg);

        printf("[setup] Wi-Fi AP '%s' (open, no password) -> http://192.168.4.1:%d/setup\n",

               s_cfg.wifi_ap_ssid, CONFIG_DEVCFG_WIFI_AP_HTTP_PORT);

    }



    xTaskCreate(gateway_services_task, "gw_services", 8192, &s_cfg, 5, NULL);



    const uint32_t tick_ms = 100;

    uint32_t since_log = 0;

    for (;;)

    {

        modem_net_poll();

        mqtt_bridge_poll();



        static bool s_cloud_started;

        const bool wan_up = modem_net_is_up() || wifi_wan_is_up();

        if (wan_up)

        {

            if (!s_cloud_started)

            {

                mqtt_bridge_ensure_cloud();

                s_cloud_started = mqtt_bridge_cloud_connected();

            }

        }

        else if (s_cloud_started)

        {

            mqtt_bridge_stop();

            s_cloud_started = false;

        }



        since_log += tick_ms;

        if (since_log >= 5000)

        {

            since_log = 0;

            char wan[16];

            modem_net_get_ip_str(wan, sizeof(wan));

            printf("[stat] eth=%s wan=%s cloud_mqtt=%s opta_clients=%d fwd=%lu/%lu rssi=%d\n",

                   eth_lan_is_up() ? "up" : "down",

                   modem_net_is_up() ? wan : "down",

                   mqtt_bridge_cloud_connected() ? "up" : "down",

                   mqtt_local_client_count(),

                   (unsigned long)mqtt_bridge_fwd_to_cloud(),

                   (unsigned long)mqtt_bridge_fwd_to_local(),

                   modem_net_rssi());

        }



        vTaskDelay(pdMS_TO_TICKS(tick_ms));

    }

}


