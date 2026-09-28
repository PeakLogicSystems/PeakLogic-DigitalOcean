/**
 * CENSAR SK1 mezzanine — Uno Q SPI bring-up
 *
 * Safe defaults: all power enables OFF, all VOUT at mid (0 V), no electrode bias.
 * Exercises: mux select, 24-bit ADC read, DAC write, optional secondary ADC.
 *
 * Pin map matches docs/SK1_UNO_Q_MEZZANINE.md
 *
 * Build targets (Arduino IDE / App Lab → STM32U585 / Uno Q):
 *   -DADC_LT2400     OEM-style LTC2400/LT2400 on mezz (default)
 *   -DADC_ADS1256    TI ADS1256 path
 *   -DDAC_SOFT_MID   skip SPI DAC; report midrail only (bench without DAC IC)
 */

#include <SPI.h>
#include <math.h>

// ---- Pin map (Uno Q MCU / 3.3 V) ------------------------------------------
static const uint8_t PIN_SPI_SCK  = 13;
static const uint8_t PIN_SPI_MISO = 12;
static const uint8_t PIN_SPI_MOSI = 11;
static const uint8_t PIN_CS_ADC   = 10;
static const uint8_t PIN_CS_DAC   = 7;

static const uint8_t PIN_MUX0 = 2;
static const uint8_t PIN_MUX1 = 4;
static const uint8_t PIN_MUX2 = 6;
static const uint8_t PIN_MUX3 = 9;

static const uint8_t PIN_CL_SWITCH = 3;
static const uint8_t PIN_CL_DELAY  = 5;
static const uint8_t PIN_DO_SWITCH = 14;
static const uint8_t PIN_DO_DELAY  = 15;

static const uint8_t PIN_PC0 = 16;  // 2ND_AMPS
static const uint8_t PIN_PC1 = 17;  // COND
static const uint8_t PIN_PC2 = 18;  // CAT
static const uint8_t PIN_PC3 = 19;  // MEM (often active-low on OEM)

static const uint8_t PIN_SAP_CNTR_I = A0;
static const uint8_t PIN_SAP_CNTR_V = A1;
static const uint8_t PIN_SAP_PG1    = A2;
static const uint8_t PIN_SAP_PG2    = A3;

// Active levels — CONFIRM ON HARDWARE before enabling amps/bias
static const bool PC_ACTIVE_HIGH = true;
static const bool TMR_IDLE_HIGH  = true;

// ADC full-scale (V). OEM LT2400 used 2.5 V ref.
static const float VREF_ADC = 2.5f;

// Bipolar DAC: code mid = 0 V at SK1 (after ± gain stage)
static const uint16_t DAC_MID = 0x8000;  // 16-bit mid for DAC8568-style
static const float BIAS_FS_V   = 1.25f;  // VOUT1-4
static const float PROTON_FS_V = 2.12f;  // VOUT5-6

enum MuxChannel : uint8_t {
  MUX_PH = 0,
  MUX_REDOX,
  MUX_COND,
  MUX_TEMP,
  MUX_CL,
  MUX_DO,
  MUX_D1,
  MUX_D2,
  MUX_CAT1,
  MUX_CAT2,
  MUX_F1,
  MUX_F2,
  MUX_G1,
  MUX_G2,
  MUX_H1,
  MUX_H2
};

static const char *const MUX_NAMES[16] = {
  "PH", "REDOX", "COND", "TEMP", "CL", "DO", "D1", "D2",
  "CAT1", "CAT2", "F1", "F2", "G1", "G2", "H1", "H2"
};

// ---- Helpers --------------------------------------------------------------
static void csAdc(bool assertLow) { digitalWrite(PIN_CS_ADC, assertLow ? LOW : HIGH); }
static void csDac(bool assertLow) { digitalWrite(PIN_CS_DAC, assertLow ? LOW : HIGH); }

static void setMux(uint8_t ch) {
  ch &= 0x0F;
  digitalWrite(PIN_MUX0, (ch >> 0) & 1);
  digitalWrite(PIN_MUX1, (ch >> 1) & 1);
  digitalWrite(PIN_MUX2, (ch >> 2) & 1);
  digitalWrite(PIN_MUX3, (ch >> 3) & 1);
  delayMicroseconds(50);  // analog settle — tune on scope
}

