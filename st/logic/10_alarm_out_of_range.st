(* VPB5 on when VPI1 outside 20..80 *)
IF WithInLimits(VPI1, 20.0, 80.0) THEN TurnOFF(VPB5); ELSE TurnON(VPB5); END_IF;
