(* AND + limits: both DIs on and VPI1 in range *)
IF IsON(VPB1) AND IsON(VPB2) AND WithInLimits(VPI1, 1.0, 99.0) THEN TurnON(VPB3); ELSE TurnOFF(VPB3); END_IF;
