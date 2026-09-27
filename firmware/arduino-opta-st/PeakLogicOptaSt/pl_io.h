#pragma once
#include <Arduino.h>

void plIoBegin();
bool plReadDigitalIn(uint8_t index);
int plReadAnalogRaw(uint8_t index);
void plWriteRelay(uint8_t index, bool on);
bool plReadBool(const char* id);
int plReadInt(const char* id);
void plWriteBool(const char* id, bool v);
void plWriteInt(const char* id, int v);
bool plIsPhysicalInput(const char* id);
bool plIsPhysicalOutput(const char* id);
