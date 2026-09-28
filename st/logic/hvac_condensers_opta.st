(* =============================================================================
   OPTA Parc — dual rooftop condenser rollup (host ST)

   Two Opta MCSA monitors (telemetry-only drivers):
     COND1 — device hvac_cond_opta_01 — T1/T2 temps, FAN_FLT, COMP_FLT
     COND2 — device hvac_cond_opta_02

   Configure each Opta: /mcsa I/O layout HVAC, deviceType fan+compressor.
   Apply template: Arduino Opta — MCSA monitor.
   ============================================================================= *)

IF IsON(COND1_FAN_FLT) OR IsON(COND1_COMP_FLT)
   OR (COND1_HI_TEMP_F > H_COND_HI_F) OR (COND1_LO_TEMP_F < H_COND_LO_F) THEN
  TurnON(COND1_FAIL_ALM);
ELSE
  TurnOFF(COND1_FAIL_ALM);
END_IF;

IF IsON(COND2_FAN_FLT) OR IsON(COND2_COMP_FLT)
   OR (COND2_HI_TEMP_F > H_COND_HI_F) OR (COND2_LO_TEMP_F < H_COND_LO_F) THEN
  TurnON(COND2_FAIL_ALM);
ELSE
  TurnOFF(COND2_FAIL_ALM);
END_IF;

IF IsON(COND1_FAIL_ALM) OR IsON(COND2_FAIL_ALM) THEN
  TurnON(SITE_ALM);
ELSE
  TurnOFF(SITE_ALM);
END_IF;
