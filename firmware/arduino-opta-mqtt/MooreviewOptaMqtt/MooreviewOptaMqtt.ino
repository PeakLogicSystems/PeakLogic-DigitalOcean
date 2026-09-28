/***********************************************************************
 * Arduino Opta — PeakLogic Parc MQTT (peaklogic/v1)
 * Based on baselinedigankgexpansionwMQTT.ino
 ***********************************************************************/

#include "OptaBlue.h"
#include <Ethernet.h>
#include <PubSubClient.h>
#include <Arduino_JSON.h>

using namespace Opta;

// ── MQTT / PeakLogic Parc ──────────────────────────────────────
const char* mqtt_server   = "192.168.1.100";
const int   mqtt_port     = 1883;
const char* device_id     = "opta_full_io_01";
const char* topic_prefix  = "peaklogic/v1";

const unsigned long LOOP_MS    = 100;
const unsigned long REPORT_MS  = 180000;  // 3 min Parc telemetry (adjust)

String topicTelemetry() { return String(topic_prefix) + "/" + device_id + "/telemetry"; }
String topicOnline()    { return String(topic_prefix) + "/" + device_id + "/online"; }
String topicCmd()       { return String(topic_prefix) + "/" + device_id + "/cmd"; }
String topicCmdRes()    { return String(topic_prefix) + "/" + device_id + "/cmd/response"; }
String topicConfig()    { return String(topic_prefix) + "/" + device_id + "/config"; }

EthernetClient ethClient;
PubSubClient mqtt(ethClient);
unsigned long lastReport = 0;
bool pauseTelemetry = false;

DigitalMechExpansion  digMech;
DigitalStSolidExpansion digSolid;
bool hasDigitalExp = false;
AnalogExpansion anaExp;
bool hasAnalogExp = false;

bool diBuiltIn[8] = {false};
bool doBuiltIn[4] = {false};
bool diDigital[16] = {false};
bool doDigital[8]  = {false};
float voltage[2] = {0.0, 0.0};
float current_mA[4] = {0.0, 0.0, 0.0, 0.0};
float rtd[2] = {-999, -999};
float scaled_mA[4] = {0.0};

float scaleInput(float mA, float low = 0.0f, float high = 100.0f) {
  if (mA < 3.8f) return low;
  if (mA > 20.5f) return high;
  return low + (mA - 4.0f) * (high - low) / 16.0f;
}

struct AnalogAlarm {
  const char* name;
  float warn_low_start = 12.5f, warn_low_end = 25.0f;
  float warn_high_start = 75.0f, warn_high_end = 87.5f;
  float hyst = 2.0f;
  uint16_t debounce_sec = 3;
};
AnalogAlarm alarms[8] = {
  {"RTD1"}, {"RTD2"}, {"mA_AI3"}, {"mA_AI4"}, {"mA_AI5"}, {"mA_AI6"},
  {"AO1"}, {"AO2"}
};
struct ActiveAlarm { bool low = false, warn = false, high = false; unsigned long lowStart = 0, warnStart = 0, highStart = 0; };
ActiveAlarm active[8];

void processAlarm(int idx, float value) {
  unsigned long now = millis();
  AnalogAlarm& a = alarms[idx];
  ActiveAlarm& s = active[idx];
  if (value < a.warn_low_start) {
    if (s.lowStart == 0) s.lowStart = now;
    if (now - s.lowStart >= (unsigned long)a.debounce_sec * 1000) s.low = true;
  } else if (value > a.warn_low_start + a.hyst) { s.low = false; s.lowStart = 0; }
  if (value > a.warn_high_end) {
    if (s.highStart == 0) s.highStart = now;
    if (now - s.highStart >= (unsigned long)a.debounce_sec * 1000) s.high = true;
  } else if (value < a.warn_high_end - a.hyst) { s.high = false; s.highStart = 0; }
  bool inWarn = (value >= a.warn_low_start && value < a.warn_low_end) ||
                (value > a.warn_high_start && value <= a.warn_high_end);
  if (inWarn && !s.low && !s.high) {
    if (s.warnStart == 0) s.warnStart = now;
    if (now - s.warnStart >= (unsigned long)a.debounce_sec * 1000) s.warn = true;
  } else { s.warn = false; s.warnStart = 0; }
}

