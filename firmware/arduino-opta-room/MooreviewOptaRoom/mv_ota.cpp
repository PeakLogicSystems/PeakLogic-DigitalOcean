#include "mv_ota.h"
#include "mv_config.h"
#include "mv_http.h"
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && defined(__has_include)
#if __has_include(<Arduino_Portenta_OTA.h>)
#define MV_HAS_PORTENTA_OTA 1
#include <Arduino_Portenta_OTA.h>
#include <BlockDevice.h>
#include <MBRBlockDevice.h>
#include <FATFileSystem.h>
#include <stm32h7xx_hal_rtc_ex.h>
extern RTC_HandleTypeDef RTCHandle;
#endif
#endif

#if defined(MV_HAS_WIFI) && defined(__has_include)
#if __has_include(<ArduinoOTA.h>)
#define MV_HAS_ARDUINO_OTA 1
#include <ArduinoOTA.h>
#endif
#endif

static bool* g_runtimeRunning = nullptr;
static MvOtaInfo g_ota = {};

static void setPhase(const char* phase, const char* msg) {
  strncpy(g_ota.phase, phase, sizeof(g_ota.phase) - 1);
  g_ota.phase[sizeof(g_ota.phase) - 1] = '\0';
  if (msg) {
    strncpy(g_ota.message, msg, sizeof(g_ota.message) - 1);
    g_ota.message[sizeof(g_ota.message) - 1] = '\0';
  }
}

#if defined(MV_HAS_PORTENTA_OTA)
static Arduino_Portenta_OTA_QSPI g_portentaOta(QSPI_FLASH_FATFS_MBR, MV_OTA_QSPI_OFFSET);
static FILE* g_uploadFile = nullptr;
static bool g_storageReady = false;
static bool g_useLibraryBegin = false;
static mbed::BlockDevice* g_bdRaw = nullptr;
static mbed::MBRBlockDevice* g_bdQspi = nullptr;
static mbed::FATFileSystem* g_fsQspi = nullptr;

static const char* MV_OTA_UPLOAD_PATH = "/fs/UPDATE.BIN.LZSS";
static const char* MV_OTA_BIN_PATH = "/fs/UPDATE.BIN";

static void otaErrorFromCode(int code) {
  char buf[48];
  snprintf(buf, sizeof(buf), "ota error %d", code);
  setPhase("error", buf);
}

static bool mountQspiLocal() {
  if (g_fsQspi) return true;
  g_bdRaw = mbed::BlockDevice::get_default_instance();
  if (!g_bdRaw || g_bdRaw->init() != 0) {
    setPhase("error", "QSPI init failed");
    return false;
  }
  g_bdQspi = new mbed::MBRBlockDevice(g_bdRaw, MV_OTA_QSPI_OFFSET);
  g_fsQspi = new mbed::FATFileSystem("fs");
  if (g_fsQspi->mount(g_bdQspi) != 0) {
    setPhase("error", "QSPI mount failed");
    return false;
  }
  return true;
}

static bool ensureOtaStorage() {
  if (g_storageReady) return true;
  if (!g_portentaOta.isOtaCapable()) {
    setPhase("error", "bootloader too old for OTA");
    return false;
  }
  Arduino_Portenta_OTA::Error err = g_portentaOta.begin();
  if (err == Arduino_Portenta_OTA::Error::None) {
    g_useLibraryBegin = true;
    g_storageReady = true;
    return true;
  }
  if (mountQspiLocal()) {
    g_storageReady = true;
    return true;
  }
  return false;
}

static uint32_t programLengthFromBin() {
  struct stat stat_buf;
  if (stat(MV_OTA_BIN_PATH, &stat_buf) != 0) return 0;
  return (uint32_t)stat_buf.st_size;
}

static void commitBootloaderUpdate() {
  uint32_t programLength = programLengthFromBin();
  if (!programLength) {
    g_ota.error = true;
    setPhase("error", "UPDATE.BIN missing");
    return;
  }
  HAL_RTCEx_BKUPWrite(&RTCHandle, RTC_BKP_DR0, 0x07AA);
  HAL_RTCEx_BKUPWrite(&RTCHandle, RTC_BKP_DR1, QSPI_FLASH_FATFS_MBR);
  HAL_RTCEx_BKUPWrite(&RTCHandle, RTC_BKP_DR2, MV_OTA_QSPI_OFFSET);
  HAL_RTCEx_BKUPWrite(&RTCHandle, RTC_BKP_DR3, programLength);
  setPhase("done", "rebooting");
}
#endif

