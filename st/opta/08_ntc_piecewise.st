(* =============================================================================
   Opta ST — 10K NTC divider: piecewise °C from raw ADC (0..1023)

   Use when ST runs ON the Opta and you need temperature in logic without LN().
   PC PeakLogic can instead set Tags → Cal… → NTC 10K on the same channel for
   HMI/historian in °C while this program keeps raw thresholds on I6_RAW.

   Wiring: Vref → 10K NTC → analog in → 10K to GND (lower raw = hotter).

   Tags: I6_RAW (INT in), T1_C (INT memory, approx °C)
   ============================================================================= *)

T1_C := 25;

IF I6_RAW >= 950 THEN
  T1_C := 0;
ELSIF I6_RAW >= 850 THEN
  T1_C := 10 + (950 - I6_RAW) / 10;
ELSIF I6_RAW >= 700 THEN
  T1_C := 25 - (850 - I6_RAW) * 0.12;
ELSIF I6_RAW >= 450 THEN
  T1_C := 43 + (700 - I6_RAW) * 0.08;
ELSIF I6_RAW >= 200 THEN
  T1_C := 63 + (450 - I6_RAW) * 0.06;
ELSE
  T1_C := 78 + (200 - I6_RAW) * 0.05;
END_IF;

(* High-temp alarm example in °C on converted value *)
IF T1_C > 55 THEN TurnON(R3); ELSE TurnOFF(R3); END_IF;
