#include "pl_io.h"
#include "pl_config.h"

static uint8_t dinPin(uint8_t idx) {
  return (uint8_t)(PL_DIN_PIN0 + idx);
}

static uint8_t relayPin(uint8_t idx) {
  return (uint8_t)(PL_RELAY_PIN0 + idx);
}

void plIoBegin() {
  for (uint8_t i = 0; i < 8; i++) {
    pinMode(dinPin(i), INPUT_PULLUP);
  }
  for (uint8_t i = 0; i < 4; i++) {
    pinMode(relayPin(i), OUTPUT);
    digitalWrite(relayPin(i), LOW);
  }
}

bool plReadDigitalIn(uint8_t index) {
  if (index >= 8) return false;
  return digitalRead(dinPin(index)) == HIGH;
}

int plReadAnalogRaw(uint8_t index) {
  if (index >= 8) return 0;
  return analogRead(dinPin(index));
}

void plWriteRelay(uint8_t index, bool on) {
  if (index >= 4) return;
  digitalWrite(relayPin(index), on ? HIGH : LOW);
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

bool plIsPhysicalInput(const char* id) {
  return dinIndex(id) >= 0 || rawIndex(id) >= 0;
}

bool plIsPhysicalOutput(const char* id) {
  return relayIndex(id) >= 0;
}

bool plReadBool(const char* id) {
  int di = dinIndex(id);
  if (di >= 0) return plReadDigitalIn((uint8_t)di);
  return false;
}

int plReadInt(const char* id) {
  int ai = rawIndex(id);
  if (ai >= 0) return plReadAnalogRaw((uint8_t)ai);
  return 0;
}

void plWriteBool(const char* id, bool v) {
  int r = relayIndex(id);
  if (r >= 0) plWriteRelay((uint8_t)r, v);
}

void plWriteInt(const char* id, int v) {
  (void)id;
  (void)v;
}
