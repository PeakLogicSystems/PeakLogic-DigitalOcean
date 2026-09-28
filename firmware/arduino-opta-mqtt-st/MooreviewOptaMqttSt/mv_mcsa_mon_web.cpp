#include "mv_mcsa_mon.h"
#include "mv_config.h"
#include "mv_http.h"
#include "mv_watchdog.h"
#include "mv_web_nav.h"
#include <ArduinoJson.h>
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER

static const char MV_MCSA_MON_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PeakLogic Opta — MCSA Monitor</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;margin:1rem;background:#f1f5f9;color:#0f172a}
h1{font-size:1.25rem}h2{font-size:1rem;margin-top:1rem;color:#49104F}
.card{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:1rem;margin:.75rem 0}
label{display:block;margin:.35rem 0;font-size:.9rem}
input,select{width:100%;max-width:12rem;padding:.35rem .5rem}
table{border-collapse:collapse;width:100%;font-size:.85rem;margin:.5rem 0}
th,td{border:1px solid #e2e8f0;padding:.35rem .5rem;text-align:left}
th{background:#efd9f2}
button{padding:.45rem .9rem;border:1px solid #64748b;border-radius:6px;background:#e2e8f0;cursor:pointer;margin:.15rem .25rem .15rem 0}
button.primary{background:#49104F;color:#fff;border-color:#49104F}
.muted{color:#64748b;font-size:.85rem}
.ok-box{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:.5rem;border-radius:6px;font-size:.85rem;margin:.5rem 0}
.err-box{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:.5rem;border-radius:6px;font-size:.85rem;margin:.5rem 0}
.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.flt{font-weight:700;color:#991b1b}
.hidden{display:none}
)HTML" MV_WEB_NAV_CSS R"HTML(
</style></head><body>
)HTML" MV_WEB_NAV_MCSA_ACTIVE R"HTML(
<h1>MCSA monitor — Opta</h1>
<p class="muted">Configure <code>deviceType</code> load classes, motor poles/slip, per-CT fan/pump/compressor/turbine counts, and HVAC env (T1–T4, water rope). Telemetry publishes <code>mcsa[]</code> and <code>env{}</code> on MQTT Parc.</p>
<div class="card"><h2>Live</h2>
<label><input type="checkbox" id="liveEn" checked> Auto-refresh (1 s)</label>
<table><thead><tr><th>Point</th><th>Value</th><th>Note</th></tr></thead>
<tbody id="liveRows"></tbody></table>
<div id="liveMsg" class="muted"></div></div>
<div class="card"><h2>Application</h2>
<label><input type="checkbox" id="enabled"> Enable MCSA monitor (NV)</label>
<div class="row">
<label>I/O layout<select id="ioLayout">
<option value="0">Lift duplex — I1–I6 CTs</option>
<option value="1">HVAC — I1–I2 CT, I3–I6 NTC, I7 rope, I8 WR DI</option>
</select></label>
<label>deviceType (load class)<select id="deviceType">
<option value="0">0 — base (rotor/bearing/ecc/stator)</option>
<option value="1">1 — fan</option>
<option value="2">2 — pump</option>
<option value="3">3 — compressor</option>
<option value="4">4 — turbine</option>
<option value="5">5 — all loads</option>
</select></label>
</div>
<p class="muted">Load groups: fan when type 1 or 5, pump 2 or 5, compressor 3 or 5, turbine 4 or 5.</p>
</div>
<div class="card" id="motorsCard"><h2>Motors (lift6 layout — per-motor CT wiring)</h2>
<p class="muted">Each motor: <b>1P</b> = one CT on line/run; <b>1P+cap</b> = run CT + start-winding CT (end-of-start = start CT drops); <b>3P</b> = one CT per phase. CT numbers are Opta inputs I1–I6.</p>
<table><thead><tr><th>Motor</th><th>En</th><th>Wiring</th><th>Run CT</th><th>Start CT</th><th>Ph B</th><th>Ph C</th><th>Asset ID</th><th>Start tag</th></tr></thead>
<tbody id="motorRows"></tbody></table>
</div>
<div class="card"><h2>Motor</h2>
<div class="row">
<label>Line freq (Hz)<input id="lineFreqHz" type="number" step="0.1" min="40" max="70"></label>
<label>Poles<input id="numPoles" type="number" min="2" max="16" step="2"></label>
<label>Slip (pu)<input id="slip" type="number" step="0.001" min="0.001" max="0.2"></label>
</div>
</div>
<div class="card"><h2>Per-CT load counts</h2>
<table><thead><tr><th>CT</th><th>En</th><th>Fan blades</th><th>Impeller vanes</th><th>Comp lobes</th><th>Turbine blades</th></tr></thead>
<tbody id="chRows"></tbody></table>
</div>
<div class="card" id="hvacCard"><h2>HVAC env (layout = HVAC)</h2>
<label><input type="checkbox" id="driveRelays"> Drive R1=COMP_FLT, R2=FAN_FLT, R3=WR_DETECT</label>
<div class="row">
<label>T1 label<input id="t0"></label><label>T2 label<input id="t1"></label>
<label>T3 label<input id="t2"></label><label>T4 label<input id="t3"></label>
</div>
<div class="row">
<label>NTC Vsupply<input id="vs" type="number" step="0.1"></label>
<label>R fixed (Ω)<input id="rf" type="number" step="1"></label>
<label>R 25°C (Ω)<input id="r25" type="number" step="1"></label>
<label>Beta<input id="beta" type="number" step="1"></label>
</div>
<div class="row">
<label>Rope threshold (mV)<input id="wrTh" type="number" step="10"></label>
<label>Wet when<select id="wrPol"><option value="1">mV ≥ threshold</option><option value="0">mV ≤ threshold</option></select></label>
</div>
</div>
<div class="row" style="margin-top:.75rem">
<button class="primary" id="btnSave">Save</button>
<button id="btnPresetLift">Preset: 3P duplex</button>
<button id="btnPreset1pCap">Preset: 1P+cap duplex</button>
<button id="btnPreset1p">Preset: 1P no cap ×2</button>
<button id="btnPresetHvac">Preset: HVAC RTU</button>
<button id="btnPresetFacilityCond">Preset: facility condenser</button>
<button id="btnPresetSplitAhu">Preset: split unit AHU</button>
<button id="btnPresetSplitCond">Preset: split unit cond</button>
<button id="btnReset">Reset defaults</button>
</div>
<p id="cfgMsg" class="muted"></p>
<script>
function fmt(n,d){return Number(n).toFixed(d!=null?d:2);}
function motorInputs(c){
  const m=c.motors||[];
  const defs=[
    {wiring:2,ctRun:1,ctStart:0,ctPhaseB:2,ctPhaseC:3,assetId:'pump-1',startMsTag:'MOTOR1_START_MS'},
    {wiring:2,ctRun:4,ctStart:0,ctPhaseB:5,ctPhaseC:6,assetId:'pump-2',startMsTag:'MOTOR2_START_MS'}
  ];
  motorRows.innerHTML=[0,1].map(i=>{
    const r=m[i]||{}; const d=defs[i];
    const w=r.wiring!=null?r.wiring:d.wiring;
    const cap=w===1;
    const three=w===2;
    return `<tr>
      <td>M${i+1}</td>
      <td><input type="checkbox" id="men${i}" ${r.enabled!==false?'checked':''}></td>
      <td><select id="mw${i}">
        <option value="0" ${w===0?'selected':''}>1P (no cap)</option>
        <option value="1" ${w===1?'selected':''}>1P + start cap</option>
        <option value="2" ${w===2?'selected':''}>3P</option>
      </select></td>
      <td><input id="mrun${i}" type="number" min="1" max="6" value="${r.ctRun||d.ctRun}" style="max-width:4rem"></td>
      <td><input id="mst${i}" type="number" min="0" max="6" value="${r.ctStart||0}" style="max-width:4rem" ${cap?'':'disabled'}></td>
      <td><input id="mB${i}" type="number" min="0" max="6" value="${r.ctPhaseB||d.ctPhaseB}" style="max-width:4rem" ${three?'':'disabled'}></td>
      <td><input id="mC${i}" type="number" min="0" max="6" value="${r.ctPhaseC||d.ctPhaseC}" style="max-width:4rem" ${three?'':'disabled'}></td>
      <td><input id="mass${i}" value="${r.assetId||d.assetId}" style="max-width:7rem"></td>
      <td><input id="mtag${i}" value="${r.startMsTag||d.startMsTag}" style="max-width:9rem"></td>
    </tr>`;
  }).join('');
  [0,1].forEach(i=>{
    const sel=document.getElementById('mw'+i);
    if(!sel) return;
    sel.onchange=()=>{
      const w=+sel.value;
      document.getElementById('mst'+i).disabled=w!==1;
      document.getElementById('mB'+i).disabled=w!==2;
      document.getElementById('mC'+i).disabled=w!==2;
      if(w===1){ document.getElementById('mst'+i).value=+document.getElementById('mrun'+i).value+1; }
      if(w===2){
        const run=+document.getElementById('mrun'+i).value;
        document.getElementById('mB'+i).value=run+1;
        document.getElementById('mC'+i).value=run+2;
      }
    };
  });
}
function chInputs(c){
  const ch=c.channels||[];
  chRows.innerHTML=ch.map((r,i)=>`<tr>
    <td>I${i+1}</td>
    <td><input type="checkbox" id="en${i}" ${r.enable?'checked':''}></td>
    <td><input id="fb${i}" type="number" min="1" max="64" value="${r.fanBlades||6}" style="max-width:5rem"></td>
    <td><input id="iv${i}" type="number" min="1" max="64" value="${r.impellerVanes||5}" style="max-width:5rem"></td>
    <td><input id="cl${i}" type="number" min="1" max="64" value="${r.compressorLobes||4}" style="max-width:5rem"></td>
    <td><input id="tb${i}" type="number" min="1" max="128" value="${r.turbineBlades||24}" style="max-width:5rem"></td>
  </tr>`).join('');
}
function syncHvac(){
  hvacCard.classList.toggle('hidden', ioLayout.value!=='1');
  motorsCard.classList.toggle('hidden', ioLayout.value!=='0');
}
async function load(){
  const r=await fetch('/api/mcsa'); const j=await r.json();
  if(!j.ok){ liveMsg.textContent=j.error||'load failed'; return; }
  const c=j.config||{}, l=j.live||{};
  enabled.checked=!!c.enabled;
  ioLayout.value=String(c.ioLayout!=null?c.ioLayout:0);
  deviceType.value=String(c.deviceType!=null?c.deviceType:2);
  lineFreqHz.value=c.lineFreqHz!=null?c.lineFreqHz:60;
  numPoles.value=c.numPoles!=null?c.numPoles:4;
  slip.value=c.slip!=null?c.slip:0.03;
  driveRelays.checked=!!c.driveFaultRelays;
  t0.value=c.tLabel0||'discharge'; t1.value=c.tLabel1||'suction';
  t2.value=c.tLabel2||'ambient'; t3.value=c.tLabel3||'pan';
  vs.value=c.ntcVsupply!=null?c.ntcVsupply:24;
  rf.value=c.ntcRfixed!=null?c.ntcRfixed:10000;
  r25.value=c.ntcR25!=null?c.ntcR25:10000;
  beta.value=c.ntcBeta!=null?c.ntcBeta:3950;
  wrTh.value=c.wrThresholdMv!=null?c.wrThresholdMv:2500;
  wrPol.value=c.wrDetectAbove?'1':'0';
  motorInputs(c); chInputs(c); syncHvac();
  const rows=[
    ['Mode', (l.deviceTypeName||'?')+' / layout '+(c.ioLayout===1?'HVAC':'lift6'), enabled.checked?'ON':'off'],
    ['Motors', String((c.motorCount||2)), 'configured on page'],
    ['Poles / slip', (c.numPoles||4)+' / '+fmt(c.slip,3), fmt(c.lineFreqHz,1)+' Hz']
  ];
  (l.motors||[]).forEach(m=>{
    const w=['1P','1P+cap','3P'][m.wiring]||'?';
    rows.push(['M'+(m.index||'?')+' '+w, fmt(m.runAmps,2)+' A run', fmt(m.senseAmps,2)+' A sense']);
  });
  (l.ctAmps||[]).forEach(a=>{
    if(!a.isCt) return;
    rows.push(['I'+a.ch+' CT', fmt(a.amps,2)+' A', a.enable?'enabled':'off']);
  });
  if(c.ioLayout===1){
    rows.push(['Compressor', fmt(l.compAmps,2)+' A', l.compFlt?(l.compLabel||'FAULT'):(l.compLabel||'ok')]);
    rows.push(['Fan', fmt(l.fanAmps,2)+' A', l.fanFlt?(l.fanLabel||'FAULT'):(l.fanLabel||'ok')]);
    rows.push(['Water rope', fmt(l.waterRopeMv,0)+' mV', l.wrDetect?'WET':'dry']);
    (l.temps||[]).forEach(t=>rows.push([t.id+' '+t.label, fmt(t.c,1)+' °C','I'+t.ch]));
  }
  liveRows.innerHTML=rows.map(r=>{
    const bad=/FAULT|WET/.test(String(r[2]));
    return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td class="'+(bad?'flt':'')+'">'+r[2]+'</td></tr>';
  }).join('');
}
function collectCh(){
  const channels=[];
  for(let i=0;i<6;i++){
    channels.push({
      enable:!!document.getElementById('en'+i)?.checked,
      fanBlades:+document.getElementById('fb'+i)?.value||6,
      impellerVanes:+document.getElementById('iv'+i)?.value||5,
      compressorLobes:+document.getElementById('cl'+i)?.value||4,
      turbineBlades:+document.getElementById('tb'+i)?.value||24
    });
  }
  return channels;
}
function collectMotors(){
  const motors=[];
  for(let i=0;i<2;i++){
    const w=+document.getElementById('mw'+i)?.value||0;
    motors.push({
      enabled:!!document.getElementById('men'+i)?.checked,
      wiring:w,
      ctRun:+document.getElementById('mrun'+i)?.value||1,
      ctStart:w===1?+document.getElementById('mst'+i)?.value||0:0,
      ctPhaseB:w===2?+document.getElementById('mB'+i)?.value||0:0,
      ctPhaseC:w===2?+document.getElementById('mC'+i)?.value||0:0,
      assetId:document.getElementById('mass'+i)?.value||('motor-'+(i+1)),
      startMsTag:document.getElementById('mtag'+i)?.value||('MOTOR'+(i+1)+'_START_MS')
    });
  }
  return motors;
}
btnSave.onclick=async()=>{
  const body={
    enabled:enabled.checked, ioLayout:+ioLayout.value, deviceType:+deviceType.value,
    lineFreqHz:+lineFreqHz.value,
    numPoles:+numPoles.value, slip:+slip.value, driveFaultRelays:driveRelays.checked,
    motorCount:2, motors:collectMotors(),
    tLabel0:t0.value,tLabel1:t1.value,tLabel2:t2.value,tLabel3:t3.value,
    ntcVsupply:+vs.value,ntcRfixed:+rf.value,ntcR25:+r25.value,ntcBeta:+beta.value,
    wrThresholdMv:+wrTh.value,wrDetectAbove:wrPol.value==='1', channels:collectCh()
  };
  const r=await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json(); cfgMsg.textContent=j.ok?'Saved':(j.error||'save failed'); load();
};
btnPresetLift.onclick=async()=>{
  ioLayout.value='0'; deviceType.value='2'; enabled.checked=true;
  motorRows.innerHTML='';
  await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    enabled:true,ioLayout:0,deviceType:2,motorCount:2,
    motors:[
      {enabled:true,wiring:2,ctRun:1,ctStart:0,ctPhaseB:2,ctPhaseC:3,assetId:'pump-1',startMsTag:'MOTOR1_START_MS'},
      {enabled:true,wiring:2,ctRun:4,ctStart:0,ctPhaseB:5,ctPhaseC:6,assetId:'pump-2',startMsTag:'MOTOR2_START_MS'}
    ]
  })}); load();
};
btnPreset1pCap.onclick=async()=>{
  ioLayout.value='0'; deviceType.value='2'; enabled.checked=true;
  await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    enabled:true,ioLayout:0,deviceType:2,motorCount:2,
    motors:[
      {enabled:true,wiring:1,ctRun:1,ctStart:2,ctPhaseB:0,ctPhaseC:0,assetId:'pump-1',startMsTag:'MOTOR1_START_MS'},
      {enabled:true,wiring:1,ctRun:3,ctStart:4,ctPhaseB:0,ctPhaseC:0,assetId:'pump-2',startMsTag:'MOTOR2_START_MS'}
    ]
  })}); load();
};
btnPreset1p.onclick=async()=>{
  ioLayout.value='0'; deviceType.value='0'; enabled.checked=true;
  await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    enabled:true,ioLayout:0,deviceType:0,motorCount:2,
    motors:[
      {enabled:true,wiring:0,ctRun:1,ctStart:0,ctPhaseB:0,ctPhaseC:0,assetId:'motor-1',startMsTag:'MOTOR1_START_MS'},
      {enabled:true,wiring:0,ctRun:2,ctStart:0,ctPhaseB:0,ctPhaseC:0,assetId:'motor-2',startMsTag:'MOTOR2_START_MS'}
    ]
  })}); load();
};
btnPresetHvac.onclick=async()=>{
  ioLayout.value='1'; deviceType.value='5'; enabled.checked=true;
  await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    enabled:true,ioLayout:1,deviceType:5,motorCount:3,
    motors:[
      {enabled:true,wiring:1,ctRun:2,ctStart:1,assetId:'blower',startMsTag:'MOTOR1_START_MS'},
      {enabled:true,wiring:1,ctRun:4,ctStart:3,assetId:'fan',startMsTag:'MOTOR2_START_MS'},
      {enabled:true,wiring:1,ctRun:6,ctStart:5,assetId:'comp',startMsTag:'MOTOR3_START_MS'}
    ],
    tCh:[129,128,130,131],
    tLabel:['high','low','supply','return']
  })}); load();
};
btnPresetFacilityCond.onclick=async()=>{
  ioLayout.value='1'; deviceType.value='5'; enabled.checked=true;
  await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    enabled:true,ioLayout:1,deviceType:5,motorCount:4,
    motors:[
      {enabled:true,wiring:1,ctRun:2,ctStart:1,assetId:'fan1',startMsTag:'MOTOR1_START_MS'},
      {enabled:true,wiring:1,ctRun:4,ctStart:3,assetId:'fan2',startMsTag:'MOTOR2_START_MS'},
      {enabled:true,wiring:1,ctRun:6,ctStart:5,assetId:'comp1',startMsTag:'MOTOR3_START_MS'},
      {enabled:true,wiring:1,ctRun:8,ctStart:7,assetId:'comp2',startMsTag:'MOTOR4_START_MS'}
    ],
    tCh:[129,128,131,130],
    tLabel:['U1 high','U1 low','U2 high','U2 low']
  })}); load();
};
btnPresetSplitAhu.onclick=async()=>{
  ioLayout.value='1'; deviceType.value='5'; enabled.checked=true;
  await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    enabled:true,ioLayout:1,deviceType:5,motorCount:1,
    motors:[{enabled:true,wiring:1,ctRun:2,ctStart:1,assetId:'blower',startMsTag:'MOTOR1_START_MS'}],
    tCh:[2,3,4,5], tLabel:['off','off','off','off']
  })}); load();
};
btnPresetSplitCond.onclick=async()=>{
  ioLayout.value='1'; deviceType.value='5'; enabled.checked=true;
  await fetch('/api/mcsa',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    enabled:true,ioLayout:1,deviceType:5,motorCount:2,
    motors:[
      {enabled:true,wiring:1,ctRun:2,ctStart:1,assetId:'fan',startMsTag:'MOTOR1_START_MS'},
      {enabled:true,wiring:1,ctRun:4,ctStart:3,assetId:'comp',startMsTag:'MOTOR2_START_MS'}
    ],
    tCh:[5,4,2,3], tLabel:['high','low','off','off']
  })}); load();
};
btnReset.onclick=async()=>{ await fetch('/api/mcsa/reset',{method:'POST'}); load(); };
ioLayout.onchange=syncHvac;
let liveTimer=setInterval(()=>{ if(liveEn.checked) load(); },1000);
load();
</script></body></html>
)HTML";

