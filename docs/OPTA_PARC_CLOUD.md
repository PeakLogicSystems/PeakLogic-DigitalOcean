# Opta Parc — direct connect to PeakLogic Cloud

Commissioning guide for **Arduino Opta** (`PeaklogicOptaMqttSt`) publishing MQTT Parc telemetry directly to a hosted PeakLogic cloud droplet.

For LAN/appliance hub setup see [MQTT_PARC.md](./MQTT_PARC.md). For broker ports and TLS see [deploy/cloud/MQTT.md](../deploy/cloud/MQTT.md). For Cloud Studio login and tenants see [CLOUD_USER_GUIDE.md](./CLOUD_USER_GUIDE.md).

In-app: press **F1** → **MQTT Parc hub & Opta**.

---

## Architecture

**Direct to cloud** (Opta has outbound internet):

```text
Arduino Opta (PeaklogicOptaMqttSt)
        │  MQTT :1883  (plain — Opta has no TLS yet)
        │  peaklogic/v1/{deviceId}/telemetry
        │  peaklogic/v1/{deviceId}/cmd
        ▼
Cloud droplet Mosquitto (MOSQUITTO_USER / MOSQUITTO_PASS)
        ▼
PeakLogic Cloud Studio — MQTT Parc hub → registry → mqtt_parc driver → tags · HMI · PdM
```

**Via cellular gateway** (typical field site): Opta → `192.168.1.1:1883` (LilyGO gateway LAN broker) → cellular → cloud Mosquitto. Same topics once traffic reaches the droplet. See [training/reference/hardware/cellular-opta-gateway.md](./training/reference/hardware/cellular-opta-gateway.md).

**Via site appliance relay** (alternative): Opta stays on LAN broker; appliance uplinks with tenant-scoped topics `peaklogic/v1/{tenantId}/{deviceId}/telemetry`. Configure **System setup → Cloud remote** on the appliance, not on the Opta.

---

## Prerequisites

| Item | Requirement |
|------|-------------|
| Firmware | `firmware/arduino-opta-mqtt-st/PeaklogicOptaMqttSt` **v2.3.63+** (MQTT auth on `/setup`); **v2.3.41+** for reliable cmd/deploy |
| Arduino IDE | Board **Arduino Opta** (`mbed_opta` in Board Manager) |
| Libraries | ArduinoJson 7.x, PubSubClient, Arduino_Opta_Blueprint |
| Cloud | Mosquitto listening on **1883**; firewall allows inbound TCP 1883 |
| Credentials | `MOSQUITTO_USER` / `MOSQUITTO_PASS` on droplet — password **≤ 47 characters** (Opta NV limit) |
| Cloud Studio | MQTT Parc hub enabled; tenant project open |

Flash steps: [firmware/arduino-opta-mqtt-st/README.md](../firmware/arduino-opta-mqtt-st/README.md).

**Canonical firmware tree:** build from **`est-pc`**. Product forks (e.g. `peaklogic-cloud`) must stay in sync with `est-pc` or compile errors and missing features will occur.

---

## 1. Cloud broker

On the droplet:

```bash
grep MOSQUITTO /etc/peaklogic/env
```

| Variable | Typical value |
|----------|----------------|
| `MOSQUITTO_USER` | `peaklogic` |
| `MOSQUITTO_PASS` | Strong secret — **max 47 chars** for Opta |
| `MOSQUITTO_ALLOW_ANONYMOUS` | `false` (production) |

Open firewall and verify:

```bash
sudo ufw allow 1883/tcp
mosquitto_pub -h 127.0.0.1 -p 1883 -u peaklogic -P "$MOSQUITTO_PASS" -t 'test/ping' -m ok
```

Rotate credentials: edit env, re-run `deploy/cloud/debian/install.sh`.

Putnam tenant example env: [deploy/cloud/.env.putnam.example](../deploy/cloud/.env.putnam.example).

---

## 2. Opta field config

Open **`http://<opta-ip>/setup`** (Ethernet or WiFi AP `PeakLogic-Opta` → `http://192.168.4.1:8080/setup`).

### MQTT Parc broker

| Field | Direct to cloud |
|-------|-----------------|
| Broker host | TLS on → `mqtt.peaklogic.io`. TLS off → local appliance IP (`192.168.1.233`) |
| Port | **8883** cloud TLS / **1883** local appliance (no TLS) |
| TLS | `/setup` **Cloud MQTT** checkbox |
| Username | Cloud: `MOSQUITTO_USER` (`peaklogic`). Local: unused |
| Password | Cloud: `MOSQUITTO_PASS` (≤ 47 chars). Local: unused |

### Global site key

Default `1` (`0x0001`). Must match Cloud Studio **System setup → MQTT Parc → Global site key**.

### Actions

1. **Test MQTT connection** — connects and publishes `peaklogic/v1/{deviceId}/setup-test`
2. **Save settings**
3. **Reboot device**

Note the **device ID** on `/setup` or `GET /api/status` (e.g. `mv_f2e689fd60d96bab` or legacy `opta_{atecc}`).

---

## 3. Cloud Studio

Sign in → tenant (e.g. `putnam-county-utilities`) → open project (e.g. `putnam-county-cloud`).

### System setup → MQTT Parc (Opta)

| Setting | Cloud VM |
|---------|----------|
| Enable MQTT Parc hub | ✓ |
| Broker URL | `mqtt://127.0.0.1:1883` |
| Username / password | Same as Mosquitto |
| Global site key | Same as Opta |
| Remote ST execution | ✓ if deploying ST to Opta |

