#pragma once
#include "mv_config.h"  // defines MQTT_MAX_PACKET_SIZE before PubSubClient locks its default
#include <PubSubClient.h>

/** Subscribe/publish P2P global tags on peaklogic/v1/g/{siteKey}/{tag}. */
void mvGlobalMqttBegin(PubSubClient& mqtt, const char* topicPrefix);
void mvGlobalMqttOnConnect(PubSubClient& mqtt, const char* topicPrefix);
bool mvGlobalMqttHandleMessage(const char* topic, const byte* payload, unsigned int len, const char* topicPrefix);
void mvGlobalMqttPublishAll(PubSubClient& mqtt, const char* topicPrefix);
