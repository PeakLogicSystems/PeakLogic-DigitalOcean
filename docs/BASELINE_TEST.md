# PeakLogic baseline test (appliance + MQTT Parc + Opta)

Use this **before** multi-tenant Cloud SaaS commissioning or fleet MQTT at scale. The baseline is **est-pc** (MVP Suite) on your PC with **MQTT Parc** and an **Arduino Opta** — the original integrated PeakLogic stack.

**Cloud SaaS** (`npm run start:saas`, port **3100**) uses the **same est-pc codebase** — run this checklist on the appliance path first, then repeat optional cloud sections in `docs/testing/FULL_SYSTEM_TEST.md`.

---

## What “baseline” means

| Layer | Baseline product | Port |
|-------|------------------|------|
| HMI + ST + runtime + Parc hub | **est-pc** | `3090` |
| MQTT broker (Mosquitto) | PC LAN | `1883` |
| Edge device | **PeakLogicOptaMqttSt** firmware | MQTT → broker |
| Wire protocol | `peaklogic/v1/{deviceId}/…` | Parc v1 topics |

**Not in baseline (add after Phase 1–3 pass):** multi-tenant Cloud SaaS login, tenant CMMS entitlements, alarm→CMMS MQTT v1 to external subscribers.

---

## Phase 1 — Software baseline (no hardware)

From `est-pc`:

```powershell
cd C:\Users\public\data\est-pc
npm install
npm run test:baseline
```

`test:baseline` runs Parc, MQTT, Opta driver, ST bytecode, and related unit tests.

Full suite (optional):

```powershell
npm run green
```

Start the app:

```powershell
npm start
```

Open **http://127.0.0.1:3090** — dashboard loads, no cloud dependency.

---

## Phase 2 — MQTT broker on the PC

PeakLogic PC is the **central Parc hub**. The Opta must reach the same broker on your LAN IP (not only `127.0.0.1` from the device’s perspective).

```powershell
npm run mqtt:start
```

One-time (Administrator) so the Windows Mosquitto service listens on all interfaces:

```powershell
.\scripts\setup-mqtt-broker-admin.ps1
```

Note your PC LAN IP (e.g. `192.168.1.233`). Broker URL for settings:

```text
mqtt://192.168.1.233:1883
```

---

## Phase 3 — PeakLogic Parc hub settings

**System setup → General** → enable MQTT Parc, set broker URL to your LAN IP.

Or `data/settings.json`:

```json
"mqttParc": {
  "enabled": true,
  "brokerUrl": "mqtt://192.168.1.233:1883",
  "topicPrefix": "peaklogic/v1"
}
```

Restart `npm start` after changing settings.

**Verify:** console shows `[mqtt-parc] central hub connected` (and often `[mqtt-parc] auto-linked N driver(s)`); dashboard poll shows Parc hub connected; `GET /api/dashboard` includes `parc.devices` when telemetry arrives.

Detail: [MQTT_PARC.md](./MQTT_PARC.md) (boot logs, bulk add, workspace merge).

---

## Phase 4 — Opta firmware (MQTT Parc ST — recommended baseline)

This is the **current** baseline path (bytecode deploy, ST on device).

| Step | Action |
|------|--------|
| 1 | Open `firmware/arduino-opta-mqtt-st/PeakLogicOptaMqttSt/PeakLogicOptaMqttSt.ino` |
| 2 | Set `g_mqttCfg` broker IP = PC LAN IP, `deviceId` = `opta_st_01` |
| 3 | Flash to Opta (libraries: ArduinoJson, PubSubClient, Arduino_Opta_Blueprint) |
| 4 | Serial monitor: expect MQTT connect + `peaklogic/v1/opta_st_01/online` |

Detail: [st/opta-mqtt/README.md](../st/opta-mqtt/README.md), [firmware/arduino-opta-mqtt-st/README.md](../firmware/arduino-opta-mqtt-st/README.md).

### Legacy I/O-only baseline (optional)

If you still run the **original** sketch (`baselinedigankgexpansionwMQTT` / `opta/status` topic, no ST on device):

