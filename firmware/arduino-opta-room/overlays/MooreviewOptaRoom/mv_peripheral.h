#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

/*
 * WiFi peripheral ingest — Opta as a ROOM INTEGRATION device.
 *
 * The Opta hosts a WiFi setup AP (SSID PeakLogic-Opta, 192.168.4.1). Multiple Shelly
 * Flood Gen4 leak sensors in a room join that AP as stations and PUSH their state to the
 * Opta over HTTP (Shelly "Actions" webhook). The Opta maps each sensor to a slotted set
 * of tags that flow to the central HMI over PARC/MQTT (Ethernet) and are usable in ST.
 *
 * Battery Shellys sleep, so this is push-only (no polling). Per slot n (1..MV_SHELLY_MAX):
 *   SHELLY<n>_FLOOD  (BOOL) — flood / rain alarm active
 *   SHELLY<n>_TEMP_C (REAL) — ambient temperature (°C)
 *   SHELLY<n>_BATT   (INT)  — battery charge (%)
 *   SHELLY<n>_ONLINE (BOOL) — true while a webhook was seen within the staleness window
 *
 * Webhook (per Shelly, GET; `dev` selects the slot, default 1):
 *   http://192.168.4.1:8080/api/peripheral/shelly?dev=1&flood=${flood:0.alarm}&tC=${temperature:0.tC}&batt=${devicepower:0.battery.percent}
 */

#ifndef MV_SHELLY_MAX
#define MV_SHELLY_MAX 8
#endif

#ifndef MV_SHELLY_STALE_MS
#define MV_SHELLY_STALE_MS (2UL * 60UL * 60UL * 1000UL)
#endif

void mvPeripheralBegin();
void mvPeripheralTick();
bool mvPeripheralHandleWebhook(const String& query, String& outMsg);
void mvPeripheralFillStatus(JsonArray out);
uint8_t mvPeripheralActiveCount();
