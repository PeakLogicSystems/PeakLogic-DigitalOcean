/*
 * Pin map — LilyGO T-ETH Elite ESP32-S3 + LTE Shield
 * Source: LilyGO-T-ETH-Series/.../T-ETH-Elite-LTE-Shield/utilities.h
 * https://github.com/Xinyuan-LilyGO/LilyGO-T-ETH-Series
 */
#pragma once

/*
 * Must live in a header: Arduino moves .ino #includes above sketch #defines.
 * This TinyGSM tree (v0.12+) uses A7672X for A7670/A7672 modules — not A7670.
 */
#ifndef TINY_GSM_MODEM_A7672X
#define TINY_GSM_MODEM_A7672X
#endif

#define LILYGO_T_ETH_ELITE_ESP32S3

#define ETH_MISO_PIN 47
#define ETH_MOSI_PIN 21
#define ETH_SCLK_PIN 48
#define ETH_CS_PIN 45
#define ETH_INT_PIN 14
#define ETH_RST_PIN (-1)
#define ETH_ADDR 1

#define SPI_MISO_PIN 9
#define SPI_MOSI_PIN 11
#define SPI_SCLK_PIN 10

#define SD_MISO_PIN SPI_MISO_PIN
#define SD_MOSI_PIN SPI_MOSI_PIN
#define SD_SCLK_PIN SPI_SCLK_PIN
#define SD_CS_PIN 12

#define I2C_SDA_PIN 17
#define I2C_SCL_PIN 18

#define MODEM_RX_PIN 4
#define MODEM_TX_PIN 6
#define MODEM_DTR_PIN 5
#define MODEM_RI_PIN 1
#define MODEM_PWRKEY_PIN 3

#define GPS_RX_PIN 39
#define GPS_TX_PIN 42

#define LED_PIN 38
#define LED_ON HIGH

#define SerialAT Serial2
#define SerialMon Serial

/* Simetry / Teal Smart SIM public APN (data later; AT works without it) */
#ifndef MODEM_TEST_APN
#define MODEM_TEST_APN "teal"
#endif
