(* hvac-split-unit-ahu — res/com split unit air handler · base Opta *)

IF IsON(AHU1_FAN_FLT) OR IsON(AHU1_PAN_LEAK) OR (AHU1_SUPPLY_TEMP_F > H_SUPPLY_HI_F) THEN
  TurnON(AHU1_FAIL_ALM);
ELSE
  TurnOFF(AHU1_FAIL_ALM);
END_IF;

IF IsON(AHU1_FAIL_ALM) THEN TurnON(SITE_ALM); ELSE TurnOFF(SITE_ALM); END_IF;
