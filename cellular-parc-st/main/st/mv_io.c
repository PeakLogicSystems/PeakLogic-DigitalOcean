/*
 * Soft I/O + Sequent SM-I-010 (I1..I4 / R1..R4) + optional CT ADC (I1_RAW..I7_RAW).
 * SPDX-License-Identifier: Apache-2.0
 */
#include "mv_io.h"

#include <string.h>

#include "esp_log.h"
#include "sdkconfig.h"
#if CONFIG_GPIO_RELAY_ENABLE
#include "driver/gpio.h"
#endif

#if CONFIG_SM_I010_ENABLE
#include "sm_i010.h"
#endif

#if CONFIG_CT_ADC_ENABLE
#include "esp_adc/adc_oneshot.h"
#endif

#if CONFIG_GPIO_RELAY_ENABLE
static bool s_gpio_relay_ready;
#endif

static const char *TAG = "mv_io";

static bool s_din[8];
static int s_ain[8];
static bool s_relay[4];
static bool s_sm_ok;

#if CONFIG_CT_ADC_ENABLE
static adc_oneshot_unit_handle_t s_adc;
static adc_channel_t s_adc_chan[8];
static adc_unit_t s_adc_unit[8];
static bool s_adc_ok[8];
static bool s_adc_inited;

static const int s_ct_gpios[7] = {
    CONFIG_CT_ADC_GPIO_AI1,
    CONFIG_CT_ADC_GPIO_AI2,
    CONFIG_CT_ADC_GPIO_AI3,
    CONFIG_CT_ADC_GPIO_AI4,
    CONFIG_CT_ADC_GPIO_AI5,
    CONFIG_CT_ADC_GPIO_AI6,
    CONFIG_CT_ADC_GPIO_AI7,
};

static void ct_adc_init(void)
{
    memset(s_adc_ok, 0, sizeof(s_adc_ok));
    s_adc_inited = false;

    adc_oneshot_unit_init_cfg_t init_cfg = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    esp_err_t err = adc_oneshot_new_unit(&init_cfg, &s_adc);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "CT ADC unit init failed: %s", esp_err_to_name(err));
        return;
    }
    s_adc_inited = true;

    adc_oneshot_chan_cfg_t chan_cfg = {
        .bitwidth = ADC_BITWIDTH_12,
        /* ~0–1.1 V full-scale — matches 0–1 V CT transmitters */
        .atten = ADC_ATTEN_DB_0,
    };

    for (int i = 0; i < 7; i++) {
        int gpio = s_ct_gpios[i];
        if (gpio < 0) {
            continue;
        }
        adc_unit_t unit = ADC_UNIT_1;
        adc_channel_t chan = 0;
        err = adc_oneshot_io_to_channel(gpio, &unit, &chan);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "CT AI%u GPIO%d not ADC-capable on this SoC (%s) — soft I*_RAW",
                     i + 1, gpio, esp_err_to_name(err));
            continue;
        }
        if (unit != ADC_UNIT_1) {
            ESP_LOGW(TAG, "CT AI%u GPIO%d maps to ADC2 — skipped (Wi-Fi conflict)", i + 1, gpio);
            continue;
        }
        err = adc_oneshot_config_channel(s_adc, chan, &chan_cfg);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "CT AI%u GPIO%d config failed: %s", i + 1, gpio, esp_err_to_name(err));
            continue;
        }
        s_adc_unit[i] = unit;
        s_adc_chan[i] = chan;
        s_adc_ok[i] = true;
        ESP_LOGI(TAG, "CT AI%u ← GPIO%d (ADC1 ch %d)", i + 1, gpio, (int)chan);
    }
}
#endif /* CONFIG_CT_ADC_ENABLE */

