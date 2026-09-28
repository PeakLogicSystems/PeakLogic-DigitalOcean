#include "mv_device_status.h"
#include "mv_config.h"
#include "mv_runtime.h"
#include "mv_st.h"
#include "mv_rtc.h"
#include "mv_version.h"
#include "mv_ota.h"
#include "mv_expansions.h"
#include "mv_wifi.h"
#include <Ethernet.h>

void mvFillDeviceStatus(JsonObject root) {
  root["ok"] = true;
  root["device"] = "peaklogic-opta-st";
  root["running"] = mvRuntimeRunning();
  root["scanMs"] = mvRuntimeScanMs();
  root["cycles"] = mvRuntimeCycles();
  root["lastCycleUs"] = mvRuntimeLastCycleUs();
  root["programLoaded"] = mvProgramValid();
  const char* progErr = mvLastProgramError();
  root["programError"] = progErr;
  if (mvProgramName()[0]) {
    root["programName"] = mvProgramName();
    root["programShortName"] = mvProgramShortName();
  } else {
    root["programName"] = "";
    root["programShortName"] = "";
  }
  const char* rtc = mvRtcStatusString();
  root["rtcTime"] = rtc;
  root["ethIp"] = Ethernet.localIP().toString();
  root["wifiAp"] = mvWifiApActive();
  root["wifiApIp"] = mvWifiApIp().toString();
  root["expansions"] = mvExpDetectedCount();
  mvVersionAppendStatus(root);
  root["programMaxBytes"] = MV_PROGRAM_JSON_MAX;
  mvOtaAppendStatus(root);
}
