#pragma once

#include <ArduinoJson.h>

/** Runtime / program fields for GET /api/status and local setup page. */
void mvFillDeviceStatus(JsonObject root);
/** Small JSON for setup page polling (fast while MQTT deploy / ST scan runs). */
void mvFillDeviceStatusLite(JsonObject root);
