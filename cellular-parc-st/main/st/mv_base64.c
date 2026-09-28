#include "mv_base64.h"

static int b64Val(char c)
{
    if (c >= 'A' && c <= 'Z') {
        return c - 'A';
    }
    if (c >= 'a' && c <= 'z') {
        return c - 'a' + 26;
    }
    if (c >= '0' && c <= '9') {
        return c - '0' + 52;
    }
    if (c == '+') {
        return 62;
    }
    if (c == '/') {
        return 63;
    }
    return -1;
}

size_t mvBase64Decode(const char *in, uint8_t *out, size_t outMax)
{
    if (!in || !out || !outMax) {
        return 0;
    }
    size_t o = 0;
    uint32_t acc = 0;
    int bits = 0;
    for (const char *p = in; *p; p++) {
        if (*p == '=' || *p == '\n' || *p == '\r' || *p == ' ') {
            continue;
        }
        const int v = b64Val(*p);
        if (v < 0) {
            return 0;
        }
        acc = (acc << 6) | (uint32_t)v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            if (o >= outMax) {
                return 0;
            }
            out[o++] = (uint8_t)((acc >> bits) & 0xff);
        }
    }
    return o;
}
