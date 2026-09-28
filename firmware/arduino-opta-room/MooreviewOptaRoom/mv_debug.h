#pragma once

#ifndef MV_DEBUG_VERBOSE
#define MV_DEBUG_VERBOSE 1
#endif

void mvDebugPrefix();

/** Always-on milestones (boot, MQTT connect, cmd rx) — not gated by MV_DEBUG_VERBOSE. */
#define MV_LOG_CMD(msg) do { Serial.print(F("[MV*] ")); Serial.println(msg); Serial.flush(); } while (0)
#define MV_LOG_CMD2(a, b) do { Serial.print(F("[MV*] ")); Serial.print(a); Serial.println(b); Serial.flush(); } while (0)

#if MV_DEBUG_VERBOSE
#define MV_LOG(msg) do { mvDebugPrefix(); Serial.print(' '); Serial.println(msg); Serial.flush(); } while (0)
#define MV_LOG2(a, b) do { mvDebugPrefix(); Serial.print(' '); Serial.print(a); Serial.println(b); Serial.flush(); } while (0)
#else
#define MV_LOG(msg) do {} while (0)
#define MV_LOG2(a, b) do {} while (0)
#endif
