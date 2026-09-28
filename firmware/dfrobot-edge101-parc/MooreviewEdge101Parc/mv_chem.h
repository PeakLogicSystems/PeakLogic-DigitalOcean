#pragma once

/*
 * DFRobot SEN0711 (pH / NH3 / temp) + SEN0712 (free chlorine)
 * Isolated RS485 on Edge101 — 4800 8N1, FC04.
 * Maps: src/devices/templates/dfrobot_sen0711_ammonia_ph.json
 *       src/devices/templates/dfrobot_sen0712_chlorine.json
 */

#include <Arduino.h>
#include <HardwareSerial.h>
#include <string.h>
#include "mv_board.h"
#include "mv_rs485.h"

static HardwareSerial ChemSerial(CHEM_UART);

struct MvChem {
  bool phOk;
  bool clOk;
  uint32_t lastPhMs;
  uint32_t lastClMs;
  float ph;
  float nh3;
  float tempC;
  float clPpm;
  char err[40];
};

static MvChem gChem;
static uint8_t gPhSlave = CHEM_PH_SLAVE_DEFAULT;
static uint8_t gClSlave = CHEM_CL_SLAVE_DEFAULT;
static uint8_t gChemPhase = 0;
static uint32_t gChemLast = 0;
static const uint32_t CHEM_POLL_MS = 4000;

static uint16_t mbCrc(const uint8_t *buf, size_t len)
{
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= buf[i];
    for (uint8_t b = 0; b < 8; b++) {
      if (crc & 1) crc = (uint16_t)((crc >> 1) ^ 0xA001);
      else crc >>= 1;
    }
  }
  return crc;
}

static bool mbReadInput(uint8_t slave, uint16_t start, uint16_t qty, uint16_t *regs, uint8_t maxRegs, uint8_t *got)
{
  uint8_t tx[8];
  tx[0] = slave;
  tx[1] = 0x04;
  tx[2] = (uint8_t)(start >> 8);
  tx[3] = (uint8_t)(start & 0xFF);
  tx[4] = (uint8_t)(qty >> 8);
  tx[5] = (uint8_t)(qty & 0xFF);
  const uint16_t crc = mbCrc(tx, 6);
  tx[6] = (uint8_t)(crc & 0xFF);
  tx[7] = (uint8_t)(crc >> 8);

  uint8_t rx[32];
  rs485Tx(ChemSerial, CHEM_DE, tx, 8);
  const size_t n = rs485Read(ChemSerial, rx, sizeof(rx), 600);
  if (n < 5) return false;
  if (rx[0] != slave || rx[1] != 0x04) return false;
  const uint8_t bc = rx[2];
  if (n < (size_t)5 + bc) return false;
  if (mbCrc(rx, (size_t)3 + bc) != (uint16_t)(rx[3 + bc] | (rx[4 + bc] << 8))) return false;
  const uint8_t count = bc / 2;
  if (count > maxRegs) return false;
  for (uint8_t i = 0; i < count; i++) {
    regs[i] = (uint16_t)((rx[3 + i * 2] << 8) | rx[4 + i * 2]);
  }
  *got = count;
  return true;
}

static void chemBegin()
{
  rs485Begin(CHEM_DE);
  ChemSerial.begin(CHEM_BAUD, SERIAL_8N1, CHEM_RX, CHEM_TX);
  memset(&gChem, 0, sizeof(gChem));
  strlcpy(gChem.err, "not polled", sizeof(gChem.err));
}

static void chemPoll()
{
  if (millis() - gChemLast < CHEM_POLL_MS) return;
  gChemLast = millis();

  uint16_t regs[4];
  uint8_t got = 0;
  if (gChemPhase == 0) {
    if (mbReadInput(gPhSlave, 0, 3, regs, 4, &got) && got >= 3) {
      gChem.nh3 = regs[0] * 0.01f;
      gChem.ph = regs[1] * 0.01f;
      gChem.tempC = ((int16_t)regs[2]) * 0.1f;
      gChem.phOk = true;
      gChem.lastPhMs = millis();
      if (!gChem.clOk) gChem.err[0] = 0;
    } else {
      gChem.phOk = false;
      strlcpy(gChem.err, "SEN0711 no reply", sizeof(gChem.err));
    }
  } else {
    if (mbReadInput(gClSlave, 0, 1, regs, 4, &got) && got >= 1) {
      gChem.clPpm = regs[0] * 0.01f;
      gChem.clOk = true;
      gChem.lastClMs = millis();
      if (gChem.phOk) gChem.err[0] = 0;
    } else {
      gChem.clOk = false;
      strlcpy(gChem.err, "SEN0712 no reply", sizeof(gChem.err));
    }
  }
  gChemPhase ^= 1;
}
