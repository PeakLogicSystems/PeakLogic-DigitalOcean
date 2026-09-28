(* =============================================================================
   Opta ST — Triplex pump station, 5-float level control with lead/lag/lag2
   alternation, high-level alarm, and fail-to-run detection.

   PHYSICAL I/O MAP (Arduino Opta, tags.opta_triplex.json)
   -----------------------------------------------------------------------------
     I1  OFF float      master stop / low-low — all pumps OFF below this level
     I2  LEAD float     start 1st pump (currently designated lead)
     I3  LAG float      start 2nd pump
     I4  LAG2 float     start 3rd pump
     I5  HIGH float     high-level alarm (also forces all pumps to run)
     I6  Motor 1 run    run feedback / aux contact, pump 1
     I7  Motor 2 run    run feedback / aux contact, pump 2
     I8  Motor 3 run    run feedback / aux contact, pump 3

     R1  Motor 1        pump 1 contactor
     R2  Motor 2        pump 2 contactor
     R3  Motor 3        pump 3 contactor

   Float convention: contact CLOSED (input ON) when liquid is AT/ABOVE that
   float. Pump-DOWN (drain) service. For normally-closed floats, invert the
   float reads below.

   Sequence (level rising): LEAD -> +LAG -> +LAG2 -> HIGH alarm.
   De-stage: all running pumps latch until the level drains below the OFF
   float (pump-to-off), then everything stops together.
   Lead rotates one position at the start of every cycle (round-robin).
   A pump that is commanded but gives no run feedback within 5 s is faulted
   and taken offline; the alternator promotes the next available pump.
   ============================================================================= *)

(* ---- Level demand latches (set at each float, reset below OFF float) ------- *)
IF IsON(I2) OR IsON(I3) OR IsON(I4) OR IsON(I5) THEN TurnON(LEAD_CALL); END_IF;
IF IsOFF(I1) THEN TurnOFF(LEAD_CALL); END_IF;

IF IsON(I3) OR IsON(I4) OR IsON(I5) THEN TurnON(LAG_CALL); END_IF;
IF IsOFF(I1) THEN TurnOFF(LAG_CALL); END_IF;

IF IsON(I4) OR IsON(I5) THEN TurnON(LAG2_CALL); END_IF;
IF IsOFF(I1) THEN TurnOFF(LAG2_CALL); END_IF;

(* MASTER_OFF forces every pump off whenever there is no latched lead demand *)
IF IsON(LEAD_CALL) THEN TurnOFF(MASTER_OFF); ELSE TurnON(MASTER_OFF); END_IF;

(* ---- Fail-to-run: commanded ON but no run feedback -> fault + offline ------ *)
IF IsON(R1) AND IsOFF(I6) THEN TurnON(M1_FTR); ELSE TurnOFF(M1_FTR); END_IF;
IF IsON(R2) AND IsOFF(I7) THEN TurnON(M2_FTR); ELSE TurnOFF(M2_FTR); END_IF;
IF IsON(R3) AND IsOFF(I8) THEN TurnON(M3_FTR); ELSE TurnOFF(M3_FTR); END_IF;

TimerInput(M1_FTR_TMR, M1_FTR);
TimerInput(M2_FTR_TMR, M2_FTR);
TimerInput(M3_FTR_TMR, M3_FTR);

IF TimerDone(M1_FTR_TMR) THEN TurnON(M1_FAIL); END_IF;
IF TimerDone(M2_FTR_TMR) THEN TurnON(M2_FAIL); END_IF;
IF TimerDone(M3_FTR_TMR) THEN TurnON(M3_FAIL); END_IF;

(* Auto-reset faults once the well is drained and at rest *)
IF IsOFF(LEAD_CALL) THEN
  TurnOFF(M1_FAIL);
  TurnOFF(M2_FAIL);
  TurnOFF(M3_FAIL);
END_IF;

IF IsON(M1_FAIL) THEN TurnOFF(MOTOR1_ONLINE); ELSE TurnON(MOTOR1_ONLINE); END_IF;
IF IsON(M2_FAIL) THEN TurnOFF(MOTOR2_ONLINE); ELSE TurnON(MOTOR2_ONLINE); END_IF;
IF IsON(M3_FAIL) THEN TurnOFF(MOTOR3_ONLINE); ELSE TurnON(MOTOR3_ONLINE); END_IF;

(* ---- Triplex alternator ---------------------------------------------------- *)
AltEnable(ALT1, SYS_RUN);
AltAutoFault(ALT1, SYS_RUN);
AltAdvance(ALT1, LEAD_CALL);        (* rotate lead once per pump-down cycle *)

AltOff(ALT1, MASTER_OFF);           (* below OFF float -> all pumps off *)
AltHigh(ALT1, I5);                  (* HIGH float -> run every online pump *)
AltLow(ALT1, LAG_CALL);             (* LAG float  -> lead + lag (2 pumps) *)
AltLag2(ALT1, LAG2_CALL);           (* LAG2 float -> lead + lag + lag2 (3 pumps) *)

AltOnline(ALT1, 1, MOTOR1_ONLINE);
AltOnline(ALT1, 2, MOTOR2_ONLINE);
AltOnline(ALT1, 3, MOTOR3_ONLINE);

AltUnitOut(ALT1, 1, R1);            (* pump 1 contactor *)
AltUnitOut(ALT1, 2, R2);            (* pump 2 contactor *)
AltUnitOut(ALT1, 3, R3);            (* pump 3 contactor *)
AltLead(ALT1, LEAD_RUN);

(* ---- Alarms ---------------------------------------------------------------- *)
IF IsON(I5) THEN TurnON(HIGH_ALM); ELSE TurnOFF(HIGH_ALM); END_IF;

IF AltFault(ALT1) OR IsON(HIGH_ALM) OR IsON(M1_FAIL) OR IsON(M2_FAIL) OR IsON(M3_FAIL) THEN
  TurnON(ALT_FAULT);
ELSE
  TurnOFF(ALT_FAULT);
END_IF;
