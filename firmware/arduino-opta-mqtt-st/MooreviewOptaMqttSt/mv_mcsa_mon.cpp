#include "mv_mcsa_mon.h"
#include "mv_config.h"
#include "mv_ct_cal.h"
#include "mv_io.h"
#include "mv_tags.h"
#include "mv_mcsa_m7.h"
#include "mv_mcsa_shared.h"
#include "mv_mqtt.h"
#include <Arduino.h>
#include <math.h>
#include <stddef.h>
#include <string.h>

#define MV_MCSA_MON_MAGIC 0x4D564D4Eu /* 'MVMN' */
#define MV_MCSA_MON_VERSION 2
/** NV blob size for config version 1 (no motor[] tail). */
#define MV_MCSA_MON_V1_SIZE (offsetof(MvMcsaMonConfig, motorCount) + sizeof(uint16_t))

static MvMcsaMonConfig g_cfg;
static bool g_loaded = false;
static float s_tC[MV_MCSA_MON_NTC];
static float s_wrMv = 0.0f;
static bool s_wrDetect = false;
static bool s_wrIn = false;
static bool s_compFlt = false;
static bool s_fanFlt = false;
static float s_chAmps[MV_MCSA_MON_CH];

static uint16_t monCrc(const MvMcsaMonConfig* cfg) {
  const uint8_t* p = (const uint8_t*)cfg;
  uint16_t crc = 0xFFFF;
  const size_t n = sizeof(MvMcsaMonConfig) - sizeof(cfg->crc);
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static bool monValid(const MvMcsaMonConfig* cfg) {
  return cfg && cfg->magic == MV_MCSA_MON_MAGIC && cfg->version == MV_MCSA_MON_VERSION
    && cfg->crc == monCrc(cfg);
}

static uint16_t monCrcBytes(const uint8_t* p, size_t n) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static bool monValidV1(const uint8_t* buf, size_t blobLen) {
  if (!buf || blobLen != MV_MCSA_MON_V1_SIZE) return false;
  const MvMcsaMonConfig* cfg = (const MvMcsaMonConfig*)buf;
  if (cfg->magic != MV_MCSA_MON_MAGIC || cfg->version != 1) return false;
  const size_t body = MV_MCSA_MON_V1_SIZE - sizeof(uint16_t);
  const uint16_t expect = monCrcBytes(buf, body);
  const uint16_t stored = (uint16_t)buf[body] | ((uint16_t)buf[body + 1] << 8);
  return stored == expect;
}

static void motorSlotDefaults(MvMcsaMotorSlot* m, uint8_t idx, uint8_t wiring) {
  memset(m, 0, sizeof(*m));
  m->enabled = 1;
  m->wiring = wiring;
  m->ctStart = MV_MOTOR_CT_NONE;
  m->ctPhaseB = MV_MOTOR_CT_NONE;
  m->ctPhaseC = MV_MOTOR_CT_NONE;
  if (wiring == MV_MOTOR_WIRE_3P) {
    if (idx == 0) {
      m->ctRun = 0;
      m->ctPhaseB = 1;
      m->ctPhaseC = 2;
      strncpy(m->assetId, "pump-1", sizeof(m->assetId) - 1);
      strncpy(m->startMsTag, "MOTOR1_START_MS", sizeof(m->startMsTag) - 1);
    } else {
      m->ctRun = 3;
      m->ctPhaseB = 4;
      m->ctPhaseC = 5;
      strncpy(m->assetId, "pump-2", sizeof(m->assetId) - 1);
      strncpy(m->startMsTag, "MOTOR2_START_MS", sizeof(m->startMsTag) - 1);
    }
  } else if (wiring == MV_MOTOR_WIRE_1P_CAP) {
    if (idx == 0) {
      m->ctRun = 0;
      m->ctStart = 1;
      strncpy(m->assetId, "pump-1", sizeof(m->assetId) - 1);
      strncpy(m->startMsTag, "MOTOR1_START_MS", sizeof(m->startMsTag) - 1);
    } else {
      m->ctRun = 2;
      m->ctStart = 3;
      strncpy(m->assetId, "pump-2", sizeof(m->assetId) - 1);
      strncpy(m->startMsTag, "MOTOR2_START_MS", sizeof(m->startMsTag) - 1);
    }
  } else {
    if (idx == 0) {
      m->ctRun = 0;
      strncpy(m->assetId, "motor-1", sizeof(m->assetId) - 1);
      strncpy(m->startMsTag, "MOTOR1_START_MS", sizeof(m->startMsTag) - 1);
    } else {
      m->ctRun = 1;
      strncpy(m->assetId, "motor-2", sizeof(m->assetId) - 1);
      strncpy(m->startMsTag, "MOTOR2_START_MS", sizeof(m->startMsTag) - 1);
    }
  }
  m->assetId[sizeof(m->assetId) - 1] = '\0';
  m->startMsTag[sizeof(m->startMsTag) - 1] = '\0';
}

static void migrateV1Motors(MvMcsaMonConfig* cfg) {
  cfg->version = MV_MCSA_MON_VERSION;
  cfg->motorCount = 2;
  motorSlotDefaults(&cfg->motor[0], 0, MV_MOTOR_WIRE_3P);
  motorSlotDefaults(&cfg->motor[1], 1, MV_MOTOR_WIRE_3P);
}

static void motorClamp(MvMcsaMotorSlot* m) {
  if (!m) return;
  if (m->wiring > MV_MOTOR_WIRE_3P) m->wiring = MV_MOTOR_WIRE_3P;
  if (m->ctRun > 7) m->ctRun = 0;
  if (m->ctStart > 7 && m->ctStart != MV_MOTOR_CT_NONE) m->ctStart = MV_MOTOR_CT_NONE;
  if (m->ctPhaseB > 7 && m->ctPhaseB != MV_MOTOR_CT_NONE) m->ctPhaseB = MV_MOTOR_CT_NONE;
  if (m->ctPhaseC > 7 && m->ctPhaseC != MV_MOTOR_CT_NONE) m->ctPhaseC = MV_MOTOR_CT_NONE;
  if (m->wiring == MV_MOTOR_WIRE_1P) {
    m->ctStart = MV_MOTOR_CT_NONE;
    m->ctPhaseB = MV_MOTOR_CT_NONE;
    m->ctPhaseC = MV_MOTOR_CT_NONE;
  } else if (m->wiring == MV_MOTOR_WIRE_1P_CAP) {
    m->ctPhaseB = MV_MOTOR_CT_NONE;
    m->ctPhaseC = MV_MOTOR_CT_NONE;
    if (m->ctStart > 7) m->ctStart = (uint8_t)(m->ctRun < 7 ? m->ctRun + 1 : 0);
  } else {
    if (m->ctPhaseB == MV_MOTOR_CT_NONE) m->ctPhaseB = (uint8_t)(m->ctRun < 5 ? m->ctRun + 1 : 0);
    if (m->ctPhaseC == MV_MOTOR_CT_NONE) m->ctPhaseC = (uint8_t)(m->ctPhaseB < 5 ? m->ctPhaseB + 1 : 0);
    m->ctStart = MV_MOTOR_CT_NONE;
  }
  if (!m->assetId[0]) snprintf(m->assetId, sizeof(m->assetId), "motor-%u", (unsigned)(m->ctRun + 1));
  if (!m->startMsTag[0]) strncpy(m->startMsTag, "MOTOR1_START_MS", sizeof(m->startMsTag) - 1);
  m->assetId[sizeof(m->assetId) - 1] = '\0';
  m->startMsTag[sizeof(m->startMsTag) - 1] = '\0';
}

static float ctAmpsCh(uint8_t ch) {
  if (ch > 7) return 0.0f;
  return mvCtReadAmps(ch);
}

static bool hvacUsesMotorCt(const MvMcsaMonConfig* cfg) {
  if (!cfg || cfg->ioLayout != MV_MCSA_IO_HVAC) return false;
  return cfg->motor[0].wiring == MV_MOTOR_WIRE_1P_CAP && cfg->motor[0].ctStart <= 7;
}

static bool hvacDualCondFacility(const MvMcsaMonConfig* cfg) {
  return hvacUsesMotorCt(cfg) && cfg->motorCount >= 4;
}

static bool hvacRtuFacility(const MvMcsaMonConfig* cfg) {
  return hvacUsesMotorCt(cfg) && cfg->motorCount == 3;
}

static void hvacDualCondDefaults(MvMcsaMonConfig* cfg) {
  cfg->motorCount = 4;
  const struct { uint8_t run; uint8_t start; const char* id; } rows[4] = {
      {1, 0, "fan1"},
      {3, 2, "fan2"},
      {5, 4, "comp1"},
      {7, 6, "comp2"},
  };
  for (uint8_t i = 0; i < 4; i++) {
    MvMcsaMotorSlot* m = &cfg->motor[i];
    memset(m, 0, sizeof(*m));
    m->enabled = 1;
    m->wiring = MV_MOTOR_WIRE_1P_CAP;
    m->ctRun = rows[i].run;
    m->ctStart = rows[i].start;
    strncpy(m->assetId, rows[i].id, sizeof(m->assetId) - 1);
    snprintf(m->startMsTag, sizeof(m->startMsTag), "MOTOR%u_START_MS", (unsigned)(i + 1));
  }
  cfg->tCh[0] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 1);
  cfg->tCh[1] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 0);
  cfg->tCh[2] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 3);
  cfg->tCh[3] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 2);
  strncpy(cfg->tLabel[0], "U1 high", 15);
  strncpy(cfg->tLabel[1], "U1 low", 15);
  strncpy(cfg->tLabel[2], "U2 high", 15);
  strncpy(cfg->tLabel[3], "U2 low", 15);
}

