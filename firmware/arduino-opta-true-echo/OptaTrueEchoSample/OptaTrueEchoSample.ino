/*
 * OptaTrueEchoSample — APG True Echo radar (Modbus RTU) on Arduino Opta RS-485
 *
 * Standalone bring-up sketch (no MQTT / ST). Polls process values and prints
 * to Serial (115200). Same register map as PeakLogic template apg_true_echo_rtu
 * and mqtt-st mv_fieldbus (MV_FIELDBUS=1).
 *
 * Wiring: Opta RS-485 A/B/GND ↔ True Echo RS-485 A/B/GND
 * Defaults (sensor): 9600 8N1, Modbus ID 1, ≥100 ms between transactions
 *
 * Board: Arduino Opta (or Opta WiFi)
 * Library: ArduinoRS485 (Library Manager)
 *
 * Manual: https://apgsensors.com/ (True Echo CR-L Modbus FC04 input registers)
 */

#include <Arduino.h>
#include <ArduinoRS485.h>
#include <string.h>
#include <math.h>

// ─── User settings ───────────────────────────────────────────────────────────
#ifndef TE_SLAVE_ID
#define TE_SLAVE_ID 1
#endif
#ifndef TE_BAUD
#define TE_BAUD 9600
#endif
#ifndef TE_POLL_MS
#define TE_POLL_MS 500
#endif
#ifndef TE_FRAME_DELAY_MS
#define TE_FRAME_DELAY_MS 100
#endif
#ifndef TE_IO_TIMEOUT_MS
#define TE_IO_TIMEOUT_MS 800
#endif

struct TrueEchoReading {
  uint16_t distCm;
  uint16_t distMm;
  uint16_t lvlCm;
  uint16_t lvlMm;
  float space;   // selected units (float32 CDAB @ IR 36)
  float level;   // selected units (float32 CDAB @ IR 38)
  float dist;    // selected units (float32 CDAB @ IR 40)
  bool ok;
  char err[24];
};

static uint32_t g_lastTxMs = 0;
static uint32_t g_lastPollMs = 0;
static uint32_t g_okCount = 0;
static uint32_t g_failCount = 0;

static uint16_t mbCrc16(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (uint8_t b = 0; b < 8; b++) {
      if (crc & 1) crc = (crc >> 1) ^ 0xA001;
      else crc >>= 1;
    }
  }
  return crc;
}

static void rs485FlushRx() {
  while (RS485.available()) (void)RS485.read();
}

static void rs485EnsureGap() {
  if (g_lastTxMs == 0) return;
  uint32_t elapsed = millis() - g_lastTxMs;
  if (elapsed < TE_FRAME_DELAY_MS) delay(TE_FRAME_DELAY_MS - elapsed);
}

/** FC04 Read Input Registers. Returns qty on success, 0 on failure (sets err). */
static uint8_t mbReadInputRegisters(uint8_t slave, uint16_t startAddr, uint16_t qty,
                                    uint16_t* outRegs, uint8_t outCap, char* err, size_t errLen) {
  if (!outRegs || qty == 0 || qty > outCap || qty > 60) {
    snprintf(err, errLen, "bad-args");
    return 0;
  }

  uint8_t req[8];
  req[0] = slave;
  req[1] = 0x04;
  req[2] = (uint8_t)(startAddr >> 8);
  req[3] = (uint8_t)(startAddr & 0xFF);
  req[4] = (uint8_t)(qty >> 8);
  req[5] = (uint8_t)(qty & 0xFF);
  uint16_t crc = mbCrc16(req, 6);
  req[6] = (uint8_t)(crc & 0xFF);
  req[7] = (uint8_t)(crc >> 8);

  rs485EnsureGap();
  rs485FlushRx();

  RS485.beginTransmission();
  RS485.write(req, sizeof(req));
  RS485.endTransmission();
  g_lastTxMs = millis();

  uint16_t expect = (uint16_t)(5 + 2 * qty);
  uint8_t resp[128];
  if (expect > sizeof(resp)) {
    snprintf(err, errLen, "buf");
    return 0;
  }

  uint16_t got = 0;
  const uint32_t t0 = millis();
  while (got < expect && (millis() - t0) < TE_IO_TIMEOUT_MS) {
    if (!RS485.available()) continue;
    resp[got++] = (uint8_t)RS485.read();
    if (got == 2 && (resp[1] & 0x80)) expect = 5;
  }

  if (got < expect) {
    snprintf(err, errLen, "timeout");
    return 0;
  }
  if (resp[1] & 0x80) {
    snprintf(err, errLen, "ex-%u", (got >= 3) ? resp[2] : 0);
    return 0;
  }
  if (resp[0] != slave || resp[1] != 0x04) {
    snprintf(err, errLen, "bad-hdr");
    return 0;
  }
  if (resp[2] != (uint8_t)(qty * 2)) {
    snprintf(err, errLen, "bad-bc");
    return 0;
  }
  uint16_t rxCrc = (uint16_t)resp[got - 2] | ((uint16_t)resp[got - 1] << 8);
  if (rxCrc != mbCrc16(resp, got - 2)) {
    snprintf(err, errLen, "bad-crc");
    return 0;
  }

  for (uint16_t i = 0; i < qty; i++) {
    outRegs[i] = ((uint16_t)resp[3 + 2 * i] << 8) | resp[4 + 2 * i];
  }
  err[0] = '\0';
  return (uint8_t)qty;
}

