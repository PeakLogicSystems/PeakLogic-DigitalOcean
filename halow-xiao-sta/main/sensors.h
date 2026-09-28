/*
 * Template-driven field sensors for LilyGO T-HaLow ALF nodes.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum
{
    SENS_CH_PULSE = 0,
    SENS_CH_THERMISTOR,
    SENS_CH_CT,
    SENS_CH_LEAK_ROPE,
} sens_channel_type_t;

typedef enum
{
    SENS_VAL_REAL = 0,
    SENS_VAL_BOOL,
    SENS_VAL_INT,
} sens_value_type_t;

#define SENS_TAG_MAX   16
#define SENS_TAG_EXTRA 8   /* _TOT, _MV suffix tags */
#define SENS_MAX_TAGS  32

typedef struct
{
    char tag[SENS_TAG_MAX];
    sens_channel_type_t ch_type;
    sens_value_type_t val_type;
    double value;
} sens_tag_reading_t;

/** Init hardware for template_id (from NVS / setup page). */
void sensors_init(uint8_t template_id);

uint8_t sensors_active_template(void);

/** Number of Parc tags published for the active template. */
int sensors_tag_count(void);

/** Copy tag metadata + latest value (index 0 .. count-1). */
bool sensors_get_tag(int index, sens_tag_reading_t *out);

/** Clear latched leak alarms (all channels). */
void sensors_leak_reset(void);

/** Handle LEAK*_RST or LEAK_RST write_outputs commands. */
bool sensors_leak_reset_tag(const char *tag);
