(* Generic I/O: VPB1 (Modbus discrete) -> VPB3 (Modbus coil) *)
IF IsON(VPB1) THEN TurnON(VPB3); ELSE TurnOFF(VPB3); END_IF;
