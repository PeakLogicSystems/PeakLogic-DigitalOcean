#pragma once

#include <ArduinoJson.h>

void mvFillIoMapJson(JsonObject root);
/** Physical + expansion I/O only — Parc telemetry tags array (smaller than full tag table). */
void mvTagsToParcIoMapJson(JsonArray out);
void mvIoMapRegisterRoutes();
const char* mvIoMapHtmlPage();
