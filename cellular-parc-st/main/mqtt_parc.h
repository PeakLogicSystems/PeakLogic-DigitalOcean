/*
 * MQTT Parc client — ESP32 is the ST device (same protocol as Opta).
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>

#include "device_cfg.h"

bool mqtt_parc_start(const parc_st_cfg_t *cfg);
void mqtt_parc_poll(void);
bool mqtt_parc_connected(void);
void mqtt_parc_publish_telemetry(void);
void mqtt_parc_force_telemetry(void);
