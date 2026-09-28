/*
 * Software wall clock (Opta sync_time parity).
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void mvRtcSetSoftwareClock(uint32_t unix_utc, int tz_offset_min);
bool mvRtcHasWallClock(void);
uint32_t mvRtcUnixUtc(void);
int mvRtcTzOffsetMin(void);

#ifdef __cplusplus
}
#endif
