#pragma once

#include <Network.h>
#include <ETH.h>
#include "mv_board.h"

static bool g_ethUp = false;
static bool g_ethGotIp = false;

static void mvEthOnEvent(arduino_event_id_t event, arduino_event_info_t info)
{
  (void)info;
  switch (event) {
    case ARDUINO_EVENT_ETH_START:
      ETH.setHostname("peaklogic-edge101");
      Serial.println("[eth] start");
      break;
    case ARDUINO_EVENT_ETH_CONNECTED:
      g_ethUp = true;
      Serial.println("[eth] link up");
      break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      g_ethUp = true;
      g_ethGotIp = true;
      Serial.printf("[eth] IP %s gw %s\n",
                    ETH.localIP().toString().c_str(),
                    ETH.gatewayIP().toString().c_str());
      break;
    case ARDUINO_EVENT_ETH_DISCONNECTED:
      g_ethUp = false;
      g_ethGotIp = false;
      Serial.println("[eth] link down");
      break;
    case ARDUINO_EVENT_ETH_STOP:
      g_ethUp = false;
      g_ethGotIp = false;
      Serial.println("[eth] stop");
      break;
    default:
      break;
  }
}

static void mvEthBegin()
{
  Network.onEvent(mvEthOnEvent);
  const bool ok = ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_MDC, ETH_PHY_MDIO,
                            ETH_PHY_POWER, ETH_CLK_MODE);
  Serial.printf("[eth] begin %s (IP101 GPIO0 REF_CLK)\n", ok ? "ok" : "FAILED");
}

static bool mvEthReady()
{
  return g_ethGotIp && ETH.localIP()[0] != 0;
}
