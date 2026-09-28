#pragma once
#include <stddef.h>
#include <stdint.h>

/** Decode base64 into out (max outMax). Returns decoded length or 0 on error. */
size_t mvBase64Decode(const char* in, uint8_t* out, size_t outMax);
