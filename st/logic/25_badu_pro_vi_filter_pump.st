(*
  SPECK BADU Pro-VI UVS — RS-485 network control (VGreen EPC protocol)

  Device template: speck_badu_pro_vi_uvs.json
  Driver type: vgreen_epc (Regal GEN3 custom Modbus over RS-485)

  Pump setup on motor display:
    1. Digital input mode → Bus (RS-485)
    2. Confirm baud 19200 (br 03) and slave address (default 21 / 0x15 for EPC)
    3. DIP switch 1 ON if using pump +12V reference (not required for USB-RS485)

  Network tags (driver-mapped):
    PUMP_RUN_CMD   BOOL output — go / stop
    PUMP_RPM_CMD   INT  output — RPM setpoint (600–3450)
    PUMP_STA_RAW   INT  input  — 0 STOP, 9 BOOT, 11 RUN, 32 FAULT
    PUMP_RPM       INT  input  — actual RPM
    PUMP_RPM_DEM   INT  input  — demand RPM
    PUMP_PWR_W     INT  input  — watts
    PUMP_TEMP_C    REAL input  — °C

  HMI: @composite/motor_hoa
  Fixtures: st/fixtures/tags.badu_pro_vi.json + drivers.badu_pro_vi.json
*)

IF IsON(MOTOR1_RESET) THEN
  SetInt(MOTOR1_STA, 0);
  SetInt(MOTOR1_HRS, 0);
  CounterReset(MOTOR1_CNTR);
  SetInt(MOTOR1_STARTS, 0);
  TurnOFF(MOTOR1_OFFLINE);
  TurnOFF(MOTOR1_START);
  TurnOFF(MOTOR1_STOP);
  TurnOFF(MOTOR1_RESET);
END_IF;

(* Simulated clock for filter window *)
IF IsON(FILTER_EN) AND IsOFF(MOTOR1_OFFLINE) THEN
  SetInt(FILTER_TOD, FILTER_TOD + FILTER_TOD_STEP);
  IF FILTER_TOD >= 1440 THEN SetInt(FILTER_TOD, FILTER_TOD - 1440); END_IF;
END_IF;

IF IsON(FILTER_24HR) OR (FILTER_TOD >= FILTER_START AND FILTER_TOD < FILTER_END) THEN
  TurnON(VPB1);
ELSE
  TurnOFF(VPB1);
END_IF;

(* HOA run permissive → internal MOTOR1_RUN *)
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
      IF IsON(FILTER_EN) AND IsON(VPB1) AND NOT IsON(MOTOR1_STOP) THEN
        TurnON(MOTOR1_RUN);
      ELSE
        TurnOFF(MOTOR1_RUN);
      END_IF;
    END_IF;
  END_IF;
END_IF;

(* Map logic to RS-485 command tags *)
IF IsON(MOTOR1_RUN) THEN
  TurnON(PUMP_RUN_CMD);
  SetInt(PUMP_RPM_CMD, PUMP_SPEED);
ELSE
  TurnOFF(PUMP_RUN_CMD);
END_IF;

(* Status from pump network feedback *)
IF PUMP_STA_RAW = 32 THEN
  SetInt(MOTOR1_STA, 2);
ELSE
  IF PUMP_STA_RAW = 11 THEN
    SetInt(MOTOR1_STA, 1);
  ELSE
    IF PUMP_STA_RAW = 9 THEN
      SetInt(MOTOR1_STA, 3);
    ELSE
      IF IsON(MOTOR1_OFFLINE) THEN
        SetInt(MOTOR1_STA, 4);
      ELSE
        SetInt(MOTOR1_STA, 0);
      END_IF;
    END_IF;
  END_IF;
END_IF;

IF IsON(MOTOR1_RUN) OR PUMP_STA_RAW = 11 THEN
  SetInt(MOTOR1_HRS, MOTOR1_HRS + 0.0000277778);
END_IF;

CounterCu(MOTOR1_CNTR, MOTOR1_RUN);
SetInt(MOTOR1_STARTS, CounterValue(MOTOR1_CNTR));

TurnOFF(MOTOR1_START);
TurnOFF(MOTOR1_STOP);
