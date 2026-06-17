#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

struct MvMqttConfig {
  const char* broker = "192.168.1.100";
  uint16_t port = 1883;
  const char* deviceId = "opta_st_01";
  const char* topicPrefix = "mooreview/v1";
  uint32_t reportMs = 180000;
};

void mvMqttBegin(const MvMqttConfig* cfg);
void mvMqttLoop();
bool mvMqttConnected();
void mvMqttSetPauseTelemetry(bool pause);
bool mvMqttHandleCommand(const char* json, String& responseOut);
void mvMqttMaybePublishTelemetry(bool runtimeRunning, uint32_t scanMs, uint32_t cycles, uint32_t lastCycleUs);
