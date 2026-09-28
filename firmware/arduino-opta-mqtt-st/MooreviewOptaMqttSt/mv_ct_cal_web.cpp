#include "mv_ct_cal.h"
#include "mv_config.h"
#include "mv_http.h"
#include "mv_watchdog.h"
#include "mv_web_nav.h"
#include <ArduinoJson.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER

static const char MV_CT_CAL_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PeakLogic Opta — CT Calibration</title>
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
)HTML" MV_WEB_NAV_CSS R"HTML(
</style></head><body>
)HTML" MV_WEB_NAV_CT_CAL_ACTIVE R"HTML(
<h1>CT calibration — Opta 0–10 V analog I1–I6</h1>
<p class="muted">Final 0–1 V path: STM32 ADC is <b>16-bit</b> (~6554 counts at 1 V, not 410). Scan oversample (default 32) windows ~one 120 Hz cycle with mux-settle + trimmed mean. M4 ingest is 16× <b>burst</b> (keeps ripple) at 512 Hz / 2048 samples (4 s), then residual FFT — not 60 Hz sidebands. ST <code>I*_RAW</code> tags stay 12-bit.</p>
<p class="muted"><b>50 mA CT:</b> use a <b>shunt to analog GND</b> (burden), never a series resistor (ADC is high-Z). V = 50 mA × R. 180 Ω / 1 W → 9 V at 50 mA (set “CT output at FS” to 9). Do <b>not</b> put 50 mA into AFX00007 current mode (25 mA max).</p>
<div class="card"><h2>Live readings</h2>
<label><input type="checkbox" id="liveEn" checked> Auto-refresh (1 s)</label>
<table><thead><tr><th>Input</th><th>Raw (filt)</th><th>Volts</th><th>Amps</th><th>Offset</th><th>Scale A/raw</th><th>Zeroed</th><th></th></tr></thead>
<tbody id="ctRows"></tbody></table>
<div id="liveMsg" class="muted"></div></div>
<div class="card"><h2>Settings (NV flash)</h2>
<div class="row">
<label>Scan oversample<select id="oversample"><option value="1">1</option><option value="4">4</option><option value="8">8</option><option value="16">16</option><option value="32" selected>32</option><option value="64">64</option></select></label>
<label>Idle threshold (A)<input id="idleAmps" type="number" step="0.1" min="0" max="20"></label>
<label>Start detect (A)<input id="startAmps" type="number" step="0.1" min="0" max="30"></label>
<label>Full scale CT (A)<input id="fsAmps" type="number" step="1" min="1" max="200"></label>
<label>CT output at FS (V)<input id="fsVolts" type="number" step="0.01" min="0.1" max="10"></label>
</div>
<div class="row" style="margin-top:.75rem">
<button class="primary" id="btnSave">Save settings</button>
<button id="btnZeroAll">Zero all (pumps OFF)</button>
<button id="btnReset">Reset defaults</button>
</div>
<p id="cfgMsg" class="muted"></p></div>
<div class="card"><h2>Span one channel</h2>
<p class="muted">Run one pump; enter clamp-meter amps on the dominant phase; click Span.</p>
<div class="row">
<label>Channel<select id="spanCh"><option value="1">I1 pump-1 A</option><option value="2">I2 pump-1 B</option><option value="3">I3 pump-1 C</option><option value="4">I4 pump-2 A</option><option value="5">I5 pump-2 B</option><option value="6">I6 pump-2 C</option></select></label>
<label>Reference amps<input id="spanRef" type="number" step="0.1" min="0.5" max="120" placeholder="e.g. 12.4"></label>
<button id="btnSpan">Apply span</button>
</div>
<p id="spanMsg" class="muted"></p></div>
<script>
let liveTimer=null;
function fmt(n,d){return Number(n).toFixed(d!=null?d:2);}
async function loadCal(){
  const r=await fetch('/api/ct-cal'); const j=await r.json();
  if(!j.ok){ liveMsg.textContent=j.error||'load failed'; return; }
  const c=j.config||{};
  oversample.value=c.oversample||32;
  idleAmps.value=c.idleAmps!=null?c.idleAmps:2;
  startAmps.value=c.startDetectAmps!=null?c.startDetectAmps:3;
  fsAmps.value=c.ctFullScaleAmps!=null?c.ctFullScaleAmps:50;
  fsVolts.value=c.ctFullScaleVolts!=null?c.ctFullScaleVolts:1;
  const rows=(j.channels||[]).map(ch=>`<tr>
    <td>${ch.tag}</td><td>${ch.raw}</td><td>${fmt(ch.volts,3)}</td><td>${fmt(ch.amps,2)}</td>
    <td>${fmt(ch.offsetRaw,1)}</td><td>${fmt(ch.scaleAmpsPerRaw,5)}</td>
    <td>${ch.zeroed?'yes':'—'}</td>
    <td><button type="button" data-zero="${ch.ch}">Zero</button></td></tr>`).join('');
  ctRows.innerHTML=rows||'<tr><td colspan="8">No data</td></tr>';
  ctRows.querySelectorAll('[data-zero]').forEach(btn=>{
    btn.onclick=async()=>{
      const ch=+btn.dataset.zero;
      cfgMsg.textContent='Zeroing I'+ch+'…';
      const r=await fetch('/api/ct-cal/zero',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:ch})});
      const z=await r.json();
      cfgMsg.className=z.ok?'ok-box':'err-box';
      cfgMsg.textContent=z.ok?('Zero saved I'+ch): (z.error||'zero failed');
      loadCal();
    };
  });
  liveMsg.textContent='Updated '+new Date().toLocaleTimeString();
}
async function saveCfg(){
  const body={oversample:+oversample.value,idleAmps:+idleAmps.value,startDetectAmps:+startAmps.value,
    ctFullScaleAmps:+fsAmps.value,ctFullScaleVolts:+fsVolts.value};
  const r=await fetch('/api/ct-cal',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();
  cfgMsg.className=j.ok?'ok-box':'err-box';
  cfgMsg.textContent=j.ok?'Settings saved to NV.':(j.error||'save failed');
  if(j.ok) loadCal();
}
btnSave.onclick=saveCfg;
btnZeroAll.onclick=async()=>{
  if(!confirm('Zero all I1–I6? Pumps must be OFF.')) return;
  cfgMsg.textContent='Zeroing all…';
  const r=await fetch('/api/ct-cal/zero',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({all:true})});
  const j=await r.json();
  cfgMsg.className=j.ok?'ok-box':'err-box';
  cfgMsg.textContent=j.ok?'All channels zeroed.':(j.error||'failed');
  loadCal();
};
btnReset.onclick=async()=>{
  if(!confirm('Reset CT calibration to factory defaults?')) return;
  const r=await fetch('/api/ct-cal/reset',{method:'POST'});
  const j=await r.json();
  cfgMsg.className=j.ok?'ok-box':'err-box';
  cfgMsg.textContent=j.ok?'Defaults restored.':(j.error||'failed');
  loadCal();
};
btnSpan.onclick=async()=>{
  const ref=+spanRef.value;
  if(!ref||ref<0.5){ spanMsg.className='err-box'; spanMsg.textContent='Enter reference amps.'; return; }
  spanMsg.textContent='Spanning…';
  const r=await fetch('/api/ct-cal/span',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({channel:+spanCh.value,referenceAmps:ref})});
  const j=await r.json();
  spanMsg.className=j.ok?'ok-box':'err-box';
  spanMsg.textContent=j.ok?('Span saved I'+spanCh.value+' @ '+ref+' A'):(j.error||'span failed');
  loadCal();
};
liveEn.onchange=()=>{
  if(liveTimer){ clearInterval(liveTimer); liveTimer=null; }
  if(liveEn.checked) liveTimer=setInterval(loadCal,1000);
};
loadCal();
liveTimer=setInterval(loadCal,1000);
</script>
</body></html>
)HTML";

