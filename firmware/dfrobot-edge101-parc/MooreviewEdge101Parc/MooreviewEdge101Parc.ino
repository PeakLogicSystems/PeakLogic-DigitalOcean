/*
 * PeakLogic MQTT Parc — DFRobot Edge101 (DFR0886)
 *
 * Industrial ESP32 controller: Ethernet (IP101) WAN, Wi-Fi fallback,
 * isolated RS485 Modbus master for DFRobot SEN0711 + SEN0712.
 *
 * Board: DFRobot Edge101 IOT Controller (or ESP32 Dev Module + mv_board.h pins)
 * Libraries: ArduinoJson 7.x, PubSubClient
 */
#include <WiFi.h>
#include <NetworkClient.h>
#include <NetworkClientSecure.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "mv_board.h"
#include "mv_wifi.h"
#include "mv_eth.h"
#include "mv_mqtt_ca.h"
#include "mv_chem.h"

static Preferences prefs;
static WebServer server(SETUP_HTTP_PORT);
static NetworkClient netPlain;
static NetworkClientSecure netTls;
static PubSubClient mqtt;

static char deviceId[40] = "edge101_01";
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
static bool di2 = false;
static bool mqttUp = false;
static uint32_t lastTelMs = 0;
static uint32_t lastMqttTry = 0;
static uint32_t lastLedMs = 0;
static bool ledOn = false;
static uint32_t cycles = 0;
static const uint32_t REPORT_MS = 3000;

static void ledWrite(bool on)
{
  ledOn = on;
  digitalWrite(LED_GPIO, on ? LOW : HIGH);
}

static String wanIp()
{
  if (mvEthReady()) return ETH.localIP().toString();
  if (WiFi.status() == WL_CONNECTED) return WiFi.localIP().toString();
  return "";
}

static const char *wanKind()
{
  if (mvEthReady()) return "eth";
  if (WiFi.status() == WL_CONNECTED) return "wifi";
  return "none";
}