static void hvacRtuDefaults(MvMcsaMonConfig* cfg) {
  cfg->motorCount = 3;
  const struct { uint8_t run; uint8_t start; const char* id; } rows[3] = {
      {1, 0, "blower"},
      {3, 2, "fan"},
      {5, 4, "comp"},
  };
  for (uint8_t i = 0; i < 3; i++) {
    MvMcsaMotorSlot* m = &cfg->motor[i];
    memset(m, 0, sizeof(*m));
    m->enabled = 1;
    m->wiring = MV_MOTOR_WIRE_1P_CAP;
    m->ctRun = rows[i].run;
    m->ctStart = rows[i].start;
    strncpy(m->assetId, rows[i].id, sizeof(m->assetId) - 1);
    snprintf(m->startMsTag, sizeof(m->startMsTag), "MOTOR%u_START_MS", (unsigned)(i + 1));
  }
  cfg->tCh[0] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 1);
  cfg->tCh[1] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 0);
  cfg->tCh[2] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 2);
  cfg->tCh[3] = (uint8_t)(MV_MCSA_TCH_EXP_BASE + 3);
  strncpy(cfg->tLabel[0], "high", 15);
  strncpy(cfg->tLabel[1], "low", 15);
  strncpy(cfg->tLabel[2], "supply", 15);
  strncpy(cfg->tLabel[3], "return", 15);
}

static float ctAmpsIndex(uint8_t ch);

static void publishDualCondFacilityAmps() {
  mvSetReal("COND1_FAN_START_AMPS", ctAmpsIndex(0));
  mvSetReal("COND1_FAN_AMPS", ctAmpsIndex(1));
  mvSetReal("COND2_FAN_START_AMPS", ctAmpsIndex(2));
  mvSetReal("COND2_FAN_AMPS", ctAmpsIndex(3));
  mvSetReal("COND1_COMP_START_AMPS", ctAmpsIndex(4));
  mvSetReal("COND1_COMP_AMPS", ctAmpsIndex(5));
  mvSetReal("COND2_COMP_START_AMPS", ctAmpsIndex(6));
  mvSetReal("COND2_COMP_AMPS", ctAmpsIndex(7));
}

