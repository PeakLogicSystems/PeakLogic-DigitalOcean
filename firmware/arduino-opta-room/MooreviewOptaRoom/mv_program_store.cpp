#include "mv_program_store.h"
#include "mv_bc.h"
#include "mv_config.h"
#include "mv_debug.h"
#include "mv_st.h"
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
#include "mv_http.h"
#endif
#include <stdio.h>
#include <string.h>

#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && defined(__has_include)
#if __has_include(<BlockDevice.h>)
#define MV_HAS_PROG_QSPI 1
#include <BlockDevice.h>
#include <MBRBlockDevice.h>
#include <FATFileSystem.h>
#endif
#endif

static const char* MV_PROG_NV_PATH = "/fs/mv_program.bin";

#if defined(ARDUINO_OPTA) && __has_include(<kvstore_global_api.h>)
#include <kvstore_global_api.h>
#define MV_HAS_KV 1
static const char* MV_KV_AUTORUN = "/kv/mv_autorun";
#endif

#pragma pack(push, 1)
struct MvProgramNvHeader {
  uint32_t magic;
  uint16_t version;
  uint16_t hdrCrc;
  char programName[64];
  uint16_t tracePointCount;
  uint8_t autoRunOnBoot;
  uint8_t reserved;
  uint32_t bcLen;
  uint32_t bcCrc;
};
#pragma pack(pop)

static uint16_t mvProgCrc16(const uint8_t* p, size_t n) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t b = 0; b < 8; b++) {
      crc = (crc & 1) ? (uint16_t)((crc >> 1) ^ 0xA001) : (uint16_t)(crc >> 1);
    }
  }
  return crc;
}

static uint16_t mvProgHdrCrc(const MvProgramNvHeader* hdr) {
  const uint8_t* p = (const uint8_t*)hdr;
  const size_t off = offsetof(MvProgramNvHeader, hdrCrc) + sizeof(hdr->hdrCrc);
  return mvProgCrc16(p + off, sizeof(MvProgramNvHeader) - off);
}

static bool headerValid(const MvProgramNvHeader* hdr);

#if defined(MV_HAS_PROG_QSPI)
static mbed::BlockDevice* g_bdRaw = nullptr;
static mbed::MBRBlockDevice* g_bdQspi = nullptr;
static mbed::FATFileSystem* g_fsQspi = nullptr;
static bool g_qspiReady = false;

static bool mountProgQspi() {
  if (g_fsQspi) return true;
  g_bdRaw = mbed::BlockDevice::get_default_instance();
  if (!g_bdRaw || g_bdRaw->init() != 0) return false;
  g_bdQspi = new mbed::MBRBlockDevice(g_bdRaw, MV_OTA_QSPI_OFFSET);
  g_fsQspi = new mbed::FATFileSystem("fs");
  if (g_fsQspi->mount(g_bdQspi) != 0) return false;
  return true;
}
#endif

static bool g_autoRun = false;
static bool g_fromNv = false;
static uint32_t g_bcCrc = 0;

enum SavePhase : uint8_t {
  SAVE_IDLE = 0,
  SAVE_OPEN,
  SAVE_WRITE,
  SAVE_DONE,
};

static SavePhase s_savePhase = SAVE_IDLE;
static FILE* s_saveFile = nullptr;
static MvProgramNvHeader s_saveHdr;
static size_t s_saveBcOff = 0;
static char s_saveErr[96];

enum BootLoadPhase : uint8_t {
  BOOT_LOAD_IDLE = 0,
  BOOT_LOAD_MOUNT,
  BOOT_LOAD_OPEN,
  BOOT_LOAD_HDR,
  BOOT_LOAD_BC,
  BOOT_LOAD_APPLY,
};

static BootLoadPhase s_bootLoadPhase = BOOT_LOAD_IDLE;
static FILE* s_bootLoadFile = nullptr;
static MvProgramNvHeader s_bootLoadHdr;
static size_t s_bootLoadBcGot = 0;
static MvBcLoadCtx s_bootLoadBcCtx;
static bool s_bootLoadBcStarted = false;
static char s_bootLoadErr[96];

static void progStoreYield() {
#if (defined(ARDUINO_PORTENTA_H7_M7) || defined(ARDUINO_OPTA)) && MV_HAS_WEBSERVER
  mvHttpHandleClients();
  mvHttpHandleClients();
#endif
}

static bool kvLoadAutoRun() {
#ifdef MV_HAS_KV
  uint8_t v = 0;
  size_t actual = 0;
  if (kv_get(MV_KV_AUTORUN, &v, sizeof(v), &actual) == 0 && actual == sizeof(v)) {
    g_autoRun = v != 0;
    return true;
  }
#endif
  return false;
}

