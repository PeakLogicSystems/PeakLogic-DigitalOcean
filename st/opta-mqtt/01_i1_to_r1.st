(* =============================================================================
   Opta MQTT fleet ST — digital I1 drives relay R1 (same as st/opta/01_i1_to_r1.st)
   Required tags: I1 (BOOL in), R1 (BOOL out)
   ============================================================================= *)
IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;
