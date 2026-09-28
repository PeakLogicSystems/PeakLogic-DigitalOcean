(* =============================================================================
   Opta ST — sensor test bench: moisture, 10K NTC, 0–5 A CT

   Wiring (base Opta unit, 0–10 V analog inputs):

     I1_RAW  — resistive moisture probe (24 V pull-down)
               raw 0 = dry, 70 = moist, 700 = submerged/wet

     I2_RAW  — 10K NTC, Opta 24 VDC divider (see firmware/thermistor info.c)
               24 V → 10K → input → NTC ∥ 5.85K → GND; ~670 raw @ 75°F; lower = hotter

     I3_RAW  — 0–1 V CT output (0–5 A full scale on 0–10 V input)

   Temperature: piecewise °C internally (T1_C), display/alarm in °F (T1_F).
   H2 high-temp threshold is °F (default 131 = 55°C).

   Outputs:
     MOIST_PCT, MOIST_ALM, SUBMERGED_ALM, T1_F, CT_AMPS, R1–R4

   Required tags:
     I1_RAW, I2_RAW, I3_RAW, R1–R4
     MOIST_PCT, H_WET_RAW, H_DRY_RAW, H_MOIST_RAW, H_SUB_RAW
     MOIST_ALM, SUBMERGED_ALM, T1_C, T1_F, CT_AMPS, H1, H2
   ============================================================================= *)

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

IF IsON(MOIST_ALM) OR IsON(SUBMERGED_ALM) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;

SetInt(T1_C, 25);

IF I2_RAW >= 950 THEN
  SetInt(T1_C, 0);
ELSE
  IF I2_RAW >= 850 THEN
    SetInt(T1_C, -9 + (950 - I2_RAW) * 9 / 100);
  ELSE
    IF I2_RAW >= 700 THEN
      SetInt(T1_C, 20 + (850 - I2_RAW) * 29 / 150);
    ELSE
      IF I2_RAW >= 670 THEN
        SetInt(T1_C, 24 - (I2_RAW - 670) * 4 / 30);
      ELSE
        IF I2_RAW >= 450 THEN
          SetInt(T1_C, 50 - (I2_RAW - 450) * 26 / 220);
        ELSE
          IF I2_RAW >= 300 THEN
            SetInt(T1_C, 69 - (I2_RAW - 300) * 19 / 150);
          ELSE
            IF I2_RAW >= 200 THEN
              SetInt(T1_C, 86 - (I2_RAW - 200) * 17 / 100);
            ELSE
              IF I2_RAW >= 100 THEN
                SetInt(T1_C, 115 - (I2_RAW - 100) * 29 / 100);
              ELSE
                SetInt(T1_C, 115 + (100 - I2_RAW) * 32 / 50);
              END_IF;
            END_IF;
          END_IF;
        END_IF;
      END_IF;
    END_IF;
  END_IF;
END_IF;

SetInt(T1_F, (T1_C * 18 + 320) / 10);

SetInt(CT_AMPS, I3_RAW * 5 / 102);

IF I3_RAW > H1 THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;

IF T1_F > H2 THEN TurnON(R3); ELSE TurnOFF(R3); END_IF;

IF IsON(R1) OR IsON(R2) OR IsON(R3) THEN TurnOFF(R4); ELSE TurnON(R4); END_IF;
