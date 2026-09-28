#include "mv_rtc.h"

#include "esp_timer.h"

static bool s_has_clock;
static uint32_t s_unix_base;
static int64_t s_mono_base_us;
static int s_tz_offset_min;

void mvRtcSetSoftwareClock(uint32_t unix_utc, int tz_offset_min)
{
    s_unix_base = unix_utc;
    s_mono_base_us = esp_timer_get_time();
    s_tz_offset_min = tz_offset_min;
    s_has_clock = true;
}

bool mvRtcHasWallClock(void)
{
    return s_has_clock;
}

uint32_t mvRtcUnixUtc(void)
{
    if (!s_has_clock) {
        return 0;
    }
    int64_t elapsed = (esp_timer_get_time() - s_mono_base_us) / 1000000;
    if (elapsed < 0) {
        elapsed = 0;
    }
    return s_unix_base + (uint32_t)elapsed;
}

int mvRtcTzOffsetMin(void)
{
    return s_tz_offset_min;
}
