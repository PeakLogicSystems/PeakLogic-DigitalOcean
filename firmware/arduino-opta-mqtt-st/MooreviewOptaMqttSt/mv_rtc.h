#pragma once

#include <Arduino.h>

/** True when software or STM32 RTC reads a plausible wall-clock (year >= 2020). */
bool mvRtcHasWallClock();

/** Current Unix epoch (UTC) from software clock, or 0 when unset. */
uint32_t mvRtcNowUnix();

/** Set in-RAM wall clock from Unix epoch (UTC) and PC tz offset (minutes, JS getTimezoneOffset). */
void mvRtcSetSoftwareClock(uint32_t epochUtc, int tzOffsetMin);

/** Set RTC wall clock from Unix epoch (UTC) adjusted by PC timezone offset (minutes, JS getTimezoneOffset). */
void mvRtcSetUnixTz(uint32_t epochUtc, int tzOffsetMin);

/** Set RTC from Unix epoch seconds (UTC). No-op when RTC unavailable. */
void mvRtcSetUnix(uint32_t epochUtc);

/** Sync RTC from PeakLogic headers X-MV-Client-Time and optional X-MV-Client-Tz-Offset. */
void mvRtcSyncFromHeader(const char* unixSeconds, const char* tzOffsetMin);

/** Queue RTC sync for main loop (HAL_RTC_SetTime must not run in HTTP/MQTT handlers). */
void mvRtcQueueUnixTz(uint32_t epochUtc, int tzOffsetMin);

/** Apply queued RTC sync when blocked is false (e.g. not during program install or runtime). */
void mvRtcDrainPending(bool blocked);

/** Write "YYYY-MM-DD HH:MM:SS" into buf (NUL-terminated). Returns false if no wall clock. */
bool mvRtcFormatDateTime(char* buf, size_t len);

/** ISO-like time for /api/status, or empty when RTC not set. */
const char* mvRtcStatusString();

/** Log once at boot if RTC has no valid wall clock yet. */
void mvRtcWarnIfUnset();
