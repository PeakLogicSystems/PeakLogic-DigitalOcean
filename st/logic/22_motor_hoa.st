(*
  Motor HOA faceplate sample — pairs with composite motor_hoa

  Tags (memory):
    MOTOR1_HOA      INT  0=Auto  1=Off  2=Hand
    MOTOR1_STA      INT  0=Off  1=Run  2=Fault  3=Warn  4=Offline
    MOTOR1_OFFLINE  BOOL HMI latch — blocks run in all modes
    MOTOR1_START    BOOL momentary from HMI
    MOTOR1_STOP     BOOL
    MOTOR1_RESET    BOOL
    MOTOR1_RUN      BOOL output to field / Q tag
    MOTOR1_HRS      REAL accumulated run hours (center HMI meter)
    MOTOR1_STARTS   INT  start count (center HMI meter)
    MOTOR1_CNTR     COUNTER rising-edge on MOTOR1_RUN

  Wire MOTOR1_RUN to Q1 or a driver output in your project.
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

IF IsON(MOTOR1_OFFLINE) THEN
  TurnOFF(MOTOR1_RUN);
  SetInt(MOTOR1_STA, 4);
ELSE
  IF MOTOR1_HOA = 1 THEN
    (* Off *)
    TurnOFF(MOTOR1_RUN);
    IF NOT IsON(MOTOR1_RUN) THEN
      SetInt(MOTOR1_STA, 0);
    END_IF;
  ELSE
    IF MOTOR1_HOA = 2 THEN
      (* Hand *)
      IF IsON(MOTOR1_START) THEN
        TurnON(MOTOR1_RUN);
        SetInt(MOTOR1_STA, 1);
      END_IF;
      IF IsON(MOTOR1_STOP) THEN
        TurnOFF(MOTOR1_RUN);
        SetInt(MOTOR1_STA, 0);
      END_IF;
    ELSE
      (* Auto — run when VPB1 permissive *)
      IF IsON(VPB1) AND NOT IsON(MOTOR1_STOP) THEN
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

(* Runtime meter — +scanMs/3600000 h per scan while running (100 ms default) *)
IF IsON(MOTOR1_RUN) THEN
  SetInt(MOTOR1_HRS, MOTOR1_HRS + 0.0000277778);
END_IF;

CounterCu(MOTOR1_CNTR, MOTOR1_RUN);
SetInt(MOTOR1_STARTS, CounterValue(MOTOR1_CNTR));

(* Clear momentary commands after scan *)
TurnOFF(MOTOR1_START);
TurnOFF(MOTOR1_STOP);
