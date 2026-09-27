(*
  TPO-1 — Time Program Output (daily irrigation cycle)

  All times in minutes (simulated clock on TPO1_TOD):
    TPO1_ON_MIN  — application time (e.g. 30 = run 30 minutes)
    TPO1_OFF_MIN — repeat between applications (e.g. 120 = every 2 hours)
    TPO1_START / TPO1_END — daily window when TPO1_24HR is OFF
    TPO1_PULSE_REM — remaining minutes in current apply or wait phase

  Tags:
    TPO1_EN        BOOL  master enable (HMI toggle)
    TPO1_OFFLINE   BOOL  offline latch — blocks schedule and output (HMI toggle)
    TPO1_24HR      BOOL  run all day — ignore START/END window when ON
    TPO1_OUT       BOOL  irrigation / valve output
    TPO1_GAP       BOOL  internal — wait phase between applications
    TPO1_STA       INT   0=Idle  1=Offline  2=Applying  3=Waiting  4=Outside window
    TPO1_TOD       INT   simulated time-of-day (minutes 0–1439)
    TPO1_TOD_STEP  INT   minutes advanced each scan while enabled (demo speed)
    TPO1_ON_MIN    INT   application time (minutes per pulse)
    TPO1_OFF_MIN   INT   repeat between applications (minutes)
*)

(* Simulated clock — advance while enabled and online *)
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