static void publishDualCondFacilityFlts(bool c1Fan, bool c1Comp, bool c2Fan, bool c2Comp) {
  mvSetBool("COND1_FAN_FLT", c1Fan);
  mvSetBool("COND1_COMP_FLT", c1Comp);
  mvSetBool("COND2_FAN_FLT", c2Fan);
  mvSetBool("COND2_COMP_FLT", c2Comp);
  mvSetBool("FAN_FLT", c1Fan || c2Fan);
  mvSetBool("COMP_FLT", c1Comp || c2Comp);
}

static void publishRtuFacilityAmps() {
  mvSetReal("RTU_BLOWER_START_AMPS", ctAmpsIndex(0));
  mvSetReal("RTU_BLOWER_AMPS", ctAmpsIndex(1));
  mvSetReal("RTU_FAN_START_AMPS", ctAmpsIndex(2));
  mvSetReal("RTU_FAN_AMPS", ctAmpsIndex(3));
  mvSetReal("RTU_COMP_START_AMPS", ctAmpsIndex(4));
  mvSetReal("RTU_COMP_AMPS", ctAmpsIndex(5));
}

static void publishRtuFacilityFlts(bool fanFlt, bool compFlt) {
  mvSetBool("RTU_FAN_FLT", fanFlt);
  mvSetBool("RTU_COMP_FLT", compFlt);
  mvSetBool("FAN_FLT", fanFlt);
  mvSetBool("COMP_FLT", compFlt);
}

static float ctAmpsIndex(uint8_t ch) {
  if (ch < MV_MCSA_MON_CH) return s_chAmps[ch];
  if (ch < 8) return mvCtReadAmps(ch);
  return 0.0f;
}

static void publishHvacMotorAmps(const MvMcsaMonConfig* cfg) {
  float fanRun = 0.0f, fanStart = 0.0f, compRun = 0.0f, compStart = 0.0f;
  const uint8_t n = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
  for (uint8_t i = 0; i < n; i++) {
    const MvMcsaMotorSlot* m = &cfg->motor[i];
    if (!m->enabled) continue;
    const float runA = m->ctRun <= 7 ? ctAmpsIndex(m->ctRun) : 0.0f;
    const float startA = m->ctStart <= 7 ? ctAmpsIndex(m->ctStart) : 0.0f;
    if (strstr(m->assetId, "comp") != nullptr) {
      compRun = runA;
      compStart = startA;
    } else {
      fanRun = runA;
      fanStart = startA;
    }
  }
  mvSetReal("FAN_AMPS", fanRun);
  mvSetReal("FAN_START_AMPS", fanStart);
  mvSetReal("COMP_AMPS", compRun);
  mvSetReal("COMP_START_AMPS", compStart);
}

void mvMcsaMonSyncChannelEnable(MvMcsaMonConfig* cfg) {
  if (!cfg) return;
  memset(cfg->chEnable, 0, sizeof(cfg->chEnable));
  if (cfg->ioLayout == MV_MCSA_IO_HVAC && hvacUsesMotorCt(cfg)) {
    const uint8_t n = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
    for (uint8_t i = 0; i < n; i++) {
      MvMcsaMotorSlot* m = &cfg->motor[i];
      motorClamp(m);
      if (!m->enabled) continue;
      if (m->ctRun <= 7) cfg->chEnable[m->ctRun] = 1;
      if (m->ctStart <= 7) cfg->chEnable[m->ctStart] = 1;
    }
    return;
  }
  if (cfg->ioLayout == MV_MCSA_IO_HVAC) {
    cfg->chEnable[0] = 1;
    cfg->chEnable[1] = 1;
    return;
  }
  const uint8_t n = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
  for (uint8_t i = 0; i < n; i++) {
    MvMcsaMotorSlot* m = &cfg->motor[i];
    motorClamp(m);
    if (!m->enabled) continue;
    if (m->ctRun <= 5) cfg->chEnable[m->ctRun] = 1;
    if (m->wiring == MV_MOTOR_WIRE_1P_CAP && m->ctStart <= 5) cfg->chEnable[m->ctStart] = 1;
    if (m->wiring == MV_MOTOR_WIRE_3P) {
      if (m->ctPhaseB <= 5) cfg->chEnable[m->ctPhaseB] = 1;
      if (m->ctPhaseC <= 5) cfg->chEnable[m->ctPhaseC] = 1;
    }
  }
  if (n == 0) {
    for (uint8_t i = 0; i < MV_MCSA_MON_CH; i++) cfg->chEnable[i] = 1;
  }
}

bool mvMcsaMonMotorCtRange(const MvMcsaMotorSlot* m, uint8_t* lo, uint8_t* hi) {
  if (!m || !m->enabled || !lo || !hi) return false;
  uint8_t minCh = 255;
  uint8_t maxCh = 0;
  const uint8_t list[] = { m->ctRun, m->ctStart, m->ctPhaseB, m->ctPhaseC };
  for (uint8_t i = 0; i < 4; i++) {
    const uint8_t ch = list[i];
    if (ch > 5) continue;
    if (ch < minCh) minCh = ch;
    if (ch > maxCh) maxCh = ch;
  }
  if (minCh > 5) return false;
  *lo = minCh;
  *hi = maxCh;
  return true;
}

float mvMcsaMonMotorSenseAmps(const MvMcsaMotorSlot* m) {
  if (!m || !m->enabled) return 0.0f;
  float maxA = 0.0f;
  if (m->wiring == MV_MOTOR_WIRE_1P_CAP && m->ctStart <= 5) {
    maxA = ctAmpsCh(m->ctStart);
    const float runA = m->ctRun <= 5 ? ctAmpsCh(m->ctRun) : 0.0f;
    if (runA > maxA) maxA = runA;
    return maxA;
  }
  if (m->wiring == MV_MOTOR_WIRE_3P) {
    if (m->ctRun <= 5) maxA = ctAmpsCh(m->ctRun);
    if (m->ctPhaseB <= 5) {
      const float a = ctAmpsCh(m->ctPhaseB);
      if (a > maxA) maxA = a;
    }
    if (m->ctPhaseC <= 5) {
      const float a = ctAmpsCh(m->ctPhaseC);
      if (a > maxA) maxA = a;
    }
    return maxA;
  }
  return m->ctRun <= 5 ? ctAmpsCh(m->ctRun) : 0.0f;
}

