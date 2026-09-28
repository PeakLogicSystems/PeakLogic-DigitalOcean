# Building cellular Parc ST

ESP-IDF project: `cellular-parc-st/` · target **esp32s3** · board **T-ETH-ELITE-A7670X**.

## Windows

```powershell
cd cellular-parc-st
idf.py set-target esp32s3
idf.py menuconfig
idf.py build
idf.py -p COM7 flash monitor
```

## menuconfig checklist

| Setting | Bench / cloud-arduino | Field |
|---------|----------------------|-------|
| Bench Wi-Fi WAN | **on** + SSID/pass | **off** |
| LTE modem | off | **on** |
| Cloud MQTT host default | droplet IP | same |
| Board | T-ETH-ELITE-A7670X | same |
| Partition table | custom `partitions.csv` (SPIFFS program NV) | same |

`sdkconfig.defaults` already sets Wi-Fi WAN on (no modem).

**Waveshare ESP32-S3-Relay-1CH-U** (8 MB typical — Arduino firmware is preferred):

```powershell
idf.py -D SDKCONFIG_DEFAULTS="sdkconfig.defaults.waveshare_relay_1ch" set-target esp32s3
idf.py build
```

## Smoke test

1. WAN up → Parc MQTT connects → `online` retained true.
2. Boot log shows `Sequent SM-I-010 online` (or soft I/O if HAT unplugged).
3. `GET /api/status` → `firmwareVersion` **0.3.0+**, `wanType` `wifi`.
4. From Cloud Studio / PeakLogic: Download & Start → `put_program OK`; reboot → NV program reloads.
5. Force `R1` from Tags → relay clicks; `sync_time` / site key on `/setup`.
6. Guide: [docs/LILYGO_PARC_CLOUD.md](../docs/LILYGO_PARC_CLOUD.md).
