#pragma once

/*
 * DFRobot Edge101 (SKU DFR0886) — industrial ESP32 IoT controller.
 * Wiki: https://wiki.dfrobot.com/dfr0886/
 * Pins match espressif/arduino-esp32 variants/dfrobot_edge101/pins_arduino.h
 *
 * Isolated RS485 (TPT75176H): TX 17, RX 36, DE 16
 * Isolated CAN (TJA1050):     TX 32, RX 35  (unused in this sketch)
 * Ethernet (IP101GRI RMII):   REF_CLK GPIO0 in, PHY power GPIO2
 * I2C (PCF8563 + Gravity):    SDA 18, SCL 23
 * User LED GPIO15 (active low), user button GPIO38 (input-only)
 */

#ifndef LED_GPIO
#define LED_GPIO 15
#endif
#ifndef BTN_GPIO
#define BTN_GPIO 38
#endif
#ifndef DI2_GPIO
#define DI2_GPIO 37
#endif

#ifndef RS485_TX
#define RS485_TX 17
#endif
#ifndef RS485_RX
#define RS485_RX 36
#endif
#ifndef RS485_DE
#define RS485_DE 16
#endif

#ifndef ETH_PHY_TYPE
#define ETH_PHY_TYPE ETH_PHY_IP101
#endif
#ifndef ETH_PHY_ADDR
#define ETH_PHY_ADDR 1
#endif
#ifndef ETH_PHY_MDC
#define ETH_PHY_MDC 4
#endif
#ifndef ETH_PHY_MDIO
#define ETH_PHY_MDIO 13
#endif
#ifndef ETH_PHY_POWER
#define ETH_PHY_POWER 2
#endif
#ifndef ETH_CLK_MODE
#define ETH_CLK_MODE ETH_CLOCK_GPIO0_IN
#endif

#ifndef CHEM_UART
#define CHEM_UART 2
#endif
#ifndef CHEM_BAUD
#define CHEM_BAUD 4800
#endif
#ifndef CHEM_PH_SLAVE_DEFAULT
#define CHEM_PH_SLAVE_DEFAULT 1
#endif
#ifndef CHEM_CL_SLAVE_DEFAULT
#define CHEM_CL_SLAVE_DEFAULT 2
#endif
#define CHEM_TX RS485_TX
#define CHEM_RX RS485_RX
#define CHEM_DE RS485_DE

#define MV_PLATFORM_ID "dfrobot-edge101"
#define SETUP_AP_SSID "PeakLogic-Edge101"
#define SETUP_AP_PASS "peaklogic"
#define SETUP_HTTP_PORT 8080

#ifndef MV_MQTT_SKETCH_BROKER_DEFAULT
#define MV_MQTT_SKETCH_BROKER_DEFAULT "mqtt.peaklogic.io"
#endif
#ifndef MV_MQTT_SKETCH_PORT_DEFAULT
#define MV_MQTT_SKETCH_PORT_DEFAULT 8883
#endif
#ifndef MV_MQTT_SKETCH_TLS_DEFAULT
#define MV_MQTT_SKETCH_TLS_DEFAULT 1
#endif
#ifndef MV_MQTT_SKETCH_USER_DEFAULT
#define MV_MQTT_SKETCH_USER_DEFAULT "peaklogic"
#endif
#ifndef MV_MQTT_SKETCH_PASS_DEFAULT
#define MV_MQTT_SKETCH_PASS_DEFAULT "f20ba87c93b64d6b5b0606357385b9e528af2a10bb883d1f"
#endif
#define MV_MQTT_PASSWORD_SIZE 80

#define MV_FIRMWARE_VERSION "0.1.0-edge101"
#define MV_PROTOCOL_VERSION 2
