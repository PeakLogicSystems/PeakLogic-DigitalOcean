# MQTT Parc hub (appliance)

PeakLogic PC acts as the **central MQTT Parc hub**: Mosquitto on the LAN, Opta firmware publishes `peaklogic/v1/{deviceId}/telemetry`, and the hub ingests into `data/parc.json` for tag sync and remote ST.

Hardware baseline checklist: [BASELINE_TEST.md](./BASELINE_TEST.md).

In-app: press **F1** → **MQTT Parc hub & Opta** (same topics as this doc, inside the dashboard).

---

## System setup

**System setup → General**

| Setting | Purpose |
|---------|---------|
| **Enable MQTT Parc hub** | Starts `mqttCentralHub` on boot |
| **Broker URL** | Must match Opta firmware (use PC **LAN IP**, not `127.0.0.1` from the device) |
| **Remote ST execution** | Deploy/run ST on Opta via MQTT (`Download & Start`) |

Or in `data/settings.json`:

```json
"mqttParc": {
  "enabled": true,
  "brokerUrl": "mqtt://192.168.1.233:1883",
  "topicPrefix": "peaklogic/v1"
},
"remoteExecution": true
```

---

## Boot sequence

After `npm start`, expect (when configured):

```text
[mqtt-parc] central hub connected
[mqtt-parc] auto-linked 1 driver(s)
```

Optional lines:

| Log | Meaning |
|-----|---------|
| `restored driver(s) from Parc registry: opta_st_01` | `parc.json` had telemetry but workspace lacked the driver — driver recreated |
| `hub not started: …` | See [Troubleshooting](#troubleshooting) |

**Auto-enable:** If an `mqtt_parc` driver exists (or Remote is on), `mqttParc.enabled` is set automatically unless you explicitly disabled it in System setup.

**Auto-link:** Enabled `mqtt_parc` drivers connect after the hub is live — no manual **Connect** required on restart.

**Connect ≠ run ST:** Linked driver shows **OK** / **Linked**; use **Program → Download & Start** to deploy and run ST on the Opta.

---

## Drivers

### Single Opta

**Drivers → Apply template → Arduino Opta — MQTT Parc ST runtime** → set **deviceId** (must match firmware) → **Apply & save**.

### Bulk add

**Drivers → Bulk add MQTT Parc Opta** — paste device IDs, or use range / from registry. Driver saves also update `workspace.est.zip` so restart does not drop Opta drivers.

### Workspace vs drivers.json

Startup mode **Last workspace** loads `data/workspace.est.zip`. Remote drivers (`mqtt_parc`, `opta_remote`) in `drivers.json` are **merged** into the workspace snapshot so a stale workspace cannot remove Opta drivers.

---

## Persistence

| File | Role |
|------|------|
| `data/parc.json` | Last telemetry per device (registry) |
| `data/drivers.json` | Driver configs |
| `data/workspace.est.zip` | Autosave / startup workspace (portable archive) |
| `data/projects/*.est.zip` | Named project library |

Telemetry saves are **debounced (~300 ms)** to avoid Windows rename races on `parc.json`. Writes use unique temp files and retries.

Topics and attach/detach: `../est/docs/parc-architecture.md` (if `est` repo present). Cloud SaaS uses the same Parc topic layout — see `docs/EST_PC_PARITY.md` and `docs/CLOUD_USER_GUIDE.md`.

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| `hub not started: no mqtt_parc driver and Remote off` | Add Opta driver, enable hub in System setup, or enable Remote |
| `hub not started: … Parc registry: opta_st_01` | Registry has device but no driver — bulk-add or restart (auto-restore) |
| Driver **Not linked** after boot | Opta offline, wrong broker URL, or `deviceId` mismatch |
| `[mqtt-parc-hub] telemetry: ENOENT … parc.json.tmp` | Fixed in current build (debounced save + unique temps); ensure one node instance |
| `[mqtt-parc-hub] telemetry: EPERM … parc.json.tmp` | Windows file lock during rename — fixed with debounced save + unique temps + rename retries; restart with a single node instance (`npm stop` then `npm start`) |
| Hub OK but no program on Opta | Press **Download & Start** (Remote on) |
| Sync tags fails | Wait for first telemetry; check `deviceId` |
