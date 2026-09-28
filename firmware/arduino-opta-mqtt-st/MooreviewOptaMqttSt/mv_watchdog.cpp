#include "mv_watchdog.h"
#include "mv_config.h"
#include "mv_debug.h"
#include "mv_mqtt.h"
#include <Ethernet.h>

#if (defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)) && MV_WATCHDOG_ENABLE
#include "drivers/Watchdog.h"
extern "C" void NVIC_SystemReset(void);
#endif

static unsigned long s_lastActivityMs = 0;
static unsigned long s_loopStartMs = 0;
static bool s_hwEnabled = false;
static uint32_t s_timeoutMs = MV_WATCHDOG_TIMEOUT_MS;
static uint32_t s_livenessMs = MV_WATCHDOG_LIVENESS_MS;
static uint32_t s_idleMs = 0;

static bool mvWatchdogHasEthIp() {
  IPAddress ip = Ethernet.localIP();
  return ip[0] || ip[1] || ip[2] || ip[3];
}

void mvWatchdogBegin() {
  s_lastActivityMs = millis();
#if (defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)) && MV_WATCHDOG_ENABLE
  mbed::Watchdog& wdt = mbed::Watchdog::get_instance();
  const uint32_t maxMs = wdt.get_max_timeout();
  s_timeoutMs = MV_WATCHDOG_TIMEOUT_MS;
  if (s_timeoutMs > maxMs) s_timeoutMs = maxMs;
  if (s_timeoutMs < 1000) s_timeoutMs = 1000;
  if (wdt.start(s_timeoutMs)) {
    s_hwEnabled = true;
    MV_LOG_CMD2("watchdog started ms=", (int)s_timeoutMs);
  } else {
    MV_LOG_CMD("watchdog start FAILED");
  }
#else
  MV_LOG_CMD("watchdog disabled (unsupported board)");
#endif
}

void mvWatchdogNoteActivity() {
  s_lastActivityMs = millis();
}

void mvWatchdogLoopBegin() {
  s_loopStartMs = millis();
}

void mvWatchdogKick() {
#if (defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)) && MV_WATCHDOG_ENABLE
  mbed::Watchdog& wdt = mbed::Watchdog::get_instance();
  if (wdt.is_running()) wdt.kick();
#endif
}

void mvWatchdogLoopEnd(bool checkLiveness) {
  const unsigned long now = millis();
  s_idleMs = now - s_lastActivityMs;

#if (defined(ARDUINO_OPTA) || defined(ARDUINO_PORTENTA_H7_M7)) && MV_WATCHDOG_ENABLE
  const unsigned long loopMs = now - s_loopStartMs;
  if (s_hwEnabled && loopMs > s_timeoutMs) {
    MV_LOG_CMD2("watchdog loop stall ms=", (int)loopMs);
    return;
  }

  if (checkLiveness && MV_WATCHDOG_LIVENESS_MS > 0 && mvWatchdogHasEthIp()
      && mvMqttEverConnected()
      && !mvMqttTelemetryPaused()
      && now > MV_WATCHDOG_BOOT_GRACE_MS && s_idleMs > s_livenessMs) {
    MV_LOG_CMD2("watchdog liveness timeout idle ms=", (int)s_idleMs);
    delay(50);
    NVIC_SystemReset();
    return;
  }

  mvWatchdogKick();
#endif
  (void)checkLiveness;
}

void mvWatchdogAppendStatus(JsonObject obj) {
  JsonObject wdg = obj.createNestedObject("watchdog");
  wdg["enabled"] = s_hwEnabled;
  wdg["timeoutMs"] = s_timeoutMs;
  wdg["livenessMs"] = s_livenessMs;
  wdg["idleMs"] = s_idleMs;
  wdg["bootGraceMs"] = MV_WATCHDOG_BOOT_GRACE_MS;
}