static bool kvSaveAutoRun() {
#ifdef MV_HAS_KV
  const uint8_t v = g_autoRun ? 1 : 0;
  return kv_set(MV_KV_AUTORUN, &v, sizeof(v), 0) == 0;
#else
  return true;
#endif
}

void mvProgramStoreBegin() {
  kvLoadAutoRun();
}

void mvProgramStoreRequestBootLoad() {
#if defined(MV_HAS_PROG_QSPI)
  if (s_bootLoadPhase == BOOT_LOAD_IDLE) {
    g_fromNv = false;
    g_bcCrc = 0;
    s_bootLoadErr[0] = '\0';
    s_bootLoadBcStarted = false;
    s_bootLoadPhase = BOOT_LOAD_MOUNT;
  }
#endif
}

bool mvProgramStoreLoadBusy() {
  return s_bootLoadPhase != BOOT_LOAD_IDLE;
}

bool mvProgramStoreLoadTick() {
#if !defined(MV_HAS_PROG_QSPI)
  return false;
#else
  if (s_bootLoadPhase == BOOT_LOAD_IDLE) return false;

  const unsigned long sliceStart = millis();
  const unsigned long sliceMs = 12;

  while (millis() - sliceStart < sliceMs) {
    switch (s_bootLoadPhase) {
      case BOOT_LOAD_MOUNT:
        g_qspiReady = mountProgQspi();
        if (!g_qspiReady) {
          MV_LOG("program NV: QSPI mount failed");
          s_bootLoadPhase = BOOT_LOAD_IDLE;
          return false;
        }
        s_bootLoadPhase = BOOT_LOAD_OPEN;
        break;
      case BOOT_LOAD_OPEN:
        s_bootLoadFile = fopen(MV_PROG_NV_PATH, "rb");
        if (!s_bootLoadFile) {
          s_bootLoadPhase = BOOT_LOAD_IDLE;
          return false;
        }
        s_bootLoadPhase = BOOT_LOAD_HDR;
        break;
      case BOOT_LOAD_HDR:
        if (fread(&s_bootLoadHdr, 1, sizeof(s_bootLoadHdr), s_bootLoadFile) != sizeof(s_bootLoadHdr)) {
          fclose(s_bootLoadFile);
          s_bootLoadFile = nullptr;
          s_bootLoadPhase = BOOT_LOAD_IDLE;
          return false;
        }
        if (!headerValid(&s_bootLoadHdr)) {
          fclose(s_bootLoadFile);
          s_bootLoadFile = nullptr;
          MV_LOG("program NV load: header invalid");
          s_bootLoadPhase = BOOT_LOAD_IDLE;
          return false;
        }
        s_bootLoadBcGot = 0;
        s_bootLoadPhase = BOOT_LOAD_BC;
        break;
      case BOOT_LOAD_BC: {
        uint8_t* const scratch = mvProgramScratchBuf();
        const size_t cap = mvProgramScratchCap();
        if (s_bootLoadHdr.bcLen > cap) {
          fclose(s_bootLoadFile);
          s_bootLoadFile = nullptr;
          MV_LOG("program NV load: program too large");
          s_bootLoadPhase = BOOT_LOAD_IDLE;
          return false;
        }
        while (s_bootLoadBcGot < s_bootLoadHdr.bcLen) {
          const size_t chunk = (s_bootLoadHdr.bcLen - s_bootLoadBcGot) > 512
            ? 512
            : (size_t)(s_bootLoadHdr.bcLen - s_bootLoadBcGot);
          if (fread(scratch + s_bootLoadBcGot, 1, chunk, s_bootLoadFile) != chunk) {
            fclose(s_bootLoadFile);
            s_bootLoadFile = nullptr;
            MV_LOG("program NV load: read failed");
            s_bootLoadPhase = BOOT_LOAD_IDLE;
            return false;
          }
          s_bootLoadBcGot += chunk;
          if (millis() - sliceStart >= sliceMs) {
            progStoreYield();
            return true;
          }
        }
        fclose(s_bootLoadFile);
        s_bootLoadFile = nullptr;
        const uint16_t bcCrc = mvProgCrc16(scratch, s_bootLoadHdr.bcLen);
        if ((uint32_t)bcCrc != s_bootLoadHdr.bcCrc) {
          MV_LOG("program NV load: CRC mismatch");
          s_bootLoadPhase = BOOT_LOAD_IDLE;
          return false;
        }
        s_bootLoadBcStarted = false;
        s_bootLoadPhase = BOOT_LOAD_APPLY;
        break;
      }
      case BOOT_LOAD_APPLY: {
        uint8_t* const scratch = mvProgramScratchBuf();
        if (!s_bootLoadBcStarted) {
          if (!mvBcLoadBegin(&s_bootLoadBcCtx, scratch, s_bootLoadHdr.bcLen, s_bootLoadErr, sizeof(s_bootLoadErr))) {
            MV_LOG2("program NV load: ", s_bootLoadErr);
            s_bootLoadPhase = BOOT_LOAD_IDLE;
            return false;
          }
          s_bootLoadBcStarted = true;
        }
        while (true) {
          const bool done = mvBcLoadStep(&s_bootLoadBcCtx, s_bootLoadErr, sizeof(s_bootLoadErr));
          if (s_bootLoadErr[0]) {
            MV_LOG2("program NV load: ", s_bootLoadErr);
            s_bootLoadPhase = BOOT_LOAD_IDLE;
            return false;
          }
          if (done) {
            if (!mvProgramCommitNvLoad(s_bootLoadHdr.programName, s_bootLoadHdr.tracePointCount)) {
              MV_LOG2("program NV load: ", mvLastProgramError());
              s_bootLoadPhase = BOOT_LOAD_IDLE;
              return false;
            }
            g_fromNv = true;
            g_bcCrc = s_bootLoadHdr.bcCrc;
            s_bootLoadPhase = BOOT_LOAD_IDLE;
            MV_LOG2("[MV] loaded program from NV: ", s_bootLoadHdr.programName);
            return true;
          }
          if (millis() - sliceStart >= sliceMs) {
            progStoreYield();
            return true;
          }
          progStoreYield();
        }
        break;
      }
      default:
        s_bootLoadPhase = BOOT_LOAD_IDLE;
        return false;
    }
    progStoreYield();
  }
  return true;
#endif
}

