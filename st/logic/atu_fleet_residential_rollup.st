(* PeakLogic ATU Service cloud fleet rollup *)
(* Mirror FLEET_*_ALM from each device primary alarm after Drivers → Sync tags *)

IF FLEET_OAK_ATU_ALM THEN TurnON(FLEET_ANY_ALM); ELSE TurnOFF(FLEET_ANY_ALM); END_IF;
IF FLEET_OAK_ATU_ALM THEN TurnON(FLEET_ATU_ALM); ELSE TurnOFF(FLEET_ATU_ALM); END_IF;
TurnOFF(FLEET_LIFT_ALM);
IF FLEET_ANY_ALM THEN TurnON(SITE_ALM); ELSE TurnOFF(SITE_ALM); END_IF;
