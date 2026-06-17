(* =============================================================================
   Opta ST — PID on I1_RAW, moving average, status on R1/R2
   Required tags:
     I1 (BOOL in), R1 (BOOL out), R2 (BOOL out), I1_RAW (INT in)
     H1 (INT memory, PID setpoint), H2 (INT memory, PID out)
     H3 (INT memory, AVG out), PID1 (PID), AVG1 (AVG)
   ============================================================================= *)
PidPv(PID1, I1_RAW);
PidSp(PID1, H1);
PidAuto(PID1);
PidOut(PID1, H2);
AvgIn(AVG1, I1_RAW);
AvgOut(AVG1, H3);
IF AvgReady(AVG1) THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;
IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;