static void setPc(uint8_t pin, bool on) {
  bool level = PC_ACTIVE_HIGH ? on : !on;
  digitalWrite(pin, level ? HIGH : LOW);
}

static void setTmrIdle() {
  const uint8_t idle = TMR_IDLE_HIGH ? HIGH : LOW;
  digitalWrite(PIN_CL_SWITCH, idle);
  digitalWrite(PIN_CL_DELAY, idle);
  digitalWrite(PIN_DO_SWITCH, idle);
  digitalWrite(PIN_DO_DELAY, idle);
}

static void allPowerOff() {
  setPc(PIN_PC0, false);
  setPc(PIN_PC1, false);
  setPc(PIN_PC2, false);
  setPc(PIN_PC3, false);
}

// ---- LT2400 (OEM digital card IC30) ---------------------------------------
#if !defined(ADC_ADS1256)
// SPI mode: sample on rising SCK typically works; confirm with scope.
// Conversion ~133–147 ms (60/50 Hz). CS low starts next conversion after read.

static bool lt2400Ready() {
  // SDO high while converting when CS is low (see LTC2400 datasheet)
  csAdc(true);
  delayMicroseconds(2);
  bool busy = digitalRead(PIN_SPI_MISO);
  csAdc(false);
  return !busy;
}

static bool adcReadRaw(int32_t *out) {
  const uint32_t t0 = millis();
  while (!lt2400Ready()) {
    if (millis() - t0 > 300) return false;
    delay(1);
  }

  csAdc(true);
  SPI.beginTransaction(SPISettings(500000, MSBFIRST, SPI_MODE0));
  uint32_t raw = 0;
  for (int i = 0; i < 4; i++) {
    raw = (raw << 8) | SPI.transfer(0xFF);
  }
  SPI.endTransaction();
  csAdc(false);

  // Match Siemens spiadc.c packing / sign extend
  uint32_t status = raw & 0x0F000000UL;
  int32_t v = (int32_t)(raw & 0x01FFFFFFUL);
  if ((status & 0x02000000UL) == 0) {
    v |= (int32_t)0xFE000000L;  // negative / sign extend
  }
  *out = v;
  return true;
}

static float adcToVolts(int32_t raw) {
  // 24-bit + sub-LSB; treat as Q24 around VREF (tune after calibration)
  const float fs = (float)(1L << 24);
  return ((float)raw / fs) * VREF_ADC;
}
#endif

// ---- ADS1256 (optional modern ADC) ----------------------------------------
#if defined(ADC_ADS1256)
static void adsWriteReg(uint8_t reg, uint8_t val) {
  csAdc(true);
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE1));
  SPI.transfer(0x50 | (reg & 0x0F));
  SPI.transfer(0x00);
  SPI.transfer(val);
  SPI.endTransaction();
  csAdc(false);
  delayMicroseconds(10);
}

static bool adcReadRaw(int32_t *out) {
  csAdc(true);
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE1));
  SPI.transfer(0x01);  // RDATA
  delayMicroseconds(10);
  int32_t v = 0;
  v |= ((int32_t)SPI.transfer(0)) << 16;
  v |= ((int32_t)SPI.transfer(0)) << 8;
  v |= (int32_t)SPI.transfer(0);
  SPI.endTransaction();
  csAdc(false);
  if (v & 0x800000L) v |= ~0xFFFFFFL;
  *out = v;
  return true;
}

static float adcToVolts(int32_t raw) {
  return ((float)raw / (float)(1L << 23)) * VREF_ADC;
}

static void adsInit() {
  adsWriteReg(0x00, 0x01);  // STATUS
  adsWriteReg(0x01, 0x01);  // MUX AIN0/AIN1 placeholder — mezz uses external mux
  adsWriteReg(0x02, 0x00);  // ADCON
  adsWriteReg(0x03, 0xF0);  // DRATE slow / low noise for bring-up
}
#endif

