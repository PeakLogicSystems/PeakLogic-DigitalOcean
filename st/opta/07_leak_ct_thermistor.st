(* =============================================================================

   Opta ST — leak, moisture, 4× CT, 3× NTC thermistors (demo unit)



   Wiring (base Opta unit):

     I1        — leak rope / spot detector (dry contact, active = wet)

     I1_RAW    — resistive moisture probe (24 V pull-down, ~700K wet / 1.5M dry)

                 Same terminal as I1 — use dry contact OR analog probe, not both.

     I2–I5     — 0–1 V current-transformer outputs (0–10 V analog inputs)

     I6–I8     — 10K NTC thermistors, 24 VDC divider (firmware/thermistor info.c)



   Moisture (I1_RAW): 24 V → probe → I1 → 10 kΩ → GND; wet = higher raw ADC.

   Calibrate H_WET_RAW / H_DRY_RAW from soak/dry readings (defaults 138 / 65).



   Alarms:

     R1 — leak detected

     R2 — any CT channel above H1 (raw ADC threshold)

     R3 — any thermistor below H2 (raw ADC, NTC warmed = lower voltage)

     R4 — system OK (no leak, CT, temp, or moisture alarms)

     MOIST_ALM      — moist:     I1_RAW >= H_MOIST_RAW (raw 70)
     SUBMERGED_ALM  — submerged: I1_RAW >= H_SUB_RAW   (raw 700)



   Required tags:

     I1, I1_RAW, I2_RAW–I8_RAW, R1–R4

     MOIST_PCT, H_WET_RAW, H_DRY_RAW
     H_MOIST_RAW, H_SUB_RAW, MOIST_ALM, SUBMERGED_ALM

     H1 (CT overload raw), H2 (high-temp raw)

   ============================================================================= *)



IF IsON(I1) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;



IF I2_RAW > H1 OR I3_RAW > H1 OR I4_RAW > H1 OR I5_RAW > H1 THEN

  TurnON(R2);

ELSE

  TurnOFF(R2);

END_IF;



IF I6_RAW < H2 OR I7_RAW < H2 OR I8_RAW < H2 THEN

  TurnON(R3);

ELSE

  TurnOFF(R3);

END_IF;



IF H_WET_RAW > H_DRY_RAW THEN

  IF I1_RAW <= H_DRY_RAW THEN

    SetInt(MOIST_PCT, 0);

  ELSE

    IF I1_RAW >= H_WET_RAW THEN

      SetInt(MOIST_PCT, 100);

    ELSE

      SetInt(MOIST_PCT, (I1_RAW - H_DRY_RAW) * 100 / (H_WET_RAW - H_DRY_RAW));

    END_IF;

  END_IF;

ELSE

  SetInt(MOIST_PCT, 0);

END_IF;



IF I1_RAW >= H_SUB_RAW THEN TurnON(SUBMERGED_ALM); ELSE TurnOFF(SUBMERGED_ALM); END_IF;

IF I1_RAW >= H_MOIST_RAW THEN TurnON(MOIST_ALM); ELSE TurnOFF(MOIST_ALM); END_IF;



IF IsON(R1) OR IsON(R2) OR IsON(R3) OR IsON(MOIST_ALM) OR IsON(SUBMERGED_ALM) THEN TurnOFF(R4); ELSE TurnON(R4); END_IF;


