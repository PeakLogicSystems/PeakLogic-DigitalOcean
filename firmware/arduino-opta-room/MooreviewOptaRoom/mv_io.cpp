#include "mv_io.h"
#include "mv_config.h"

#if defined(ARDUINO_OPTA)
static const uint8_t kRelayLedPins[] = { LED_D0, LED_D1, LED_D2, LED_D3 };
static bool kRelayState[4] = { false, false, false, false };
#endif

static uint8_t dinPin(uint8_t idx) {
  return (uint8_t)(MV_DIN_PIN0 + idx);
}

static uint8_t relayPin(uint8_t idx) {
  return (uint8_t)(MV_RELAY_PIN0 + idx);
}

#if defined(ARDUINO_OPTA)
static void mvWriteRelayLed(uint8_t index, bool on) {
  if (index >= 4) return;
  digitalWrite(kRelayLedPins[index], on ? HIGH : LOW);
}
#endif

void mvIoBegin() {
  for (uint8_t i = 0; i < 8; i++) {
    pinMode(dinPin(i), INPUT_PULLUP);
  }
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(relayPin(i), OUTPUT);
    digitalWrite(relayPin(i), LOW);
#if defined(ARDUINO_OPTA)
    pinMode(kRelayLedPins[i], OUTPUT);
    mvWriteRelayLed(i, false);
#endif
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
#if defined(ARDUINO_OPTA)
  kRelayState[index] = on;
  mvWriteRelayLed(index, on);
#endif
}

bool mvReadRelay(uint8_t index) {
  if (index >= 4) return false;
#if defined(ARDUINO_OPTA)
  return kRelayState[index];
#else
  return false;
#endif
}

static int dinIndex(const char* id) {
  if (!id || id[0] != 'I' || id[1] < '1' || id[1] > '8') return -1;
  if (id[2] == 0) return id[1] - '1';
  return -1;
}

static int relayIndex(const char* id) {
  if (!id || id[0] != 'R' || id[1] < '1' || id[1] > '4') return -1;
  if (id[2] == 0) return id[1] - '1';
  return -1;
}

static int rawIndex(const char* id) {
  if (!id) return -1;
  if (strncmp(id, "I", 1) != 0) return -1;
  const char* p = strstr(id, "_RAW");
  if (!p || p[4] != 0) return -1;
  if (id[1] < '1' || id[1] > '8') return -1;
  return id[1] - '1';
}

bool mvIsPhysicalInput(const char* id) {
  return dinIndex(id) >= 0 || rawIndex(id) >= 0;
}

bool mvIsPhysicalOutput(const char* id) {
  return relayIndex(id) >= 0;
}

bool mvReadBool(const char* id) {
  int di = dinIndex(id);
  if (di >= 0) return mvReadDigitalIn((uint8_t)di);
  return false;
}

int mvReadInt(const char* id) {
  int ai = rawIndex(id);
  if (ai >= 0) return mvReadAnalogRaw((uint8_t)ai);
  return 0;
}

void mvWriteBool(const char* id, bool v) {
  int r = relayIndex(id);
  if (r >= 0) mvWriteRelay((uint8_t)r, v);
}

void mvWriteInt(const char* id, int v) {
  (void)id;
  (void)v;
}
