#pragma once

#include <ArduinoJson.h>

/** Hardware + liveness watchdog — recovers from loop stalls and wedged HTTP/MQTT. */
void mvWatchdogBegin();
void mvWatchdogLoopBegin();
/** @param checkLiveness false during OTA, deploy, NV program I/O */
void mvWatchdogLoopEnd(bool checkLiveness);
void mvWatchdogKick();
void mvWatchdogNoteActivity();
void mvWatchdogAppendStatus(JsonObject obj);
