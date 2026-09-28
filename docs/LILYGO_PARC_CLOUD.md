# LilyGO Parc ST — cloud-arduino test (no modem)

Commission **LilyGO T-ETH-ELITE** Parc ST (`cellular-parc-st`) over **Wi-Fi WAN** (LTE off) using the same MQTT Parc path as [Opta Parc → cloud](./OPTA_PARC_CLOUD.md).

Firmware tree: `cellular-parc-st/` · platform `lilygo-t-eth-elite-parc-st` · protocol v2 · fw **0.3.0+**.

## Architecture

```text
LilyGO T-ETH-ELITE (Parc ST soft PLC)
        │  Wi-Fi STA → router → internet
        │  MQTT :1883  (plain — same as Opta)
        │  peaklogic/v1/{deviceId}/telemetry|cmd|…
        ▼
Cloud Mosquitto (MOSQUITTO_USER / MOSQUITTO_PASS)
        ▼
PeakLogic Cloud Studio — MQTT Parc hub → mqtt_parc driver
```

No A7670 modem, no Opta bridge, no local broker.

## Build (no modem)

```powershell
cd cellular-parc-st
idf.py set-target esp32s3
# sdkconfig.defaults already enables CONFIG_GATEWAY_WAN_WIFI_FALLBACK=y
idf.py build
idf.py -p COMx flash monitor
```

| Setting | Value |
|---------|-------|
| Bench Wi-Fi WAN | **on** |
| LTE modem | off (depends on Wi-Fi fallback) |
| Cloud MQTT host | droplet IP or hostname |

See `cellular-parc-st/BUILD.md`.

## Field config

1. Join AP **`PeakLogic-ParcST`** / `peaklogic`.
2. Open `http://192.168.4.1:8080/setup`.
3. Set **Router Wi-Fi**, **Cloud MQTT** host/user/pass (password ≤ 47 chars), **deviceId**, **global site key**, **device mode**.
4. Save → confirm WAN IP; check `http://192.168.4.1:8080/api/status`.

## Cloud Studio

1. MQTT Parc hub enabled; broker matches device.
2. Add device transport **`mqtt_parc`**, platform **`lilygo-t-eth-elite-parc-st`**, matching `deviceId`.
3. Template: `src/devices/templates/lilygo_t_eth_parc_st.json`.
4. **Download & Start** ST (e.g. duplex lift).

## Opta feature parity (0.3.0)

| Feature | Status |
|---------|--------|
| put_program / runtime_* / telemetry | Yes |
| set_force / clear_force | Yes |
| sync_time | Yes |
| set_device_mode (standalone / remote_io) | Yes |
| write_outputs (Opta `outputs` object) | Yes |
| Global site key + P2P `…/g/{key}/{tag}` | Yes |
| NV program + autoRunOnBoot | Yes (SPIFFS) |
| /setup + /api/status | Yes |
| Sequent SM-I-010 + CT ADC | Yes |
| ALT / MVBC soft PLC | Yes |
| Opta expansion modules | N/A (scan_expansions ACK) |
| CT cal UI / edge AI / EZ Meter | Not ported (Opta-only HW paths) |
| ATECC `mv_*` identity | Manual deviceId on /setup |
| LTE modem | Optional; off for this test profile |

## Related

- Opta cloud: [OPTA_PARC_CLOUD.md](./OPTA_PARC_CLOUD.md)
- Protocol: [MQTT_PARC.md](./MQTT_PARC.md)
- Firmware README: [cellular-parc-st/README.md](../cellular-parc-st/README.md)
