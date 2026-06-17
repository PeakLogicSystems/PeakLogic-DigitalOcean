(* =============================================================================
   Opta ST — flow meter: pulse counter + 1-minute timer → GPM
   Required tags:
     I1 (BOOL pulse in), VPB_RUN (BOOL memory, window enable)
     CTR1 (COUNTER), TMR1 (TIMER preset 60000 ms = 1 min)
     FLOW1 (FLOW FB), H1 (INT K factor counts/gal), H2 (INT GPM out)
     R1 (BOOL status on new sample)
   Formula: GPM = pulse_count_in_window / K  (K = counts per gallon)
   ============================================================================= *)
IF OneShot(OS1) THEN TurnON(VPB_RUN); END_IF;
CounterCu(CTR1, I1);
TimerInput(TMR1, VPB_RUN);
FlowCtr(FLOW1, CTR1);
FlowTmr(FLOW1, TMR1);
FlowK(FLOW1, H1);
FlowOut(FLOW1, H2);
IF FlowReady(FLOW1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;
