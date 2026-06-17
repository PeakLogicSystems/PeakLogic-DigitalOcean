(* VPB1 count-up input; VPB4 on when preset reached *)
CounterCu(CTR, VPB1);
IF CounterDone(CTR) THEN TurnON(VPB4); END_IF;