static void handlePage(Stream& client, const String& method, const String& path,
                       const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvHttpSendResponseCStr(client, 200, "text/html; charset=utf-8", MV_MCSA_MON_HTML);
}

static void appendConfig(JsonObject cfg) {
  const MvMcsaMonConfig* c = mvMcsaMonActive();
  cfg["enabled"] = c->enabled != 0;
  cfg["deviceType"] = c->deviceType;
  cfg["ioLayout"] = c->ioLayout;
  cfg["motorCount"] = c->motorCount;
  cfg["numPoles"] = c->numPoles;
  cfg["lineFreqHz"] = c->lineFreqHz;
  cfg["slip"] = c->slip;
  cfg["driveFaultRelays"] = c->driveFaultRelays != 0;
  cfg["wrDetectAbove"] = c->wrDetectAbove != 0;
  cfg["wrDin"] = c->wrDin;
  cfg["wrCh"] = c->wrCh;
  cfg["ntcVsupply"] = c->ntcVsupply;
  cfg["ntcRfixed"] = c->ntcRfixed;
  cfg["ntcRopt"] = c->ntcRopt;
  cfg["ntcR25"] = c->ntcR25;
  cfg["ntcBeta"] = c->ntcBeta;
  cfg["wrThresholdMv"] = c->wrThresholdMv;
  cfg["tLabel0"] = c->tLabel[0];
  cfg["tLabel1"] = c->tLabel[1];
  cfg["tLabel2"] = c->tLabel[2];
  cfg["tLabel3"] = c->tLabel[3];
  JsonArray motors = cfg.createNestedArray("motors");
  const uint8_t nm = c->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : c->motorCount;
  for (uint8_t i = 0; i < nm; i++) {
    const MvMcsaMotorSlot* m = &c->motor[i];
    JsonObject row = motors.createNestedObject();
    row["enabled"] = m->enabled != 0;
    row["wiring"] = m->wiring;
    row["ctRun"] = m->ctRun + 1;
    row["ctStart"] = m->ctStart <= 5 ? (int)(m->ctStart + 1) : 0;
    row["ctPhaseB"] = m->ctPhaseB <= 5 ? (int)(m->ctPhaseB + 1) : 0;
    row["ctPhaseC"] = m->ctPhaseC <= 5 ? (int)(m->ctPhaseC + 1) : 0;
    row["assetId"] = m->assetId;
    row["startMsTag"] = m->startMsTag;
  }
  JsonArray ch = cfg.createNestedArray("channels");
  for (uint8_t i = 0; i < MV_MCSA_MON_CH; i++) {
    JsonObject row = ch.createNestedObject();
    row["enable"] = c->chEnable[i] != 0;
    row["fanBlades"] = c->fanBlades[i];
    row["impellerVanes"] = c->impellerVanes[i];
    row["compressorLobes"] = c->compressorLobes[i];
    row["turbineBlades"] = c->turbineBlades[i];
  }
}

