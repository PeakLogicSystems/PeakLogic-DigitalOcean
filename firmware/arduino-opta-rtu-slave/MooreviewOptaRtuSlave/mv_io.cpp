#include "mv_io.h"
#include "mv_config.h"

#if defined(ARDUINO_OPTA)
static const uint8_t kRelayLedPins[] = { LED_D0, LED_D1, LED_D2, LED_D3 };
#endif

static bool kRelayState[4] = { false, false, false, false };

static uint8_t dinPin(uint8_t idx) {
  return (uint8_t)(MV_DIN_PIN0 + idx);
}

static uint8_t relayPin(uint8_t idx) {
  return (uint8_t)(MV_RELAY_PIN0 + idx);
}

void mvIoBegin() {
  for (uint8_t i = 0; i < 8; i++) {
    pinMode(dinPin(i), INPUT_PULLUP);
  }
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(relayPin(i), OUTPUT);
    digitalWrite(relayPin(i), LOW);
#if defined(ARDUINO_OPTA)
    pinMode(kRelayLedPins[i], OUTPUT);
    digitalWrite(kRelayLedPins[i], LOW);
#endif
    kRelayState[i] = false;
  }
}

bool mvReadDigitalIn(uint8_t index) {
  if (index >= 8) return false;
  return digitalRead(dinPin(index)) == HIGH;
}

int mvReadAnalogRaw(uint8_t index) {
  if (index >= 8) return 0;
  return analogRead(dinPin(index));
}

void mvWriteRelay(uint8_t index, bool on) {
  if (index >= 4) return;
  digitalWrite(relayPin(index), on ? HIGH : LOW);
  kRelayState[index] = on;
#if defined(ARDUINO_OPTA)
  digitalWrite(kRelayLedPins[index], on ? HIGH : LOW);
#endif
}

bool mvReadRelay(uint8_t index) {
  if (index >= 4) return false;
  return kRelayState[index];
}
