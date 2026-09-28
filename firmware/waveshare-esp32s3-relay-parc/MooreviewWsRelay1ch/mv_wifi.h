#pragma once

#include <WiFi.h>

#ifndef MV_WIFI_AP_IP
#define MV_WIFI_AP_IP 192, 168, 4, 1
#endif

static uint32_t g_mvLastWifiTry = 0;
static uint8_t g_mvLastWifiReason = 0;

static const char *mvWifiReasonText(uint8_t reason)
{
  switch (reason) {
    case 0: return "";
    case 2: return "wrong Wi-Fi password";
    case 15: return "wrong Wi-Fi password (handshake timeout)";
    case 36: return "security mismatch — use WPA2 or WPA2+WPA3 on the router";
    case 39: return "timeout — move closer or check 2.4 GHz";
    case 201: return "SSID not found — pick the 2.4 GHz name (not 5 GHz)";
    case 203: return "association failed — try WPA2";
    case 204: return "wrong Wi-Fi password";
    default: return "connect failed";
  }
}

static void mvWifiOnEvent(WiFiEvent_t event, WiFiEventInfo_t info)
{
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_START:
      Serial.println("[wifi] STA start");
      break;
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("[wifi] STA linked to AP");
      g_mvLastWifiReason = 0;
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("[wifi] home IP %s rssi=%d\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      g_mvLastWifiReason = 0;
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      g_mvLastWifiReason = info.wifi_sta_disconnected.reason;
      Serial.printf("[wifi] STA lost reason=%u (%s)\n",
                    (unsigned)g_mvLastWifiReason,
                    mvWifiReasonText(g_mvLastWifiReason));
      break;
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
      Serial.println("[wifi] client joined setup AP");
      break;
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
      Serial.println("[wifi] client left setup AP");
      break;
    default:
      break;
  }
}

static void mvWifiBeginApSta(const char *apSsid, const char *apPass)
{
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(WIFI_PS_NONE);
  WiFi.onEvent(mvWifiOnEvent);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IPAddress(MV_WIFI_AP_IP), IPAddress(MV_WIFI_AP_IP),
                    IPAddress(255, 255, 255, 0));
  const bool apOk = WiFi.softAP(apSsid, apPass, 6, 0, 4);
  Serial.printf("[wifi] AP %s %s → http://%s:8080/setup\n",
                apSsid, apOk ? "up" : "FAILED", WiFi.softAPIP().toString().c_str());
}

static bool mvWifiScanHasSsid(const char *ssid, String *resolvedOut = nullptr)
{
  if (!ssid || !ssid[0]) return false;
  const int n = WiFi.scanNetworks(false, true);
  Serial.printf("[wifi] scan found %d networks\n", n);
  String best;
  for (int i = 0; i < n; i++) {
    const String seen = WiFi.SSID(i);
    if (!seen.length()) continue;
    Serial.printf("[wifi]   %s rssi=%d ch=%d\n",
                  seen.c_str(), WiFi.RSSI(i), WiFi.channel(i));
    if (seen == ssid) {
      if (resolvedOut) *resolvedOut = seen;
      WiFi.scanDelete();
      return true;
    }
    if (seen.equalsIgnoreCase(ssid)) best = seen;
  }
  if (best.length()) {
    Serial.printf("[wifi] using scanned SSID \"%s\" for \"%s\" (case fix)\n",
                  best.c_str(), ssid);
    if (resolvedOut) *resolvedOut = best;
    WiFi.scanDelete();
    return true;
  }
  WiFi.scanDelete();
  return false;
}

static void mvWifiJoinSta(char *ssidBuf, size_t ssidLen, const char *pass)
{
  if (!ssidBuf || !ssidBuf[0]) return;
  String resolved;
  Serial.printf("[wifi] joining \"%s\" (must be 2.4 GHz SSID)\n", ssidBuf);
  if (!mvWifiScanHasSsid(ssidBuf, &resolved)) {
    Serial.printf("[wifi] WARNING: \"%s\" not seen in scan — check name / band\n", ssidBuf);
    g_mvLastWifiReason = 201;
  } else if (resolved.length() && resolved != ssidBuf) {
    strlcpy(ssidBuf, resolved.c_str(), ssidLen);
  }
  if (!pass || !pass[0]) {
    Serial.println("[wifi] no password saved — use setup page to enter Wi-Fi password");
    g_mvLastWifiReason = 204;
    return;
  }
  Serial.printf("[wifi] connecting to \"%s\"…\n", ssidBuf);
  WiFi.disconnect(false, false);
  delay(100);
  WiFi.begin(ssidBuf, pass ? pass : "");
  g_mvLastWifiTry = millis();
}

static void mvWifiMaintain(char *ssidBuf, size_t ssidLen, const char *pass)
{
  if (!ssidBuf || !ssidBuf[0]) return;
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - g_mvLastWifiTry < 15000) return;
  g_mvLastWifiTry = millis();
  Serial.printf("[wifi] retry \"%s\" status=%d reason=%u\n",
                ssidBuf, WiFi.status(), (unsigned)g_mvLastWifiReason);
  WiFi.disconnect(false, false);
  delay(50);
  WiFi.begin(ssidBuf, pass ? pass : "");
}

static const char *mvWifiStaStatus()
{
  switch (WiFi.status()) {
    case WL_CONNECTED: return "connected";
    case WL_IDLE_STATUS: return "idle";
    case WL_NO_SSID_AVAIL: return "no_ssid";
    case WL_SCAN_COMPLETED: return "scan_done";
    case WL_CONNECT_FAILED: return "connect_failed";
    case WL_CONNECTION_LOST: return "lost";
    case WL_DISCONNECTED: return "disconnected";
    default: return "unknown";
  }
}
