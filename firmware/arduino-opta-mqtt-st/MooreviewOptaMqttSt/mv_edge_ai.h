#pragma once

#include <ArduinoJson.h>

/** CT motor-start edge inference + MCSA-lite cooked spectra (I1–I6 → pump-1 / pump-2). */
void mvEdgeAiBegin();
void mvEdgeAiTick(uint32_t dtMs);
void mvEdgeAiAppendRuntime(JsonObject runtime);
void mvEdgeAiAppendTelemetry(JsonDocument& doc);
