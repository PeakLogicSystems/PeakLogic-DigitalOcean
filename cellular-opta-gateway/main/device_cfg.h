/*
 * Persistent gateway configuration (NVS).
 *
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#define GWCFG_NS              "mv_gw"
#define GWCFG_HOST_MAX        64
#define GWCFG_USER_MAX        32
#define GWCFG_PASS_MAX        64
#define GWCFG_APN_MAX         48
#define GWCFG_ID_MAX          32
#define GWCFG_WIFI_SSID_MAX   32
#define GWCFG_WIFI_PASS_MAX   64
#define GWCFG_IP_MAX          16

typedef struct
{
    /* Cloud uplink (PeakLogic droplet Mosquitto) */
    char cloud_mqtt_host[GWCFG_HOST_MAX];
    uint16_t cloud_mqtt_port;
    char cloud_mqtt_user[GWCFG_USER_MAX];
    char cloud_mqtt_pass[GWCFG_PASS_MAX];
    bool cloud_mqtt_set;

    /* Local LAN broker — Opta uses this (fixed 192.168.1.1:1883) */
    char lan_ip[GWCFG_IP_MAX];
    char lan_mask[GWCFG_IP_MAX];
    uint16_t local_mqtt_port;

    /* Cellular */
    char modem_apn[GWCFG_APN_MAX];
    char gateway_id[GWCFG_ID_MAX];

    /* Wi-Fi setup AP (provisioning only) */
    bool wifi_ap_enable;
    char wifi_ap_ssid[GWCFG_WIFI_SSID_MAX];
    char wifi_ap_pass[GWCFG_WIFI_PASS_MAX];
} gateway_cfg_t;

void gateway_cfg_load(gateway_cfg_t *out);
bool gateway_cfg_save(const gateway_cfg_t *cfg);

void gateway_cfg_cloud_uri(const gateway_cfg_t *cfg, char *buf, size_t buf_len);

/** Parc topic prefix forwarded by the bridge. */
#define GW_MQTT_TOPIC_PREFIX "peaklogic/v1"

/** Bridge subscription on cloud side. */
#define GW_MQTT_BRIDGE_SUB "peaklogic/v1/#"
