#pragma once

/* Set to 0 before build to silence Serial trace. */
#ifndef MV_DEBUG_VERBOSE
#define MV_DEBUG_VERBOSE 1
#endif

void mvDebugPrefix();

#if MV_DEBUG_VERBOSE
#define MV_LOG(msg) do { mvDebugPrefix(); Serial.print(' '); Serial.println(msg); Serial.flush(); } while (0)
#define MV_LOG2(a, b) do { mvDebugPrefix(); Serial.print(' '); Serial.print(a); Serial.println(b); Serial.flush(); } while (0)
#else
#define MV_LOG(msg) do {} while (0)
#define MV_LOG2(a, b) do {} while (0)
#endif
