/**
 * PeakLogic UNO Q — MCU half of edge motor fault detection.
 *
 * STM32U585 samples AC current on A0–A5 (biased ~1.65 V), detects motor
 * starts (2 pumps × 3 CTs, Opta duplex map), and exposes windows + RMS over
 * Arduino Bridge to the Qualcomm Linux MPU (true FFT MCSA + MQTT Parc).
 *
 * Wiring: SCT-013 → burden + mid-rail bias → A0–A2 pump 1, A3–A5 pump 2.
 * Analog pins are 3.3 V max, not 5 V tolerant.
 */

#include <Arduino.h>
#include <Arduino_RouterBridge.h>
#include <math.h>
#include <string.h>

#ifndef MV_N_CH
#define MV_N_CH 6
#endif
#ifndef MV_N_PUMP
#define MV_N_PUMP 2
#endif
#ifndef MV_FFT_N
#define MV_FFT_N 2048
#endif
#ifndef MV_FS_HZ
/* 6-channel analogRead scan needs ~300 µs; 2048 Hz leaves headroom and gives 1 Hz FFT bins. */
#define MV_FS_HZ 2048
#endif

static const uint8_t kPins[6] = { A0, A1, A2, A3, A4, A5 };
static const uint32_t kSampleUs = 1000000UL / MV_FS_HZ;
static const int kAdcMid = 2048; /* 12-bit, ~1.65 V at 3.3 V Vref */
static const float kVref = 3.3f;
static const float kAdcMax = 4095.0f;
static const float kVoltsPerAmp = 0.033f;
static const float kIdleAmps = 1.0f;
static const float kStartDetectAmps = 2.0f;

enum StartPhase : uint8_t { ST_IDLE = 0, ST_CAPTURING = 1, ST_RUNNING = 2 };

struct PumpStart {
  StartPhase phase;
  uint32_t tStartMs;
  uint32_t stableMs;
  float peakAmps;
  float runAmpsEma;
  float baselineAmps;
  bool wasRunning;
};

struct StartEvent {
  bool pending;
  uint8_t pumpIdx;
  uint32_t startMs;
  float peakAmps;
  float runAmps;
};

#ifndef MV_RMS_N
#define MV_RMS_N 128
#endif

static int16_t s_buf[MV_N_CH][MV_FFT_N];
static uint16_t s_idx = 0;
static uint16_t s_rmsIdx = 0;
static double s_rmsAcc[MV_N_CH];
static volatile bool s_windowReady = false;
static uint32_t s_lastSampleUs = 0;
static PumpStart s_pump[MV_N_PUMP];
static StartEvent s_startEvt;
static float s_rms[MV_N_CH];
static char s_b64[MV_FFT_N * 2 * 2]; /* int16 window → base64 */
static char s_evtJson[160];

