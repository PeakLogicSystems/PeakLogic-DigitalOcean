/*
 * Assisted Living Facility sensor templates for LilyGO T-HaLow nodes.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "sensors.h"

#define SENS_TPL_ID_CUSTOM   0
#define SENS_TPL_ID_MECH     1
#define SENS_TPL_ID_ROOM     2
#define SENS_TPL_ID_BATH     3
#define SENS_TPL_ID_ROOF_AC  4
#define SENS_TPL_ID_KITCHEN  5
#define SENS_TPL_ID_SINKS6   6
#define SENS_TPL_ID_MAX      6

typedef struct
{
    const char *tag;
    sens_channel_type_t type;
    int gpio;
    uint16_t pulse_k;          /* pulses per unit (pulse channels only) */
    bool leak_active_low;
    int leak_thresh_mv;
} sens_template_channel_t;

typedef struct
{
    uint8_t id;
    const char *name;
    const char *description;
    const sens_template_channel_t *channels;
    size_t channel_count;
} sens_template_def_t;

const sens_template_def_t *sens_template_get(uint8_t id);
const char *sens_template_name(uint8_t id);
size_t sens_template_count(void);
bool sens_template_validate(uint8_t id, char *err, size_t err_len);
