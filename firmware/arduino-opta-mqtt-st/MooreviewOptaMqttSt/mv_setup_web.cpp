#include "mv_setup_web.h"
#include "mv_config.h"
#include "mv_store.h"
#include "mv_expansions.h"
#include "mv_wifi.h"
#include "mv_http.h"
#include "mv_device_status.h"
#include "mv_mqtt.h"
#include "mv_global_key.h"
#include "mv_st.h"
#include "mv_watchdog.h"
#include "mv_web_nav.h"
#include "mv_identity.h"
#include "mv_rbe.h"
#include "mv_debug.h"
#include <ArduinoJson.h>
#include <Ethernet.h>
#include <string.h>

extern bool g_runtimeRunning;

static const char MV_SETUP_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PeakLogic Opta Setup</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;margin:1rem;background:#f1f5f9;color:#0f172a}
h1{font-size:1.25rem}h2{font-size:1rem;margin-top:1.25rem;color:#49104F}
.card{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:1rem;margin:.75rem 0}
label{display:block;margin:.35rem 0;font-size:.9rem}
input,select{width:100%;max-width:20rem;padding:.35rem .5rem}
.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
button{padding:.45rem .9rem;border:1px solid #64748b;border-radius:6px;background:#e2e8f0;cursor:pointer}
button.primary{background:#49104F;color:#fff;border-color:#49104F}
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
.badge.ok{background:#dcfce7;color:#166534}
.badge.off{background:#fef2f2;color:#991b1b}
.status-bar{padding:.55rem .85rem;border-radius:6px;font-size:.9rem;font-weight:600;margin:.65rem 0 .25rem;border:1px solid transparent;line-height:1.35}
.status-bar.err{background:#fef2f2;border-color:#fecaca;color:#991b1b}
.status-bar.ok{background:#f0fdf4;border-color:#bbf7d0;color:#166534}
.status-bar.warn{background:#fffbeb;border-color:#fde68a;color:#92400e}
.rbe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(7.2rem,1fr));gap:.3rem;margin:.4rem 0}
.rbe-grid label{display:flex;align-items:center;gap:.35rem;margin:0;font-size:.85rem}
.rbe-grid input[type=checkbox]{width:auto;max-width:none;margin:0}
.rbe-sec{margin:.55rem 0 .25rem;font-size:.85rem;color:#49104F;font-weight:600}
)HTML" MV_WEB_NAV_CSS R"HTML(
</style></head><body>
<h1>PeakLogic Opta Setup</h1>
)HTML" MV_WEB_NAV_SETUP_ACTIVE R"HTML(
<div id="stStatusBar" class="status-bar warn" role="status" aria-live="polite">Loading device status…</div>
<p class="muted">ST + MQTT Parc. Configure Ethernet and expansions. Open <code>/setup</code> or root on Ethernet. MCSA load modes (fan/pump/compressor/turbine) are configured on <code>/mcsa</code>.</p>
<div class="card"><h2>ST runtime status</h2>
<p class="muted">Refreshes every 3 s from <code>/api/status</code>.</p>
<dl class="status-grid">
<dt>Device ID</dt><dd id="stDeviceId">—</dd>
<dt>Program</dt><dd id="stProgramName">—</dd>
<dt>Runtime</dt><dd id="stRunning">—</dd>
<dt>Program loaded</dt><dd id="stProgramLoaded">—</dd>
<dt>Bytecode</dt><dd id="stBytecode">—</dd>
<dt>Code / data</dt><dd id="stCodeData">—</dd>
<dt>Scan</dt><dd id="stScan">—</dd>
<dt>Host report</dt><dd id="stReport">—</dd>
<dt>RBE</dt><dd id="stRbe">—</dd>
<dt>MQTT Parc</dt><dd id="stMqtt">—</dd>
<dt>Firmware</dt><dd id="stFirmware">—</dd>
<dt>Ethernet IP</dt><dd id="stEthIp">—</dd>
<dt>Expansions</dt><dd id="stExpansions">—</dd>
<dt>Watchdog</dt><dd id="stWatchdog">—</dd>
<dt>CT calibration</dt><dd id="stCtCal">—</dd>
</dl>
<div id="stErrors" class="err-box" hidden></div>
<div id="stInfo" class="ok-box" hidden></div>
<div class="row" style="margin-top:.5rem">
<button type="button" id="btnStatusRefresh">Refresh status</button>
</div>
<button type="button" id="btnClearProgram">Clear program (NV flash)</button>
<p class="muted">Clears saved ST program from QSPI and stops runtime. Confirm before use.</p>
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
<div class="card"><h2>MQTT Parc broker</h2>
<p class="muted"><strong>TLS on + Save</strong> connects this Opta to <code>mqtt.peaklogic.io:8883</code>. <strong>TLS off</strong> = local PeakLogic appliance <code>:1883</code> (no TLS).</p>
<label><input type="checkbox" id="mqttTls"> Cloud MQTT (TLS — mqtt.peaklogic.io:8883)</label>
<label>Broker host <input id="mqttBroker" placeholder="mqtt.peaklogic.io or LAN IP"></label>
<label>Port <input id="mqttPort" type="number" min="1" max="65535" value="1883" readonly></label>
<label>Username <input id="mqttUser" autocomplete="username" placeholder="peaklogic (cloud)"></label>
<label>Password <input id="mqttPass" type="password" autocomplete="new-password" placeholder="blank = firmware MOSQUITTO_PASS"></label>
<p class="muted" id="mqttBrokerHint"></p>
<div class="row">
<button type="button" id="btnMqttTest">Test MQTT connection</button>
</div>
<p id="mqttTestResult" class="muted" aria-live="polite"></p></div>
<div class="card"><h2>Device to host scan rate</h2>
<p class="muted">How often this Opta publishes MQTT Parc telemetry to the host. PeakLogic may temporarily speed this up while Remote is attached. Range 100 ms–600 s.</p>
<label>Report interval (ms) <input id="reportMs" type="number" min="100" max="600000" step="100" placeholder="180000"></label>
<p class="muted" id="reportMsHint"></p>
</div>
<div class="card"><h2>Report by exception (RBE)</h2>
<p class="muted">Selected I/O publish immediately when they change, without waiting for the host report interval. Digital = any edge. Analog = change ≥ deadband. Leave unchecked to stay on the programmed rate only.</p>
<label>Minimum RBE interval (ms) <input id="rbeMinMs" type="number" min="20" max="60000" step="10" placeholder="100"></label>
<label>Analog deadband <input id="rbeDeadband" type="number" min="1" max="4000" step="1" placeholder="50"></label>
<p class="muted">INT counts (I*_RAW). REAL uses deadband/1000 (50 = 0.05).</p>
<div class="row">
<button type="button" id="btnRbeDigital">Select digital</button>
<button type="button" id="btnRbeNone">Clear all</button>
</div>
<div id="rbeGrid"></div>
</div>
<div class="card"><h2>Global site key</h2>
<p class="muted">This key decides which PeakLogic Cloud organization can see this Opta. Copy the org key from Cloud Studio (same value as <code>0x0001</code> / <code>000001</code>). Default <code>1</code>.</p>
<label>Site key (decimal or hex, e.g. 1 or 0x0001) <input id="globalSiteKey" placeholder="1"></label>
<p class="muted" id="globalSiteKeyHint"></p></div>
<div class="card"><h2>Expansion modules (AFX00005 / AFX00007)</h2>
<p class="muted">Slot 1 is closest to the Opta base. AFX00005 = D1608E (16 DI + 8 relays). AFX00007 = A0602 (8 analog ch + 4 PWM).</p>
<div id="expSlots"></div>
<label><input type="checkbox" id="a0602RtdEnable"> A0602 — 8× 2-wire PT100 RTD (°C on X2_AI1–X2_AI8)</label>
<p class="muted">Enable when slot 2 is AFX00007 and PT100 RTDs are wired (2-wire). Disable for 0–10 V / 4–20 mA transmitters.</p>
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
function renderRbe(rbe){
  rbeMinMs.value=rbe.minMs!=null?rbe.minMs:100;
  rbeDeadband.value=rbe.analogDeadband!=null?rbe.analogDeadband:50;
  const pts=rbe.points||[];
  const groups={digital:[],analog:[]};
  pts.forEach(p=>{
    const analog=p.type==='INT'||p.type==='REAL';
    (analog?groups.analog:groups.digital).push(p);
  });
  function box(p){
    return `<label><input type="checkbox" data-rbe-id="${p.id}" ${p.enabled?'checked':''}>${p.id}</label>`;
  }
  let html='';
  if(groups.digital.length) html+='<div class="rbe-sec">Digital I/O</div><div class="rbe-grid">'+groups.digital.map(box).join('')+'</div>';
  if(groups.analog.length) html+='<div class="rbe-sec">Analog I/O</div><div class="rbe-grid">'+groups.analog.map(box).join('')+'</div>';
  if(!html) html='<p class="muted">No I/O points yet — Scan expansions if modules are fitted.</p>';
  rbeGrid.innerHTML=html;
}
function selectedRbeIds(){
  return [...document.querySelectorAll('#rbeGrid input[data-rbe-id]:checked')].map(el=>el.getAttribute('data-rbe-id'));
}
btnRbeDigital.onclick=()=>{
  document.querySelectorAll('#rbeGrid input[data-rbe-id]').forEach(el=>{
    const id=el.getAttribute('data-rbe-id')||'';
    el.checked=!id.includes('_RAW')&&!id.includes('_AI');
  });
};
btnRbeNone.onclick=()=>{document.querySelectorAll('#rbeGrid input[data-rbe-id]').forEach(el=>{el.checked=false;});};
let mqttLanHost='192.168.1.233';
let mqttCloudHost='mqtt.peaklogic.io';
function isCloudHost(h){
  h=(h||'').trim().toLowerCase();
  return h==='mqtt.peaklogic.io'||h==='peaklogic.io';
}
function applyMqttPath(){
  if(mqttTls.checked){
    if(mqttBroker.value && !isCloudHost(mqttBroker.value)) mqttLanHost=mqttBroker.value.trim();
    mqttBroker.value=mqttCloudHost;
    mqttPort.value='8883';
    if(!mqttUser.value.trim()) mqttUser.value='peaklogic';
    mqttBrokerHint.textContent='Cloud path — TLS mqtt.peaklogic.io:8883. Blank password uses firmware MOSQUITTO_USER/PASS.';
  }else{
    mqttPort.value='1883';
    if(!mqttBroker.value.trim() || isCloudHost(mqttBroker.value)) mqttBroker.value=mqttLanHost;
    mqttBrokerHint.textContent='Local appliance — plain MQTT '+mqttBroker.value+':1883 (no TLS).';
  }
}
async function loadCfg(){
  const r=await fetch('/api/setup/config'); const c=await r.json();
  ethDhcp.checked=!!c.ethUseDhcp; wifiAp.checked=!!c.wifiApEnable;
  ethIp.value=ip4(c.ethIp); ethGw.value=ip4(c.ethGw); ethMask.value=ip4(c.ethMask); ethDns.value=ip4(c.ethDns);
  wifiSsid.value=c.wifiApSsid||'';
  wifiPass.value='';
  wifiPass.placeholder=c.wifiApPassSet?'leave blank to keep saved':'peaklogic (min 8 chars)';
  mqttCloudHost=c.mqttCloudHost||'mqtt.peaklogic.io';
  mqttLanHost=c.mqttLanHost||'192.168.1.233';
  mqttBroker.value=c.mqttBrokerHost||'';
  let tls=!!c.mqttUseTls || +(c.mqttBrokerPort||0)===8883;
  mqttTls.checked=tls;
  mqttUser.value=c.mqttUsername||'';
  mqttPass.value='';
  mqttPass.placeholder=tls?'blank = firmware cloud password':'leave blank (local :1883 has no MQTT auth)';
  if(!tls && c.mqttBrokerHost && !isCloudHost(c.mqttBrokerHost)) mqttLanHost=c.mqttBrokerHost;
  applyMqttPath();
  const active=(c.mqttBrokerActive||mqttBroker.value||'?')+':'+(tls?'8883':'1883');
  const authHint=tls?(c.mqttPasswordSet?' cloud user+password in NV':' type cloud password once'):' local :1883 no TLS';
  if(c.mqttBrokerSet) mqttBrokerHint.textContent='NV saved — '+active+' — '+authHint+'.';
  reportMs.value=c.reportMs!=null?c.reportMs:180000;
  function hintReport(){
    const ms=+reportMs.value||180000;
    const sec=Math.round(ms/1000);
    reportMsHint.textContent=ms>=1000?(sec+' s to host'):(ms+' ms to host');
  }
  hintReport();
  reportMs.oninput=hintReport;
  renderRbe(c.rbe||{});
  globalSiteKey.value=c.globalSiteKey!=null?('0x'+Number(c.globalSiteKey).toString(16).padStart(4,'0')):'0x0001';
  globalSiteKeyHint.textContent='Addr key: '+(c.globalAddrKey||'0001')+' — Cloud org with this site key sees the Opta';
  const apSsid=c.wifiApSsid||'PeakLogic-Opta';
  const apPort=c.wifiApHttpPort||8080;
  wifiSsid.disabled=!c.wifiCapable;
  wifiPass.disabled=!c.wifiCapable;
  if(!c.wifiCapable){
    wifiStatus.textContent=c.wifiApError||'No WiFi module on this Opta — use Ethernet /setup';
    wifiAp.disabled=true;
    if(c.wifiApEnable) wifiAp.checked=false;
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
  (c.expSlotType||[]).forEach((t,i)=>{const el=document.getElementById('exp'+i); if(el) el.value=t;});
  a0602RtdEnable.checked=!!c.a0602RtdEnable;
  ethStatus.textContent='Ethernet: '+(c.ethIpCurrent||'?')+(c.ethUseDhcp?' (DHCP)':' (static)');
  const det=(c.detected||[]).map(d=>`Slot ${d.slot+1}: ${d.label} (${d.type})`).join('\n');
  if(det) expDetected.textContent=det;
  else if(c.expansionBlueprint===false) expDetected.textContent='Opta Expansions library missing — install Arduino_Opta_Blueprint (OptaBlue.h) and reflash';
  else expDetected.textContent='No expansions detected (24V supply on? modules seated in slot 1?)';
  ethStatic.style.opacity=ethDhcp.checked?'.5':'1';
}
ethDhcp.onchange=()=>{ethStatic.style.opacity=ethDhcp.checked?'.5':'1'};
mqttTls.onchange=applyMqttPath;
btnScan.onclick=async()=>{await fetch('/api/setup/scan',{method:'POST'}); loadCfg();};
btnMqttTest.onclick=async()=>{
  const host=mqttBroker.value.trim();
  if(!host){ mqttTestResult.className='err-box'; mqttTestResult.textContent='Enter broker host first.'; return; }
  applyMqttPath();
  btnMqttTest.disabled=true;
  mqttTestResult.className='muted';
  mqttTestResult.textContent=mqttTls.checked?'Testing MQTT TLS after HTTP idle (may take ~20 s)…':'Testing MQTT connection (may take up to 10 s)…';
  const show=j=>{
    if(j.ok){
      mqttTestResult.className='ok-box';
      mqttTestResult.textContent='Connected to '+(j.broker||host)+':'+(j.port||1883)+'. '+(j.message||'Test publish OK.');
    }else{
      mqttTestResult.className='err-box';
      mqttTestResult.textContent=j.error||'MQTT test failed';
    }
  };
  try{
    const body={mqttBrokerHost:host,mqttBrokerPort:+mqttPort.value||1883,mqttUseTls:mqttTls.checked?1:0,mqttUsername:mqttUser.value.trim(),mqttPassword:mqttPass.value};
    const r=await fetch('/api/setup/mqtt-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();
    if(j.queued){
      await new Promise(res=>setTimeout(res,14000));
      const t0=Date.now();
      while(Date.now()-t0<16000){
        const p=await fetch('/api/setup/mqtt-test');
        const s=await p.json();
        if(s.pending){ await new Promise(res=>setTimeout(res,800)); continue; }
        if(s.done){ show(s); return; }
        await new Promise(res=>setTimeout(res,800));
      }
      mqttTestResult.className='err-box';
      mqttTestResult.textContent='MQTT test timed out waiting for result';
      return;
    }
    show(j);
  }catch(e){
    mqttTestResult.className='err-box';
    mqttTestResult.textContent='Test failed: '+e.message;
  }finally{
    btnMqttTest.disabled=false;
  }
};
btnSave.onclick=async()=>{
  applyMqttPath();
  const body={ethUseDhcp:ethDhcp.checked?1:0,wifiApEnable:wifiAp.checked?1:0,
    wifiApSsid:wifiSsid.value,wifiApPass:wifiPass.value,
    mqttBrokerHost:mqttBroker.value.trim(),mqttBrokerPort:+mqttPort.value||1883,
    mqttUseTls:mqttTls.checked?1:0,
    mqttUsername:mqttUser.value.trim(),mqttPassword:mqttPass.value,
    globalSiteKey:globalSiteKey.value.trim(),
    reportMs:+reportMs.value||180000,
    rbeEnabled:selectedRbeIds(),
    rbeMinMs:+rbeMinMs.value||100,
    rbeAnalogDeadband:+rbeDeadband.value||50,
    ethIp:parseIp(ethIp.value),ethGw:parseIp(ethGw.value),ethMask:parseIp(ethMask.value),ethDns:parseIp(ethDns.value),
    expSlotType:[0,1,2,3,4].map(i=>+document.getElementById('exp'+i).value),
    a0602RtdEnable:a0602RtdEnable.checked?1:0};
  const r=await fetch('/api/setup/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json(); msg.textContent=j.ok?(mqttTls.checked?'Saved. Connecting to mqtt.peaklogic.io:8883. Site key selects the Cloud org that can see this Opta. Ethernet IP changes need Reboot.':'Saved. Connecting to local :1883. Ethernet IP changes need Reboot.'):(j.error||'Save failed');
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
function fmtWatchdog(s){
  const w=s.watchdog;
  if(!w) return '—';
  if(!w.enabled) return 'Disabled';
  const idle=w.idleMs!=null?w.idleMs:0;
  const live=w.livenessMs!=null?w.livenessMs:'?';
  return `Enabled · idle ${idle} ms / ${live} ms`;
}
function collectErrors(s){
  const errs=[];
  if(s.programError) errs.push('Program failed to load: '+s.programError);
  if(s.ota&&s.ota.error) errs.push('OTA: '+s.ota.error);
  if(s.ota&&s.ota.message&&/fail|error/i.test(s.ota.message)) errs.push('OTA: '+s.ota.message);
  return errs;
}
function updateStatusBar(s){
  const bar=document.getElementById('stStatusBar');
  if(!bar) return;
  if(s.programError){
    bar.className='status-bar err';
    bar.textContent='Program failed to load: '+s.programError;
    return;
  }
  if(s.programLoaded){
    bar.className='status-bar ok';
    const name=s.programShortName||s.programName||'program';
    bar.textContent=s.running?('Running — '+name):('Program loaded — '+name+' (stopped)');
    return;
  }
  bar.className='status-bar warn';
  bar.textContent='No program loaded — use PeakLogic Parc Download & Start';
}
function fmtCtCal(s){
  const c=s.ctCal;
  if(!c) return '—';
  const z=c.zeroedCount!=null?c.zeroedCount:0;
  const n=c.channels||6;
  const adc=c.adcMaxRaw||'?';
  const os=c.oversample||'?';
  return `${z}/${n} zeroed · OS ${os} · ADC ${adc}`;
}
async function loadStatus(){
  try{
    const r=await fetch('/api/status'); const s=await r.json();
    updateStatusBar(s);
    stDeviceId.textContent=s.deviceId||'?';
    if(s.ateccStatus&&s.ateccStatus!=='ok') stDeviceId.title=s.ateccStatus;
    else stDeviceId.title='';
    stProgramName.textContent=s.programName||s.programShortName||'(none — deploy via MQTT Parc)';
    stRunning.innerHTML=fmtRun(s);
    stProgramLoaded.innerHTML=s.programError
      ? `<span class="badge off">Failed</span>`
      : (s.programLoaded?`<span class="badge ok">Yes</span>`:`<span class="badge off">No</span>`);
    const ps=fmtProgramStats(s);
    stBytecode.textContent=ps.bc;
    stCodeData.textContent=ps.cd;
    stScan.textContent=s.running?(`${s.scanMs||'?'} ms · ${s.cycles||0} cycles`):'—';
    const reportEl=document.getElementById('stReport');
    if(reportEl){
      const rms=Number(s.reportMs)||0;
      reportEl.textContent=rms?(rms>=1000?`${Math.round(rms/1000)} s (${rms} ms)`:`${rms} ms`):'—';
    }
    const rbeEl=document.getElementById('stRbe');
    if(rbeEl){
      const n=Number(s.rbeEnabled)||0;
      rbeEl.textContent=n?(n+' I/O'+(s.rbeLastTag?' · last '+s.rbeLastTag:'')):'off';
    }
    stMqtt.innerHTML=fmtMqtt(s);
    stFirmware.textContent=`v${s.firmwareVersion||'?'} · protocol ${s.protocolVersion??'?'}`;
    stEthIp.textContent=s.ethIp||'?';
    stExpansions.textContent=String(s.expansions??0);
    stWatchdog.textContent=fmtWatchdog(s);
    const ctEl=document.getElementById('stCtCal');
    if(ctEl) ctEl.textContent=fmtCtCal(s);
    const errs=collectErrors(s);
    if(errs.length){ stErrors.hidden=false; stErrors.textContent=errs.join('\n'); }
    else { stErrors.hidden=true; stErrors.textContent=''; }
    const info=[];
    if(s.programLoaded&&s.programName) info.push('Ready to run on device.');
    else if(!s.programLoaded) info.push('No program — use PeakLogic Parc Connect + Start.');
    if(!s.mqttConnected) info.push('MQTT broker not connected — check broker IP on /setup (active: '+(s.mqttBroker||'?')+':'+(s.mqttBrokerPort||1883)+').');
    const zc=s.ctCal?.zeroedCount??0;
    if(zc<6) info.push('CT calibration: '+zc+'/6 channels zeroed — open Calibrate CT before relying on amp readings.');
    if(s.ateccStatus&&s.ateccStatus!=='ok') info.push('Device identity: '+s.ateccStatus);
    if(s.ota&&s.ota.phase) info.push('OTA: '+s.ota.phase);
    if(info.length){ stInfo.hidden=false; stInfo.textContent=info.join('\n'); }
    else { stInfo.hidden=true; stInfo.textContent=''; }
  }catch(e){
    const bar=document.getElementById('stStatusBar');
    if(bar){
      bar.className='status-bar err';
      bar.textContent='Status unavailable: '+e.message+' (HTTP busy or offline — use PeakLogic Download & Start)';
    }
    stErrors.hidden=false;
    stErrors.textContent='Cannot reach /api/status. During MQTT deploy this is normal — wait 30s and refresh.';
    stInfo.hidden=true;
  }
}
btnStatusRefresh.onclick=()=>loadStatus();
btnClearProgram.onclick=async()=>{
  if(!confirm('Clear saved ST program from NV flash? Runtime will stop.')) return;
  const r=await fetch('/api/program',{method:'DELETE'});
  const j=await r.json();
  msg.textContent=(j.ok&&j.cleared)?'Program cleared from NV flash.':(j.error||'Clear failed');
  loadStatus();
};
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
    MV_LOG_CMD2("Ethernet DHCP ", ipbuf);
  } else {
    char cfgIp[20];
    snprintf(cfgIp, sizeof(cfgIp), "%u.%u.%u.%u", cfg->ethIp[0], cfg->ethIp[1], cfg->ethIp[2], cfg->ethIp[3]);
    MV_LOG_CMD2("Ethernet static ", cfgIp);
  }
  if (ip[0] == 0 && ip[1] == 0 && ip[2] == 0 && ip[3] == 0) {
    MV_LOG("Ethernet has no IP — check cable/DHCP or set static IP in /setup");
  }
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  MV_LOG2("Ethernet http://", ip.toString());
#endif
}

static uint16_t parseGlobalSiteKey(JsonVariant v) {
  if (v.isNull()) return 1;
  if (v.is<uint16_t>() || v.is<int>() || v.is<unsigned int>() || v.is<long>() || v.is<unsigned long>()) {
    uint32_t n = v.as<uint32_t>();
    if (n >= 1 && n <= 65535) return (uint16_t)n;
    return 1;
  }
  const char* s = v.as<const char*>();
  if (s && s[0]) {
    while (*s == ' ' || *s == '\t') s++;
    char* end = nullptr;
    unsigned long n = strtoul(s, &end, 0);
    if (end != s && n >= 1 && n <= 65535) return (uint16_t)n;
  }
  return 1;
}

static void fillConfigJson(JsonObject root) {
  const MvDeviceConfig* cfg = mvStoreActive();
  root["deviceId"] = mvIdentityDeviceId();
  root["ateccStatus"] = mvIdentityAteccStatus();
  root["ethUseDhcp"] = cfg->ethUseDhcp;
  root["wifiApEnable"] = cfg->wifiApEnable;
  root["wifiApSsid"] = cfg->wifiApSsid;
  root["wifiApPassSet"] = (cfg->wifiApPass[0] != '\0');
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
  root["a0602RtdEnable"] = cfg->a0602RtdEnable ? true : false;
  root["mqttBrokerHost"] = cfg->mqttBrokerHost;
  root["mqttBrokerPort"] = cfg->mqttBrokerPort ? cfg->mqttBrokerPort : 1883;
  root["mqttUseTls"] = cfg->mqttUseTls ? true : false;
  root["mqttBrokerSet"] = cfg->mqttBrokerSet ? true : false;
  root["mqttUsername"] = cfg->mqttUsername;
  root["mqttAuthSet"] = cfg->mqttAuthSet ? true : false;
  root["mqttPasswordSet"] = (cfg->mqttAuthSet && cfg->mqttPassword[0]) ? true : false;
  root["mqttBrokerDefault"] = MV_MQTT_SKETCH_BROKER_DEFAULT;
  root["mqttCloudHost"] = MV_MQTT_SKETCH_BROKER_DEFAULT;
  root["mqttLanHost"] = MV_MQTT_LAN_BROKER_DEFAULT;
  {
    char activeHost[64];
    uint16_t activePort = 1883;
    mvMqttGetBroker(activeHost, sizeof(activeHost), &activePort);
    root["mqttBrokerActive"] = activeHost;
    root["mqttBrokerActivePort"] = activePort;
  }
  root["globalSiteKey"] = mvGlobalSiteKey();
  char addrKey[5];
  mvGlobalAddrKey(addrKey);
  root["globalAddrKey"] = addrKey;
  {
    uint32_t ms = cfg->reportMs;
    if (ms < MV_REPORT_MS_MIN || ms > MV_REPORT_MS_MAX) ms = MV_REPORT_MS_DEFAULT;
    root["reportMs"] = ms;
    root["reportMsLive"] = mvMqttReportMs();
  }
  mvRbeFillConfig(root);
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
  root["expansionBlueprint"] = mvExpBlueprintEnabled();
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

static bool mvMqttHostIsCloud(const char* h) {
  return h && h[0] && (!strcmp(h, "mqtt.peaklogic.io") || !strcmp(h, "peaklogic.io"));
}

static bool applyConfigJson(JsonObject root, String& err) {
  MvDeviceConfig cfg = *mvStoreActive();
  if (root.containsKey("ethUseDhcp")) cfg.ethUseDhcp = root["ethUseDhcp"].as<uint8_t>() ? 1 : 0;
  if (root.containsKey("wifiApEnable")) cfg.wifiApEnable = root["wifiApEnable"].as<uint8_t>() ? 1 : 0;
  if (root["wifiApSsid"].is<const char*>()) {
    const char* ssid = root["wifiApSsid"].as<const char*>();
    if (ssid && ssid[0]) {
      strncpy(cfg.wifiApSsid, ssid, sizeof(cfg.wifiApSsid) - 1);
      cfg.wifiApSsid[sizeof(cfg.wifiApSsid) - 1] = '\0';
    }
  }
  if (root["wifiApPass"].is<const char*>()) {
    const char* wp = root["wifiApPass"].as<const char*>();
    if (wp && wp[0]) {
      strncpy(cfg.wifiApPass, wp, sizeof(cfg.wifiApPass) - 1);
      cfg.wifiApPass[sizeof(cfg.wifiApPass) - 1] = '\0';
    }
  }
  if (cfg.wifiApEnable) {
    if (!mvWifiCapable()) {
      err = mvWifiLastError()[0] ? mvWifiLastError() : "No WiFi module on this Opta";
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
  if (root.containsKey("a0602RtdEnable")) {
    cfg.a0602RtdEnable = root["a0602RtdEnable"].as<uint8_t>() ? 1 : 0;
  }
  if (root.containsKey("mqttBrokerHost")) {
    const char* h = root["mqttBrokerHost"].as<const char*>();
    if (!h) h = "";
    if (h[0] && (!strcmp(h, "127.0.0.1") || !strcmp(h, "localhost"))) {
      err = "Broker cannot be 127.0.0.1 on device — use PeakLogic / IOT-LINK LAN IP";
      return false;
    }
    if (h[0] && strlen(h) >= sizeof(cfg.mqttBrokerHost)) {
      err = "Broker host too long";
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
  if (root.containsKey("mqttUseTls")) cfg.mqttUseTls = root["mqttUseTls"].as<uint8_t>() ? 1 : 0;
  if (cfg.mqttBrokerPort == 8883) cfg.mqttUseTls = 1;
  if (root.containsKey("mqttUsername")) {
    const char* u = root["mqttUsername"].as<const char*>();
    if (!u) u = "";
    if (u[0] && strlen(u) >= sizeof(cfg.mqttUsername)) {
      err = "MQTT username too long";
      return false;
    }
    strncpy(cfg.mqttUsername, u, sizeof(cfg.mqttUsername) - 1);
    cfg.mqttUsername[sizeof(cfg.mqttUsername) - 1] = '\0';
  }
  bool mqttPassTyped = false;
  if (root.containsKey("mqttPassword")) {
    const char* p = root["mqttPassword"].as<const char*>();
    if (p && p[0]) {
      if (strlen(p) >= sizeof(cfg.mqttPassword)) {
        err = "MQTT password too long (max 79 chars)";
        return false;
      }
      strncpy(cfg.mqttPassword, p, sizeof(cfg.mqttPassword) - 1);
      cfg.mqttPassword[sizeof(cfg.mqttPassword) - 1] = '\0';
      mqttPassTyped = true;
    }
  }
  if (cfg.mqttUseTls) {
    strncpy(cfg.mqttBrokerHost, MV_MQTT_SKETCH_BROKER_DEFAULT, sizeof(cfg.mqttBrokerHost) - 1);
    cfg.mqttBrokerHost[sizeof(cfg.mqttBrokerHost) - 1] = '\0';
    cfg.mqttBrokerPort = 8883;
    cfg.mqttBrokerSet = 1;
    if (!cfg.mqttUsername[0]) {
      strncpy(cfg.mqttUsername, MV_MQTT_SKETCH_USER_DEFAULT, sizeof(cfg.mqttUsername) - 1);
      cfg.mqttUsername[sizeof(cfg.mqttUsername) - 1] = '\0';
    }
    /* Blank password on cloud TLS reloads firmware MOSQUITTO_PASS — do not keep a stale NV secret. */
    if (!mqttPassTyped) {
      strncpy(cfg.mqttPassword, MV_MQTT_SKETCH_PASS_DEFAULT, sizeof(cfg.mqttPassword) - 1);
      cfg.mqttPassword[sizeof(cfg.mqttPassword) - 1] = '\0';
    }
    if (!cfg.mqttUsername[0] || !cfg.mqttPassword[0]) {
      err = "Cloud TLS requires MQTT username and password in NV";
      return false;
    }
    cfg.mqttAuthSet = 1;
  } else {
    cfg.mqttUseTls = 0;
    cfg.mqttBrokerPort = 1883;
    if (!cfg.mqttBrokerHost[0] || mvMqttHostIsCloud(cfg.mqttBrokerHost)) {
      strncpy(cfg.mqttBrokerHost, MV_MQTT_LAN_BROKER_DEFAULT, sizeof(cfg.mqttBrokerHost) - 1);
      cfg.mqttBrokerHost[sizeof(cfg.mqttBrokerHost) - 1] = '\0';
    }
    cfg.mqttBrokerSet = cfg.mqttBrokerHost[0] ? 1 : 0;
    /* Keep cloud user/pass in NV for the next TLS toggle; do not send them on :1883. */
    cfg.mqttAuthSet = 0;
  }
  if (root.containsKey("globalSiteKey")) {
    cfg.globalSiteKey = parseGlobalSiteKey(root["globalSiteKey"]);
  }
  if (root.containsKey("reportMs")) {
    const uint32_t ms = root["reportMs"].as<uint32_t>();
    if (ms < MV_REPORT_MS_MIN || ms > MV_REPORT_MS_MAX) {
      err = "Device to host scan rate must be 100–600000 ms";
      return false;
    }
    cfg.reportMs = ms;
    if (!mvMqttSetReportMs(ms)) {
      err = "Invalid device to host scan rate";
      return false;
    }
  }
  {
    char rbeErr[80];
    rbeErr[0] = '\0';
    if (!mvRbeApplyJson(root, rbeErr, sizeof(rbeErr))) {
      err = rbeErr[0] ? rbeErr : "Invalid RBE settings";
      return false;
    }
  }
  if (!mvStoreSave(&cfg)) { err = "save failed"; return false; }
  mvMqttApplyDeviceConfig(&cfg);
  mvExpApplyConfig(&cfg);
  mvExpEnsureTags();
  mvRbeApplyConfig();
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
  mvHttpSendResponseCStr(client, 200, "text/html; charset=utf-8", MV_SETUP_HTML);
}

static void handleSetupConfigGet(Stream& client, const String& method, const String& path,
                                 const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<4096> doc;
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
  StaticJsonDocument<4096> doc;
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
  mvRbeApplyConfig();
  handleSetupConfigGet(client, method, path, body, headerBlock);
}

static bool parseMqttTestBody(JsonObject root, char* hostOut, size_t hostLen, uint16_t* portOut,
                              char* userOut, size_t userLen, char* passOut, size_t passLen,
                              bool* tlsOut, String& err) {
  const char* host = root["mqttBrokerHost"].is<const char*>() ? root["mqttBrokerHost"].as<const char*>() : "";
  if (!host || !host[0]) {
    const MvDeviceConfig* cfg = mvStoreActive();
    if (cfg && cfg->mqttBrokerSet && cfg->mqttBrokerHost[0]) host = cfg->mqttBrokerHost;
  }
  if (!host || !host[0]) {
    err = "Broker host required";
    return false;
  }
  if (!strcmp(host, "127.0.0.1") || !strcmp(host, "localhost")) {
    err = "Broker cannot be 127.0.0.1 on device — use PeakLogic / cloud LAN IP";
    return false;
  }
  if (strlen(host) >= hostLen) {
    err = "Broker host too long";
    return false;
  }
  strncpy(hostOut, host, hostLen - 1);
  hostOut[hostLen - 1] = '\0';

  uint16_t port = 1883;
  if (root.containsKey("mqttBrokerPort")) {
    port = root["mqttBrokerPort"].as<uint16_t>();
  } else {
    const MvDeviceConfig* cfg = mvStoreActive();
    if (cfg && cfg->mqttBrokerPort) port = cfg->mqttBrokerPort;
  }
  if (!port) port = 1883;
  bool tls = false;
  if (root.containsKey("mqttUseTls")) tls = root["mqttUseTls"].as<uint8_t>() ? true : false;
  else {
    const MvDeviceConfig* cfg = mvStoreActive();
    if (cfg && cfg->mqttUseTls) tls = true;
  }
  if (port == 8883) tls = true;
  if (tls && port == 1883) port = 8883;
  if (portOut) *portOut = port;
  if (tlsOut) *tlsOut = tls;

  const char* user = root["mqttUsername"].is<const char*>() ? root["mqttUsername"].as<const char*>() : "";
  if (!user) user = "";
  if (!user[0] && tls) user = MV_MQTT_SKETCH_USER_DEFAULT;
  if (user[0] && strlen(user) >= userLen) {
    err = "MQTT username too long";
    return false;
  }
  if (userOut) {
    strncpy(userOut, user, userLen - 1);
    userOut[userLen - 1] = '\0';
  }

  const char* pass = root["mqttPassword"].is<const char*>() ? root["mqttPassword"].as<const char*>() : "";
  if (!pass) pass = "";
  if (pass[0] && strlen(pass) >= passLen) {
    /* Browser autofill often dumps a vault secret ≥48 chars into this box. */
    if (tls) pass = "";
    else {
      err = "MQTT password too long (max 79 chars)";
      return false;
    }
  }
  if (passOut) {
    passOut[0] = '\0';
    if (pass[0]) {
      strncpy(passOut, pass, passLen - 1);
      passOut[passLen - 1] = '\0';
    } else if (tls && MV_MQTT_SKETCH_PASS_DEFAULT[0]) {
      strncpy(passOut, MV_MQTT_SKETCH_PASS_DEFAULT, passLen - 1);
      passOut[passLen - 1] = '\0';
    }
  }
  return true;
}

static void fillMqttTestStatusJson(String& jsonOut) {
  bool pending = false, done = false, ok = false, tls = false;
  int state = -2;
  uint16_t port = 1883;
  char err[160];
  char broker[64];
  err[0] = '\0';
  broker[0] = '\0';
  mvMqttTestStatus(&pending, &done, &ok, &state, err, sizeof(err), broker, sizeof(broker), &port, &tls);
  StaticJsonDocument<384> out;
  out["pending"] = pending;
  out["done"] = done;
  out["ok"] = ok && done;
  out["broker"] = broker;
  out["port"] = port;
  out["tls"] = tls;
  out["state"] = state;
  if (done && ok) out["message"] = "Published setup-test ping — credentials saved for live MQTT";
  if (done && !ok) out["error"] = err[0] ? err : "MQTT test failed";
  serializeJson(out, jsonOut);
}

static bool queueMqttTestFromBody(const String& body, String& jsonOut, int& httpCode) {
  httpCode = 400;
  if (body.length() == 0) {
    jsonOut = "{\"error\":\"missing body\"}";
    return false;
  }
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body)) {
    jsonOut = "{\"error\":\"invalid json\"}";
    return false;
  }
  char host[64];
  char user[32];
  char pass[MV_MQTT_PASSWORD_SIZE];
  uint16_t port = 1883;
  bool tls = false;
  String err;
  if (!parseMqttTestBody(doc.as<JsonObject>(), host, sizeof(host), &port, user, sizeof(user), pass, sizeof(pass), &tls, err)) {
    jsonOut = String("{\"error\":\"") + err + "\"}";
    return false;
  }
  if (!mvMqttTestQueue(host, port, user[0] ? user : nullptr, pass[0] ? pass : nullptr, tls)) {
    jsonOut = "{\"error\":\"MQTT test already running\"}";
    httpCode = 409;
    return false;
  }
  StaticJsonDocument<256> out;
  out["queued"] = true;
  out["pending"] = true;
  out["broker"] = host;
  out["port"] = port;
  out["tls"] = tls;
  httpCode = 202;
  serializeJson(out, jsonOut);
  return true;
}

static void handleSetupMqttTest(Stream& client, const String& method, const String& path,
                                const String& body, const String& headerBlock) {
  (void)path;
  (void)headerBlock;
  String json;
  int code = 200;
  if (method == "GET") {
    fillMqttTestStatusJson(json);
  } else {
    queueMqttTestFromBody(body, json, code);
  }
  mvHttpSendResponse(client, code, "application/json", json);
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
  mvHttpAddRoute("GET", "/api/setup/mqtt-test", handleSetupMqttTest);
  mvHttpAddRoute("POST", "/api/setup/mqtt-test", handleSetupMqttTest);
  mvHttpAddRoute("POST", "/api/setup/reboot", handleSetupReboot);
}
#else
void mvSetupRegisterRoutes() {}
#endif

#ifdef MV_HAS_WIFI
void mvSetupHandleClient(WiFiClient& client) {
  mvHttpServeConnection(client);
}
#endif
