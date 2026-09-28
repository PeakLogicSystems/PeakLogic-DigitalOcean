/*
 * Cellular WAN — A7670 UART + esp_modem PPP (LilyGO T-ETH-ELITE-A7670X integrated).
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "modem_net.h"

#include "board_pins.h"

#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/uart.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_modem_api.h"
#include "esp_netif.h"
#include "esp_netif_ppp.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "lwip/inet.h"
#include "ping/ping_sock.h"
#include "wifi_setup.h"

static const char *TAG = "modem_net";

static EventGroupHandle_t s_wan_events;
static const int WAN_GOT_IP_BIT = BIT0;
static const int WAN_LOST_IP_BIT = BIT1;

static esp_modem_dce_t *s_dce;
static esp_netif_t *s_ppp_netif;
static bool s_wan_up;
static bool s_events_registered;
static bool s_task_started;
static int s_rssi;
static char s_wan_ip[16];

static gateway_cfg_t s_cfg_copy;

typedef struct
{
    SemaphoreHandle_t done;
    bool got_reply;
    uint32_t time_ms;
} ping_done_t;

static void on_ping_success(esp_ping_handle_t hdl, void *args)
{
    ping_done_t *ctx = args;
    esp_ping_get_profile(hdl, ESP_PING_PROF_TIMEGAP, &ctx->time_ms, sizeof(ctx->time_ms));
    ctx->got_reply = true;
}

static void on_ping_end(esp_ping_handle_t hdl, void *args)
{
    (void)hdl;
    ping_done_t *ctx = args;
    xSemaphoreGive(ctx->done);
}

static void wan_gateway_test_task(void *arg)
{
    (void)arg;
    vTaskDelay(pdMS_TO_TICKS(2000));
    char msg[80];
    int rtt = -1;
    if (modem_net_ping("8.8.8.8", &rtt, msg, sizeof(msg)))
    {
        ESP_LOGI(TAG, "gateway test 8.8.8.8 OK (%d ms)", rtt);
    }
    else
    {
        ESP_LOGW(TAG, "gateway test 8.8.8.8 FAIL: %s", msg);
    }
    vTaskDelete(NULL);
}

static void on_ip_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)base;
    if (id == IP_EVENT_PPP_GOT_IP)
    {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)data;
        snprintf(s_wan_ip, sizeof(s_wan_ip), IPSTR, IP2STR(&event->ip_info.ip));
        s_wan_up = true;
        if (s_wan_events)
        {
            xEventGroupSetBits(s_wan_events, WAN_GOT_IP_BIT);
        }
        ESP_LOGI(TAG, "PPP up — WAN IP %s", s_wan_ip);
        xTaskCreate(wan_gateway_test_task, "wan_ping", 4096, NULL, 4, NULL);
    }
    else if (id == IP_EVENT_PPP_LOST_IP)
    {
        s_wan_up = false;
        s_wan_ip[0] = '\0';
        if (s_wan_events)
        {
            xEventGroupSetBits(s_wan_events, WAN_LOST_IP_BIT);
        }
        ESP_LOGW(TAG, "PPP lost IP");
    }
}

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
    ESP_LOGI(TAG, "PWRKEY pulse on GPIO%d", BOARD_MODEM_PWRKEY_GPIO);
#endif
}

static void modem_board_hw_init(void)
{
#if BOARD_STATUS_LED_GPIO >= 0
    gpio_config_t led = {
        .pin_bit_mask = 1ULL << BOARD_STATUS_LED_GPIO,
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&led);
    gpio_set_level(BOARD_STATUS_LED_GPIO, 0);
#endif

#if BOARD_HAS_INTEGRATED_A7670 && BOARD_MODEM_GPS_EN_GPIO >= 0
    /*
     * Integrated T-ETH-ELITE-A7670X: GPIO4 muxes GPS vs modem UART.
     * Hold GPS disabled (inverse of MODEM_GPS_ENABLE_LEVEL) for PPP data.
     * See LilyGo-Modem-Series LILYGO_T_ETH_ELITE_A7670X utilities.h.
     */
    gpio_config_t gps = {
        .pin_bit_mask = 1ULL << BOARD_MODEM_GPS_EN_GPIO,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
    };
    gpio_config(&gps);
    const int data_mode_level = BOARD_MODEM_GPS_EN_LEVEL ? 0 : 1;
    gpio_set_level(BOARD_MODEM_GPS_EN_GPIO, data_mode_level);
    ESP_LOGI(TAG, "integrated A7670: GPS mux GPIO%d=%d (data/UART path)",
             BOARD_MODEM_GPS_EN_GPIO, data_mode_level);