bool mvProgramStoreGetAutoRun() { return g_autoRun; }

bool mvProgramStoreSetAutoRun(bool enabled) {
  g_autoRun = enabled;
  return kvSaveAutoRun();
}

bool mvProgramStoreProgramFromNv() { return g_fromNv; }

uint32_t mvProgramStoreBcCrc() { return g_bcCrc; }

static bool headerValid(const MvProgramNvHeader* hdr) {
  if (!hdr || hdr->magic != MV_PROG_NV_MAGIC || hdr->version != MV_PROG_NV_VERSION) return false;
  if (hdr->hdrCrc != mvProgHdrCrc(hdr)) return false;
  if (!hdr->bcLen || hdr->bcLen > MV_BC_MAX) return false;
  return true;
}

bool mvProgramStoreLoadOnBoot(char* err, size_t errLen) {
  if (err && errLen) err[0] = '\0';
  g_fromNv = false;
  g_bcCrc = 0;
#if !defined(MV_HAS_PROG_QSPI)
  return false;
#else
  if (!g_qspiReady && !mountProgQspi()) {
    if (err && errLen) strncpy(err, "QSPI mount failed", errLen - 1);
    return false;
  }
  FILE* f = fopen(MV_PROG_NV_PATH, "rb");
  if (!f) return false;

  MvProgramNvHeader hdr;
  if (fread(&hdr, 1, sizeof(hdr), f) != sizeof(hdr)) {
    fclose(f);
    return false;
  }
  if (!headerValid(&hdr)) {
    fclose(f);
    if (err && errLen) strncpy(err, "NV header invalid", errLen - 1);
    return false;
  }

  uint8_t* const scratch = mvProgramScratchBuf();
  const size_t cap = mvProgramScratchCap();
  if (hdr.bcLen > cap) {
    fclose(f);
    if (err && errLen) strncpy(err, "NV program too large", errLen - 1);
    return false;
  }
  if (fread(scratch, 1, hdr.bcLen, f) != hdr.bcLen) {
    fclose(f);
    if (err && errLen) strncpy(err, "NV read failed", errLen - 1);
    return false;
  }
  fclose(f);

  const uint16_t bcCrc = mvProgCrc16(scratch, hdr.bcLen);
  if ((uint32_t)bcCrc != hdr.bcCrc) {
    if (err && errLen) strncpy(err, "NV CRC mismatch", errLen - 1);
    return false;
  }

  if (!mvProgramLoadFromNv(hdr.programName, hdr.tracePointCount, scratch, hdr.bcLen)) {
    if (err && errLen) {
      const char* pe = mvLastProgramError();
      strncpy(err, pe && pe[0] ? pe : "NV load failed", errLen - 1);
    }
    return false;
  }

  g_fromNv = true;
  g_bcCrc = hdr.bcCrc;
  MV_LOG2("[MV] loaded program from NV: ", hdr.programName);
  return true;
#endif
}

