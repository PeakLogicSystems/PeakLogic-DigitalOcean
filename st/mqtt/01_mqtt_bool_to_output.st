(* MQTT bool -> VPB1; local VPB3 + publish VPB6 *)
IF IsON(VPB1) THEN TurnON(VPB3); TurnON(VPB6); ELSE TurnOFF(VPB3); TurnOFF(VPB6); END_IF;
