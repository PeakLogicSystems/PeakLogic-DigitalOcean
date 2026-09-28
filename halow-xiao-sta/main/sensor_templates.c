/*
 * ALF sensor template definitions — see sensor_templates.h.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include "sensor_templates.h"

#include <stdio.h>
#include <string.h>

#include "esp_adc/adc_oneshot.h"

#define LEAK_AL  true
#define LEAK_MV  1500
#define FLOW_K   450

/* Template #1 — Mechanical room */
static const sens_template_channel_t s_mech[] = {
    { "FLOW_IN",   SENS_CH_PULSE,      46, FLOW_K, 0, 0 },
    { "FLOW_GAS",  SENS_CH_PULSE,      47, FLOW_K, 0, 0 },
    { "TEMP_WH1",  SENS_CH_THERMISTOR,  1, 0, 0, 0 },
    { "TEMP_WH2",  SENS_CH_THERMISTOR,  2, 0, 0, 0 },
    { "TEMP_WH3",  SENS_CH_THERMISTOR,  8, 0, 0, 0 },
    { "CT_WH1",    SENS_CH_CT,          3, 0, 0, 0 },
    { "CT_WH2",    SENS_CH_CT,          6, 0, 0, 0 },
    { "CT_WH3",    SENS_CH_CT,          9, 0, 0, 0 },
    { "LEAK",      SENS_CH_LEAK_ROPE,   7, 0, LEAK_AL, LEAK_MV },
};

/* Template #2 — Client room */
static const sens_template_channel_t s_room[] = {
    { "TEMP_LR",    SENS_CH_THERMISTOR, 1, 0, 0, 0 },
    { "TEMP_BR",    SENS_CH_THERMISTOR, 2, 0, 0, 0 },
    { "TEMP3",      SENS_CH_THERMISTOR, 8, 0, 0, 0 },
    { "CT_AC1",     SENS_CH_CT,         3, 0, 0, 0 },
    { "CT_AC2",     SENS_CH_CT,         6, 0, 0, 0 },
    { "CT_STOVE",   SENS_CH_CT,         9, 0, 0, 0 },
    { "LEAK_PAN",   SENS_CH_LEAK_ROPE,  7, 0, LEAK_AL, LEAK_MV },
};

/* Template #3 — Client bathroom */
static const sens_template_channel_t s_bath[] = {
    { "FLOW_TOILET", SENS_CH_PULSE,     46, FLOW_K, 0, 0 },
    { "LEAK_TUB",    SENS_CH_LEAK_ROPE,  7, 0, LEAK_AL, LEAK_MV },
};

/* Template #4 — Rooftop A/C */
static const sens_template_channel_t s_roof[] = {
    { "TEMP_HI",   SENS_CH_THERMISTOR, 1, 0, 0, 0 },
    { "TEMP_LO",   SENS_CH_THERMISTOR, 2, 0, 0, 0 },
    { "CT_COMP",   SENS_CH_CT,         3, 0, 0, 0 },
    { "CT_FAN",    SENS_CH_CT,         6, 0, 0, 0 },
    { "LEAK_PAN",  SENS_CH_LEAK_ROPE,  7, 0, LEAK_AL, LEAK_MV },
};

/* Template #5 — Kitchen (refer / freezer) */
static const sens_template_channel_t s_kitchen[] = {
    { "FLOW_IN",   SENS_CH_PULSE,      46, FLOW_K, 0, 0 },
    { "TEMP_REF",  SENS_CH_THERMISTOR,  1, 0, 0, 0 },
    { "TEMP_FRZ",  SENS_CH_THERMISTOR,  2, 0, 0, 0 },
};

/* Template #6 — Kitchen six sinks (leak + flow per sink) */
static const sens_template_channel_t s_sinks6[] = {
    { "LEAK1",  SENS_CH_LEAK_ROPE, 1,  0, LEAK_AL, LEAK_MV },
    { "FLOW1",  SENS_CH_PULSE,     46, FLOW_K, 0, 0 },
    { "LEAK2",  SENS_CH_LEAK_ROPE, 2,  0, LEAK_AL, LEAK_MV },
    { "FLOW2",  SENS_CH_PULSE,     47, FLOW_K, 0, 0 },
    { "LEAK3",  SENS_CH_LEAK_ROPE, 3,  0, LEAK_AL, LEAK_MV },
    { "FLOW3",  SENS_CH_PULSE,     48, FLOW_K, 0, 0 },
    { "LEAK4",  SENS_CH_LEAK_ROPE, 6,  0, LEAK_AL, LEAK_MV },
    { "FLOW4",  SENS_CH_PULSE,     14, FLOW_K, 0, 0 },
    { "LEAK5",  SENS_CH_LEAK_ROPE, 7,  0, LEAK_AL, LEAK_MV },
    { "FLOW5",  SENS_CH_PULSE,     15, FLOW_K, 0, 0 },
    { "LEAK6",  SENS_CH_LEAK_ROPE, 8,  0, LEAK_AL, LEAK_MV },
    { "FLOW6",  SENS_CH_PULSE,     16, FLOW_K, 0, 0 },
};

