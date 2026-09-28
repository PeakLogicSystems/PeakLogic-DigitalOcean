#include "mv_debug.h"
#include "mv_rtc.h"
#include "mv_st.h"
#include <stdio.h>

#if MV_DEBUG_VERBOSE
void mvDebugPrefix() {
  char ts[24];
  Serial.print(F("[MV "));
  if (mvRtcFormatDateTime(ts, sizeof(ts))) {
    Serial.print(ts);
  } else {
    const unsigned long ms = millis();
    const unsigned long totSec = ms / 1000;
    const unsigned h = (unsigned)((totSec / 3600) % 100);
    const unsigned m = (unsigned)((totSec / 60) % 60);
    const unsigned s = (unsigned)(totSec % 60);
    const unsigned frac = (unsigned)(ms % 1000);
    if (h < 10) Serial.print('0');
    Serial.print(h);
    Serial.print(':');
    if (m < 10) Serial.print('0');
    Serial.print(m);
    Serial.print(':');
    if (s < 10) Serial.print('0');
    Serial.print(s);
    Serial.print('.');
    if (frac < 100) Serial.print('0');
    if (frac < 10) Serial.print('0');
    Serial.print(frac);
  }
  const char* prog = mvProgramShortName();
  if (prog && prog[0]) {
    Serial.print(' ');
    Serial.print(prog);
  }
  Serial.print(']');
}
#endif
