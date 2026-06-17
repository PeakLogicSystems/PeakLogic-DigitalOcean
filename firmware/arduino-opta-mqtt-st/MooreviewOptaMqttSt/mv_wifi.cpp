#include "mv_wifi.h"
#include "mv_config.h"

#ifdef MV_HAS_WIFI
#include <WiFi.h>
#include <WiFiServer.h>

static WiFiServer* g_wifiServer = nullptr;
static bool g_apActive = false;
static IPAddress g_apIp(192, 168, 4, 1);

bool mvWifiBegin(const MvDeviceConfig* cfg) {
  if (!cfg || !cfg->wifiApEnable) return false;
  IPAddress apIp(MV_WIFI_AP_IP);
  g_apIp = apIp;
  WiFi.config(apIp);
  const char* ssid = cfg->wifiApSsid[0] ? cfg->wifiApSsid : MV_WIFI_AP_SSID;
  const char* pass = cfg->wifiApPass[0] ? cfg->wifiApPass : MV_WIFI_AP_PASS;
  if (WiFi.beginAP(ssid, pass) != WL_AP_LISTENING) {
    g_apActive = false;
    return false;
  }
  if (!g_wifiServer) g_wifiServer = new WiFiServer(MV_WIFI_HTTP_PORT);
  g_wifiServer->begin();
  g_apActive = true;
  return true;
}

bool mvWifiApActive() { return g_apActive; }

IPAddress mvWifiApIp() { return g_apIp; }

void mvWifiHandleClients() {
  if (!g_wifiServer) return;
  extern void mvSetupHandleClient(WiFiClient& client);
  WiFiClient client = g_wifiServer->available();
  if (client && client.connected()) {
    mvSetupHandleClient(client);
  }
}
#else
bool mvWifiBegin(const MvDeviceConfig*) { return false; }
bool mvWifiApActive() { return false; }
IPAddress mvWifiApIp() { return IPAddress(0, 0, 0, 0); }
void mvWifiHandleClients() {}
#endif
