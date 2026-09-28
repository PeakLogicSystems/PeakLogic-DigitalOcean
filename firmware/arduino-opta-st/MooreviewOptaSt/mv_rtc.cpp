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

#if defined(MV_HAS_STM32_RTC)
static bool mvRtcRead(int* year, int* month, int* day, int* hour, int* minute, int* second) {
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
  /* tm: 0=Sun … 6=Sat · STM32 RTC: 1=Mon … 7=Sun */
  static const uint8_t map[] = { 7, 1, 2, 3, 4, 5, 6 };
  if (tmWday < 0 || tmWday > 6) return 1;
  return map[tmWday];
}
#endif

bool mvRtcHasWallClock() {
#if defined(MV_HAS_STM32_RTC)
  int y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0;
  if (!mvRtcRead(&y, &mo, &d, &h, &mi, &s)) return false;
  return y >= 2020 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
#else
  return false;
#endif
}

void mvRtcSetUnix(uint32_t epochUtc) {
#if defined(MV_HAS_STM32_RTC)
  if (epochUtc < 1577836800u) return; /* before 2020-01-01 */
  time_t t = (time_t)epochUtc;
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
#else
  (void)epochUtc;
#endif
}

void mvRtcSyncFromHeader(const char* unixSeconds) {
  if (!unixSeconds || !unixSeconds[0]) return;
  uint32_t epoch = (uint32_t)strtoul(unixSeconds, nullptr, 10);
  if (epoch < 1577836800u) return;
  mvRtcSetUnix(epoch);
}

bool mvRtcFormatDateTime(char* buf, size_t len) {
  if (!buf || len < 20) return false;
#if defined(MV_HAS_STM32_RTC)
  int y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0;
  if (!mvRtcRead(&y, &mo, &d, &h, &mi, &s)) return false;
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
  Serial.println(F("[MV] RTC not set — PeakLogic Connect syncs clock; using uptime in debug until then"));
  Serial.flush();
}
