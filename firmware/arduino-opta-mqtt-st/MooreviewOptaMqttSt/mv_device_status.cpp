#include "mv_device_status.h"
#include "mv_config.h"
#include "mv_st.h"
#include "mv_bc.h"
#include "mv_version.h"
#include "mv_ota.h"
#include "mv_expansions.h"
#include "mv_wifi.h"
#include "mv_http.h"
#include "mv_mqtt.h"
#include "mv_global_key.h"
#include "mv_watchdog.h"
#include "mv_identity.h"
#include "mv_ct_cal.h"
#include "mv_ahu_env_cal.h"
#include "mv_mcsa_m7.h"
#include "mv_mcsa_mon.h"
#include "mv_rbe.h"
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
  root["deviceId"] = mvIdentityDeviceId();
  root["ateccStatus"] = mvIdentityAteccStatus();
  root["running"] = g_runtimeRunning;
  root["scanMs"] = g_scanMs;
  root["reportMs"] = mvMqttReportMs();
  mvRbeFillStatus(root);
  root["cycles"] = g_cycles;
  root["lastCycleUs"] = g_lastCycleUs;
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
  root["ethIp"] = Ethernet.localIP().toString();
  root["mqttConnected"] = mvMqttConnected();
  {
    char brokerHost[64];
    uint16_t brokerPort = 1883;
    mvMqttGetBroker(brokerHost, sizeof(brokerHost), &brokerPort);
    root["mqttBroker"] = brokerHost;
    root["mqttBrokerPort"] = brokerPort;
  }
  root["mqttAuthSet"] = mvMqttAuthConfigured();
  if (mvMqttAuthFailed()) root["mqttAuthFailed"] = true;
  root["globalSiteKey"] = mvGlobalSiteKey();
  {
    char addrKey[5];
    mvGlobalAddrKey(addrKey);
    root["globalAddrKey"] = addrKey;
  }
  root["wifiAp"] = mvWifiApActive();
  root["wifiApIp"] = mvWifiApIp().toString();
  root["wifiCapable"] = mvWifiCapable();
  root["httpRoutes"] = mvHttpRouteCount();
  root["expansions"] = mvExpDetectedCount();
  root["expansionBlueprint"] = mvExpBlueprintEnabled();
  root["programMaxBytes"] = MV_BC_MAX;
  mvAppendProgramStats(root);
  mvVersionAppendStatus(root);
  mvOtaAppendStatus(root);
  mvWatchdogAppendStatus(root);
  mvCtCalAppendStatus(root);
  mvAhuEnvCalAppendStatus(root);
  mvMcsaM7AppendStatus(root);
  mvMcsaMonAppendStatus(root);
}
