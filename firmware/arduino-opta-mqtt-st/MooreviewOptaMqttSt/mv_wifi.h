#pragma once

#include <Arduino.h>
#include "mv_config.h"

#include "mv_store.h"

bool mvWifiCapable();
/** Probe Opta board info / WiFi.status once; safe to call repeatedly. */
bool mvWifiProbe();
bool mvWifiBegin(const MvDeviceConfig* cfg);
bool mvWifiApplyConfig(const MvDeviceConfig* cfg);
void mvWifiStop();
bool mvWifiApActive();
IPAddress mvWifiApIp();
const char* mvWifiLastError();
void mvWifiHandleClients();
/** Retry AP start when enabled but not listening (mbed WiFi can fail on first boot). */
void mvWifiLoop(const MvDeviceConfig* cfg);