#endif

    modem_pwrkey_pulse();
}

static void modem_bringup_task(void *arg)
{
    (void)arg;

    modem_board_hw_init();
    /* Let modem firmware boot and AP stay stable for /setup provisioning. */
    vTaskDelay(pdMS_TO_TICKS(8000));

    esp_modem_dce_config_t dce_config = ESP_MODEM_DCE_DEFAULT_CONFIG(s_cfg_copy.modem_apn);
    esp_netif_config_t ppp_cfg = ESP_NETIF_DEFAULT_PPP();
    s_ppp_netif = esp_netif_new(&ppp_cfg);
    if (s_ppp_netif == NULL)
    {
        ESP_LOGE(TAG, "PPP netif create failed");
        vTaskDelete(NULL);
        return;
    }

    esp_modem_dte_config_t dte_config = ESP_MODEM_DTE_DEFAULT_CONFIG();
    dte_config.uart_config.port_num = (uart_port_t)CONFIG_MODEM_UART_PORT;
    dte_config.uart_config.tx_io_num = CONFIG_MODEM_UART_TX_GPIO;
    dte_config.uart_config.rx_io_num = CONFIG_MODEM_UART_RX_GPIO;
    dte_config.uart_config.rts_io_num = UART_PIN_NO_CHANGE;
    dte_config.uart_config.cts_io_num = UART_PIN_NO_CHANGE;
    dte_config.uart_config.baud_rate = CONFIG_MODEM_UART_BAUD;
    dte_config.uart_config.flow_control = ESP_MODEM_FLOW_CONTROL_NONE;
    dte_config.uart_config.rx_buffer_size = 2048;
    dte_config.uart_config.tx_buffer_size = 512;

#if CONFIG_MODEM_DTR_GPIO >= 0
    gpio_config_t dtr = {
        .pin_bit_mask = 1ULL << CONFIG_MODEM_DTR_GPIO,
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&dtr);
    gpio_set_level(CONFIG_MODEM_DTR_GPIO, 0);
#endif

    ESP_LOGI(TAG, "esp_modem A7670 (SIM7600 DCE) APN=%s UART TX=%d RX=%d",
             s_cfg_copy.modem_apn, CONFIG_MODEM_UART_TX_GPIO, CONFIG_MODEM_UART_RX_GPIO);

    s_dce = esp_modem_new_dev(ESP_MODEM_DCE_SIM7600, &dte_config, &dce_config, s_ppp_netif);
    if (s_dce == NULL)
    {
        ESP_LOGE(TAG, "esp_modem_new_dev failed");
        vTaskDelete(NULL);
        return;
    }

    int ber = 0;
    esp_err_t err = ESP_FAIL;
    for (int attempt = 0; attempt < 5 && err != ESP_OK; attempt++)
    {
        if (attempt > 0)
        {
            ESP_LOGW(TAG, "modem wake retry %d/5", attempt + 1);
            vTaskDelay(pdMS_TO_TICKS(3000));
        }
        err = esp_modem_get_signal_quality(s_dce, &s_rssi, &ber);
    }
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "modem not responding on UART — check SIM/modem power");
        vTaskDelete(NULL);
        return;
    }
    ESP_LOGI(TAG, "modem RSSI=%d ber=%d", s_rssi, ber);

    err = ESP_FAIL;
    for (int attempt = 0; attempt < 5 && err != ESP_OK; attempt++)
    {
        if (attempt > 0)
        {
            ESP_LOGW(TAG, "DATA mode retry %d/5", attempt + 1);
            vTaskDelay(pdMS_TO_TICKS(5000));
        }
        err = esp_modem_set_mode(s_dce, ESP_MODEM_MODE_DATA);
    }
    if (err != ESP_OK)
    {
        ESP_LOGE(TAG, "esp_modem_set_mode(DATA) failed: %s — check APN=%s and SIM",
                 esp_err_to_name(err), s_cfg_copy.modem_apn);
        vTaskDelete(NULL);
        return;
    }

    EventBits_t bits = xEventGroupWaitBits(s_wan_events, WAN_GOT_IP_BIT, pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(120000));
    if ((bits & WAN_GOT_IP_BIT) == 0)
    {
        ESP_LOGE(TAG, "PPP connect timeout — check SIM/APN/antenna");
    }

    vTaskDelete(NULL);
}

static bool modem_register_events(void)
{
    if (s_events_registered)
    {
        return true;
    }
    if (esp_event_handler_register(IP_EVENT, IP_EVENT_PPP_GOT_IP, on_ip_event, NULL) != ESP_OK)
    {
        return false;
    }
    if (esp_event_handler_register(IP_EVENT, IP_EVENT_PPP_LOST_IP, on_ip_event, NULL) != ESP_OK)
    {
        return false;
    }
    s_events_registered = true;
    return true;
}