static bool wanReady()
{
  return mvEthReady() || WiFi.status() == WL_CONNECTED;
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

static void saveCfg();

static void loadCfg()
{
  prefs.begin("mvedge101", true);
  strlcpy(deviceId, prefs.getString("deviceId", deviceId).c_str(), sizeof(deviceId));
  strlcpy(staSsid, prefs.getString("staSsid", "").c_str(), sizeof(staSsid));
  strlcpy(staPass, prefs.getString("staPass", "").c_str(), sizeof(staPass));
  strlcpy(mqttHost, prefs.getString("mqttHost", MV_MQTT_SKETCH_BROKER_DEFAULT).c_str(), sizeof(mqttHost));
  mqttTls = prefs.getBool("mqttTls", MV_MQTT_SKETCH_TLS_DEFAULT);
  mqttInsecure = prefs.getBool("mqttInsec", false);
  mqttPort = prefs.getUShort("mqttPort", mqttTls ? MV_MQTT_SKETCH_PORT_DEFAULT : 1883);
  if (mqttTls && mqttPort == 1883) mqttPort = MV_MQTT_SKETCH_PORT_DEFAULT;
  strlcpy(mqttUser, prefs.getString("mqttUser", MV_MQTT_SKETCH_USER_DEFAULT).c_str(), sizeof(mqttUser));
  strlcpy(mqttPass, prefs.getString("mqttPass", MV_MQTT_SKETCH_PASS_DEFAULT).c_str(), sizeof(mqttPass));
  strlcpy(topicPrefix, prefs.getString("topicPfx", "peaklogic/v1").c_str(), sizeof(topicPrefix));
  prefs.end();

  bool migrated = false;
  if (!mqttHost[0] || !strcmp(mqttHost, "192.168.1.1")) {
    strlcpy(mqttHost, MV_MQTT_SKETCH_BROKER_DEFAULT, sizeof(mqttHost));
    mqttTls = MV_MQTT_SKETCH_TLS_DEFAULT;
    mqttPort = MV_MQTT_SKETCH_PORT_DEFAULT;
    mqttInsecure = false;
    migrated = true;
  }
  if (!mqttUser[0]) {
    strlcpy(mqttUser, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(mqttUser));
    migrated = true;
  }
  if (!mqttPass[0]) {
    strlcpy(mqttPass, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(mqttPass));
    migrated = true;
  }
  if (migrated) saveCfg();
}

static void saveCfg()
{
  prefs.begin("mvedge101", false);
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
  prefs.end();
}

static void topic(char *out, size_t n, const char *suffix)
{
  snprintf(out, n, "%s/%s/%s", topicPrefix, deviceId, suffix);
}

static void publishOnline(bool on)
{
  char t[128];
  topic(t, sizeof(t), "online");
  mqtt.publish(t, on ? "{\"online\":true}" : "{\"online\":false}", true);
}

static void addBoolTag(JsonArray tags, const char *id, const char *role, bool value)
{
  JsonObject row = tags.add<JsonObject>();
  row["id"] = id;
  row["type"] = "BOOL";
  row["role"] = role;
  row["value"] = value;
}

static void addRealTag(JsonArray tags, const char *id, float value)
{
  JsonObject row = tags.add<JsonObject>();
  row["id"] = id;
  row["type"] = "REAL";
  row["role"] = "input";
  row["value"] = value;
}

static void publishTelemetry()
{
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["name"] = deviceId;
  doc["platform"] = MV_PLATFORM_ID;
  doc["firmwareVersion"] = MV_FIRMWARE_VERSION;
  doc["protocolVersion"] = MV_PROTOCOL_VERSION;
  doc["ip"] = wanIp();
  doc["wan"] = wanKind();
  if (WiFi.status() == WL_CONNECTED) doc["rssi"] = WiFi.RSSI();
  JsonObject rt = doc["runtime"].to<JsonObject>();
  rt["running"] = true;
  rt["deviceMode"] = "remote_io";
  rt["scanMs"] = 100;
  JsonArray tags = doc["tags"].to<JsonArray>();
  addBoolTag(tags, "I1", "input", di1);
  addBoolTag(tags, "I2", "input", di2);
  addBoolTag(tags, "ETH_LINK", "input", mvEthReady());
  addRealTag(tags, "PH_AI", gChem.ph);
  addRealTag(tags, "ORP_AI", gChem.clPpm);
  addRealTag(tags, "WATER_TEMP_C", gChem.tempC);
  addRealTag(tags, "NH3_MG_L", gChem.nh3);
  addBoolTag(tags, "CHEM_OK", "input", gChem.phOk && gChem.clOk);
  if (gChem.err[0]) doc["chemError"] = gChem.err;
  char t[128];
  topic(t, sizeof(t), "telemetry");
  String body;
  serializeJson(doc, body);
  mqtt.publish(t, body.c_str(), false);
  lastTelMs = millis();
  cycles++;
}

static void sendCmdResponse(const char *id, bool ok, const char *err)
{
  JsonDocument doc;
  doc["id"] = id ? id : "";
  doc["ok"] = ok;
  if (err) doc["error"] = err;
  doc["body"]["written"] = 0;
  char t[136];
  topic(t, sizeof(t), "cmd/response");
  String out;
  serializeJson(doc, out);
  mqtt.publish(t, out.c_str(), false);
}

static void onMqtt(char *topicIn, byte *payload, unsigned int len)
{
  char expect[128];
  topic(expect, sizeof(expect), "cmd");
  if (strcmp(topicIn, expect) != 0) return;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, len);
  if (err) return;
  const char *id = doc["id"] | "";
  const char *op = doc["op"] | "";
  if (strcmp(op, "write_outputs") == 0) {
    sendCmdResponse(id, true, nullptr);
    publishTelemetry();
    return;
  }
  if (strcmp(op, "runtime_status") == 0 || strcmp(op, "ping") == 0
      || strcmp(op, "set_device_mode") == 0) {
    JsonDocument res;
    res["id"] = id;
    res["ok"] = true;
    res["body"]["deviceMode"] = "remote_io";
    res["body"]["running"] = true;
    res["body"]["platform"] = MV_PLATFORM_ID;
    res["body"]["firmwareVersion"] = MV_FIRMWARE_VERSION;
    res["body"]["wan"] = wanKind();
    char t[136];
    topic(t, sizeof(t), "cmd/response");
    String out;
    serializeJson(res, out);
    mqtt.publish(t, out.c_str(), false);
  }
}