void mvOtaSetRuntimeFlag(bool* runningFlag) {
  g_runtimeRunning = runningFlag;
}

bool mvOtaCheckAuth(const char* passwordHeader) {
  if (!MV_OTA_PASSWORD[0]) return true;
  if (!passwordHeader || !passwordHeader[0]) return false;
  return strcmp(passwordHeader, MV_OTA_PASSWORD) == 0;
}

bool mvOtaBeginFlash(size_t totalSize) {
#if defined(MV_HAS_PORTENTA_OTA)
  if (g_ota.inProgress) {
    setPhase("busy", "update already in progress");
    g_ota.error = true;
    return false;
  }
  if (g_runtimeRunning) *g_runtimeRunning = false;
  g_ota = {};
  g_ota.supported = true;
  g_ota.inProgress = true;
  g_ota.totalBytes = (uint32_t)totalSize;
  setPhase("begin", "prepare QSPI storage");
  if (!ensureOtaStorage()) {
    g_ota.error = true;
    g_ota.inProgress = false;
    return false;
  }
  remove(MV_OTA_UPLOAD_PATH);
  remove(MV_OTA_BIN_PATH);
  g_uploadFile = fopen(MV_OTA_UPLOAD_PATH, "wb");
  if (!g_uploadFile) {
    g_ota.error = true;
    setPhase("error", "cannot open upload file");
    g_ota.inProgress = false;
    return false;
  }
  setPhase("write", "receiving .ota firmware");
  return true;
#else
  (void)totalSize;
  setPhase("error", "OTA library not installed");
  g_ota.error = true;
  return false;
#endif
}

bool mvOtaWriteFlash(const uint8_t* data, size_t len) {
#if defined(MV_HAS_PORTENTA_OTA)
  if (!g_ota.inProgress || g_ota.error || !g_uploadFile) return false;
  size_t n = fwrite(data, 1, len, g_uploadFile);
  if (n != len) {
    g_ota.error = true;
    setPhase("error", "QSPI write failed");
    fclose(g_uploadFile);
    g_uploadFile = nullptr;
    g_ota.inProgress = false;
    return false;
  }
  g_ota.bytesWritten += (uint32_t)n;
  return true;
#else
  (void)data;
  (void)len;
  return false;
#endif
}

bool mvOtaEndFlash() {
#if defined(MV_HAS_PORTENTA_OTA)
  if (!g_ota.inProgress) return false;
  if (g_uploadFile) {
    fclose(g_uploadFile);
    g_uploadFile = nullptr;
  }
  setPhase("decompress", "LZSS decompress");
  int decompressed = g_portentaOta.decompress();
  if (decompressed < 0) {
    g_ota.error = true;
    otaErrorFromCode(decompressed);
    g_ota.inProgress = false;
    return false;
  }
  setPhase("commit", "programming bootloader");
  if (g_useLibraryBegin) {
    Arduino_Portenta_OTA::Error err = g_portentaOta.update();
    if (err != Arduino_Portenta_OTA::Error::None) {
      g_ota.error = true;
      otaErrorFromCode((int)err);
      g_ota.inProgress = false;
      return false;
    }
  } else {
    commitBootloaderUpdate();
    if (g_ota.error) {
      g_ota.inProgress = false;
      return false;
    }
  }
  g_ota.inProgress = false;
  return true;
#else
  return false;
#endif
}

void mvOtaAbortFlash() {
#if defined(MV_HAS_PORTENTA_OTA)
  if (g_uploadFile) {
    fclose(g_uploadFile);
    g_uploadFile = nullptr;
  }
  remove(MV_OTA_UPLOAD_PATH);
#endif
  g_ota.inProgress = false;
  g_ota.error = true;
  setPhase("aborted", "upload cancelled");
}

void mvOtaBegin() {
#if defined(MV_HAS_PORTENTA_OTA)
  g_ota.supported = g_portentaOta.isOtaCapable();
#else
  g_ota.supported = false;
#endif
#if defined(MV_HAS_ARDUINO_OTA)
  g_ota.wifiOta = true;
  ArduinoOTA.setHostname("peaklogic-opta-mqtt-st");
  if (MV_OTA_PASSWORD[0]) ArduinoOTA.setPassword(MV_OTA_PASSWORD);
  ArduinoOTA.onStart([]() {
    if (g_runtimeRunning) *g_runtimeRunning = false;
    g_ota.inProgress = true;
    g_ota.error = false;
    setPhase("wifi", "ArduinoOTA started");
  });
  ArduinoOTA.onEnd([]() {
    setPhase("done", "ArduinoOTA complete");
    g_ota.inProgress = false;
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    g_ota.bytesWritten = progress;
    g_ota.totalBytes = total;
    setPhase("wifi", "ArduinoOTA writing");
  });
  ArduinoOTA.onError([](ota_error_t err) {
    g_ota.error = true;
    g_ota.inProgress = false;
    setPhase("error", "ArduinoOTA failed");
    (void)err;
  });
  ArduinoOTA.begin();
#else
  g_ota.wifiOta = false;
#endif
}

