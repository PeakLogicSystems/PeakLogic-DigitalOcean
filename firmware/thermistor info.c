/*

 (+24V DC) -----[ 10k Resistor (R_fixed) ]-----+----- (Opta Input I1)
                                               |
                                          [ 10k Thermistor ]
                                               |
    (GND) -------------------------------------+----- (Opta GND)


Need to add a calibration routine

Opta analog input is 0–10 V max — hot NTC / low branch resistance can saturate
before 24 V at the divider node. Size R_fixed or verify v_measured < 10 V over
your temperature range.

*/


#include <Arduino.h>
#include <math.h>

// Hardware and Circuit Constants
const int ANALOG_PIN = A0;             // Maps to physical input I1
const float V_SUPPLY = 24.0;           // Voltage powering the divider circuit (24 VDC)
const float R_FIXED = 10000.0;         // Fixed pull-up resistor value (10k Ohms)
const float R_OPTA_INTERNAL = 5850.0;  // Opta internal input impedance to GND (5.85k Ohms)
const float ADC_MAX_VOLTAGE = 10.0;    // Opta max scale analog range (10V)
const float ADC_RESOLUTION = 4095.0;   // 12-bit ADC maximum value

// Thermistor Beta Constants (Standard 10k NTC 3950 Type)
const float ROOM_TEMP_K = 298.15;      // 25 °C in Kelvin
const float R_NOMINAL = 10000.0;       // Thermistor nominal resistance at 25 °C
const float B_COEFFICIENT = 3950.0;    // Beta coefficient

// EMA Filter Config
// Lower alpha (e.g., 0.05) = Heavy smoothing, slower response to real temp changes
// Higher alpha (e.g., 0.3) = Less smoothing, faster response
const float FILTER_ALPHA = 0.10;
float filteredAdc = -1.0;              // Holds the smoothed ADC tracker value

// Timing Control variables
unsigned long lastSampleTime = 0;
const unsigned long SAMPLE_INTERVAL_MS = 50;  // Sample the raw ADC every 50ms

void setup() {
    Serial.begin(115200);
    analogReadResolution(12);          // Configure Opta to read 12-bit ADC
}

void loop() {
    unsigned long currentMillis = millis();

    // Enforce a strict timed interval for uniform filtering
    if (currentMillis - lastSampleTime >= SAMPLE_INTERVAL_MS) {
        lastSampleTime = currentMillis;

        // Read the instantaneous raw ADC value
        int rawAdc = analogRead(ANALOG_PIN);

        // Initialize the filter on the very first loop iteration
        if (filteredAdc < 0) {
            filteredAdc = (float)rawAdc;
        } else {
            // Apply the Exponential Moving Average math
            filteredAdc = (FILTER_ALPHA * (float)rawAdc) + ((1.0 - FILTER_ALPHA) * filteredAdc);
        }

        // --- Post-Filter Circuit Calculations ---

        // 1. Calculate smoothed voltage at the Opta terminal block
        float v_measured = (filteredAdc / ADC_RESOLUTION) * ADC_MAX_VOLTAGE;

        // Check if the input is saturated (divider node exceeds 10 V Opta limit)
        if (v_measured >= 9.95) {
            Serial.println("Error: Input saturated! Voltage exceeds 10V limit.");
            return;
        }

        // 2. Solve for the combined equivalent resistance at the input junction
        float r_equivalent = (v_measured * R_FIXED) / (V_SUPPLY - v_measured);

        // 3. De-compensate the parallel circuit to isolate Thermistor Resistance
        float r_thermistor = 1.0 / ((1.0 / r_equivalent) - (1.0 / R_OPTA_INTERNAL));

        // Handle out-of-bounds safety check
        if (r_thermistor <= 0) {
            Serial.println("Error: Calculation out of bounds. Check circuit integrity.");
            return;
        }

        // 4. Beta-model calculation to convert resistance to temperature
        float temperatureK = 1.0 / ((1.0 / ROOM_TEMP_K) + (log(r_thermistor / R_NOMINAL) / B_COEFFICIENT));
        float temperatureC = temperatureK - 273.15; // Convert Kelvin to Celsius

        // Output measurements every 1 second (every 20 execution cycles)
        static int printCounter = 0;
        if (++printCounter >= 20) {
            printCounter = 0;
            Serial.print("Raw ADC: "); Serial.print(rawAdc);
            Serial.print(" | Smth ADC: "); Serial.print(filteredAdc, 1);
            Serial.print(" | Voltage: "); Serial.print(v_measured, 2); Serial.print("V");
            Serial.print(" | Temp: "); Serial.print(temperatureC, 2); Serial.println(" C");
        }
    }
}