static void mqttEnsure()
{
  if (!wanReady()) {
    mqttUp = false;
    return;
  }
  if (mqtt.connected()) {
    mqttUp = true;
    return;
  }
  if (millis() - lastMqttTry < 4000) return;
  lastMqttTry = millis();
  mqtt.setServer(mqttHost, mqttPort);
  mqtt.setCallback(onMqtt);
  mqtt.setBufferSize(2048);
  char lwt[128];
  topic(lwt, sizeof(lwt), "online");
  bool ok = mqttUser[0]
    ? mqtt.connect(deviceId, mqttUser, mqttPass, lwt, 1, true, "{\"online\":false}")
    : mqtt.connect(deviceId, lwt, 1, true, "{\"online\":false}");
  if (!ok) {
    mqttUp = false;
    Serial.printf("[mqtt] connect fail rc=%d wan=%s\n", mqtt.state(), wanKind());
    return;
  }
  mqttUp = true;
  char cmd[128];
  topic(cmd, sizeof(cmd), "cmd");
  mqtt.subscribe(cmd, 1);
  publishOnline(true);
  publishTelemetry();
  Serial.printf("[mqtt] connected %s:%u as %s via %s\n", mqttHost, mqttPort, deviceId, wanKind());
}

static void handleSetupGet()
{
  String html = F("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>PeakLogic Edge101</title><style>body{font-family:sans-serif;max-width:36rem;margin:1.5rem auto;padding:0 1rem;color:#0f172a}"
    "h1{font-size:1.35rem}p.hint{color:#475569;font-size:.95rem}label{display:block;margin:.7rem 0 .2rem;font-weight:600}"
    "input{width:100%;padding:.5rem;box-sizing:border-box}button{margin-top:1.1rem;padding:.6rem 1.1rem;background:#0f766e;color:#fff;border:0;border-radius:6px}"
    "fieldset{border:1px solid #e2e8f0;border-radius:8px;margin:1rem 0;padding:.6rem 1rem 1rem}legend{padding:0 .4rem;color:#0f766e}</style></head><body>"
    "<h1>PeakLogic Edge101</h1>"
    "<p class=hint>DFRobot <b>DFR0886</b>. Ethernet is the preferred WAN. Setup AP stays up for commissioning. Isolated RS-485 polls SEN0711 (slave 1) + SEN0712 (slave 2) at 4800 8N1.</p>"
    "<form method=post action=/setup>");
  html += "<fieldset><legend>This controller</legend><label>Device name (deviceId)</label><input name=deviceId value='";
  html += deviceId;
  html += "' placeholder='edge101_01'></fieldset>";
  html += "<fieldset><legend>Wi-Fi fallback (optional if Ethernet is up)</legend><label>2.4 GHz SSID</label><input name=staSsid value='";
  html += staSsid;
  html += "' autocomplete=off><label>Wi-Fi password</label><input name=staPass type=password placeholder='";
  html += staPass[0] ? "leave blank to keep saved password" : "optional when using Ethernet";
  html += "' autocomplete=new-password>";
  html += "<p class=hint><button type=button onclick='scanWifi()' style='padding:.4rem .8rem;background:#1b2538;color:#fff;border:0;border-radius:6px'>Scan nearby networks</button></p>"
    "<ul id=scanList style='font-size:.9rem;color:#475569;padding-left:1.2rem'></ul>";
  html += "<script>async function scanWifi(){const ul=document.getElementById('scanList');ul.innerHTML='Scanning…';"
    "try{const r=await fetch('/api/wifi/scan');const j=await r.json();ul.innerHTML='';"
    "if(!j.networks||!j.networks.length){ul.innerHTML='<li>No networks seen</li>';return;}"
    "j.networks.forEach(n=>{const li=document.createElement('li');"
    "li.innerHTML='<a href=# onclick=\"document.querySelector(\\'[name=staSsid]\\').value=\\''+n.ssid.replace(/'/g,\"\\\\'\")+'\\';return false\">'+n.ssid+'</a> · ch '+n.chan+' · '+n.rssi+' dBm';"
    "ul.appendChild(li);});}catch(e){ul.innerHTML='Scan failed';}}</script></fieldset>";
  html += "<fieldset><legend>Cloud MQTT (Parc)</legend>"
    "<p class=hint>Default: <code>mqtt.peaklogic.io:8883</code>, user <code>peaklogic</code>.</p>"
    "<label>Broker host</label><input name=mqttHost value='";
  html += mqttHost;
  html += "' placeholder='mqtt.peaklogic.io'><label>MQTT port</label><input name=mqttPort type=number value='";
  html += String(mqttPort);
  html += "'><label><input type=checkbox name=mqttTls value=1";
  html += mqttTls ? " checked" : "";
  html += "> TLS (mqtts, port 8883)</label><label><input type=checkbox name=mqttInsecure value=1";
  html += mqttInsecure ? " checked" : "";
  html += "> Allow self-signed cert (local LAN only)</label><label>MQTT user</label><input name=mqttUser value='";
  html += mqttUser;
  html += "'><label>MQTT password</label><input name=mqttPass type=password placeholder='";
  html += mqttPass[0] ? "leave blank to keep saved password" : "uses firmware default if blank";
  html += "'></fieldset><button type=submit>Save</button></form>";
  html += "<h2>Status</h2><p>Setup AP <b>";
  html += SETUP_AP_SSID;
  html += "</b> · AP IP ";
  html += WiFi.softAPIP().toString();
  html += "<br>WAN <b>";
  html += wanKind();
  html += "</b> ";
  html += wanIp();
  html += "<br>Ethernet ";
  html += mvEthReady() ? "up" : (g_ethUp ? "link / no IP" : "down");
  html += " · Wi-Fi <b>";
  html += mvWifiStaStatus();
  html += "</b>";
  if (WiFi.status() == WL_CONNECTED) {
    html += " · ";
    html += WiFi.localIP().toString();
  }
  html += "<br>I1(button)=";
  html += di1 ? "1" : "0";
  html += " · I2=";
  html += di2 ? "1" : "0";
  html += " · pH=";
  html += String(gChem.ph, 2);
  html += " · Cl=";
  html += String(gChem.clPpm, 2);
  html += " · MQTT=";
  html += mqttUp ? "up" : "down";
  if (gChem.err[0]) {
    html += "<br><span class=hint>";
    html += gChem.err;
    html += "</span>";
  }
  html += "</p></body></html>";
  server.send(200, "text/html", html);
}

