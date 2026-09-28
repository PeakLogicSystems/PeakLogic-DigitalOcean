(* =============================================================================
   OPTA Parc — consolidated HVAC (configs A–D)

   MCSA motor type: single-phase with start capacitor (1P+cap) for all
   fan and compressor CT monitoring. Edge AI model: single-phase-start-v1.

   HVAC_CFG:
     0 = A  single air handler   (blower 1P+cap: I2 run, I3 start, safety I4)
     1 = B  single condenser     (MCSA HVAC: comp I1, fan I2 run CT)
     2 = C  dual air handler     (2× blower run CT I2/I3, safety X1_I2/X1_I3)
     3 = D  dual condenser       (2× Opta MCSA HVAC)

   Commission: /mcsa → motor wiring 1P + start cap for configs B/D.
   ============================================================================= *)

(* Mirror shared I/O into semantic tags *)
IF HVAC_CFG = 0 THEN
  SetReal(AHU1_START_AMPS, CT2_AMPS);
  IF IsON(I4) THEN TurnON(AHU1_SAFETY_SW); ELSE TurnOFF(AHU1_SAFETY_SW); END_IF;
ELSIF HVAC_CFG = 2 THEN
  SetReal(AHU2_FAN_AMPS, CT2_AMPS);
  IF IsON(X1_I1) THEN TurnON(AHU2_PAN_LEAK); ELSE TurnOFF(AHU2_PAN_LEAK); END_IF;
  IF IsON(X1_I2) THEN TurnON(AHU1_SAFETY_SW); ELSE TurnOFF(AHU1_SAFETY_SW); END_IF;
  IF IsON(X1_I3) THEN TurnON(AHU2_SAFETY_SW); ELSE TurnOFF(AHU2_SAFETY_SW); END_IF;
ELSIF HVAC_CFG = 3 THEN
  IF IsON(X1_I1) THEN TurnON(COND2_LOCKOUT); ELSE TurnOFF(COND2_LOCKOUT); END_IF;
  IF IsON(X1_I2) THEN TurnON(COND2_SHUTDOWN); ELSE TurnOFF(COND2_SHUTDOWN); END_IF;
END_IF;

(* —— Config A: single air handler — blower 1P+cap —— *)
IF HVAC_CFG = 0 THEN
  IF AHU1_FAN_AMPS > H_CT_AMPS THEN TurnON(AHU1_FAN_FLT); ELSE TurnOFF(AHU1_FAN_FLT); END_IF;
  IF AHU1_START_AMPS > H_CT_AMPS THEN TurnON(AHU1_START_FLT); ELSE TurnOFF(AHU1_START_FLT); END_IF;
  IF IsON(AHU1_PAN_LEAK) OR IsOFF(AHU1_SAFETY_SW) OR IsON(AHU1_FAN_FLT) OR IsON(AHU1_START_FLT)
     OR (AHU1_SUPPLY_TEMP_F > H_SUPPLY_HI_F) THEN
    TurnON(AHU1_FAIL_ALM);
  ELSE
    TurnOFF(AHU1_FAIL_ALM);
  END_IF;
  TurnOFF(AHU2_FAIL_ALM);
  IF IsON(AHU1_FAIL_ALM) THEN TurnON(SITE_ALM); ELSE TurnOFF(SITE_ALM); END_IF;
END_IF;

(* —— Config C: dual air handler —— *)
IF HVAC_CFG = 2 THEN
  IF AHU1_FAN_AMPS > H_CT_AMPS THEN TurnON(AHU1_FAN_FLT); ELSE TurnOFF(AHU1_FAN_FLT); END_IF;
  IF AHU2_FAN_AMPS > H_CT_AMPS THEN TurnON(AHU2_FAN_FLT); ELSE TurnOFF(AHU2_FAN_FLT); END_IF;
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
  IF IsON(AHU1_FAIL_ALM) OR IsON(AHU2_FAIL_ALM) THEN TurnON(SITE_ALM); ELSE TurnOFF(SITE_ALM); END_IF;
END_IF;

(* —— Config B: single condenser — MCSA 1P+cap comp + fan —— *)
IF HVAC_CFG = 1 THEN
  IF IsON(COND1_FAN_FLT) OR IsON(COND1_COMP_FLT)
     OR (COND1_HI_TEMP_F > H_COND_HI_F) OR (COND1_LO_TEMP_F < H_COND_LO_F) THEN
    TurnON(COND1_FAIL_ALM);
  ELSE
    TurnOFF(COND1_FAIL_ALM);
  END_IF;
  IF IsON(COND1_FAIL_ALM) THEN TurnON(SITE_ALM); ELSE TurnOFF(SITE_ALM); END_IF;
END_IF;

(* —— Config D: dual condenser —— *)
IF HVAC_CFG = 3 THEN
  IF IsON(COND1_FAN_FLT) OR IsON(COND1_COMP_FLT)
     OR (COND1_HI_TEMP_F > H_COND_HI_F) OR (COND1_LO_TEMP_F < H_COND_LO_F) THEN
    TurnON(COND1_FAIL_ALM);
  ELSE
    TurnOFF(COND1_FAIL_ALM);
  END_IF;
  IF IsON(COND2_FAN_FLT) OR IsON(COND2_COMP_FLT) OR IsON(COND2_LOCKOUT) OR IsON(COND2_SHUTDOWN)
     OR (COND2_HI_TEMP_F > H_COND_HI_F) OR (COND2_LO_TEMP_F < H_COND_LO_F) THEN
    TurnON(COND2_FAIL_ALM);
  ELSE
    TurnOFF(COND2_FAIL_ALM);
  END_IF;
  IF IsON(COND1_FAIL_ALM) OR IsON(COND2_FAIL_ALM) THEN TurnON(SITE_ALM); ELSE TurnOFF(SITE_ALM); END_IF;
END_IF;

(* Alarm relays on primary Opta *)
IF IsON(SITE_ALM) THEN TurnOFF(R3); ELSE TurnON(R3); END_IF;
IF IsON(AHU1_FAIL_ALM) OR IsON(COND1_FAIL_ALM) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;
IF IsON(AHU2_FAIL_ALM) OR IsON(COND2_FAIL_ALM) THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;