bool modem_net_init(const gateway_cfg_t *cfg, esp_netif_t **out_wan_netif)
{
    s_wan_up = false;
    s_wan_ip[0] = '\0';

    if (out_wan_netif)
    {
        *out_wan_netif = NULL;
    }

#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    if (wifi_wan_start_sta())
    {
        ESP_LOGI(TAG, "WAN: bench Wi-Fi STA");
        return true;
    }
    return false;
#elif !CONFIG_MODEM_LTE_ENABLE
    ESP_LOGW(TAG, "LTE disabled in menuconfig");
    return false;
#else
    if (cfg == NULL)
    {
        return false;
    }
    s_cfg_copy = *cfg;

    if (s_wan_events == NULL)
    {
        s_wan_events = xEventGroupCreate();
    }
    if (!modem_register_events())
    {
        ESP_LOGE(TAG, "event register failed");
        return false;
    }

    if (!s_task_started)
    {
        s_task_started = true;
        xTaskCreate(modem_bringup_task, "modem_wan", 8192, NULL, 5, NULL);
    }

    if (out_wan_netif)
    {
        *out_wan_netif = s_ppp_netif;
    }
    return true;
#endif
}

void modem_net_poll(void)
{
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    s_wan_up = wifi_wan_is_up();
    if (s_wan_up)
    {
        wifi_wan_get_ip_str(s_wan_ip, sizeof(s_wan_ip));
    }
#endif
}

bool modem_net_is_up(void)
{
    return s_wan_up;
}

void modem_net_get_ip_str(char *buf, size_t len)
{
    if (buf == NULL || len == 0)
    {
        return;
    }
#if CONFIG_GATEWAY_WAN_WIFI_FALLBACK
    wifi_wan_get_ip_str(buf, len);
#else
    strncpy(buf, s_wan_ip, len - 1);
    buf[len - 1] = '\0';
#endif
}

int modem_net_rssi(void)
{
    return s_rssi;
}

bool modem_net_ping(const char *host, int *rtt_ms, char *msg, size_t msg_len)
{
    if (msg == NULL || msg_len == 0)
    {
        return false;
    }
    msg[0] = '\0';

    if (!modem_net_is_up())
    {
        snprintf(msg, msg_len, "WAN down");
        return false;
    }
    if (host == NULL || host[0] == '\0')
    {
        snprintf(msg, msg_len, "host required");
        return false;
    }

    esp_ping_config_t cfg = ESP_PING_DEFAULT_CONFIG();
    if (inet_aton(host, &cfg.target_addr.u_addr.ip4) == 0)
    {
        snprintf(msg, msg_len, "invalid host");
        return false;
    }
    cfg.target_addr.type = IPADDR_TYPE_V4;
    cfg.count = 3;
    cfg.interval_ms = 500;
    cfg.timeout_ms = 3000;
    if (s_ppp_netif != NULL)
    {
        cfg.interface = esp_netif_get_netif_impl_index(s_ppp_netif);
    }

    ping_done_t ctx = {
        .done = xSemaphoreCreateBinary(),
        .got_reply = false,
        .time_ms = 0,
    };
    if (ctx.done == NULL)
    {
        snprintf(msg, msg_len, "no memory");
        return false;
    }

    esp_ping_callbacks_t cbs = {
        .cb_args = &ctx,
        .on_ping_success = on_ping_success,
        .on_ping_timeout = NULL,
        .on_ping_end = on_ping_end,
    };

    esp_ping_handle_t ping = NULL;
    if (esp_ping_new_session(&cfg, &cbs, &ping) != ESP_OK)
    {
        vSemaphoreDelete(ctx.done);
        snprintf(msg, msg_len, "ping session failed");
        return false;
    }

    esp_ping_start(ping);
    xSemaphoreTake(ctx.done, pdMS_TO_TICKS(15000));
    esp_ping_stop(ping);
    esp_ping_delete_session(ping);
    vSemaphoreDelete(ctx.done);

    if (ctx.got_reply)
    {
        if (rtt_ms != NULL)
        {
            *rtt_ms = (int)ctx.time_ms;
        }
        snprintf(msg, msg_len, "ok");
        ESP_LOGI(TAG, "ping %s: %u ms", host, (unsigned)ctx.time_ms);
        return true;
    }

    snprintf(msg, msg_len, "no reply from %s", host);
    ESP_LOGW(TAG, "ping %s: no reply", host);
    return false;
}
