/*
 * Persistent device configuration (NVS), Opta-style fields for PeakLogic Parc.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#define DEVCFG_NS           "thalow"
#define DEVCFG_MQTT_HOST_MAX 64
#define DEVCFG_ID_MAX        32
#define DEVCFG_NAME_MAX      64
#define DEVCFG_WIFI_SSID_MAX 32
#define DEVCFG_WIFI_PASS_MAX 64
#define DEVCFG_IP_MAX        16

typedef struct
{
    char mqtt_broker_host[DEVCFG_MQTT_HOST_MAX];
    uint16_t mqtt_broker_port;
    bool mqtt_broker_set;

    char device_id[DEVCFG_ID_MAX];
    char device_name[DEVCFG_NAME_MAX];
    int global_site_key;

    char halow_ip[DEVCFG_IP_MAX];
    char halow_gw[DEVCFG_IP_MAX];
    char halow_mask[DEVCFG_IP_MAX];

    bool wifi_ap_enable;
    char wifi_ap_ssid[DEVCFG_WIFI_SSID_MAX];
    char wifi_ap_pass[DEVCFG_WIFI_PASS_MAX];

    uint8_t sensor_template;   /* SENS_TPL_ID_* */
} device_cfg_t;

/** Load from NVS; missing keys filled from Kconfig defaults. */
void device_cfg_load(device_cfg_t *out);

/** Save to NVS. */
bool device_cfg_save(const device_cfg_t *cfg);

/** Build mqtt://host:port URI into buf. */
void device_cfg_mqtt_uri(const device_cfg_t *cfg, char *buf, size_t buf_len);