void setRelay(int r, bool state) {
  if (r >= 0 && r < 4) {
    digitalWrite(r, state ? HIGH : LOW);
    doBuiltIn[r] = state;
  } else if (hasDigitalExp && r >= 4 && r < 12) {
    int expR = r - 4;
    if (digMech) digMech.digitalWrite(expR, state ? HIGH : LOW);
    else if (digSolid) digSolid.digitalWrite(expR, state ? HIGH : LOW);
    doDigital[expR] = state;
  }
}

void publishCmdResponse(const char* id, bool ok, const char* errMsg = nullptr) {
  JSONVar res;
  res["id"] = id;
  res["ok"] = ok;
  if (errMsg) res["error"] = errMsg;
  mqtt.publish(topicCmdRes().c_str(), JSON.stringify(res).c_str(), false);
}

void mqttCallback(char* topic, byte* payload, unsigned int len) {
  String t(topic);
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];

  if (t == topicConfig()) {
    JSONVar cfg = JSON.parse(msg);
    if (cfg.hasOwnProperty("pauseTelemetry")) pauseTelemetry = (bool)cfg["pauseTelemetry"];
    return;
  }

  if (t != topicCmd()) return;
  JSONVar cmd = JSON.parse(msg);
  if (!cmd.hasOwnProperty("id") || !cmd.hasOwnProperty("op")) return;
  String id = (const char*)cmd["id"];
  String op = (const char*)cmd["op"];
  JSONVar body = cmd.hasOwnProperty("body") ? cmd["body"] : JSONVar();

  if (op == "set_relay" && body.hasOwnProperty("relay")) {
    setRelay((int)body["relay"] - 1, (bool)body["state"]);
    publishCmdResponse(id.c_str(), true);
    return;
  }
  if (op == "reset_alarms") {
    for (int i = 0; i < 8; i++) {
      active[i].low = active[i].warn = active[i].high = false;
      active[i].lowStart = active[i].warnStart = active[i].highStart = 0;
    }
    publishCmdResponse(id.c_str(), true);
    return;
  }
  publishCmdResponse(id.c_str(), false, "unknown op");
}

String buildTelemetryJson() {
  JSONVar doc;
  doc["deviceId"] = device_id;
  doc["name"] = "Arduino Opta";
  doc["platform"] = "arduino-opta";
  doc["reportIntervalSec"] = (int)(REPORT_MS / 1000);

  JSONVar tags;
  int ti = 0;
  auto addBool = [&](const char* id, bool v, const char* role) {
    JSONVar t;
    t["id"] = id;
    t["type"] = "BOOL";
    t["role"] = role;
    t["value"] = v;
    t["quality"] = "GOOD";
    tags[ti++] = t;
  };
  auto addReal = [&](const char* id, float v) {
    JSONVar t;
    t["id"] = id;
    t["type"] = "REAL";
    t["role"] = "input";
    t["value"] = v;
    t["quality"] = "GOOD";
    tags[ti++] = t;
  };

  for (int i = 0; i < 8; i++) addBool((String("DI") + (i + 1)).c_str(), diBuiltIn[i], "input");
  for (int i = 0; i < 4; i++) addBool((String("Q") + (i + 1)).c_str(), doBuiltIn[i], "output");
  if (hasDigitalExp) {
    for (int i = 0; i < 16; i++) addBool((String("DIX") + (i + 1)).c_str(), diDigital[i], "input");
    for (int i = 0; i < 8; i++) addBool((String("QX") + (i + 1)).c_str(), doDigital[i], "output");
  }
  if (hasAnalogExp) {
    addReal("V1", voltage[0]);
    addReal("V2", voltage[1]);
    for (int i = 0; i < 4; i++) {
      addReal((String("mA_AI") + (i + 3)).c_str(), current_mA[i]);
      addReal((String("scaled_AI") + (i + 3)).c_str(), scaled_mA[i]);
    }
    addReal("RTD1", rtd[0]);
    addReal("RTD2", rtd[1]);
  }
  for (int i = 0; i < 8; i++) {
    if (active[i].low)  addBool((String(alarms[i].name) + "_LOW").c_str(), true, "input");
    if (active[i].warn) addBool((String(alarms[i].name) + "_WARN").c_str(), true, "input");
    if (active[i].high) addBool((String(alarms[i].name) + "_HIGH").c_str(), true, "input");
  }
  doc["tags"] = tags;

  JSONVar rt;
  rt["running"] = true;
  rt["firmware"] = "opta-mqtt";
  doc["runtime"] = rt;

  return JSON.stringify(doc);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  for (int i = 0; i < 8; i++) pinMode(A0 + i, INPUT);
  for (int i = 0; i < 4; i++) { pinMode(i, OUTPUT); digitalWrite(i, LOW); }

  Ethernet.begin();
  mqtt.setServer(mqtt_server, mqtt_port);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(4096);

  OptaController.begin();
  delay(1000);

  digMech = OptaController.getExpansion(0);
  if (digMech && (digMech.getType() == EXPANSION_OPTA_DIGITAL_MEC || digMech.getType() == EXPANSION_OPTA_DIGITAL_STS)) {
    hasDigitalExp = true;
  } else {
    digSolid = OptaController.getExpansion(0);
    if (digSolid && digSolid.getType() == EXPANSION_OPTA_DIGITAL_STS) hasDigitalExp = true;
  }
  for (int i = 0; i < 2; i++) {
    anaExp = OptaController.getExpansion(i);
    if (anaExp && anaExp.getType() == EXPANSION_OPTA_ANALOG) { hasAnalogExp = true; break; }
  }
  if (hasAnalogExp) {
    for (int ch = 0; ch < 2; ch++) AnalogExpansion::beginChannelAsRtd(OptaController, anaExp.getIndex(), ch, false, 0.8f);
    for (int ch = 2; ch < 6; ch++) AnalogExpansion::beginChannelAsAdc(OptaController, anaExp.getIndex(), ch, OA_CURRENT_ADC, false, false, false, 0);
    AnalogExpansion::beginChannelAsDac(OptaController, anaExp.getIndex(), 6, OA_VOLTAGE_DAC, false, true, OA_SLEW_RATE_0);
    AnalogExpansion::beginChannelAsDac(OptaController, anaExp.getIndex(), 7, OA_CURRENT_DAC, false, true, OA_SLEW_RATE_0);
  }
}

