#include "mv_expansions.h"
#include "mv_tags.h"
#include <stdio.h>
#include <string.h>

#if defined(ARDUINO_OPTA)
#include "OptaBlue.h"
#define MV_HAS_BLUEPRINT 1
using namespace Opta;
#endif

static MvExpDetected g_detected[MV_EXP_SLOTS];
static uint8_t g_detectedCount = 0;
static const MvDeviceConfig* g_cfg = nullptr;

static const char* expTypeName(uint8_t t) {
  switch (t) {
    case MV_EXP_D1608E: return "AFX00005";
    case MV_EXP_A0602: return "AFX00007";
    case MV_EXP_NONE: return "none";
    default: return "auto";
  }
}

static uint8_t mapHwTypeToMv(uint8_t hwType) {
#ifdef MV_HAS_BLUEPRINT
  if (hwType == (uint8_t)EXPANSION_OPTA_DIGITAL_MEC || hwType == (uint8_t)EXPANSION_OPTA_DIGITAL_STS) {
    return MV_EXP_D1608E;
  }
  if (hwType == (uint8_t)EXPANSION_OPTA_ANALOG) return MV_EXP_A0602;
#endif
  return MV_EXP_NONE;
}

static bool slotEnabled(uint8_t slot, uint8_t detectedType) {
  if (!g_cfg || slot >= MV_EXP_SLOTS) return false;
  uint8_t want = g_cfg->expSlotType[slot];
  if (want == MV_EXP_NONE) return false;
  if (want == MV_EXP_AUTO) return detectedType != MV_EXP_NONE;
  return want == detectedType;
}

void mvExpBegin() {
#ifdef MV_HAS_BLUEPRINT
  OptaController.begin();
  delay(500);
  OptaController.update();
#endif
  memset(g_detected, 0, sizeof(g_detected));
  g_detectedCount = 0;
}

void mvExpUpdate() {
#ifdef MV_HAS_BLUEPRINT
  OptaController.update();
#endif
  g_detectedCount = 0;
  memset(g_detected, 0, sizeof(g_detected));
#ifdef MV_HAS_BLUEPRINT
  for (uint8_t i = 0; i < MV_EXP_SLOTS; i++) {
    DigitalMechExpansion mech = OptaController.getExpansion(i);
    DigitalStSolidExpansion solid = OptaController.getExpansion(i);
    AnalogExpansion analog = OptaController.getExpansion(i);
    uint8_t mvType = MV_EXP_NONE;
    if (mech || solid) mvType = MV_EXP_D1608E;
    else if (analog) mvType = MV_EXP_A0602;
    if (mvType == MV_EXP_NONE) continue;
    MvExpDetected* d = &g_detected[g_detectedCount++];
    d->slot = i;
    d->hwType = OptaController.getExpansionType(i);
    d->type = mvType;
    d->present = true;
    snprintf(d->label, sizeof(d->label), "%s", expTypeName(d->type));
  }
#endif
}

void mvExpApplyConfig(const MvDeviceConfig* cfg) {
  g_cfg = cfg;
#ifdef MV_HAS_BLUEPRINT
  mvExpUpdate();
  for (uint8_t i = 0; i < g_detectedCount; i++) {
    const MvExpDetected* d = &g_detected[i];
    if (!slotEnabled(d->slot, d->type)) continue;
    if (d->type == MV_EXP_A0602) {
      AnalogExpansion exp = OptaController.getExpansion(d->slot);
      if (!exp) continue;
      for (uint8_t ch = 0; ch < MV_EXP_A0602_CH; ch++) {
        exp.beginChannelAsVoltageAdc(ch);
      }
    }
  }
#endif
}

uint8_t mvExpDetectedCount() { return g_detectedCount; }

bool mvExpGetDetected(uint8_t idx, MvExpDetected* out) {
  if (!out || idx >= g_detectedCount) return false;
  memcpy(out, &g_detected[idx], sizeof(MvExpDetected));
  return true;
}

static void ensureExpTag(const char* id, MvTagKind kind) {
  mvEnsureTag(id, kind);
}

void mvExpEnsureTags() {
  const MvDeviceConfig* cfg = mvStoreActive();
  g_cfg = cfg;
  mvExpUpdate();
  for (uint8_t s = 0; s < MV_EXP_SLOTS; s++) {
    char pfx[8];
    snprintf(pfx, sizeof(pfx), "X%u", (unsigned)(s + 1));
    uint8_t detType = MV_EXP_NONE;
    for (uint8_t i = 0; i < g_detectedCount; i++) {
      if (g_detected[i].slot == s) { detType = g_detected[i].type; break; }
    }
    uint8_t want = cfg->expSlotType[s];
    uint8_t type = (want == MV_EXP_AUTO) ? detType : want;
    if (type == MV_EXP_NONE) continue;
    if (type == MV_EXP_D1608E) {
      for (uint8_t n = 0; n < MV_EXP_D1608E_DI; n++) {
        char id[16];
        snprintf(id, sizeof(id), "%s_I%u", pfx, n + 1);
        ensureExpTag(id, MV_BOOL);
        snprintf(id, sizeof(id), "%s_IRAW%u", pfx, n + 1);
        ensureExpTag(id, MV_INT);
      }
      for (uint8_t n = 0; n < MV_EXP_D1608E_DO; n++) {
        char id[16];
        snprintf(id, sizeof(id), "%s_R%u", pfx, n + 1);
        ensureExpTag(id, MV_BOOL);
      }
    } else if (type == MV_EXP_A0602) {
      for (uint8_t n = 0; n < MV_EXP_A0602_CH; n++) {
        char id[16];
        snprintf(id, sizeof(id), "%s_AI%u", pfx, n + 1);
        ensureExpTag(id, MV_REAL);
      }
      for (uint8_t n = 0; n < MV_EXP_A0602_PWM; n++) {
        char id[16];
        snprintf(id, sizeof(id), "%s_PWM%u", pfx, n + 1);
        ensureExpTag(id, MV_INT);
      }
    }
  }
}

