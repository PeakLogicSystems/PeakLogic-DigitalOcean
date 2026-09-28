#include "mv_global_key.h"

#include <stdio.h>

static uint16_t s_site_key = 1;

void mvGlobalKeySet(uint16_t key)
{
    s_site_key = (key < 1) ? 1 : key;
}

uint16_t mvGlobalSiteKey(void)
{
    return (s_site_key < 1) ? 1 : s_site_key;
}

bool mvGlobalAddrKey(char out[5])
{
    if (!out) {
        return false;
    }
    snprintf(out, 5, "%04x", (unsigned)mvGlobalSiteKey());
    return true;
}

bool mvGlobalTopic(const char *tag, const char *topic_prefix, char *out, size_t out_len)
{
    if (!tag || !out || out_len < 8) {
        return false;
    }
    char addr[5];
    mvGlobalAddrKey(addr);
    const char *pfx = (topic_prefix && topic_prefix[0]) ? topic_prefix : "peaklogic/v1";
    int n = snprintf(out, out_len, "%s/g/%s/%s", pfx, addr, tag);
    return n > 0 && (size_t)n < out_len;
}
