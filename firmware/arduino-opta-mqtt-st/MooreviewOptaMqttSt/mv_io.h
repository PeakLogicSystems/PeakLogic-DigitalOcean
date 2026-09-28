#pragma once
#include <Arduino.h>

void mvIoBegin();
bool mvReadDigitalIn(uint8_t index);
/** Single-sample 16-bit ADC read (no CT oversampling). */
int mvReadAnalogRawDirect(uint8_t index);
/** ST/Parc I*_RAW: 12-bit (CT channels are oversampled 16-bit then shifted). */
int mvReadAnalogRaw(uint8_t index);
void mvWriteRelay(uint8_t index, bool on);
bool mvReadRelay(uint8_t index);
bool mvReadBool(const char* id);
int mvReadInt(const char* id);
void mvWriteBool(const char* id, bool v);
void mvWriteInt(const char* id, int v);
bool mvIsPhysicalInput(const char* id);
bool mvIsPhysicalOutput(const char* id);