float mvMcsaMonMotorRunAmps(const MvMcsaMotorSlot* m) {
  if (!m || !m->enabled) return 0.0f;
  if (m->wiring == MV_MOTOR_WIRE_3P) return mvMcsaMonMotorSenseAmps(m);
  return m->ctRun <= 5 ? ctAmpsCh(m->ctRun) : 0.0f;
}

float mvMcsaMonMotorStartCtAmps(const MvMcsaMotorSlot* m) {
  if (!m || !m->enabled || m->wiring != MV_MOTOR_WIRE_1P_CAP) return 0.0f;
  return m->ctStart <= 5 ? ctAmpsCh(m->ctStart) : 0.0f;
}

bool mvMcsaMonMotorActive(uint8_t idx) {
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  if (idx >= MV_MCSA_MAX_MOTORS) return false;
  if (!cfg->enabled || cfg->ioLayout != MV_MCSA_IO_LIFT6) return false;
  if (idx >= cfg->motorCount) return false;
  return cfg->motor[idx].enabled != 0;
}

const MvMcsaMotorSlot* mvMcsaMonMotor(uint8_t idx) {
  if (!mvMcsaMonMotorActive(idx)) return nullptr;
  return &mvMcsaMonActive()->motor[idx];
}

uint8_t mvMcsaMonMotorCount() {
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  if (!cfg->enabled || cfg->ioLayout != MV_MCSA_IO_LIFT6) return 0;
  uint8_t n = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
  if (!n) n = MV_MCSA_MAX_MOTORS;
  return n;
}

void mvMcsaMonDefaults(MvMcsaMonConfig* cfg) {
  memset(cfg, 0, sizeof(*cfg));
  cfg->magic = MV_MCSA_MON_MAGIC;
  cfg->version = MV_MCSA_MON_VERSION;
  cfg->enabled = 0;
  cfg->deviceType = MV_MCSA_DEV_PUMP; /* lift duplex default when enabled */
  cfg->motorConfigMode = 0;
  cfg->ioLayout = MV_MCSA_IO_LIFT6;
  cfg->numPoles = 4;
  cfg->driveFaultRelays = 0;
  cfg->wrDetectAbove = 1;
  cfg->wrDin = 7;
  cfg->wrCh = 6;
  cfg->tCh[0] = 2;
  cfg->tCh[1] = 3;
  cfg->tCh[2] = 4;
  cfg->tCh[3] = 5;
  cfg->lineFreqHz = 60.0f;
  cfg->slip = 0.03f;
  cfg->ntcVsupply = 24.0f;
  cfg->ntcRfixed = 10000.0f;
  cfg->ntcRopt = 5850.0f;
  cfg->ntcR25 = 10000.0f;
  cfg->ntcBeta = 3950.0f;
  cfg->wrThresholdMv = 2500.0f;
  for (uint8_t i = 0; i < MV_MCSA_MON_CH; i++) {
    cfg->chEnable[i] = 1;
    cfg->fanBlades[i] = 6;
    cfg->impellerVanes[i] = 5;
    cfg->compressorLobes[i] = 4;
    cfg->turbineBlades[i] = 24;
  }
  strncpy(cfg->tLabel[0], "discharge", 15);
  strncpy(cfg->tLabel[1], "suction", 15);
  strncpy(cfg->tLabel[2], "ambient", 15);
  strncpy(cfg->tLabel[3], "pan", 15);
  cfg->motorCount = 2;
  motorSlotDefaults(&cfg->motor[0], 0, MV_MOTOR_WIRE_3P);
  motorSlotDefaults(&cfg->motor[1], 1, MV_MOTOR_WIRE_3P);
  mvMcsaMonSyncChannelEnable(cfg);
  cfg->crc = monCrc(cfg);
}

#if defined(ARDUINO_OPTA) && __has_include(<kvstore_global_api.h>)
#include <kvstore_global_api.h>
#define MV_MCSA_MON_HAS_KV 1
static const char* MV_MCSA_MON_KV = "/kv/mv_mcsa_mon";
#endif

static void monLoad() {
  mvMcsaMonDefaults(&g_cfg);
#ifdef MV_MCSA_MON_HAS_KV
  uint8_t buf[sizeof(MvMcsaMonConfig)];
  size_t actual = 0;
  if (kv_get(MV_MCSA_MON_KV, buf, sizeof(buf), &actual) == 0 && actual > 0) {
    if (actual == sizeof(MvMcsaMonConfig)) {
      MvMcsaMonConfig* tmp = (MvMcsaMonConfig*)buf;
      if (monValid(tmp)) memcpy(&g_cfg, tmp, sizeof(g_cfg));
    } else if (actual == MV_MCSA_MON_V1_SIZE && monValidV1(buf, actual)) {
      MvMcsaMonConfig tmp;
      mvMcsaMonDefaults(&tmp);
      memcpy(&tmp, buf, MV_MCSA_MON_V1_SIZE - sizeof(uint16_t));
      migrateV1Motors(&tmp);
      tmp.crc = monCrc(&tmp);
      memcpy(&g_cfg, &tmp, sizeof(g_cfg));
    }
  }
#endif
  g_loaded = true;
}

