#include "pl_setup_web.h"
#include "pl_config.h"
#include "pl_store.h"
#include "pl_expansions.h"
#include "pl_wifi.h"
#include <ArduinoJson.h>
#include <Ethernet.h>
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && PL_HAS_WEBSERVER
#include <EthernetWebServer.h>
extern EthernetWebServer server;
#endif

static const char PL_SETUP_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PeakLogic Opta Setup</title>
<style>
body{font-family:system-ui,sans-serif;margin:1rem;background:#f1f5f9;color:#0f172a}
h1{font-size:1.25rem}h2{font-size:1rem;margin-top:1.25rem}
.card{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:1rem;margin:.75rem 0}
label{display:block;margin:.35rem 0;font-size:.9rem}
input,select{width:100%;max-width:20rem;padding:.35rem .5rem}
.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
button{padding:.45rem .9rem;border:1px solid #64748b;border-radius:6px;background:#e2e8f0;cursor:pointer}
button.primary{background:#2563eb;color:#fff;border-color:#2563eb}
.muted{color:#64748b;font-size:.85rem}
#msg{margin-top:.5rem;font-size:.9rem}
</style></head><body>
<h1>PeakLogic Opta Setup</h1>
<p class="muted">Configure Ethernet and expansion modules. Connect via WiFi AP or open <code>/setup</code> on Ethernet.</p>
<div class="card"><h2>Ethernet</h2>
<label><input type="checkbox" id="ethDhcp"> Use DHCP</label>
<div id="ethStatic">
<label>IP <input id="ethIp" placeholder="192.168.1.50"></label>
<label>Gateway <input id="ethGw" placeholder="192.168.1.1"></label>
<label>Mask <input id="ethMask" placeholder="255.255.255.0"></label>
<label>DNS <input id="ethDns" placeholder="8.8.8.8"></label>
</div>
<p class="muted" id="ethStatus"></p></div>
<div class="card"><h2>WiFi setup AP</h2>
<label><input type="checkbox" id="wifiAp"> Enable AP for local setup</label>
<label>SSID <input id="wifiSsid"></label>
<label>Password <input id="wifiPass" type="password"></label>
<p class="muted" id="wifiStatus"></p></div>
<div class="card"><h2>Expansion modules (AFX00005 / AFX00007)</h2>
<p class="muted">Slot 1 is closest to the Opta base. AFX00005 = D1608E (16 DI + 8 relays). AFX00007 = A0602 (8 analog ch + 4 PWM).</p>
<div id="expSlots"></div>
<button type="button" id="btnScan">Scan expansions</button>
<pre id="expDetected" class="muted"></pre></div>
<div class="row">
<button class="primary" id="btnSave">Save settings</button>
<button id="btnReboot">Reboot device</button>
</div>
<p id="msg"></p>
<script>
const expNames=['Auto detect','Disabled','AFX00005 D1608E','AFX00007 A0602'];
function ip4(a){return (a||[]).join('.')}
function parseIp(s){return s.split('.').map(x=>+x||0)}
function slotHtml(i){
  return `<label>Slot ${i+1} <select id="exp${i}">${expNames.map((n,j)=>`<option value="${j}">${n}</option>`).join('')}</select></label>`;
}
document.getElementById('expSlots').innerHTML=[0,1,2,3,4].map(slotHtml).join('');
async function loadCfg(){
  const r=await fetch('/api/setup/config'); const c=await r.json();
  ethDhcp.checked=!!c.ethUseDhcp; wifiAp.checked=!!c.wifiApEnable;
  ethIp.value=ip4(c.ethIp); ethGw.value=ip4(c.ethGw); ethMask.value=ip4(c.ethMask); ethDns.value=ip4(c.ethDns);
  wifiSsid.value=c.wifiApSsid||''; wifiPass.value=c.wifiApPass||'';
  (c.expSlotType||[]).forEach((t,i)=>{const el=document.getElementById('exp'+i); if(el) el.value=t;});
  ethStatus.textContent='Ethernet: '+(c.ethIpCurrent||'?')+(c.ethUseDhcp?' (DHCP)':' (static)');
  wifiStatus.textContent=c.wifiApActive?('AP active '+c.wifiApIp):'AP off';
  expDetected.textContent=(c.detected||[]).map(d=>`Slot ${d.slot+1}: ${d.label} (${d.type})`).join('\n')||'No expansions detected';
  ethStatic.style.opacity=ethDhcp.checked?'.5':'1';
}
ethDhcp.onchange=()=>{ethStatic.style.opacity=ethDhcp.checked?'.5':'1'};
btnScan.onclick=async()=>{await fetch('/api/setup/scan',{method:'POST'}); loadCfg();};
btnSave.onclick=async()=>{
  const body={ethUseDhcp:ethDhcp.checked?1:0,wifiApEnable:wifiAp.checked?1:0,
    wifiApSsid:wifiSsid.value,wifiApPass:wifiPass.value,
    ethIp:parseIp(ethIp.value),ethGw:parseIp(ethGw.value),ethMask:parseIp(ethMask.value),ethDns:parseIp(ethDns.value),
    expSlotType:[0,1,2,3,4].map(i=>+document.getElementById('exp'+i).value)};
  const r=await fetch('/api/setup/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json(); msg.textContent=j.ok?'Saved. Reboot to apply Ethernet changes.':(j.error||'Save failed');
  if(j.ok) loadCfg();
};
btnReboot.onclick=async()=>{await fetch('/api/setup/reboot',{method:'POST'}); msg.textContent='Rebooting…';};
loadCfg();
</script></body></html>)HTML";

static void ipToArr(IPAddress ip, uint8_t out[4]) {
  for (uint8_t i = 0; i < 4; i++) out[i] = ip[i];
}

static void arrToIp(const uint8_t in[4], IPAddress& ip) {
  ip = IPAddress(in[0], in[1], in[2], in[3]);
}

bool plEthBegin(const PlDeviceConfig* cfg, byte* mac) {
  if (!cfg || !mac) return false;
  if (cfg->ethUseDhcp) return Ethernet.begin(mac) != 0;
  IPAddress ip, dns, gw, mask;
  arrToIp(cfg->ethIp, ip);
  arrToIp(cfg->ethDns, dns);
  arrToIp(cfg->ethGw, gw);
  arrToIp(cfg->ethMask, mask);
  return Ethernet.begin(mac, ip, dns, gw, mask) != 0;
}

static void fillConfigJson(JsonObject root) {
  const PlDeviceConfig* cfg = plStoreActive();
  root["ethUseDhcp"] = cfg->ethUseDhcp;
  root["wifiApEnable"] = cfg->wifiApEnable;
  root["wifiApSsid"] = cfg->wifiApSsid;
  root["wifiApPass"] = cfg->wifiApPass;
  JsonArray ethIp = root.createNestedArray("ethIp");
  JsonArray ethGw = root.createNestedArray("ethGw");
  JsonArray ethMask = root.createNestedArray("ethMask");
  JsonArray ethDns = root.createNestedArray("ethDns");
  for (uint8_t i = 0; i < 4; i++) {
    ethIp.add(cfg->ethIp[i]);
    ethGw.add(cfg->ethGw[i]);
    ethMask.add(cfg->ethMask[i]);
    ethDns.add(cfg->ethDns[i]);
  }
  JsonArray slots = root.createNestedArray("expSlotType");
  for (uint8_t i = 0; i < PL_EXP_SLOTS; i++) slots.add(cfg->expSlotType[i]);
  IPAddress cur = Ethernet.localIP();
  root["ethIpCurrent"] = cur.toString();
  root["wifiApActive"] = plWifiApActive();
  root["wifiApIp"] = plWifiApIp().toString();
  JsonArray det = root.createNestedArray("detected");
  for (uint8_t i = 0; i < plExpDetectedCount(); i++) {
    PlExpDetected d;
    if (!plExpGetDetected(i, &d)) continue;
    JsonObject o = det.createNestedObject();
    o["slot"] = d.slot;
    o["type"] = d.type;
    o["label"] = d.label;
    o["present"] = d.present;
  }
  root["ok"] = true;
}

static bool applyConfigJson(JsonObject root, String& err) {
  PlDeviceConfig cfg;
  plStoreLoad(&cfg);
  if (root.containsKey("ethUseDhcp")) cfg.ethUseDhcp = root["ethUseDhcp"].as<uint8_t>() ? 1 : 0;
  if (root.containsKey("wifiApEnable")) cfg.wifiApEnable = root["wifiApEnable"].as<uint8_t>() ? 1 : 0;
  if (root["wifiApSsid"].is<const char*>()) strncpy(cfg.wifiApSsid, root["wifiApSsid"], sizeof(cfg.wifiApSsid) - 1);
  if (root["wifiApPass"].is<const char*>()) strncpy(cfg.wifiApPass, root["wifiApPass"], sizeof(cfg.wifiApPass) - 1);
  auto readIp = [&](const char* key, uint8_t* dst) {
    JsonArray arr = root[key].as<JsonArray>();
    if (!arr) return;
    for (uint8_t i = 0; i < 4 && i < arr.size(); i++) dst[i] = arr[i].as<uint8_t>();
  };
  readIp("ethIp", cfg.ethIp);
  readIp("ethGw", cfg.ethGw);
  readIp("ethMask", cfg.ethMask);
  readIp("ethDns", cfg.ethDns);
  if (root["expSlotType"].is<JsonArray>()) {
    JsonArray slots = root["expSlotType"].as<JsonArray>();
    for (uint8_t i = 0; i < PL_EXP_SLOTS && i < slots.size(); i++) {
      cfg.expSlotType[i] = slots[i].as<uint8_t>();
    }
  }
  if (!plStoreSave(&cfg)) { err = "save failed"; return false; }
  plExpApplyConfig(&cfg);
  plExpEnsureTags();
  return true;
}

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && PL_HAS_WEBSERVER
static void handleSetupPage() {
  server.send(200, "text/html", plSetupHtmlBody());
}

static void handleSetupConfigGet() {
  StaticJsonDocument<1536> doc;
  fillConfigJson(doc.to<JsonObject>());
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static void handleSetupConfigPut() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  String err;
  if (!applyConfigJson(doc.as<JsonObject>(), err)) {
    server.send(400, "application/json", String("{\"error\":\"") + err + "\"}");
    return;
  }
  server.send(200, "application/json", "{\"ok\":true}");
}

static void handleSetupScan() {
  plExpUpdate();
  plExpEnsureTags();
  handleSetupConfigGet();
}

static void handleSetupReboot() {
  server.send(200, "application/json", "{\"ok\":true}");
  delay(250);
  NVIC_SystemReset();
}

void plSetupRegisterRoutes() {
  server.on("/setup", HTTP_GET, handleSetupPage);
  server.on("/", HTTP_GET, handleSetupPage);
  server.on("/api/setup/config", HTTP_GET, handleSetupConfigGet);
  server.on("/api/setup/config", HTTP_PUT, handleSetupConfigPut);
  server.on("/api/setup/scan", HTTP_POST, handleSetupScan);
  server.on("/api/setup/reboot", HTTP_POST, handleSetupReboot);
}
#else
void plSetupRegisterRoutes() {}
#endif

static String plSetupHtmlBody() {
  return String(PL_SETUP_HTML);
}

static void writeHttpResponse(Stream& client, int code, const char* ctype, const String& body) {
  client.print("HTTP/1.1 ");
  client.print(code);
  client.println(code == 200 ? " OK" : " ERR");
  client.println("Connection: close");
  client.print("Content-Type: ");
  client.println(ctype);
  client.print("Content-Length: ");
  client.println(body.length());
  client.println();
  client.print(body);
}

static void handleWifiRequest(Stream& client, const String& method, const String& path, const String& body) {
  if (method == "GET" && (path == "/" || path == "/setup")) {
    writeHttpResponse(client, 200, "text/html", plSetupHtmlBody());
    return;
  }
  if (method == "GET" && path == "/api/setup/config") {
    StaticJsonDocument<1536> doc;
    fillConfigJson(doc.to<JsonObject>());
    String out;
    serializeJson(doc, out);
    writeHttpResponse(client, 200, "application/json", out);
    return;
  }
  if (method == "PUT" && path == "/api/setup/config") {
    StaticJsonDocument<1024> doc;
    String err = "invalid json";
    bool ok = !deserializeJson(doc, body) && applyConfigJson(doc.as<JsonObject>(), err);
    writeHttpResponse(client, ok ? 200 : 400, "application/json", ok ? "{\"ok\":true}" : String("{\"error\":\"") + err + "\"}");
    return;
  }
  if (method == "POST" && path == "/api/setup/scan") {
    plExpUpdate();
    plExpEnsureTags();
    StaticJsonDocument<1536> doc;
    fillConfigJson(doc.to<JsonObject>());
    String out;
    serializeJson(doc, out);
    writeHttpResponse(client, 200, "application/json", out);
    return;
  }
  if (method == "POST" && path == "/api/setup/reboot") {
    writeHttpResponse(client, 200, "application/json", "{\"ok\":true}");
    delay(250);
    NVIC_SystemReset();
    return;
  }
  writeHttpResponse(client, 404, "application/json", "{\"error\":\"not found\"}");
}

void plSetupHandleClient(Stream& client) {
  String req = client.readStringUntil('\r');
  client.readStringUntil('\n');
  while (client.available()) {
    String h = client.readStringUntil('\r');
    client.readStringUntil('\n');
    if (h.length() == 0) break;
  }
  int sp1 = req.indexOf(' ');
  int sp2 = req.indexOf(' ', sp1 + 1);
  String method = req.substring(0, sp1);
  String path = sp1 > 0 ? req.substring(sp1 + 1, sp2) : "/";
  String body;
  if (method == "PUT" || method == "POST") {
    delay(10);
    while (client.available()) body += (char)client.read();
  }
  handleWifiRequest(client, method, path, body);
}

#ifdef PL_HAS_WIFI
void plSetupHandleClient(WiFiClient& client) {
  plSetupHandleClient((Stream&)client);
  client.stop();
}
#endif
