#include "mv_mcsa_m7.h"
#include "mv_mcsa_shared.h"
#include "mv_config.h"
#include "mv_ct_cal.h"
#include "mv_mcsa_mon.h"
#include "mv_io.h"
#include "mv_debug.h"
#include <Arduino.h>
#include <string.h>

#ifndef MV_MCSA_M4
#define MV_MCSA_M4 1
#endif
#ifndef MV_MCSA_INGEST_MS
#define MV_MCSA_INGEST_MS 300000ul
#endif
#ifndef MV_MCSA_BOOT_GRACE_MS
#define MV_MCSA_BOOT_GRACE_MS 15000ul
#endif

#if !defined(ARDUINO_OPTA) || !MV_MCSA_M4

void mvMcsaM7Begin() {}
void mvMcsaM7Tick() {}
bool mvMcsaM7Capturing() { return false; }
bool mvMcsaM7PeekRaw(uint8_t, int*) { return false; }
bool mvMcsaM7HasCooked() { return false; }
bool mvMcsaM7EdgePending() { return false; }
void mvMcsaM7AppendRuntime(JsonObject) {}
bool mvMcsaM7AppendCooked(JsonArray) { return false; }
bool mvMcsaM7AppendEdgeAi(JsonArray) { return false; }
void mvMcsaM7AppendStatus(JsonObject obj) {
  obj["mcsaM4"] = false;
}
bool mvMcsaM7AssetLabels(char*, char*, float*, float*, float*, float*) { return false; }
bool mvMcsaM7HvacLabels(char* lab0, char* lab1, float* sc0, float* sc1, float* cf0, float* cf1) {
  return mvMcsaM7AssetLabels(lab0, lab1, sc0, sc1, cf0, cf1);
}

#else

#if __has_include(<RPC.h>)
#include <RPC.h>
#define MV_MCSA_HAS_RPC 1
#endif

/* Do not include mbed.h — it injects `using namespace mbed/std` and Watchdog,
 * which collides with Arduino types and breaks later statements (memset, etc.). */
#define MBED_NO_GLOBAL_USING_DIRECTIVE
#include "drivers/Ticker.h"

static mbed::Ticker s_tick;
static volatile uint16_t s_idx = 0;
static volatile bool s_captureDone = false;
static volatile int s_heldRaw[MV_MCSA_CH];
static bool s_capturing = false;
static bool m4Seen = false;
static uint32_t s_lastHb = 0;
static uint32_t s_lastHbMs = 0;
static uint32_t s_lastIngestMs = 0;
static uint32_t s_lastM4Seq = 0;
static uint32_t s_bootMs = 0;
static bool s_edgePending = false;
static bool s_haveCooked = false;

static uint8_t ctPin(uint8_t ch) {
  return (uint8_t)(MV_DIN_PIN0 + ch);
}

/**
 * Burst oversample: dummy mux settle + N back-to-back conversions.
 * Burst is << 120 Hz period so residual ripple is preserved; averaging only
 * knocks down ADC quantization on the 0–1 V slice of the 0–10 V range.
 */
static int readCtBurst(uint8_t ch, uint8_t navg) {
  const uint8_t pin = ctPin(ch);
  (void)analogRead(pin);
  if (navg <= 1) return analogRead(pin);
  uint32_t sum = 0;
  for (uint8_t i = 0; i < navg; i++) sum += (uint32_t)analogRead(pin);
  return (int)((sum + (uint32_t)navg / 2u) / (uint32_t)navg);
}

static void mcsaIsr() {
  MvMcsaMailbox* m = mvMcsaShm();
  if (!m || s_idx >= MV_MCSA_N) return;
  const uint8_t navg = m->osN > 0 ? m->osN : 1;
  for (uint8_t ch = 0; ch < MV_MCSA_CH; ch++) {
    const int raw = readCtBurst(ch, navg);
    m->samples[ch][s_idx] = (uint16_t)raw;
    s_heldRaw[ch] = raw;
  }
  s_idx++;
  if (s_idx >= MV_MCSA_N) s_captureDone = true;
}

static void stopCaptureTicker() {
  s_tick.detach();
  s_capturing = false;
}

