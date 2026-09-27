(*
  Combined demo — Motor HOA faceplate + TPO daily irrigation

  HMI composites: @composite/motor_hoa  +  @composite/tpo_daily
  Fixtures: st/fixtures/tags.motor_tpo_combined.json

  Motor tags: MOTOR1_* , VPB1
  TPO tags:   TPO1_* (minute-based window + ON/OFF pulse params)

  Both run independently each scan. Wire MOTOR1_RUN / TPO1_OUT to field outputs as needed.
*)

(* ========== MOTOR HOA ========== *)

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

IF IsON(MOTOR1_OFFLINE) THEN
  TurnOFF(MOTOR1_RUN);
  SetInt(MOTOR1_STA, 4);
ELSE
  IF MOTOR1_HOA = 1 THEN
    TurnOFF(MOTOR1_RUN);
    IF NOT IsON(MOTOR1_RUN) THEN
      SetInt(MOTOR1_STA, 0);
    END_IF;
  ELSE
    IF MOTOR1_HOA = 2 THEN
      IF IsON(MOTOR1_START) THEN
        TurnON(MOTOR1_RUN);
        SetInt(MOTOR1_STA, 1);
      END_IF;
      IF IsON(MOTOR1_STOP) THEN
        TurnOFF(MOTOR1_RUN);
        SetInt(MOTOR1_STA, 0);
      END_IF;
    ELSE
      IF IsON(TPO1_OUT) AND NOT IsON(MOTOR1_STOP) THEN
        TurnON(MOTOR1_RUN);
        SetInt(MOTOR1_STA, 1);
      ELSE
        TurnOFF(MOTOR1_RUN);
        IF MOTOR1_STA = 1 THEN
          SetInt(MOTOR1_STA, 0);
        END_IF;
      END_IF;
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

(* ========== TPO DAILY CYCLE ========== *)

IF IsON(TPO1_EN) AND IsOFF(TPO1_OFFLINE) THEN
  SetInt(TPO1_TOD, TPO1_TOD + TPO1_TOD_STEP);
  IF TPO1_TOD >= 1440 THEN SetInt(TPO1_TOD, TPO1_TOD - 1440); END_IF;
END_IF;

IF IsON(TPO1_OFFLINE) THEN
  TurnOFF(TPO1_OUT);
  TurnOFF(TPO1_GAP);
  SetInt(TPO1_PULSE_REM, 0);
  SetInt(TPO1_STA, 1);
ELSE
  IF IsOFF(TPO1_EN) THEN
    TurnOFF(TPO1_OUT);
    TurnOFF(TPO1_GAP);
    SetInt(TPO1_PULSE_REM, 0);
    SetInt(TPO1_STA, 0);
  ELSE
    IF IsON(TPO1_24HR) OR (TPO1_TOD >= TPO1_START AND TPO1_TOD < TPO1_END) THEN
      IF TPO1_PULSE_REM <= 0 THEN
        IF IsON(TPO1_OUT) THEN
          TurnOFF(TPO1_OUT);
          TurnON(TPO1_GAP);
          SetInt(TPO1_PULSE_REM, TPO1_OFF_MIN);
          SetInt(TPO1_STA, 3);
        ELSE
          TurnON(TPO1_OUT);
          TurnOFF(TPO1_GAP);
          SetInt(TPO1_PULSE_REM, TPO1_ON_MIN);
          SetInt(TPO1_STA, 2);
        END_IF;
      ELSE
        SetInt(TPO1_PULSE_REM, TPO1_PULSE_REM - TPO1_TOD_STEP);
        IF TPO1_PULSE_REM < 0 THEN SetInt(TPO1_PULSE_REM, 0); END_IF;
      END_IF;
    ELSE
      TurnOFF(TPO1_OUT);
      TurnOFF(TPO1_GAP);
      SetInt(TPO1_PULSE_REM, 0);
      SetInt(TPO1_STA, 4);
    END_IF;
  END_IF;
END_IF;
