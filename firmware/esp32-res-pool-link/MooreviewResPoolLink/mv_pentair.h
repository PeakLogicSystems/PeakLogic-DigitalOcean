#pragma once

/*
 * Pentair proprietary RS-485 (9600 8N1) — not Modbus.
 * IntelliFlo / valve: FF 00 FF A5 … chk16
 * IntelliChlor:       10 02 … crc8 10 03
 * Same pair, polled with a bus gap. Port of src/drivers/pentairProtocol.js
 */

#include <Arduino.h>
#include <HardwareSerial.h>
#include <string.h>
#include "mv_board.h"
#include "mv_rs485.h"

#ifndef PENTAIR_UART
#define PENTAIR_UART 1
#endif

static HardwareSerial PentairSerial(PENTAIR_UART);

static const uint8_t PT_MASTER = 0x10;
static const uint8_t PT_CMD_SPEED = 0x01;
static const uint8_t PT_CMD_REMOTE = 0x04;
static const uint8_t PT_CMD_POWER = 0x06;
static const uint8_t PT_CMD_STATUS = 0x07;

enum MvPtCmd : uint8_t {
  PT_NONE = 0,
  PT_REMOTE_ON,
  PT_REMOTE_OFF,
  PT_RUN,
  PT_STOP,
  PT_RPM,
  PT_IC_PCT,
  PT_IC_TAKE,
};

struct MvPump {
  bool ok;
  uint32_t lastMs;
  bool running;
  uint8_t driveState;
  uint8_t mode;
  uint16_t watts;
  uint16_t rpm;
  uint8_t flow;
  char err[32];
};

struct MvChlor {
  bool ok;
  uint32_t lastMs;
  uint16_t saltPpm;
  uint8_t waterTempF;
  uint8_t icError;
  uint8_t icPercent;
  bool noFlow;
  bool lowSalt;
  bool highSalt;
  bool cleanCell;
  char err[32];
};

static MvPump gPump;
static MvChlor gChlor;
static uint8_t gPumpAddr = PENTAIR_ADDR_DEFAULT;
static uint8_t gPtPending = PT_NONE;
static uint16_t gPtRpm = 2350;
static uint8_t gPtIcPct = 50;
static uint8_t gPtPhase = 0;
static uint32_t gPtLastPoll = 0;
static const uint32_t PT_POLL_MS = 2200;
static const uint32_t PT_GAP_MS = 140;

static uint16_t ptChecksum16(const uint8_t *body, size_t n)
{
  uint16_t sum = 0;
  for (size_t i = 0; i < n; i++) sum = (uint16_t)(sum + body[i]);
  return sum;
}

static uint8_t ptIcChecksum8(const uint8_t *bytes, size_t n)
{
  uint8_t sum = 0;
  for (size_t i = 0; i < n; i++) sum = (uint8_t)(sum + bytes[i]);
  return sum;
}

static size_t ptBuildFrame(uint8_t dest, uint8_t cmd, const uint8_t *data, uint8_t dlen, uint8_t *out)
{
  out[0] = 0xFF;
  out[1] = 0x00;
  out[2] = 0xFF;
  out[3] = 0xA5;
  out[4] = 0x00;
  out[5] = dest;
  out[6] = PT_MASTER;
  out[7] = cmd;
  out[8] = dlen;
  if (dlen && data) memcpy(out + 9, data, dlen);
  const uint16_t sum = ptChecksum16(out + 3, (size_t)6 + dlen);
  out[9 + dlen] = (uint8_t)(sum >> 8);
  out[10 + dlen] = (uint8_t)(sum & 0xFF);
  return (size_t)11 + dlen;
}

static size_t ptBuildIc(const uint8_t *cmd, uint8_t clen, uint8_t *out)
{
  out[0] = 0x10;
  out[1] = 0x02;
  memcpy(out + 2, cmd, clen);
  uint8_t tmp[16];
  tmp[0] = 0x10;
  tmp[1] = 0x02;
  memcpy(tmp + 2, cmd, clen);
  out[2 + clen] = ptIcChecksum8(tmp, (size_t)2 + clen);
  out[3 + clen] = 0x10;
  out[4 + clen] = 0x03;
  return (size_t)5 + clen;
}

