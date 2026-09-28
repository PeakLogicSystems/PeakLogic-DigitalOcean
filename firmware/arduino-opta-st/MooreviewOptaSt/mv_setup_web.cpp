#include "mv_setup_web.h"
#include "mv_config.h"
#include "mv_eth.h"
#include "mv_store.h"
#include "mv_expansions.h"
#include "mv_wifi.h"
#include "mv_http.h"
#include "mv_device_status.h"
#include "mv_debug.h"
#include <ArduinoJson.h>
#include <Ethernet.h>
#include <string.h>

static String mvSetupHtmlBody();

static const char MV_SETUP_HTML[] = R"HTML(<!DOCTYPE html>
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
.status-grid{display:grid;grid-template-columns:minmax(7rem,auto) 1fr;gap:.25rem .75rem;font-size:.9rem;align-items:baseline}
.status-grid dt{color:#64748b;margin:0}
.status-grid dd{margin:0;word-break:break-word}
.err-box{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:.5rem .65rem;border-radius:6px;font-size:.85rem;white-space:pre-wrap;margin:.5rem 0 0}
.ok-box{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:.5rem .65rem;border-radius:6px;font-size:.85rem;margin:.5rem 0 0}
.badge{display:inline-block;padding:.1rem .45rem;border-radius:4px;font-size:.8rem;font-weight:600}
.badge.run{background:#dcfce7;color:#166534}
.badge.stop{background:#f1f5f9;color:#475569}
</style></head><body>
<h1>PeakLogic Opta Setup</h1>
<p class="muted">Configure Ethernet and expansion modules. Connect via WiFi AP or open <code>/setup</code> on Ethernet.</p>
<div class="card"><h2>ST runtime status</h2>
<p class="muted">Updated from PeakLogic deploy / Start. Refreshes every 3 s.</p>
<dl class="status-grid">
<dt>Program</dt><dd id="stProgramName">—</dd>
<dt>Runtime</dt><dd id="stRunning">—</dd>
<dt>Program loaded</dt><dd id="stProgramLoaded">—</dd>
<dt>Scan</dt><dd id="stScan">—</dd>
<dt>Clock</dt><dd id="stClock">—</dd>
<dt>Firmware</dt><dd id="stFirmware">—</dd>
<dt>Ethernet IP</dt><dd id="stEthIp">—</dd>
<dt>Expansions</dt><dd id="stExpansions">—</dd>
</dl>
<div id="stErrors" class="err-box" hidden></div>
<div id="stInfo" class="ok-box" hidden></div>
<button type="button" id="btnStatusRefresh">Refresh status</button>
</div>
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
<p class="muted">Opta <strong>WiFi</strong> hardware only. Join this AP to configure the device, then use Ethernet to reach your router/LAN.</p>
<label><input type="checkbox" id="wifiAp"> Enable AP for local setup</label>
<label>SSID <input id="wifiSsid" placeholder="PeakLogic-Opta"></label>
<label>Password <input id="wifiPass" type="password" placeholder="peaklogic (min 8 chars)"></label>
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
  wifiSsid.value=c.wifiApSsid||'';
  wifiPass.value=c.wifiApPass||'';
  const apSsid=c.wifiApSsid||'PeakLogic-Opta';
  const apPort=c.wifiApHttpPort||8080;
  if(!c.wifiCapable){
    wifiStatus.textContent=c.wifiApError||'WiFi not available — reflash with Board → Arduino Opta WiFi, or use Ethernet /setup';
    wifiAp.disabled=true;
  }else if(c.wifiApActive){
    wifiStatus.textContent='AP active — connect to '+apSsid+', open http://'+(c.wifiApIp||'192.168.4.1')+':'+apPort+'/setup';
    wifiAp.disabled=false;
  }else if(c.wifiApEnable){
    wifiStatus.textContent=c.wifiApError||'AP enabled but not running — Save again or Reboot';
    wifiAp.disabled=false;
  }else{
    wifiStatus.textContent='AP off';
    wifiAp.disabled=false;
  }
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
  const j=await r.json(); msg.textContent=j.ok?'Saved. Ethernet applies on reboot; WiFi AP updated now.':(j.error||'Save failed');
  if(j.ok) loadCfg();
};
btnReboot.onclick=async()=>{await fetch('/api/setup/reboot',{method:'POST'}); msg.textContent='Rebooting…';};
function fmtRun(s){
  const run=!!s.running;
  return `<span class="badge ${run?'run':'stop'}">${run?'Running':'Stopped'}</span>`;
}
function collectErrors(s){
  const errs=[];
  if(s.programError) errs.push('Program: '+s.programError);
  if(s.clientProtocolError) errs.push('Protocol: '+s.clientProtocolError);
  if(s.ota&&s.ota.error) errs.push('OTA: '+s.ota.error);
  if(s.ota&&s.ota.message&&/fail|error/i.test(s.ota.message)) errs.push('OTA: '+s.ota.message);
  return errs;
}
async function loadStatus(){
  try{
    const r=await fetch('/api/status'); const s=await r.json();
    stProgramName.textContent=s.programName||s.programShortName||'(none — deploy from PeakLogic Remote)';
    stRunning.innerHTML=fmtRun(s);
    stProgramLoaded.textContent=s.programLoaded?'Yes':'No';
    stScan.textContent=s.running?(`${s.scanMs||'?'} ms · ${s.cycles||0} cycles`):'—';
    stClock.textContent=s.rtcTime||'(RTC not set)';
    stFirmware.textContent=`v${s.firmwareVersion||'?'} · protocol ${s.protocolVersion??'?'}`;
    stEthIp.textContent=s.ethIp||'?';
    stExpansions.textContent=String(s.expansions??0);
    const errs=collectErrors(s);
    if(errs.length){ stErrors.hidden=false; stErrors.textContent=errs.join('\n'); }
    else { stErrors.hidden=true; stErrors.textContent=''; }
    const info=[];
    if(s.programLoaded&&s.programName) info.push('Ready to run on device.');
    else if(!s.programLoaded) info.push('No program deployed — use PeakLogic Connect + Start (Remote ON).');
    if(s.ota&&s.ota.phase) info.push('OTA: '+s.ota.phase+(s.ota.percent!=null?(' '+s.ota.percent+'%'):''));
    if(info.length){ stInfo.hidden=false; stInfo.textContent=info.join('\n'); }
    else { stInfo.hidden=true; stInfo.textContent=''; }
  }catch(e){
    stErrors.hidden=false; stErrors.textContent='Status unavailable: '+e.message;
    stInfo.hidden=true;
  }
}
btnStatusRefresh.onclick=()=>loadStatus();
loadCfg(); loadStatus(); setInterval(loadStatus,3000);
</script></body></html>)HTML";

static void ipToArr(IPAddress ip, uint8_t out[4]) {
  for (uint8_t i = 0; i < 4; i++) out[i] = ip[i];
}

static void arrToIp(const uint8_t in[4], IPAddress& ip) {
  ip = IPAddress(in[0], in[1], in[2], in[3]);
}

bool mvEthBegin(const MvDeviceConfig* cfg, byte* mac) {
  if (!cfg || !mac) return false;
  if (cfg->ethUseDhcp) return Ethernet.begin(mac) != 0;
  IPAddress ip, dns, gw, mask;
  arrToIp(cfg->ethIp, ip);
  arrToIp(cfg->ethDns, dns);
  arrToIp(cfg->ethGw, gw);
  arrToIp(cfg->ethMask, mask);
  return Ethernet.begin(mac, ip, dns, gw, mask) != 0;
}

void mvEthLogStatus(const MvDeviceConfig* cfg) {
  if (!cfg) return;
  IPAddress ip = Ethernet.localIP();
  char ipbuf[20];
  snprintf(ipbuf, sizeof(ipbuf), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
  if (cfg->ethUseDhcp) {
    MV_LOG2("Ethernet DHCP ", ipbuf);
  } else {
    char cfgIp[20];
    snprintf(cfgIp, sizeof(cfgIp), "%u.%u.%u.%u", cfg->ethIp[0], cfg->ethIp[1], cfg->ethIp[2], cfg->ethIp[3]);
    MV_LOG2("Ethernet static ", cfgIp);
  }
  if (ip[0] == 0 && ip[1] == 0 && ip[2] == 0 && ip[3] == 0) {
    MV_LOG("Ethernet has no IP — check cable/DHCP or set static IP in /setup");
  }
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  MV_LOG2("Ethernet http://", ip.toString());
#endif
}

static void fillConfigJson(JsonObject root) {
  const MvDeviceConfig* cfg = mvStoreActive();
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
  for (uint8_t i = 0; i < MV_EXP_SLOTS; i++) slots.add(cfg->expSlotType[i]);
  IPAddress cur = Ethernet.localIP();
  root["ethIpCurrent"] = cur.toString();
  root["wifiApActive"] = mvWifiApActive();
  root["wifiApIp"] = mvWifiApIp().toString();
  root["wifiCapable"] = mvWifiCapable();
  root["wifiApHttpPort"] = MV_WIFI_HTTP_PORT;
  root["wifiApSsidDefault"] = MV_WIFI_AP_SSID;
  if (!mvWifiCapable()) {
    root["wifiApError"] = mvWifiLastError();
  } else if (cfg->wifiApEnable && !mvWifiApActive()) {
    const char* err = mvWifiLastError();
    if (err && err[0]) root["wifiApError"] = err;
  }
  JsonArray det = root.createNestedArray("detected");
  for (uint8_t i = 0; i < mvExpDetectedCount(); i++) {
    MvExpDetected d;
    if (!mvExpGetDetected(i, &d)) continue;
    JsonObject o = det.createNestedObject();
    o["slot"] = d.slot;
    o["type"] = d.type;
    o["label"] = d.label;
    o["present"] = d.present;
  }
  root["ok"] = true;
}

static bool applyConfigJson(JsonObject root, String& err) {
  MvDeviceConfig cfg;
  mvStoreLoad(&cfg);
  if (root.containsKey("ethUseDhcp")) cfg.ethUseDhcp = root["ethUseDhcp"].as<uint8_t>() ? 1 : 0;
  if (root.containsKey("wifiApEnable")) cfg.wifiApEnable = root["wifiApEnable"].as<uint8_t>() ? 1 : 0;
  if (root["wifiApSsid"].is<const char*>()) strncpy(cfg.wifiApSsid, root["wifiApSsid"], sizeof(cfg.wifiApSsid) - 1);
  if (root["wifiApPass"].is<const char*>()) strncpy(cfg.wifiApPass, root["wifiApPass"], sizeof(cfg.wifiApPass) - 1);
  if (cfg.wifiApEnable) {
    if (!mvWifiCapable()) {
      err = "WiFi AP requires Arduino Opta WiFi hardware and board target";
      return false;
    }
    if (cfg.wifiApPass[0] && strlen(cfg.wifiApPass) < 8) {
      err = "WiFi password must be at least 8 characters";
      return false;
    }
  }
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
    for (uint8_t i = 0; i < MV_EXP_SLOTS && i < slots.size(); i++) {
      cfg.expSlotType[i] = slots[i].as<uint8_t>();
    }
  }
  if (!mvStoreSave(&cfg)) { err = "save failed"; return false; }
  mvExpApplyConfig(&cfg);
  mvExpEnsureTags();
  if (cfg.wifiApEnable) {
    if (!mvWifiApplyConfig(&cfg)) {
      const char* wifiErr = mvWifiLastError();
      err = wifiErr && wifiErr[0] ? wifiErr : "WiFi AP failed to start";
      return false;
    }
  } else {
    mvWifiApplyConfig(&cfg);
  }
  return true;
}

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
static void handleSetupPage(Stream& client, const String& method, const String& path,
                            const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvHttpSendResponse(client, 200, "text/html", mvSetupHtmlBody());
}

static void handleSetupConfigGet(Stream& client, const String& method, const String& path,
                                 const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<1536> doc;
  fillConfigJson(doc.to<JsonObject>());
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, 200, "application/json", out);
}

