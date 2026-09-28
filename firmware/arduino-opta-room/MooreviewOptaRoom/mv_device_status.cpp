#include "mv_device_status.h"
#include "mv_identity.h"
#include "mv_config.h"
#include "mv_st.h"
#include "mv_bc.h"
#include "mv_rtc.h"
#include "mv_version.h"
#include "mv_ota.h"
#include "mv_expansions.h"
#include "mv_wifi.h"
#include "mv_mqtt.h"
#include "mv_program_store.h"
#include "mv_store.h"
#include <Ethernet.h>

static void mvAppendProgramStats(JsonObject root) {
  JsonObject ps = root.createNestedObject("programStats");
  ps["maxBytes"] = MV_BC_MAX;
  ps["deployMaxBytes"] = MV_PROGRAM_JSON_MAX;
  ps["tagCount"] = mvBcTagCount();
  ps["codeBytes"] = mvBcCodeBytes();
  ps["dataBytes"] = mvBcDataBytes();
  ps["totalBytes"] = (uint32_t)mvBcBytes();
  const size_t total = mvBcBytes();
  ps["pct"] = total > 0 ? (uint8_t)((total * 100UL) / MV_BC_MAX) : 0;
  ps["headroom"] = total < MV_BC_MAX ? (uint32_t)(MV_BC_MAX - total) : 0;
}

extern bool g_runtimeRunning;
extern uint32_t g_scanMs;
extern uint32_t g_cycles;
extern uint32_t g_lastCycleUs;

void mvFillDeviceStatus(JsonObject root) {
  root["ok"] = true;
  root["device"] = "peaklogic-opta-mqtt-st";
  root["running"] = g_runtimeRunning;
  root["scanMs"] = g_scanMs;
  root["cycles"] = g_cycles;
  root["lastCycleUs"] = g_lastCycleUs;
  root["programLoaded"] = mvProgramValid();
  root["programFromNv"] = mvProgramStoreProgramFromNv();
  root["autoRunOnBoot"] = mvProgramStoreGetAutoRun();
  if (mvProgramStoreBcCrc()) root["programNvCrc"] = mvProgramStoreBcCrc();
  const char* progErr = mvLastProgramError();
  root["programError"] = progErr;
  if (mvProgramName()[0]) {
    root["programName"] = mvProgramName();
    root["programShortName"] = mvProgramShortName();
  } else {
    root["programName"] = "";
    root["programShortName"] = "";
  }
  root["ethIp"] = Ethernet.localIP().toString();
  root["mqttConnected"] = mvMqttConnected();
  {
    char brokerHost[32];
    uint16_t brokerPort = 1883;
    mvMqttGetBroker(brokerHost, sizeof(brokerHost), &brokerPort);
    const MvDeviceConfig* cfg = mvStoreActive();
    root["mqttBrokerSet"] = cfg && cfg->mqttBrokerSet ? true : false;
    root["mqttBroker"] = brokerHost;
    root["mqttBrokerPort"] = brokerPort;
  }
  root["deviceId"] = mvIdentityDeviceId();
  root["ateccStatus"] = mvIdentityAteccStatus();
  if (mvIdentityHasAtecc()) {
    root["ateccSerial"] = mvIdentityAteccSerial();
    root["serialNumber"] = mvIdentityAteccSerial();
  } else {
    root["ateccSerial"] = "";
    root["serialNumber"] = "";
  }
  root["wifiAp"] = mvWifiApActive();
  root["wifiApIp"] = mvWifiApIp().toString();
  root["rtcTime"] = mvRtcStatusString();
  root["rtcCapable"] = true;
  root["wallClockSet"] = mvRtcHasWallClock();
  root["expansions"] = mvExpDetectedCount();
  root["expansionBlueprint"] = mvExpBlueprintEnabled();
  root["programMaxBytes"] = MV_BC_MAX;
  root["deviceMode"] = mvDeviceModeString(mvDeviceModeActive());
  mvAppendProgramStats(root);
  mvVersionAppendStatus(root);
  mvOtaAppendStatus(root);
}

void mvFillDeviceStatusLite(JsonObject root) {
  root["ok"] = true;
  root["device"] = "peaklogic-opta-mqtt-st";
  root["running"] = g_runtimeRunning;
  root["scanMs"] = g_scanMs;
  root["cycles"] = g_cycles;
  root["programLoaded"] = mvProgramValid();
  root["programFromNv"] = mvProgramStoreProgramFromNv();
  root["autoRunOnBoot"] = mvProgramStoreGetAutoRun();
  if (mvProgramStoreBcCrc()) root["programNvCrc"] = mvProgramStoreBcCrc();
  root["programError"] = mvLastProgramError();
  if (mvProgramName()[0]) {
    root["programName"] = mvProgramName();
    root["programShortName"] = mvProgramShortName();
  }
  root["ethIp"] = Ethernet.localIP().toString();
  root["mqttConnected"] = mvMqttConnected();
  {
    char brokerHost[32];
    uint16_t brokerPort = 1883;
    mvMqttGetBroker(brokerHost, sizeof(brokerHost), &brokerPort);
    const MvDeviceConfig* cfg = mvStoreActive();
    root["mqttBrokerSet"] = cfg && cfg->mqttBrokerSet ? true : false;
    root["mqttBroker"] = brokerHost;
    root["mqttBrokerPort"] = brokerPort;
  }
  root["deviceId"] = mvIdentityDeviceId();
  if (mvIdentityHasAtecc()) {
    root["ateccSerial"] = mvIdentityAteccSerial();
  }
  root["rtcTime"] = mvRtcStatusString();
  root["expansions"] = mvExpDetectedCount();
  root["deviceMode"] = mvDeviceModeString(mvDeviceModeActive());
  root["programInstallBusy"] = mvProgramInstallBusy() || mvProgramStoreSaveBusy() || mvProgramStoreLoadBusy();
  mvAppendProgramStats(root);
  mvVersionAppendStatus(root);
}
