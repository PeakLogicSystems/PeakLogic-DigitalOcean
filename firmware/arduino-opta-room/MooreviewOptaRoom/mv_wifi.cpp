#include "mv_wifi.h"
#include "mv_config.h"
#include "mv_debug.h"
#include <string.h>

#ifdef MV_HAS_WIFI
#include <WiFi.h>
#include <WiFiServer.h>

static WiFiServer* g_wifiServer = nullptr;
static bool g_apActive = false;
static IPAddress g_apIp(192, 168, 4, 1);
static char g_wifiLastError[96];

static void mvWifiSetError(const char* msg) {
  strncpy(g_wifiLastError, msg ? msg : "", sizeof(g_wifiLastError) - 1);
  g_wifiLastError[sizeof(g_wifiLastError) - 1] = '\0';
}

static const char* mvWifiStatusName(int status) {
  switch (status) {
    case WL_AP_LISTENING: return "AP listening";
    case WL_AP_CONNECTED: return "AP client connected";
    case WL_NO_MODULE: return "no WiFi module";
    case WL_NO_SHIELD: return "no WiFi shield";
    case WL_CONNECT_FAILED: return "connect failed";
    default: return "unknown";
  }
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

void mvWifiStop() {
  g_apActive = false;
  if (g_wifiServer) {
    g_wifiServer->end();
  }
  WiFi.disconnect();
}

bool mvWifiBegin(const MvDeviceConfig* cfg) {
  g_apActive = false;
  if (!cfg || !cfg->wifiApEnable) {
    mvWifiSetError("");
    return false;
  }

  MvDeviceConfig local = *cfg;
  mvWifiNormalizeCredentials(&local);
  if (strlen(local.wifiApPass) < 8) {
    mvWifiSetError("WiFi password must be at least 8 characters");
    MV_LOG_CMD2("WiFi AP ", g_wifiLastError);
    return false;
  }

  IPAddress apIp(MV_WIFI_AP_IP);
  g_apIp = apIp;
  WiFi.disconnect();
  delay(100);
  WiFi.config(apIp);

  const char* ssid = local.wifiApSsid;
  const char* pass = local.wifiApPass;

  int status = WL_CONNECT_FAILED;
  for (uint8_t attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) delay(500);
    status = WiFi.beginAP(ssid, pass);
    if (status == WL_AP_LISTENING) break;
    MV_LOG_CMD2("WiFi beginAP retry status=", status);
  }

  if (status != WL_AP_LISTENING) {
    char msg[96];
    snprintf(msg, sizeof(msg), "beginAP failed (%d %s)", status, mvWifiStatusName(status));
    if (status == WL_NO_MODULE || status == WL_NO_SHIELD) {
      strncat(msg, " — use Opta WiFi hardware; run WiFiFirmwareUpdater once", sizeof(msg) - strlen(msg) - 1);
    }
    mvWifiSetError(msg);
    MV_LOG_CMD2("WiFi AP ", g_wifiLastError);
    return false;
  }

  if (!g_wifiServer) g_wifiServer = new WiFiServer(MV_WIFI_HTTP_PORT);
  g_wifiServer->begin();
  g_apActive = true;
  mvWifiSetError("");
  MV_LOG_CMD2("WiFi AP listening ssid=", ssid);
  MV_LOG_CMD2("WiFi AP url http://", g_apIp.toString() + ":" + String(MV_WIFI_HTTP_PORT));
  return true;
}

bool mvWifiApplyConfig(const MvDeviceConfig* cfg) {
  mvWifiStop();
  if (!cfg || !cfg->wifiApEnable) {
    mvWifiSetError("");
    return true;
  }
  return mvWifiBegin(cfg);
}

bool mvWifiApActive() { return g_apActive; }

IPAddress mvWifiApIp() { return g_apIp; }

const char* mvWifiLastError() { return g_wifiLastError; }

void mvWifiHandleClients() {
  if (!g_wifiServer) return;
  extern void mvSetupHandleClient(WiFiClient& client);
  WiFiClient client = g_wifiServer->available();
  if (client && client.connected()) {
    mvSetupHandleClient(client);
  }
}

#else

static char g_wifiLastError[96] =
  "Firmware built without WiFi — Tools -> Board -> Arduino Opta WiFi";

bool mvWifiBegin(const MvDeviceConfig*) { return false; }

bool mvWifiApplyConfig(const MvDeviceConfig*) { return false; }

void mvWifiStop() {}

bool mvWifiApActive() { return false; }

IPAddress mvWifiApIp() { return IPAddress(0, 0, 0, 0); }

const char* mvWifiLastError() { return g_wifiLastError; }

void mvWifiHandleClients() {}

#endif

bool mvWifiCapable() {
#ifdef MV_HAS_WIFI
  return true;
#else
  return false;
#endif
}
