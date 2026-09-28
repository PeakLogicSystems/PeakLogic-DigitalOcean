#include "mv_global_mqtt.h"
#include "mv_global_key.h"
#include "mv_tags.h"
#include <ArduinoJson.h>
#include <string.h>

static char s_globalSubTopic[80];
static bool s_globalSubscribed = false;

static void buildGlobalSubTopic(const char* topicPrefix) {
  char addr[5];
  mvGlobalAddrKey(addr);
  snprintf(s_globalSubTopic, sizeof(s_globalSubTopic), "%s/g/%s/+", topicPrefix ? topicPrefix : "peaklogic/v1", addr);
}

void mvGlobalMqttBegin(PubSubClient& mqtt, const char* topicPrefix) {
  (void)mqtt;
  buildGlobalSubTopic(topicPrefix);
  s_globalSubscribed = false;
}

void mvGlobalMqttOnConnect(PubSubClient& mqtt, const char* topicPrefix) {
  buildGlobalSubTopic(topicPrefix);
  if (mvGlobalTagCount() == 0) {
    s_globalSubscribed = false;
    return;
  }
  s_globalSubscribed = mqtt.subscribe(s_globalSubTopic, 1);
}

static bool topicMatchesGlobalTag(const char* topic, const char* topicPrefix, char tagOut[16]) {
  if (!topic || !tagOut) return false;
  char addr[5];
  mvGlobalAddrKey(addr);
  char expectPrefix[72];
  snprintf(expectPrefix, sizeof(expectPrefix), "%s/g/%s/", topicPrefix ? topicPrefix : "peaklogic/v1", addr);
  const size_t n = strlen(expectPrefix);
  if (strncmp(topic, expectPrefix, n) != 0) return false;
  const char* tagName = topic + n;
  if (!tagName[0] || strlen(tagName) > 15) return false;
  strncpy(tagOut, tagName, 15);
  tagOut[15] = '\0';
  return true;
}

static bool applyGlobalPayload(MvTag* t, const char* json, size_t len) {
  if (!t || !json || len == 0) return false;
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, json, len)) return false;
  JsonVariant v = doc["v"];
  if (v.isNull()) v = doc["value"];
  if (v.isNull()) return false;
  switch (t->kind) {
    case MV_BOOL: mvSetBool(t->id, v.as<bool>()); return true;
    case MV_INT: mvSetInt(t->id, v.as<int32_t>()); return true;
    case MV_REAL: mvSetReal(t->id, v.as<float>()); return true;
    default: return false;
  }
}

bool mvGlobalMqttHandleMessage(const char* topic, const byte* payload, unsigned int len, const char* topicPrefix) {
  char tagId[16];
  if (!topicMatchesGlobalTag(topic, topicPrefix, tagId)) return false;
  MvTag* t = mvFindTag(tagId);
  if (!t || !t->isGlobal) return true;
  if (len >= 256) return true;
  char buf[256];
  memcpy(buf, payload, len);
  buf[len] = '\0';
  applyGlobalPayload(t, buf, len);
  return true;
}

struct PublishCtx {
  PubSubClient* mqtt;
  const char* topicPrefix;
};

static void publishOneGlobal(MvTag* t, void* ctxVoid) {
  PublishCtx* ctx = (PublishCtx*)ctxVoid;
  if (!t || !ctx || !ctx->mqtt || !ctx->mqtt->connected()) return;
  char topic[96];
  if (!mvGlobalTopic(t->id, topic, sizeof(topic))) return;
  StaticJsonDocument<64> doc;
  const char* typeStr = "BOOL";
  switch (t->kind) {
    case MV_INT:
      typeStr = "INT";
      doc["v"] = mvTagEffectiveInt(t);
      break;
    case MV_REAL:
      typeStr = "REAL";
      doc["v"] = mvTagEffectiveReal(t);
      break;
    default:
      doc["v"] = mvTagEffectiveBool(t);
      break;
  }
  doc["t"] = typeStr;
  char payload[48];
  const size_t n = serializeJson(doc, payload, sizeof(payload));
  if (n == 0 || n >= sizeof(payload)) return;
  ctx->mqtt->publish(topic, (const uint8_t*)payload, n, true);
}

void mvGlobalMqttPublishAll(PubSubClient& mqtt, const char* topicPrefix) {
  if (!mqtt.connected() || mvGlobalTagCount() == 0) return;
  PublishCtx ctx = { &mqtt, topicPrefix };
  mvForEachGlobalTag(publishOneGlobal, &ctx);
}
