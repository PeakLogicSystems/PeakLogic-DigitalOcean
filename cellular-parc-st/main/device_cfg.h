/*
 * Device NVS config for cellular Parc ST peer.
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#define MV_DEVICE_STANDALONE 0
#define MV_DEVICE_REMOTE_IO 1

typedef struct {
    char device_id[48];
    char device_name[48];
    char mqtt_host[64];
    uint16_t mqtt_port;
    char mqtt_user[48];
    char mqtt_pass[64];
    char topic_prefix[32];
    uint32_t report_ms;
    char modem_apn[32];
    char wifi_ap_ssid[32];
    char wifi_ap_pass[64];
    char wifi_sta_ssid[32];
    char wifi_sta_pass[64];
    bool autorun;
    uint8_t device_mode;     /* MV_DEVICE_STANDALONE | MV_DEVICE_REMOTE_IO */
    uint16_t global_site_key; /* default 1 — matches Opta / PC mqttParc.globalSiteKey */
} parc_st_cfg_t;

void parc_cfg_load(parc_st_cfg_t *cfg);
bool parc_cfg_save(const parc_st_cfg_t *cfg);
void parc_cfg_set_defaults(parc_st_cfg_t *cfg);

const char *mvDeviceModeString(uint8_t mode);
uint8_t mvDeviceModeActive(void);
bool mvDeviceModeRemoteIo(void);
bool mvDeviceModeSet(uint8_t mode);
