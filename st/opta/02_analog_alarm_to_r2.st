(* =============================================================================
   Opta ST — analog alarm on I1_RAW (0..1023); R2 on when out of ~5%..95% band
   Required tags: I1_RAW (INT in), R2 (BOOL out)
   ============================================================================= *)
IF WithInLimits(I1_RAW, 51.0, 972.0) THEN TurnOFF(R2); ELSE TurnON(R2); END_IF;
