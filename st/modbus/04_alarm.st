(* Generic VPI1 out of range -> VPB5 coil *)
IF WithInLimits(VPI1, 50.0, 950.0) THEN TurnOFF(VPB5); ELSE TurnON(VPB5); END_IF;
