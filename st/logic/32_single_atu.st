(*
  Single ATU — one duplex alternator (ALT2) driven by TPO daily schedule

  Tags: st/fixtures/tags.single_atu.json
  HMI: @composite/alternator + @composite/tpo_daily

  TPO1_OUT gates alternator enable (SYS_RUN).
*)

(* ========== TPO-1 ========== *)

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

IF IsON(TPO1_OUT) THEN TurnON(SYS_RUN); ELSE TurnOFF(SYS_RUN); END_IF;

(* ========== ALT2 duplex ========== *)

AltEnable(ALT1, SYS_RUN);
AltAutoFault(ALT1, SYS_RUN);
AltAdvance(ALT1, ALT_BUMP);
AltOff(ALT1, ALT_OFF);
AltHigh(ALT1, LVL_HIGH);
AltLow(ALT1, LVL_LAG);
AltOnline(ALT1, 1, MOTOR1_ONLINE);
AltOnline(ALT1, 2, MOTOR2_ONLINE);
AltUnitOut(ALT1, 1, MOTOR1_RUN);
AltUnitOut(ALT1, 2, MOTOR2_RUN);
AltLead(ALT1, LEAD_RUN);

IF AltFault(ALT1) THEN TurnON(ALT_FAULT); ELSE TurnOFF(ALT_FAULT); END_IF;
TurnOFF(ALT_BUMP);
