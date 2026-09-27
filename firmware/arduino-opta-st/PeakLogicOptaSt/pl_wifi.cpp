#include "pl_wifi.h"
#include "pl_config.h"

#ifdef PL_HAS_WIFI
#include <WiFi.h>
#include <WiFiServer.h>

static WiFiServer* g_wifiServer = nullptr;
static bool g_apActive = false;
static IPAddress g_apIp(192, 168, 4, 1);

bool plWifiBegin(const PlDeviceConfig* cfg) {
  if (!cfg || !cfg->wifiApEnable) return false;
  IPAddress apIp(PL_WIFI_AP_IP);
  g_apIp = apIp;
  WiFi.config(apIp);
  const char* ssid = cfg->wifiApSsid[0] ? cfg->wifiApSsid : PL_WIFI_AP_SSID;
  const char* pass = cfg->wifiApPass[0] ? cfg->wifiApPass : PL_WIFI_AP_PASS;
  if (WiFi.beginAP(ssid, pass) != WL_AP_LISTENING) {
    g_apActive = false;
    return false;
  }
  if (!g_wifiServer) g_wifiServer = new WiFiServer(PL_WIFI_HTTP_PORT);
  g_wifiServer->begin();
  g_apActive = true;
  return true;
}

bool plWifiApActive() { return g_apActive; }

IPAddress plWifiApIp() { return g_apIp; }

void plWifiHandleClients() {
  if (!g_wifiServer) return;
  extern void plSetupHandleClient(WiFiClient& client);
  WiFiClient client = g_wifiServer->available();
  if (client && client.connected()) {
    plSetupHandleClient(client);
  }
}
#else
bool plWifiBegin(const PlDeviceConfig*) { return false; }
bool plWifiApActive() { return false; }
IPAddress plWifiApIp() { return IPAddress(0, 0, 0, 0); }
void plWifiHandleClients() {}
#endif
