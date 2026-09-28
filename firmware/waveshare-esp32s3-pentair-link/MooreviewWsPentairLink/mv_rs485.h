#pragma once

#include <HardwareSerial.h>

#ifndef MV_RS485_NO_DE
#define MV_RS485_NO_DE 255
#endif

static void rs485Begin(uint8_t dePin)
{
  if (dePin != MV_RS485_NO_DE) {
    pinMode(dePin, OUTPUT);
    digitalWrite(dePin, LOW);
  }
}

static void rs485Tx(HardwareSerial &ser, uint8_t dePin, const uint8_t *data, size_t n)
{
  while (ser.available()) ser.read();
  if (dePin != MV_RS485_NO_DE) {
    digitalWrite(dePin, HIGH);
    delayMicroseconds(80);
  }
  ser.write(data, n);
  ser.flush();
  if (dePin != MV_RS485_NO_DE) {
    delayMicroseconds(80);
    digitalWrite(dePin, LOW);
  } else {
    delayMicroseconds(120);
  }
}

static size_t rs485Read(HardwareSerial &ser, uint8_t *buf, size_t maxLen, uint32_t timeoutMs)
{
  size_t n = 0;
  const uint32_t t0 = millis();
  uint32_t last = t0;
  while (millis() - t0 < timeoutMs) {
    while (ser.available() && n < maxLen) {
      buf[n++] = (uint8_t)ser.read();
      last = millis();
    }
    if (n > 0 && (millis() - last) >= 35) break;
    delay(1);
  }
  return n;
}
