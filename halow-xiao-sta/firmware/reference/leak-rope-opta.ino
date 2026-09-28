/*
 * Reference: analog leak-detection rope on Arduino Opta (from est-pc firmware notes).
 *
 * Hardware
 * --------
 *   [ +24V DC ] ----[ 10kΩ ]----+----> Opta analog input (I1 / A0)
 *                               |
 *                          [ rope cable ]
 *                               |
 *   [ GND ] --------------------+
 *
 * Behaviour
 * ---------
 *   Dry  -> high voltage at the ADC pin
 *   Wet  -> rope resistance drops -> voltage falls below wetThreshold
 *   Optional safety latch: once wet, alarm stays ON until manual reset
 *
 * This LilyGO T-HaLow node implements the same logic in main/sensors.c:
 *   - ADC read on CONFIG_SENS_LEAK_GPIO
 *   - EMA filter (CONFIG_SENS_LEAK_FILTER_ALPHA_X1000, default 0.10)
 *   - wet when reading < CONFIG_SENS_LEAK_THRESH_MV (active-low)
 *   - optional latch (CONFIG_SENS_LEAK_LATCH); clear with LEAK_RST write
 *
 * Original Opta sample thresholds (0-10 V input, 10-bit ADC):
 *   dryThreshold = 800
 *   wetThreshold = 500
 * Scale to millivolts at the ESP32 pin after your divider / level shifting.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#if 0  /* Opta Arduino sample — not built by ESP-IDF */

const int ropeSensorPin = A0;
const int valveRelay = D0;

const int dryThreshold = 800;
const int wetThreshold = 500;
bool systemLatched = false;

void setup() {
  pinMode(ropeSensorPin, INPUT);
  pinMode(valveRelay, OUTPUT);
  digitalWrite(valveRelay, LOW);
}

void loop() {
  int sensorReading = analogRead(ropeSensorPin);

  if (sensorReading < wetThreshold) {
    systemLatched = true;
  }

  if (systemLatched) {
    digitalWrite(valveRelay, HIGH);
  }

  delay(200);
}

#endif
