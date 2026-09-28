# CENSAR SK1 bring-up (Arduino Uno Q)

Sketch: [`uno_q_sk1_bringup.ino`](uno_q_sk1_bringup.ino)  
Pin / SK1 map: [`../../../docs/censar/SK1_UNO_Q_MEZZANINE.md`](../../../docs/censar/SK1_UNO_Q_MEZZANINE.md)

## Load

1. Arduino IDE 2 or App Lab → board **Arduino Uno Q** (MCU sketch).  
2. Open this folder (sketch name = folder name).  
3. Optional compile flags (IDE → compiler options / build flags):
   - (default) LT2400-compatible ADC read  
   - `-DADC_ADS1256` if mezz uses ADS1256  
   - `-DDAC_SOFT_MID` to skip DAC SPI until IC is fitted  

## Serial (115200)

| Cmd | Action |
|-----|--------|
| `h` | help |
| `s` | **safe**: PC off, DAC mid, TMR idle |
| `m <0-15>` | mux select |
| `r [n]` | read ADC |
| `scan` | PH…DO voltages |
| `sap` | secondary A0–A3 |
| `v <ch> <volts>` | DAC 0–3 ±1.25 V, 4–5 ±2.12 V |
| `mid` | all DAC mid |
| `p <0-3> <0\|1>` | power enable (**danger** if analog connected) |
| `pulse cl\|do <us>` | SWITCH/DELAY pulse |

## Bench order

1. Mezz alone — rails OK.  
2. Uno Q + `s` + `r` / `scan`.  
3. Mate SK1 only after `mid` and PC off.  
4. Enable `p 0 1` last; watch current.
