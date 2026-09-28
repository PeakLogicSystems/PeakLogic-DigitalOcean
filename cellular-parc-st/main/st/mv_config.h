/*
 * ESP32 Parc ST soft PLC — config limits (keep in sync with Opta mv_config.h).
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#ifndef MV_MAX_TAGS
#define MV_MAX_TAGS 128
#endif

#ifndef MV_AVG_RING
#define MV_AVG_RING 16
#endif

#ifndef MV_BC_MAX
#define MV_BC_MAX 16384
#endif

#ifndef MV_SCAN_MS_DEFAULT
#define MV_SCAN_MS_DEFAULT 100
#endif

#ifndef MV_PROTOCOL_VERSION
#define MV_PROTOCOL_VERSION 2
#endif

#ifndef MV_FIRMWARE_VERSION
#define MV_FIRMWARE_VERSION "0.3.0-parc-st"
#endif

#ifndef MV_PLATFORM_ID
#ifdef CONFIG_MV_PLATFORM_ID
#define MV_PLATFORM_ID CONFIG_MV_PLATFORM_ID
#else
#define MV_PLATFORM_ID "lilygo-t-eth-elite-parc-st"
#endif
#endif