static const sens_template_def_t s_templates[] = {
    {
        SENS_TPL_ID_MECH,
        "ALF #1 Mechanical room",
        "Incoming water + gas pulse, 3x WH thermistor/CT, rope leak",
        s_mech,
        sizeof(s_mech) / sizeof(s_mech[0]),
    },
    {
        SENS_TPL_ID_ROOM,
        "ALF #2 Client room",
        "LR/BR temps, 2x AC blower CT + stove CT, AC pan leak rope",
        s_room,
        sizeof(s_room) / sizeof(s_room[0]),
    },
    {
        SENS_TPL_ID_BATH,
        "ALF #3 Client bathroom",
        "Toilet flow pulse, tub/shower leak rope",
        s_bath,
        sizeof(s_bath) / sizeof(s_bath[0]),
    },
    {
        SENS_TPL_ID_ROOF_AC,
        "ALF #4 Rooftop A/C",
        "High/low side temps, compressor + fan CT, pan leak rope",
        s_roof,
        sizeof(s_roof) / sizeof(s_roof[0]),
    },
    {
        SENS_TPL_ID_KITCHEN,
        "ALF #5 Kitchen",
        "Incoming water pulse, refer + freezer thermistors",
        s_kitchen,
        sizeof(s_kitchen) / sizeof(s_kitchen[0]),
    },
    {
        SENS_TPL_ID_SINKS6,
        "ALF #6 Kitchen six sinks",
        "Six sink leak ropes + six sink flow pulses",
        s_sinks6,
        sizeof(s_sinks6) / sizeof(s_sinks6[0]),
    },
};

static bool gpio_is_adc1(int gpio)
{
    adc_unit_t unit;
    adc_channel_t chan;
    return adc_oneshot_io_to_channel(gpio, &unit, &chan) == ESP_OK
           && unit == ADC_UNIT_1;
}

const sens_template_def_t *sens_template_get(uint8_t id)
{
    if (id == SENS_TPL_ID_CUSTOM || id > SENS_TPL_ID_MAX)
    {
        return NULL;
    }
    for (size_t i = 0; i < sizeof(s_templates) / sizeof(s_templates[0]); i++)
    {
        if (s_templates[i].id == id)
        {
            return &s_templates[i];
        }
    }
    return NULL;
}

const char *sens_template_name(uint8_t id)
{
    const sens_template_def_t *t = sens_template_get(id);
    return (t != NULL) ? t->name : "Unknown";
}

size_t sens_template_count(void)
{
    return sizeof(s_templates) / sizeof(s_templates[0]);
}

bool sens_template_validate(uint8_t id, char *err, size_t err_len)
{
    const sens_template_def_t *t = sens_template_get(id);
    if (t == NULL)
    {
        snprintf(err, err_len, "invalid template id %u", id);
        return false;
    }

    for (size_t i = 0; i < t->channel_count; i++)
    {
        const sens_template_channel_t *c = &t->channels[i];
        if (c->gpio == 4 || c->gpio == 5)
        {
            snprintf(err, err_len, "%s uses reserved HaLow UART GPIO%d", c->tag, c->gpio);
            return false;
        }
        if (c->type != SENS_CH_PULSE && !gpio_is_adc1(c->gpio))
        {
            snprintf(err, err_len, "%s GPIO%d is not ADC1", c->tag, c->gpio);
            return false;
        }
        for (size_t j = i + 1; j < t->channel_count; j++)
        {
            if (t->channels[j].gpio == c->gpio)
            {
                snprintf(err, err_len, "GPIO%d shared by %s and %s",
                         c->gpio, c->tag, t->channels[j].tag);
                return false;
            }
        }
    }
    return true;
}
