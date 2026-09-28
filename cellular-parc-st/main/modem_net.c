/*
 * WAN bring-up — Wi-Fi STA (bench) or A7670 PPP (field).
 * SPDX-License-Identifier: Apache-2.0
 */
#include "modem_net.h"

#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "sdkconfig.h"

#if CONFIG_MODEM_LTE_ENABLE && !CONFIG_GATEWAY_WAN_WIFI_FALLBACK
#include "esp_modem_api.h"
#include "esp_netif_ppp.h"
#include "board_pins.h"
#endif

static const char *TAG = "modem_net";

static EventGroupHandle_t s_wan_events;
static const int WAN_GOT_IP_BIT = BIT0;
static bool s_wan_up;
static char s_wan_ip[16];
static int s_rssi = -1;
static esp_netif_t *s_sta_netif;

static void on_got_ip(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)base;
    (void)id;
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
    snprintf(s_wan_ip, sizeof(s_wan_ip), IPSTR, IP2STR(&event->ip_info.ip));
    s_wan_up = true;
    if (s_wan_events) {
        xEventGroupSetBits(s_wan_events, WAN_GOT_IP_BIT);
    }
    ESP_LOGI(TAG, "WAN IP %s", s_wan_ip);
}

#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
static void sta_credentials(const parc_st_cfg_t *cfg, const char **ssid, const char **pass)
{
    if (cfg && cfg->wifi_sta_ssid[0]) {
        *ssid = cfg->wifi_sta_ssid;
        *pass = cfg->wifi_sta_pass;
        return;
    }
    *ssid = CONFIG_GATEWAY_WAN_WIFI_SSID;
    *pass = CONFIG_GATEWAY_WAN_WIFI_PASS;
}

static bool wifi_wan_start(const parc_st_cfg_t *cfg)
{
    const char *ssid;
    const char *pass;
    sta_credentials(cfg, &ssid, &pass);
    if (!ssid[0]) {
        ESP_LOGE(TAG, "router Wi-Fi SSID not set — configure on /setup");
        return false;
    }

    s_sta_netif = esp_netif_create_default_wifi_sta();
    wifi_init_config_t wcfg_init = WIFI_INIT_CONFIG_DEFAULT();
    esp_err_t err = esp_wifi_init(&wcfg_init);
    if (err != ESP_OK && err != ESP_ERR_WIFI_INIT_STATE) {
        ESP_LOGE(TAG, "wifi init %s", esp_err_to_name(err));
        return false;
    }
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_got_ip, NULL));
    wifi_config_t wcfg = { 0 };
    strncpy((char *)wcfg.sta.ssid, ssid, sizeof(wcfg.sta.ssid));
    strncpy((char *)wcfg.sta.password, pass, sizeof(wcfg.sta.password));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wcfg));
    err = esp_wifi_start();
    if (err != ESP_OK && err != ESP_ERR_WIFI_CONN) {
        /* already started by setup AP */
    }
    ESP_ERROR_CHECK(esp_wifi_connect());
    ESP_LOGI(TAG, "STA connecting to router %s", ssid);
    return true;
}

bool modem_net_apply_sta(const parc_st_cfg_t *cfg)
{
    if (!cfg) {
        return false;
    }
    const char *ssid;
    const char *pass;
    sta_credentials(cfg, &ssid, &pass);
    if (!ssid[0]) {
        ESP_LOGW(TAG, "router Wi-Fi SSID empty");
        return false;
    }

    s_wan_up = false;
    s_wan_ip[0] = '\0';
    if (s_wan_events) {
        xEventGroupClearBits(s_wan_events, WAN_GOT_IP_BIT);
    }

    esp_wifi_disconnect();
    wifi_config_t wcfg = { 0 };
    strncpy((char *)wcfg.sta.ssid, ssid, sizeof(wcfg.sta.ssid));
    strncpy((char *)wcfg.sta.password, pass, sizeof(wcfg.sta.password));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wcfg));
    esp_err_t err = esp_wifi_connect();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "STA reconnect %s", esp_err_to_name(err));
        return false;
    }
    ESP_LOGI(TAG, "STA reconnecting to router %s", ssid);
    return true;
}
#endif

#if CONFIG_MODEM_LTE_ENABLE && !CONFIG_GATEWAY_WAN_WIFI_FALLBACK
static esp_modem_dce_t *s_dce;
static esp_netif_t *s_ppp_netif;
static parc_st_cfg_t s_cfg_copy;

