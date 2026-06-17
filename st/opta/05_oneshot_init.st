(* =============================================================================
   Opta ST — one-shot init pulse when runtime starts
   Required tags: OS1 (BOOL memory latch id), R1 (BOOL out), R2 (BOOL out)
   OneShot(OS1) is true only on the first scan after Start; re-arms on Stop→Start.
   ============================================================================= *)
IF OneShot(OS1) THEN TurnON(R1); END_IF;
IF IsON(R1) THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;
