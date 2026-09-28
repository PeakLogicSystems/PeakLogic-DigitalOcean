#pragma once

static const char INDEX_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pentair Link</title>
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
.hidden{display:none}code{color:#c5d4f0}
</style>
</head>
<body>
<header>
  <h1>PeakLogic Pentair Link</h1>
  <p>IntelliFlo + IntelliChlor · 9600 RS-485 on A+ / B−</p>
</header>
<nav>
  <button data-tab="home" class="on">Home</button>
  <button data-tab="pump">IntelliFlo</button>
  <button data-tab="chlor">IntelliChlor</button>
  <button data-tab="wifi">Wi-Fi</button>
</nav>
<main>
<section id="home">
  <div class="card" id="homeCards"></div>
  <p class="hint">Wire pump and chlorinator to the onboard screw terminals. One twisted pair, 9600 8N1.</p>
</section>
<section id="pump" class="hidden">
  <div class="card">
    <h2>IntelliFlo setup</h2>
    <div id="pumpStatus"></div>
    <p class="hint">Enable remote first, then run / set RPM (450–3450).</p>
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
    <p class="hint">Take over only if no EasyTouch / IntelliTouch is bus master.</p>
  </div>
</section>
<section id="wifi" class="hidden">
  <div class="card">
    <h2>Home Wi-Fi &amp; cloud</h2>
    <form method="post" action="/setup">
      <label>Device name</label>
      <input name="deviceId" id="deviceId">
      <label>IntelliFlo address (hex)</label>
      <input name="pumpAddr" id="pumpAddr" placeholder="60">
      <label>Home Wi-Fi name (SSID)</label>
      <input name="staSsid" id="staSsid" autocomplete="off">
      <label>Home Wi-Fi password</label>
      <input name="staPass" id="staPass" type="password" autocomplete="new-password">
      <p class="hint"><button type="button" class="ghost act" onclick="scanWifi()">Scan networks</button></p>
      <ul id="scanList" class="hint"></ul>
      <p class="hint">MQTT: <code>mqtt.peaklogic.io:8883</code>, user <code>peaklogic</code>. Blank password = firmware default.</p>
      <label>MQTT host</label>
      <input name="mqttHost" id="mqttHost" placeholder="mqtt.peaklogic.io">
      <label>MQTT port</label>
      <input name="mqttPort" id="mqttPort" type="number" value="8883">
      <label><input type="checkbox" name="mqttTls" id="mqttTls" value="1"> TLS (8883)</label>
      <label>MQTT user</label>
      <input name="mqttUser" id="mqttUser" placeholder="peaklogic">
      <label>MQTT password</label>
      <input name="mqttPass" id="mqttPass" type="password" placeholder="blank = firmware default">
      <div class="btns"><input type="submit" value="Save &amp; join home Wi-Fi"></div>
    </form>
    <p class="hint">Setup AP: <code>PeakLogic-Pentair</code> / <code>peaklogic</code></p>
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
async function scanWifi(){
  const ul = $('scanList');
  ul.textContent = 'Scanning…';
  try {
    const j = await (await fetch('/api/wifi/scan')).json();
    ul.innerHTML = '';
    if (!j.networks || !j.networks.length) { ul.textContent = 'No networks — check antenna'; return; }
    j.networks.forEach((n) => {
      const li = document.createElement('li');
      li.innerHTML = '<a href="#" onclick="document.getElementById(\'staSsid\').value=\''+n.ssid.replace(/'/g,"\\'")+'\';return false">'+n.ssid+'</a> · ch '+n.chan+' · '+n.rssi+' dBm';
      ul.appendChild(li);
    });
  } catch (e) { ul.textContent = 'Scan failed'; }
}
function render(){
  const wifiOk = S.wifi === 'connected';
  const pump = S.pump || {};
  const ic = S.chlor || {};
  $('homeCards').innerHTML =
    row('Wi-Fi', wifiOk ? (S.ip||'up') : (S.ap||'setup AP'), cls(wifiOk)) +
    row('MQTT', S.mqtt ? 'up' : 'down', cls(S.mqtt)) +
    row('IntelliFlo', pump.ok ? (pump.rpm+' RPM · '+pump.watts+' W · '+(pump.running?'run':'stop')) : (pump.err||'—'), cls(pump.ok)) +
    row('IntelliChlor', ic.ok ? (ic.saltPpm+' ppm · '+ic.waterTempF+' °F · '+(ic.icPercent??'—')+'%') : (ic.err||'—'), cls(ic.ok));
  $('pumpStatus').innerHTML =
    row('Link', pump.ok ? 'up · '+age(pump.lastMs) : (pump.err||'down'), cls(pump.ok)) +
    row('Addr', '0x'+(pump.addr||96).toString(16)) +
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
  if (S.deviceId) $('deviceId').value = S.deviceId;
  if (S.staSsid!=null) $('staSsid').value = S.staSsid;
  if (S.pumpAddr!=null) $('pumpAddr').value = S.pumpAddr.toString(16);
  if (S.mqttHost!=null) $('mqttHost').value = S.mqttHost;
  if (S.mqttPort) $('mqttPort').value = S.mqttPort;
  $('mqttTls').checked = !!S.mqttTls;
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
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>
)HTML";
