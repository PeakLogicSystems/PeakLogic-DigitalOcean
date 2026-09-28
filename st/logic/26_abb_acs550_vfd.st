(*
  ABB ACS550 — Modbus EFB control (ABB Drives profile)

  Device template: abb_acs550_rtu.json  (or abb_acs550_tcp.json)
  Driver type: modbus_rtu / modbus_tcp

  Drive setup (panel):
    1. 9802 COMM PROT SEL = 1 (STD MODBUS)
    2. 5302 EFB STATION ID = slave (default 1) — cycle power after change
    3. 5303 EFB BAUD RATE = 9.6 (match PeakLogic baud)
    4. 5304 EFB PARITY = 1 (8N2) — factory Modbus default; or 0=8N1 / 2=8E1
    5. 5305 EFB CTRL PROFILE = 0 or 2 (ABB Drives) — required for 40001/40004
    6. 1001 EXT1 COMMANDS = 10 (COMM), 1103 REF1 SELECT = 8 (COMM)
    7. Put drive in REM (remote) on the keypad

  Network tags:
    ACS_CW      INT output — Control Word (1151 run / 1150 stop / 1279 fault reset)
    ACS_REF1    INT output — speed ref 0…20000 (= 0…100% of 1105)
    ACS_SW      INT input  — Status Word
    ACS_FREQ_HZ REAL input — output frequency Hz
    ACS_CURR_A  REAL input — motor current A
    ACS_FAULT   INT input  — fault code (0 = none)

  HOA: MOTOR1_HOA (0=Auto 1=Off 2=Hand), MOTOR1_START/STOP/RESET/OFFLINE/RUN
  Speed: ACS_SPEED_PCT (0…100) → scaled into ACS_REF1
  Auto permissive: VPB1
*)

IF IsON(MOTOR1_RESET) THEN
  SetInt(MOTOR1_STA, 0);
  SetInt(MOTOR1_HRS, 0);
  CounterReset(MOTOR1_CNTR);
  SetInt(MOTOR1_STARTS, 0);
  TurnOFF(MOTOR1_OFFLINE);
  TurnOFF(MOTOR1_START);
  TurnOFF(MOTOR1_STOP);
  (* 0x04FF = 1279 — ABB Drives CW with fault-reset bit7 *)
  SetInt(ACS_CW, 1279);
  TurnOFF(MOTOR1_RESET);
ELSE
  (* HOA → MOTOR1_RUN *)
  IF IsON(MOTOR1_OFFLINE) THEN
    TurnOFF(MOTOR1_RUN);
    SetInt(MOTOR1_STA, 4);
  ELSE
    IF MOTOR1_HOA = 1 THEN
      TurnOFF(MOTOR1_RUN);
      IF NOT IsON(MOTOR1_RUN) THEN SetInt(MOTOR1_STA, 0); END_IF;
    ELSE
      IF MOTOR1_HOA = 2 THEN
        IF IsON(MOTOR1_START) THEN
          TurnON(MOTOR1_RUN);
        END_IF;
        IF IsON(MOTOR1_STOP) THEN
          TurnOFF(MOTOR1_RUN);
        END_IF;
      ELSE
        IF IsON(VPB1) AND NOT IsON(MOTOR1_STOP) THEN
          TurnON(MOTOR1_RUN);
        ELSE
          TurnOFF(MOTOR1_RUN);
        END_IF;
      END_IF;
    END_IF;
  END_IF;

  (* Speed reference: ACS_SPEED_PCT 0…100 → REF1 0…20000 *)
  IF ACS_SPEED_PCT < 0 THEN
    SetInt(ACS_REF1, 0);
  ELSE
    IF ACS_SPEED_PCT > 100 THEN
      SetInt(ACS_REF1, 20000);
    ELSE
      SetInt(ACS_REF1, ACS_SPEED_PCT * 200);
    END_IF;
  END_IF;

  (* Map run command → Control Word: 0x047F=1151 run, 0x047E=1150 OFF1 stop *)
  IF IsON(MOTOR1_RUN) THEN
    SetInt(ACS_CW, 1151);
  ELSE
    SetInt(ACS_CW, 1150);
  END_IF;

  (* Status from fault register + run command *)
  IF ACS_FAULT <> 0 THEN
    SetInt(MOTOR1_STA, 3);
  ELSE
    IF IsON(MOTOR1_RUN) THEN
      SetInt(MOTOR1_STA, 1);
    ELSE
      SetInt(MOTOR1_STA, 0);
    END_IF;
  END_IF;
END_IF;

IF IsON(MOTOR1_RUN) THEN
  SetInt(MOTOR1_HRS, MOTOR1_HRS + 0.0000277778);
END_IF;

CounterCu(MOTOR1_CNTR, MOTOR1_RUN);
SetInt(MOTOR1_STARTS, CounterValue(MOTOR1_CNTR));

TurnOFF(MOTOR1_START);
TurnOFF(MOTOR1_STOP);