static void modem_pwrkey_pulse(void)
{
#if BOARD_MODEM_PWRKEY_GPIO >= 0
    gpio_config_t io = {
        .pin_bit_mask = 1ULL << BOARD_MODEM_PWRKEY_GPIO,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    gpio_config(&io);
    gpio_set_level(BOARD_MODEM_PWRKEY_GPIO, 1);
    vTaskDelay(pdMS_TO_TICKS(100));
    gpio_set_level(BOARD_MODEM_PWRKEY_GPIO, 0);
    vTaskDelay(pdMS_TO_TICKS(CONFIG_MODEM_PWRON_PULSE_MS));
    gpio_set_level(BOARD_MODEM_PWRKEY_GPIO, 1);
#endif
}

static void modem_board_hw_init(void)
{
#if BOARD_HAS_INTEGRATED_A7670 && BOARD_MODEM_GPS_EN_GPIO >= 0
    gpio_config_t gps = {
        .pin_bit_mask = 1ULL << BOARD_MODEM_GPS_EN_GPIO,
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&gps);
    const int data_mode_level = BOARD_MODEM_GPS_EN_LEVEL ? 0 : 1;
    gpio_set_level(BOARD_MODEM_GPS_EN_GPIO, data_mode_level);
    ESP_LOGI(TAG, "GPS mux GPIO%d=%d", BOARD_MODEM_GPS_EN_GPIO, data_mode_level);
#endif
    modem_pwrkey_pulse();
}

static void modem_bringup_task(void *arg)
{
    (void)arg;
    modem_board_hw_init();
    vTaskDelay(pdMS_TO_TICKS(3000));

    esp_modem_dce_config_t dce_config = ESP_MODEM_DCE_DEFAULT_CONFIG(s_cfg_copy.modem_apn);
    esp_netif_config_t ppp_cfg = ESP_NETIF_DEFAULT_PPP();
    s_ppp_netif = esp_netif_new(&ppp_cfg);
    if (!s_ppp_netif) {
        vTaskDelete(NULL);
        return;
    }

    esp_modem_dte_config_t dte_config = ESP_MODEM_DTE_DEFAULT_CONFIG();
    dte_config.uart_config.port_num = (uart_port_t)CONFIG_MODEM_UART_PORT;
    dte_config.uart_config.tx_io_num = CONFIG_MODEM_UART_TX_GPIO;
    dte_config.uart_config.rx_io_num = CONFIG_MODEM_UART_RX_GPIO;
    dte_config.uart_config.baud_rate = CONFIG_MODEM_UART_BAUD;
    dte_config.uart_config.flow_control = ESP_MODEM_FLOW_CONTROL_NONE;

    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_PPP_GOT_IP, on_got_ip, NULL));

    s_dce = esp_modem_new_dev(ESP_MODEM_DCE_SIM7600, &dte_config, &dce_config, s_ppp_netif);
    if (!s_dce) {
        ESP_LOGE(TAG, "esp_modem_new_dev failed");
        vTaskDelete(NULL);
        return;
    }
    int ber = 0;
    if (esp_modem_get_signal_quality(s_dce, &s_rssi, &ber) == ESP_OK) {
        ESP_LOGI(TAG, "RSSI=%d", s_rssi);
    }
    if (esp_modem_set_mode(s_dce, ESP_MODEM_MODE_DATA) != ESP_OK) {
        ESP_LOGE(TAG, "PPP DATA mode failed");
    }
    vTaskDelete(NULL);
}
#endif

bool modem_net_init(const parc_st_cfg_t *cfg)
{
    s_wan_up = false;
    s_wan_ip[0] = '\0';
    if (s_wan_events == NULL) {
        s_wan_events = xEventGroupCreate();
    }

#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    return wifi_wan_start(cfg);
#elif CONFIG_MODEM_LTE_ENABLE
    if (!cfg) {
        return false;
    }
    s_cfg_copy = *cfg;
    xTaskCreate(modem_bringup_task, "modem_wan", 8192, NULL, 5, NULL);
    return true;
#else
    (void)cfg;
    ESP_LOGW(TAG, "no WAN configured — enable Wi-Fi fallback or LTE in menuconfig");
    return false;
#endif
}

void modem_net_poll(void) {}

bool modem_net_is_up(void)
{
    return s_wan_up;
}

void modem_net_get_ip_str(char *buf, size_t len)
{
    if (!buf || !len) {
        return;
    }
    strncpy(buf, s_wan_ip, len - 1);
    buf[len - 1] = '\0';
}

int modem_net_rssi(void)
{
    return s_rssi;
}
