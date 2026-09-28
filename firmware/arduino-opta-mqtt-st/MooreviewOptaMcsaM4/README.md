# Opta M4 — MCSA FFT coprocessor

Companion to `PeaklogicOptaMqttSt` (M7). Does **not** run ST, MQTT, or Ethernet.

| | M7 | M4 |
|--|----|----|
| Sketch | `PeaklogicOptaMqttSt` | this folder |
| Role | ST scan, MQTT, 5 min A/D ingest | FFT cook + classify |
| Flash | Target core **M7** | Target core **M4** |
| Split | **1.5MB M7 + 0.5MB M4** | same |

Mailbox: SRAM4 `0x38000000` (`mv_mcsa_shared.h` — keep in sync with the M7 copy). Default 0–1 V path: 16-bit samples, 2048-point residual FFT (Blackman–Harris).

See parent `README.md` dual-core MCSA section.
