(* Generic VPI1 input register -> VPB3 *)
IF WithInLimits(VPI1, 100.0, 900.0) THEN TurnON(VPB3); ELSE TurnOFF(VPB3); END_IF;
