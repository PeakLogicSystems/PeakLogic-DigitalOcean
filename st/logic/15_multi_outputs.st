(* Independent outputs from two inputs *)
IF IsON(VPB1) THEN TurnON(VPB3); END_IF;
IF IsON(VPB2) THEN TurnON(VPB4); END_IF;
IF IsOFF(VPB1) AND IsOFF(VPB2) THEN TurnOFF(VPB3); TurnOFF(VPB4); END_IF;
