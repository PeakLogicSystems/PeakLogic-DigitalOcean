# ST test programs

Default program folder for PeakLogic. Active file is set in `data/settings.json` as `activeProgram` (default: `program.st`).

## Layout

| Folder | Purpose |
|--------|---------|
| `logic/` | Basic ST: IsON/IsOFF, IF/ELSIF/ELSE, AND/OR/NOT, compares, WithInLimits, timer/counter, PID, AVG |
| `mqtt/` | Logic using MQTT-mapped tags (load with `fixtures/mqtt.*.json`) |
| `modbus/` | Same **generic I/O** names as `logic/`; Modbus tables/registers are in `fixtures/tags.modbus.json` |
| `opta/` | Arduino Opta base-unit I/O over Modbus RTU (load with `fixtures/*opta*.json`) |
| `fixtures/` | Example `tags.json` / `drivers.json` for each suite |

## Full ST feature suite (no I/O)

`logic/21_all_st_features_memory.st` exercises every supported ST construct using **memory-only** tags (`VPB30`–`VPB70`, `VPI30`–`VPI33`, `VPR30`–`VPR32`, plus FB blocks `TMR30`–`TMR32`, `CTR30`–`CTR31`, `PID30`, `AVG30`–`AVG31`). Force stimulus tags in the Tags table or Live I/O — no drivers required.

1. Replace `data/tags.json` with `fixtures/tags.all_st_features.json` (or import via project).
2. Load `logic/21_all_st_features_memory.st`, Validate, Start.
3. Toggle `VPB30` on — watch `VPB40`/`VPB42` follow; adjust `VPI30`/`VPI31` to exercise compares and arithmetic flags.

## Load a test on PC

1. Import tags/drivers from `fixtures/tags.<suite>.json` (copy into `data/` or use `.est` project).
2. **Program** view: pick file from dropdown, or `POST /api/programs/load` with `{ "path": "logic/01_ison_turn_on.st" }`.
3. Validate, Save, Start runtime.

## Generic I/O tags (logic, modbus, and most mqtt programs)

Programs use the **same tag names** regardless of driver. Only `tags.json` / `drivers.json` change how each tag is wired.

| Tag | Role | Mock | Modbus (example) |
|-----|------|------|------------------|
| DI, DI2 | input | sim channel | discrete input addr |
| AI | input | sim channel | input register addr |
| Q, Q2 | output | memory | coil addr |
| ALM | output | memory | coil addr |
| TMR | TIMER | fb | — |
| CTR | COUNTER | fb | — |

### Counter / timer inputs in ST

| Statement | Meaning |
|-----------|---------|
| `CounterCu(CTR, DI)` | Wire BOOL tag `DI` to count-up input (CTU rising edge) |
| `CounterCd(CTR, DI)` | Wire BOOL tag `DI` to count-down input (CTD) |
| `CounterReset(CTR)` | Reset counter |
| `TimerInput(TMR, DI)` | Wire BOOL tag `DI` to timer run input |

Example: `logic/18_counter_cu_from_di.st` — `CounterCu(CTR, DI);` then `IF CounterDone(CTR) THEN TurnON(Q); END_IF;`

Example: `logic/01_ison_turn_on.st` and `modbus/01_di_to_q.st` use the same ST (`IF IsON(DI) THEN TurnON(Q)`). Load `fixtures/tags.modbus.json` to run against Modbus TCP/RTU.

## Waveshare Modbus RTU IO 8CH (PC)

On the **Drivers** tab, choose **Waveshare Modbus RTU IO 8CH** from **Device template**, set serial port (9600,N,8,1 default) and slave ID (default 1), then **Apply device template**. Creates driver `ws_rtu_8` with tags **DI1–DI8** (discrete 0–7) and **Q1–Q8** (coils 0–7). Sample program: `logic/17_waveshare_di1_q1.st`.

## Arduino Opta Modbus RTU (PC)

Use **Drivers → Device template → Arduino Opta — Modbus RTU Slave** (creates driver `opta_rtu`). Or load fixtures:

- `fixtures/drivers.opta.json`
- `fixtures/tags.opta.json`

Register map (0-based, matches Arduino Opta Modbus RTU slave example — **9600 8N1**, slave **2**):

- Discrete inputs **0–7** → `I1`–`I8` (digital level on A0–A7)
- Coils **0–3** (relays O1–O4) → `R1`–`R4`
- Input registers **0–7** → `I1_RAW`–`I8_RAW` (`analogRead`, 0–1023)
- Holding registers **0–7** → `H1`–`H8`
- Input registers **8–15** → `HM1`–`HM8` (mirror of holding 0–7 on the device)

Sample programs: `opta/01_i1_to_r1.st`, `opta/02_analog_alarm_to_r2.st`

## MQTT suite

Prefer generic `DI`, `AI`, `Q` in new programs. Legacy samples may use `MQTT_*` tags mapped in `fixtures/tags.mqtt.json`.
