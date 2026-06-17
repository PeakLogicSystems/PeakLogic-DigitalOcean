(* =============================================================================
   Opta ST — digital I1 drives relay R1
   Required tags: I1 (BOOL in), R1 (BOOL out)
   ============================================================================= *)
IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;