static void startCapture() {
  MvMcsaMailbox* m = mvMcsaShm();
  if (!m || m->magic != MV_MCSA_MAGIC) return;
  const MvCtCalConfig* ct = mvCtCalActive();
  m->nch = MV_MCSA_CH;
  m->n = MV_MCSA_N;
  m->waveform = (uint8_t)MV_CT_WAVEFORM;
  m->fsHz = (m->waveform == MV_MCSA_WAVE_DC) ? MV_MCSA_FS_DC_HZ : MV_MCSA_FS_HZ;
  m->osN = (m->waveform == MV_MCSA_WAVE_DC) ? (uint8_t)MV_MCSA_DC_OS : 1;
  m->fundHz = MV_MCSA_FUND_HZ;
  mvMcsaMonFillMailboxParams(m);
  for (uint8_t ch = 0; ch < MV_MCSA_CH; ch++) {
    m->offsetRaw[ch] = ct->offsetRaw[ch];
    m->ampsPerRaw[ch] = mvCtEffectiveScale(ch);
    s_heldRaw[ch] = mvReadAnalogRawDirect(ch);
  }
  s_idx = 0;
  s_captureDone = false;
  s_capturing = true;
  m->status = MV_MCSA_ST_CAPTURE;
  s_tick.attach_us(mbed::callback(mcsaIsr), 1000000 / m->fsHz);
  if (m->waveform == MV_MCSA_WAVE_DC) {
    MV_LOG("MCSA DC ingest 16-bit / 16x burst / 512 Hz / 2048 samp -> M4");
  } else {
    MV_LOG("MCSA AC ingest (line FFT) -> M4");
  }
}

static void zeroMailbox(MvMcsaMailbox* mbox) {
  if (!mbox) return;
  volatile uint8_t* p = (volatile uint8_t*)mbox;
  for (size_t i = 0; i < sizeof(MvMcsaMailbox); i++) p[i] = 0;
}

void mvMcsaM7Begin() {
  s_bootMs = millis();
  for (uint8_t i = 0; i < MV_MCSA_CH; i++) s_heldRaw[i] = 0;
  MvMcsaMailbox* mbox = mvMcsaShm();
  zeroMailbox(mbox);
  mbox->magic = MV_MCSA_MAGIC;
  mbox->status = MV_MCSA_ST_IDLE;
  mbox->nch = MV_MCSA_CH;
  mbox->n = MV_MCSA_N;
  mbox->waveform = (uint8_t)MV_CT_WAVEFORM;
  mbox->fsHz = (mbox->waveform == MV_MCSA_WAVE_DC) ? MV_MCSA_FS_DC_HZ : MV_MCSA_FS_HZ;
  mbox->osN = (mbox->waveform == MV_MCSA_WAVE_DC) ? (uint8_t)MV_MCSA_DC_OS : 1;
  mbox->fundHz = MV_MCSA_FUND_HZ;
#ifdef MV_MCSA_HAS_RPC
  RPC.begin();
#else
  bootM4();
#endif
  s_tick.detach();
  MV_LOG("MCSA M4 mailbox SRAM4 @ 0x38000000");
}

void mvMcsaM7Tick() {
  MvMcsaMailbox* m = mvMcsaShm();
  if (!m || m->magic != MV_MCSA_MAGIC) return;

  if (m->m4Heartbeat != s_lastHb) {
    s_lastHb = m->m4Heartbeat;
    s_lastHbMs = millis();
    m4Seen = true;
  } else if (m4Seen && (uint32_t)(millis() - s_lastHbMs) > 5000ul) {
    m4Seen = false;
  }

  if (s_capturing && s_captureDone) {
    stopCaptureTicker();
    m->status = MV_MCSA_ST_TO_M4;
    m->m7Seq = m->m7Seq + 1;
    s_lastIngestMs = millis();
    MV_LOG("MCSA window ready → M4");
  }

  static uint32_t s_waitM4Ms = 0;
  if (m->status == MV_MCSA_ST_TO_M4 || m->status == MV_MCSA_ST_M4_RUN) {
    if (s_waitM4Ms == 0) s_waitM4Ms = millis();
    if ((uint32_t)(millis() - s_waitM4Ms) > 10000ul) {
      m->status = MV_MCSA_ST_IDLE;
      s_waitM4Ms = 0;
      MV_LOG("MCSA M4 timeout — back to lite");
    }
  } else {
    s_waitM4Ms = 0;
  }

  if (m->status == MV_MCSA_ST_DONE && m->m4Seq != s_lastM4Seq) {
    s_lastM4Seq = m->m4Seq;
    s_haveCooked = true;
    s_edgePending = true;
    m->status = MV_MCSA_ST_IDLE;
    MV_LOG("MCSA M4 result ready");
  }

  if (s_capturing) return;
  if (m->status != MV_MCSA_ST_IDLE && m->status != MV_MCSA_ST_DONE) return;
  if (!m4Seen) return;
  const uint32_t now = millis();
  if ((uint32_t)(now - s_bootMs) < MV_MCSA_BOOT_GRACE_MS) return;
  if (s_lastIngestMs != 0 && (uint32_t)(now - s_lastIngestMs) < MV_MCSA_INGEST_MS) return;
  if (s_lastIngestMs == 0 && (uint32_t)(now - s_bootMs) < MV_MCSA_BOOT_GRACE_MS) return;
  startCapture();
}