bool mvMcsaMonSave(const MvMcsaMonConfig* cfg) {
  if (!cfg) return false;
  MvMcsaMonConfig tmp;
  memcpy(&tmp, cfg, sizeof(tmp));
  tmp.magic = MV_MCSA_MON_MAGIC;
  tmp.version = MV_MCSA_MON_VERSION;
  if (tmp.deviceType > MV_MCSA_DEV_ALL) tmp.deviceType = MV_MCSA_DEV_BASE;
  if (tmp.ioLayout > MV_MCSA_IO_HVAC) tmp.ioLayout = MV_MCSA_IO_LIFT6;
  if (tmp.numPoles < 2) tmp.numPoles = 2;
  if (tmp.numPoles > 16) tmp.numPoles = 16;
  if (tmp.lineFreqHz < 40.0f) tmp.lineFreqHz = 50.0f;
  if (tmp.lineFreqHz > 70.0f) tmp.lineFreqHz = 60.0f;
  if (tmp.slip < 0.001f) tmp.slip = 0.001f;
  if (tmp.slip > 0.2f) tmp.slip = 0.2f;
  if (tmp.wrCh > 7) tmp.wrCh = 6;
  for (uint8_t i = 0; i < MV_MCSA_MON_NTC; i++) {
    if (tmp.tCh[i] < MV_MCSA_TCH_EXP_BASE && tmp.tCh[i] > 7) tmp.tCh[i] = (uint8_t)(2 + i);
    tmp.tLabel[i][15] = '\0';
  }
  for (uint8_t i = 0; i < MV_MCSA_MON_CH; i++) {
    if (tmp.fanBlades[i] < 1) tmp.fanBlades[i] = 1;
    if (tmp.impellerVanes[i] < 1) tmp.impellerVanes[i] = 1;
    if (tmp.compressorLobes[i] < 1) tmp.compressorLobes[i] = 1;
    if (tmp.turbineBlades[i] < 1) tmp.turbineBlades[i] = 1;
  }
  if (tmp.ioLayout == MV_MCSA_IO_HVAC) {
    if (hvacUsesMotorCt(&tmp)) {
      if (tmp.motorCount == 0 || tmp.motorCount > MV_MCSA_MAX_MOTORS) tmp.motorCount = MV_MCSA_MAX_MOTORS;
      for (uint8_t i = 0; i < MV_MCSA_MAX_MOTORS; i++) motorClamp(&tmp.motor[i]);
      mvMcsaMonSyncChannelEnable(&tmp);
    } else {
      tmp.chEnable[0] = 1;
      tmp.chEnable[1] = 1;
      for (uint8_t i = 2; i < MV_MCSA_MON_CH; i++) tmp.chEnable[i] = 0;
    }
  } else {
    if (tmp.motorCount == 0 || tmp.motorCount > MV_MCSA_MAX_MOTORS) tmp.motorCount = MV_MCSA_MAX_MOTORS;
    for (uint8_t i = 0; i < MV_MCSA_MAX_MOTORS; i++) motorClamp(&tmp.motor[i]);
    mvMcsaMonSyncChannelEnable(&tmp);
  }
  tmp.crc = monCrc(&tmp);
  memcpy(&g_cfg, &tmp, sizeof(g_cfg));
  g_loaded = true;
#ifdef MV_MCSA_MON_HAS_KV
  const bool ok = kv_set(MV_MCSA_MON_KV, &tmp, sizeof(tmp), 0) == 0;
#else
  const bool ok = true;
#endif
  if (ok) {
    mvMcsaMonEnsureTags();
    mvMqttRequestTelemetryFlush();
  }
  return ok;
}

const MvMcsaMonConfig* mvMcsaMonActive() {
  if (!g_loaded) monLoad();
  return &g_cfg;
}

bool mvMcsaMonEnabled() {
  return mvMcsaMonActive()->enabled != 0;
}

bool mvMcsaMonChannelIsCt(uint8_t ch) {
  if (ch >= MV_MCSA_MON_CH) return false;
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  if (!cfg->enabled) return ch < MV_CT_CHANNELS;
  if (cfg->ioLayout == MV_MCSA_IO_HVAC && !hvacUsesMotorCt(cfg)) return ch < 2;
  return cfg->chEnable[ch] != 0;
}

uint8_t mvMcsaMonActiveCtCount() {
  if (!mvMcsaMonEnabled()) return MV_MCSA_CH;
  uint8_t n = 0;
  for (uint8_t ch = 0; ch < MV_MCSA_MON_CH; ch++) {
    if (mvMcsaMonChannelIsCt(ch)) n++;
  }
  return n ? n : 1;
}

static int readExpRaw16(uint8_t expSlot, uint8_t expInput) {
  char id[16];
  snprintf(id, sizeof(id), "X%u_IRAW%u", (unsigned)(expSlot + 1), (unsigned)(expInput + 1));
  MvTag* t = mvFindTag(id);
  if (t && t->kind == MV_INT) return t->i;
  return 0;
}

static int analog16(uint8_t ch) {
  if (ch >= 8) return 0;
  if (ch < MV_CT_CHANNELS) return mvCtReadRawFiltered(ch);
  return mvReadAnalogRawDirect(ch);
}

static int readTempRaw(const MvMcsaMonConfig* cfg, uint8_t idx) {
  if (idx >= MV_MCSA_MON_NTC) return 0;
  const uint8_t ch = cfg->tCh[idx];
  if (ch >= MV_MCSA_TCH_EXP_BASE) return readExpRaw16(0, (uint8_t)(ch - MV_MCSA_TCH_EXP_BASE));
  return analog16(ch);
}

static float rawToVolts(int raw16) {
  const float maxR = (float)MV_CT_ADC_MAX_RAW;
  if (maxR < 1.0f) return 0.0f;
  float v = (float)raw16 * MV_CT_INPUT_RANGE_V / maxR;
  if (v < 0.0f) v = 0.0f;
  if (v > MV_CT_INPUT_RANGE_V) v = MV_CT_INPUT_RANGE_V;
  return v;
}

