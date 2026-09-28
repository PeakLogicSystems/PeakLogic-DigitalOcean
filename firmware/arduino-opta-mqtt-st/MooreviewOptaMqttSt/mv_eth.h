#pragma once

/* Ethernet from the mbed_opta board core (same as Arduino's Web Server example).
 * Arduino IDE also lists "Arduino Opta" under Arduino Zephyr Boards — that core
 * defines ARDUINO_OPTA but does not ship PortentaEthernet.h. */
#if defined(ARDUINO_ARCH_ZEPHYR)
#error "PeakLogic Opta firmware: Tools -> Board -> Arduino Mbed OS Opta Boards -> Opta (not Arduino Zephyr Boards)."
#endif
#if !defined(ARDUINO_OPTA) && !defined(ARDUINO_PORTENTA_H7_M7)
#error "PeakLogic Opta MQTT ST: set Tools -> Board -> Arduino Mbed OS Opta Boards -> Opta (WiFi / Lite / RS485)."
#endif

#include <SPI.h>
#include <PortentaEthernet.h>
#include <Ethernet.h>

#ifndef MV_HTTP_PORT
#define MV_HTTP_PORT 80
#endif