static void handleCtCalPage(Stream& client, const String& method, const String& path,
                            const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvHttpSendResponseCStr(client, 200, "text/html; charset=utf-8", MV_CT_CAL_HTML);
}

static void appendConfigJson(JsonObject cfg) {
  const MvCtCalConfig* c = mvCtCalActive();
  cfg["oversample"] = c->oversample;
  cfg["adcBits"] = MV_CT_ADC_BITS;
  cfg["adcMaxRaw"] = c->adcMaxRaw;
  cfg["inputRangeVolts"] = c->inputRangeVolts;
  cfg["ctFullScaleVolts"] = c->ctFullScaleVolts;
  cfg["ctFullScaleAmps"] = c->ctFullScaleAmps;
  cfg["idleAmps"] = c->idleAmps;
  cfg["startDetectAmps"] = c->startDetectAmps;
  cfg["defaultScaleAmpsPerRaw"] = mvCtDefaultScaleAmpsPerRaw(c);
}

static void handleCtCalGet(Stream& client, const String& method, const String& path,
                           const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvWatchdogNoteActivity();
  StaticJsonDocument<2048> doc;
  doc["ok"] = true;
  appendConfigJson(doc.createNestedObject("config"));
  JsonArray ch = doc.createNestedArray("channels");
  mvCtCalAppendLive(ch);
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, 200, "application/json", out);
}