void mvOtaLoop() {
#if defined(MV_HAS_ARDUINO_OTA)
  if (g_ota.wifiOta) ArduinoOTA.handle();
#endif
}

void mvOtaRebootAfterFlash() {
#if defined(MV_HAS_PORTENTA_OTA)
  if (g_useLibraryBegin) g_portentaOta.reset();
  else NVIC_SystemReset();
#else
  NVIC_SystemReset();
#endif
}

MvOtaInfo mvOtaInfo() {
  return g_ota;
}

void mvOtaAppendStatus(JsonObject doc) {
  JsonObject ota = doc.createNestedObject("ota");
  ota["supported"] = g_ota.supported;
  ota["inProgress"] = g_ota.inProgress;
  ota["error"] = g_ota.error;
  ota["wifiOta"] = g_ota.wifiOta;
  ota["bytesWritten"] = g_ota.bytesWritten;
  ota["totalBytes"] = g_ota.totalBytes;
  ota["phase"] = g_ota.phase;
  ota["message"] = g_ota.message;
#if defined(MV_HAS_PORTENTA_OTA)
  ota["format"] = "arduino-portenta-ota";
#else
  ota["format"] = nullptr;
#endif
}

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER

static void handleOtaInfoHttp(Stream& client, const String& method, const String& path,
                              const String& body, const String& headerBlock) {
  (void)method;
  (void)path;
  (void)body;
  (void)headerBlock;
  StaticJsonDocument<512> doc;
  doc["ok"] = true;
  doc["path"] = "/api/firmware";
  doc["method"] = "POST";
  doc["contentType"] = "application/octet-stream";
  doc["format"] = "arduino-portenta-ota (.ota file, not raw .bin)";
  doc["buildHint"] = "Export Binary -> lzss.py -> bin2ota.py OPTA";
  if (MV_OTA_PASSWORD[0]) doc["authHeader"] = "X-MV-OTA-Password";
  else doc["authHeader"] = nullptr;
  mvOtaAppendStatus(doc.as<JsonObject>());
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, 200, "application/json", out);
}

bool mvOtaHandleHttpFirmwarePost(Stream& client, const String& headerBlock, size_t contentLength) {
  String pwd = mvHttpHeader(headerBlock, "X-MV-OTA-Password");
  if (!mvOtaCheckAuth(pwd.c_str())) {
    mvOtaAbortFlash();
    mvHttpSendResponseCStr(client, 401, "application/json", "{\"error\":\"unauthorized\"}");
    return false;
  }
  if (!mvOtaBeginFlash(contentLength)) {
    mvHttpSendResponseCStr(client, 500, "application/json", "{\"error\":\"ota begin failed\"}");
    return false;
  }
  uint8_t buf[512];
  size_t remaining = contentLength;
  while (remaining > 0) {
    size_t chunk = remaining > sizeof(buf) ? sizeof(buf) : remaining;
    if (!mvHttpReadBytes(client, buf, chunk) || !mvOtaWriteFlash(buf, chunk)) {
      mvOtaAbortFlash();
      mvHttpSendResponseCStr(client, 500, "application/json", "{\"error\":\"ota write failed\"}");
      return false;
    }
    remaining -= chunk;
  }
  if (!mvOtaEndFlash()) {
    mvHttpSendResponseCStr(client, 500, "application/json", "{\"error\":\"ota finalize failed\"}");
    return false;
  }
  StaticJsonDocument<256> doc;
  doc["ok"] = true;
  doc["bytesWritten"] = mvOtaInfo().bytesWritten;
  doc["reboot"] = true;
  String out;
  serializeJson(doc, out);
  mvHttpSendResponse(client, 200, "application/json", out);
  delay(300);
  mvOtaRebootAfterFlash();
  return true;
}

void mvOtaRegisterHttpRoutes() {
  mvHttpAddRoute("GET", "/api/ota", handleOtaInfoHttp);
}

#else

void mvOtaRegisterHttpRoutes() {}

bool mvOtaHandleHttpFirmwarePost(Stream&, const String&, size_t) {
  return false;
}

#endif