static bool ptParseA5(const uint8_t *buf, size_t n, uint8_t *src, uint8_t *cmd, const uint8_t **data, uint8_t *dlen)
{
  for (size_t i = 0; i + 10 <= n; i++) {
    if (buf[i] != 0xA5 && !(i > 0 && buf[i] == 0xA5)) continue;
    size_t start = i;
    if (buf[i] != 0xA5) continue;
    if (start + 8 > n) continue;
    const uint8_t len = buf[start + 5];
    const size_t frameEnd = start + 6 + len + 2;
    if (frameEnd > n) continue;
    const uint16_t got = (uint16_t)((buf[start + 6 + len] << 8) | buf[start + 7 + len]);
    if (ptChecksum16(buf + start, (size_t)6 + len) != got) continue;
    *src = buf[start + 3];
    *cmd = buf[start + 4];
    *data = buf + start + 6;
    *dlen = len;
    return true;
  }
  return false;
}

static bool ptParseIc(const uint8_t *buf, size_t n, const uint8_t **body, uint8_t *blen)
{
  for (size_t i = 0; i + 4 < n; i++) {
    if (buf[i] != 0x10 || buf[i + 1] != 0x02) continue;
    for (size_t j = i + 2; j + 1 < n; j++) {
      if (buf[j] != 0x10 || buf[j + 1] != 0x03) continue;
      if (j < i + 3) continue;
      const uint8_t crc = buf[j - 1];
      const size_t bodyLen = j - 1 - (i + 2);
      uint8_t tmp[40];
      if (bodyLen + 2 > sizeof(tmp)) continue;
      tmp[0] = 0x10;
      tmp[1] = 0x02;
      memcpy(tmp + 2, buf + i + 2, bodyLen);
      if (ptIcChecksum8(tmp, bodyLen + 2) != crc) continue;
      *body = buf + i + 2;
      *blen = (uint8_t)bodyLen;
      return true;
    }
  }
  return false;
}

static void ptApplyPump(const uint8_t *d, uint8_t len)
{
  if (len < 7) {
    strlcpy(gPump.err, "short pump", sizeof(gPump.err));
    return;
  }
  gPump.mode = d[1];
  gPump.driveState = d[2];
  gPump.running = (d[2] == 0x02);
  gPump.watts = (uint16_t)((d[3] << 8) | d[4]);
  gPump.rpm = (uint16_t)((d[5] << 8) | d[6]);
  gPump.flow = len > 7 ? d[7] : 0;
  gPump.ok = true;
  gPump.lastMs = millis();
  gPump.err[0] = 0;
}

static void ptApplyIc(const uint8_t *d, uint8_t len)
{
  if (!len) return;
  const uint8_t sub = len > 1 ? d[1] : 0;
  if (sub == 0x16 && len >= 3) {
    gChlor.waterTempF = d[2];
    gChlor.ok = true;
    gChlor.lastMs = millis();
    gChlor.err[0] = 0;
  } else if (sub == 0x12 && len >= 4) {
    gChlor.saltPpm = (uint16_t)d[2] * 50;
    gChlor.icError = d[3];
    gChlor.icPercent = len >= 5 ? d[4] : gChlor.icPercent;
    gChlor.noFlow = (d[3] & 0x01) != 0;
    gChlor.lowSalt = (d[3] & 0x02) != 0;
    gChlor.highSalt = (d[3] & 0x04) != 0;
    gChlor.cleanCell = (d[3] & 0x08) != 0;
    gChlor.ok = true;
    gChlor.lastMs = millis();
    gChlor.err[0] = 0;
  }
}

static bool ptXfer(const uint8_t *tx, size_t txn, uint8_t *rx, size_t rxmax, size_t *rxn, uint32_t timeoutMs)
{
  rs485Tx(PentairSerial, PENTAIR_DE, tx, txn);
  *rxn = rs485Read(PentairSerial, rx, rxmax, timeoutMs);
  return *rxn > 0;
}

static void ptSendPump(uint8_t cmd, const uint8_t *data, uint8_t dlen)
{
  uint8_t tx[32];
  uint8_t rx[96];
  size_t rxn = 0;
  const size_t txn = ptBuildFrame(gPumpAddr, cmd, data, dlen, tx);
  if (!ptXfer(tx, txn, rx, sizeof(rx), &rxn, 400)) {
    strlcpy(gPump.err, "no reply", sizeof(gPump.err));
    return;
  }
  uint8_t src = 0, rcmd = 0, dlen2 = 0;
  const uint8_t *data2 = nullptr;
  if (ptParseA5(rx, rxn, &src, &rcmd, &data2, &dlen2) && rcmd == PT_CMD_STATUS && data2) {
    ptApplyPump(data2, dlen2);
  }
}

