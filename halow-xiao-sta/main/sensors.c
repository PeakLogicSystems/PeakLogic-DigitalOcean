/*
 * Template-driven field sensors — see sensors.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "sensors.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#include "driver/gpio.h"
#include "driver/pulse_cnt.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "esp_timer.h"

#include "sensor_templates.h"

static const char *TAG = "sensors";

#ifndef CONFIG_SENS_THERM_BETA
#define CONFIG_SENS_THERM_BETA 3950
#endif
#ifndef CONFIG_SENS_THERM_R0_OHM
#define CONFIG_SENS_THERM_R0_OHM 10000
#endif
#ifndef CONFIG_SENS_THERM_RS_OHM
#define CONFIG_SENS_THERM_RS_OHM 10000
#endif
#ifndef CONFIG_SENS_CT_AMPS_PER_VOLT_X1000
#define CONFIG_SENS_CT_AMPS_PER_VOLT_X1000 30000
#endif
#ifndef CONFIG_SENS_CT_SAMPLES
#define CONFIG_SENS_CT_SAMPLES 1200
#endif
#ifndef CONFIG_SENS_TASK_PERIOD_MS
#define CONFIG_SENS_TASK_PERIOD_MS 1000
#endif
#ifndef CONFIG_SENS_FLOW_GLITCH_NS
#define CONFIG_SENS_FLOW_GLITCH_NS 2000
#endif
#ifndef CONFIG_SENS_LEAK_LATCH
#define CONFIG_SENS_LEAK_LATCH 1
#endif
#ifndef CONFIG_SENS_LEAK_FILTER_ALPHA_X1000
#define CONFIG_SENS_LEAK_FILTER_ALPHA_X1000 100
#endif

#define SENS_MAX_HW_CH   16

typedef struct
{
    adc_channel_t chan;
    adc_cali_handle_t cali;
    bool ok;
    bool ready;
} adc_input_t;

typedef struct
{
    const sens_template_channel_t *def;
    adc_input_t adc;
    bool leak_latched;
    float leak_filtered_mv;
    pcnt_unit_handle_t pcnt;
    pcnt_channel_handle_t pcnt_ch;
    double pulse_total;
    int64_t pulse_last_us;
} hw_channel_t;

static uint8_t s_template_id;
static const sens_template_def_t *s_tpl;
static hw_channel_t s_hw[SENS_MAX_HW_CH];
static int s_hw_count;

static sens_tag_reading_t s_tags[SENS_MAX_TAGS];
static int s_tag_count;
static SemaphoreHandle_t s_lock;

static bool adc_input_setup(adc_oneshot_unit_handle_t adc, adc_input_t *in, int gpio)
{
    adc_unit_t unit;
    adc_channel_t chan;
    in->ok = false;
    in->ready = false;
    if (adc_oneshot_io_to_channel(gpio, &unit, &chan) != ESP_OK || unit != ADC_UNIT_1)
    {
        ESP_LOGE(TAG, "GPIO%d is not ADC1", gpio);
        return false;
    }
    in->chan = chan;

    adc_oneshot_chan_cfg_t cfg = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    if (adc_oneshot_config_channel(adc, chan, &cfg) != ESP_OK)
    {
        return false;
    }
    in->ok = true;

    adc_cali_curve_fitting_config_t cali_cfg = {
        .unit_id = ADC_UNIT_1,
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    in->ready = (adc_cali_create_scheme_curve_fitting(&cali_cfg, &in->cali) == ESP_OK);
    return true;
}

static int adc_read_mv(adc_oneshot_unit_handle_t adc, adc_input_t *in)
{
    int raw = 0;
    if (!in->ok || adc_oneshot_read(adc, in->chan, &raw) != ESP_OK)
    {
        return 0;
    }
    int mv = raw;
    if (in->ready)
    {
        adc_cali_raw_to_voltage(in->cali, raw, &mv);
    }
    return mv;
}

static double thermistor_celsius(int mv)
{
    if (mv <= 0 || mv >= 3300)
    {
        return 0.0;
    }
    const double v = (double)mv / 1000.0;
    const double rs = (double)CONFIG_SENS_THERM_RS_OHM;
    const double r0 = (double)CONFIG_SENS_THERM_R0_OHM;
    const double beta = (double)CONFIG_SENS_THERM_BETA;
    double r_ntc = rs * v / (3.3 - v);
    if (r_ntc <= 0.0)
    {
        return 0.0;
    }
    double inv_t = (1.0 / 298.15) + (1.0 / beta) * log(r_ntc / r0);
    return (1.0 / inv_t) - 273.15;
}

static double ct_read_amps(adc_oneshot_unit_handle_t adc, adc_input_t *in)
{
    const int n = CONFIG_SENS_CT_SAMPLES;
    double sum = 0.0;
    double sumsq = 0.0;
    for (int i = 0; i < n; i++)
    {
        double mv = (double)adc_read_mv(adc, in);
        sum += mv;
        sumsq += mv * mv;
    }
    double mean = sum / (double)n;
    double var = (sumsq / (double)n) - (mean * mean);
    double rms_v = (var > 0.0 ? sqrt(var) : 0.0) / 1000.0;
    return rms_v * ((double)CONFIG_SENS_CT_AMPS_PER_VOLT_X1000 / 1000.0);
}

static bool leak_wet_from_mv(const sens_template_channel_t *def, int mv)
{
    if (def->leak_active_low)
    {
        return mv < def->leak_thresh_mv;
    }
    return mv > def->leak_thresh_mv;
}

static int leak_filter_mv(hw_channel_t *ch, int mv_raw)
{
#if CONFIG_SENS_LEAK_FILTER_ALPHA_X1000 > 0
    const float alpha = (float)CONFIG_SENS_LEAK_FILTER_ALPHA_X1000 / 1000.0f;
    if (ch->leak_filtered_mv < 0.0f)
    {
        ch->leak_filtered_mv = (float)mv_raw;
    }
    else
    {
        ch->leak_filtered_mv = (alpha * (float)mv_raw)
                             + ((1.0f - alpha) * ch->leak_filtered_mv);
    }
    return (int)(ch->leak_filtered_mv + 0.5f);
#else
    (void)ch;
    return mv_raw;
#endif
}

static void pulse_init(hw_channel_t *ch)
{
    pcnt_unit_config_t uc = {
        .high_limit = 30000,
        .low_limit = -1,
    };
    ESP_ERROR_CHECK(pcnt_new_unit(&uc, &ch->pcnt));

#if CONFIG_SENS_FLOW_GLITCH_NS > 0
    pcnt_glitch_filter_config_t gf = { .max_glitch_ns = CONFIG_SENS_FLOW_GLITCH_NS };
    ESP_ERROR_CHECK(pcnt_unit_set_glitch_filter(ch->pcnt, &gf));
#endif

    pcnt_chan_config_t cc = {
        .edge_gpio_num = ch->def->gpio,
        .level_gpio_num = -1,
    };
    ESP_ERROR_CHECK(pcnt_new_channel(ch->pcnt, &cc, &ch->pcnt_ch));
    ESP_ERROR_CHECK(pcnt_channel_set_edge_action(
        ch->pcnt_ch, PCNT_CHANNEL_EDGE_ACTION_INCREASE, PCNT_CHANNEL_EDGE_ACTION_HOLD));
    gpio_set_pull_mode(ch->def->gpio, GPIO_PULLUP_ONLY);
    ESP_ERROR_CHECK(pcnt_unit_enable(ch->pcnt));
    ESP_ERROR_CHECK(pcnt_unit_clear_count(ch->pcnt));
    ESP_ERROR_CHECK(pcnt_unit_start(ch->pcnt));
    ch->pulse_last_us = esp_timer_get_time();
}

static double pulse_sample(hw_channel_t *ch, double *total_out)
{
    int count = 0;
    pcnt_unit_get_count(ch->pcnt, &count);
    pcnt_unit_clear_count(ch->pcnt);

    int64_t now = esp_timer_get_time();
    double dt_s = (double)(now - ch->pulse_last_us) / 1e6;
    ch->pulse_last_us = now;
    if (dt_s <= 0.0)
    {
        dt_s = 1e-3;
    }

    const double k = (double)(ch->def->pulse_k > 0 ? ch->def->pulse_k : 450);
    double units = (count < 0 ? 0 : count) / k;
    ch->pulse_total += units;
    *total_out = ch->pulse_total;
    return units / (dt_s / 60.0);
}

static sens_value_type_t parc_type_for(sens_channel_type_t t)
{
    switch (t)
    {
        case SENS_CH_LEAK_ROPE:
            return SENS_VAL_BOOL;
        default:
            return SENS_VAL_REAL;
    }
}

static void rebuild_tag_table(void)
{
    s_tag_count = 0;
    for (int i = 0; i < s_hw_count && s_tag_count < SENS_MAX_TAGS; i++)
    {
        const char *base = s_hw[i].def->tag;
        sens_tag_reading_t *tr = &s_tags[s_tag_count++];
        strncpy(tr->tag, base, sizeof(tr->tag) - 1);
        tr->ch_type = s_hw[i].def->type;
        tr->val_type = parc_type_for(s_hw[i].def->type);
        tr->value = 0.0;

        if (s_hw[i].def->type == SENS_CH_PULSE && s_tag_count < SENS_MAX_TAGS)
        {
            sens_tag_reading_t *tot = &s_tags[s_tag_count++];
            snprintf(tot->tag, sizeof(tot->tag), "%s_TOT", base);
            tot->ch_type = SENS_CH_PULSE;
            tot->val_type = SENS_VAL_REAL;
            tot->value = 0.0;
        }
        if (s_hw[i].def->type == SENS_CH_LEAK_ROPE && s_tag_count < SENS_MAX_TAGS)
        {
            sens_tag_reading_t *mv = &s_tags[s_tag_count++];
            snprintf(mv->tag, sizeof(mv->tag), "%s_MV", base);
            mv->ch_type = SENS_CH_LEAK_ROPE;
            mv->val_type = SENS_VAL_INT;
            mv->value = 0.0;
        }
    }
}

static void set_tag_value_locked(const char *tag, double value)
{
    for (int i = 0; i < s_tag_count; i++)
    {
        if (strcmp(s_tags[i].tag, tag) == 0)
        {
            s_tags[i].value = value;
            return;
        }
    }
}

static void sensors_task(void *arg)
{
    adc_oneshot_unit_handle_t adc = (adc_oneshot_unit_handle_t)arg;

    for (;;)
    {
        xSemaphoreTake(s_lock, portMAX_DELAY);

        for (int i = 0; i < s_hw_count; i++)
        {
            hw_channel_t *ch = &s_hw[i];
            const sens_template_channel_t *def = ch->def;

            switch (def->type)
            {
                case SENS_CH_PULSE:
                {
                    double total = 0.0;
                    double rate = pulse_sample(ch, &total);
                    set_tag_value_locked(def->tag, rate);
                    char tot_tag[SENS_TAG_MAX];
                    snprintf(tot_tag, sizeof(tot_tag), "%s_TOT", def->tag);
                    set_tag_value_locked(tot_tag, total);
                    break;
                }
                case SENS_CH_THERMISTOR:
                {
                    int mv = adc_read_mv(adc, &ch->adc);
                    set_tag_value_locked(def->tag, thermistor_celsius(mv));
                    break;
                }
                case SENS_CH_CT:
                    set_tag_value_locked(def->tag, ct_read_amps(adc, &ch->adc));
                    break;
                case SENS_CH_LEAK_ROPE:
                {
                    int mv = leak_filter_mv(ch, adc_read_mv(adc, &ch->adc));
                    bool wet = leak_wet_from_mv(def, mv);
#if CONFIG_SENS_LEAK_LATCH
                    if (wet)
                    {
                        ch->leak_latched = true;
                    }
                    set_tag_value_locked(def->tag, ch->leak_latched ? 1.0 : 0.0);
#else
                    set_tag_value_locked(def->tag, wet ? 1.0 : 0.0);
#endif
                    char mv_tag[SENS_TAG_MAX];
                    snprintf(mv_tag, sizeof(mv_tag), "%s_MV", def->tag);
                    set_tag_value_locked(mv_tag, (double)mv);
                    break;
                }
                default:
                    break;
            }
        }

        xSemaphoreGive(s_lock);
        vTaskDelay(pdMS_TO_TICKS(CONFIG_SENS_TASK_PERIOD_MS));
    }
}

void sensors_init(uint8_t template_id)
{
    if (s_lock != NULL)
    {
        return;
    }
    s_lock = xSemaphoreCreateMutex();

    if (template_id == SENS_TPL_ID_CUSTOM || template_id == 0)
    {
        template_id = SENS_TPL_ID_MECH;
    }
    s_template_id = template_id;
    s_tpl = sens_template_get(template_id);
    if (s_tpl == NULL)
    {
        ESP_LOGE(TAG, "Unknown template %u, using mechanical room", template_id);
        s_template_id = SENS_TPL_ID_MECH;
        s_tpl = sens_template_get(SENS_TPL_ID_MECH);
    }

    char err[64];
    if (!sens_template_validate(s_template_id, err, sizeof(err)))
    {
        ESP_LOGE(TAG, "Template invalid: %s", err);
    }

    s_hw_count = (int)s_tpl->channel_count;
    if (s_hw_count > SENS_MAX_HW_CH)
    {
        s_hw_count = SENS_MAX_HW_CH;
    }

    adc_oneshot_unit_handle_t adc;
    adc_oneshot_unit_init_cfg_t unit_cfg = { .unit_id = ADC_UNIT_1 };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&unit_cfg, &adc));

    for (int i = 0; i < s_hw_count; i++)
    {
        s_hw[i].def = &s_tpl->channels[i];
        s_hw[i].leak_latched = false;
        s_hw[i].leak_filtered_mv = -1.0f;
        s_hw[i].pulse_total = 0.0;

        switch (s_hw[i].def->type)
        {
            case SENS_CH_PULSE:
                pulse_init(&s_hw[i]);
                ESP_LOGI(TAG, "%s pulse GPIO%d K=%u", s_hw[i].def->tag,
                         s_hw[i].def->gpio, s_hw[i].def->pulse_k);
                break;
            case SENS_CH_THERMISTOR:
            case SENS_CH_CT:
            case SENS_CH_LEAK_ROPE:
                adc_input_setup(adc, &s_hw[i].adc, s_hw[i].def->gpio);
                ESP_LOGI(TAG, "%s analog GPIO%d", s_hw[i].def->tag, s_hw[i].def->gpio);
                break;
            default:
                break;
        }
    }

    rebuild_tag_table();
    ESP_LOGI(TAG, "Template '%s' (%u): %d hw channels, %d Parc tags",
             s_tpl->name, s_template_id, s_hw_count, s_tag_count);

    xTaskCreate(sensors_task, "sensors", 6144, adc, 5, NULL);
}

uint8_t sensors_active_template(void)
{
    return s_template_id;
}

int sensors_tag_count(void)
{
    return s_tag_count;
}

bool sensors_get_tag(int index, sens_tag_reading_t *out)
{
    if (out == NULL || index < 0 || index >= s_tag_count)
    {
        return false;
    }
    xSemaphoreTake(s_lock, portMAX_DELAY);
    *out = s_tags[index];
    xSemaphoreGive(s_lock);
    return true;
}

void sensors_leak_reset(void)
{
    xSemaphoreTake(s_lock, portMAX_DELAY);
    for (int i = 0; i < s_hw_count; i++)
    {
        if (s_hw[i].def->type == SENS_CH_LEAK_ROPE)
        {
            s_hw[i].leak_latched = false;
            set_tag_value_locked(s_hw[i].def->tag, 0.0);
        }
    }
    xSemaphoreGive(s_lock);
}

bool sensors_leak_reset_tag(const char *tag)
{
    if (tag == NULL)
    {
        return false;
    }
    if (strcmp(tag, "LEAK_RST") == 0)
    {
        sensors_leak_reset();
        return true;
    }
    if (strlen(tag) > 4 && strcmp(tag + strlen(tag) - 4, "_RST") == 0)
    {
        char base[SENS_TAG_MAX];
        strncpy(base, tag, sizeof(base) - 1);
        base[strlen(base) - 4] = '\0';
        xSemaphoreTake(s_lock, portMAX_DELAY);
        for (int i = 0; i < s_hw_count; i++)
        {
            if (s_hw[i].def->type == SENS_CH_LEAK_ROPE
                && strcmp(s_hw[i].def->tag, base) == 0)
            {
                s_hw[i].leak_latched = false;
                set_tag_value_locked(base, 0.0);
                xSemaphoreGive(s_lock);
                return true;
            }
        }
        xSemaphoreGive(s_lock);
    }
    return false;
}