static void handleCtCalPut(Stream& client, const String& method, const String& path,
                           const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  if (body.length() == 0) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body)) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  MvCtCalConfig cfg;
  memcpy(&cfg, mvCtCalActive(), sizeof(cfg));
  if (doc["oversample"].is<uint16_t>() || doc["oversample"].is<int>()) {
    uint16_t n = doc["oversample"].as<uint16_t>();
    if (n >= 1 && n <= 64) cfg.oversample = n;
  }
  if (doc["idleAmps"].is<float>() || doc["idleAmps"].is<double>()) {
    cfg.idleAmps = doc["idleAmps"].as<float>();
  }
  if (doc["startDetectAmps"].is<float>() || doc["startDetectAmps"].is<double>()) {
    cfg.startDetectAmps = doc["startDetectAmps"].as<float>();
  }
  if (doc["ctFullScaleAmps"].is<float>() || doc["ctFullScaleAmps"].is<double>()) {
    cfg.ctFullScaleAmps = doc["ctFullScaleAmps"].as<float>();
  }
  if (doc["ctFullScaleVolts"].is<float>() || doc["ctFullScaleVolts"].is<double>()) {
    cfg.ctFullScaleVolts = doc["ctFullScaleVolts"].as<float>();
  }
  if (!mvCtCalSave(&cfg)) {
    mvHttpSendResponseCStr(client, 500, "application/json", "{\"error\":\"save failed\"}");
    return;
  }
  mvHttpSendResponseCStr(client, 200, "application/json", "{\"ok\":true}");
}

static void handleCtCalZero(Stream& client, const String& method, const String& path,
                            const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  mvWatchdogNoteActivity();
  bool all = false;
  uint8_t ch = 0;
  if (body.length() > 0) {
    StaticJsonDocument<128> doc;
    if (!deserializeJson(doc, body)) {
      all = doc["all"] | false;
      if (doc["channel"].is<int>()) ch = (uint8_t)doc["channel"].as<int>();
    }
  }
  char err[80];
  bool ok = all ? mvCtCalZeroAll(err, sizeof(err))
                : mvCtCalZeroChannel(ch ? (uint8_t)(ch - 1) : 0, err, sizeof(err));
  StaticJsonDocument<192> out;
  out["ok"] = ok;
  if (!ok) out["error"] = err;
  String json;
  serializeJson(out, json);
  mvHttpSendResponse(client, ok ? 200 : 400, "application/json", json);
}

static void handleCtCalSpan(Stream& client, const String& method, const String& path,
                            const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)headerBlock;
  mvWatchdogNoteActivity();
  if (body.length() == 0) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, body)) {
    mvHttpSendResponseCStr(client, 400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  const uint8_t chIn = doc["channel"] | 1;
  const float ref = doc["referenceAmps"] | 0.0f;
  char err[96];
  const bool ok = mvCtCalSpanChannel((uint8_t)(chIn - 1), ref, err, sizeof(err));
  StaticJsonDocument<192> out;
  out["ok"] = ok;
  if (!ok) out["error"] = err;
  String json;
  serializeJson(out, json);
  mvHttpSendResponse(client, ok ? 200 : 400, "application/json", json);
}

static void handleCtCalReset(Stream& client, const String& method, const String& path,
                             const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  const bool ok = mvCtCalResetDefaults();
  StaticJsonDocument<64> out;
  out["ok"] = ok;
  String json;
  serializeJson(out, json);
  mvHttpSendResponse(client, ok ? 200 : 500, "application/json", json);
}

void mvCtCalRegisterRoutes() {
  mvHttpAddRoute("GET", "/ct-cal", handleCtCalPage);
  mvHttpAddRoute("GET", "/api/ct-cal", handleCtCalGet);
  mvHttpAddRoute("PUT", "/api/ct-cal", handleCtCalPut);
  mvHttpAddRoute("POST", "/api/ct-cal/zero", handleCtCalZero);
  mvHttpAddRoute("POST", "/api/ct-cal/span", handleCtCalSpan);
  mvHttpAddRoute("POST", "/api/ct-cal/reset", handleCtCalReset);
}

#else
void mvCtCalRegisterRoutes() {}
#endif
