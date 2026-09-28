#include "mv_io_map.h"
#include "mv_config.h"
#include "mv_http.h"
#include "mv_tags.h"
#include "mv_io.h"
#include "mv_expansions.h"
#include "mv_web_nav.h"
#include <string.h>
#include <stdio.h>

extern bool g_runtimeRunning;
extern uint32_t g_scanMs;
extern uint32_t g_cycles;

static const char MV_IO_MAP_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PeakLogic Opta I/O Map</title>
<style>
body{font-family:system-ui,sans-serif;margin:1rem;background:#f1f5f9;color:#0f172a}
h1{font-size:1.25rem}h2{font-size:1rem;margin-top:1.25rem}
.card{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:1rem;margin:.75rem 0}
.muted{color:#64748b;font-size:.85rem}
)HTML" MV_WEB_NAV_CSS R"HTML(
.live-row{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .75rem;margin:.5rem 0}
.live-row label{display:inline-flex;align-items:center;gap:.35rem;margin:0;font-size:.9rem}
.live-row input[type=checkbox]{width:auto;max-width:none;margin:0}
.io-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.5rem;margin-top:.5rem}
.io-point{padding:.45rem .55rem;border:1px solid #cbd5e1;border-radius:6px;font-size:.82rem;background:#f8fafc}
.io-point.on{background:#dcfce7;border-color:#86efac}
.io-point.off{background:#f8fafc}
.io-point.forced{border-color:#f59e0b;box-shadow:inset 0 0 0 1px #fde68a}
.io-name{display:block;font-weight:600}
.io-role{display:block;color:#64748b;font-size:.75rem}
.io-val{display:block;font-family:ui-monospace,monospace;font-weight:600;margin-top:.15rem}
.badge{display:inline-block;padding:.1rem .45rem;border-radius:4px;font-size:.8rem;font-weight:600}
.badge.run{background:#dcfce7;color:#166534}
.badge.stop{background:#f1f5f9;color:#475569}
.err-box{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:.5rem .65rem;border-radius:6px;font-size:.85rem;margin:.5rem 0}
</style></head><body>
)HTML" MV_WEB_NAV_IO_MAP_ACTIVE R"HTML(
<h1>PeakLogic Opta I/O Map</h1>
<p class="muted">Physical digital and analog I/O (base Opta + expansion modules).</p>
<div class="live-row">
<label><input type="checkbox" id="ioLiveUpdate"> Enable I/O update</label>
<span class="muted" id="ioLiveHint">Showing last loaded values (live refresh off).</span>
</div>
<p class="muted" id="ioMeta">Loading…</p>
<p id="ioRuntime" class="muted"></p>
<div id="ioErr" class="err-box" hidden></div>
<div id="ioBase" class="card"><h2>Opta base (I1–I8, R1–R4)</h2><div id="ioBaseGrid" class="io-grid"></div></div>
<div id="ioExp" class="card" hidden><h2>Expansion modules</h2><div id="ioExpGrid" class="io-grid"></div></div>
<script>
const POLL_MS=15000;
const LS_KEY='mvIoMapLiveUpdate';
let pollTimer=null;
function isLiveUpdateEnabled(){return localStorage.getItem(LS_KEY)==='1';}
function updateLiveHint(){
  document.getElementById('ioLiveHint').textContent=isLiveUpdateEnabled()
    ?'Live refresh every 15 s.':'Showing last loaded values (live refresh off).';
}
function syncPoll(){
  if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
  if(!isLiveUpdateEnabled()) return;
  pollTimer=setInterval(refresh,POLL_MS);
}
function setLiveUpdateEnabled(on){
  localStorage.setItem(LS_KEY,on?'1':'0');
  updateLiveHint();
  syncPoll();
}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtVal(p){
  if(!p) return '—';
  if(p.type==='BOOL') return p.value?'ON':'OFF';
  if(typeof p.value==='number') return Number.isInteger(p.value)?String(p.value):p.value.toFixed(3);
  return String(p.value??'—');
}
function mkPoint(p){
  const on=p.type==='BOOL'&&!!p.value;
  const cls=['io-point',p.type==='BOOL'?(on?'on':'off'):'analog'];
  if(p.forceInput||p.forceOutput) cls.push('forced');
  return `<div class="${cls.join(' ')}">
    <span class="io-name">${esc(p.id)}</span>
    <span class="io-role">${esc(p.type)} · ${esc(p.role)}${p.slot!=null?' · slot '+(p.slot+1):''}</span>
    <span class="io-val">${esc(fmtVal(p))}</span>
  </div>`;
}
function render(data){
  const pts=data.points||[];
  const base=pts.filter(p=>!p.id.startsWith('X'));
  const exp=pts.filter(p=>p.id.startsWith('X'));
  document.getElementById('ioBaseGrid').innerHTML=base.length?base.map(mkPoint).join(''):'<p class="muted">No base I/O points.</p>';
  const expCard=document.getElementById('ioExp');
  if(exp.length){
    expCard.hidden=false;
    document.getElementById('ioExpGrid').innerHTML=exp.map(mkPoint).join('');
  }else{
    expCard.hidden=true;
  }
  const run=data.runtime||{};
  document.getElementById('ioRuntime').innerHTML=`Runtime: <span class="badge ${run.running?'run':'stop'}">${run.running?'Running':'Stopped'}</span>`+
    (run.running?` · ${run.scanMs||'?'} ms scan · ${run.cycles||0} cycles`:'');
  document.getElementById('ioMeta').textContent=`${pts.length} point(s) · uptime ${Math.round((data.updatedAt||0)/1000)} s`;
}
async function refresh(){
  const errEl=document.getElementById('ioErr');
  try{
    const r=await fetch('/api/io-map');
    if(!r.ok) throw new Error('HTTP '+r.status);
    render(await r.json());
    errEl.hidden=true;
  }catch(e){
    errEl.hidden=false;
    errEl.textContent='I/O map unavailable: '+e.message;
  }
}
const ioLiveUpdate=document.getElementById('ioLiveUpdate');
ioLiveUpdate.checked=isLiveUpdateEnabled();
ioLiveUpdate.onchange=()=>setLiveUpdateEnabled(ioLiveUpdate.checked);
updateLiveHint();
refresh();
syncPoll();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&isLiveUpdateEnabled()) refresh();});
</script></body></html>)HTML";

static const char* kindTypeName(MvTagKind k) {
  switch (k) {
    case MV_INT: return "INT";
    case MV_REAL: return "REAL";
    default: return "BOOL";
  }
}

static bool tagValueJson(MvTag* t, JsonObject row) {
  if (!t) return false;
  row["id"] = t->id;
  row["type"] = kindTypeName(t->kind);
  row["forceInput"] = t->forceInput;
  row["forceOutput"] = t->forceOutput;
  row["quality"] = "GOOD";
  const bool forced = t->forceInput || t->forceOutput;
  switch (t->kind) {
    case MV_BOOL:
      row["value"] = mvTagEffectiveBool(t);
      if (forced) row["logicValue"] = t->b;
      break;
    case MV_INT:
      row["value"] = mvTagEffectiveInt(t);
      if (forced) row["logicValue"] = t->i;
      break;
    case MV_REAL:
      row["value"] = mvTagEffectiveReal(t);
      if (forced) row["logicValue"] = t->r;
      break;
    default: return false;
  }
  if (forced) {
    switch (t->kind) {
      case MV_BOOL: row["forceValue"] = t->forceB; break;
      case MV_INT: row["forceValue"] = t->forceI; break;
      case MV_REAL: row["forceValue"] = t->forceR; break;
      default: break;
    }
  }
  return true;
}

static bool isExpansionInputId(const char* id) {
  if (!id || id[0] != 'X' || id[1] < '1' || id[1] > '5' || id[2] != '_') return false;
  return strncmp(id + 3, "I", 1) == 0 || strncmp(id + 3, "AI", 2) == 0;
}

static bool isExpansionOutputId(const char* id) {
  if (!id || id[0] != 'X' || id[1] < '1' || id[1] > '5' || id[2] != '_') return false;
  return strncmp(id + 3, "R", 1) == 0 || strncmp(id + 3, "PWM", 3) == 0;
}

static bool isIoMapTagId(const char* id, MvTagKind kind) {
  if (!id || !id[0]) return false;
  if (mvIsPhysicalInput(id) || mvIsPhysicalOutput(id)) return true;
  if (isExpansionInputId(id) || isExpansionOutputId(id)) {
    return kind == MV_BOOL || kind == MV_INT || kind == MV_REAL;
  }
  return false;
}

static const char* ioMapRole(const char* id) {
  if (mvIsPhysicalInput(id) || isExpansionInputId(id)) return "input";
  if (mvIsPhysicalOutput(id) || isExpansionOutputId(id)) return "output";
  return "memory";
}

static int ioMapSortRole(const char* id) {
  const char* role = ioMapRole(id);
  if (role[0] == 'i') return 0;
  if (role[0] == 'o') return 1;
  return 2;
}

static int ioMapSortType(MvTagKind kind) {
  if (kind == MV_BOOL) return 0;
  if (kind == MV_INT) return 1;
  if (kind == MV_REAL) return 2;
  return 9;
}

static void ioMapRefreshPhysical() {
  mvReadPhysicalInputs();
  mvExpUpdate();
  mvExpReadInputs();
  mvWriteForcedPhysicalOutputs();
}

static uint8_t collectIoMapTags(MvTag* out[], uint8_t maxOut) {
  uint8_t n = 0;
  for (uint8_t i = 0; i < mvTagCount() && n < maxOut; i++) {
    MvTag* t = mvTagAt(i);
    if (!t || !isIoMapTagId(t->id, t->kind)) continue;
    out[n++] = t;
  }
  for (uint8_t pass = 1; pass < n; pass++) {
    for (uint8_t i = 0; i + 1 < n; i++) {
      MvTag* a = out[i];
      MvTag* b = out[i + 1];
      int ra = ioMapSortRole(a->id);
      int rb = ioMapSortRole(b->id);
      bool swap = ra > rb;
      if (!swap && ra == rb) {
        int ta = ioMapSortType(a->kind);
        int tb = ioMapSortType(b->kind);
        if (ta > tb) swap = true;
        else if (ta == tb && strcmp(a->id, b->id) > 0) swap = true;
      }
      if (swap) {
        out[i] = b;
        out[i + 1] = a;
      }
    }
  }
  return n;
}

static void appendBaseFallback(JsonArray points) {
  for (uint8_t i = 1; i <= 8; i++) {
    char id[12];
    snprintf(id, sizeof(id), "I%u", i);
    if (mvFindTag(id)) continue;
    JsonObject row = points.createNestedObject();
    row["id"] = id;
    row["type"] = "BOOL";
    row["role"] = "input";
    row["value"] = mvReadDigitalIn(i - 1);
    row["quality"] = "GOOD";
    row["forceInput"] = false;
    row["forceOutput"] = false;
  }
  for (uint8_t i = 1; i <= 8; i++) {
    char id[12];
    snprintf(id, sizeof(id), "I%u_RAW", i);
    if (mvFindTag(id)) continue;
    JsonObject row = points.createNestedObject();
    row["id"] = id;
    row["type"] = "INT";
    row["role"] = "input";
    row["value"] = mvReadAnalogRaw(i - 1);
    row["quality"] = "GOOD";
    row["forceInput"] = false;
    row["forceOutput"] = false;
  }
  for (uint8_t i = 1; i <= 4; i++) {
    char id[4];
    snprintf(id, sizeof(id), "R%u", i);
    if (mvFindTag(id)) continue;
    JsonObject row = points.createNestedObject();
    row["id"] = id;
    row["type"] = "BOOL";
    row["role"] = "output";
    row["value"] = mvReadRelay(i - 1);
    row["quality"] = "GOOD";
    row["forceInput"] = false;
    row["forceOutput"] = false;
  }
}

static bool appendParcIoRow(MvTag* t, JsonObject row) {
  if (!t) return false;
  row["id"] = t->id;
  row["type"] = kindTypeName(t->kind);
  row["role"] = ioMapRole(t->id);
  row["quality"] = "GOOD";
  row["forceInput"] = t->forceInput;
  row["forceOutput"] = t->forceOutput;
  switch (t->kind) {
    case MV_BOOL: row["value"] = mvTagEffectiveBool(t); break;
    case MV_INT: row["value"] = mvTagEffectiveInt(t); break;
    case MV_REAL: row["value"] = mvTagEffectiveReal(t); break;
    default: return false;
  }
  return true;
}

void mvTagsToParcIoMapJson(JsonArray out) {
  ioMapRefreshPhysical();
  MvTag* tags[128];
  const uint8_t n = collectIoMapTags(tags, 128);
  for (uint8_t i = 0; i < n; i++) {
    JsonObject row = out.createNestedObject();
    if (!appendParcIoRow(tags[i], row)) {
      out.remove(out.size() - 1);
    }
  }
  for (uint8_t i = 1; i <= 8; i++) {
    char id[12];
    snprintf(id, sizeof(id), "I%u", i);
    if (mvFindTag(id)) continue;
    JsonObject row = out.createNestedObject();
    row["id"] = id;
    row["type"] = "BOOL";
    row["role"] = "input";
    row["value"] = mvReadDigitalIn(i - 1);
    row["quality"] = "GOOD";
    row["forceInput"] = false;
    row["forceOutput"] = false;
  }
  for (uint8_t i = 1; i <= 8; i++) {
    char id[12];
    snprintf(id, sizeof(id), "I%u_RAW", i);
    if (mvFindTag(id)) continue;
    JsonObject row = out.createNestedObject();
    row["id"] = id;
    row["type"] = "INT";
    row["role"] = "input";
    row["value"] = mvReadAnalogRaw(i - 1);
    row["quality"] = "GOOD";
    row["forceInput"] = false;
    row["forceOutput"] = false;
  }
  for (uint8_t i = 1; i <= 4; i++) {
    char id[4];
    snprintf(id, sizeof(id), "R%u", i);
    if (mvFindTag(id)) continue;
    JsonObject row = out.createNestedObject();
    row["id"] = id;
    row["type"] = "BOOL";
    row["role"] = "output";
    row["value"] = mvReadRelay(i - 1);
    row["quality"] = "GOOD";
    row["forceInput"] = false;
    row["forceOutput"] = false;
  }
}

void mvFillIoMapJson(JsonObject root) {
  ioMapRefreshPhysical();

  root["ok"] = true;
  JsonObject runtime = root.createNestedObject("runtime");
  runtime["running"] = g_runtimeRunning;
  runtime["scanMs"] = g_scanMs;
  runtime["cycles"] = g_cycles;
  root["updatedAt"] = millis();
  root["expansions"] = mvExpDetectedCount();

  JsonArray points = root.createNestedArray("points");
  MvTag* tags[128];
  const uint8_t n = collectIoMapTags(tags, 128);
  for (uint8_t i = 0; i < n; i++) {
    MvTag* t = tags[i];
    JsonObject row = points.createNestedObject();
    if (!tagValueJson(t, row)) {
      points.remove(points.size() - 1);
      continue;
    }
    row["role"] = ioMapRole(t->id);
    if (t->id[0] == 'X' && t->id[1] >= '1' && t->id[1] <= '5') {
      row["slot"] = (uint8_t)(t->id[1] - '1');
    }
  }
  appendBaseFallback(points);
  root["count"] = points.size();
}

const char* mvIoMapHtmlPage() {
  return MV_IO_MAP_HTML;
}

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER

static void handleIoMapPage(Stream& client, const String& method, const String& path,
                            const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  mvHttpSendResponseCStr(client, 200, "text/html", mvIoMapHtmlPage());
}

static void handleIoMapApi(Stream& client, const String& method, const String& path,
                           const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<12288> doc;
  mvFillIoMapJson(doc.to<JsonObject>());
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, 200, "application/json", out);
}

void mvIoMapRegisterRoutes() {
  mvHttpAddRoute("GET", "/io-map", handleIoMapPage);
  mvHttpAddRoute("GET", "/api/io-map", handleIoMapApi);
}

#else

void mvIoMapRegisterRoutes() {}

#endif
