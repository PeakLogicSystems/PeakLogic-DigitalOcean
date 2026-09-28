#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

/** Over-the-air firmware update (HTTP upload + optional WiFi ArduinoOTA). */

struct MvOtaInfo {
  bool supported;
  bool inProgress;
  bool error;
  bool wifiOta;
  uint32_t bytesWritten;
  uint32_t totalBytes;
  char phase[16];
  char message[64];
};

void mvOtaBegin();
/** Start/stop ArduinoOTA with the WiFi setup AP (skipped when AP off — saves RAM for MQTT). */
void mvOtaWifiSync(bool enable);
void mvOtaLoop();
void mvOtaSetRuntimeFlag(bool* runningFlag);
void mvOtaAppendStatus(JsonObject doc);
void mvOtaRebootAfterFlash();
MvOtaInfo mvOtaInfo();

void mvOtaRegisterHttpRoutes();
bool mvOtaHandleHttpFirmwarePost(Stream& client, const String& headerBlock, size_t contentLength);

bool mvOtaBeginFlash(size_t totalSize);
bool mvOtaWriteFlash(const uint8_t* data, size_t len);
bool mvOtaEndFlash();
void mvOtaAbortFlash();
bool mvOtaCheckAuth(const char* passwordHeader);
