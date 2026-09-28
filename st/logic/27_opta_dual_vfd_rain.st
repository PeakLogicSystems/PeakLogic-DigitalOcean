(*
  Opta + 2× ABB ACS550 + rain tip-bucket

  Device template: opta_dual_acs550_rain.json
  Driver: modbus_rtu id rs485_bus (one USB-RS485 master)

  RS-485 bus (9600 8N1 — match all devices):
    Slave 1 — ACS550 VFD1  (param 5302=1, 5304=0 for 8N1)
    Slave 2 — Arduino Opta Modbus RTU slave (I1 = tip bucket)
    Slave 3 — ACS550 VFD2  (param 5302=3, 5304=0)

  Rain tip pulse on I1 (reed/dry contact):
    RAIN_K     — K factor = tips per inch (calibrate; 100 = 0.01"/tip)
    RAIN_HR_IN — inches in last 1-hour window (FLOW / K)
    RAIN_RATE  — live intensity in/hr from 1-min sample × 60
    RAIN_TOTAL_IN — lifetime inches (total tips / K)

  VFD HOA: MOTOR1_* / MOTOR2_*  (0=Auto 1=Off 2=Hand)
  Auto permissive: VPB1 (VFD1), VPB2 (VFD2)
  Speed %: ACS1_SPEED_PCT / ACS2_SPEED_PCT → REF1
*)

(* ===== Rain tip-bucket: K-factor + hourly / rate ===== *)
IF OneShot(OS1) THEN TurnON(RAIN_EN); END_IF;

(* Lifetime tip totalizer — not reset by FLOW windows *)
CounterCu(RAIN_TOT_CTR, I1);
SetInt(RAIN_TIPS, CounterValue(RAIN_TOT_CTR));
IF RAIN_K > 0 THEN
  SetInt(RAIN_TOTAL_IN, RAIN_TIPS / RAIN_K);
ELSE
  SetInt(RAIN_TOTAL_IN, 0);
END_IF;

(* Hourly rainfall — 1-hour window: inches = tips / K *)
CounterCu(RAIN_HR_CTR, I1);
TimerInput(RAIN_HR_TMR, RAIN_EN);
FlowCtr(RAIN_HR_FLOW, RAIN_HR_CTR);
FlowTmr(RAIN_HR_FLOW, RAIN_HR_TMR);
FlowK(RAIN_HR_FLOW, RAIN_K);
FlowOut(RAIN_HR_FLOW, RAIN_HR_IN);
IF FlowReady(RAIN_HR_FLOW) THEN TurnON(RAIN_HR_NEW); ELSE TurnOFF(RAIN_HR_NEW); END_IF;

(* Live rate — 1-minute window: in/min = tips/K, then ×60 → in/hr *)
CounterCu(RAIN_RATE_CTR, I1);
TimerInput(RAIN_RATE_TMR, RAIN_EN);
FlowCtr(RAIN_RATE_FLOW, RAIN_RATE_CTR);
FlowTmr(RAIN_RATE_FLOW, RAIN_RATE_TMR);
FlowK(RAIN_RATE_FLOW, RAIN_K);
FlowOut(RAIN_RATE_FLOW, RAIN_IN_MIN);
IF FlowReady(RAIN_RATE_FLOW) THEN
  SetInt(RAIN_RATE, RAIN_IN_MIN * 60);
  TurnON(RAIN_RATE_NEW);
ELSE
  TurnOFF(RAIN_RATE_NEW);
END_IF;

IF IsON(RAIN_RESET) THEN
  CounterReset(RAIN_TOT_CTR);
  CounterReset(RAIN_HR_CTR);
  CounterReset(RAIN_RATE_CTR);
  SetInt(RAIN_TIPS, 0);
  SetInt(RAIN_TOTAL_IN, 0);
  SetInt(RAIN_HR_IN, 0);
  SetInt(RAIN_IN_MIN, 0);
  SetInt(RAIN_RATE, 0);
  TurnOFF(RAIN_RESET);
END_IF;

(* ===== VFD1 HOA ===== *)
IF IsON(MOTOR1_RESET) THEN
  SetInt(MOTOR1_STA, 0);
  SetInt(ACS1_CW, 1279);
  TurnOFF(MOTOR1_OFFLINE);
  TurnOFF(MOTOR1_START);
  TurnOFF(MOTOR1_STOP);
  TurnOFF(MOTOR1_RESET);
ELSE
  IF IsON(MOTOR1_OFFLINE) THEN
    TurnOFF(MOTOR1_RUN);
    SetInt(MOTOR1_STA, 4);
  ELSE
    IF MOTOR1_HOA = 1 THEN
      TurnOFF(MOTOR1_RUN);
      SetInt(MOTOR1_STA, 0);
    ELSE
      IF MOTOR1_HOA = 2 THEN
        IF IsON(MOTOR1_START) THEN TurnON(MOTOR1_RUN); END_IF;
        IF IsON(MOTOR1_STOP) THEN TurnOFF(MOTOR1_RUN); END_IF;
      ELSE
        IF IsON(VPB1) AND NOT IsON(MOTOR1_STOP) THEN
          TurnON(MOTOR1_RUN);
        ELSE
          TurnOFF(MOTOR1_RUN);
        END_IF;
      END_IF;
    END_IF;
  END_IF;

  IF ACS1_SPEED_PCT < 0 THEN
    SetInt(ACS1_REF1, 0);
  ELSE
    IF ACS1_SPEED_PCT > 100 THEN
      SetInt(ACS1_REF1, 20000);
    ELSE
      SetInt(ACS1_REF1, ACS1_SPEED_PCT * 200);
    END_IF;
  END_IF;

  IF IsON(MOTOR1_RUN) THEN
    SetInt(ACS1_CW, 1151);
  ELSE
    SetInt(ACS1_CW, 1150);
  END_IF;

  IF ACS1_FAULT <> 0 THEN
    SetInt(MOTOR1_STA, 3);
  ELSE
    IF IsON(MOTOR1_RUN) THEN SetInt(MOTOR1_STA, 1); ELSE SetInt(MOTOR1_STA, 0); END_IF;
  END_IF;
END_IF;

(* ===== VFD2 HOA ===== *)
IF IsON(MOTOR2_RESET) THEN
  SetInt(MOTOR2_STA, 0);
  SetInt(ACS2_CW, 1279);
  TurnOFF(MOTOR2_OFFLINE);
  TurnOFF(MOTOR2_START);
  TurnOFF(MOTOR2_STOP);
  TurnOFF(MOTOR2_RESET);
ELSE
  IF IsON(MOTOR2_OFFLINE) THEN
    TurnOFF(MOTOR2_RUN);
    SetInt(MOTOR2_STA, 4);
  ELSE
    IF MOTOR2_HOA = 1 THEN
      TurnOFF(MOTOR2_RUN);
      SetInt(MOTOR2_STA, 0);
    ELSE
      IF MOTOR2_HOA = 2 THEN
        IF IsON(MOTOR2_START) THEN TurnON(MOTOR2_RUN); END_IF;
        IF IsON(MOTOR2_STOP) THEN TurnOFF(MOTOR2_RUN); END_IF;
      ELSE
        IF IsON(VPB2) AND NOT IsON(MOTOR2_STOP) THEN
          TurnON(MOTOR2_RUN);
        ELSE
          TurnOFF(MOTOR2_RUN);
        END_IF;
      END_IF;
    END_IF;
  END_IF;

  IF ACS2_SPEED_PCT < 0 THEN
    SetInt(ACS2_REF1, 0);
  ELSE
    IF ACS2_SPEED_PCT > 100 THEN
      SetInt(ACS2_REF1, 20000);
    ELSE
      SetInt(ACS2_REF1, ACS2_SPEED_PCT * 200);
    END_IF;
  END_IF;

  IF IsON(MOTOR2_RUN) THEN
    SetInt(ACS2_CW, 1151);
  ELSE
    SetInt(ACS2_CW, 1150);
  END_IF;

  IF ACS2_FAULT <> 0 THEN
    SetInt(MOTOR2_STA, 3);
  ELSE
    IF IsON(MOTOR2_RUN) THEN SetInt(MOTOR2_STA, 1); ELSE SetInt(MOTOR2_STA, 0); END_IF;
  END_IF;
END_IF;

TurnOFF(MOTOR1_START);
TurnOFF(MOTOR1_STOP);
TurnOFF(MOTOR2_START);
TurnOFF(MOTOR2_STOP);
