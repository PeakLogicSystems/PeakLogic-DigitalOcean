#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "mv_config.h"

struct MvDeviceConfig;

struct MvMqttConfig {
  const char* broker = MV_MQTT_SKETCH_BROKER_DEFAULT;
  uint16_t port = 1883;
  const char* deviceId = "opta_st_01";
  const char* topicPrefix = "peaklogic/v1";
  uint32_t reportMs = 2000;
};

void mvMqttBegin(const MvMqttConfig* cfg, const MvDeviceConfig* devCfg = nullptr);
void mvMqttApplyDeviceConfig(const MvDeviceConfig* devCfg);
void mvMqttGetBroker(char* hostOut, size_t hostLen, uint16_t* portOut);
void mvMqttLoop();
bool mvMqttDrainPendingCommand();
bool mvMqttCmdPending();
bool mvMqttConnected();
void mvMqttSetPauseTelemetry(bool pause);
bool mvMqttHandleCommand(const char* json, const char* id, const char* op, String& responseOut);
void mvMqttMaybePublishTelemetry(bool runtimeRunning, uint32_t scanMs, uint32_t cycles, uint32_t lastCycleUs);
/** Achieved PubSubClient packet buffer size in bytes (256 = alloc failed / default). */
uint16_t mvMqttBufferBytes();
/** Reserve the MQTT packet buffer early in setup(), before network init fragments the heap. */
void mvMqttReserveBuffer();
