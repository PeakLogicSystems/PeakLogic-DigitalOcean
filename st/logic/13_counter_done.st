(* Counter reached preset — VPB1 drives CTU *)
CounterCu(CTR, VPB1);
IF CounterDone(CTR) THEN TurnON(VPB4); END_IF;
