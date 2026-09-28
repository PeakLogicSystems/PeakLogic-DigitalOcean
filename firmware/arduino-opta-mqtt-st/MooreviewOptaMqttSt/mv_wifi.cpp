#include "mv_wifi.h"
#include "mv_ota.h"
#include "mv_config.h"
#include "mv_debug.h"
#include <string.h>

#ifdef MV_HAS_WIFI
#include <WiFi.h>
#if MV_HAS_WEBSERVER
#include "mv_http.h"
#endif

static bool g_apActive = false;
static IPAddress g_apIp(192, 168, 4, 1);
static char g_wifiLastError[96];
static unsigned long g_wifiNextRetryMs = 0;
/** -1 unknown, 0 no WiFi module, 1 hardware present (runtime Opta board info). */
static int8_t g_wifiHwPresent = -1;

static bool mvWifiStatusIsNoHardware(int status) {
  return status == WL_NO_MODULE || status == WL_NO_SHIELD;
}

static void mvWifiSetError(const char* msg) {
  strncpy(g_wifiLastError, msg ? msg : "", sizeof(g_wifiLastError) - 1);
  g_wifiLastError[sizeof(g_wifiLastError) - 1] = '\0';
}

static const char* mvWifiStatusName(int status) {
  if (status == WL_AP_LISTENING) return "AP listening";
  if (status == WL_AP_CONNECTED) return "AP client connected";
  if (status == WL_NO_MODULE) return "no WiFi module";
  if (status == WL_NO_SHIELD) return "no WiFi shield";
  if (status == WL_CONNECT_FAILED) return "connect failed";
  return "unknown";
}

static void mvWifiNormalizeCredentials(MvDeviceConfig* cfg) {
  if (!cfg) return;
  if (!cfg->wifiApSsid[0]) {
    strncpy(cfg->wifiApSsid, MV_WIFI_AP_SSID, sizeof(cfg->wifiApSsid) - 1);
    cfg->wifiApSsid[sizeof(cfg->wifiApSsid) - 1] = '\0';
  }
  if (!cfg->wifiApPass[0]) {
    strncpy(cfg->wifiApPass, MV_WIFI_AP_PASS, sizeof(cfg->wifiApPass) - 1);
    cfg->wifiApPass[sizeof(cfg->wifiApPass) - 1] = '\0';
  }
}

bool mvWifiProbe() {
  if (g_wifiHwPresent >= 0) return g_wifiHwPresent == 1;
  const int st = WiFi.status();
  if (mvWifiStatusIsNoHardware(st)) {
    g_wifiHwPresent = 0;
    mvWifiSetError("No WiFi module on this Opta — use Ethernet /setup");
    MV_LOG_CMD2("WiFi probe ", g_wifiLastError);
    return false;
  }
  g_wifiHwPresent = 1;
  MV_LOG_CMD("WiFi probe: hardware OK");
  return true;
}

void mvWifiStop() {
  g_apActive = false;
  mvOtaWifiSync(false);
#if MV_HAS_WEBSERVER
  mvHttpWifiEnd();
#endif
  WiFi.disconnect();
}

