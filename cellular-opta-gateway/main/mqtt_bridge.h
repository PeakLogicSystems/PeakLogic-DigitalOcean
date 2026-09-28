/*
 * MQTT bridge — local broker (Opta) <-> cloud Mosquitto (PeakLogic droplet).
 *
 * Forwards peaklogic/v1/# transparently in both directions.
 * Cloud side carries username/password; Opta stays anonymous on LAN.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include "device_cfg.h"

bool mqtt_bridge_start(const gateway_cfg_t *cfg);
void mqtt_bridge_stop(void);
void mqtt_bridge_poll(void);
void mqtt_bridge_on_config_saved(const gateway_cfg_t *cfg);
/** (Re)connect cloud MQTT client when WAN becomes available. */
void mqtt_bridge_ensure_cloud(void);

bool mqtt_bridge_cloud_connected(void);
bool mqtt_bridge_local_listening(void);

uint32_t mqtt_bridge_fwd_to_cloud(void);
uint32_t mqtt_bridge_fwd_to_local(void);
