(* MQTT VPI1 above 800 -> alarm *)
IF VPI1 > 800 THEN TurnON(VPB5); ELSE TurnOFF(VPB5); END_IF;
