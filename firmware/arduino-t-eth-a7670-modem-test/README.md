# Arduino T-ETH Elite + A7670 modem AT test

Bring-up sketch for **LilyGO T-ETH Elite (ESP32-S3)** + **LTE Shield** + **T-PCIE A7670**.

## Published UART (LilyGO)

From [T-ETH-Elite-LTE-Shield `utilities.h`](https://github.com/Xinyuan-LilyGO/LilyGO-T-ETH-Series/tree/master/examples/T-ETH-ELite-Shield/T-ETH-Elite-LTE-Shield):

| Signal | GPIO | Role |
|--------|------|------|
| `MODEM_RX_PIN` | **4** | ESP32 RX ← modem TX |
| `MODEM_TX_PIN` | **6** | ESP32 TX → modem RX |
| `MODEM_PWRKEY_PIN` | 3 | Power key |
| `MODEM_DTR_PIN` | 5 | DTR (held LOW) |
| `MODEM_RI_PIN` | 1 | Ring indicator |
| `LED_PIN` | 38 | Board LED |

```cpp
SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
// → Serial2 RX=GPIO4, TX=GPIO6
```

Wiki: https://wiki.lilygo.cc/products/t-eth-series/t-eth-lte/

## Hardware

1. Seat SIM (Simetry / Teal — APN `teal`)
2. Antenna on modem
3. Switches: **OTG OFF**, **PCIE = 4.2V / T-PCIE**
4. USB-C on Elite board → PC

## Arduino IDE

- Board: **ESP32S3 Dev Module**
- USB CDC On Boot: **Enabled**
- PSRAM: **OPI PSRAM**
- Flash Size: **16MB**
- Library: **TinyGSM** (`TINY_GSM_MODEM_A7672X` for A7670)
- Port: your COM (e.g. COM4)
- Monitor: **115200**

Upload this sketch, open Serial Monitor, look for `MV:` lines.

## Expected log

```
MV: Published UART (LilyGO T-ETH Elite LTE):
MV:   Serial2 RX=GPIO4 (ESP RX <- modem TX)
MV:   Serial2 TX=GPIO6 (ESP TX -> modem RX)
MV: PWRKEY power-on pulse...
MV: Wait 15s for modem boot (LilyGO)...
MV: Autobaud + AT...
MV: Modem ready.
MV: >> ATI
MV: << ...
```

Then type AT commands in the monitor (passthrough).

## Factory reference

If this sketch never gets AT, flash LilyGO factory image:

`ref-T-ETH-ELite-LTE-Shield_070324.bin` (offset `0x0`)

If factory works and this does not, report Serial Monitor output.