void mvProgramStoreQueueSave(const char* programName, uint16_t tracePointCount) {
#if !defined(MV_HAS_PROG_QSPI)
  (void)programName;
  (void)tracePointCount;
  return;
#else
  if (s_savePhase != SAVE_IDLE) return;
  const size_t bcLen = mvBcBytes();
  if (!bcLen || !mvBcHasProgram()) return;

  memset(&s_saveHdr, 0, sizeof(s_saveHdr));
  s_saveHdr.magic = MV_PROG_NV_MAGIC;
  s_saveHdr.version = MV_PROG_NV_VERSION;
  if (programName && programName[0]) {
    strncpy(s_saveHdr.programName, programName, sizeof(s_saveHdr.programName) - 1);
  }
  s_saveHdr.tracePointCount = tracePointCount;
  s_saveHdr.autoRunOnBoot = g_autoRun ? 1 : 0;
  s_saveHdr.bcLen = (uint32_t)bcLen;
  s_saveHdr.bcCrc = mvProgCrc16(mvBcRawData(), bcLen);
  s_saveHdr.hdrCrc = mvProgHdrCrc(&s_saveHdr);
  s_saveBcOff = 0;
  s_saveErr[0] = '\0';
  s_savePhase = SAVE_OPEN;
  g_fromNv = false;
  g_bcCrc = s_saveHdr.bcCrc;
#endif
}

bool mvProgramStoreSaveBusy() { return s_savePhase != SAVE_IDLE; }

bool mvProgramStoreSaveTick() {
#if !defined(MV_HAS_PROG_QSPI)
  return false;
#else
  if (s_savePhase == SAVE_IDLE) return false;
  if (!g_qspiReady && !mountProgQspi()) {
    s_savePhase = SAVE_IDLE;
    return false;
  }

  const unsigned long sliceStart = millis();
  const unsigned long sliceMs = 12;

  while (millis() - sliceStart < sliceMs) {
    switch (s_savePhase) {
      case SAVE_OPEN: {
        remove(MV_PROG_NV_PATH);
        s_saveFile = fopen(MV_PROG_NV_PATH, "wb");
        if (!s_saveFile) {
          MV_LOG("program NV save: open failed");
          s_savePhase = SAVE_IDLE;
          return false;
        }
        s_savePhase = SAVE_WRITE;
        s_saveBcOff = 0;
        break;
      }
      case SAVE_WRITE: {
        if (!s_saveFile) {
          s_savePhase = SAVE_IDLE;
          return false;
        }
        if (s_saveBcOff == 0) {
          if (fwrite(&s_saveHdr, 1, sizeof(s_saveHdr), s_saveFile) != sizeof(s_saveHdr)) {
            MV_LOG("program NV save: header write failed");
            fclose(s_saveFile);
            s_saveFile = nullptr;
            remove(MV_PROG_NV_PATH);
            s_savePhase = SAVE_IDLE;
            return false;
          }
        }
        const uint8_t* bc = mvBcRawData();
        const size_t bcLen = s_saveHdr.bcLen;
        while (s_saveBcOff < bcLen) {
          const size_t chunk = (bcLen - s_saveBcOff) > 512 ? 512 : (bcLen - s_saveBcOff);
          if (fwrite(bc + s_saveBcOff, 1, chunk, s_saveFile) != chunk) {
            MV_LOG("program NV save: data write failed");
            fclose(s_saveFile);
            s_saveFile = nullptr;
            remove(MV_PROG_NV_PATH);
            s_savePhase = SAVE_IDLE;
            return false;
          }
          s_saveBcOff += chunk;
          if (millis() - sliceStart >= sliceMs) {
            progStoreYield();
            return true;
          }
        }
        fclose(s_saveFile);
        s_saveFile = nullptr;
        s_savePhase = SAVE_IDLE;
        MV_LOG2("program NV saved bytes=", (int)bcLen);
        return true;
      }
      default:
        s_savePhase = SAVE_IDLE;
        return false;
    }
    progStoreYield();
  }
  return true;
#endif
}

bool mvProgramStoreClearNv() {
  g_fromNv = false;
  g_bcCrc = 0;
#if defined(MV_HAS_PROG_QSPI)
  if (!g_qspiReady && !mountProgQspi()) return true;
  remove(MV_PROG_NV_PATH);
#endif
  return true;
}

void mvProgramStoreAppendStatus(JsonObject root) {
  root["programFromNv"] = g_fromNv;
  root["autoRunOnBoot"] = g_autoRun;
  if (g_bcCrc) root["programNvCrc"] = g_bcCrc;
  root["programNvSaveBusy"] = s_savePhase != SAVE_IDLE;
  root["programNvLoadBusy"] = s_bootLoadPhase != BOOT_LOAD_IDLE;
}