bool mvMcsaM7Capturing() {
  return s_capturing;
}

bool mvMcsaM7PeekRaw(uint8_t ch, int* rawOut) {
  if (!s_capturing || ch >= MV_MCSA_CH || !rawOut) return false;
  *rawOut = s_heldRaw[ch];
  return true;
}

bool mvMcsaM7HasCooked() {
  return s_haveCooked;
}

bool mvMcsaM7EdgePending() {
  return s_edgePending;
}

void mvMcsaM7AppendRuntime(JsonObject runtime) {
  runtime["mcsaM4"] = m4Seen;
  runtime["mcsaCapturing"] = s_capturing;
  if (s_haveCooked) {
    runtime["firmware"] = "mcsa-m4";
    runtime["mcsaLite"] = false;
    runtime["trueFft"] = true;
    runtime["sampleRateHz"] = mvMcsaShm()->fsHz;
    runtime["fftSize"] = MV_MCSA_N;
    runtime["ctWaveform"] = mvMcsaShm()->waveform == MV_MCSA_WAVE_AC ? "ac" : "dc";
    runtime["adcBits"] = MV_MCSA_ADC_BITS;
    runtime["ingestOversample"] = mvMcsaShm()->osN;
    runtime["mcsaChannels"] = MV_MCSA_CH;
    runtime["mcsaIngestMs"] = MV_MCSA_INGEST_MS;
  }
}

static void appendPair(JsonArray arr, float hz, float amp) {
  JsonArray pair = arr.createNestedArray();
  pair.add(hz);
  pair.add(amp);
}

static void appendPairIf(JsonArray arr, float hz, float amp) {
  if (amp <= 0.0f && hz <= 0.0f) return;
  appendPair(arr, hz, amp);
}

bool mvMcsaM7AppendCooked(JsonArray mcsa) {
  if (!s_haveCooked) return false;
  MvMcsaMailbox* m = mvMcsaShm();
  if (!m || m->magic != MV_MCSA_MAGIC) return false;
  const uint8_t nch = m->nch > 0 && m->nch <= MV_MCSA_CH ? m->nch : MV_MCSA_CH;
  const uint8_t dtype = m->deviceType;
  for (uint8_t ch = 0; ch < nch; ch++) {
    const MvMcsaCookedCh* c = &m->cooked[ch];
    JsonObject row = mcsa.createNestedObject();
    row["ch"] = ch;
    JsonArray fund = row.createNestedArray("fund");
    fund.add(c->fundHz);
    fund.add(c->fundAmp);
    JsonArray rotor = row.createNestedArray("rotor");
    appendPair(rotor, c->rotorHz[0], c->rotorAmp[0]);
    appendPair(rotor, c->rotorHz[1], c->rotorAmp[1]);
    JsonArray bearing = row.createNestedArray("bearing");
    appendPair(bearing, c->bearingHz[0], c->bearingAmp[0]);
    appendPair(bearing, c->bearingHz[1], c->bearingAmp[1]);
    appendPair(bearing, c->bearingHz[2], c->bearingAmp[2]);
    JsonArray ecc = row.createNestedArray("ecc");
    appendPair(ecc, c->eccHz[0], c->eccAmp[0]);
    appendPair(ecc, c->eccHz[1], c->eccAmp[1]);
    if (c->statorAmp > 0.0f || c->statorHz > 0.0f) {
      JsonArray stator = row.createNestedArray("stator");
      stator.add(c->statorHz);
      stator.add(c->statorAmp);
    }
    if (dtype == MV_MCSA_DEV_PUMP || dtype == MV_MCSA_DEV_ALL || dtype == MV_MCSA_DEV_BASE) {
      JsonArray pump = row.createNestedArray("pump");
      appendPair(pump, c->pumpHz[0], c->pumpAmp[0]);
      appendPair(pump, c->pumpHz[1], c->pumpAmp[1]);
    }
    if (dtype == MV_MCSA_DEV_FAN || dtype == MV_MCSA_DEV_ALL) {
      JsonArray fan = row.createNestedArray("fan");
      appendPairIf(fan, c->fanHz[0], c->fanAmp[0]);
      appendPairIf(fan, c->fanHz[1], c->fanAmp[1]);
    }
    if (dtype == MV_MCSA_DEV_COMPRESSOR || dtype == MV_MCSA_DEV_ALL) {
      JsonArray comp = row.createNestedArray("compressor");
      appendPairIf(comp, c->compressorHz[0], c->compressorAmp[0]);
      appendPairIf(comp, c->compressorHz[1], c->compressorAmp[1]);
    }
    if (dtype == MV_MCSA_DEV_TURBINE || dtype == MV_MCSA_DEV_ALL) {
      JsonArray turb = row.createNestedArray("turbine");
      appendPairIf(turb, c->turbineHz[0], c->turbineAmp[0]);
      appendPairIf(turb, c->turbineHz[1], c->turbineAmp[1]);
    }
  }
  return true;
}

