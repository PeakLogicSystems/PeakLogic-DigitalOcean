#pragma once

#include <Arduino.h>

/** True when STM32 RTC reads a plausible wall-clock (year >= 2020). */
bool mvRtcHasWallClock();

/** Set RTC from Unix epoch seconds (UTC). No-op when RTC unavailable. */
void mvRtcSetUnix(uint32_t epochUtc);

/** Sync RTC from PeakLogic header X-MV-Client-Time (Unix seconds). */
void mvRtcSyncFromHeader(const char* unixSeconds);

/** Write "YYYY-MM-DD HH:MM:SS" into buf (NUL-terminated). Returns false if RTC invalid. */
bool mvRtcFormatDateTime(char* buf, size_t len);

/** ISO-like time for /api/status, or empty when RTC not set. */
const char* mvRtcStatusString();

/** Log once at boot if RTC has no valid wall clock yet. */
void mvRtcWarnIfUnset();
