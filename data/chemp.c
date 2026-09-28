#include <Arduino.h>

// --- Opta Analog Input Pins ---
const int PH_PIN = A0;        
const int ORP_PIN = A1;       
const int TURBIDITY_PIN = A2;  

// --- Continuous System Configuration ---
const float MAX_NTU = 4000.0;     
const float TSS_SLOPE = 1.2;       
const float TSS_INTERCEPT = 5.0;   

// --- Flow Configuration ---
// Adjust this to match your average daily flow rate in Gallons Per Day (GPD)
const float DAILY_FLOW_GALLONS = 5000.0; 

// --- Moving Average Filter (To handle continuous noise) ---
#define FILTER_SPAN 5
float pH_history[FILTER_SPAN] = {7.0};
float orp_history[FILTER_SPAN] = {0.0};
int filter_index = 0;

// --- Timing Control ---
unsigned long last_time = 0;
const unsigned long INTERVAL = 60000; // Track and update every 1 minute

float prev_avg_pH = 7.0;
float prev_avg_orp = 0.0;

// Helper function to calculate moving averages
float get_moving_average(float array[], float new_value) {
    array[filter_index] = new_value;
    float sum = 0;
    for(int i = 0; i < FILTER_SPAN; i++) {
        sum += array[i];
    }
    return sum / FILTER_SPAN;
}

void setup() {
    Serial.begin(9600);
    analogReadResolution(12); // 12-bit precision for Opta (0-4095)
    
    pinMode(LED_D0, OUTPUT); 
    pinMode(LED_D1, OUTPUT); 
}

void loop() {
    unsigned long current_time = millis();
    
    if (current_time - last_time >= INTERVAL) {
        float dt = (current_time - last_time) / 60000.0; // Minutes passed
        last_time = current_time;

        // 1. Read Raw 12-bit Signals (0-10V over 4095 steps)
        float v_pH = (analogRead(PH_PIN) / 4095.0) * 10.0;
        float v_orp = (analogRead(ORP_PIN) / 4095.0) * 10.0;
        float v_turbidity = (analogRead(TURBIDITY_PIN) / 4095.0) * 10.0;

        // 2. Decode Raw Voltage to True Values
        float raw_pH = ((v_pH / 10.0) * 3.0) - 1.5; 
        float raw_orp = (((v_orp / 10.0) * 3.0) - 1.5) * 1000.0; // Convert to mV
        float current_ntu = (v_turbidity / 10.0) * MAX_NTU;

        // 3. Apply Moving Average Filter to smooth continuous pump noise
        float avg_pH = get_moving_average(pH_history, raw_pH);
        float avg_orp = get_moving_average(orp_history, raw_orp);
        
        // Increment filter index for the next loop
        filter_index = (filter_index + 1) % FILTER_SPAN;

        // 4. Continuous TSS and Solids Loading Math
        float inferred_tss = (TSS_SLOPE * current_ntu) + TSS_INTERCEPT;
        
        // Convert daily gallons to Million Gallons per Day (MGD)
        float flow_MGD = DAILY_FLOW_GALLONS / 1000000.0;
        // Formula: MGD * TSS (mg/L) * 8.34 = Pounds of solids per day
        float solids_loading_lbs = flow_MGD * inferred_tss * 8.34;

        // 5. Compute Continuous Slopes (Derivatives)
        float dpH_dt = (avg_pH - prev_avg_pH) / dt;
        float dORP_dt = (avg_orp - prev_avg_orp) / dt;

        // 6. Real-Time Diagnostics
        Serial.print("Filtered pH: "); Serial.print(avg_pH);
        Serial.print(" (Slope: "); Serial.print(dpH_dt, 3); Serial.print(")");
        Serial.print(" | Filtered ORP: "); Serial.print(avg_orp); Serial.print(" mV");
        Serial.print(" (Slope: "); Serial.print(dORP_dt, 1); Serial.println(")");
        
        Serial.print("Estimated TSS: "); Serial.print(inferred_tss); Serial.print(" mg/L");
        Serial.print(" | Solids Loading: "); Serial.print(solids_loading_lbs, 2); Serial.println(" lbs/day");
        Serial.println("----------------------------------------------------------------");

        // Save current averages for next trend step
        prev_avg_pH = avg_pH;
        prev_avg_orp = avg_orp;
    }
}


