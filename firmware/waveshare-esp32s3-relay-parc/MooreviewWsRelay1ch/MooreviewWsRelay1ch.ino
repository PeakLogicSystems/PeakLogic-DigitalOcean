/*
 * PeakLogic MQTT Parc remote I/O — Waveshare ESP32-S3-Relay-1CH-U
 *
 * IOT-LINK / Cloud Studio runs pool ST; this board is a satellite:
 *   write_outputs { R1: true }  → onboard isolated relay
 *   telemetry I1                ← SH1.0 GPIO2 (flow switch / interlock)
 * Fail-safe: relay drops when MQTT is down (dose / heater / lights go OFF).
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
#include "mv_mqtt_ca.h"

static Preferences prefs;
static WebServer server(SETUP_HTTP_PORT);
static WiFiClient netPlain;
static WiFiClientSecure netTls;
static PubSubClient mqtt;

static char deviceId[40] = "ws_relay_01";
static char staSsid[64] = "";
static char staPass[64] = "";
static char mqttHost[80] = MV_MQTT_SKETCH_BROKER_DEFAULT;
static uint16_t mqttPort = MV_MQTT_SKETCH_PORT_DEFAULT;
static bool mqttTls = MV_MQTT_SKETCH_TLS_DEFAULT;
static bool mqttInsecure = false;
static char mqttUser[40] = MV_MQTT_SKETCH_USER_DEFAULT;
static char mqttPass[MV_MQTT_PASSWORD_SIZE] = MV_MQTT_SKETCH_PASS_DEFAULT;
static char topicPrefix[32] = "peaklogic/v1";

static bool relayOn = false;
static bool di1 = false;
static bool mqttUp = false;
static uint32_t lastCmdMs = 0;
static uint32_t lastTelMs = 0;
static uint32_t lastMqttTry = 0;
static uint32_t cycles = 0;
static const uint32_t REPORT_MS = 2000;

static void applyRelay(bool on)
{
  relayOn = on;
  digitalWrite(RELAY_GPIO, on ? HIGH : LOW);
}

static void failsafeOff()
{
  if (relayOn) {
    applyRelay(false);
  }
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
  prefs.begin("mvrelay", true);
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
  prefs.begin("mvrelay", false);
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

static void publishTelemetry()
{
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["name"] = deviceId;
  doc["platform"] = MV_PLATFORM_ID;
  doc["firmwareVersion"] = MV_FIRMWARE_VERSION;
  doc["protocolVersion"] = MV_PROTOCOL_VERSION;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  JsonObject rt = doc["runtime"].to<JsonObject>();
  rt["running"] = true;
  rt["deviceMode"] = "remote_io";
  rt["scanMs"] = 100;
  JsonArray tags = doc["tags"].to<JsonArray>();
  JsonObject r1 = tags.add<JsonObject>();
  r1["id"] = "R1";
  r1["type"] = "BOOL";
  r1["role"] = "output";
  r1["value"] = relayOn;
  JsonObject i1 = tags.add<JsonObject>();
  i1["id"] = "I1";
  i1["type"] = "BOOL";
  i1["role"] = "input";
  i1["value"] = di1;
  char t[128];
  topic(t, sizeof(t), "telemetry");
  String body;
  serializeJson(doc, body);
  mqtt.publish(t, body.c_str(), false);
  lastTelMs = millis();
  cycles++;
}

static void sendCmdResponse(const char *id, bool ok, uint8_t written, const char *err)
{
  JsonDocument doc;
  doc["id"] = id ? id : "";
  doc["ok"] = ok;
  if (err) doc["error"] = err;
  JsonObject body = doc["body"].to<JsonObject>();
  body["written"] = written;
  char t[136];
  topic(t, sizeof(t), "cmd/response");
  String out;
  serializeJson(doc, out);
  mqtt.publish(t, out.c_str(), false);
}

static uint8_t handleWriteOutputs(JsonVariantConst body)
{
  uint8_t n = 0;
  JsonObjectConst outputs = body["outputs"].as<JsonObjectConst>();
  if (!outputs.isNull()) {
    for (JsonPairConst kv : outputs) {
      const char *id = kv.key().c_str();
      if (!id || !id[0]) continue;
      if (strcmp(id, "R1") == 0 || strcmp(id, "DOSE_ACID") == 0 || strcmp(id, "DOSE_BASE") == 0
          || strcmp(id, "DOSE_CL") == 0 || strcmp(id, "DOSE_SALT") == 0
          || strncmp(id, "LIGHT_Z", 7) == 0 || strcmp(id, "PUMP_RUN_CMD") == 0
          || strcmp(id, "HP_RUN_CMD") == 0 || strcmp(id, "BW_VALVE_BW") == 0
          || strcmp(id, "SPA_JETS") == 0) {
        applyRelay(kv.value().as<bool>() || kv.value().as<int>() != 0);
        n++;
      }
    }
  } else {
    JsonArrayConst rows = body["tags"].as<JsonArrayConst>();
    for (JsonObjectConst row : rows) {
      const char *id = row["id"] | "";
      if (strcmp(id, "R1") == 0) {
        applyRelay(row["value"].as<bool>());
        n++;
      }
    }
  }
  lastCmdMs = millis();
  publishTelemetry();
  return n;
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
  JsonVariantConst body = doc["body"];
  if (strcmp(op, "write_outputs") == 0) {
    uint8_t n = handleWriteOutputs(body);
    sendCmdResponse(id, true, n, nullptr);
    return;
  }
  if (strcmp(op, "runtime_status") == 0 || strcmp(op, "ping") == 0) {
    JsonDocument res;
    res["id"] = id;
    res["ok"] = true;
    res["body"]["deviceMode"] = "remote_io";
    res["body"]["running"] = true;
    res["body"]["platform"] = MV_PLATFORM_ID;
    res["body"]["firmwareVersion"] = MV_FIRMWARE_VERSION;
    char t[136];
    topic(t, sizeof(t), "cmd/response");
    String out;
    serializeJson(res, out);
    mqtt.publish(t, out.c_str(), false);
    return;
  }
  if (strcmp(op, "set_device_mode") == 0) {
    JsonDocument res;
    res["id"] = id;
    res["ok"] = true;
    res["body"]["deviceMode"] = "remote_io";
    char t[136];
    topic(t, sizeof(t), "cmd/response");
    String out;
    serializeJson(res, out);
    mqtt.publish(t, out.c_str(), false);
  }
}

static void mqttEnsure()
{
  if (WiFi.status() != WL_CONNECTED) {
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
    Serial.printf("[mqtt] connect fail rc=%d\n", mqtt.state());
    return;
  }
  mqttUp = true;
  lastCmdMs = millis();
  char cmd[128];
  topic(cmd, sizeof(cmd), "cmd");
  mqtt.subscribe(cmd, 1);
  publishOnline(true);
  publishTelemetry();
  Serial.printf("[mqtt] connected %s:%u as %s\n", mqttHost, mqttPort, deviceId);
}

static void handleSetupGet()
{
  String html = F("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>PeakLogic Pool &amp; Spa</title><style>body{font-family:sans-serif;max-width:36rem;margin:1.5rem auto;padding:0 1rem;color:#0f172a}"
    "h1{font-size:1.35rem}p.hint{color:#475569;font-size:.95rem}label{display:block;margin:.7rem 0 .2rem;font-weight:600}"
    "input{width:100%;padding:.5rem;box-sizing:border-box}button{margin-top:1.1rem;padding:.6rem 1.1rem;background:#4f46e5;color:#fff;border:0;border-radius:6px}"
    "fieldset{border:1px solid #e2e8f0;border-radius:8px;margin:1rem 0;padding:.6rem 1rem 1rem}legend{padding:0 .4rem;color:#4f46e5}</style></head><body>"
    "<h1>PeakLogic Pool &amp; Spa</h1>"
    "<p class=hint>You are on the setup network <b>PeakLogic-Relay1CH</b>. Enter your <b>home Wi-Fi</b> so this module can reach the pool hub on your LAN. Relay opens if Wi-Fi or MQTT drops (fail-safe OFF).</p>"
    "<form method=post action=/setup>");
  html += "<fieldset><legend>This module</legend><label>Device name (deviceId)</label><input name=deviceId value='";
  html += deviceId;
  html += "' placeholder='ws_relay_spa'></fieldset>";
  html += "<fieldset><legend>Home Wi-Fi</legend><label>Home Wi-Fi name (SSID)</label><input name=staSsid value='";
  html += staSsid;
  html += "' autocomplete=off><label>Home Wi-Fi password</label><input name=staPass type=password placeholder='";
  html += staPass[0] ? "leave blank to keep saved password" : "required — enter your Wi-Fi password";
  html += "' autocomplete=new-password>";
  if (staSsid[0] && !staPass[0]) {
    html += "<p class=hint style='color:#b45309'><b>Wi-Fi password not saved.</b> Type it above and tap Save.</p>";
  }
  html += "<p class=hint><button type=button onclick='scanWifi()' style='padding:.4rem .8rem;background:#1b2538;color:#fff;border:0;border-radius:6px'>Scan nearby networks</button> "
    "Pick your <b>2.4 GHz</b> SSID (often ends in -2G / _2.4 / IoT). Not the 5 GHz name.</p><ul id=scanList style='font-size:.9rem;color:#475569;padding-left:1.2rem'></ul>";
  html += "<script>async function scanWifi(){const ul=document.getElementById('scanList');ul.innerHTML='Scanning…';"
    "try{const r=await fetch('/api/wifi/scan');const j=await r.json();ul.innerHTML='';"
    "if(!j.networks||!j.networks.length){ul.innerHTML='<li>No networks seen — check antenna</li>';return;}"
    "j.networks.forEach(n=>{const li=document.createElement('li');"
    "li.innerHTML='<a href=# onclick=\"document.querySelector('[name=staSsid]').value=\\''+n.ssid.replace(/'/g,\"\\\\'\")+'\\';return false\">'+n.ssid+'</a> · ch '+n.chan+' · '+n.rssi+' dBm';"
    "ul.appendChild(li);});}catch(e){ul.innerHTML='Scan failed';}}</script></fieldset>";
  html += "<fieldset><legend>Cloud MQTT (Opta Parc)</legend>"
    "<p class=hint>Default: <code>mqtt.peaklogic.io:8883</code>, user <code>peaklogic</code>. Blank password keeps firmware default.</p>"
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
  html += "'></fieldset><button type=submit>Save &amp; join home Wi-Fi</button></form>";
  html += "<h2>Wi-Fi status</h2><p>Setup AP <b>";
  html += SETUP_AP_SSID;
  html += "</b> (always on) · AP IP ";
  html += WiFi.softAPIP().toString();
  html += "<br>Home: <b>";
  html += mvWifiStaStatus();
  html += "</b>";
  if (WiFi.status() == WL_CONNECTED) {
    html += " · ";
    html += WiFi.localIP().toString();
    html += " · RSSI ";
    html += String(WiFi.RSSI());
  } else if (staSsid[0]) {
    html += " · trying \"";
    html += staSsid;
    html += "\"";
    if (g_mvLastWifiReason) {
      html += " — <b>";
      html += mvWifiReasonText(g_mvLastWifiReason);
      html += "</b> (code ";
      html += String(g_mvLastWifiReason);
      html += ")";
    } else {
      html += " — use Scan to pick the 2.4 GHz SSID";
    }
  }
  html += "<br><span class=hint>-U model: screw the SMA antenna on. Metal box kills RF.</span></p>";
  html += "<p>Relay GPIO";
  html += String(RELAY_GPIO);
  html += " · DI GPIO";
  html += String(DI1_GPIO);
  html += " · R1=";
  html += relayOn ? "ON" : "OFF";
  html += " · I1=";
  html += di1 ? "1" : "0";
  html += " · MQTT=";
  html += mqttUp ? "up" : "down";
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
  if (staSsid[0] && !staPass[0]) {
    server.send(400, "text/html",
                F("<p>Wi-Fi password required on first save.</p><meta http-equiv=refresh content='2;url=/setup'>"));
    return;
  }
  saveCfg();
  attachMqttTransport();
  server.send(200, "text/html", F("<p>Saved. Joining home Wi-Fi…</p><meta http-equiv=refresh content='3;url=/setup'>"));
  mvWifiJoinSta(staSsid, sizeof(staSsid), staPass);
  saveCfg();
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
  doc["wifi"] = mvWifiStaStatus();
  doc["apIp"] = WiFi.softAPIP().toString();
  doc["apSsid"] = SETUP_AP_SSID;
  doc["staSsid"] = staSsid;
  doc["wifiReason"] = g_mvLastWifiReason;
  doc["wifiReasonText"] = mvWifiReasonText(g_mvLastWifiReason);
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  doc["mqtt"] = mqttUp;
  doc["mqttTls"] = mqttTls;
  doc["mqttPort"] = mqttPort;
  doc["R1"] = relayOn;
  doc["I1"] = di1;
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void setup()
{
  Serial.begin(115200);
  pinMode(RELAY_GPIO, OUTPUT);
  pinMode(DI1_GPIO, INPUT_PULLUP);
  applyRelay(false);
  loadCfg();
  attachMqttTransport();

  mvWifiBeginApSta(SETUP_AP_SSID, SETUP_AP_PASS);
  if (staSsid[0]) {
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
  di1 = digitalRead(DI1_GPIO) == LOW;
  mvWifiMaintain(staSsid, sizeof(staSsid), staPass);
  mqttEnsure();
  if (mqtt.connected()) {
    mqtt.loop();
    if (millis() - lastTelMs >= REPORT_MS) publishTelemetry();
  } else {
    mqttUp = false;
    failsafeOff();
  }
  delay(10);
}
