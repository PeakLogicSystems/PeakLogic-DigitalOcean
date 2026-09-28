#pragma once

#include <Arduino.h>

/** ST scan runtime state (start/stop from /api/runtime/*). */
void mvRuntimeBegin(uint32_t defaultScanMs);
bool mvRuntimeRunning();
uint32_t mvRuntimeScanMs();
uint32_t mvRuntimeCycles();
uint32_t mvRuntimeLastCycleUs();

void mvRuntimeStart(uint32_t scanMs);
void mvRuntimeStop();
void mvRuntimeTick(void (*scanFn)(uint32_t dtMs));
