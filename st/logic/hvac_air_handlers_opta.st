(* =============================================================================
   OPTA Parc — dual air handler monitor

   Equipment:
     AHU 1 — blower CT I2, supply NTC I6, return NTC I7, pan leak I1, safety X1_I2
     AHU 2 — blower CT I3, supply NTC I8, return NTC X2_I1, pan leak X1_I1, safety X1_I3

   Flash firmware/arduino-opta-mqtt-st; expansions D1608E + A0602 on /setup.
   Apply template: Arduino Opta — Leak + moisture + CT + Thermistor demo.
   ============================================================================= *)

IF AHU1_FAN_AMPS > H_FAN_AMPS THEN TurnON(AHU1_FAN_FLT); ELSE TurnOFF(AHU1_FAN_FLT); END_IF;
IF AHU2_FAN_AMPS > H_FAN_AMPS THEN TurnON(AHU2_FAN_FLT); ELSE TurnOFF(AHU2_FAN_FLT); END_IF;

IF IsON(AHU1_PAN_LEAK) OR IsOFF(AHU1_SAFETY_SW) OR IsON(AHU1_FAN_FLT) OR (AHU1_SUPPLY_TEMP_F > H_SUPPLY_HI_F) THEN
  TurnON(AHU1_FAIL_ALM);
ELSE
  TurnOFF(AHU1_FAIL_ALM);
END_IF;

IF IsON(AHU2_PAN_LEAK) OR IsOFF(AHU2_SAFETY_SW) OR IsON(AHU2_FAN_FLT) OR (AHU2_SUPPLY_TEMP_F > H_SUPPLY_HI_F) THEN
  TurnON(AHU2_FAIL_ALM);
ELSE
  TurnOFF(AHU2_FAIL_ALM);
END_IF;

IF IsON(AHU1_FAIL_ALM) OR IsON(AHU2_FAIL_ALM) THEN
  TurnON(SITE_ALM);
ELSE
  TurnOFF(SITE_ALM);
END_IF;

IF IsON(AHU1_FAIL_ALM) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;
IF IsON(AHU2_FAIL_ALM) THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;
IF IsON(SITE_ALM) THEN TurnOFF(R3); ELSE TurnON(R3); END_IF;