static const char kB64[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static void b64Encode(const uint8_t* src, size_t n, char* dst, size_t dstLen) {
  size_t o = 0;
  for (size_t i = 0; i < n && o + 4 < dstLen; i += 3) {
    uint32_t v = ((uint32_t)src[i]) << 16;
    if (i + 1 < n) v |= ((uint32_t)src[i + 1]) << 8;
    if (i + 2 < n) v |= src[i + 2];
    dst[o++] = kB64[(v >> 18) & 63];
    dst[o++] = kB64[(v >> 12) & 63];
    dst[o++] = (i + 1 < n) ? kB64[(v >> 6) & 63] : '=';
    dst[o++] = (i + 2 < n) ? kB64[v & 63] : '=';
  }
  dst[o] = '\0';
}

static float adcToAmps(int raw) {
  const float v = ((float)raw / kAdcMax) * kVref;
  return (v - (kVref * 0.5f)) / kVoltsPerAmp;
}

static void finishStart(uint8_t ch, uint32_t nowMs) {
  PumpStart* st = &s_pump[ch];
  const uint32_t startMs = nowMs - st->tStartMs;
  if (startMs >= 150 && startMs <= 8000 && !s_startEvt.pending) {
    s_startEvt.pending = true;
    s_startEvt.pumpIdx = ch;
    s_startEvt.startMs = startMs;
    s_startEvt.peakAmps = st->peakAmps;
    s_startEvt.runAmps = st->runAmpsEma > 0.1f ? st->runAmpsEma : st->peakAmps * 0.6f;
  }
  st->phase = ST_RUNNING;
  st->wasRunning = true;
  if (st->baselineAmps < 1.0f) st->baselineAmps = st->runAmpsEma;
  else st->baselineAmps = st->baselineAmps * 0.9f + st->runAmpsEma * 0.1f;
}

static float pumpMaxRms(uint8_t pump) {
  const uint8_t start = (uint8_t)(pump * 3);
  float m = s_rms[start];
  if (start + 1 < MV_N_CH && s_rms[start + 1] > m) m = s_rms[start + 1];
  if (start + 2 < MV_N_CH && s_rms[start + 2] > m) m = s_rms[start + 2];
  return m;
}

static void tickStart(uint8_t pump, float amps, uint32_t dtMs) {
  PumpStart* st = &s_pump[pump];
  const uint32_t nowMs = millis();
  if (amps > st->peakAmps) st->peakAmps = amps;

  switch (st->phase) {
    case ST_IDLE:
      if (amps >= kStartDetectAmps) {
        st->phase = ST_CAPTURING;
        st->tStartMs = nowMs;
        st->stableMs = 0;
        st->peakAmps = amps;
        st->runAmpsEma = 0.0f;
      } else if (st->wasRunning && amps < kIdleAmps * 0.5f) {
        st->wasRunning = false;
      }
      break;
    case ST_CAPTURING:
      if (amps >= kIdleAmps) {
        st->stableMs += dtMs;
        st->runAmpsEma = st->runAmpsEma * 0.85f + amps * 0.15f;
      } else {
        st->stableMs = 0;
      }
      if ((st->stableMs >= 400 && (nowMs - st->tStartMs) >= 200)
          || (nowMs - st->tStartMs) > 8000) {
        finishStart(pump, nowMs);
      } else if (amps < kIdleAmps * 0.5f && (nowMs - st->tStartMs) > 500) {
        st->phase = ST_IDLE;
        st->peakAmps = 0.0f;
      }
      break;
    case ST_RUNNING:
      if (amps >= kIdleAmps) {
        st->runAmpsEma = st->runAmpsEma * 0.98f + amps * 0.02f;
      }
      if (amps < kIdleAmps * 0.5f) {
        st->phase = ST_IDLE;
        st->peakAmps = 0.0f;
        st->stableMs = 0;
      }
      break;
  }
}

static void sampleOnce() {
  if (s_windowReady) return;
  for (uint8_t ch = 0; ch < MV_N_CH; ch++) {
    const int raw = analogRead(kPins[ch]);
    const int16_t s = (int16_t)(raw - kAdcMid);
    s_buf[ch][s_idx] = s;
    const float a = adcToAmps(raw);
    s_rmsAcc[ch] += (double)a * (double)a;
  }
  s_idx++;
  s_rmsIdx++;
  if (s_rmsIdx >= MV_RMS_N) {
    const uint32_t dtMs = (uint32_t)((1000.0f * MV_RMS_N) / MV_FS_HZ);
    for (uint8_t ch = 0; ch < MV_N_CH; ch++) {
      s_rms[ch] = (float)sqrt(s_rmsAcc[ch] / (double)MV_RMS_N);
      s_rmsAcc[ch] = 0;
    }
    for (uint8_t pump = 0; pump < MV_N_PUMP; pump++) {
      tickStart(pump, pumpMaxRms(pump), dtMs);
    }
    s_rmsIdx = 0;
  }
  if (s_idx >= MV_FFT_N) {
    s_idx = 0;
    s_windowReady = true;
  }
}

/* --- Bridge RPCs (Linux MPU) --- */

static bool window_ready() {
  return s_windowReady;
}

static bool ack_window() {
  s_windowReady = false;
  return true;
}

static float get_rms(int ch) {
  if (ch < 0 || ch >= MV_N_CH) return 0.0f;
  return s_rms[ch];
}

static int get_n_ch() {
  return MV_N_CH;
}

static int get_fft_n() {
  return MV_FFT_N;
}

static int get_fs() {
  return MV_FS_HZ;
}

static String get_window(int ch) {
  if (ch < 0 || ch >= MV_N_CH || !s_windowReady) return String("");
  b64Encode((const uint8_t*)s_buf[ch], MV_FFT_N * sizeof(int16_t), s_b64, sizeof(s_b64));
  return String(s_b64);
}

static String get_start_event() {
  if (!s_startEvt.pending) return String("{}");
  snprintf(s_evtJson, sizeof(s_evtJson),
           "{\"pump\":%u,\"startMs\":%lu,\"peakA\":%.3f,\"runA\":%.3f}",
           (unsigned)s_startEvt.pumpIdx,
           (unsigned long)s_startEvt.startMs,
           (double)s_startEvt.peakAmps,
           (double)s_startEvt.runAmps);
  s_startEvt.pending = false;
  return String(s_evtJson);
}

static bool set_fault_led(bool on) {
  digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
  return true;
}

void setup() {
  analogReadResolution(12);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  for (uint8_t ch = 0; ch < MV_N_CH; ch++) {
    pinMode(kPins[ch], INPUT);
    s_rmsAcc[ch] = 0;
  }
  for (uint8_t pump = 0; pump < MV_N_PUMP; pump++) {
    s_pump[pump].phase = ST_IDLE;
    s_pump[pump].baselineAmps = 5.0f;
  }
  memset(&s_startEvt, 0, sizeof(s_startEvt));
  s_lastSampleUs = micros();

  Bridge.begin();
  Bridge.provide("window_ready", window_ready);
  Bridge.provide("ack_window", ack_window);
  Bridge.provide("get_rms", get_rms);
  Bridge.provide("get_n_ch", get_n_ch);
  Bridge.provide("get_fft_n", get_fft_n);
  Bridge.provide("get_fs", get_fs);
  Bridge.provide("get_window", get_window);
  Bridge.provide("get_start_event", get_start_event);
  Bridge.provide("set_fault_led", set_fault_led);
}

void loop() {
  const uint32_t now = micros();
  if ((uint32_t)(now - s_lastSampleUs) >= kSampleUs) {
    s_lastSampleUs += kSampleUs;
    sampleOnce();
  }
}