static float ntcCelsius(int raw16, const MvMcsaMonConfig* cfg) {
  const float v = rawToVolts(raw16);
  if (v >= 9.95f || v < 0.05f) return NAN;
  const float vs = cfg->ntcVsupply > 1.0f ? cfg->ntcVsupply : 24.0f;
  const float rf = cfg->ntcRfixed > 1.0f ? cfg->ntcRfixed : 10000.0f;
  const float ro = cfg->ntcRopt > 1.0f ? cfg->ntcRopt : 5850.0f;
  const float r25 = cfg->ntcR25 > 1.0f ? cfg->ntcR25 : 10000.0f;
  const float beta = cfg->ntcBeta > 1.0f ? cfg->ntcBeta : 3950.0f;
  if (vs - v < 0.05f) return NAN;
  const float rEq = (v * rf) / (vs - v);
  const float den = (1.0f / rEq) - (1.0f / ro);
  if (den <= 1e-12f) return NAN;
  const float rTh = 1.0f / den;
  if (rTh <= 1.0f) return NAN;
  const float tK = 1.0f / ((1.0f / 298.15f) + (logf(rTh / r25) / beta));
  return tK - 273.15f;
}

void mvMcsaMonEnsureTags() {
  if (!mvMcsaMonEnabled()) return;
  mvEnsureTag("T1_C", MV_REAL);
  mvEnsureTag("T2_C", MV_REAL);
  mvEnsureTag("T3_C", MV_REAL);
  mvEnsureTag("T4_C", MV_REAL);
  mvEnsureTag("WATER_ROPE_MV", MV_INT);
  mvEnsureTag("WR_DETECT", MV_BOOL);
  mvEnsureTag("WR_INPUT_ON", MV_BOOL);
  mvEnsureTag("COMP_FLT", MV_BOOL);
  mvEnsureTag("FAN_FLT", MV_BOOL);
  mvEnsureTag("COMP_AMPS", MV_REAL);
  mvEnsureTag("FAN_AMPS", MV_REAL);
  mvEnsureTag("COMP_START_AMPS", MV_REAL);
  mvEnsureTag("FAN_START_AMPS", MV_REAL);
  mvEnsureTag("COND1_FAN_START_AMPS", MV_REAL);
  mvEnsureTag("COND1_FAN_AMPS", MV_REAL);
  mvEnsureTag("COND1_COMP_START_AMPS", MV_REAL);
  mvEnsureTag("COND1_COMP_AMPS", MV_REAL);
  mvEnsureTag("COND2_FAN_START_AMPS", MV_REAL);
  mvEnsureTag("COND2_FAN_AMPS", MV_REAL);
  mvEnsureTag("COND2_COMP_START_AMPS", MV_REAL);
  mvEnsureTag("COND2_COMP_AMPS", MV_REAL);
  mvEnsureTag("COND1_FAN_FLT", MV_BOOL);
  mvEnsureTag("COND1_COMP_FLT", MV_BOOL);
  mvEnsureTag("COND2_FAN_FLT", MV_BOOL);
  mvEnsureTag("COND2_COMP_FLT", MV_BOOL);
}

void mvMcsaMonBegin() {
  monLoad();
  memset(s_tC, 0, sizeof(s_tC));
  memset(s_chAmps, 0, sizeof(s_chAmps));
  mvMcsaMonEnsureTags();
}

void mvMcsaMonFillMailboxParams(void* mailbox) {
  MvMcsaMailbox* m = (MvMcsaMailbox*)mailbox;
  if (!m) return;
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  m->deviceType = cfg->enabled ? cfg->deviceType : MV_MCSA_DEV_PUMP;
  m->motorConfigMode = cfg->motorConfigMode;
  m->numPoles = cfg->numPoles ? cfg->numPoles : 4;
  m->slip = cfg->slip > 0.0f ? cfg->slip : 0.03f;
  m->fundHz = cfg->lineFreqHz > 1.0f ? cfg->lineFreqHz : MV_MCSA_FUND_HZ;
  for (uint8_t i = 0; i < MV_MCSA_CH; i++) {
    m->fanBlades[i] = cfg->fanBlades[i];
    m->impellerVanes[i] = cfg->impellerVanes[i];
    m->compressorLobes[i] = cfg->compressorLobes[i];
    m->turbineBlades[i] = cfg->turbineBlades[i];
  }
  m->motorCount = 0;
  if (cfg->enabled && cfg->ioLayout == MV_MCSA_IO_LIFT6) {
    m->motorCount = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
    if (!m->motorCount) m->motorCount = MV_MCSA_MAX_MOTORS;
    for (uint8_t i = 0; i < MV_MCSA_MAX_MOTORS; i++) {
      const MvMcsaMotorSlot* src = &cfg->motor[i];
      MvMcsaMotorMailbox* dst = &m->motor[i];
      dst->enabled = src->enabled;
      dst->wiring = src->wiring;
      dst->ctRun = src->ctRun;
      dst->ctStart = src->ctStart;
      dst->ctPhaseB = src->ctPhaseB;
      dst->ctPhaseC = src->ctPhaseC;
    }
  } else if (cfg->enabled && cfg->ioLayout == MV_MCSA_IO_HVAC && hvacUsesMotorCt(cfg)) {
    m->motorCount = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
    if (!m->motorCount) m->motorCount = MV_MCSA_MAX_MOTORS;
    for (uint8_t i = 0; i < MV_MCSA_MAX_MOTORS; i++) {
      const MvMcsaMotorSlot* src = &cfg->motor[i];
      MvMcsaMotorMailbox* dst = &m->motor[i];
      dst->enabled = src->enabled;
      dst->wiring = src->wiring;
      dst->ctRun = src->ctRun;
      dst->ctStart = src->ctStart;
      dst->ctPhaseB = src->ctPhaseB;
      dst->ctPhaseC = src->ctPhaseC;
    }
  } else if (cfg->enabled && cfg->ioLayout == MV_MCSA_IO_HVAC) {
    m->motorCount = 2;
    m->motor[0].enabled = 1;
    m->motor[0].wiring = MV_MOTOR_WIRE_1P;
    m->motor[0].ctRun = 0;
    m->motor[0].ctStart = MV_MOTOR_CT_NONE;
    m->motor[0].ctPhaseB = MV_MOTOR_CT_NONE;
    m->motor[0].ctPhaseC = MV_MOTOR_CT_NONE;
    m->motor[1].enabled = 1;
    m->motor[1].wiring = MV_MOTOR_WIRE_1P;
    m->motor[1].ctRun = 1;
    m->motor[1].ctStart = MV_MOTOR_CT_NONE;
    m->motor[1].ctPhaseB = MV_MOTOR_CT_NONE;
    m->motor[1].ctPhaseC = MV_MOTOR_CT_NONE;
  }
  if (cfg->enabled) m->nch = mvMcsaMonActiveCtCount();
}

