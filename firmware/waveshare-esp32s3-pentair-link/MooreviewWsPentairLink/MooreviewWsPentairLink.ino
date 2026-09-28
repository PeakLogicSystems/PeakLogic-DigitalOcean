/*
 * PeakLogic Pentair Link — Waveshare ESP32-S3-Relay-1CH-U
 *
 * Standalone IntelliFlo + IntelliChlor on onboard RS-485 (A+ / B−).
 * Local web UI + optional mqtt.peaklogic.io telemetry uplink.
 *
 * Board: ESP32S3 Dev Module · USB CDC On Boot Enabled
 * Libraries: ArduinoJson 7.x, PubSubClient
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "mv_board.h"
#include "mv_wifi.h"
#include "mv_pentair.h"
#include "mv_ui.h"
#include "mv_mqtt_ca.h"

static Preferences prefs;
static WebServer server(SETUP_HTTP_PORT);
static WiFiClient netPlain;
static WiFiClientSecure netTls;
static PubSubClient mqtt;

static char deviceId[40] = "ws_pentair_01";
static char staSsid[64] = "";
static char staPass[64] = "";
static char mqttHost[80] = MV_MQTT_SKETCH_BROKER_DEFAULT;
static uint16_t mqttPort = MV_MQTT_SKETCH_PORT_DEFAULT;
static bool mqttTls = MV_MQTT_SKETCH_TLS_DEFAULT;
static bool mqttInsecure = false;
static char mqttUser[40] = MV_MQTT_SKETCH_USER_DEFAULT;
static char mqttPass[MV_MQTT_PASSWORD_SIZE] = MV_MQTT_SKETCH_PASS_DEFAULT;
static char topicPrefix[32] = "peaklogic/v1";

static bool di1 = false;
static bool mqttUp = false;
static uint32_t lastTelMs = 0;
static uint32_t lastMqttTry = 0;
static const uint32_t REPORT_MS = 5000;

static void saveCfg()
{
  prefs.begin("mvpt1ch", false);
  prefs.putString("deviceId", deviceId);
  prefs.putString("staSsid", staSsid);
  prefs.putString("staPass", staPass);
  prefs.putString("mqttHost", mqttHost);
  prefs.putBool("mqttTls", mqttTls);
  prefs.putBool("mqttInsec", mqttInsecure);
  prefs.putUShort("mqttPort", mqttPort);
  prefs.putString("mqttUser", mqttUser);
  prefs.putString("mqttPass", mqttPass);
  prefs.putString("topicPfx", topicPrefix);
  prefs.putUChar("pumpAddr", gPumpAddr);
  prefs.putUShort("setRpm", gPtRpm);
  prefs.end();
}

static void loadCfg()
{
  prefs.begin("mvpt1ch", true);
  strlcpy(deviceId, prefs.getString("deviceId", deviceId).c_str(), sizeof(deviceId));
  strlcpy(staSsid, prefs.getString("staSsid", "").c_str(), sizeof(staSsid));
  strlcpy(staPass, prefs.getString("staPass", "").c_str(), sizeof(staPass));
  strlcpy(mqttHost, prefs.getString("mqttHost", MV_MQTT_SKETCH_BROKER_DEFAULT).c_str(), sizeof(mqttHost));
  mqttTls = prefs.getBool("mqttTls", MV_MQTT_SKETCH_TLS_DEFAULT);
  mqttInsecure = prefs.getBool("mqttInsec", false);
  mqttPort = prefs.getUShort("mqttPort", MV_MQTT_SKETCH_PORT_DEFAULT);
  strlcpy(mqttUser, prefs.getString("mqttUser", MV_MQTT_SKETCH_USER_DEFAULT).c_str(), sizeof(mqttUser));
  strlcpy(mqttPass, prefs.getString("mqttPass", MV_MQTT_SKETCH_PASS_DEFAULT).c_str(), sizeof(mqttPass));
  strlcpy(topicPrefix, prefs.getString("topicPfx", "peaklogic/v1").c_str(), sizeof(topicPrefix));
  gPumpAddr = (uint8_t)prefs.getUChar("pumpAddr", PENTAIR_ADDR_DEFAULT);
  gPtRpm = prefs.getUShort("setRpm", 2350);
  prefs.end();
  if (!mqttUser[0]) strlcpy(mqttUser, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(mqttUser));
  if (!mqttPass[0]) strlcpy(mqttPass, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(mqttPass));
}

static void attachMqttTransport()
{
  if (mqttTls) {
    netTls.stop();
    if (mqttInsecure) netTls.setInsecure();
    else netTls.setCACert(mv_mqtt_ca_pem);
    mqtt.setClient(netTls);
  } else {
    netPlain.stop();
    mqtt.setClient(netPlain);
  }
  if (mqtt.connected()) mqtt.disconnect();
}

static void topic(char *out, size_t n, const char *suffix)
{
  snprintf(out, n, "%s/%s/%s", topicPrefix, deviceId, suffix);
}

static void fillStatus(JsonDocument &doc)
{
  doc["deviceId"] = deviceId;
  doc["name"] = deviceId;
  doc["platform"] = MV_PLATFORM_ID;
  doc["firmwareVersion"] = MV_FIRMWARE_VERSION;
  doc["protocolVersion"] = MV_PROTOCOL_VERSION;
  doc["standalone"] = true;
  doc["pentairOnly"] = true;
  doc["nowMs"] = millis();
  const bool wifiOk = WiFi.status() == WL_CONNECTED;
  doc["wifi"] = wifiOk ? "connected" : "disconnected";
  doc["ip"] = wifiOk ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  doc["ap"] = SETUP_AP_SSID;
  doc["rssi"] = wifiOk ? WiFi.RSSI() : 0;
  doc["staSsid"] = staSsid;
  doc["mqttHost"] = mqttHost;
  doc["mqttPort"] = mqttPort;
  doc["mqttTls"] = mqttTls;
  doc["mqtt"] = mqttUp;
  doc["I1"] = di1;
  doc["pumpAddr"] = gPumpAddr;

  JsonObject pump = doc["pump"].to<JsonObject>();
  pump["ok"] = gPump.ok;
  pump["lastMs"] = gPump.lastMs;
  pump["running"] = gPump.running;
  pump["driveState"] = gPump.driveState;
  pump["drive"] = pumpDriveName(gPump.driveState);
  pump["mode"] = gPump.mode;
  pump["watts"] = gPump.watts;
  pump["rpm"] = gPump.rpm;
  pump["flow"] = gPump.flow;
  pump["setRpm"] = gPtRpm;
  pump["addr"] = gPumpAddr;
  pump["err"] = gPump.err;

  JsonObject chlor = doc["chlor"].to<JsonObject>();
  chlor["ok"] = gChlor.ok;
  chlor["lastMs"] = gChlor.lastMs;
  chlor["saltPpm"] = gChlor.saltPpm;
  chlor["waterTempF"] = gChlor.waterTempF;
  chlor["icError"] = gChlor.icError;
  chlor["icPercent"] = gChlor.icPercent;
  chlor["noFlow"] = gChlor.noFlow;
  chlor["lowSalt"] = gChlor.lowSalt;
  chlor["highSalt"] = gChlor.highSalt;
  chlor["cleanCell"] = gChlor.cleanCell;
  chlor["err"] = gChlor.err;
}

static void publishTelemetry()
{
  if (!mqtt.connected()) return;
  JsonDocument doc;
  fillStatus(doc);
  JsonObject rt = doc["runtime"].to<JsonObject>();
  rt["running"] = true;
  rt["deviceMode"] = "pentair_link";
  char t[128];
  topic(t, sizeof(t), "telemetry");
  String body;
  serializeJson(doc, body);
  mqtt.publish(t, body.c_str(), false);
  lastTelMs = millis();
}

static void mqttEnsure()
{
  if (!mqttHost[0] || WiFi.status() != WL_CONNECTED) {
    mqttUp = false;
    return;
  }
  if (mqtt.connected()) {
    mqttUp = true;
    return;
  }
  if (millis() - lastMqttTry < 8000) return;
  lastMqttTry = millis();
  mqtt.setServer(mqttHost, mqttPort);
  mqtt.setBufferSize(2048);
  char lwt[128];
  topic(lwt, sizeof(lwt), "online");
  const bool ok = mqttUser[0]
    ? mqtt.connect(deviceId, mqttUser, mqttPass, lwt, 1, true, "{\"online\":false}")
    : mqtt.connect(deviceId, lwt, 1, true, "{\"online\":false}");
  if (!ok) {
    mqttUp = false;
    Serial.printf("[mqtt] uplink fail rc=%d\n", mqtt.state());
    return;
  }
  mqttUp = true;
  mqtt.publish(lwt, "{\"online\":true}", true);
  publishTelemetry();
  Serial.printf("[mqtt] connected %s:%u as %s\n", mqttHost, mqttPort, deviceId);
}

static void handleIndex()
{
  server.send_P(200, "text/html", INDEX_HTML);
}

static void handleStatus()
{
  JsonDocument doc;
  fillStatus(doc);
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static void handlePump()
{
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  const char *op = doc["op"] | "";
  if (strcmp(op, "remote") == 0) pentairRequestRemote(doc["value"].as<int>() != 0);
  else if (strcmp(op, "run") == 0) pentairRequestRun();
  else if (strcmp(op, "stop") == 0) pentairRequestStop();
  else if (strcmp(op, "rpm") == 0) {
    pentairRequestRpm((uint16_t)doc["value"].as<int>());
    saveCfg();
  }
  server.send(200, "application/json", "{\"ok\":true}");
}

static void handleChlor()
{
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  const char *op = doc["op"] | "";
  if (strcmp(op, "percent") == 0) pentairRequestIcPercent((uint8_t)doc["value"].as<int>());
  else if (strcmp(op, "takeover") == 0) pentairRequestIcTakeover();
  server.send(200, "application/json", "{\"ok\":true}");
}

static void handleWifiScan()
{
  const int n = WiFi.scanNetworks(false, true);
  JsonDocument doc;
  JsonArray nets = doc["networks"].to<JsonArray>();
  for (int i = 0; i < n; i++) {
    JsonObject row = nets.add<JsonObject>();
    row["ssid"] = WiFi.SSID(i);
    row["rssi"] = WiFi.RSSI(i);
    row["chan"] = WiFi.channel(i);
  }
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static uint8_t parseHexAddr(const String &s)
{
  if (!s.length()) return PENTAIR_ADDR_DEFAULT;
  char *end = nullptr;
  unsigned long v = strtoul(s.c_str(), &end, 16);
  if (v > 0 && v <= 0xFF) return (uint8_t)v;
  return PENTAIR_ADDR_DEFAULT;
}

static void handleSetupPost()
{
  if (server.hasArg("deviceId")) strlcpy(deviceId, server.arg("deviceId").c_str(), sizeof(deviceId));
  if (server.hasArg("staSsid")) strlcpy(staSsid, server.arg("staSsid").c_str(), sizeof(staSsid));
  if (server.hasArg("staPass") && server.arg("staPass").length() > 0) {
    strlcpy(staPass, server.arg("staPass").c_str(), sizeof(staPass));
  }
  if (server.hasArg("pumpAddr")) gPumpAddr = parseHexAddr(server.arg("pumpAddr"));
  if (server.hasArg("mqttHost")) strlcpy(mqttHost, server.arg("mqttHost").c_str(), sizeof(mqttHost));
  mqttTls = server.hasArg("mqttTls");
  mqttInsecure = server.hasArg("mqttInsecure");
  if (server.hasArg("mqttPort")) mqttPort = (uint16_t)server.arg("mqttPort").toInt();
  if (!mqttPort) mqttPort = mqttTls ? 8883 : 1883;
  if (server.hasArg("mqttUser") && server.arg("mqttUser").length()) {
    strlcpy(mqttUser, server.arg("mqttUser").c_str(), sizeof(mqttUser));
  }
  if (server.hasArg("mqttPass") && server.arg("mqttPass").length()) {
    strlcpy(mqttPass, server.arg("mqttPass").c_str(), sizeof(mqttPass));
  }
  if (staSsid[0] && !staPass[0]) {
    server.send(400, "text/html",
                F("<p>Wi-Fi password required.</p><meta http-equiv=refresh content='2;url=/'>"));
    return;
  }
  saveCfg();
  attachMqttTransport();
  server.send(200, "text/html", F("<p>Saved.</p><meta http-equiv=refresh content='2;url=/'>"));
  if (staSsid[0]) mvWifiJoinSta(staSsid, sizeof(staSsid), staPass);
}

void setup()
{
  Serial.begin(115200);
  pinMode(DI1_GPIO, INPUT_PULLUP);
  loadCfg();
  pentairBegin();
  attachMqttTransport();

  mvWifiBeginApSta(SETUP_AP_SSID, SETUP_AP_PASS);
  if (staSsid[0]) mvWifiJoinSta(staSsid, sizeof(staSsid), staPass);

  server.on("/", HTTP_GET, handleIndex);
  server.on("/setup", HTTP_POST, handleSetupPost);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/pump", HTTP_POST, handlePump);
  server.on("/api/chlor", HTTP_POST, handleChlor);
  server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);
  server.begin();

  Serial.printf("[boot] %s %s → http://192.168.4.1:%d/\n",
                MV_PLATFORM_ID, MV_FIRMWARE_VERSION, SETUP_HTTP_PORT);
  Serial.println("[pentair] wire A+ / B− to IntelliFlo + IntelliChlor bus (9600 8N1)");
}

void loop()
{
  server.handleClient();
  di1 = digitalRead(DI1_GPIO) == LOW;
  mvWifiMaintain(staSsid, sizeof(staSsid), staPass);
  pentairPoll();
  mqttEnsure();
  if (mqtt.connected()) {
    mqtt.loop();
    if (millis() - lastTelMs >= REPORT_MS) publishTelemetry();
  } else {
    mqttUp = false;
  }
  delay(5);
}