#include <Arduino.h>

// --- Opta Analog Input Pins ---
const int PH_PIN = A0;        
const int ORP_PIN = A1;       
const int TURBIDITY_PIN = A2;  

// --- Continuous System Configuration ---
const float MAX_NTU = 4000.0;     
const float TSS_SLOPE = 1.2;       
const float TSS_INTERCEPT = 5.0;   

// --- TSS Control Limits ---
// Set the maximum safe TSS limit for your plant (e.g., 3000 mg/L in MLSS or 30 mg/L in effluent)
const float MAX_SAFE_TSS = 3000.0; 

// --- Flow Configuration ---
const float DAILY_FLOW_GALLONS = 5000.0; 

// --- Moving Average Filter ---
#define FILTER_SPAN 5
float pH_history[FILTER_SPAN] = {7.0};
float orp_history[FILTER_SPAN] = {0.0};
int filter_index = 0;

unsigned long last_time = 0;
const unsigned long INTERVAL = 60000; 

float prev_avg_pH = 7.0;
float prev_avg_orp = 0.0;

float get_moving_average(float array[], float new_value) {
    array[filter_index] = new_value;
    float sum = 0;
    for(int i = 0; i < FILTER_SPAN; i++) {
        sum += array[i];
    }
    return sum / FILTER_SPAN;
}

void setup() {
    Serial.begin(9600);
    analogReadResolution(12); // 12-bit precision for Opta
    
    pinMode(LED_D0, OUTPUT); // Ammonia Status
    pinMode(LED_D1, OUTPUT); // Nitrate Status
    pinMode(LED_D2, OUTPUT); // TSS Alarm High LED
}

void loop() {
    unsigned long current_time = millis();
    
    if (current_time - last_time >= INTERVAL) {
        float dt = (current_time - last_time) / 60000.0; 
        last_time = current_time;

        // 1. Read Raw 12-bit Signals
        float v_pH = (analogRead(PH_PIN) / 4095.0) * 10.0;
        float v_orp = (analogRead(ORP_PIN) / 4095.0) * 10.0;
        float v_turbidity = (analogRead(TURBIDITY_PIN) / 4095.0) * 10.0;

        // 2. Decode Raw Voltage
        float raw_pH = ((v_pH / 10.0) * 3.0) - 1.5; 
        float raw_orp = (((v_orp / 10.0) * 3.0) - 1.5) * 1000.0; 
        float current_ntu = (v_turbidity / 10.0) * MAX_NTU;

        // 3. Apply Moving Average
        float avg_pH = get_moving_average(pH_history, raw_pH);
        float avg_orp = get_moving_average(orp_history, raw_orp);
        filter_index = (filter_index + 1) % FILTER_SPAN;

        // 4. Calculate TSS and Solids Loading
        float inferred_tss = (TSS_SLOPE * current_ntu) + TSS_INTERCEPT;
        float flow_MGD = DAILY_FLOW_GALLONS / 1000000.0;
        float solids_loading_lbs = flow_MGD * inferred_tss * 8.34;

        // 5. ACTION: Use TSS directly to trigger a control action
        bool tss_alarm_active = false;
        if (inferred_tss > MAX_SAFE_TSS) {
            tss_alarm_active = true;
            digitalWrite(LED_D2, HIGH); // Turn on the High TSS Alarm LED
        } else {
            digitalWrite(LED_D2, LOW);
        }

        // 6. Compute Continuous Slopes
        float dpH_dt = (avg_pH - prev_avg_pH) / dt;
        float dORP_dt = (avg_orp - prev_avg_orp) / dt;

        // 7. Output Control and Industrial Logging
        Serial.print("TSS: "); Serial.print(inferred_tss); Serial.print(" mg/L");
        Serial.print(" | Solids Loading: "); Serial.print(solids_loading_lbs, 2); Serial.println(" lbs/day");
        
        if (tss_alarm_active) {
            Serial.println(">> WARNING: TSS High Limit Exceeded! <<");
        }
        Serial.println("----------------------------------------------------------------");

        prev_avg_pH = avg_pH;
        prev_avg_orp = avg_orp;
    }
}