```json
"mqttParc": {
  "enabled": true,
  "brokerUrl": "mqtt://192.168.1.233:1883",
  "legacyOpta": true,
  "legacyOptaDeviceId": "opta_full_io_01",
  "legacyOptaTopic": "opta/status"
}
```

Tags: `parc.opta_full_io_01.DI1`, etc. See [firmware/arduino-opta-mqtt/README.md](../firmware/arduino-opta-mqtt/README.md).

Use **either** Parc ST **or** legacy I/O for baseline — not both as primary.

---

## Phase 5 — Driver + program on PeakLogic PC

### MQTT Parc ST (recommended)

1. **Drivers → Apply template → Arduino Opta — MQTT Parc ST runtime** (or **Bulk add MQTT Parc Opta** for many units)
2. **deviceId** = `opta_st_01` (must match firmware)
3. **Apply & save** drivers
4. Wait for telemetry → **Sync tags from device** on the driver card
5. **Program** → load `st/opta-mqtt/01_i1_to_r1.st` (or `st/opta/01_i1_to_r1.st` with matching fixtures)
6. **Program → Remote** → **Download & Start** (hub auto-links on boot; Connect only if retry needed)

**Pass criteria:**

- Driver card shows **OK** / linked (not **Off** after restart)
- Parc status on driver card shows recent telemetry / online
- `I1` on Opta drives `R1` when program is running
- Dashboard live I/O updates (may be on Parc report interval, default ~180 s; faster when attached/debug)

### Quick connectivity (HTTP Opta, not Parc baseline)

```powershell
npm run opta-test 192.168.1.234
```

Uses HTTP `/api/status` — useful for `arduino-opta-st`, not the MQTT Parc baseline.

---

## Phase 6 — Baseline checklist (sign-off)

| # | Check | How |
|---|--------|-----|
| 1 | Unit tests | `npm run test:baseline` passes |
| 2 | App up | http://127.0.0.1:3090 loads |
| 3 | Broker | `npm run mqtt:start`; Mosquitto on `:1883` |
| 4 | Hub | `mqttParc.enabled` + correct `brokerUrl`; boot log: `central hub connected` |
| 5 | Opta online | `parc.devices` lists your `deviceId` |
| 6 | Tags | Sync tags from device succeeds |
| 7 | ST deploy | Remote + **Download & Start**; no deploy errors |
| 8 | I/O | `01_i1_to_r1.st` — toggle input, relay follows |

When all pass, you have a **known-good PeakLogic appliance baseline**.

---

## Phase 7 — Then move on

Only after baseline sign-off:

| Next | Where |
|------|--------|
| Alarms + user notify profiles | System setup → Users; Alarms |
| Historian (Mongo) | Optional `MONGODB_URI` |
| CMMS alarm MQTT | `docs/CMMS_INTEGRATION.md` |
| Cloud multi-tenant | **est-pc Cloud SaaS** — see `docs/CLOUD_USER_GUIDE.md` and `docs/CLOUD_DEPLOY_DO.md` |

Keep the same Parc topic layout (`peaklogic/v1/…`) when adding cloud ingest — cloud follows appliance behavior.

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| No Parc devices | Broker IP wrong on Opta vs PC; firewall; run `mqtt:start` |
| `hub not started` on boot | Add `mqtt_parc` driver or enable hub / Remote in System setup — see [MQTT_PARC.md](./MQTT_PARC.md) |
| Driver **Off** / **Not linked** after restart | Hub should auto-link; check broker and `deviceId`; re-add driver if workspace was stale |
| Sync tags fails | Wait for first telemetry; check `deviceId` match |
| Deploy fails | Remote on; hub connected; firmware `deviceId` matches driver; use **Download & Start** |
| `telemetry: ENOENT … parc.json.tmp` | Update to current build; run single node instance (`npm stop` then `npm start`) |
| Opta HTTP fails but AP works | Re-flash `arduino-opta-st` with `mv_http.cpp` fix |
| PowerShell blocks npm | Use `npm.cmd` |

MQTT Parc architecture (topics, attach/detach): `../est/docs/parc-architecture.md` (if `est` repo is present).
