#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

size_t mvBase64Decode(const char *in, uint8_t *out, size_t outMax);

#ifdef __cplusplus
}
#endif
