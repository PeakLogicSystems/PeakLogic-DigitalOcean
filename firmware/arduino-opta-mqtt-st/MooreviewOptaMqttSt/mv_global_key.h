#pragma once
#include <Arduino.h>
#include <stddef.h>

/** Active global site key (1–65535, default 1). */
uint16_t mvGlobalSiteKey();

/** Four lowercase hex digits into out[5] (e.g. "0001"). */
bool mvGlobalAddrKey(char out[5]);

/** Build peaklogic/v1/g/{addrKey}/{tag} into out. */
bool mvGlobalTopic(const char* tag, char* out, size_t outLen);
