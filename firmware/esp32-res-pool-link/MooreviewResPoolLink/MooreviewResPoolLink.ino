/*
 * PeakLogic Res-Pool-Link — standalone residential pool & spa
 *
 * Home Wi-Fi. Local web menus. No IOT-LINK required.
 *
 *   UART1 9600  IntelliFlo + IntelliChlor (shared Pentair pair)
 *   UART2 4800  DFRobot SEN0711 + SEN0712 (separate Modbus pair)
 *   R1–R4       filter inlet / outlet / backwash waste / spare
 *
 * AP: PeakLogic-ResPool / peaklogic → http://192.168.4.1:8080/
 * Libraries: ArduinoJson 7.x, PubSubClient (optional MQTT uplink only)
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "mv_board.h"
#include "mv_valves.h"
#include "mv_pentair.h"
#include "mv_chem.h"
#include "mv_ui.h"
#include "mv_mqtt_ca.h"

static Preferences prefs;
static WebServer server(SETUP_HTTP_PORT);
static WiFiClient netPlain;
static WiFiClientSecure netTls;
static PubSubClient mqtt;

static char deviceId[40] = "res_pool_link";
static char staSsid[64] = "";
static char staPass[64] = "";
static char mqttHost[80] = MV_MQTT_SKETCH_BROKER_DEFAULT;
static uint16_t mqttPort = MV_MQTT_SKETCH_PORT_DEFAULT;
static bool mqttTls = MV_MQTT_SKETCH_TLS_DEFAULT;
static bool mqttInsecure = false;
static char mqttUser[40] = MV_MQTT_SKETCH_USER_DEFAULT;
static char mqttPass[MV_MQTT_PASSWORD_SIZE] = MV_MQTT_SKETCH_PASS_DEFAULT;
static char topicPrefix[32] = "peaklogic/v1";

static bool valveOn[VALVE_COUNT] = { true, true, false, false };
static bool di1 = false;
static bool mqttUp = false;
static uint8_t bwMode = BW_MODE_FILTER;
static uint8_t bwSeq = BW_SEQ_IDLE;
static uint32_t bwPhaseStart = 0;
static uint32_t bwMs = BW_MS_DEFAULT;
static uint32_t rinseMs = RINSE_MS_DEFAULT;
static uint32_t lastTelMs = 0;
static uint32_t lastMqttTry = 0;
static const uint32_t REPORT_MS = 5000;

static void writeRelay(uint8_t i, bool on)
{
  if (i >= VALVE_COUNT) return;
  valveOn[i] = on;
#if RELAY_ACTIVE_HIGH
  digitalWrite(VALVE_GPIO[i], on ? HIGH : LOW);
#else
  digitalWrite(VALVE_GPIO[i], on ? LOW : HIGH);
#endif
}

static void applyValves(bool inlet, bool outlet, bool waste, bool spare)
{
  writeRelay(VALVE_INLET, inlet);
  writeRelay(VALVE_OUTLET, outlet);
  writeRelay(VALVE_WASTE, waste);
  writeRelay(VALVE_SPARE, spare);
}

static void applyMode(uint8_t mode)
{
  bwMode = mode;
  switch (mode) {
    case BW_MODE_BACKWASH:
      applyValves(true, false, true, false);
      break;
    case BW_MODE_RINSE:
      applyValves(true, true, true, false);
      break;
    case BW_MODE_FILTER:
    default:
      bwMode = BW_MODE_FILTER;
      applyValves(true, true, false, false);
      break;
  }
}

static void bwStop()
{
  bwSeq = BW_SEQ_IDLE;
  applyMode(BW_MODE_FILTER);
}

static void bwStart()
{
  bwSeq = BW_SEQ_BACKWASH;
  bwPhaseStart = millis();
  applyMode(BW_MODE_BACKWASH);
}

static void bwTick()
{
  if (bwSeq == BW_SEQ_IDLE) return;
  const uint32_t elapsed = millis() - bwPhaseStart;
  if (bwSeq == BW_SEQ_BACKWASH && elapsed >= bwMs) {
    bwSeq = BW_SEQ_RINSE;
    bwPhaseStart = millis();
    applyMode(BW_MODE_RINSE);
  } else if (bwSeq == BW_SEQ_RINSE && elapsed >= rinseMs) {
    bwStop();
  }
}

static uint32_t bwRemainSec()
{
  if (bwSeq == BW_SEQ_IDLE) return 0;
  const uint32_t total = (bwSeq == BW_SEQ_BACKWASH) ? bwMs : rinseMs;
  const uint32_t elapsed = millis() - bwPhaseStart;
  if (elapsed >= total) return 0;
  return (total - elapsed) / 1000UL;
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

static void loadCfg()
{
  prefs.begin("mvvalves", true);
  strlcpy(deviceId, prefs.getString("deviceId", deviceId).c_str(), sizeof(deviceId));
  strlcpy(staSsid, prefs.getString("staSsid", "").c_str(), sizeof(staSsid));
  strlcpy(staPass, prefs.getString("staPass", "").c_str(), sizeof(staPass));
  strlcpy(mqttHost, prefs.getString("mqttHost", MV_MQTT_SKETCH_BROKER_DEFAULT).c_str(), sizeof(mqttHost));
  mqttTls = prefs.getBool("mqttTls", true);
  mqttInsecure = prefs.getBool("mqttInsec", false);
  mqttPort = prefs.getUShort("mqttPort", mqttTls ? 8883 : 1883);
  if (mqttTls && mqttPort == 1883) mqttPort = 8883;
  strlcpy(mqttUser, prefs.getString("mqttUser", MV_MQTT_SKETCH_USER_DEFAULT).c_str(), sizeof(mqttUser));
  strlcpy(mqttPass, prefs.getString("mqttPass", MV_MQTT_SKETCH_PASS_DEFAULT).c_str(), sizeof(mqttPass));
  if (!mqttHost[0]) strlcpy(mqttHost, MV_MQTT_SKETCH_BROKER_DEFAULT, sizeof(mqttHost));
  if (!mqttUser[0]) strlcpy(mqttUser, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(mqttUser));
  if (!mqttPass[0]) strlcpy(mqttPass, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(mqttPass));
  strlcpy(topicPrefix, prefs.getString("topicPfx", "peaklogic/v1").c_str(), sizeof(topicPrefix));
  bwMs = prefs.getULong("bwMs", BW_MS_DEFAULT);
  rinseMs = prefs.getULong("rinseMs", RINSE_MS_DEFAULT);
  gPumpAddr = (uint8_t)prefs.getUChar("pumpAddr", PENTAIR_ADDR_DEFAULT);
  gPhSlave = (uint8_t)prefs.getUChar("phSlave", CHEM_PH_SLAVE_DEFAULT);
  gClSlave = (uint8_t)prefs.getUChar("clSlave", CHEM_CL_SLAVE_DEFAULT);
  gPtRpm = prefs.getUShort("setRpm", 2350);
  prefs.end();
}

static void saveCfg()
{
  prefs.begin("mvvalves", false);
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
  prefs.putULong("bwMs", bwMs);
  prefs.putULong("rinseMs", rinseMs);
  prefs.putUChar("pumpAddr", gPumpAddr);
  prefs.putUChar("phSlave", gPhSlave);
  prefs.putUChar("clSlave", gClSlave);
  prefs.putUShort("setRpm", gPtRpm);
  prefs.end();
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
  doc["nowMs"] = millis();
  const bool wifiOk = WiFi.status() == WL_CONNECTED;
  doc["wifi"] = wifiOk ? "connected" : "ap";
  doc["ip"] = wifiOk ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  doc["ap"] = SETUP_AP_SSID;
  doc["rssi"] = wifiOk ? WiFi.RSSI() : 0;
  doc["staSsid"] = staSsid;
  doc["mqttHost"] = mqttHost;
  doc["mqttPort"] = mqttPort;
  doc["mqttTls"] = mqttTls;
  doc["mqttInsecure"] = mqttInsecure;
  doc["mqttUser"] = mqttUser;
  doc["mqtt"] = mqttUp;
  doc["I1"] = di1;

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

  JsonObject chem = doc["chem"].to<JsonObject>();
  chem["phOk"] = gChem.phOk;
  chem["clOk"] = gChem.clOk;
  chem["ph"] = gChem.ph;
  chem["nh3"] = gChem.nh3;
  chem["tempC"] = gChem.tempC;
  chem["clPpm"] = gChem.clPpm;
  chem["err"] = gChem.err;

  JsonObject bw = doc["backwash"].to<JsonObject>();
  bw["mode"] = bwModeName(bwMode);
  bw["seq"] = bwSeq == BW_SEQ_BACKWASH ? "backwash" : (bwSeq == BW_SEQ_RINSE ? "rinse" : "idle");
  bw["remainSec"] = bwRemainSec();
  bw["bwSec"] = bwMs / 1000UL;
  bw["rinseSec"] = rinseMs / 1000UL;

  JsonArray valves = doc["valves"].to<JsonArray>();
  for (uint8_t i = 0; i < VALVE_COUNT; i++) {
    JsonObject row = valves.add<JsonObject>();
    row["id"] = VALVE_CH_ID[i];
    row["tag"] = VALVE_TAG_ID[i];
    row["label"] = VALVE_LABEL[i];
    row["gpio"] = VALVE_GPIO[i];
    row["on"] = valveOn[i];
  }
}

static void publishTelemetry()
{
  if (!mqtt.connected()) return;
  JsonDocument doc;
  fillStatus(doc);
  JsonObject rt = doc["runtime"].to<JsonObject>();
  rt["running"] = true;
  rt["deviceMode"] = "standalone";
  char t[128];
  topic(t, sizeof(t), "telemetry");
  String body;
  serializeJson(doc, body);
  mqtt.publish(t, body.c_str(), false);
  lastTelMs = millis();
}

static void onMqtt(char *topicIn, byte *payload, unsigned int len)
{
  char expect[128];
  topic(expect, sizeof(expect), "cmd");
  if (strcmp(topicIn, expect) != 0) return;
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;
  const char *op = doc["op"] | "";
  if (strcmp(op, "write_outputs") == 0) {
    const char *mode = doc["body"]["mode"] | "";
    if (!mode[0] && doc["body"]["outputs"]["POOL_BW_STA"].is<int>()) {
      const int sta = doc["body"]["outputs"]["POOL_BW_STA"].as<int>();
      if (sta == 1) bwStart();
      else bwStop();
    }
  }
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
  mqtt.setCallback(onMqtt);
  mqtt.setBufferSize(2048);
  char lwt[128];
  topic(lwt, sizeof(lwt), "online");
  const bool ok = mqttUser[0]
    ? mqtt.connect(deviceId, mqttUser, mqttPass, lwt, 1, true, "{\"online\":false}")
    : mqtt.connect(deviceId, lwt, 1, true, "{\"online\":false}");
  if (!ok) {
    mqttUp = false;
    Serial.printf("[mqtt] optional uplink fail rc=%d\n", mqtt.state());
    return;
  }
  mqttUp = true;
  char cmd[128];
  topic(cmd, sizeof(cmd), "cmd");
  mqtt.subscribe(cmd, 1);
  mqtt.publish(lwt, "{\"online\":true}", true);
  publishTelemetry();
  Serial.printf("[mqtt] optional uplink %s:%u\n", mqttHost, mqttPort);
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

static void handleBackwash()
{
  JsonDocument doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  const char *op = doc["op"] | "";
  if (doc["bwSec"].is<int>()) {
    int s = doc["bwSec"].as<int>();
    if (s < 10) s = 10;
    if (s > 1800) s = 1800;
    bwMs = (uint32_t)s * 1000UL;
  }
  if (doc["rinseSec"].is<int>()) {
    int s = doc["rinseSec"].as<int>();
    if (s < 5) s = 5;
    if (s > 600) s = 600;
    rinseMs = (uint32_t)s * 1000UL;
  }
  if (strcmp(op, "start") == 0) bwStart();
  else if (strcmp(op, "stop") == 0) bwStop();
  else if (strcmp(op, "times") == 0) saveCfg();
  if (strcmp(op, "times") != 0 && (doc["bwSec"].is<int>() || doc["rinseSec"].is<int>())) saveCfg();
  server.send(200, "application/json", "{\"ok\":true}");
}

static void handleSetupPost()
{
  if (server.hasArg("deviceId")) strlcpy(deviceId, server.arg("deviceId").c_str(), sizeof(deviceId));
  if (server.hasArg("staSsid")) strlcpy(staSsid, server.arg("staSsid").c_str(), sizeof(staSsid));
  if (server.hasArg("staPass")) strlcpy(staPass, server.arg("staPass").c_str(), sizeof(staPass));
  if (server.hasArg("mqttHost")) strlcpy(mqttHost, server.arg("mqttHost").c_str(), sizeof(mqttHost));
  mqttTls = server.hasArg("mqttTls");
  mqttInsecure = server.hasArg("mqttInsecure");
  if (server.hasArg("mqttPort")) mqttPort = (uint16_t)server.arg("mqttPort").toInt();
  if (!mqttPort) mqttPort = mqttTls ? 8883 : 1883;
  if (mqttTls && mqttPort == 1883) mqttPort = 8883;
  if (!mqttTls && mqttPort == 8883) mqttPort = 1883;
  if (server.hasArg("mqttUser") && server.arg("mqttUser").length()) {
    strlcpy(mqttUser, server.arg("mqttUser").c_str(), sizeof(mqttUser));
  }
  if (server.hasArg("mqttPass") && server.arg("mqttPass").length()) {
    strlcpy(mqttPass, server.arg("mqttPass").c_str(), sizeof(mqttPass));
  }
  saveCfg();
  attachMqttTransport();
  server.send(200, "text/html", F("<p>Saved. Reconnecting…</p><meta http-equiv=refresh content='2;url=/'>"));
  if (staSsid[0]) WiFi.begin(staSsid, staPass);
}

void setup()
{
  Serial.begin(115200);
  for (uint8_t i = 0; i < VALVE_COUNT; i++) pinMode(VALVE_GPIO[i], OUTPUT);
  pinMode(DI1_GPIO, INPUT_PULLUP);
  bwStop();
  loadCfg();
  pentairBegin();
  chemBegin();
  attachMqttTransport();

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(SETUP_AP_SSID, SETUP_AP_PASS);
  if (staSsid[0]) WiFi.begin(staSsid, staPass);

  server.on("/", HTTP_GET, handleIndex);
  server.on("/setup", HTTP_GET, handleIndex);
  server.on("/setup", HTTP_POST, handleSetupPost);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/pump", HTTP_POST, handlePump);
  server.on("/api/chlor", HTTP_POST, handleChlor);
  server.on("/api/backwash", HTTP_POST, handleBackwash);
  server.begin();
  Serial.printf("[boot] %s %s standalone AP %s → http://192.168.4.1:%d/\n",
                MV_PLATFORM_ID, MV_FIRMWARE_VERSION, SETUP_AP_SSID, SETUP_HTTP_PORT);
}

void loop()
{
  server.handleClient();
  di1 = digitalRead(DI1_GPIO) == LOW;
  bwTick();
  pentairPoll();
  chemPoll();
  mqttEnsure();
  if (mqtt.connected()) {
    mqtt.loop();
    if (millis() - lastTelMs >= REPORT_MS) publishTelemetry();
  } else {
    mqttUp = false;
  }
  delay(5);
}