void loop() {
  static unsigned long lastLoop = 0;
  unsigned long now = millis();

  if (!mqtt.connected()) {
    String cid = String("mv-opta-") + device_id;
    if (mqtt.connect(cid.c_str(), topicOnline().c_str(), 1, true, "{\"online\":false}")) {
      mqtt.subscribe(topicCmd().c_str(), 1);
      mqtt.subscribe(topicConfig().c_str(), 1);
      mqtt.publish(topicOnline().c_str(), "{\"online\":true}", true);
    }
  }
  mqtt.loop();

  if (now - lastLoop < LOOP_MS) return;
  lastLoop = now;

  for (int i = 0; i < 8; i++) {
    diBuiltIn[i] = digitalRead(A0 + i);
    digitalWrite(i % 4, diBuiltIn[i] ? HIGH : LOW);
    doBuiltIn[i % 4] = diBuiltIn[i];
  }
  if (hasDigitalExp) {
    if (digMech) digMech.updateDigitalInputs();
    else if (digSolid) digSolid.updateDigitalInputs();
    for (int i = 0; i < 16; i++) {
      if (digMech) diDigital[i] = (digMech.digitalRead(i) == HIGH);
      else if (digSolid) diDigital[i] = (digSolid.digitalRead(i) == HIGH);
    }
    for (int i = 0; i < 8; i++) {
      doDigital[i] = diDigital[i];
      if (digMech) digMech.digitalWrite(i, doDigital[i] ? HIGH : LOW);
      else if (digSolid) digSolid.digitalWrite(i, doDigital[i] ? HIGH : LOW);
    }
  }
  if (hasAnalogExp) {
    OptaController.update();
    voltage[0] = anaExp.pinVoltage(0, false);
    voltage[1] = anaExp.pinVoltage(1, false);
    for (int i = 0; i < 4; i++) {
      current_mA[i] = anaExp.pinCurrent(2 + i);
      scaled_mA[i] = scaleInput(current_mA[i]);
      processAlarm(2 + i, scaled_mA[i]);
    }
    rtd[0] = anaExp.pinRtd(0);
    rtd[1] = anaExp.pinRtd(1);
    processAlarm(0, rtd[0]);
    processAlarm(1, rtd[1]);
    anaExp.pinVoltage(6, voltage[0], true);
    anaExp.pinCurrent(7, current_mA[0], true);
  }

  if (!pauseTelemetry && now - lastReport >= REPORT_MS) {
    lastReport = now;
    String json = buildTelemetryJson();
    mqtt.publish(topicTelemetry().c_str(), json.c_str(), false);
    Serial.println("peaklogic telemetry published");
  }
}
