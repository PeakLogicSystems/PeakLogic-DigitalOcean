/*
 * Taixin TX-AH UART AT driver — see tx_ah.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "tx_ah.h"

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#include "driver/uart.h"
#include "esp_log.h"

static const char *TAG = "tx_ah";

#define UART_PORT       CONFIG_TX_AH_UART_PORT
#define UART_BAUD       CONFIG_TX_AH_UART_BAUD
#define RX_BUF          2048
#define AT_TIMEOUT_MS   CONFIG_TX_AH_AT_TIMEOUT_MS
#define FRAME_MAX       1518

static tx_ah_sta_state_t s_state = TX_AH_STA_DISABLED;
static int32_t s_rssi = 0;
static uint8_t s_mac[6];
static bool s_have_mac;

static SemaphoreHandle_t s_uart_lock;
static tx_ah_frame_cb_t s_frame_cb;

static volatile bool s_at_active;
static char s_at_buf[512];
static volatile size_t s_at_len;

static bool send_raw(const char *cmd)
{
    int n = uart_write_bytes(UART_PORT, cmd, strlen(cmd));
    return n == (int)strlen(cmd);
}

static bool wait_at_token(const char *token, uint32_t timeout_ms)
{
    uint32_t start = xTaskGetTickCount();
    while ((xTaskGetTickCount() - start) < pdMS_TO_TICKS(timeout_ms))
    {
        size_t len = s_at_len;
        if (len >= sizeof(s_at_buf))
        {
            len = sizeof(s_at_buf) - 1;
        }
        if (len > 0)
        {
            char tmp[513];
            memcpy(tmp, s_at_buf, len);
            tmp[len] = '\0';
            if (strstr(tmp, token) != NULL)
            {
                return true;
            }
            if (strstr(tmp, "ERROR") != NULL)
            {
                return false;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
    return false;
}

static bool at_ok_locked(const char *body)
{
    char cmd[128];
    snprintf(cmd, sizeof(cmd), "AT%s\r\n", body);
    s_at_len = 0;
    s_at_active = true;
    if (!send_raw(cmd))
    {
        s_at_active = false;
        return false;
    }
    bool ok = wait_at_token("OK", AT_TIMEOUT_MS);
    s_at_active = false;
    return ok;
}

static bool at_ok(const char *body)
{
    if (xSemaphoreTake(s_uart_lock, pdMS_TO_TICKS(5000)) != pdTRUE)
    {
        return false;
    }
    bool ok = at_ok_locked(body);
    xSemaphoreGive(s_uart_lock);
    return ok;
}

static void uart_rx_task(void *arg)
{
    (void)arg;

    enum rx_state
    {
        RX_LINE = 0,
        RX_FRAME,
    } state = RX_LINE;

    char line[160];
    size_t line_pos = 0;
    uint8_t frame[FRAME_MAX];
    size_t frame_need = 0;
    size_t frame_got = 0;

    for (;;)
    {
        uint8_t b = 0;
        int n = uart_read_bytes(UART_PORT, &b, 1, pdMS_TO_TICKS(50));
        if (n <= 0)
        {
            continue;
        }

        if (s_at_active)
        {
            size_t idx = s_at_len;
            if (idx < sizeof(s_at_buf) - 1)
            {
                s_at_buf[idx] = (char)b;
                s_at_len = idx + 1;
            }
            continue;
        }

        if (state == RX_FRAME)
        {
            if (frame_got < sizeof(frame))
            {
                frame[frame_got++] = b;
            }
            if (frame_need > 0)
            {
                if (frame_got >= frame_need)
                {
                    if (s_frame_cb != NULL && frame_got >= 14)
                    {
                        s_frame_cb(frame, frame_got);
                    }
                    state = RX_LINE;
                    frame_got = 0;
                    frame_need = 0;
                    line_pos = 0;
                }
            }
            else if (frame_got >= 14)
            {
                int extra = uart_read_bytes(UART_PORT, frame + frame_got,
                                            (int)(sizeof(frame) - frame_got),
                                            pdMS_TO_TICKS(20));
                if (extra > 0)
                {
                    frame_got += (size_t)extra;
                }
                if (s_frame_cb != NULL)
                {
                    s_frame_cb(frame, frame_got);
                }
                state = RX_LINE;
                frame_got = 0;
                line_pos = 0;
            }
            continue;
        }

        if (b == '\n')
        {
            line[line_pos] = '\0';
            while (line_pos > 0 && (line[line_pos - 1] == '\r' || line[line_pos - 1] == ' '))
            {
                line[--line_pos] = '\0';
            }

            if (strstr(line, "+RXDATA") != NULL)
            {
                const char *p = strchr(line, ':');
                if (p == NULL)
                {
                    p = strchr(line, '=');
                }
                frame_need = 0;
                if (p != NULL)
                {
                    frame_need = (size_t)strtoul(p + 1, NULL, 10);
                    if (frame_need > sizeof(frame))
                    {
                        frame_need = sizeof(frame);
                    }
                }
                frame_got = 0;
                state = RX_FRAME;
            }
            else if (strstr(line, "+CONNECTED") != NULL)
            {
                s_state = TX_AH_STA_CONNECTED;
            }
            else if (strstr(line, "+DISCONNECT") != NULL)
            {
                s_state = TX_AH_STA_DISABLED;
            }

            line_pos = 0;
            continue;
        }

        if (line_pos < sizeof(line) - 1)
        {
            line[line_pos++] = (char)b;
        }
    }
}

static bool parse_rssi_line(const char *line, int32_t *out)
{
    const char *p = strchr(line, ':');
    if (p == NULL)
    {
        return false;
    }
    p++;
    while (*p == ' ')
    {
        p++;
    }
    *out = (int32_t)strtol(p, NULL, 10);
    return true;
}

static bool refresh_rssi(void)
{
    if (!at_ok("+RSSI=1"))
    {
        return false;
    }

    uint32_t start = xTaskGetTickCount();
    while ((xTaskGetTickCount() - start) < pdMS_TO_TICKS(AT_TIMEOUT_MS))
    {
        size_t len = s_at_len;
        if (len >= sizeof(s_at_buf))
        {
            len = sizeof(s_at_buf) - 1;
        }
        if (len > 0)
        {
            char tmp[513];
            memcpy(tmp, s_at_buf, len);
            tmp[len] = '\0';
            const char *rssi = strstr(tmp, "+RSSI:");
            if (rssi != NULL && parse_rssi_line(rssi, &s_rssi))
            {
                return true;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    return false;
}

static bool refresh_mac(void)
{
    if (!at_ok("+MAC_ADDR=?"))
    {
        return false;
    }

    uint32_t start = xTaskGetTickCount();
    while ((xTaskGetTickCount() - start) < pdMS_TO_TICKS(AT_TIMEOUT_MS))
    {
        size_t len = s_at_len;
        if (len >= sizeof(s_at_buf))
        {
            len = sizeof(s_at_buf) - 1;
        }
        if (len > 0)
        {
            char tmp[513];
            memcpy(tmp, s_at_buf, len);
            tmp[len] = '\0';
            const char *p = strstr(tmp, "+MAC:");
            if (p != NULL)
            {
                unsigned m0, m1, m2, m3, m4, m5;
                if (sscanf(p, "+MAC:%x:%x:%x:%x:%x:%x",
                           &m0, &m1, &m2, &m3, &m4, &m5) == 6)
                {
                    s_mac[0] = (uint8_t)m0;
                    s_mac[1] = (uint8_t)m1;
                    s_mac[2] = (uint8_t)m2;
                    s_mac[3] = (uint8_t)m3;
                    s_mac[4] = (uint8_t)m4;
                    s_mac[5] = (uint8_t)m5;
                    s_have_mac = true;
                    return true;
                }
            }
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    return false;
}

static bool refresh_conn_state(void)
{
    if (!at_ok("+CONN_STATE"))
    {
        return false;
    }

    uint32_t start = xTaskGetTickCount();
    while ((xTaskGetTickCount() - start) < pdMS_TO_TICKS(AT_TIMEOUT_MS))
    {
        size_t len = s_at_len;
        if (len >= sizeof(s_at_buf))
        {
            len = sizeof(s_at_buf) - 1;
        }
        if (len > 0)
        {
            char tmp[513];
            memcpy(tmp, s_at_buf, len);
            tmp[len] = '\0';
            if (strstr(tmp, "+CONNECTED") != NULL)
            {
                s_state = TX_AH_STA_CONNECTED;
                return true;
            }
            if (strstr(tmp, "+DISCONNECT") != NULL)
            {
                s_state = TX_AH_STA_DISABLED;
                return false;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    return false;
}

bool tx_ah_init(void)
{
    s_uart_lock = xSemaphoreCreateMutex();
    if (s_uart_lock == NULL)
    {
        return false;
    }

    uart_config_t cfg = {
        .baud_rate = UART_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_driver_install(UART_PORT, RX_BUF * 2, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(UART_PORT, &cfg));
    ESP_ERROR_CHECK(uart_set_pin(UART_PORT, CONFIG_TX_AH_UART_TX_GPIO,
                                 CONFIG_TX_AH_UART_RX_GPIO,
                                 UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    xTaskCreate(uart_rx_task, "tx_ah_rx", 4096, NULL, 10, NULL);
    vTaskDelay(pdMS_TO_TICKS(500));

    bool ok = true;
    ok = at_ok("+SYSDBG=LMAC,0") && ok;
    {
        char bw_cmd[24];
        snprintf(bw_cmd, sizeof(bw_cmd), "+BSS_BW=%s", CONFIG_TX_AH_BSS_BW_STR);
        ok = at_ok(bw_cmd) && ok;
    }
    ok = at_ok("+MODE=STA") && ok;

    if (!ok)
    {
        ESP_LOGE(TAG, "TX-AH baseline init failed");
        return false;
    }

    s_state = TX_AH_STA_CONNECTING;
    ESP_LOGI(TAG, "TX-AH UART TX=%d RX=%d", CONFIG_TX_AH_UART_TX_GPIO,
             CONFIG_TX_AH_UART_RX_GPIO);
    return true;
}

bool tx_ah_apply_credentials(const char *ssid, const char *psk_hex_or_null)
{
    char cmd[160];

    if (ssid == NULL || ssid[0] == '\0')
    {
        return false;
    }

    snprintf(cmd, sizeof(cmd), "+SSID=%s", ssid);
    if (!at_ok(cmd))
    {
        return false;
    }

    if (psk_hex_or_null != NULL && psk_hex_or_null[0] != '\0')
    {
        if (!at_ok("+KEYMGMT=WPA-PSK"))
        {
            return false;
        }
        snprintf(cmd, sizeof(cmd), "+PSK=%s", psk_hex_or_null);
        if (!at_ok(cmd))
        {
            return false;
        }
    }
    else if (!at_ok("+KEYMGMT=NONE"))
    {
        return false;
    }

    s_state = TX_AH_STA_CONNECTING;
    return true;
}

bool tx_ah_pair_and_connect(uint32_t timeout_ms)
{
    if (xSemaphoreTake(s_uart_lock, pdMS_TO_TICKS(5000)) != pdTRUE)
    {
        return false;
    }

    s_at_len = 0;
    s_at_active = true;
    send_raw("AT+PAIR=1\r\n");
    ESP_LOGI(TAG, "Pairing (up to %lu ms) — put HaLow AP in pairing mode",
             (unsigned long)timeout_ms);

    bool paired = wait_at_token("PAIR SUCCESS", timeout_ms);
    s_at_active = false;
    at_ok_locked("+PAIR=0");
    xSemaphoreGive(s_uart_lock);

    if (!paired)
    {
        ESP_LOGW(TAG, "Pairing timed out");
        s_state = TX_AH_STA_DISABLED;
        return false;
    }

    ESP_LOGI(TAG, "Pairing succeeded");
    s_state = TX_AH_STA_CONNECTING;

    uint32_t start = xTaskGetTickCount();
    while ((xTaskGetTickCount() - start) < pdMS_TO_TICKS(timeout_ms))
    {
        tx_ah_poll();
        if (tx_ah_is_connected())
        {
            return true;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }
    return tx_ah_is_connected();
}

void tx_ah_poll(void)
{
    if (refresh_conn_state() && s_state == TX_AH_STA_CONNECTED)
    {
        refresh_rssi();
    }
}

tx_ah_sta_state_t tx_ah_get_state(void)
{
    return s_state;
}

bool tx_ah_is_connected(void)
{
    return s_state == TX_AH_STA_CONNECTED;
}

bool tx_ah_get_rssi(int32_t *rssi_dbm)
{
    if (!tx_ah_is_connected())
    {
        return false;
    }
    if (rssi_dbm != NULL)
    {
        *rssi_dbm = s_rssi;
    }
    return true;
}

bool tx_ah_get_mac(uint8_t mac[6])
{
    if (!s_have_mac)
    {
        refresh_mac();
    }
    if (!s_have_mac)
    {
        return false;
    }
    memcpy(mac, s_mac, 6);
    return true;
}

void tx_ah_set_frame_handler(tx_ah_frame_cb_t cb)
{
    s_frame_cb = cb;
}

bool tx_ah_send_frame(const uint8_t *frame, size_t len)
{
    if (frame == NULL || len == 0 || len > FRAME_MAX)
    {
        return false;
    }
    if (xSemaphoreTake(s_uart_lock, pdMS_TO_TICKS(5000)) != pdTRUE)
    {
        return false;
    }

    char cmd[32];
    snprintf(cmd, sizeof(cmd), "AT+TXDATA=%u\r\n", (unsigned)len);
    s_at_len = 0;
    s_at_active = true;
    if (!send_raw(cmd) || !wait_at_token("OK", AT_TIMEOUT_MS))
    {
        s_at_active = false;
        xSemaphoreGive(s_uart_lock);
        ESP_LOGW(TAG, "AT+TXDATA rejected");
        return false;
    }
    s_at_active = false;

    int w = uart_write_bytes(UART_PORT, frame, len);
    xSemaphoreGive(s_uart_lock);
    return w == (int)len;
}
