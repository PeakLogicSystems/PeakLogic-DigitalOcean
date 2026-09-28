#include "mv_peripheral.h"
#include "mv_tags.h"
#include "mv_debug.h"
#include <string.h>

struct ShellySlot {
  bool used;
  bool everSeen;
  uint32_t lastSeenMs;
  uint32_t hits;
};

static ShellySlot g_slot[MV_SHELLY_MAX];
static uint32_t g_lastTickMs = 0;

static void slotTagId(char* buf, size_t n, uint8_t slot, const char* field) {
  snprintf(buf, n, "SHELLY%u_%s", (unsigned)slot, field);
}

static void ensureSlotTags(uint8_t slot) {
  char id[16];
  slotTagId(id, sizeof(id), slot, "FLOOD");  mvEnsureTag(id, MV_BOOL);
  slotTagId(id, sizeof(id), slot, "TEMP_C"); mvEnsureTag(id, MV_REAL);
  slotTagId(id, sizeof(id), slot, "BATT");   mvEnsureTag(id, MV_INT);
  slotTagId(id, sizeof(id), slot, "ONLINE"); mvEnsureTag(id, MV_BOOL);
}

static bool slotOnline(const ShellySlot& s) {
  return s.everSeen && (uint32_t)(millis() - s.lastSeenMs) < MV_SHELLY_STALE_MS;
}

void mvPeripheralBegin() {
  memset(g_slot, 0, sizeof(g_slot));
}

static bool queryParam(const String& q, const char* key, String& out) {
  String k = String(key) + "=";
  int idx = 0;
  const int n = (int)q.length();
  while (idx < n) {
    int amp = q.indexOf('&', idx);
    int end = (amp < 0) ? n : amp;
    if (q.startsWith(k, idx)) {
      out = q.substring(idx + k.length(), end);
      out.trim();
      return true;
    }
    if (amp < 0) break;
    idx = amp + 1;
  }
  return false;
}

static bool parseBoolValue(const String& v) {
  return v == "1" || v.equalsIgnoreCase("true") || v.equalsIgnoreCase("on")
    || v.equalsIgnoreCase("yes") || v.equalsIgnoreCase("open");
}

static uint8_t parseSlot(const String& query) {
  String v;
  if (queryParam(query, "dev", v) || queryParam(query, "slot", v) || queryParam(query, "id", v)) {
    long n = v.toInt();
    if (n >= 1 && n <= MV_SHELLY_MAX) return (uint8_t)n;
  }
  return 1;
}

bool mvPeripheralHandleWebhook(const String& query, String& outMsg) {
  const uint8_t slot = parseSlot(query);
  ensureSlotTags(slot);

  char floodId[16], tempId[16], battId[16], onlineId[16];
  slotTagId(floodId, sizeof(floodId), slot, "FLOOD");
  slotTagId(tempId, sizeof(tempId), slot, "TEMP_C");
  slotTagId(battId, sizeof(battId), slot, "BATT");
  slotTagId(onlineId, sizeof(onlineId), slot, "ONLINE");

  bool applied = false;
  String v;
  if (queryParam(query, "flood", v) || queryParam(query, "alarm", v) || queryParam(query, "rain", v)) {
    mvSetBool(floodId, parseBoolValue(v));
    applied = true;
  }
  if (queryParam(query, "tC", v) || queryParam(query, "temp", v)) {
    mvSetReal(tempId, v.toFloat());
    applied = true;
  }
  if (queryParam(query, "batt", v) || queryParam(query, "battery", v)) {
    mvSetInt(battId, (int)v.toInt());
    applied = true;
  }

  if (applied) {
    ShellySlot& s = g_slot[slot - 1];
    s.used = true;
    s.everSeen = true;
    s.lastSeenMs = millis();
    s.hits++;
    mvSetBool(onlineId, true);
    outMsg = String("shelly slot ") + (unsigned)slot + " flood=" + (mvGetBool(floodId) ? "1" : "0")
      + " tC=" + String(mvGetReal(tempId), 1) + " batt=" + String(mvGetInt(battId));
    MV_LOG_CMD2("peripheral ", outMsg.c_str());
  } else {
    outMsg = "shelly: no recognised fields (expect flood/tC/batt)";
  }
  return applied;
}

void mvPeripheralTick() {
  const uint32_t now = millis();
  if ((uint32_t)(now - g_lastTickMs) < 1000UL) return;
  g_lastTickMs = now;
  for (uint8_t i = 0; i < MV_SHELLY_MAX; i++) {
    if (!g_slot[i].used) continue;
    char onlineId[16];
    slotTagId(onlineId, sizeof(onlineId), i + 1, "ONLINE");
    const bool online = slotOnline(g_slot[i]);
    if (mvGetBool(onlineId) != online) mvSetBool(onlineId, online);
  }
}

void mvPeripheralFillStatus(JsonArray out) {
  const uint32_t now = millis();
  for (uint8_t i = 0; i < MV_SHELLY_MAX; i++) {
    if (!g_slot[i].used) continue;
    JsonObject o = out.createNestedObject();
    o["slot"] = i + 1;
    o["online"] = slotOnline(g_slot[i]);
    o["ageMs"] = g_slot[i].everSeen ? (uint32_t)(now - g_slot[i].lastSeenMs) : 0xFFFFFFFFUL;
    o["hits"] = g_slot[i].hits;
  }
}

uint8_t mvPeripheralActiveCount() {
  uint8_t n = 0;
  for (uint8_t i = 0; i < MV_SHELLY_MAX; i++) if (g_slot[i].used) n++;
  return n;
}
