/**
 * PeakLogic Opta — Modbus RTU slave on RS485
 *
 * Exposes Parc-equivalent I/O for Dragino RS485-NB gateway polling.
 * Register map matches opta_parc_modbus_dragino.json (slave ID 2, 9600 8N1).
 *
 * Libraries: ArduinoRS485, ArduinoModbus (Library Manager)
 * Board: Arduino Opta (WiFi / Lite / RS485)
 */
#include <ArduinoRS485.h>
#include <ArduinoModbus.h>
#include "mv_config.h"
#include "mv_io.h"
#include "mv_modbus_map.h"
#include "mv_pseudo_ai.h"

static const char* kFirmwareId = "opta-rtu-slave-1.0.0";
static uint16_t g_holding[MV_MB_HR_COUNT];
static uint32_t g_lastSyncMs = 0;
static uint32_t g_lastAiMs = 0;

static void modbusSetDelays() {
#if defined(ARDUINO_OPTA)
  // Opta RS485 transceiver needs longer gaps than library defaults (forum/Opta Modbus guides).
  RS485.setDelays(1000, 1000);
#endif
}

static void syncIoToModbus() {
  for (uint8_t i = 0; i < MV_MB_DI_COUNT; i++) {
    ModbusRTUServer.discreteInputWrite(i, mvReadDigitalIn(i) ? 1 : 0);
  }

  for (uint8_t i = 0; i < MV_MB_COIL_COUNT; i++) {
    ModbusRTUServer.coilWrite(i, mvReadRelay(i) ? 1 : 0);
  }

  for (uint8_t i = 0; i < 8; i++) {
    ModbusRTUServer.inputRegisterWrite(
      (uint16_t)(MV_MB_IR_RAW0 + i),
      mvMbClampU16(mvReadAnalogRaw(i)));
  }

  for (uint8_t i = 0; i < 4; i++) {
    const uint8_t ai = (uint8_t)(i + 2);
    ModbusRTUServer.inputRegisterWrite(
      (uint16_t)(MV_MB_IR_MA_AI3 + i),
      mvMbCenti(mvPseudoAiMilliAmps(ai)));
    ModbusRTUServer.inputRegisterWrite(
      (uint16_t)(MV_MB_IR_SCALED_AI3 + i),
      mvMbDeci(mvPseudoAiScaled(ai)));
  }

  for (uint8_t ch = 0; ch < MV_MCSA_LITE_CHANNELS; ch++) {
    ModbusRTUServer.inputRegisterWrite(
      (uint16_t)(MV_MB_IR_MCSA_CH1 + ch),
      mvMbCenti(mvPseudoAiMcsaAmps(ch)));
  }

  ModbusRTUServer.inputRegisterWrite(
    MV_MB_IR_PDM_P1_HEALTH,
    mvMbCenti(mvPseudoAiPumpHealth(0)));
  ModbusRTUServer.inputRegisterWrite(
    MV_MB_IR_PDM_P2_HEALTH,
    mvMbCenti(mvPseudoAiPumpHealth(1)));

  for (uint8_t i = 0; i < MV_MB_HR_COUNT; i++) {
    ModbusRTUServer.holdingRegisterWrite(i, g_holding[i]);
  }
}

static void applyModbusCoilWrites() {
  for (uint8_t i = 0; i < MV_MB_COIL_COUNT; i++) {
    const bool on = ModbusRTUServer.coilRead(i) != 0;
    if (on != mvReadRelay(i)) mvWriteRelay(i, on);
  }
}

static void applyModbusHoldingWrites() {
  for (uint8_t i = 0; i < MV_MB_HR_COUNT; i++) {
    g_holding[i] = ModbusRTUServer.holdingRegisterRead(i);
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) { /* USB console optional */ }

  mvIoBegin();
  mvPseudoAiBegin();
  memset(g_holding, 0, sizeof(g_holding));

  modbusSetDelays();
  RS485.setPins(RS485_DEFAULT_DE_PIN, RS485_DEFAULT_RE_PIN);

  if (!ModbusRTUServer.begin(MV_MODBUS_SLAVE_ID, MV_MODBUS_BAUD, SERIAL_8N1)) {
    Serial.println(F("[MV] Modbus RTU server begin failed"));
    while (1) delay(1000);
  }

  ModbusRTUServer.configureDiscreteInputs(0, MV_MB_DI_COUNT);
  ModbusRTUServer.configureCoils(0, MV_MB_COIL_COUNT);
  ModbusRTUServer.configureInputRegisters(0, MV_MB_IR_COUNT);
  ModbusRTUServer.configureHoldingRegisters(0, MV_MB_HR_COUNT);

  syncIoToModbus();

  Serial.print(F("[MV] Opta Modbus RTU slave ready id="));
  Serial.print(MV_MODBUS_SLAVE_ID);
  Serial.print(F(" baud="));
  Serial.print(MV_MODBUS_BAUD);
  Serial.print(F(" fw="));
  Serial.println(kFirmwareId);
}

void loop() {
  const uint32_t now = millis();
  const uint32_t aiDt = (g_lastAiMs == 0) ? 10 : (now - g_lastAiMs);
  g_lastAiMs = now;

  mvPseudoAiTick(aiDt);

  ModbusRTUServer.poll();

  applyModbusCoilWrites();
  applyModbusHoldingWrites();

  if (now - g_lastSyncMs >= 20) {
    g_lastSyncMs = now;
    syncIoToModbus();
  }
}
