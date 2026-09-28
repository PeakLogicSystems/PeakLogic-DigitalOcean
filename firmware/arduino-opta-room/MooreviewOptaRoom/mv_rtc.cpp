#include "mv_rtc.h"

#include <string.h>

#include <time.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && defined(__has_include)
#if __has_include(<stm32h7xx_hal_rtc.h>)
#define MV_HAS_STM32_RTC 1
#include <stm32h7xx_hal_rtc.h>
extern RTC_HandleTypeDef RTCHandle;
#endif
#endif

static char g_rtcStatus[24];
static bool g_rtcWarned = false;

static uint32_t g_epochUtc = 0;
static uint32_t g_msAnchor = 0;
static int g_tzOffsetMin = 0;
static bool g_swClockValid = false;

static bool g_pendingHal = false;
static uint32_t g_pendingEpochUtc = 0;
static int g_pendingTzOffsetMin = 0;

#if defined(MV_HAS_STM32_RTC)
static bool mvRtcReadHw(int* year, int* month, int* day, int* hour, int* minute, int* second) {
  RTC_TimeTypeDef rt = {};
  RTC_DateTypeDef rd = {};
  if (HAL_RTC_GetTime(&RTCHandle, &rt, RTC_FORMAT_BIN) != HAL_OK) return false;
  if (HAL_RTC_GetDate(&RTCHandle, &rd, RTC_FORMAT_BIN) != HAL_OK) return false;
  *year = 2000 + rd.Year;
  *month = rd.Month;
  *day = rd.Date;
  *hour = rt.Hours;
  *minute = rt.Minutes;
  *second = rt.Seconds;
  return true;
}

static uint8_t tmWdayToRtcWeekday(int tmWday) {
  static const uint8_t map[] = { 7, 1, 2, 3, 4, 5, 6 };
  if (tmWday < 0 || tmWday > 6) return 1;
  return map[tmWday];
}

static void mvRtcApplyHal(uint32_t epochUtc, int tzOffsetMin) {
  if (epochUtc < 1577836800u) return;
  time_t t = (time_t)epochUtc - (time_t)tzOffsetMin * 60;
  struct tm tmUtc;
  if (!gmtime_r(&t, &tmUtc)) return;
  RTC_TimeTypeDef rt = {};
  RTC_DateTypeDef rd = {};
  rt.Hours = (uint8_t)tmUtc.tm_hour;
  rt.Minutes = (uint8_t)tmUtc.tm_min;
  rt.Seconds = (uint8_t)tmUtc.tm_sec;
  rt.DayLightSaving = RTC_DAYLIGHTSAVING_NONE;
  rt.StoreOperation = RTC_STOREOPERATION_RESET;
  rd.Year = (uint8_t)((tmUtc.tm_year + 1900) - 2000);
  rd.Month = (uint8_t)(tmUtc.tm_mon + 1);
  rd.Date = (uint8_t)tmUtc.tm_mday;
  rd.WeekDay = tmWdayToRtcWeekday(tmUtc.tm_wday);
  HAL_RTC_SetTime(&RTCHandle, &rt, RTC_FORMAT_BIN);
  HAL_RTC_SetDate(&RTCHandle, &rd, RTC_FORMAT_BIN);
}
#endif

static bool mvRtcFormatFromUnix(uint32_t epochUtc, int tzOffsetMin, char* buf, size_t len) {
  if (epochUtc < 1577836800u) return false;
  time_t t = (time_t)epochUtc - (time_t)tzOffsetMin * 60;
  struct tm tmLocal;
  if (!gmtime_r(&t, &tmLocal)) return false;
  const int y = tmLocal.tm_year + 1900;
  if (y < 2020 || y > 2100) return false;
  snprintf(buf, len, "%04d-%02d-%02d %02d:%02d:%02d",
           y, tmLocal.tm_mon + 1, tmLocal.tm_mday,
           tmLocal.tm_hour, tmLocal.tm_min, tmLocal.tm_sec);
  return true;
}

static bool mvRtcHwPlausible() {
#if defined(MV_HAS_STM32_RTC)
  int y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0;
  if (!mvRtcReadHw(&y, &mo, &d, &h, &mi, &s)) return false;
  return y >= 2020 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
#else
  return false;
#endif
}

void mvRtcSetSoftwareClock(uint32_t epochUtc, int tzOffsetMin) {
  if (epochUtc < 1577836800u) return;
  g_epochUtc = epochUtc;
  g_msAnchor = millis();
  g_tzOffsetMin = tzOffsetMin;
  g_swClockValid = true;
}

uint32_t mvRtcNowUnix() {
  if (!g_swClockValid) return 0;
  return g_epochUtc + (uint32_t)((millis() - g_msAnchor) / 1000UL);
}

bool mvRtcHasWallClock() {
  if (g_swClockValid && g_epochUtc >= 1577836800u) return true;
  return mvRtcHwPlausible();
}

void mvRtcSetUnixTz(uint32_t epochUtc, int tzOffsetMin) {
  mvRtcSetSoftwareClock(epochUtc, tzOffsetMin);
#if defined(MV_HAS_STM32_RTC)
  mvRtcApplyHal(epochUtc, tzOffsetMin);
#else
  (void)epochUtc;
  (void)tzOffsetMin;
#endif
}

void mvRtcSetUnix(uint32_t epochUtc) {
  mvRtcSetUnixTz(epochUtc, 0);
}

void mvRtcSyncFromHeader(const char* unixSeconds, const char* tzOffsetMin) {
  if (!unixSeconds || !unixSeconds[0]) return;
  const uint32_t epoch = (uint32_t)strtoul(unixSeconds, nullptr, 10);
  const int tz = (tzOffsetMin && tzOffsetMin[0]) ? (int)strtol(tzOffsetMin, nullptr, 10) : 0;
  mvRtcSetSoftwareClock(epoch, tz);
  mvRtcQueueUnixTz(epoch, tz);
}

void mvRtcQueueUnixTz(uint32_t epochUtc, int tzOffsetMin) {
  if (epochUtc < 1577836800u) return;
  g_pendingEpochUtc = epochUtc;
  g_pendingTzOffsetMin = tzOffsetMin;
  g_pendingHal = true;
}

void mvRtcDrainPending(bool blocked) {
  if (blocked || !g_pendingHal) return;
  g_pendingHal = false;
#if defined(MV_HAS_STM32_RTC)
  mvRtcApplyHal(g_pendingEpochUtc, g_pendingTzOffsetMin);
#endif
}

bool mvRtcFormatDateTime(char* buf, size_t len) {
  if (!buf || len < 20) return false;
  if (g_swClockValid) {
    return mvRtcFormatFromUnix(mvRtcNowUnix(), g_tzOffsetMin, buf, len);
  }
#if defined(MV_HAS_STM32_RTC)
  int y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0;
  if (!mvRtcReadHw(&y, &mo, &d, &h, &mi, &s)) return false;
  if (y < 2020) return false;
  snprintf(buf, len, "%04d-%02d-%02d %02d:%02d:%02d", y, mo, d, h, mi, s);
  return true;
#else
  (void)len;
  return false;
#endif
}

const char* mvRtcStatusString() {
  g_rtcStatus[0] = '\0';
  if (mvRtcFormatDateTime(g_rtcStatus, sizeof(g_rtcStatus))) return g_rtcStatus;
  return "";
}

void mvRtcWarnIfUnset() {
  if (g_rtcWarned || mvRtcHasWallClock()) return;
  g_rtcWarned = true;
  Serial.println(F("[MV] RTC not set — using uptime in debug timestamps"));
  Serial.flush();
}
