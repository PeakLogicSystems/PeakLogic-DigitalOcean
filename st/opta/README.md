# Arduino Opta Modbus RTU (PeakLogic)

Matches the **Opta Modbus RTU slave** sketch (slave ID **2**, **9600 8N1**):

| Modbus | Address | PeakLogic tags |
|--------|---------|----------------|
| Discrete inputs | 0–7 | `I1`–`I8` |
| Coils (relays) | 0–3 | `R1`–`R4` |
| Input registers | 0–7 | `I1_RAW`–`I8_RAW` (ADC 0–1023) |
| Holding registers | 0–7 | `H1`–`H8` |
| Input registers | 8–15 | `HM1`–`HM8` (device mirrors `H1`–`H8`) |

## PC setup (Modbus RTU slave)

1. Load `opta/01_i1_to_r1.st` with **Load matching fixtures** — or use `fixtures/tags.opta.json` + `drivers.opta.json`.
2. Set driver **Serial port**, enable `opta_rtu`, **Save drivers**.
3. **Start** runtime.

Or use **Drivers → Apply device template → Arduino Opta — Modbus RTU Slave**.

## PC setup (MQTT Parc ST on Opta)

ST on device; deploy over **MQTT** (no HTTP to Opta required for programming). See **`st/opta-mqtt/README.md`** and firmware `firmware/arduino-opta-mqtt-st/`.

## PC setup (Ethernet ST on Opta)

ST logic runs **on the Opta**; PeakLogic deploys the program over HTTP.

1. Flash firmware: `firmware/arduino-opta-st/PeakLogicOptaSt/` (see README there).
2. **Drivers → Apply device template → Arduino Opta — Ethernet ST runtime** (or `fixtures/drivers.opta_eth.json`).
3. Set **Host** to the Opta IP, enable driver, **Save drivers**.
4. Load `opta/01_i1_to_r1.st` with fixtures `tags.opta_eth.json`.
5. **Validate** → **Start** — program AST is sent to the Opta; scan cycles run remotely.

Commission Ethernet and expansions on the device first: connect to WiFi AP `PeakLogic-Opta` → `http://192.168.4.1:8080/setup`, or open `/setup` on the Ethernet IP. Configure AFX00005 (slot 1) and AFX00007 (slot 2) as needed, then use `tags.opta_eth_exp.json` for `X1_` / `X2_` tags.

## Programs

Each program header lists **required tags**. **Load matching fixtures** loads only those tags (plus driver config).

| File | Description | Required tags |
|------|-------------|---------------|
| `01_i1_to_r1.st` | Digital `I1` drives relay `R1` | `I1`, `R1` |
| `02_analog_alarm_to_r2.st` | `I1_RAW` outside ~5%–95% turns on `R2` | `I1_RAW`, `R2` |
| `03_pid_avg.st` | PID on `I1_RAW`, MOV average, `R1`/`R2` status | `I1`, `R1`, `R2`, `I1_RAW`, `H1`, `H2`, `H3`, `PID1`, `AVG1` |
| `04_timer_counter.st` | TON timer and CTU counter on `I1` | `I1`, `R1`, `R2`, `TMR1`, `CTR1` |
| `05_oneshot_init.st` | Init pulse on first scan after Start | `OS1`, `R1`, `R2` |
| `06_flow_gpm.st` | Pulse flow → GPM (1 min window + K factor) | `I1`, `VPB_RUN`, `OS1`, `CTR1`, `TMR1`, `FLOW1`, `H1`, `H2`, `R1` |