bool mvWifiBegin(const MvDeviceConfig* cfg) {
  g_apActive = false;
  if (!cfg || !cfg->wifiApEnable) {
    mvWifiSetError("");
    g_wifiNextRetryMs = 0;
    return false;
  }
  if (!mvWifiProbe()) {
    return false;
  }

  MvDeviceConfig local = *cfg;
  mvWifiNormalizeCredentials(&local);
  if (strlen(local.wifiApPass) < 8) {
    mvWifiSetError("WiFi password must be at least 8 characters");
    MV_LOG_CMD2("WiFi AP ", g_wifiLastError);
    g_wifiNextRetryMs = millis() + 30000;
    return false;
  }

  IPAddress apIp(MV_WIFI_AP_IP);
  g_apIp = apIp;

  /* Opta mbed: prime WiFi stack before beginAP (avoids crash / silent fail). */
  (void)WiFi.status();
  Serial.println(F("[MV*] WiFi AP starting"));
  Serial.flush();
  WiFi.disconnect();
  WiFi.config(apIp);

  const char* ssid = local.wifiApSsid;
  const char* pass = local.wifiApPass;

  int status = WL_CONNECT_FAILED;
  for (uint8_t attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) delay(500);
    (void)WiFi.status();
    status = WiFi.beginAP(ssid, pass);
    if (status == WL_AP_LISTENING) break;
    MV_LOG_CMD2("WiFi beginAP retry status=", status);
  }

  if (status != WL_AP_LISTENING) {
    char msg[96];
    snprintf(msg, sizeof(msg), "beginAP failed (%d %s)", status, mvWifiStatusName(status));
    if (status == WL_NO_MODULE || status == WL_NO_SHIELD) {
      g_wifiHwPresent = 0;
      strncat(msg, " — this Opta has no WiFi module", sizeof(msg) - strlen(msg) - 1);
    } else {
      strncat(msg, " — run WiFiFirmwareUpdater once", sizeof(msg) - strlen(msg) - 1);
    }
    mvWifiSetError(msg);
    MV_LOG_CMD2("WiFi AP ", g_wifiLastError);
    g_wifiNextRetryMs = millis() + 30000;
    return false;
  }

#if MV_HAS_WEBSERVER
  mvHttpWifiBegin();
#endif
  g_apActive = true;
  g_wifiNextRetryMs = 0;
  mvWifiSetError("");
  mvOtaWifiSync(true);
  MV_LOG_CMD2("WiFi AP listening ssid=", ssid);
  char url[64];
  snprintf(url, sizeof(url), "http://%s:%u/setup", g_apIp.toString().c_str(), (unsigned)MV_WIFI_HTTP_PORT);
  MV_LOG_CMD2("WiFi AP url ", url);
  return true;
}

bool mvWifiApplyConfig(const MvDeviceConfig* cfg) {
  mvWifiStop();
  if (!cfg || !cfg->wifiApEnable) {
    mvWifiSetError("");
    g_wifiNextRetryMs = 0;
    return true;
  }
  return mvWifiBegin(cfg);
}

void mvWifiLoop(const MvDeviceConfig* cfg) {
  if (!mvWifiProbe()) return;
  if (!cfg || !cfg->wifiApEnable || g_apActive) return;
  const unsigned long now = millis();
  if (g_wifiNextRetryMs != 0 && (long)(now - g_wifiNextRetryMs) < 0) return;
  g_wifiNextRetryMs = now + 30000;
  MV_LOG_CMD("WiFi AP retry");
  mvWifiBegin(cfg);
}

bool mvWifiApActive() { return g_apActive; }

IPAddress mvWifiApIp() { return g_apIp; }

const char* mvWifiLastError() { return g_wifiLastError; }

void mvWifiHandleClients() {
#if MV_HAS_WEBSERVER
  mvHttpHandleWifiClients();
#endif
}

#else

static char g_wifiLastError[96] =
  "No WiFi in build — use Board: Mbed OS Opta Boards -> Arduino Opta WiFi";

bool mvWifiBegin(const MvDeviceConfig*) { return false; }

bool mvWifiApplyConfig(const MvDeviceConfig*) { return false; }

void mvWifiStop() {}

void mvWifiLoop(const MvDeviceConfig*) {}

bool mvWifiApActive() { return false; }

IPAddress mvWifiApIp() { return IPAddress(0, 0, 0, 0); }

const char* mvWifiLastError() { return g_wifiLastError; }

void mvWifiHandleClients() {}

#endif

#ifndef MV_HAS_WIFI
bool mvWifiProbe() { return false; }
#endif

bool mvWifiCapable() {
#ifdef MV_HAS_WIFI
  return mvWifiProbe();
#else
  return false;
#endif
}