// ---- DAC8568-style write (channels 0..5) ----------------------------------
// Command format simplified: write+update channel. Confirm against your DAC.
static bool dacWriteCode(uint8_t ch, uint16_t code) {
#if defined(DAC_SOFT_MID)
  (void)ch;
  (void)code;
  return true;
#else
  if (ch > 7) return false;
  // DAC8568: 32-bit frame — adjust if using AD5686 / AD8403 bridge
  uint32_t frame = 0;
  frame |= (0x3UL << 24);           // write+update DAC n
  frame |= ((uint32_t)(ch & 7) << 20);
  frame |= ((uint32_t)code << 4);

  csDac(true);
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE1));
  SPI.transfer((frame >> 24) & 0xFF);
  SPI.transfer((frame >> 16) & 0xFF);
  SPI.transfer((frame >> 8) & 0xFF);
  SPI.transfer(frame & 0xFF);
  SPI.endTransaction();
  csDac(false);
  return true;
#endif
}

/** volts: desired SK1 voltage; fs: ± full-scale of that channel */
static bool dacSetVolts(uint8_t ch, float volts, float fs) {
  if (fs <= 0.0f) return false;
  if (volts > fs) volts = fs;
  if (volts < -fs) volts = -fs;
  float norm = (volts / fs) * 0.5f + 0.5f;  // -fs..+fs → 0..1
  uint16_t code = (uint16_t)lroundf(norm * 65535.0f);
  return dacWriteCode(ch, code);
}

static void dacAllMid() {
  for (uint8_t ch = 0; ch < 6; ch++) {
    dacWriteCode(ch, DAC_MID);
  }
}

// ---- Serial command interface ---------------------------------------------
static void printHelp() {
  Serial.println(F("CENSAR SK1 bring-up"));
  Serial.println(F("  h          help"));
  Serial.println(F("  s          safe: power OFF, DAC mid, TMR idle"));
  Serial.println(F("  m <0-15>   set mux channel"));
  Serial.println(F("  r [n]      read ADC n times (default 1) on current mux"));
  Serial.println(F("  scan       read mux 0..5 once each"));
  Serial.println(F("  sap        read secondary A0-A3"));
  Serial.println(F("  v <ch> <V> set DAC ch 0..5 volts (bias fs=1.25, proton 2.12)"));
  Serial.println(F("  mid        all DAC mid (0 V)"));
  Serial.println(F("  p <0-3> <0|1>  PC enable (DANGER if analog mated)"));
  Serial.println(F("  pulse cl|do <us>  SWITCH then DELAY pulse width"));
}

static void cmdSafe() {
  allPowerOff();
  setTmrIdle();
  dacAllMid();
  setMux(MUX_PH);
  Serial.println(F("SAFE: PC off, TMR idle, DAC mid, mux=PH"));
}

static void cmdRead(int n) {
  if (n < 1) n = 1;
  for (int i = 0; i < n; i++) {
    int32_t raw = 0;
    if (!adcReadRaw(&raw)) {
      Serial.println(F("ADC timeout"));
      return;
    }
    Serial.print(F("raw="));
    Serial.print(raw);
    Serial.print(F("  V="));
    Serial.println(adcToVolts(raw), 6);
  }
}

static void cmdScan() {
  for (uint8_t ch = 0; ch <= MUX_DO; ch++) {
    setMux(ch);
    delay(5);
    int32_t raw = 0;
    Serial.print(MUX_NAMES[ch]);
    Serial.print('\t');
    if (!adcReadRaw(&raw)) {
      Serial.println(F("timeout"));
      continue;
    }
    Serial.println(adcToVolts(raw), 6);
  }
}

static void cmdSap() {
  Serial.print(F("CNTR_I\t")); Serial.println(analogRead(PIN_SAP_CNTR_I));
  Serial.print(F("CNTR_V\t")); Serial.println(analogRead(PIN_SAP_CNTR_V));
  Serial.print(F("PG1\t"));    Serial.println(analogRead(PIN_SAP_PG1));
  Serial.print(F("PG2\t"));    Serial.println(analogRead(PIN_SAP_PG2));
}

