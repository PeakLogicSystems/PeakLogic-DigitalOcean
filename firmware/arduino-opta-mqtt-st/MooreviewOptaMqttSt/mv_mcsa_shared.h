#pragma once



#include <stdint.h>



/** Dual-core MCSA mailbox in STM32H747 SRAM4 (D3, both M7 and M4). Keep identical in the M7 sketch. */

#ifndef MV_MCSA_SHM_ADDR

#define MV_MCSA_SHM_ADDR 0x38000000u

#endif



#define MV_MCSA_MAGIC 0x4D435341u /* 'MCSA' */

#define MV_MCSA_CH 6

#define MV_MCSA_N 2048

#define MV_MCSA_FS_HZ 2048

#define MV_MCSA_FS_DC_HZ 512

#define MV_MCSA_FUND_HZ 60.0f

#define MV_MCSA_SLIP_HZ 3.6f

#define MV_MCSA_WAVE_DC 0 /* 0–1 V RMS transmitters (DC + ripple) */

#define MV_MCSA_WAVE_AC 1 /* AC burden + mid-rail bias */

/** Burst oversample per DC ingest sample (mux discard + N reads). Keeps 120 Hz ripple. */

#ifndef MV_MCSA_DC_OS

#define MV_MCSA_DC_OS 16

#endif

#define MV_MCSA_ADC_BITS 16



#define MV_MCSA_MAX_MOTORS 4

#define MV_MOTOR_WIRE_1P 0

#define MV_MOTOR_WIRE_1P_CAP 1

#define MV_MOTOR_WIRE_3P 2

#define MV_MOTOR_CT_NONE 255



/** MCSA deviceType load classes (0–5). */

#define MV_MCSA_DEV_BASE 0

#define MV_MCSA_DEV_FAN 1

#define MV_MCSA_DEV_PUMP 2

#define MV_MCSA_DEV_COMPRESSOR 3

#define MV_MCSA_DEV_TURBINE 4

#define MV_MCSA_DEV_ALL 5



#define MV_MCSA_ST_IDLE 0

#define MV_MCSA_ST_CAPTURE 1

#define MV_MCSA_ST_TO_M4 2

#define MV_MCSA_ST_M4_RUN 3

#define MV_MCSA_ST_DONE 4



typedef struct {

  uint8_t ch;

  uint8_t _pad[3];

  float fundHz;

  float fundAmp;

  float rotorHz[2];

  float rotorAmp[2];

  float bearingHz[3];

  float bearingAmp[3];

  float eccHz[2];

  float eccAmp[2];

  float pumpHz[2];

  float pumpAmp[2];

  float statorHz;

  float statorAmp;

  float fanHz[2];

  float fanAmp[2];

  float compressorHz[2];

  float compressorAmp[2];

  float turbineHz[2];

  float turbineAmp[2];

} MvMcsaCookedCh;



typedef struct {

  uint8_t enabled;

  uint8_t wiring;

  uint8_t ctRun;

  uint8_t ctStart;

  uint8_t ctPhaseB;

  uint8_t ctPhaseC;

} MvMcsaMotorMailbox;



typedef struct {

  uint32_t magic;

  volatile uint32_t m7Seq;

  volatile uint32_t m4Seq;

  volatile uint32_t m4Heartbeat;

  volatile uint8_t status;

  uint8_t nch;

  uint16_t n;

  uint16_t fsHz;

  uint8_t waveform;

  uint8_t osN;

  float fundHz;

  float ampsPerRaw[MV_MCSA_CH];

  float offsetRaw[MV_MCSA_CH];

  /* Motor / load-class params (filled by M7 from /mcsa). */

  uint8_t deviceType;

  uint8_t motorConfigMode;

  uint8_t numPoles;

  uint8_t _padCfg;

  float slip;

  uint8_t fanBlades[MV_MCSA_CH];

  uint8_t impellerVanes[MV_MCSA_CH];

  uint8_t compressorLobes[MV_MCSA_CH];

  uint8_t turbineBlades[MV_MCSA_CH];

  uint8_t motorCount;

  uint8_t _padMotors[3];

  MvMcsaMotorMailbox motor[MV_MCSA_MAX_MOTORS];

  uint16_t samples[MV_MCSA_CH][MV_MCSA_N];

  MvMcsaCookedCh cooked[MV_MCSA_CH];

  char label0[20];

  char label1[20];

  float score0;

  float score1;

  float conf0;

  float conf1;

  uint32_t fftUs;

} MvMcsaMailbox;



static inline MvMcsaMailbox* mvMcsaShm(void) {

  return (MvMcsaMailbox*)(uintptr_t)MV_MCSA_SHM_ADDR;

}