static void handleSetupPost()
{
  if (server.hasArg("deviceId")) strlcpy(deviceId, server.arg("deviceId").c_str(), sizeof(deviceId));
  if (server.hasArg("staSsid")) strlcpy(staSsid, server.arg("staSsid").c_str(), sizeof(staSsid));
  if (server.hasArg("staPass") && server.arg("staPass").length() > 0) {
    strlcpy(staPass, server.arg("staPass").c_str(), sizeof(staPass));
  }
  if (server.hasArg("mqttHost")) strlcpy(mqttHost, server.arg("mqttHost").c_str(), sizeof(mqttHost));
  mqttTls = server.hasArg("mqttTls");
  mqttInsecure = server.hasArg("mqttInsecure");
  if (server.hasArg("mqttPort")) mqttPort = (uint16_t)server.arg("mqttPort").toInt();
  if (!mqttPort) mqttPort = mqttTls ? 8883 : 1883;
  if (mqttTls && mqttPort == 1883) mqttPort = 8883;
  if (!mqttTls && mqttPort == 8883) mqttPort = 1883;
  if (server.hasArg("mqttUser")) strlcpy(mqttUser, server.arg("mqttUser").c_str(), sizeof(mqttUser));
  if (server.hasArg("mqttPass") && server.arg("mqttPass").length() > 0) {
    strlcpy(mqttPass, server.arg("mqttPass").c_str(), sizeof(mqttPass));
  }
  saveCfg();
  attachMqttTransport();
  server.send(200, "text/html", F("<p>Saved.</p><meta http-equiv=refresh content='2;url=/setup'>"));
  if (staSsid[0] && staPass[0]) {
    mvWifiJoinSta(staSsid, sizeof(staSsid), staPass);
    saveCfg();
  }
}