static void ptSendIc(const uint8_t *cmd, uint8_t clen)
{
  uint8_t tx[16];
  uint8_t rx[64];
  size_t rxn = 0;
  const size_t txn = ptBuildIc(cmd, clen, tx);
  if (!ptXfer(tx, txn, rx, sizeof(rx), &rxn, 400)) {
    strlcpy(gChlor.err, "no reply", sizeof(gChlor.err));
    return;
  }
  const uint8_t *body = nullptr;
  uint8_t blen = 0;
  if (ptParseIc(rx, rxn, &body, &blen) && body) {
    ptApplyIc(body, blen);
  } else {
    strlcpy(gChlor.err, "bad IC frame", sizeof(gChlor.err));
  }
}

static void pentairBegin()
{
  rs485Begin(PENTAIR_DE);
  PentairSerial.begin(PENTAIR_BAUD, SERIAL_8N1, PENTAIR_RX, PENTAIR_TX);
  memset(&gPump, 0, sizeof(gPump));
  memset(&gChlor, 0, sizeof(gChlor));
  strlcpy(gPump.err, "not polled", sizeof(gPump.err));
  strlcpy(gChlor.err, "not polled", sizeof(gChlor.err));
}

static void pentairRequestRemote(bool on) { gPtPending = on ? PT_REMOTE_ON : PT_REMOTE_OFF; }
static void pentairRequestRun() { gPtPending = PT_RUN; }
static void pentairRequestStop() { gPtPending = PT_STOP; }
static void pentairRequestRpm(uint16_t rpm)
{
  if (rpm < 450) rpm = 450;
  if (rpm > 3450) rpm = 3450;
  gPtRpm = rpm;
  gPtPending = PT_RPM;
}
static void pentairRequestIcPercent(uint8_t pct)
{
  if (pct > 100) pct = 100;
  gPtIcPct = pct;
  gPtPending = PT_IC_PCT;
}
static void pentairRequestIcTakeover() { gPtPending = PT_IC_TAKE; }

static void pentairPoll()
{
  if (gPtPending != PT_NONE) {
    const uint8_t cmd = gPtPending;
    gPtPending = PT_NONE;
    if (cmd == PT_REMOTE_ON || cmd == PT_REMOTE_OFF) {
      const uint8_t d = (cmd == PT_REMOTE_ON) ? 0xFF : 0x00;
      ptSendPump(PT_CMD_REMOTE, &d, 1);
    } else if (cmd == PT_RUN) {
      const uint8_t d = 0x0A;
      ptSendPump(PT_CMD_POWER, &d, 1);
    } else if (cmd == PT_STOP) {
      const uint8_t d = 0x04;
      ptSendPump(PT_CMD_POWER, &d, 1);
    } else if (cmd == PT_RPM) {
      uint8_t d[5] = { 0x04, 0x02, 0xC4, (uint8_t)(gPtRpm >> 8), (uint8_t)(gPtRpm & 0xFF) };
      ptSendPump(PT_CMD_SPEED, d, 5);
    } else if (cmd == PT_IC_PCT) {
      if (gPtIcPct == 16) {
        const uint8_t d[4] = { 0x50, 0x11, 16, 0x00 };
        ptSendIc(d, 4);
      } else {
        const uint8_t d[3] = { 0x50, 0x11, gPtIcPct };
        ptSendIc(d, 3);
      }
    } else if (cmd == PT_IC_TAKE) {
      const uint8_t d[3] = { 0x50, 0x00, 0x00 };
      ptSendIc(d, 3);
    }
    delay(PT_GAP_MS);
    return;
  }

  if (millis() - gPtLastPoll < PT_POLL_MS) return;
  gPtLastPoll = millis();

  if (gPtPhase == 0) {
    ptSendPump(PT_CMD_STATUS, nullptr, 0);
  } else if (gPtPhase == 1) {
    const uint8_t d[3] = { 0x50, 0x12, 0x00 };
    ptSendIc(d, 3);
  } else {
    const uint8_t d[3] = { 0x50, 0x15, 0x00 };
    ptSendIc(d, 3);
  }
  gPtPhase = (uint8_t)((gPtPhase + 1) % 3);
  delay(PT_GAP_MS);
}

static const char *pumpDriveName(uint8_t st)
{
  if (st == 0x00) return "fault";
  if (st == 0x01) return "priming";
  if (st == 0x02) return "running";
  if (st == 0x04) return "sys priming";
  return "idle";
}
