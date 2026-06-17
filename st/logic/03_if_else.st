(* VPB1 on -> VPB3 on, else VPB3 off *)
IF IsON(VPB1) THEN TurnON(VPB3); ELSE TurnOFF(VPB3); END_IF;