static bool labelIsFault(const char* lab) {
  return lab && lab[0] && strcmp(lab, "healthy") != 0;
}

void mvMcsaMonTick() {
  if (!mvMcsaMonEnabled()) return;
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  mvMcsaMonEnsureTags();

  for (uint8_t ch = 0; ch < MV_MCSA_MON_CH; ch++) {
    if (mvMcsaMonChannelIsCt(ch)) s_chAmps[ch] = mvCtReadAmps(ch);
    else s_chAmps[ch] = 0.0f;
  }

  if (cfg->ioLayout == MV_MCSA_IO_HVAC) {
    for (uint8_t i = 0; i < MV_MCSA_MON_NTC; i++) {
      if (i >= 2 && hvacUsesMotorCt(cfg) && !hvacDualCondFacility(cfg) && !hvacRtuFacility(cfg)) break;
      const float t = ntcCelsius(readTempRaw(cfg, i), cfg);
      if (!isnan(t)) {
        if (s_tC[i] == 0.0f) s_tC[i] = t;
        else s_tC[i] = 0.15f * t + 0.85f * s_tC[i];
      }
      char id[8];
      snprintf(id, sizeof(id), "T%u_C", (unsigned)(i + 1));
      mvSetReal(id, s_tC[i]);
    }
    if (hvacDualCondFacility(cfg)) {
      publishDualCondFacilityAmps();
    } else if (hvacRtuFacility(cfg)) {
      publishRtuFacilityAmps();
    } else if (hvacUsesMotorCt(cfg)) {
      publishHvacMotorAmps(cfg);
    } else {
      const float wrV = rawToVolts(analog16(cfg->wrCh));
      s_wrMv = wrV * 1000.0f;
      s_wrDetect = cfg->wrDetectAbove ? (s_wrMv >= cfg->wrThresholdMv)
                                      : (s_wrMv <= cfg->wrThresholdMv);
      s_wrIn = cfg->wrDin <= 7 ? mvReadDigitalIn(cfg->wrDin) : false;
      mvSetInt("WATER_ROPE_MV", (int)(s_wrMv + 0.5f));
      mvSetBool("WR_DETECT", s_wrDetect);
      mvSetBool("WR_INPUT_ON", s_wrIn);
      mvSetReal("COMP_AMPS", s_chAmps[0]);
      mvSetReal("FAN_AMPS", s_chAmps[1]);
    }

    char lab0[20] = {0};
    char lab1[20] = {0};
    float sc0 = 0, sc1 = 0, cf0 = 0, cf1 = 0;
    if (mvMcsaM7AssetLabels(lab0, lab1, &sc0, &sc1, &cf0, &cf1)) {
      s_compFlt = labelIsFault(lab0) && sc0 >= 0.55f;
      s_fanFlt = labelIsFault(lab1) && sc1 >= 0.55f;
    } else {
      if (s_chAmps[0] < 0.5f) s_compFlt = false;
      const uint8_t fanCh = hvacUsesMotorCt(cfg) ? cfg->motor[0].ctRun : 1;
      if ((fanCh <= 7 ? ctAmpsIndex(fanCh) : 0.0f) < 0.5f) s_fanFlt = false;
    }
    if (hvacDualCondFacility(cfg)) {
      publishDualCondFacilityFlts(s_fanFlt, s_compFlt, false, false);
    } else if (hvacRtuFacility(cfg)) {
      publishRtuFacilityFlts(s_fanFlt, s_compFlt);
    } else {
      mvSetBool("COMP_FLT", s_compFlt);
      mvSetBool("FAN_FLT", s_fanFlt);
    }
    if (cfg->driveFaultRelays) {
      mvSetBool("R1", s_compFlt);
      mvSetBool("R2", s_fanFlt);
      if (!hvacUsesMotorCt(cfg)) mvSetBool("R3", s_wrDetect);
    }
  }
}

float mvMcsaMonTempC(uint8_t tIdx) {
  return tIdx < MV_MCSA_MON_NTC ? s_tC[tIdx] : 0.0f;
}
float mvMcsaMonWaterRopeMv() { return s_wrMv; }
bool mvMcsaMonWrDetect() { return s_wrDetect; }
bool mvMcsaMonWrInputOn() { return s_wrIn; }
bool mvMcsaMonCompFlt() { return s_compFlt; }
bool mvMcsaMonFanFlt() { return s_fanFlt; }

static const char* deviceTypeName(uint8_t t) {
  switch (t) {
    case MV_MCSA_DEV_FAN: return "fan";
    case MV_MCSA_DEV_PUMP: return "pump";
    case MV_MCSA_DEV_COMPRESSOR: return "compressor";
    case MV_MCSA_DEV_TURBINE: return "turbine";
    case MV_MCSA_DEV_ALL: return "all";
    default: return "base";
  }
}

