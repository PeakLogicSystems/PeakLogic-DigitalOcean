#include "mv_runtime.h"
#include "mv_config.h"
#include "mv_debug.h"
#include "mv_st.h"

static bool g_running = false;
static uint32_t g_scanMs = MV_SCAN_MS_DEFAULT;
static uint32_t g_lastScanMs = 0;
static uint32_t g_cycles = 0;
static uint32_t g_lastCycleUs = 0;

void mvRuntimeBegin(uint32_t defaultScanMs) {
  g_scanMs = defaultScanMs ? defaultScanMs : MV_SCAN_MS_DEFAULT;
  g_running = false;
  g_lastScanMs = 0;
  g_cycles = 0;
  g_lastCycleUs = 0;
}

bool mvRuntimeRunning() { return g_running; }
uint32_t mvRuntimeScanMs() { return g_scanMs; }
uint32_t mvRuntimeCycles() { return g_cycles; }
uint32_t mvRuntimeLastCycleUs() { return g_lastCycleUs; }

static void logRuntimeBanner(const __FlashStringHelper* title) {
  Serial.println();
  mvDebugPrefix();
  Serial.println(F(" ========================================"));
  mvDebugPrefix();
  Serial.print(' ');
  Serial.println(title);
  Serial.flush();
}

void mvRuntimeStart(uint32_t scanMs) {
  if (scanMs > 0) g_scanMs = scanMs;
  mvOneShotReset();
  g_running = true;
  g_lastScanMs = millis();
  g_cycles = 0;
  logRuntimeBanner(F("ST RUNTIME START"));
  if (mvProgramName()[0]) MV_LOG2("program ", mvProgramName());
  MV_LOG2("scanMs=", g_scanMs);
  MV_LOG2("programLoaded=", mvProgramValid() ? "yes" : "no");
  if (!mvProgramValid() && mvLastProgramError()[0]) {
    MV_LOG2("programError=", mvLastProgramError());
  }
  mvDebugPrefix();
  Serial.println(F(" ========================================"));
  Serial.flush();
}

void mvRuntimeStop() {
  const bool wasRunning = g_running;
  g_running = false;
  if (!wasRunning && g_cycles == 0) {
    MV_LOG("ST RUNTIME STOP (already stopped)");
    return;
  }
  logRuntimeBanner(F("ST RUNTIME STOP"));
  MV_LOG2("cycles=", g_cycles);
  mvDebugPrefix();
  Serial.println(F(" ========================================"));
  Serial.flush();
}

void mvRuntimeTick(void (*scanFn)(uint32_t dtMs)) {
  if (!g_running || !scanFn) return;
  const unsigned long now = millis();
  if (g_lastScanMs != 0 && (now - g_lastScanMs) < g_scanMs) return;
  const uint32_t dt = g_lastScanMs ? (uint32_t)(now - g_lastScanMs) : g_scanMs;
  g_lastScanMs = now;
  const unsigned long t0 = micros();
  scanFn(dt);
  g_lastCycleUs = (uint32_t)(micros() - t0);
  g_cycles++;
#if MV_DEBUG_VERBOSE
  if (g_cycles == 1 || (g_cycles % 50) == 0) {
    MV_LOG2("ST scan #", g_cycles);
    MV_LOG2("  dtMs=", dt);
    MV_LOG2("  us=", g_lastCycleUs);
  }
#endif
}