void mvExpReadInputs() {
#ifdef MV_HAS_BLUEPRINT
  mvExpUpdate();
  for (uint8_t i = 0; i < g_detectedCount; i++) {
    const MvExpDetected* d = &g_detected[i];
    if (!slotEnabled(d->slot, d->type)) continue;
    char pfx[8];
    snprintf(pfx, sizeof(pfx), "X%u", (unsigned)(d->slot + 1));
    if (d->type == MV_EXP_D1608E) {
      DigitalMechExpansion mech = OptaController.getExpansion(d->slot);
      DigitalStSolidExpansion solid = OptaController.getExpansion(d->slot);
      if (mech) {
        mech.updateDigitalInputs();
        for (uint8_t k = 0; k < MV_EXP_D1608E_DI; k++) {
          char id[16];
          snprintf(id, sizeof(id), "%s_I%u", pfx, k + 1);
          mvSetBool(id, mech.digitalRead(k) == HIGH);
          snprintf(id, sizeof(id), "%s_IRAW%u", pfx, k + 1);
          mvSetInt(id, mech.analogRead(k));
        }
        for (uint8_t k = 0; k < MV_EXP_D1608E_DO; k++) {
          char id[16];
          snprintf(id, sizeof(id), "%s_R%u", pfx, k + 1);
          MvTag* t = mvFindTag(id);
          if (t) mech.digitalWrite(k, t->b ? HIGH : LOW, true);
        }
      } else if (solid) {
        solid.updateDigitalInputs();
        for (uint8_t k = 0; k < MV_EXP_D1608E_DI; k++) {
          char id[16];
          snprintf(id, sizeof(id), "%s_I%u", pfx, k + 1);
          mvSetBool(id, solid.digitalRead(k) == HIGH);
          snprintf(id, sizeof(id), "%s_IRAW%u", pfx, k + 1);
          mvSetInt(id, solid.analogRead(k));
        }
        for (uint8_t k = 0; k < MV_EXP_D1608E_DO; k++) {
          char id[16];
          snprintf(id, sizeof(id), "%s_R%u", pfx, k + 1);
          MvTag* t = mvFindTag(id);
          if (t) solid.digitalWrite(k, t->b ? HIGH : LOW, true);
        }
      }
    } else if (d->type == MV_EXP_A0602) {
      AnalogExpansion exp = OptaController.getExpansion(d->slot);
      if (!exp) continue;
      exp.updateAnalogInputs();
      for (uint8_t ch = 0; ch < MV_EXP_A0602_CH; ch++) {
        char id[16];
        snprintf(id, sizeof(id), "%s_AI%u", pfx, ch + 1);
        mvSetReal(id, exp.pinVoltage(ch));
      }
    }
  }
#endif
}

void mvExpWriteOutputs() {
#ifdef MV_HAS_BLUEPRINT
  for (uint8_t i = 0; i < g_detectedCount; i++) {
    const MvExpDetected* d = &g_detected[i];
    if (!slotEnabled(d->slot, d->type)) continue;
    char pfx[8];
    snprintf(pfx, sizeof(pfx), "X%u", (unsigned)(d->slot + 1));
    if (d->type == MV_EXP_A0602) {
      AnalogExpansion exp = OptaController.getExpansion(d->slot);
      if (!exp) continue;
      for (uint8_t ch = 0; ch < 2; ch++) {
        char id[16];
        snprintf(id, sizeof(id), "%s_AI%u", pfx, ch + 1);
        MvTag* t = mvFindTag(id);
        if (t && t->kind == MV_REAL) exp.pinVoltage(ch, t->r, true);
      }
      for (uint8_t p = 0; p < MV_EXP_A0602_PWM; p++) {
        char id[16];
        snprintf(id, sizeof(id), "%s_PWM%u", pfx, p + 1);
        MvTag* t = mvFindTag(id);
        if (t) {
          uint32_t pulse = (uint32_t)(t->i > 0 ? t->i : 0);
          exp.setPwm(p, 20000, pulse);
        }
      }
      exp.updateAnalogOutputs();
    }
  }
#endif
}
