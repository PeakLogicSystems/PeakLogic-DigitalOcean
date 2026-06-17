(* =============================================================================
   Opta ST — timer and counter on digital I1
   Required tags: I1 (BOOL in), R1 (BOOL out), R2 (BOOL out), TMR1 (TIMER), CTR1 (COUNTER)
   ============================================================================= *)
TimerInput(TMR1, I1);
CounterCu(CTR1, I1);
IF TimerDone(TMR1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;
IF CounterDone(CTR1) THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;
IF CounterValue(CTR1) >= 5 THEN CounterReset(CTR1); END_IF;
