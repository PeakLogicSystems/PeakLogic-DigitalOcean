#pragma once

static const char INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Res-Pool-Link</title>
<style>
:root{--bg:#0b1220;--card:#121a2b;--line:#243049;--tx:#e8eef8;--mut:#8b9bb4;--acc:#4f8cff;--ok:#3dd68c;--bad:#ff6b6b;--warn:#f5c14a}
*{box-sizing:border-box}body{margin:0;font:16px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--tx)}
header{padding:1rem 1.1rem .4rem}h1{margin:0;font-size:1.25rem}header p{margin:.25rem 0 0;color:var(--mut);font-size:.9rem}
nav{display:flex;gap:.35rem;padding:.4rem 1rem 0;overflow:auto}
nav button{border:0;border-radius:999px;padding:.4rem .8rem;background:#1b2538;color:var(--tx)}
nav button.on{background:var(--acc);color:#fff}
main{padding:.8rem 1rem 2rem;max-width:40rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem 1rem;margin:.7rem 0}
.card h2{margin:0 0 .6rem;font-size:1rem}
.row{display:flex;justify-content:space-between;gap:1rem;padding:.22rem 0;border-bottom:1px solid #1c2740}
.row:last-child{border:0}.k{color:var(--mut)}.v{font-weight:650}
.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
label{display:block;margin:.65rem 0 .2rem;font-weight:650;font-size:.92rem}
input,select{width:100%;padding:.55rem .6rem;border-radius:8px;border:1px solid var(--line);background:#0e1626;color:var(--tx)}
.btns{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.75rem}
button.act,input[type=submit]{border:0;border-radius:8px;padding:.55rem .85rem;background:var(--acc);color:#fff;font-weight:650}
button.ghost{background:#1b2538}button.danger{background:#a33}
.hint{color:var(--mut);font-size:.88rem;margin:.4rem 0 0}
table{width:100%;border-collapse:collapse;font-size:.92rem}td,th{text-align:left;padding:.28rem .2rem;border-bottom:1px solid #1c2740}
.hidden{display:none}code{color:#c5d4f0}
</style>
</head>
<body>
<header>
  <h1>Res-Pool-Link</h1>
  <p>Home Wi-Fi pool &amp; spa · no hub required</p>
</header>
<nav>
  <button data-tab="home" class="on">Home</button>
  <button data-tab="pump">IntelliFlo</button>
  <button data-tab="chlor">IntelliChlor</button>
  <button data-tab="chem">Chemistry</button>
  <button data-tab="filter">Filter</button>
  <button data-tab="wifi">Wi-Fi</button>
</nav>
<main>
<section id="home">
  <div class="card" id="homeCards"></div>
</section>
<section id="pump" class="hidden">
  <div class="card">
    <h2>IntelliFlo setup</h2>
    <div id="pumpStatus"></div>
    <p class="hint">Enable remote first, then run / set RPM. Speeds 450–3450.</p>
    <div class="btns">
      <button class="act" onclick="pump('remote',1)">Enable remote</button>
      <button class="ghost act" onclick="pump('remote',0)">Release remote</button>
      <button class="act" onclick="pump('run')">Run</button>
      <button class="danger act" onclick="pump('stop')">Stop</button>
    </div>
    <label>RPM setpoint</label>
    <input id="rpm" type="number" min="450" max="3450" step="10" value="2350">
    <div class="btns">
      <button class="act" onclick="pump('rpm')">Set RPM</button>
      <button class="ghost act" onclick="setRpm(1100)">1100</button>
      <button class="ghost act" onclick="setRpm(1750)">1750</button>
      <button class="ghost act" onclick="setRpm(2350)">2350</button>
      <button class="ghost act" onclick="setRpm(3110)">3110</button>
    </div>
  </div>
</section>
<section id="chlor" class="hidden">
  <div class="card">
    <h2>IntelliChlor</h2>
    <div id="chlorStatus"></div>
    <label>Output percent</label>
    <input id="icpct" type="number" min="0" max="100" value="50">
    <div class="btns">
      <button class="act" onclick="chlor('percent')">Set percent</button>
      <button class="ghost act" onclick="chlor('takeover')">Take over cell</button>
    </div>
    <p class="hint">Take over only if no EasyTouch / IntelliTouch is master.</p>
  </div>
</section>
<section id="chem" class="hidden">
  <div class="card">
    <h2>DFRobot water quality</h2>
    <div id="chemStatus"></div>
    <p class="hint">SEN0711 slave 1 (pH / NH3 / °C) + SEN0712 slave 2 (Cl ppm) on the <b>4800</b> Modbus pair — not the Pentair cable.</p>
  </div>
</section>
<section id="filter" class="hidden">
  <div class="card">
    <h2>Backwash</h2>
    <div id="filterStatus"></div>
    <div class="btns">
      <button class="act" onclick="bw('start')">Start backwash</button>
      <button class="danger act" onclick="bw('stop')">Stop → filter</button>
    </div>
    <label>Backwash seconds</label>
    <input id="bwSec" type="number" min="10" max="1800" value="180">
    <label>Rinse seconds</label>
    <input id="rinseSec" type="number" min="5" max="600" value="60">
    <div class="btns"><button class="ghost act" onclick="bw('times')">Save times</button></div>
  </div>
</section>
<section id="wifi" class="hidden">
  <div class="card">
    <h2>Home Wi-Fi</h2>
    <form method="post" action="/setup">
      <label>Device name</label>
      <input name="deviceId" id="deviceId">
      <label>Home Wi-Fi name (SSID)</label>
      <input name="staSsid" id="staSsid" autocomplete="off">
      <label>Home Wi-Fi password</label>
      <input name="staPass" id="staPass" type="password" autocomplete="new-password">
      <p class="hint">MQTT Parc matches Opta: <code>mqtt.peaklogic.io:8883</code>, user <code>peaklogic</code>, firmware MOSQUITTO_PASS. Blank password keeps the Opta default. The pad still runs if the cloud link is down.</p>
      <label>MQTT host</label>
      <input name="mqttHost" id="mqttHost" placeholder="mqtt.peaklogic.io">
      <label>MQTT port</label>
      <input name="mqttPort" id="mqttPort" type="number" value="8883">
      <label><input type="checkbox" name="mqttTls" id="mqttTls" value="1"> TLS (8883)</label>
      <label><input type="checkbox" name="mqttInsecure" id="mqttInsecure" value="1"> Allow self-signed cert</label>
      <label>MQTT user</label>
      <input name="mqttUser" id="mqttUser" placeholder="peaklogic">
      <label>MQTT password</label>
      <input name="mqttPass" id="mqttPass" type="password" placeholder="blank = Opta firmware default">
      <div class="btns"><input type="submit" value="Save &amp; join home Wi-Fi"></div>
    </form>
    <p class="hint">Setup AP stays up: <code>PeakLogic-ResPool</code> / <code>peaklogic</code> → <code>http://192.168.4.1:8080/</code></p>
  </div>
</section>
</main>
<script>
const $ = (id) => document.getElementById(id);
let S = {};
document.querySelectorAll('nav button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('main > section').forEach((s) => s.classList.toggle('hidden', s.id !== b.dataset.tab));
  };
});
function cls(ok){ return ok ? 'ok' : 'bad'; }
function age(ms){
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 5 ? 'now' : s + 's ago';
}
function row(k,v,c){ return '<div class="row"><span class="k">'+k+'</span><span class="v '+(c||'')+'">'+v+'</span></div>'; }
function render(){
  const wifiOk = S.wifi === 'connected';
  const pump = S.pump || {};
  const ic = S.chlor || {};
  const ch = S.chem || {};
  const bw = S.backwash || {};
  $('homeCards').innerHTML =
    row('Wi-Fi', wifiOk ? (S.ip||'up') : (S.ap||'setup AP'), cls(wifiOk)) +
    row('IntelliFlo', pump.ok ? (pump.rpm+' RPM · '+pump.watts+' W · '+(pump.running?'run':'stop')) : (pump.err||'—'), cls(pump.ok)) +
    row('IntelliChlor', ic.ok ? (ic.saltPpm+' ppm · '+ic.waterTempF+' °F · '+(ic.icPercent??'—')+'%') : (ic.err||'—'), cls(ic.ok)) +
    row('Chemistry', (ch.phOk||ch.clOk) ? ('pH '+(ch.ph??'—')+' · Cl '+(ch.clPpm??'—')+' ppm') : (ch.err||'—'), cls(ch.phOk||ch.clOk)) +
    row('Filter', (bw.mode||'filter') + (bw.seq && bw.seq!=='idle' ? ' · cycle' : ''), bw.mode==='filter'?'ok':'warn');
  $('pumpStatus').innerHTML =
    row('Link', pump.ok ? 'up · '+age(pump.lastMs) : (pump.err||'down'), cls(pump.ok)) +
    row('State', pump.drive||'—') +
    row('RPM', pump.rpm??'—') +
    row('Watts', pump.watts??'—') +
    row('Flow', pump.flow??'—');
  if (pump.setRpm) $('rpm').value = pump.setRpm;
  $('chlorStatus').innerHTML =
    row('Link', ic.ok ? 'up · '+age(ic.lastMs) : (ic.err||'down'), cls(ic.ok)) +
    row('Salt', (ic.saltPpm??'—')+' ppm') +
    row('Water', (ic.waterTempF??'—')+' °F') +
    row('Output', (ic.icPercent??'—')+' %') +
    row('No flow', ic.noFlow?'YES':'no', ic.noFlow?'bad':'ok') +
    row('Low salt', ic.lowSalt?'YES':'no', ic.lowSalt?'warn':'') +
    row('High salt', ic.highSalt?'YES':'no', ic.highSalt?'warn':'') +
    row('Clean cell', ic.cleanCell?'YES':'no', ic.cleanCell?'warn':'');
  if (ic.icPercent!=null) $('icpct').value = ic.icPercent;
  $('chemStatus').innerHTML =
    row('pH (SEN0711)', ch.phOk ? ch.ph.toFixed(2) : (ch.err||'—'), cls(ch.phOk)) +
    row('Chlorine ppm', ch.clOk ? ch.clPpm.toFixed(2) : '—', cls(ch.clOk)) +
    row('Temp °C', ch.phOk ? ch.tempC.toFixed(1) : '—') +
    row('NH3 mg/L', ch.phOk ? ch.nh3.toFixed(2) : '—');
  let vt = '<table><tr><th>Ch</th><th>Role</th><th>Now</th></tr>';
  (S.valves||[]).forEach((v)=>{ vt += '<tr><td>'+v.id+'</td><td>'+v.label+'</td><td>'+(v.on?'OPEN':'closed')+'</td></tr>'; });
  vt += '</table>';
  $('filterStatus').innerHTML =
    row('Mode', bw.mode||'filter') +
    row('Cycle', bw.seq||'idle') +
    row('Remain', bw.remainSec!=null ? bw.remainSec+' s' : '—') + vt;
  if (bw.bwSec) $('bwSec').value = bw.bwSec;
  if (bw.rinseSec) $('rinseSec').value = bw.rinseSec;
  if (S.deviceId) $('deviceId').value = S.deviceId;
  if (S.staSsid!=null) $('staSsid').value = S.staSsid;
  if (S.mqttHost!=null) $('mqttHost').value = S.mqttHost;
  if (S.mqttPort) $('mqttPort').value = S.mqttPort;
  $('mqttTls').checked = !!S.mqttTls;
  $('mqttInsecure').checked = !!S.mqttInsecure;
  if (S.mqttUser!=null) $('mqttUser').value = S.mqttUser;
}
async function refresh(){
  try {
    const r = await fetch('/api/status');
    S = await r.json();
    if (S.nowMs) {
      const skew = Date.now() - S.nowMs;
      if (S.pump && S.pump.lastMs) S.pump.lastMs += skew;
      if (S.chlor && S.chlor.lastMs) S.chlor.lastMs += skew;
    }
    render();
  } catch (e) {}
}
async function post(url, body){
  await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})});
  refresh();
}
function setRpm(n){ $('rpm').value = n; pump('rpm'); }
function pump(op,v){
  const body = {op};
  if (op==='remote') body.value = v;
  if (op==='rpm') body.value = Number($('rpm').value);
  post('/api/pump', body);
}
function chlor(op){
  const body = {op};
  if (op==='percent') body.value = Number($('icpct').value);
  post('/api/chlor', body);
}
function bw(op){
  post('/api/backwash', {op, bwSec:Number($('bwSec').value), rinseSec:Number($('rinseSec').value)});
}
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>
)HTML";