static void handleWifiScan()
{
  const int n = WiFi.scanNetworks(false, true);
  JsonDocument doc;
  doc["count"] = n;
  doc["staStatus"] = mvWifiStaStatus();
  doc["lastReason"] = g_mvLastWifiReason;
  doc["lastReasonText"] = mvWifiReasonText(g_mvLastWifiReason);
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

static void handleStatus()
{
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["platform"] = MV_PLATFORM_ID;
  doc["firmwareVersion"] = MV_FIRMWARE_VERSION;
  doc["wan"] = wanKind();
  doc["ip"] = wanIp();
  doc["eth"] = mvEthReady();
  doc["wifi"] = mvWifiStaStatus();
  doc["apIp"] = WiFi.softAPIP().toString();
  doc["apSsid"] = SETUP_AP_SSID;
  doc["staSsid"] = staSsid;
  doc["mqtt"] = mqttUp;
  doc["mqttTls"] = mqttTls;
  doc["mqttPort"] = mqttPort;
  doc["I1"] = di1;
  doc["I2"] = di2;
  doc["PH_AI"] = gChem.ph;
  doc["ORP_AI"] = gChem.clPpm;
  doc["WATER_TEMP_C"] = gChem.tempC;
  doc["NH3_MG_L"] = gChem.nh3;
  doc["CHEM_OK"] = gChem.phOk && gChem.clOk;
  if (gChem.err[0]) doc["chemError"] = gChem.err;
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static void serviceLed()
{
  const uint32_t now = millis();
  uint32_t period = 1200;
  if (mqttUp) period = 400;
  else if (wanReady()) period = 800;
  if (now - lastLedMs < period) return;
  lastLedMs = now;
  ledWrite(!ledOn);
}

void setup()
{
  Serial.begin(115200);
  pinMode(LED_GPIO, OUTPUT);
  pinMode(BTN_GPIO, INPUT);
  pinMode(DI2_GPIO, INPUT);
  ledWrite(false);
  loadCfg();
  attachMqttTransport();
  chemBegin();

  mvWifiBeginApSta(SETUP_AP_SSID, SETUP_AP_PASS);
  mvEthBegin();
  if (staSsid[0] && staPass[0]) {
    mvWifiJoinSta(staSsid, sizeof(staSsid), staPass);
    saveCfg();
  }

  server.on("/api/wifi/scan", HTTP_GET, handleWifiScan);
  server.on("/setup", HTTP_GET, handleSetupGet);
  server.on("/setup", HTTP_POST, handleSetupPost);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/", HTTP_GET, handleSetupGet);
  server.begin();
  Serial.printf("[boot] %s %s AP %s → http://192.168.4.1:%d/setup\n",
                MV_PLATFORM_ID, MV_FIRMWARE_VERSION, SETUP_AP_SSID, SETUP_HTTP_PORT);
}

void loop()
{
  server.handleClient();
  di1 = digitalRead(BTN_GPIO) == LOW;
  di2 = digitalRead(DI2_GPIO) == LOW;
  chemPoll();
  if (staSsid[0]) mvWifiMaintain(staSsid, sizeof(staSsid), staPass);
  mqttEnsure();
  if (mqtt.connected()) {
    mqtt.loop();
    if (millis() - lastTelMs >= REPORT_MS) publishTelemetry();
  } else {
    mqttUp = false;
  }
  serviceLed();
  delay(10);
}
