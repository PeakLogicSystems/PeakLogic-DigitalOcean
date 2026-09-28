# Arduino Opta — MQTT I/O (baseline + PeakLogic Parc)

Baseline sketch source: `baselinedigankgexpansionwMQTT.ino` (built-in + digital/analog expansion, alarms, relay commands).

## Two MQTT modes

| Mode | Publish topic | Central ingest |
|------|---------------|----------------|
| **Legacy (your current sketch)** | `opta/status` | est-pc hub `legacyOpta` mapper → `parc.devices` |
| **PeakLogic v1** | `peaklogic/v1/{deviceId}/telemetry` | Native Parc ingest |

Your existing sketch works **without changes** if est-pc has:

```json
"mqttParc": {
  "enabled": true,
  "brokerUrl": "mqtt://192.168.1.100:1883",
  "legacyOpta": true,
  "legacyOptaDeviceId": "opta_full_io_01",
  "legacyOptaTopic": "opta/status"
}
```

HMI tag bindings: `parc.opta_full_io_01.DI1`, `parc.opta_full_io_01.mA_AI3`, etc.

## Relay command from est-pc

```http
POST /api/parc/devices/opta_full_io_01/cmd
{ "op": "opta_set_relay", "body": { "relay": 1, "state": true } }
```

Publishes to `opta/set/relay/1` JSON `{ "relay": 1, "state": true }` (matches sketch callback).

## PeakLogic v1 firmware

See `PeakLogicOptaMqtt/PeakLogicOptaMqtt.ino` — same I/O logic, adds:

- `peaklogic/v1/{deviceId}/telemetry` with `tags[]` array
- `peaklogic/v1/{deviceId}/cmd` + `cmd/response` for `set_relay`, `reset_alarms`
- `peaklogic/v1/{deviceId}/online` retained birth/LWT
- Configurable `REPORT_MS` (default 180000 = 3 min Parc cadence)

## Broker

Match `mqtt_server` in the sketch to `mqttParc.brokerUrl` on est-pc (default example `192.168.1.100`).