static void handleGet(Stream& client, const String& method, const String& path,
                      const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvWatchdogNoteActivity();
  StaticJsonDocument<4096> doc;
  doc["ok"] = true;
  appendConfig(doc.createNestedObject("config"));
  mvMcsaMonAppendLive(doc.createNestedObject("live"));
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, 200, "application/json", out);
}

static void copyLabel(char* dst, JsonVariantConst v) {
  if (!v.is<const char*>()) return;
  strncpy(dst, v.as<const char*>(), 15);
  dst[15] = '\0';
}

static uint8_t jsonCtCh(JsonVariantConst v) {
  if (!v.is<int>()) return MV_MOTOR_CT_NONE;
  const int n = v.as<int>();
  if (n < 1 || n > 8) return MV_MOTOR_CT_NONE;
  return (uint8_t)(n - 1);
}

static void copyMotorLabel(char* dst, size_t dstLen, JsonVariantConst v) {
  if (!v.is<const char*>()) return;
  strncpy(dst, v.as<const char*>(), dstLen - 1);
  dst[dstLen - 1] = '\0';
}

static void handlePut(Stream& client, const String& method, const String& path,
                      const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  if (body.length() == 0) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<3072> doc;
  if (deserializeJson(doc, body)) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  MvMcsaMonConfig cfg;
  memcpy(&cfg, mvMcsaMonActive(), sizeof(cfg));
  if (doc["enabled"].is<bool>()) cfg.enabled = doc["enabled"].as<bool>() ? 1 : 0;
  if (doc["deviceType"].is<int>()) cfg.deviceType = (uint8_t)doc["deviceType"].as<int>();
  if (doc["ioLayout"].is<int>()) cfg.ioLayout = (uint8_t)doc["ioLayout"].as<int>();
  if (doc["motorCount"].is<int>()) cfg.motorCount = (uint8_t)doc["motorCount"].as<int>();
  if (doc["numPoles"].is<int>()) cfg.numPoles = (uint8_t)doc["numPoles"].as<int>();
  if (doc["lineFreqHz"].is<float>() || doc["lineFreqHz"].is<double>()) cfg.lineFreqHz = doc["lineFreqHz"].as<float>();
  if (doc["slip"].is<float>() || doc["slip"].is<double>()) cfg.slip = doc["slip"].as<float>();
  if (doc["driveFaultRelays"].is<bool>()) cfg.driveFaultRelays = doc["driveFaultRelays"].as<bool>() ? 1 : 0;
  if (doc["wrDetectAbove"].is<bool>()) cfg.wrDetectAbove = doc["wrDetectAbove"].as<bool>() ? 1 : 0;
  if (doc["ntcVsupply"].is<float>() || doc["ntcVsupply"].is<double>()) cfg.ntcVsupply = doc["ntcVsupply"].as<float>();
  if (doc["ntcRfixed"].is<float>() || doc["ntcRfixed"].is<double>()) cfg.ntcRfixed = doc["ntcRfixed"].as<float>();
  if (doc["ntcR25"].is<float>() || doc["ntcR25"].is<double>()) cfg.ntcR25 = doc["ntcR25"].as<float>();
  if (doc["ntcBeta"].is<float>() || doc["ntcBeta"].is<double>()) cfg.ntcBeta = doc["ntcBeta"].as<float>();
  if (doc["wrThresholdMv"].is<float>() || doc["wrThresholdMv"].is<double>()) cfg.wrThresholdMv = doc["wrThresholdMv"].as<float>();
  copyLabel(cfg.tLabel[0], doc["tLabel0"]);
  copyLabel(cfg.tLabel[1], doc["tLabel1"]);
  copyLabel(cfg.tLabel[2], doc["tLabel2"]);
  copyLabel(cfg.tLabel[3], doc["tLabel3"]);
  if (doc["motors"].is<JsonArray>()) {
    JsonArray arr = doc["motors"].as<JsonArray>();
    uint8_t i = 0;
    for (JsonObject row : arr) {
      if (i >= MV_MCSA_MAX_MOTORS) break;
      MvMcsaMotorSlot* m = &cfg.motor[i];
      if (row["enabled"].is<bool>()) m->enabled = row["enabled"].as<bool>() ? 1 : 0;
      if (row["wiring"].is<int>()) m->wiring = (uint8_t)row["wiring"].as<int>();
      if (row["ctRun"].is<int>()) m->ctRun = jsonCtCh(row["ctRun"]);
      if (row["ctStart"].is<int>()) {
        const int n = row["ctStart"].as<int>();
        m->ctStart = n > 0 ? jsonCtCh(row["ctStart"]) : MV_MOTOR_CT_NONE;
      }
      if (row["ctPhaseB"].is<int>()) {
        const int n = row["ctPhaseB"].as<int>();
        m->ctPhaseB = n > 0 ? jsonCtCh(row["ctPhaseB"]) : MV_MOTOR_CT_NONE;
      }
      if (row["ctPhaseC"].is<int>()) {
        const int n = row["ctPhaseC"].as<int>();
        m->ctPhaseC = n > 0 ? jsonCtCh(row["ctPhaseC"]) : MV_MOTOR_CT_NONE;
      }
      copyMotorLabel(m->assetId, sizeof(m->assetId), row["assetId"]);
      copyMotorLabel(m->startMsTag, sizeof(m->startMsTag), row["startMsTag"]);
      i++;
    }
    if (i > 0) cfg.motorCount = i;
  }
  if (doc["channels"].is<JsonArray>()) {
    JsonArray arr = doc["channels"].as<JsonArray>();
    uint8_t i = 0;
    for (JsonObject row : arr) {
      if (i >= MV_MCSA_MON_CH) break;
      if (row["enable"].is<bool>()) cfg.chEnable[i] = row["enable"].as<bool>() ? 1 : 0;
      if (row["fanBlades"].is<int>()) cfg.fanBlades[i] = (uint8_t)row["fanBlades"].as<int>();
      if (row["impellerVanes"].is<int>()) cfg.impellerVanes[i] = (uint8_t)row["impellerVanes"].as<int>();
      if (row["compressorLobes"].is<int>()) cfg.compressorLobes[i] = (uint8_t)row["compressorLobes"].as<int>();
      if (row["turbineBlades"].is<int>()) cfg.turbineBlades[i] = (uint8_t)row["turbineBlades"].as<int>();
      i++;
    }
  }
  if (!mvMcsaMonSave(&cfg)) {
    mvHttpSendResponseCStr(client, 500, "application/json", "{\"error\":\"save failed\"}");
    return;
  }
  mvHttpSendResponseCStr(client, 200, "application/json", "{\"ok\":true}");
}

static void handleReset(Stream& client, const String& method, const String& path,
                        const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  MvMcsaMonConfig cfg;
  mvMcsaMonDefaults(&cfg);
  const bool ok = mvMcsaMonSave(&cfg);
  StaticJsonDocument<64> out;
  out["ok"] = ok;
  String json;
  serializeJson(out, json);
  mvHttpSendResponse(client, ok ? 200 : 500, "application/json", json);
}

void mvMcsaMonRegisterRoutes() {
  mvHttpAddRoute("GET", "/mcsa", handlePage);
  mvHttpAddRoute("GET", "/hvac", handlePage); /* alias */
  mvHttpAddRoute("GET", "/api/mcsa", handleGet);
  mvHttpAddRoute("PUT", "/api/mcsa", handlePut);
  mvHttpAddRoute("POST", "/api/mcsa/reset", handleReset);
  mvHttpAddRoute("GET", "/api/hvac", handleGet);
  mvHttpAddRoute("PUT", "/api/hvac", handlePut);
  mvHttpAddRoute("POST", "/api/hvac/reset", handleReset);
}

#else
void mvMcsaMonRegisterRoutes() {}
#endif