void mvIoBegin(void)
{
    memset(s_din, 0, sizeof(s_din));
    memset(s_ain, 0, sizeof(s_ain));
    memset(s_relay, 0, sizeof(s_relay));
    s_ain[0] = 0;
    s_sm_ok = false;

#if CONFIG_SM_I010_ENABLE
    s_sm_ok = sm_i010_init(CONFIG_SM_I010_I2C_PORT, CONFIG_SM_I010_SDA_GPIO, CONFIG_SM_I010_SCL_GPIO,
                           CONFIG_SM_I010_STACK);
#endif

#if CONFIG_CT_ADC_ENABLE
    ct_adc_init();
#endif

#if CONFIG_GPIO_RELAY_ENABLE
    {
        gpio_config_t rel = {
            .pin_bit_mask = 1ULL << CONFIG_GPIO_RELAY_PIN,
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };
        s_gpio_relay_ready = gpio_config(&rel) == ESP_OK;
        if (s_gpio_relay_ready) {
            gpio_set_level(CONFIG_GPIO_RELAY_PIN, 0);
            ESP_LOGI(TAG, "GPIO relay R1 ← GPIO%d", CONFIG_GPIO_RELAY_PIN);
        }
#if CONFIG_GPIO_DI1_PIN >= 0
        gpio_config_t din = {
            .pin_bit_mask = 1ULL << CONFIG_GPIO_DI1_PIN,
            .mode = GPIO_MODE_INPUT,
            .pull_up_en = GPIO_PULLUP_ENABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };
        if (gpio_config(&din) == ESP_OK) {
            ESP_LOGI(TAG, "GPIO DI I1 ← GPIO%d (pull-up, active low)", CONFIG_GPIO_DI1_PIN);
        }
#endif
    }
#endif
}

bool mvIoSmI010Present(void)
{
    return s_sm_ok;
}

void mvIoPollHardware(void)
{
#if CONFIG_SM_I010_ENABLE
    if (s_sm_ok) {
        sm_i010_poll();
    }
#endif
}

bool mvReadDigitalIn(uint8_t index)
{
    if (index >= 8) {
        return false;
    }
#if CONFIG_SM_I010_ENABLE
    if (s_sm_ok && index < 4) {
        return sm_i010_read_opto(index);
    }
#endif
#if CONFIG_GPIO_RELAY_ENABLE && CONFIG_GPIO_DI1_PIN >= 0
    if (index == 0) {
        return gpio_get_level(CONFIG_GPIO_DI1_PIN) == 0;
    }
#endif
    return s_din[index];
}

int mvReadAnalogRaw(uint8_t index)
{
    if (index >= 8) {
        return 0;
    }
#if CONFIG_CT_ADC_ENABLE
    if (index < 7 && s_adc_ok[index] && s_adc_inited) {
        int raw = 0;
        if (adc_oneshot_read(s_adc, s_adc_chan[index], &raw) == ESP_OK) {
            s_ain[index] = raw;
            return raw;
        }
    }
#endif
    return s_ain[index];
}

void mvWriteRelay(uint8_t index, bool on)
{
    if (index >= 4) {
        return;
    }
    s_relay[index] = on;
}

void mvIoFlushOutputs(void)
{
#if CONFIG_SM_I010_ENABLE
    if (s_sm_ok) {
        uint8_t mask = 0;
        for (uint8_t i = 0; i < 4; i++) {
            if (s_relay[i]) {
                mask |= (uint8_t)(1u << i);
            }
        }
        sm_i010_write_relays_all(mask);
    }
#endif
#if CONFIG_GPIO_RELAY_ENABLE
    if (s_gpio_relay_ready) {
        gpio_set_level(CONFIG_GPIO_RELAY_PIN, s_relay[0] ? 1 : 0);
    }
#endif
}

void mvIoFailsafeOff(void)
{
    memset(s_relay, 0, sizeof(s_relay));
    mvIoFlushOutputs();
}

void mvForceDigitalIn(uint8_t index, bool on)
{
    if (index < 8) {
        s_din[index] = on;
    }
}

void mvForceAnalogRaw(uint8_t index, int raw)
{
    if (index < 8) {
        s_ain[index] = raw;
    }
}
