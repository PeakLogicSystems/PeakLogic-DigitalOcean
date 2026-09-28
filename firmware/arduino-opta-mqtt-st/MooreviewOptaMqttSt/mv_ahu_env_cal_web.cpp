#include "mv_ahu_env_cal.h"
#include "mv_config.h"
#include "mv_http.h"
#include "mv_watchdog.h"
#include "mv_web_nav.h"
#include <ArduinoJson.h>
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER

static const char MV_AHU_ENV_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PeakLogic Opta — AHU env calibration</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;margin:1rem;background:#f1f5f9;color:#0f172a}
h1{font-size:1.25rem}h2{font-size:1rem;margin-top:1rem;color:#49104F}
.card{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:1rem;margin:.75rem 0}
label{display:block;margin:.35rem 0;font-size:.9rem}
input,select{width:100%;max-width:14rem;padding:.35rem .5rem}
table{border-collapse:collapse;width:100%;font-size:.85rem;margin:.5rem 0}
th,td{border:1px solid #e2e8f0;padding:.35rem .5rem;text-align:left}
th{background:#efd9f2}
button{padding:.45rem .9rem;border:1px solid #64748b;border-radius:6px;background:#e2e8f0;cursor:pointer;margin:.15rem .25rem .15rem 0}
button.primary{background:#49104F;color:#fff;border-color:#49104F}
.muted{color:#64748b;font-size:.85rem}
.ok-box{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:.5rem;border-radius:6px;font-size:.85rem;margin:.5rem 0}
.err-box{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:.5rem;border-radius:6px;font-size:.85rem;margin:.5rem 0}
.row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}
.hidden{display:none}
</style></head><body>
)HTML" MV_WEB_NAV_AHU_ENV_ACTIVE R"HTML(
<h1>AHU env calibration — dual air handler</h1>
<p class="muted">Facility layout: base <b>I1–I4</b> fan start/run CT (<a href="/ct-cal">Calibrate CT</a>), base <b>I5–I8</b> NTC, D1608E <b>X1_IRAW1–2</b> pan leak (analog mV). Enable after wiring; publishes <code>AHU*_SUPPLY_TEMP_F</code>, <code>AHU*_PAN_LEAK</code>.</p>
<div class="card"><h2>Live points</h2>
<label><input type="checkbox" id="liveEn" checked> Auto-refresh (1 s)</label>
<table><thead><tr><th>Point</th><th>Input</th><th>Live</th><th>Enabled</th></tr></thead>
<tbody id="liveRows"></tbody></table>
<div id="liveMsg" class="muted"></div></div>
<div class="card"><h2>General</h2>
<label><input type="checkbox" id="enabled"> Enable AHU env processor (NV)</label>
</div>
<div class="card"><h2>Selected point</h2>
<div class="row">
<label>Point<select id="selPoint">
<option value="ntc0">NTC — AHU1 supply (I5)</option>
<option value="ntc1">NTC — AHU1 return (I6)</option>
<option value="ntc2">NTC — AHU2 supply (I7)</option>
<option value="ntc3">NTC — AHU2 return (I8)</option>
<option value="leak0">Leak — AHU1 (X1_IRAW1)</option>
<option value="leak1">Leak — AHU2 (X1_IRAW2)</option>
</select></label>
<label><input type="checkbox" id="ptEn"> Point enabled</label>
</div>
<div id="ntcFields">
<div class="row">
<label>Base Opta I#<input id="ntcInput" type="number" min="1" max="8" step="1"></label>
<label>Label<input id="ntcLabel" maxlength="19"></label>
</div>
<label>V supply<input id="ntcVs" type="number" step="0.1"></label>
<label>R fixed Ω<input id="ntcRf" type="number" step="1"></label>
<label>R @25°C Ω<input id="ntcR25" type="number" step="1"></label>
<label>Beta<input id="ntcBeta" type="number" step="1"></label>
<label>Offset °F<input id="ntcOff" type="number" step="0.1"></label>
</div>
</div>
<div id="leakFields" class="hidden">
<div class="row">
<label>D1608E IRAW #<input id="leakIn" type="number" min="1" max="8" step="1"></label>
<label>Label<input id="leakLabel" maxlength="19"></label>
</div>
<div class="row">
<label>Threshold (mV)<input id="leakTh" type="number" step="10"></label>
<label>mV per raw count<input id="leakScale" type="number" step="0.01" min="0.01"></label>
<label>Wet when<select id="leakPol"><option value="1">mV ≥ threshold</option><option value="0">mV ≤ threshold</option></select></label>
</div>
</div>
<div class="row" style="margin-top:.75rem">
<button class="primary" id="btnSave">Save all to NV</button>
<button id="btnReset">Reset defaults</button>
</div>
<p id="cfgMsg" class="muted"></p></div>
<script>
let cfgCache=null;
function fmt(n,d){return Number(n).toFixed(d!=null?d:2);}
function showFields(){
  const k=selPoint.value;
  ntcFields.classList.toggle('hidden',!k.startsWith('ntc'));
  leakFields.classList.toggle('hidden',!k.startsWith('leak'));
}
function loadPointFields(){
  if(!cfgCache) return;
  const k=selPoint.value;
  showFields();
  if(k.startsWith('ntc')){
    const i=+k.slice(3); const p=cfgCache.ntc[i]||{};
    ptEn.checked=!!p.enabled;
    ntcInput.value=(p.baseInput!=null?p.baseInput:p.expInput)+1;
    ntcLabel.value=p.label||''; ntcVs.value=p.vsupply!=null?p.vsupply:24;
    ntcRf.value=p.rfixed!=null?p.rfixed:10000; ntcR25.value=p.r25!=null?p.r25:10000;
    ntcBeta.value=p.beta!=null?p.beta:3950; ntcOff.value=p.offsetF!=null?p.offsetF:0;
  } else {
    const i=+k.slice(4); const p=cfgCache.leak[i]||{};
    ptEn.checked=!!p.enabled; leakIn.value=p.expInput!=null?p.expInput+1:1;
    leakLabel.value=p.label||''; leakTh.value=p.thresholdMv!=null?p.thresholdMv:2500;
    leakScale.value=p.mvPerRaw!=null?p.mvPerRaw:1; leakPol.value=p.detectAbove?'1':'0';
  }
}
function storePointFields(){
  const k=selPoint.value;
  if(k.startsWith('ntc')){
    const i=+k.slice(3);
    cfgCache.ntc[i]={enabled:ptEn.checked?1:0,onExpansion:0,expSlot:0,expInput:0,baseInput:+ntcInput.value-1,label:ntcLabel.value,
      vsupply:+ntcVs.value,rfixed:+ntcRf.value,r25:+ntcR25.value,beta:+ntcBeta.value,offsetF:+ntcOff.value,ropt:5850};
  } else {
    const i=+k.slice(4);
    cfgCache.leak[i]={enabled:ptEn.checked?1:0,isDigital:0,onExpansion:1,expSlot:0,expInput:+leakIn.value-1,baseInput:0,label:leakLabel.value,
      thresholdMv:+leakTh.value,mvPerRaw:+leakScale.value,detectAbove:+leakPol.value?1:0};
  }
}
async function loadAll(){
  const r=await fetch('/api/ahu-env'); const j=await r.json();
  if(!j.ok){ liveMsg.textContent=j.error||'load failed'; return; }
  cfgCache=j.config||{ntc:[],leak:[]};
  enabled.checked=!!cfgCache.enabled;
  const rows=[];
  (j.live?.ntc||[]).forEach(p=>rows.push(`<tr><td>${p.label||'NTC'}</td><td>${p.onExpansion?'X1_IRAW':'I'}${p.input}</td><td>${fmt(p.tempF,1)} °F</td><td>${p.enabled?'yes':'off'}</td></tr>`));
  (j.live?.leak||[]).forEach(p=>rows.push(`<tr><td>${p.label||'Leak'}</td><td>${p.isDigital?'X1_I':'X1_IRAW'}${p.expInput||p.tag||1}</td><td>${p.isDigital?(p.wet?'WET':'dry'):fmt(p.mv,0)+' mV '+(p.wet?'WET':'dry')}</td><td>${p.enabled?'yes':'off'}</td></tr>`));
  liveRows.innerHTML=rows.join('')||'<tr><td colspan="4">No data</td></tr>';
  loadPointFields();
  liveMsg.textContent='Updated '+new Date().toLocaleTimeString();
}
selPoint.onchange=()=>{ storePointFields(); loadPointFields(); };
btnSave.onclick=async()=>{
  storePointFields();
  cfgCache.enabled=enabled.checked?1:0;
  const r=await fetch('/api/ahu-env',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfgCache)});
  const j=await r.json();
  cfgMsg.className=j.ok?'ok-box':'err-box';
  cfgMsg.textContent=j.ok?'Saved to NV. Tags update when enabled.':(j.error||'save failed');
  if(j.ok) loadAll();
};
btnReset.onclick=async()=>{
  if(!confirm('Reset AHU env calibration to defaults?')) return;
  const r=await fetch('/api/ahu-env/reset',{method:'POST'});
  const j=await r.json();
  cfgMsg.className=j.ok?'ok-box':'err-box';
  cfgMsg.textContent=j.ok?'Defaults restored.':(j.error||'failed');
  loadAll();
};
loadAll();
let liveTimer=setInterval(loadAll,1000);
liveEn.onchange=()=>{ if(liveEn.checked){ if(!liveTimer) liveTimer=setInterval(loadAll,1000);} else { clearInterval(liveTimer); liveTimer=null; }};
</script>
</body></html>
)HTML";

static void appendConfigJson(JsonObject out, const MvAhuEnvCalConfig* cfg) {
  out["enabled"] = cfg->enabled != 0;
  JsonArray ntc = out.createNestedArray("ntc");
  for (uint8_t i = 0; i < MV_AHU_NTC_POINTS; i++) {
    JsonObject row = ntc.createNestedObject();
    row["enabled"] = cfg->ntc[i].enabled;
    row["onExpansion"] = cfg->ntc[i].onExpansion != 0;
    row["expSlot"] = cfg->ntc[i].expSlot;
    row["expInput"] = cfg->ntc[i].expInput;
    row["baseInput"] = cfg->ntc[i].baseInput;
    row["label"] = cfg->ntc[i].label;
    row["vsupply"] = cfg->ntc[i].vsupply;
    row["rfixed"] = cfg->ntc[i].rfixed;
    row["ropt"] = cfg->ntc[i].ropt;
    row["r25"] = cfg->ntc[i].r25;
    row["beta"] = cfg->ntc[i].beta;
    row["offsetF"] = cfg->ntc[i].offsetF;
  }
  JsonArray leak = out.createNestedArray("leak");
  for (uint8_t i = 0; i < MV_AHU_LEAK_POINTS; i++) {
    JsonObject row = leak.createNestedObject();
    row["enabled"] = cfg->leak[i].enabled;
    row["onExpansion"] = cfg->leak[i].onExpansion != 0;
    row["expSlot"] = cfg->leak[i].expSlot;
    row["expInput"] = cfg->leak[i].expInput;
    row["baseInput"] = cfg->leak[i].baseInput;
    row["label"] = cfg->leak[i].label;
    row["thresholdMv"] = cfg->leak[i].thresholdMv;
    row["detectAbove"] = cfg->leak[i].detectAbove;
    row["mvPerRaw"] = cfg->leak[i].mvPerRaw;
  }
}

static bool parseConfigJson(const JsonDocument& doc, MvAhuEnvCalConfig* cfg) {
  memcpy(cfg, mvAhuEnvCalActive(), sizeof(*cfg));
  if (doc["enabled"].is<bool>()) cfg->enabled = doc["enabled"].as<bool>() ? 1 : 0;
  if (doc["enabled"].is<int>()) cfg->enabled = doc["enabled"].as<int>() ? 1 : 0;
  if (doc["ntc"].is<JsonArray>()) {
    JsonArrayConst ntcArr = doc["ntc"];
    uint8_t i = 0;
    for (JsonObjectConst row : ntcArr) {
      if (i >= MV_AHU_NTC_POINTS) break;
      if (row["enabled"].is<bool>()) cfg->ntc[i].enabled = row["enabled"].as<bool>() ? 1 : 0;
      if (row["onExpansion"].is<bool>()) cfg->ntc[i].onExpansion = row["onExpansion"].as<bool>() ? 1 : 0;
      if (row["onExpansion"].is<int>()) cfg->ntc[i].onExpansion = row["onExpansion"].as<int>() ? 1 : 0;
      if (row["expSlot"].is<int>()) cfg->ntc[i].expSlot = (uint8_t)row["expSlot"].as<int>();
      if (row["expInput"].is<int>()) cfg->ntc[i].expInput = (uint8_t)row["expInput"].as<int>();
      if (row["baseInput"].is<int>()) cfg->ntc[i].baseInput = (uint8_t)row["baseInput"].as<int>();
      if (row["label"].is<const char*>()) strncpy(cfg->ntc[i].label, row["label"], sizeof(cfg->ntc[i].label) - 1);
      if (row["vsupply"].is<float>() || row["vsupply"].is<double>()) cfg->ntc[i].vsupply = row["vsupply"].as<float>();
      if (row["rfixed"].is<float>() || row["rfixed"].is<double>()) cfg->ntc[i].rfixed = row["rfixed"].as<float>();
      if (row["r25"].is<float>() || row["r25"].is<double>()) cfg->ntc[i].r25 = row["r25"].as<float>();
      if (row["beta"].is<float>() || row["beta"].is<double>()) cfg->ntc[i].beta = row["beta"].as<float>();
      if (row["offsetF"].is<float>() || row["offsetF"].is<double>()) cfg->ntc[i].offsetF = row["offsetF"].as<float>();
      i++;
    }
  }
  if (doc["leak"].is<JsonArray>()) {
    JsonArrayConst leakArr = doc["leak"];
    uint8_t i = 0;
    for (JsonObjectConst row : leakArr) {
      if (i >= MV_AHU_LEAK_POINTS) break;
      if (row["enabled"].is<bool>()) cfg->leak[i].enabled = row["enabled"].as<bool>() ? 1 : 0;
      if (row["isDigital"].is<bool>()) cfg->leak[i].isDigital = row["isDigital"].as<bool>() ? 1 : 0;
      if (row["isDigital"].is<int>()) cfg->leak[i].isDigital = row["isDigital"].as<int>() ? 1 : 0;
      if (row["expInput"].is<int>()) cfg->leak[i].expInput = (uint8_t)row["expInput"].as<int>();
      if (row["baseInput"].is<int>()) cfg->leak[i].baseInput = (uint8_t)row["baseInput"].as<int>();
      if (row["onExpansion"].is<bool>()) cfg->leak[i].onExpansion = row["onExpansion"].as<bool>() ? 1 : 0;
      if (row["onExpansion"].is<int>()) cfg->leak[i].onExpansion = row["onExpansion"].as<int>() ? 1 : 0;
      if (row["label"].is<const char*>()) strncpy(cfg->leak[i].label, row["label"], sizeof(cfg->leak[i].label) - 1);
      if (row["thresholdMv"].is<float>() || row["thresholdMv"].is<double>()) cfg->leak[i].thresholdMv = row["thresholdMv"].as<float>();
      if (row["detectAbove"].is<int>()) cfg->leak[i].detectAbove = row["detectAbove"].as<int>() ? 1 : 0;
      if (row["mvPerRaw"].is<float>() || row["mvPerRaw"].is<double>()) cfg->leak[i].mvPerRaw = row["mvPerRaw"].as<float>();
      i++;
    }
  }
  return true;
}

static void handleAhuEnvPage(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method; (void)path; (void)body; (void)headerBlock;
  mvHttpSendResponseCStr(client, 200, "text/html; charset=utf-8", MV_AHU_ENV_HTML);
}

static void handleAhuEnvGet(Stream& client, const String& method, const String& path,
                            const String& body, const String& headerBlock) {
  (void)method; (void)path; (void)body; (void)headerBlock;
  mvWatchdogNoteActivity();
  StaticJsonDocument<3072> doc;
  doc["ok"] = true;
  appendConfigJson(doc.createNestedObject("config"), mvAhuEnvCalActive());
  JsonObject live = doc.createNestedObject("live");
  mvAhuEnvCalAppendLive(live);
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, 200, "application/json", out);
}

static void handleAhuEnvPut(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method; (void)path; (void)headerBlock;
  mvWatchdogNoteActivity();
  StaticJsonDocument<3072> doc;
  DeserializationError err = deserializeJson(doc, body);
  StaticJsonDocument<256> res;
  bool ok = false;
  if (err) {
    res["ok"] = false;
    res["error"] = "invalid JSON";
  } else {
    MvAhuEnvCalConfig cfg;
    parseConfigJson(doc, &cfg);
    ok = mvAhuEnvCalSave(&cfg);
    res["ok"] = ok;
    if (!ok) res["error"] = "NV save failed";
  }
  String out;
  serializeJson(res, out);
  mvHttpSendResponse(client, ok ? 200 : 500, "application/json", out);
}

static void handleAhuEnvReset(Stream& client, const String& method, const String& path,
                               const String& body, const String& headerBlock) {
  (void)method; (void)path; (void)body; (void)headerBlock;
  MvAhuEnvCalConfig cfg;
  mvAhuEnvCalDefaults(&cfg);
  const bool ok = mvAhuEnvCalSave(&cfg);
  StaticJsonDocument<128> res;
  res["ok"] = ok;
  String out;
  serializeJson(res, out);
  mvHttpSendResponse(client, 200, "application/json", out);
}

void mvAhuEnvCalRegisterRoutes() {
  mvHttpAddRoute("GET", "/ahu-env", handleAhuEnvPage);
  mvHttpAddRoute("GET", "/api/ahu-env", handleAhuEnvGet);
  mvHttpAddRoute("PUT", "/api/ahu-env", handleAhuEnvPut);
  mvHttpAddRoute("POST", "/api/ahu-env/reset", handleAhuEnvReset);
}

#else

void mvAhuEnvCalRegisterRoutes() {}

#endif
