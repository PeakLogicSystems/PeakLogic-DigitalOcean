#pragma once

#include <Arduino.h>

/** Read ATECC608 serial and derive PeakLogic Parc deviceId (mv_{16hex FNV-1a64}). */
bool mvIdentityBegin();

const char* mvIdentityDeviceId();
const char* mvIdentityAteccSerial();
bool mvIdentityHasAtecc();
/** Human-readable ATECC status for /api/status and setup UI. */
const char* mvIdentityAteccStatus();
