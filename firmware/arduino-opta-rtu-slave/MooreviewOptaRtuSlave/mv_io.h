#pragma once
#include <Arduino.h>

void mvIoBegin();
bool mvReadDigitalIn(uint8_t index);
int mvReadAnalogRaw(uint8_t index);
void mvWriteRelay(uint8_t index, bool on);
bool mvReadRelay(uint8_t index);