static void handleSetupConfigPut(Stream& client, const String& method, const String& path,
                                 const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  if (body.length() == 0) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, body)) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  String err;
  if (!applyConfigJson(doc.as<JsonObject>(), err)) {
    mvHttpSendResponse(client, 400, "application/json", String("{\"error\":\"") + err + "\"}");
    return;
  }
  mvHttpSendResponseCStr(client, 200, "application/json", "{\"ok\":true}");
}

static void handleSetupScan(Stream& client, const String& method, const String& path,
                          const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvExpUpdate();
  mvExpEnsureTags();
  handleSetupConfigGet(client, method, path, body, headerBlock);
}

static void handleSetupReboot(Stream& client, const String& method, const String& path,
                              const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvHttpSendResponseCStr(client, 200, "application/json", "{\"ok\":true}");
  delay(250);
  NVIC_SystemReset();
}

void mvSetupRegisterRoutes() {
  mvHttpAddRoute("GET", "/setup", handleSetupPage);
  mvHttpAddRoute("GET", "/", handleSetupPage);
  mvHttpAddRoute("GET", "/api/setup/config", handleSetupConfigGet);
  mvHttpAddRoute("PUT", "/api/setup/config", handleSetupConfigPut);
  mvHttpAddRoute("POST", "/api/setup/scan", handleSetupScan);
  mvHttpAddRoute("POST", "/api/setup/reboot", handleSetupReboot);
}
#else
void mvSetupRegisterRoutes() {}
#endif

static String mvSetupHtmlBody() {
  return String(MV_SETUP_HTML);
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
    writeHttpResponse(client, 200, "text/html", mvSetupHtmlBody());
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
  if (method == "GET" && path == "/api/status") {
    StaticJsonDocument<1024> doc;
    mvFillDeviceStatus(doc.to<JsonObject>());
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
    mvExpUpdate();
    mvExpEnsureTags();
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

void mvSetupHandleClient(Stream& client) {
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

#ifdef MV_HAS_WIFI
void mvSetupHandleClient(WiFiClient& client) {
  mvSetupHandleClient((Stream&)client);
  client.stop();
}
#endif
