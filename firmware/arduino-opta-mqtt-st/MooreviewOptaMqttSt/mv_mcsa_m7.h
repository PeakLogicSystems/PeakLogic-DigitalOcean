#pragma once

#include <ArduinoJson.h>
#include <stdint.h>

/** M7 side: 5-minute CT ingest + SRAM4 handoff to Opta M4 FFT (scan cycle stays on M7). */
void mvMcsaM7Begin();
void mvMcsaM7Tick();
bool mvMcsaM7Capturing();
bool mvMcsaM7PeekRaw(uint8_t ch, int* rawOut);
bool mvMcsaM7HasCooked();
bool mvMcsaM7EdgePending();
void mvMcsaM7AppendRuntime(JsonObject runtime);
bool mvMcsaM7AppendCooked(JsonArray mcsa);
bool mvMcsaM7AppendEdgeAi(JsonArray edgeAi);
void mvMcsaM7AppendStatus(JsonObject obj);
/** Latest M4 asset labels (HVAC: label0=comp, label1=fan; lift: pump-1/2). */
bool mvMcsaM7AssetLabels(char* lab0, char* lab1, float* sc0, float* sc1, float* cf0, float* cf1);
/** Back-compat for obsolete mv_hvac.cpp (delete that file; use mv_mcsa_mon). */
bool mvMcsaM7HvacLabels(char* lab0, char* lab1, float* sc0, float* sc1, float* cf0, float* cf1);