/** APG float32 CDAB: reg0=CD, reg1=AB → IEEE bit pattern ABCD */
static float teDecodeCdab(uint16_t r0, uint16_t r1) {
  uint32_t bits = ((uint32_t)r1 << 16) | (uint32_t)r0;
  float f;
  memcpy(&f, &bits, sizeof(f));
  return f;
}

static bool trueEchoPoll(uint8_t slave, TrueEchoReading* out) {
  memset(out, 0, sizeof(*out));
  out->space = NAN;
  out->level = NAN;
  out->dist = NAN;

  uint16_t regs[4];
  if (mbReadInputRegisters(slave, 0, 4, regs, 4, out->err, sizeof(out->err)) != 4) {
    return false;
  }
  out->distCm = regs[0];
  out->distMm = regs[1];
  out->lvlCm = regs[2];
  out->lvlMm = regs[3];

  uint16_t fregs[6];
  if (mbReadInputRegisters(slave, 36, 6, fregs, 6, out->err, sizeof(out->err)) != 6) {
    return false;
  }
  out->space = teDecodeCdab(fregs[0], fregs[1]);
  out->level = teDecodeCdab(fregs[2], fregs[3]);
  out->dist = teDecodeCdab(fregs[4], fregs[5]);
  out->ok = true;
  return true;
}

static void printReading(const TrueEchoReading& r) {
  if (!r.ok) {
    Serial.print(F("[TE] FAIL "));
    Serial.println(r.err);
    return;
  }
  Serial.print(F("[TE] dist_cm="));
  Serial.print(r.distCm);
  Serial.print(F(" dist_mm="));
  Serial.print(r.distMm);
  Serial.print(F(" lvl_cm="));
  Serial.print(r.lvlCm);
  Serial.print(F(" lvl_mm="));
  Serial.print(r.lvlMm);
  Serial.print(F(" | space="));
  Serial.print(r.space, 3);
  Serial.print(F(" level="));
  Serial.print(r.level, 3);
  Serial.print(F(" dist="));
  Serial.print(r.dist, 3);
  Serial.print(F(" | ok="));
  Serial.print(g_okCount);
  Serial.print(F(" fail="));
  Serial.println(g_failCount);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println(F("OptaTrueEchoSample — APG True Echo Modbus RTU"));
  Serial.print(F("  slave="));
  Serial.print(TE_SLAVE_ID);
  Serial.print(F(" baud="));
  Serial.print(TE_BAUD);
  Serial.print(F(" pollMs="));
  Serial.print(TE_POLL_MS);
  Serial.print(F(" frameDelayMs="));
  Serial.println(TE_FRAME_DELAY_MS);

  RS485.setPins(RS485_DEFAULT_DE_PIN, RS485_DEFAULT_RE_PIN);
  RS485.begin(TE_BAUD, SERIAL_8N1);
  Serial.println(F("RS-485 ready — polling FC04 IR 0–3 and 36–41"));
}

void loop() {
  uint32_t now = millis();
  if (now - g_lastPollMs < TE_POLL_MS) return;
  g_lastPollMs = now;

  TrueEchoReading r;
  if (trueEchoPoll(TE_SLAVE_ID, &r)) {
    g_okCount++;
  } else {
    g_failCount++;
  }
  printReading(r);
}
