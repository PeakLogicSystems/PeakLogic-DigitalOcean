#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

struct PlMqttConfig {
  const char* broker = "192.168.1.100";
  uint16_t port = 1883;
  const char* deviceId = "opta_st_01";
  const char* topicPrefix = "peaklogic/v1";
  uint32_t reportMs = 180000;
};

void plMqttBegin(const PlMqttConfig* cfg);
void plMqttLoop();
bool plMqttConnected();
void plMqttSetPauseTelemetry(bool pause);
bool plMqttHandleCommand(const char* json, String& responseOut);
void plMqttMaybePublishTelemetry(bool runtimeRunning, uint32_t scanMs, uint32_t cycles, uint32_t lastCycleUs);
