/*
 * Global site key for P2P tags (Opta Parc parity).
 * SPDX-License-Identifier: Apache-2.0
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void mvGlobalKeySet(uint16_t key);
uint16_t mvGlobalSiteKey(void);
bool mvGlobalAddrKey(char out[5]);
bool mvGlobalTopic(const char *tag, const char *topic_prefix, char *out, size_t out_len);

#ifdef __cplusplus
}
#endif
