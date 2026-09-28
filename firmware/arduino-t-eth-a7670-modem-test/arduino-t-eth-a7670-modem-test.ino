/*
 * PeakLogic — A7670 modem AT test
 * Board: LilyGO T-ETH Elite (ESP32-S3) + LTE Shield (H744-02) + T-PCIE A7670
 *
 * Published UART (LilyGO utilities.h / T-ETH-Elite-LTE-Shield example):
 *   SerialAT = Serial2
 *   Serial2.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN)
 *   MODEM_RX_PIN = 4   → ESP32 RX  ← modem TX
 *   MODEM_TX_PIN = 6   → ESP32 TX  → modem RX
 *   MODEM_PWRKEY_PIN = 3
 *   MODEM_DTR_PIN = 5
 *   MODEM_RI_PIN = 1
 *   LED_PIN = 38
 *
 * Source:
 *   https://github.com/Xinyuan-LilyGO/LilyGO-T-ETH-Series/tree/master/examples/T-ETH-ELite-Shield/T-ETH-Elite-LTE-Shield
 *   https://wiki.lilygo.cc/products/t-eth-series/t-eth-lte/
 *
 * Switches: OTG OFF, PCIE = 4.2V / T-PCIE
 * Arduino: ESP32S3 Dev Module, USB CDC On Boot Enabled, PSRAM OPI, 16 MB
 * Monitor: 115200 — look for lines starting with MV:
 */

#include <Arduino.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include "esp_rom_sys.h"
#include "utilities.h" /* defines TINY_GSM_MODEM_A7672X before TinyGSM */
#include <TinyGsmClient.h>

TinyGsm modem(SerialAT);

static void logMsg(const char *fmt, ...)
{
  char buf[220];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  esp_rom_printf("MV: %s\r\n", buf);
  Serial.println(buf);
}

static void ledOn(bool on)
{
  digitalWrite(LED_PIN, on ? LED_ON : !LED_ON);
}

/* LilyGO LTE Shield power-on (PWRKEY active-high pulse) */
static void modemPowerOn()
{
  pinMode(MODEM_PWRKEY_PIN, OUTPUT);
  digitalWrite(MODEM_PWRKEY_PIN, LOW);
  delay(100);
  digitalWrite(MODEM_PWRKEY_PIN, HIGH);
  delay(1000);
  digitalWrite(MODEM_PWRKEY_PIN, LOW);
}

static void modemPowerOff()
{
  pinMode(MODEM_PWRKEY_PIN, OUTPUT);
  digitalWrite(MODEM_PWRKEY_PIN, LOW);
  delay(100);
  digitalWrite(MODEM_PWRKEY_PIN, HIGH);
  delay(1200);
  digitalWrite(MODEM_PWRKEY_PIN, LOW);
}

static void modemRestart()
{
  modemPowerOff();
  delay(1000);
  modemPowerOn();
}

static bool waitAT(uint32_t timeoutMs)
{
  const uint32_t t0 = millis();
  while (millis() - t0 < timeoutMs) {
    ledOn(((millis() / 200) % 2) == 0);
    if (modem.testAT(500)) {
      ledOn(true);
      return true;
    }
    delay(200);
  }
  ledOn(false);
  return false;
}

static bool sendAT(const char *cmd, uint32_t timeoutMs = 5000)
{
  logMsg(">> %s", cmd);
  SerialAT.println(cmd);
  const uint32_t t0 = millis();
  String line;
  bool ok = false;
  while (millis() - t0 < timeoutMs) {
    while (SerialAT.available()) {
      char c = (char)SerialAT.read();
      if (c == '\r') {
        continue;
      }
      if (c == '\n') {
        if (line.length()) {
          logMsg("<< %s", line.c_str());
          if (line.indexOf("OK") >= 0) {
            ok = true;
          }
          if (line.indexOf("ERROR") >= 0) {
            return false;
          }
          line = "";
        }
      } else {
        line += c;
        if (line.length() > 180) {
          line = "";
        }
      }
    }
    delay(5);
  }
  return ok;
}

void setup()
{
  pinMode(LED_PIN, OUTPUT);
  ledOn(true);

  pinMode(MODEM_DTR_PIN, OUTPUT);
  digitalWrite(MODEM_DTR_PIN, LOW);
  pinMode(MODEM_RI_PIN, INPUT);

  Serial.begin(115200);
  delay(1500);

  logMsg("========================================");
  logMsg("PeakLogic A7670 modem AT test");
  logMsg("Published UART (LilyGO T-ETH Elite LTE):");
  logMsg("  Serial2 RX=GPIO%d (ESP RX <- modem TX)", MODEM_RX_PIN);
  logMsg("  Serial2 TX=GPIO%d (ESP TX -> modem RX)", MODEM_TX_PIN);
  logMsg("  PWRKEY=GPIO%d  DTR=GPIO%d  RI=GPIO%d  LED=GPIO%d",
         MODEM_PWRKEY_PIN, MODEM_DTR_PIN, MODEM_RI_PIN, LED_PIN);
  logMsg("APN=%s (Simetry / Teal)", MODEM_TEST_APN);
  logMsg("========================================");

  /* Exact LilyGO begin order from example */
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);

  logMsg("PWRKEY power-on pulse...");
  modemPowerOn();

  logMsg("Wait 15s for modem boot (LilyGO)...");
  for (int i = 15; i > 0; --i) {
    ledOn((i % 2) == 0);
    logMsg("  %ds", i);
    delay(1000);
  }
  ledOn(true);

  logMsg("Autobaud + AT...");
  if (!modem.init()) {
    logMsg("init() failed — restart + retry");
    modemRestart();
    delay(10000);
    if (!waitAT(20000)) {
      logMsg("FAIL: no AT response on published RX=%d TX=%d", MODEM_RX_PIN, MODEM_TX_PIN);
      logMsg("Check: SIM seated, antenna, OTG OFF, PCIE=4.2V/T-PCIE");
      logMsg("Compare with LilyGO factory: ref-T-ETH-ELite-LTE-Shield_070324.bin");
      return;
    }
  }

  logMsg("Modem ready.");
  sendAT("ATI");
  sendAT("AT+CGMM");
  sendAT("AT+CGMR");
  sendAT("AT+GSN");
  sendAT("AT+CPIN?");
  sendAT("AT+CSQ");
  sendAT("AT+CREG?");
  sendAT("AT+CGREG?");
  sendAT("AT+COPS?");
  sendAT("AT+CGATT?");

  char apnCmd[64];
  snprintf(apnCmd, sizeof(apnCmd), "AT+CGDCONT=1,\"IP\",\"%s\"", MODEM_TEST_APN);
  sendAT(apnCmd);
  sendAT("AT+CGDCONT?");

  logMsg("----------------------------------------");
  logMsg("Type AT commands in Serial Monitor (CR/LF).");
  logMsg("----------------------------------------");
}

void loop()
{
  while (SerialAT.available()) {
    Serial.write(SerialAT.read());
  }
  while (Serial.available()) {
    SerialAT.write(Serial.read());
  }

  static uint32_t lastBlink = 0;
  if (millis() - lastBlink > 1000) {
    lastBlink = millis();
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }
}
