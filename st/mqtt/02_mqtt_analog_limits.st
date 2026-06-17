(* MQTT analog in range -> VPB3 on *)
IF WithInLimits(VPI1, 0.0, 1000.0) THEN TurnON(VPB3); ELSE TurnOFF(VPB3); END_IF;
