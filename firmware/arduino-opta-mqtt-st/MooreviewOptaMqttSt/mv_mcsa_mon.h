#pragma once



#include <ArduinoJson.h>

#include <stdint.h>



/**
 * Opta MCSA monitor — load-class modes and motor params configured from /mcsa.
 *
 * deviceType:
 *   0 base (rotor/bearing/ecc/stator)
 *   1 fan     2 pump     3 compressor     4 turbine     5 all loads
 */

#define MV_MCSA_MON_CH 8

#define MV_MCSA_MON_NTC 4

#define MV_MCSA_MAX_MOTORS 4



#define MV_MCSA_DEV_BASE 0

#define MV_MCSA_DEV_FAN 1

#define MV_MCSA_DEV_PUMP 2

#define MV_MCSA_DEV_COMPRESSOR 3

#define MV_MCSA_DEV_TURBINE 4

#define MV_MCSA_DEV_ALL 5



#define MV_MCSA_IO_LIFT6 0 /* I1–I6 = CT */

#define MV_MCSA_IO_HVAC 1  /* I1–I2 CT (legacy RTU) or I1–I4 1P+cap×2; NTC base or D1608E */

#define MV_MCSA_TCH_EXP_BASE 128 /* tCh >= this → X1_IRAW(tCh - BASE + 1) on D1608E */



/** Per-motor CT wiring (lift / general CT layout). */

#define MV_MOTOR_WIRE_1P 0     /* single-phase, one CT on line/run */

#define MV_MOTOR_WIRE_1P_CAP 1 /* single-phase + start cap: run CT + start-winding CT */

#define MV_MOTOR_WIRE_3P 2     /* three-phase: one CT per leg */

#define MV_MOTOR_CT_NONE 255



struct MvMcsaMotorSlot {

  uint8_t enabled;

  uint8_t wiring;

  uint8_t ctRun;     /* line / run / phase A (0–5) */

  uint8_t ctStart;   /* start-winding CT (1P cap); MV_MOTOR_CT_NONE if unused */

  uint8_t ctPhaseB;  /* 3P phase B */

  uint8_t ctPhaseC;  /* 3P phase C */

  char assetId[16];

  char startMsTag[20];

};



struct MvMcsaMonConfig {

  uint32_t magic;

  uint16_t version;

  uint16_t crc;

  uint8_t enabled;

  uint8_t deviceType;

  uint8_t motorConfigMode; /* legacy — unused; use motor[].wiring */

  uint8_t ioLayout;

  uint8_t numPoles;

  uint8_t driveFaultRelays;

  uint8_t wrDetectAbove;

  uint8_t wrDin;

  uint8_t wrCh;

  uint8_t tCh[MV_MCSA_MON_NTC];

  uint8_t chEnable[MV_MCSA_MON_CH];

  uint8_t fanBlades[MV_MCSA_MON_CH];

  uint8_t impellerVanes[MV_MCSA_MON_CH];

  uint8_t compressorLobes[MV_MCSA_MON_CH];

  uint8_t turbineBlades[MV_MCSA_MON_CH];

  float lineFreqHz;

  float slip;

  float ntcVsupply;

  float ntcRfixed;

  float ntcRopt;

  float ntcR25;

  float ntcBeta;

  float wrThresholdMv;

  char tLabel[MV_MCSA_MON_NTC][16];

  uint8_t motorCount;

  uint8_t _padMotors[3];

  MvMcsaMotorSlot motor[MV_MCSA_MAX_MOTORS];

};



void mvMcsaMonBegin();

void mvMcsaMonTick();

bool mvMcsaMonEnabled();

const MvMcsaMonConfig* mvMcsaMonActive();

void mvMcsaMonDefaults(MvMcsaMonConfig* cfg);

bool mvMcsaMonSave(const MvMcsaMonConfig* cfg);

void mvMcsaMonEnsureTags();



/** Active CT count / map for M7 ingest (HVAC = 2, lift = 6). */

uint8_t mvMcsaMonActiveCtCount();

bool mvMcsaMonChannelIsCt(uint8_t ch);



/** Motor slot helpers (lift6 layout). Returns false if slot disabled or out of range. */

bool mvMcsaMonMotorActive(uint8_t idx);

const MvMcsaMotorSlot* mvMcsaMonMotor(uint8_t idx);

uint8_t mvMcsaMonMotorCount();



/** CT indices used by a motor [lo..hi] inclusive; false if none. */

bool mvMcsaMonMotorCtRange(const MvMcsaMotorSlot* m, uint8_t* lo, uint8_t* hi);



/** Amps for start/inrush detection (max of wired CTs). */

float mvMcsaMonMotorSenseAmps(const MvMcsaMotorSlot* m);

/** Steady run amps (run CT for 1P; max phase for 3P). */

float mvMcsaMonMotorRunAmps(const MvMcsaMotorSlot* m);

float mvMcsaMonMotorStartCtAmps(const MvMcsaMotorSlot* m);



/** Derive chEnable[] from motor slots (lift6). */

void mvMcsaMonSyncChannelEnable(MvMcsaMonConfig* cfg);



float mvMcsaMonTempC(uint8_t tIdx);

float mvMcsaMonWaterRopeMv();

bool mvMcsaMonWrDetect();

bool mvMcsaMonWrInputOn();

bool mvMcsaMonCompFlt();

bool mvMcsaMonFanFlt();



void mvMcsaMonAppendTelemetry(JsonDocument& doc);

void mvMcsaMonAppendStatus(JsonObject obj);

void mvMcsaMonAppendLive(JsonObject obj);

void mvMcsaMonRegisterRoutes();



/** Copy motor/load params into the SRAM4 mailbox before capture. */

void mvMcsaMonFillMailboxParams(void* mailbox);


