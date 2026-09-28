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
  uint32_t reportMs = MV_REPORT_MS_DEFAULT;
};

uint32_t mvMqttReportMs();
bool mvMqttSetReportMs(uint32_t ms);

void mvMqttBegin(const MvMqttConfig* cfg, const MvDeviceConfig* devCfg = nullptr);
void mvMqttApplyDeviceConfig(const MvDeviceConfig* devCfg);
void mvMqttGetBroker(char* hostOut, size_t hostLen, uint16_t* portOut);
bool mvMqttAuthConfigured();
bool mvMqttAuthFailed();
void mvMqttLoop();
bool mvMqttDrainPendingCommand();
bool mvMqttCmdPending();
bool mvMqttConnected();
/** True after at least one successful MQTT session (used by liveness watchdog). */
bool mvMqttEverConnected();
/** One-shot broker connect test (separate client; does not alter the live Parc session). */
bool mvMqttTestConnection(const char* host, uint16_t port, const char* user, const char* pass,
                          char* errOut, size_t errLen, int* stateOut, bool useTls = false);
/** Queue TLS/MQTT test to run from loop() after HTTP is idle (Opta Ethernet is single-socket). */
bool mvMqttTestQueue(const char* host, uint16_t port, const char* user, const char* pass, bool useTls);
void mvMqttTestPoll();
/** True while a queued test is due or running — skip Ethernet HTTP so TLS can use the socket. */
bool mvMqttTestBusy();
void mvMqttTestStatus(bool* pending, bool* done, bool* ok, int* state, char* errOut, size_t errLen,
                      char* brokerOut, size_t brokerLen, uint16_t* portOut, bool* tlsOut);
void mvMqttSetPauseTelemetry(bool pause);
bool mvMqttTelemetryPaused();
bool mvMqttHandleCommand(const char* json, const char* id, const char* op, String& responseOut);
void mvMqttMaybePublishTelemetry(bool runtimeRunning, uint32_t scanMs, uint32_t cycles, uint32_t lastCycleUs);
void mvMqttRequestTelemetryFlush();
uint16_t mvMqttBufferBytes();
void mvMqttReserveBuffer();