Expect: `[mqtt-parc] central hub connected`

### Add Opta driver

**Drivers → Add Opta Parc devices** (or apply template **Arduino Opta — MQTT Parc ST runtime**):

| Field | Notes |
|-------|--------|
| Device ID | From Opta `/setup` / Parc registry |
| Position ID | Stable site name, e.g. `currie_opta` — survives hardware swaps |
| Sync tags | ✓ |

Wait for Parc registry to show device **online**, then:

- **Sync tags from device**
- **Scan expansions** (if Sequent D1608E / A0602 fitted)

Optional: **Program → Remote → Connect → Download & Start** to deploy ST bytecode.

### EZ Meter on RS485 (facility PQ)

Template **`arduino_opta_parc_ezmeter`** — MQTT Parc lift I/O plus **EZ Meter DDS-RGB** on the Opta onboard RS485 port (Modbus RTU master, 9600 8N1, slave ID **1**).

| Step | Action |
|------|--------|
| Flash | `PeaklogicOptaMqttSt` with compile flags **`-DMV_FIELDBUS=1 -DMV_EZMETER=1`** (Arduino IDE → Board → compile flags) |
| Wire | EZ Meter L1/L2/L3 + neutral; RS485 A/B to Opta terminal |
| Cloud | Apply template **Arduino Opta — MQTT Parc + EZ Meter PQ (RS485)** |
| Program | Deploy **`logic/38_duplex_lift_station_ezmeter.st`** (duplex) or **`logic/39_triplex_lift_station_ezmeter.st`** (triplex) |

Firmware polls `DDS_*` every 30 s and publishes via MQTT Parc. **THD** tags (`MECH_PQ_THD_*`) are **estimated from power factor** — RGB v1.600 has no harmonic registers. See [facilities/EZMETER_FACILITY_PQ.md](./facilities/EZMETER_FACILITY_PQ.md).

---

## 4. Verify

| Check | Pass |
|-------|------|
| Opta `GET /api/status` | `mqttConnected: true` |
| Opta `/setup` test button | Connected + setup-test publish OK |
| Cloud Parc registry | Device online, recent age |
| Driver card | Linked / OK |
| Tags | Updating on `mqtt_parc` driver |

Listen on droplet (optional):

```bash
mosquitto_sub -h 127.0.0.1 -p 1883 -u peaklogic -P "$MOSQUITTO_PASS" \
  -t 'peaklogic/v1/+/telemetry' -v
```

---

## Putnam County — Currie lift (dual source)

111 Currie Rd may have **two** MQTT sources:

| Source | Driver ID | Tags | Role |
|--------|-----------|------|------|
| Nexcomm LiftPoint | `ls_currie` | `CURR_*` | Primary SCADA, fleet map, HMI screen 8 |
| Arduino Opta | `currie_opta` | Opta I/O, CT/PdM | PdM, supplemental I/O, optional local ST |

Do **not** assign the Opta position ID `ls_currie` — that driver is reserved for the LiftPoint (`lift_station_epi`, serial `40a36bcd7bb4`).

See [nexcomm/putnam-county-integration.md](./nexcomm/putnam-county-integration.md).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `PortentaEthernet.h` missing | Wrong Arduino board | **Tools → Board → Arduino Opta**; install `mbed_opta` |
| **`MQTT password too long`** | Password > 47 chars | Shorten `MOSQUITTO_PASS` on server; re-run install |
| `MQTT connect refused (auth)` | User/pass mismatch | Match Opta `/setup` to droplet env exactly |
| No telemetry | Firewall / routing | Open **1883**; confirm Opta has internet |
| Broker `127.0.0.1` on Opta | Invalid on device | Use `peaklogic.io`, droplet IP, or gateway `192.168.1.1` |
| Used port 8883 on Opta | TLS off or old firmware | Check **Use TLS (port 8883)** on `/setup` and reflash this tree |
| Registry online, no driver | Driver not added | Bulk-add from registry with position ID |
| Telemetry OK, deploy timeout | Old firmware | Reflash **v2.3.41+**; Serial: `MQTT subscribed cmd+config` |
| Driver deviceId mismatch | Legacy `opta_*` vs new `mv_*` | Update driver deviceId to match firmware `/api/status` |

PeakLogic driver hints (Connect / Download & Start failures) use the same broker and auth rules — see `src/parc/cmdFailureHint.js`.

---

## Topic reference

| Topic | Direction |
|-------|-----------|
| `peaklogic/v1/{deviceId}/telemetry` | Opta → cloud |
| `peaklogic/v1/{deviceId}/online` | Opta → cloud (retained) |
| `peaklogic/v1/{deviceId}/cmd` | Cloud → Opta |
| `peaklogic/v1/{deviceId}/cmd/response` | Opta → cloud |
| `peaklogic/v1/g/{siteKey}/{tag}` | Global P2P tags (optional) |

---

## Related

- [MQTT_PARC.md](./MQTT_PARC.md) — hub boot, bulk add, workspace merge
- [deploy/cloud/MQTT.md](../deploy/cloud/MQTT.md) — ports, TLS, credentials
- [BASELINE_TEST.md](./BASELINE_TEST.md) — bench test before cloud scale
- [firmware/arduino-opta-mqtt-st/OPTa_FEATURES.md](../firmware/arduino-opta-mqtt-st/OPTa_FEATURES.md) — firmware version history
- [training/reference/hardware/st-opta-mqtt.md](./training/reference/hardware/st-opta-mqtt.md) — ST deploy over Parc