bool mvMcsaM7AssetLabels(char* lab0, char* lab1, float* sc0, float* sc1, float* cf0, float* cf1) {
  if (!s_haveCooked) return false;
  MvMcsaMailbox* m = mvMcsaShm();
  if (!m || m->magic != MV_MCSA_MAGIC) return false;
  if (lab0) {
    strncpy(lab0, m->label0, 19);
    lab0[19] = '\0';
  }
  if (lab1) {
    strncpy(lab1, m->label1, 19);
    lab1[19] = '\0';
  }
  if (sc0) *sc0 = m->score0;
  if (sc1) *sc1 = m->score1;
  if (cf0) *cf0 = m->conf0;
  if (cf1) *cf1 = m->conf1;
  return m->label0[0] != 0 || m->label1[0] != 0;
}

bool mvMcsaM7HvacLabels(char* lab0, char* lab1, float* sc0, float* sc1, float* cf0, float* cf1) {
  return mvMcsaM7AssetLabels(lab0, lab1, sc0, sc1, cf0, cf1);
}

bool mvMcsaM7AppendEdgeAi(JsonArray edgeAi) {
  if (!s_edgePending) return false;
  MvMcsaMailbox* m = mvMcsaShm();
  if (!m) return false;
  s_edgePending = false;
  const bool hvac = mvMcsaMonEnabled() && mvMcsaMonActive()->ioLayout == MV_MCSA_IO_HVAC;
  const MvMcsaMonConfig* mon = mvMcsaMonEnabled() ? mvMcsaMonActive() : nullptr;
  for (uint8_t p = 0; p < 2; p++) {
    const char* lab = p == 0 ? m->label0 : m->label1;
    if (!lab[0]) continue;
    JsonObject item = edgeAi.createNestedObject();
    const char* assetId = nullptr;
    if (hvac) {
      assetId = p == 0 ? "compressor" : "fan";
      item["modelId"] = p == 0 ? "hvac-comp-v1" : "hvac-fan-v1";
    } else if (mon && mon->ioLayout == MV_MCSA_IO_LIFT6 && p < mon->motorCount
               && mon->motor[p].enabled && mon->motor[p].assetId[0]) {
      assetId = mon->motor[p].assetId;
      item["modelId"] = mon->motor[p].wiring == MV_MOTOR_WIRE_1P_CAP
        ? "single-phase-start-v1" : "lift-submersible-v2";
    } else {
      assetId = p == 0 ? "pump-1" : "pump-2";
      item["modelId"] = "lift-submersible-v2";
    }
    item["assetId"] = assetId;
    if (!hvac && (mon == nullptr || mon->motor[p].wiring == MV_MOTOR_WIRE_3P)) {
      item["pumpIndex"] = p + 1;
    }
    item["type"] = "classification";
    item["label"] = lab;
    item["score"] = p == 0 ? m->score0 : m->score1;
    item["confidence"] = p == 0 ? m->conf0 : m->conf1;
    JsonObject feat = item.createNestedObject("features");
    feat["trueFft"] = true;
    feat["core"] = "m4";
    feat["fftUs"] = m->fftUs;
    feat["deviceType"] = m->deviceType;
    if (mon && p < mon->motorCount) feat["wiring"] = mon->motor[p].wiring;
  }
  return true;
}

void mvMcsaM7AppendStatus(JsonObject obj) {
  MvMcsaMailbox* m = mvMcsaShm();
  obj["mcsaM4"] = m4Seen;
  obj["mcsaCapturing"] = s_capturing;
  obj["mcsaHasCooked"] = s_haveCooked;
  obj["mcsaIngestMs"] = MV_MCSA_INGEST_MS;
  if (m && m->magic == MV_MCSA_MAGIC) {
    obj["mcsaStatus"] = m->status;
    obj["mcsaM7Seq"] = m->m7Seq;
    obj["mcsaM4Seq"] = m->m4Seq;
    obj["mcsaFftUs"] = m->fftUs;
  }
}

#endif
