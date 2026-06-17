(* TMR done -> VPB3 on (drive TMR.fb.input via mock/timer config) *)
IF TimerDone(TMR) THEN TurnON(VPB3); END_IF;