static void cmdPulse(bool chlorine, uint32_t us) {
  const uint8_t sw = chlorine ? PIN_CL_SWITCH : PIN_DO_SWITCH;
  const uint8_t dl = chlorine ? PIN_CL_DELAY  : PIN_DO_DELAY;
  const uint8_t active = TMR_IDLE_HIGH ? LOW : HIGH;
  const uint8_t idle   = TMR_IDLE_HIGH ? HIGH : LOW;

  digitalWrite(sw, active);
  delayMicroseconds(us);
  digitalWrite(sw, idle);
  delayMicroseconds(100);
  digitalWrite(dl, active);
  delayMicroseconds(us);
  digitalWrite(dl, idle);
  Serial.println(F("pulse done"));
}

static void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line == "h" || line == "help") { printHelp(); return; }
  if (line == "s" || line == "safe") { cmdSafe(); return; }
  if (line == "scan") { cmdScan(); return; }
  if (line == "sap") { cmdSap(); return; }
  if (line == "mid") { dacAllMid(); Serial.println(F("DAC mid")); return; }

  if (line.startsWith("m ")) {
    int ch = line.substring(2).toInt();
    setMux((uint8_t)ch);
    Serial.print(F("mux="));
    Serial.println(ch);
    return;
  }
  if (line.startsWith("r")) {
    int n = 1;
    if (line.length() > 1) n = line.substring(1).toInt();
    cmdRead(n);
    return;
  }
  if (line.startsWith("v ")) {
    // v <ch> <volts>
    int ch = 0;
    float volts = 0;
    if (sscanf(line.c_str(), "v %d %f", &ch, &volts) != 2 || ch < 0 || ch > 5) {
      Serial.println(F("usage: v <0-5> <volts>"));
      return;
    }
    float fs = (ch >= 4) ? PROTON_FS_V : BIAS_FS_V;
    if (dacSetVolts((uint8_t)ch, volts, fs)) {
      Serial.println(F("DAC ok"));
    } else {
      Serial.println(F("DAC fail"));
    }
    return;
  }
  if (line.startsWith("p ")) {
    int idx = 0, on = 0;
    if (sscanf(line.c_str(), "p %d %d", &idx, &on) != 2 || idx < 0 || idx > 3) {
      Serial.println(F("usage: p <0-3> <0|1>"));
      return;
    }
    const uint8_t pins[] = { PIN_PC0, PIN_PC1, PIN_PC2, PIN_PC3 };
    setPc(pins[idx], on != 0);
    Serial.println(F("PC set — confirm current/rails"));
    return;
  }
  if (line.startsWith("pulse ")) {
    char which[8] = {0};
    unsigned us = 0;
    if (sscanf(line.c_str(), "pulse %7s %u", which, &us) != 2) {
      Serial.println(F("usage: pulse cl|do <us>"));
      return;
    }
    cmdPulse(which[0] == 'c' || which[0] == 'C', us);
    return;
  }

  Serial.println(F("unknown — h for help"));
}

// ---- Arduino entry --------------------------------------------------------
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) { /* Uno Q may enumerate USB */ }

  pinMode(PIN_CS_ADC, OUTPUT);
  pinMode(PIN_CS_DAC, OUTPUT);
  csAdc(false);
  csDac(false);

  pinMode(PIN_MUX0, OUTPUT);
  pinMode(PIN_MUX1, OUTPUT);
  pinMode(PIN_MUX2, OUTPUT);
  pinMode(PIN_MUX3, OUTPUT);

  pinMode(PIN_CL_SWITCH, OUTPUT);
  pinMode(PIN_CL_DELAY, OUTPUT);
  pinMode(PIN_DO_SWITCH, OUTPUT);
  pinMode(PIN_DO_DELAY, OUTPUT);

  pinMode(PIN_PC0, OUTPUT);
  pinMode(PIN_PC1, OUTPUT);
  pinMode(PIN_PC2, OUTPUT);
  pinMode(PIN_PC3, OUTPUT);

  pinMode(PIN_SPI_MISO, INPUT);

  SPI.begin();

#if defined(ADC_ADS1256)
  adsInit();
#endif

  cmdSafe();
  printHelp();
  Serial.println(F("READY"));
}

void loop() {
  static String buf;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (buf.length()) {
        handleLine(buf);
        buf = "";
      }
    } else if (buf.length() < 80) {
      buf += c;
    }
  }
}
