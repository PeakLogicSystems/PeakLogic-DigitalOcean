#include "mv_setup_web.h"
#include "mv_config.h"
#include "mv_store.h"
#include "mv_global_key.h"
#include "mv_expansions.h"
#include "mv_wifi.h"
#include "mv_http.h"
#include "mv_device_status.h"
#include "mv_io_map.h"
#include "mv_mqtt.h"
#include "mv_peripheral.h"
#include "mv_debug.h"
#include "mv_web_nav.h"
#include <ArduinoJson.h>
#include <Ethernet.h>
#include <string.h>

static String mvSetupHtmlBody();

static const char MV_SETUP_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PeakLogic Opta Room</title>
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
.muted a{color:#2563eb;text-decoration:none;font-weight:600}
.muted a:hover{text-decoration:underline}
#msg{margin-top:.5rem;font-size:.9rem}
.status-grid{display:grid;grid-template-columns:minmax(7rem,auto) 1fr;gap:.25rem .75rem;font-size:.9rem;align-items:baseline}
.status-grid dt{color:#64748b;margin:0}
.status-grid dd{margin:0;word-break:break-word}
.err-box{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:.5rem .65rem;border-radius:6px;font-size:.85rem;white-space:pre-wrap;margin:.5rem 0 0}
.ok-box{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:.5rem .65rem;border-radius:6px;font-size:.85rem;margin:.5rem 0 0}
.badge{display:inline-block;padding:.1rem .45rem;border-radius:4px;font-size:.8rem;font-weight:600}
.badge.run{background:#dcfce7;color:#166534}
.badge.stop{background:#f1f5f9;color:#475569}
.badge.ok{background:#dcfce7;color:#166534}
.badge.off{background:#fef2f2;color:#991b1b}
)HTML" MV_WEB_NAV_CSS R"HTML(
</style></head><body>
)HTML" MV_WEB_NAV_SETUP_ACTIVE R"HTML(
<h1>PeakLogic Opta Room</h1>
<p class="muted">Room integration controller — ST + MQTT Parc + Shelly Flood WiFi peripherals. <a href="/io-map">View I/O Map</a>.</p>
<div class="card"><h2>ST runtime status</h2>
<p class="muted">Refreshes every 8 s from <code>/api/status/lite</code> (full status on Refresh).</p>
<dl class="status-grid">
<dt>Program</dt><dd id="stProgramName">—</dd>
<dt>Device ID</dt><dd id="stDeviceId">—</dd>
<dt>ATECC serial</dt><dd id="stAteccSerial">—</dd>
<dt>Runtime</dt><dd id="stRunning">—</dd>
<dt>Program loaded</dt><dd id="stProgramLoaded">—</dd>
<dt>Bytecode</dt><dd id="stBytecode">—</dd>
<dt>Code / data</dt><dd id="stCodeData">—</dd>
<dt>Scan</dt><dd id="stScan">—</dd>
<dt>Clock</dt><dd id="stClock">—</dd>
<dt>MQTT Parc</dt><dd id="stMqtt">—</dd>
<dt>MQTT broker</dt><dd id="stMqttBroker">—</dd>
<dt>Device mode</dt><dd id="stDeviceMode">—</dd>
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
<p class="muted">Opta <strong>WiFi</strong> hardware only (not RS485/Lite). Default SSID <code>PeakLogic-Opta</code>, password <code>peaklogic</code>, setup at <code>http://192.168.4.1:8080</code>.</p>
<label><input type="checkbox" id="wifiAp"> Enable AP for local setup</label>
<label>SSID <input id="wifiSsid" placeholder="PeakLogic-Opta"></label>
<label>Password <input id="wifiPass" type="password" placeholder="peaklogic (min 8 chars)"></label>
<p class="muted" id="wifiStatus"></p></div>
<div class="card"><h2>Room integration — Shelly Flood Gen4 (WiFi)</h2>
<p class="muted">Enable the AP above, then join each room Shelly to it. On each Shelly add an <strong>Action</strong> URL webhook using a unique <code>dev</code> slot (1..<span id="shellyMax">8</span>). Pushed values appear as tags <code>SHELLY&lt;n&gt;_FLOOD</code>, <code>SHELLY&lt;n&gt;_TEMP_C</code>, <code>SHELLY&lt;n&gt;_BATT</code>, <code>SHELLY&lt;n&gt;_ONLINE</code> and flow to PeakLogic over PARC.</p>
<dl class="status-grid">
<dt>Webhook (slot 1)</dt><dd id="shellyUrl">—</dd>
<dt>Active sensors</dt><dd id="shellyList">—</dd>
</dl>
<p class="muted">Per Shelly, set <code>dev</code> and append: <code>&amp;flood=${flood:0.alarm}&amp;tC=${temperature:0.tC}&amp;batt=${devicepower:0.battery.percent}</code></p></div>
<div class="card"><h2>MQTT Parc broker</h2>
<p class="muted">Must match PeakLogic Mosquitto LAN IP (IOT-LINK gateway IP, not 127.0.0.1). MQTT reconnects on save.</p>
<label>Broker IP <input id="mqttBroker" placeholder="PeakLogic / IOT-LINK LAN IP"></label>
<label>Port <input id="mqttPort" type="number" min="1" max="65535" value="1883"></label>
<p class="muted" id="mqttBrokerHint"></p></div>
<div class="card"><h2>Global site key</h2>
<p class="muted">Shared 16-bit key for P2P global tags (<code>peaklogic/v1/g/{key}/{tag}</code>). Commissioning assigns 0x0001–0xFFFF; default <code>0001</code>.</p>
<label>Site key (decimal or hex, e.g. 1 or 0xABCD) <input id="globalSiteKey" placeholder="1"></label>
<p class="muted" id="globalSiteKeyHint"></p></div>
<div class="card"><h2>Device mode</h2>
<p class="muted"><strong>Standalone</strong> — ST runs on Opta (Remote ST on PC). <strong>Remote I/O</strong> — PC runs ST locally; Opta scans I/O only. Save, then reboot.</p>
<label>Mode
<select id="deviceMode">
<option value="standalone">Standalone (ST on Opta)</option>
<option value="remote_io">Remote I/O (PC runs ST)</option>
</select></label>
<p class="muted" id="deviceModeHint"></p></div>
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
  wifiSsid.value=c.wifiApSsid||c.wifiApSsidDefault||'';
  wifiPass.value=c.wifiApPass||'';
  const apSsid=c.wifiApSsid||c.wifiApSsidDefault||'PeakLogic-Opta';
  const apPort=c.wifiApHttpPort||8080;
  if(!c.wifiCapable){
    wifiStatus.textContent=c.wifiApError||'WiFi not available — reflash with Board → Arduino Opta WiFi, or use Ethernet /setup';
    wifiAp.disabled=true;
  }else if(c.wifiApActive){
    wifiStatus.textContent='AP active — connect to '+apSsid+', open http://'+(c.wifiApIp||'192.168.4.1')+':'+apPort;
    wifiAp.disabled=false;
  }else if(c.wifiApEnable){
    wifiStatus.textContent=c.wifiApError||'AP enabled but not running — Save again or Reboot';
    wifiAp.disabled=false;
  }else{
    wifiStatus.textContent='AP off';
    wifiAp.disabled=false;
  }
  shellyUrl.textContent=c.shellyWebhook||('http://'+(c.wifiApIp||'192.168.4.1')+':'+apPort+'/api/peripheral/shelly?dev=1');
  shellyMax.textContent=c.shellyMax||8;
  const shList=c.shelly||[];
  if(!shList.length){ shellyList.textContent='None paired yet — join a Shelly and trigger it'; }
  else{
    shellyList.textContent=shList.map(s=>{
      const age=s.ageMs!=null&&s.ageMs<4294967295?Math.round(s.ageMs/1000)+' s ago':'never';
      return 'slot '+s.slot+': '+(s.online?'online':'stale')+' ('+s.hits+' hits, '+age+')';
    }).join(' · ');
  }
  mqttBroker.value=c.mqttBrokerHost||'';
  mqttPort.value=c.mqttBrokerPort||c.mqttBrokerActivePort||1883;
  const active=(c.mqttBrokerActive||c.mqttBrokerDefault||'?')+':'+(c.mqttBrokerActivePort||1883);
  mqttBrokerHint.textContent=c.mqttBrokerSet
    ?('Saved — active broker '+active+' (MQTT reconnects on save)')
    :('Active broker '+active+' from sketch default — enter LAN IP and Save to persist');
  globalSiteKey.value=c.globalSiteKey!=null?('0x'+Number(c.globalSiteKey).toString(16).padStart(4,'0')):'0x0001';
  globalSiteKeyHint.textContent='Addr key: '+(c.globalAddrKey||'0001')+' — must match PeakLogic System setup global site key';
  deviceMode.value=c.deviceMode==='remote_io'?'remote_io':'standalone';
  deviceModeHint.textContent=c.deviceModeSet?'Saved mode (reboot after change)':'Default standalone until saved';
  (c.expSlotType||[]).forEach((t,i)=>{const el=document.getElementById('exp'+i); if(el) el.value=t;});
  ethStatus.textContent='Ethernet: '+(c.ethIpCurrent||'?')+(c.ethUseDhcp?' (DHCP)':' (static)');
  const det=(c.detected||[]).map(d=>`Slot ${d.slot+1}: ${d.label} (${d.type})`).join('\n');
  if(det) expDetected.textContent=det;
  else if(c.expansionBlueprint===false) expDetected.textContent='Opta Expansions library missing — install Arduino_Opta_Blueprint (OptaBlue.h) and reflash';
  else expDetected.textContent='No expansions detected (24V supply on? modules seated in slot 1?)';
  ethStatic.style.opacity=ethDhcp.checked?'.5':'1';
}
ethDhcp.onchange=()=>{ethStatic.style.opacity=ethDhcp.checked?'.5':'1'};
btnScan.onclick=async()=>{await fetch('/api/setup/scan',{method:'POST'}); loadCfg();};
btnSave.onclick=async()=>{
  const body={ethUseDhcp:ethDhcp.checked?1:0,wifiApEnable:wifiAp.checked?1:0,
    wifiApSsid:wifiSsid.value,wifiApPass:wifiPass.value,
    ethIp:parseIp(ethIp.value),ethGw:parseIp(ethGw.value),ethMask:parseIp(ethMask.value),ethDns:parseIp(ethDns.value),
    mqttBrokerHost:mqttBroker.value.trim(),mqttBrokerPort:+mqttPort.value||1883,
    globalSiteKey:globalSiteKey.value.trim(),
    deviceMode:deviceMode.value==='remote_io'?'remote_io':'standalone',
    expSlotType:[0,1,2,3,4].map(i=>+document.getElementById('exp'+i).value)};
  const r=await fetch('/api/setup/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json(); msg.textContent=j.ok?'Saved. MQTT broker and Ethernet apply now; WiFi AP may need Reboot.':(j.error||'Save failed');
  if(j.ok) loadCfg();
};
btnReboot.onclick=async()=>{await fetch('/api/setup/reboot',{method:'POST'}); msg.textContent='Rebooting…';};
function fmtRun(s){
  const run=!!s.running;
  return `<span class="badge ${run?'run':'stop'}">${run?'Running':'Stopped'}</span>`;
}
function fmtMqtt(s){
  const ok=!!s.mqttConnected;
  return `<span class="badge ${ok?'ok':'off'}">${ok?'Connected':'Disconnected'}</span>`;
}
function fmtBytes(n){
  n=Number(n)||0;
  if(n>=1024) return (n/1024).toFixed(1)+' KB';
  return n+' B';
}
function fmtProgramStats(s){
  const p=s.programStats;
  if(!p||!s.programLoaded) return { bc:'—', cd:'—' };
  const max=p.maxBytes||16384;
  const pct=p.pct!=null?p.pct:Math.min(100,Math.round((p.totalBytes||0)*100/max));
  return {
    bc:`${fmtBytes(p.totalBytes||0)} / ${fmtBytes(max)} (${pct}%) · ${p.tagCount||0} tags`,
    cd:`${fmtBytes(p.codeBytes||0)} code · ${fmtBytes(p.dataBytes||0)} data`
  };
}
function collectErrors(s){
  const errs=[];
  if(s.programError) errs.push('Program: '+s.programError);
  if(s.ota&&s.ota.error) errs.push('OTA: '+s.ota.error);
  if(s.ota&&s.ota.message&&/fail|error/i.test(s.ota.message)) errs.push('OTA: '+s.ota.message);
  return errs;
}
function mergeProgramStats(s){
  if(s.programStats) loadStatus._lastStats=s.programStats;
  else if(loadStatus._lastStats) s.programStats=loadStatus._lastStats;
  return s;
}
async function loadStatus(full){
  if(loadStatus._busy) return;
  loadStatus._busy=true;
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),full?20000:15000);
  const url=full?'/api/status':'/api/status/lite';
  try{
    const r=await fetch(url,{signal:ac.signal});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const s=mergeProgramStats(await r.json());
    loadStatus._fails=0;
    loadStatus._hadOk=true;
    stProgramName.textContent=s.programName||s.programShortName||'(none — deploy via MQTT Parc)';
    stDeviceId.textContent=s.deviceId||'?';
    const sn=s.ateccSerial||s.serialNumber;
    if(sn) stAteccSerial.textContent=sn;
    else if(s.ateccStatus&&s.ateccStatus!=='ok') stAteccSerial.textContent=s.ateccStatus;
    else stAteccSerial.textContent='(ATECC608 not read — install ArduinoECCX08, recompile, upload)';
    stRunning.innerHTML=fmtRun(s);
    stProgramLoaded.textContent=s.programLoaded?'Yes':'No';
    const ps=fmtProgramStats(s);
    stBytecode.textContent=ps.bc;
    stCodeData.textContent=ps.cd;
    stScan.textContent=s.running?(`${s.scanMs||'?'} ms · ${s.cycles||0} cycles`):'—';
    stClock.textContent=s.rtcTime||'(RTC not set — deploy from PeakLogic to sync)';
    stMqtt.innerHTML=fmtMqtt(s);
    stMqttBroker.textContent=(s.mqttBroker||'?')+':'+(s.mqttBrokerPort||1883);
    stDeviceMode.textContent=s.deviceMode==='remote_io'?'Remote I/O (PC runs ST)':'Standalone (ST on Opta)';
    stFirmware.textContent=`v${s.firmwareVersion||'?'} · protocol ${s.protocolVersion??'?'}`;
    stEthIp.textContent=s.ethIp||'?';
    stExpansions.textContent=String(s.expansions??0);
    const errs=collectErrors(s);
    if(errs.length){ stErrors.hidden=false; stErrors.textContent=errs.join('\n'); }
    else { stErrors.hidden=true; stErrors.textContent=''; }
    const info=[];
    if(s.programLoaded&&s.programName) info.push('Ready to run on device.');
    else if(!s.programLoaded && s.deviceMode!=='remote_io') info.push('No program — use PeakLogic Parc Connect + Start.');
    else if(s.deviceMode==='remote_io') info.push('Remote I/O mode — PC runs ST; Opta scans physical I/O.');
    if(s.programInstallBusy) info.push('Program install in progress — page will refresh when done.');
    if(!s.mqttConnected) info.push('MQTT broker not connected — set broker IP on this page or check Ethernet.');
    if(s.ota&&s.ota.phase) info.push('OTA: '+s.ota.phase);
    if(info.length){ stInfo.hidden=false; stInfo.textContent=info.join('\n'); }
    else { stInfo.hidden=true; stInfo.textContent=''; }
  }catch(e){
    loadStatus._fails=(loadStatus._fails||0)+1;
    const busy=e.name==='AbortError';
    if(busy){
      stInfo.hidden=false;
      stInfo.textContent='Device busy (MQTT deploy or ST scan) — keeping last status, retrying…';
      if(!loadStatus._hadOk) {
        stErrors.hidden=false;
        stErrors.textContent='Status slow — wait for PeakLogic deploy to finish or reboot Opta';
      }
    }else{
      stErrors.hidden=false;
      stErrors.textContent='Status unavailable: '+e.message;
      stInfo.hidden=true;
    }
  }finally{
    clearTimeout(timer);
    loadStatus._busy=false;
    loadStatus._schedule();
  }
}
loadStatus._hadOk=false;
loadStatus._fails=0;
loadStatus._schedule=function(){
  const ms=(loadStatus._fails||0)>=2?12000:8000;
  if(loadStatus._timer) clearTimeout(loadStatus._timer);
  loadStatus._timer=setTimeout(()=>loadStatus(false),ms);
};
btnStatusRefresh.onclick=()=>loadStatus(true);
(async()=>{ await loadCfg(); await loadStatus(true); loadStatus._schedule(); })();
</script></body></html>)HTML";

static void ipToArr(IPAddress ip, uint8_t out[4]) {
  for (uint8_t i = 0; i < 4; i++) out[i] = ip[i];
}

static void arrToIp(const uint8_t in[4], IPAddress& ip) {
  ip = IPAddress(in[0], in[1], in[2], in[3]);
}

static bool mvEthHasIp() {
  IPAddress ip = Ethernet.localIP();
  return ip[0] || ip[1] || ip[2] || ip[3];
}

static bool mvEthConfigure(const MvDeviceConfig* cfg, byte* mac) {
  if (!cfg || !mac) return false;
  if (cfg->ethUseDhcp) {
    for (uint8_t attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) delay(500);
      if (Ethernet.begin(mac) != 0 && mvEthHasIp()) return true;
    }
    MV_LOG_CMD("Ethernet DHCP not ready at boot — retrying in loop");
    return false;
  }
  IPAddress ip, dns, gw, mask;
  arrToIp(cfg->ethIp, ip);
  arrToIp(cfg->ethDns, dns);
  arrToIp(cfg->ethGw, gw);
  arrToIp(cfg->ethMask, mask);
  return Ethernet.begin(mac, ip, dns, gw, mask) != 0;
}

bool mvEthBegin(const MvDeviceConfig* cfg, byte* mac) {
  return mvEthConfigure(cfg, mac);
}

void mvEthLogStatus(const MvDeviceConfig* cfg) {
  if (!cfg) return;
  IPAddress ip = Ethernet.localIP();
  char ipbuf[20];
  snprintf(ipbuf, sizeof(ipbuf), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
  if (cfg->ethUseDhcp) {
    MV_LOG_CMD2("Ethernet DHCP ", ipbuf);
  } else {
    char cfgIp[20];
    snprintf(cfgIp, sizeof(cfgIp), "%u.%u.%u.%u", cfg->ethIp[0], cfg->ethIp[1], cfg->ethIp[2], cfg->ethIp[3]);
    MV_LOG_CMD2("Ethernet static ", cfgIp);
  }
  if (ip[0] == 0 && ip[1] == 0 && ip[2] == 0 && ip[3] == 0) {
    MV_LOG("Ethernet has no IP — check cable/DHCP or set static IP in /setup");
  }
}

bool mvEthApply(const MvDeviceConfig* cfg, byte* mac) {
  const bool ok = mvEthConfigure(cfg, mac);
  if (ok) {
    mvEthLogStatus(cfg);
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
    mvHttpEnsureListening();
#endif
  } else {
    MV_LOG_CMD("Ethernet apply failed — check cable/DHCP/static settings");
  }
  return ok;
}

void mvEthMaintainTick(const MvDeviceConfig* cfg, byte* mac) {
  if (!cfg || !mac) return;
  Ethernet.maintain();

  static bool s_ethEverHadIp = false;
  static unsigned long s_ethLostIpMs = 0;
  const unsigned long now = millis();

  if (mvEthHasIp()) {
    s_ethEverHadIp = true;
    s_ethLostIpMs = 0;
    return;
  }
  if (!cfg->ethUseDhcp) return;

  if (s_ethEverHadIp) {
    if (s_ethLostIpMs == 0) s_ethLostIpMs = now;
    if (now - s_ethLostIpMs < 30000) return;
  }

  static unsigned long s_lastDhcpRetryMs = 0;
  if (now - s_lastDhcpRetryMs < 5000) return;
  s_lastDhcpRetryMs = now;

  if (Ethernet.begin(mac) != 0 && mvEthHasIp()) {
    IPAddress ip = Ethernet.localIP();
    char ipbuf[20];
    snprintf(ipbuf, sizeof(ipbuf), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
    MV_LOG_CMD2("Ethernet DHCP acquired ", ipbuf);
    s_ethEverHadIp = true;
    s_ethLostIpMs = 0;
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
    mvHttpEnsureListening();
#endif
  }
}

static uint16_t parseGlobalSiteKey(JsonVariant v) {
  if (v.is<uint16_t>() || v.is<int>() || v.is<long>()) {
    uint32_t n = v.as<uint32_t>();
    if (n >= 1 && n <= 65535) return (uint16_t)n;
    return 1;
  }
  if (v.is<const char*>()) {
    const char* s = v.as<const char*>();
    if (!s || !s[0]) return 1;
    char* end = nullptr;
    unsigned long n = strtoul(s, &end, 0);
    if (n >= 1 && n <= 65535) return (uint16_t)n;
    return 1;
  }
  return 1;
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
  root["wifiApHttpPort"] = MV_WIFI_HTTP_PORT;
  root["wifiCapable"] = mvWifiCapable();
  root["wifiApError"] = mvWifiLastError();
  root["wifiApSsidDefault"] = MV_WIFI_AP_SSID;
  root["mqttBrokerHost"] = cfg->mqttBrokerHost;
  root["mqttBrokerPort"] = cfg->mqttBrokerPort ? cfg->mqttBrokerPort : 1883;
  root["mqttBrokerSet"] = cfg->mqttBrokerSet ? true : false;
  root["mqttBrokerDefault"] = MV_MQTT_SKETCH_BROKER_DEFAULT;
  {
    char activeHost[32];
    uint16_t activePort = 1883;
    mvMqttGetBroker(activeHost, sizeof(activeHost), &activePort);
    root["mqttBrokerActive"] = activeHost;
    root["mqttBrokerActivePort"] = activePort;
  }
  root["deviceMode"] = mvDeviceModeString(cfg->deviceMode);
  root["deviceModeSet"] = true;
  root["globalSiteKey"] = mvGlobalSiteKey();
  char addrKey[5];
  mvGlobalAddrKey(addrKey);
  root["globalAddrKey"] = addrKey;
  root["expansionBlueprint"] = mvExpBlueprintEnabled();
  root["shellyMax"] = MV_SHELLY_MAX;
  {
    char url[72];
    snprintf(url, sizeof(url), "http://%s:%u/api/peripheral/shelly?dev=1",
             mvWifiApIp().toString().c_str(), (unsigned)MV_WIFI_HTTP_PORT);
    root["shellyWebhook"] = url;
  }
  mvPeripheralFillStatus(root.createNestedArray("shelly"));
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
  if (root.containsKey("wifiApSsid")) {
    const char* s = root["wifiApSsid"].as<const char*>();
    if (!s) s = "";
    strncpy(cfg.wifiApSsid, s, sizeof(cfg.wifiApSsid) - 1);
    cfg.wifiApSsid[sizeof(cfg.wifiApSsid) - 1] = '\0';
  }
  if (root.containsKey("wifiApPass")) {
    const char* p = root["wifiApPass"].as<const char*>();
    if (!p) p = "";
    strncpy(cfg.wifiApPass, p, sizeof(cfg.wifiApPass) - 1);
    cfg.wifiApPass[sizeof(cfg.wifiApPass) - 1] = '\0';
  }
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
  if (root.containsKey("mqttBrokerHost")) {
    const char* h = root["mqttBrokerHost"].as<const char*>();
    if (!h) h = "";
    if (h[0] && (!strcmp(h, "127.0.0.1") || !strcmp(h, "localhost"))) {
      err = "Broker cannot be 127.0.0.1 on device — use PeakLogic / IOT-LINK LAN IP";
      return false;
    }
    strncpy(cfg.mqttBrokerHost, h, sizeof(cfg.mqttBrokerHost) - 1);
    cfg.mqttBrokerHost[sizeof(cfg.mqttBrokerHost) - 1] = '\0';
    cfg.mqttBrokerSet = cfg.mqttBrokerHost[0] ? 1 : 0;
  }
  if (root.containsKey("mqttBrokerPort")) {
    const uint16_t p = root["mqttBrokerPort"].as<uint16_t>();
    cfg.mqttBrokerPort = p ? p : 1883;
  }
  if (root["deviceMode"].is<const char*>()) {
    const char* mode = root["deviceMode"];
    if (mode && strcmp(mode, "remote_io") == 0) cfg.deviceMode = MV_DEVICE_REMOTE_IO;
    else cfg.deviceMode = MV_DEVICE_STANDALONE;
  }
  if (root.containsKey("globalSiteKey")) {
    cfg.globalSiteKey = parseGlobalSiteKey(root["globalSiteKey"]);
  }
  if (!mvStoreSave(&cfg)) { err = "save failed"; return false; }
  mvExpApplyConfig(&cfg);
  mvExpEnsureTags();
  if (cfg.wifiApEnable && !mvWifiApActive()) {
    const char* wifiErr = mvWifiLastError();
    err = wifiErr && wifiErr[0] ? wifiErr : "WiFi AP failed to start";
    return false;
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
  StaticJsonDocument<2048> doc;
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
  mvExpRescan();
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

static void handleWifiRequest(Stream& client, const String& method, const String& path,
                              const String& query, const String& body) {
  if (method == "GET" && (path == "/" || path == "/setup")) {
    writeHttpResponse(client, 200, "text/html", mvSetupHtmlBody());
    return;
  }
  if (path == "/api/peripheral/shelly") {
    // Shelly Flood Gen4 webhook (query on GET, or same fields in a form-encoded body).
    String msg;
    const bool ok = mvPeripheralHandleWebhook(query.length() ? query : body, msg);
    String out = String("{\"ok\":") + (ok ? "true" : "false") + ",\"msg\":\"" + msg + "\"}";
    writeHttpResponse(client, ok ? 200 : 400, "application/json", out);
    return;
  }
  if (method == "GET" && path == "/api/setup/config") {
    StaticJsonDocument<2048> doc;
    fillConfigJson(doc.to<JsonObject>());
    String out;
    serializeJson(doc, out);
    writeHttpResponse(client, 200, "application/json", out);
    return;
  }
  if (method == "GET" && path == "/api/status") {
    StaticJsonDocument<2048> doc;
    mvFillDeviceStatus(doc.to<JsonObject>());
    String out;
    serializeJson(doc, out);
    writeHttpResponse(client, 200, "application/json", out);
    return;
  }
  if (method == "GET" && path == "/api/status/lite") {
    StaticJsonDocument<1024> doc;
    mvFillDeviceStatusLite(doc.to<JsonObject>());
    String out;
    serializeJson(doc, out);
    writeHttpResponse(client, 200, "application/json", out);
    return;
  }
  if (method == "GET" && path == "/io-map") {
    writeHttpResponse(client, 200, "text/html", String(mvIoMapHtmlPage()));
    return;
  }
  if (method == "GET" && path == "/api/io-map") {
    StaticJsonDocument<12288> doc;
    mvFillIoMapJson(doc.to<JsonObject>());
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
  mvExpRescan();
  mvExpEnsureTags();
  StaticJsonDocument<2048> doc;
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
  String reqLine = client.readStringUntil('\n');
  reqLine.trim();
  int sp1 = reqLine.indexOf(' ');
  int sp2 = reqLine.indexOf(' ', sp1 + 1);
  String method = sp1 > 0 ? reqLine.substring(0, sp1) : "GET";
  String path = sp1 > 0 ? reqLine.substring(sp1 + 1, sp2) : "/";
  String query;
  const int q = path.indexOf('?');
  if (q >= 0) {
    query = path.substring(q + 1);
    path = path.substring(0, q);
  }

  size_t contentLength = 0;
  for (;;) {
    String line = client.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) break;
    if (line.startsWith("Content-Length:")) {
      contentLength = (size_t)line.substring(15).toInt();
    }
  }

  String body;
  if (contentLength > 0 && contentLength < 4096) {
    body.reserve(contentLength);
    const unsigned long deadline = millis() + 15000;
    while (body.length() < contentLength && (long)(millis() - deadline) < 0) {
      if (client.available()) {
        body += (char)client.read();
      } else {
        delay(1);
      }
    }
  }
  handleWifiRequest(client, method, path, query, body);
}

#ifdef MV_HAS_WIFI
void mvSetupHandleClient(WiFiClient& client) {
  mvSetupHandleClient((Stream&)client);
  client.stop();
}
#endif
