(*

  Opta Double Split HVAC — dual air handlers + dual outdoor condensers

  PeakLogic Parc driver (Opta firmware v2.3.81+):
    /mcsa  Dual-cond facility — I1–I8 fan/comp start+run CTs, expansion NTC U1/U2 hi/lo
    /ahu-env — AHU1/AHU2 supply+return (I5–I8), pan leaks (X1_IRAW1–2)

  Parc input tags:
    COND1_FAN_FLT, COND1_COMP_FLT, COND2_FAN_FLT, COND2_COMP_FLT
    T1_C..T4_C, COND1_FAN_AMPS, COND1_COMP_AMPS, COND2_FAN_AMPS, COND2_COMP_AMPS
    AHU1_SUPPLY_TEMP_F, AHU1_RETURN_TEMP_F, AHU1_PAN_LEAK
    AHU2_SUPPLY_TEMP_F, AHU2_RETURN_TEMP_F, AHU2_PAN_LEAK

  HMI: screen_1 3D · screen_2 overview · screen_3 AHUs · screen_4/5 condensers
  3D:  /samples/opta-double-split-hvac-ortho-3d.html

*)

IF COND1_FAN_FLT OR COND1_COMP_FLT THEN TurnON(COND1_ALM); ELSE TurnOFF(COND1_ALM); END_IF;
IF COND2_FAN_FLT OR COND2_COMP_FLT THEN TurnON(COND2_ALM); ELSE TurnOFF(COND2_ALM); END_IF;
IF AHU1_PAN_LEAK THEN TurnON(AHU1_ALM); ELSE TurnOFF(AHU1_ALM); END_IF;
IF AHU2_PAN_LEAK THEN TurnON(AHU2_ALM); ELSE TurnOFF(AHU2_ALM); END_IF;
IF COND1_ALM OR COND2_ALM OR AHU1_ALM OR AHU2_ALM THEN TurnON(SYS_ALM); ELSE TurnOFF(SYS_ALM); END_IF;
