#pragma once

/* Ethernet from the mbed_opta board core (same as Arduino's Web Server example). */
#if !defined(ARDUINO_OPTA) && !defined(ARDUINO_PORTENTA_H7_M7)
#error "PeakLogic Opta ST: set Tools -> Board -> Arduino Opta (WiFi / Lite / RS485)."
#endif

#include <SPI.h>
#include <PortentaEthernet.h>
#include <Ethernet.h>

#ifndef MV_HTTP_PORT
#define MV_HTTP_PORT 80
#endif
