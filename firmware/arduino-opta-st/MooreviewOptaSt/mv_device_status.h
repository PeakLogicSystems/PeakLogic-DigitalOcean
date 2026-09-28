#pragma once

#include <ArduinoJson.h>

/** Runtime / program fields for GET /api/status and local setup page. */
void mvFillDeviceStatus(JsonObject root);