void mvMcsaMonAppendLive(JsonObject obj) {
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  obj["enabled"] = cfg->enabled != 0;
  obj["deviceType"] = cfg->deviceType;
  obj["deviceTypeName"] = deviceTypeName(cfg->deviceType);
  obj["ioLayout"] = cfg->ioLayout;
  obj["numPoles"] = cfg->numPoles;
  obj["lineFreqHz"] = cfg->lineFreqHz;
  obj["slip"] = cfg->slip;
  JsonArray motors = obj.createNestedArray("motors");
  const uint8_t nm = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
  for (uint8_t i = 0; i < nm; i++) {
    const MvMcsaMotorSlot* m = &cfg->motor[i];
    JsonObject row = motors.createNestedObject();
    row["index"] = i + 1;
    row["enabled"] = m->enabled != 0;
    row["wiring"] = m->wiring;
    row["ctRun"] = m->ctRun + 1;
    row["ctStart"] = m->ctStart <= 5 ? (int)(m->ctStart + 1) : 0;
    row["ctPhaseB"] = m->ctPhaseB <= 5 ? (int)(m->ctPhaseB + 1) : 0;
    row["ctPhaseC"] = m->ctPhaseC <= 5 ? (int)(m->ctPhaseC + 1) : 0;
    row["assetId"] = m->assetId;
    row["runAmps"] = mvMcsaMonMotorRunAmps(m);
    row["senseAmps"] = mvMcsaMonMotorSenseAmps(m);
    if (m->wiring == MV_MOTOR_WIRE_1P_CAP) row["startAmps"] = mvMcsaMonMotorStartCtAmps(m);
  }
  JsonArray amps = obj.createNestedArray("ctAmps");
  for (uint8_t i = 0; i < MV_MCSA_MON_CH; i++) {
    JsonObject row = amps.createNestedObject();
    row["ch"] = i + 1;
    row["amps"] = s_chAmps[i];
    row["isCt"] = mvMcsaMonChannelIsCt(i);
    row["enable"] = cfg->chEnable[i] != 0;
    row["fanBlades"] = cfg->fanBlades[i];
    row["impellerVanes"] = cfg->impellerVanes[i];
    row["compressorLobes"] = cfg->compressorLobes[i];
    row["turbineBlades"] = cfg->turbineBlades[i];
  }
  if (cfg->ioLayout == MV_MCSA_IO_HVAC) {
    obj["compAmps"] = s_chAmps[0];
    obj["fanAmps"] = s_chAmps[1];
    obj["compFlt"] = s_compFlt;
    obj["fanFlt"] = s_fanFlt;
    obj["waterRopeMv"] = s_wrMv;
    obj["wrDetect"] = s_wrDetect;
    obj["wrInputOn"] = s_wrIn;
    JsonArray temps = obj.createNestedArray("temps");
    for (uint8_t i = 0; i < MV_MCSA_MON_NTC; i++) {
      JsonObject row = temps.createNestedObject();
      row["id"] = String("T") + String(i + 1) + "_C";
      row["label"] = cfg->tLabel[i];
      row["c"] = s_tC[i];
      row["ch"] = cfg->tCh[i] + 1;
    }
    char lab0[20] = {0};
    char lab1[20] = {0};
    float sc0 = 0, sc1 = 0, cf0 = 0, cf1 = 0;
    if (mvMcsaM7AssetLabels(lab0, lab1, &sc0, &sc1, &cf0, &cf1)) {
      obj["compLabel"] = lab0;
      obj["fanLabel"] = lab1;
      obj["compScore"] = sc0;
      obj["fanScore"] = sc1;
    }
  }
}

void mvMcsaMonAppendStatus(JsonObject obj) {
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  JsonObject h = obj.createNestedObject("mcsaMon");
  h["enabled"] = cfg->enabled != 0;
  h["deviceType"] = cfg->deviceType;
  h["deviceTypeName"] = deviceTypeName(cfg->deviceType);
  h["ioLayout"] = cfg->ioLayout == MV_MCSA_IO_HVAC ? "hvac" : "lift6";
  h["motorCount"] = cfg->motorCount;
  h["numPoles"] = cfg->numPoles;
  h["compFlt"] = s_compFlt;
  h["fanFlt"] = s_fanFlt;
  h["wrDetect"] = s_wrDetect;
}

void mvMcsaMonAppendTelemetry(JsonDocument& doc) {
  if (!mvMcsaMonEnabled() || doc.overflowed()) return;
  const MvMcsaMonConfig* cfg = mvMcsaMonActive();
  doc["app"] = "mcsa-monitor";
  doc["deviceType"] = cfg->deviceType;
  doc["deviceTypeName"] = deviceTypeName(cfg->deviceType);
  doc["motorCount"] = cfg->motorCount;
  if (cfg->ioLayout == MV_MCSA_IO_LIFT6) {
    JsonArray motors = doc.createNestedArray("motors");
    const uint8_t nm = cfg->motorCount > MV_MCSA_MAX_MOTORS ? MV_MCSA_MAX_MOTORS : cfg->motorCount;
    for (uint8_t i = 0; i < nm; i++) {
      const MvMcsaMotorSlot* m = &cfg->motor[i];
      JsonObject row = motors.createNestedObject();
      row["index"] = i + 1;
      row["enabled"] = m->enabled != 0;
      row["wiring"] = m->wiring;
      row["assetId"] = m->assetId;
    }
  }
  if (cfg->ioLayout == MV_MCSA_IO_HVAC) {
    doc["name"] = "Opta HVAC Monitor";
    JsonObject env = doc.createNestedObject("env");
    env["T1_C"] = s_tC[0];
    env["T2_C"] = s_tC[1];
    env["T3_C"] = s_tC[2];
    env["T4_C"] = s_tC[3];
    env["WATER_ROPE_MV"] = (int)(s_wrMv + 0.5f);
    env["WR_DETECT"] = s_wrDetect;
    env["WR_INPUT_ON"] = s_wrIn;
    env["COMP_FLT"] = s_compFlt;
    env["FAN_FLT"] = s_fanFlt;
    env["COMP_AMPS"] = s_chAmps[0];
    env["FAN_AMPS"] = s_chAmps[1];
  }
}
