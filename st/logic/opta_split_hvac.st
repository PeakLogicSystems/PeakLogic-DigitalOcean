(*

  Opta Split HVAC — single air handler + outdoor condenser

  PeakLogic Parc driver (Opta firmware v2.3.81+):
    /mcsa  HVAC layout — I1/I2 comp CT, I3/I4 fan CT, expansion NTC T1–T4
    /ahu-env — AHU1 supply/return NTC (I5–I6), pan leak (D1608E X1_IRAW1)

  Parc input tags (sync from device):
    COMP_FLT, FAN_FLT, T1_C, T2_C, COMP_AMPS, FAN_AMPS
    AHU1_SUPPLY_TEMP_F, AHU1_RETURN_TEMP_F, AHU1_PAN_LEAK

  HMI: screen_1 3D · screen_2 overview · screen_3 AHU · screen_4 condenser
  3D:  /samples/opta-split-hvac-ortho-3d.html

*)

IF COMP_FLT OR FAN_FLT THEN TurnON(COND_ALM); ELSE TurnOFF(COND_ALM); END_IF;
IF AHU1_PAN_LEAK THEN TurnON(AHU_ALM); ELSE TurnOFF(AHU_ALM); END_IF;
IF COND_ALM OR AHU_ALM THEN TurnON(SYS_ALM); ELSE TurnOFF(SYS_ALM); END_IF;
