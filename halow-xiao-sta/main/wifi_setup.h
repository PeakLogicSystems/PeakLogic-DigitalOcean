/*
 * Wi-Fi soft-AP for local setup (Opta-style). MQTT does not use this interface.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include "device_cfg.h"

bool wifi_setup_start_ap(const device_cfg_t *cfg);
bool wifi_setup_ap_active(void);
