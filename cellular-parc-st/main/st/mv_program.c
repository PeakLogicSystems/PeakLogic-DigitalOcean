#include "mv_program.h"
#include "mv_bc.h"
#include "mv_base64.h"
#include "mv_tags.h"
#include "mv_config.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_spiffs.h"
#include "nvs.h"

static const char *TAG = "mv_program";

static char g_progErr[128];
static char g_programName[64];
static bool g_hasProgram = false;
static bool g_fromNv = false;
static bool g_autoRunOnBoot = false;
static uint8_t g_bcDecode[MV_BC_MAX];
static bool g_spiffs_ok = false;

static bool g_runtimeRunning = false;
static uint32_t g_scanMs = MV_SCAN_MS_DEFAULT;
static uint32_t g_cycles = 0;
static uint32_t g_lastCycleUs = 0;

#define PROG_NVS_NS "parc_prog"
#define PROG_PATH "/spiffs/mv_program.bin"

typedef struct __attribute__((packed)) {
    char magic[4]; /* MVPG */
    uint16_t crc;
    uint16_t nameLen;
    uint32_t bcLen;
    uint8_t autoRun;
    uint8_t reserved[3];
} MvProgHeader;

static bool spiffs_ensure(void)
{
    if (g_spiffs_ok) {
        return true;
    }
    esp_vfs_spiffs_conf_t conf = {
        .base_path = "/spiffs",
        .partition_label = "storage",
        .max_files = 4,
        .format_if_mount_failed = true,
    };
    esp_err_t err = esp_vfs_spiffs_register(&conf);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "SPIFFS mount failed: %s", esp_err_to_name(err));
        return false;
    }
    g_spiffs_ok = true;
    return true;
}

static void autorun_nvs_load(void)
{
    nvs_handle_t h;
    if (nvs_open(PROG_NVS_NS, NVS_READONLY, &h) != ESP_OK) {
        return;
    }
    uint8_t ar = 0;
    if (nvs_get_u8(h, "autorun", &ar) == ESP_OK) {
        g_autoRunOnBoot = ar != 0;
    }
    nvs_close(h);
}

static void autorun_nvs_save(void)
{
    nvs_handle_t h;
    if (nvs_open(PROG_NVS_NS, NVS_READWRITE, &h) != ESP_OK) {
        return;
    }
    nvs_set_u8(h, "autorun", g_autoRunOnBoot ? 1 : 0);
    nvs_commit(h);
    nvs_close(h);
}

void mvOneShotReset(void)
{
    mvBcOneShotReset();
}

const char *mvLastProgramError(void)
{
    return g_progErr;
}

const char *mvProgramName(void)
{
    return g_programName;
}

bool mvProgramFromNv(void)
{
    return g_fromNv;
}

bool mvAutoRunOnBoot(void)
{
    return g_autoRunOnBoot;
}

void mvSetAutoRunOnBoot(bool on)
{
    g_autoRunOnBoot = on;
    autorun_nvs_save();
}

bool mvProgramClear(void)
{
    g_hasProgram = false;
    g_fromNv = false;
    g_progErr[0] = 0;
    g_programName[0] = 0;
    mvBcClear();
    return true;
}

bool mvProgramLoadBcRaw(const uint8_t *bc, size_t bc_len, const char *program_name, char *err,
                        size_t err_len)
{
    g_progErr[0] = 0;
    g_programName[0] = '\0';
    if (program_name && program_name[0]) {
        strncpy(g_programName, program_name, sizeof(g_programName) - 1);
    }
    if (!bc || !bc_len) {
        strncpy(g_progErr, "missing bc", sizeof(g_progErr) - 1);
        if (err && err_len) {
            strncpy(err, g_progErr, err_len - 1);
        }
        return false;
    }
    if (!mvBcLoad(bc, bc_len, g_progErr, sizeof(g_progErr))) {
        if (err && err_len) {
            strncpy(err, g_progErr, err_len - 1);
            err[err_len - 1] = '\0';
        }
        return false;
    }
    g_hasProgram = true;
    return true;
}

bool mvProgramLoadBcB64(const char *bc_b64, const char *program_name, int protocol_version,
                        char *err, size_t err_len)
{
    g_progErr[0] = 0;
    g_programName[0] = '\0';
    g_fromNv = false;
    if (program_name && program_name[0]) {
        strncpy(g_programName, program_name, sizeof(g_programName) - 1);
    }
    if (protocol_version > 0 && protocol_version != MV_PROTOCOL_VERSION) {
        snprintf(g_progErr, sizeof(g_progErr), "protocol version mismatch (device=%d client=%d)",
                 MV_PROTOCOL_VERSION, protocol_version);
        if (err && err_len) {
            strncpy(err, g_progErr, err_len - 1);
            err[err_len - 1] = '\0';
        }
        return false;
    }
    if (!bc_b64 || !bc_b64[0]) {
        strncpy(g_progErr, "missing bc", sizeof(g_progErr) - 1);
        if (err && err_len) {
            strncpy(err, g_progErr, err_len - 1);
        }
        return false;
    }
    const size_t decoded = mvBase64Decode(bc_b64, g_bcDecode, sizeof(g_bcDecode));
    if (!decoded) {
        strncpy(g_progErr, "bc decode failed", sizeof(g_progErr) - 1);
        if (err && err_len) {
            strncpy(err, g_progErr, err_len - 1);
        }
        return false;
    }
    if (!mvProgramLoadBcRaw(g_bcDecode, decoded, program_name, err, err_len)) {
        return false;
    }
    /* Persist for power-cycle parity with Opta QSPI */
    mvProgramNvSave(g_autoRunOnBoot);
    return true;
}

bool mvProgramNvSave(bool auto_run_on_boot)
{
    if (!mvProgramValid()) {
        return false;
    }
    if (!spiffs_ensure()) {
        return false;
    }
    const uint8_t *raw = mvBcRawData();
    const size_t bc_len = mvBcBytes();
    if (!raw || !bc_len) {
        return false;
    }
    g_autoRunOnBoot = auto_run_on_boot;
    autorun_nvs_save();

    MvProgHeader hdr = { 0 };
    memcpy(hdr.magic, "MVPG", 4);
    hdr.crc = mvBcDeployCrc();
    hdr.nameLen = (uint16_t)strnlen(g_programName, sizeof(g_programName) - 1);
    hdr.bcLen = (uint32_t)bc_len;
    hdr.autoRun = auto_run_on_boot ? 1 : 0;

    FILE *f = fopen(PROG_PATH, "wb");
    if (!f) {
        ESP_LOGW(TAG, "NV save open failed");
        return false;
    }
    bool ok = fwrite(&hdr, 1, sizeof(hdr), f) == sizeof(hdr);
    if (ok && hdr.nameLen) {
        ok = fwrite(g_programName, 1, hdr.nameLen, f) == hdr.nameLen;
    }
    if (ok) {
        ok = fwrite(raw, 1, bc_len, f) == bc_len;
    }
    fclose(f);
    if (ok) {
        g_fromNv = true;
        ESP_LOGI(TAG, "NV program saved crc=%u bytes=%u", (unsigned)hdr.crc, (unsigned)bc_len);
    }
    return ok;
}

bool mvProgramNvLoad(void)
{
    autorun_nvs_load();
    if (!spiffs_ensure()) {
        return false;
    }
    FILE *f = fopen(PROG_PATH, "rb");
    if (!f) {
        return false;
    }
    MvProgHeader hdr;
    if (fread(&hdr, 1, sizeof(hdr), f) != sizeof(hdr) || memcmp(hdr.magic, "MVPG", 4) != 0) {
        fclose(f);
        return false;
    }
    if (hdr.bcLen == 0 || hdr.bcLen > MV_BC_MAX || hdr.nameLen >= sizeof(g_programName)) {
        fclose(f);
        return false;
    }
    char name[64] = { 0 };
    if (hdr.nameLen && fread(name, 1, hdr.nameLen, f) != hdr.nameLen) {
        fclose(f);
        return false;
    }
    if (fread(g_bcDecode, 1, hdr.bcLen, f) != hdr.bcLen) {
        fclose(f);
        return false;
    }
    fclose(f);
    char err[128];
    if (!mvProgramLoadBcRaw(g_bcDecode, hdr.bcLen, name, err, sizeof(err))) {
        ESP_LOGW(TAG, "NV load reject: %s", err);
        return false;
    }
    if (mvBcDeployCrc() != hdr.crc) {
        ESP_LOGW(TAG, "NV CRC mismatch stored=%u got=%u", (unsigned)hdr.crc,
                 (unsigned)mvBcDeployCrc());
    }
    g_fromNv = true;
    g_autoRunOnBoot = hdr.autoRun != 0 || g_autoRunOnBoot;
    ESP_LOGI(TAG, "NV program loaded name=%s crc=%u", g_programName, (unsigned)hdr.crc);
    return true;
}

bool mvProgramNvClear(void)
{
    mvProgramClear();
    if (spiffs_ensure()) {
        remove(PROG_PATH);
    }
    g_autoRunOnBoot = false;
    autorun_nvs_save();
    return true;
}

bool mvProgramValid(void)
{
    return g_hasProgram && mvBcHasProgram();
}

void mvExecuteScan(uint32_t dt_ms)
{
    mvReadPhysicalInputs();
    if (g_hasProgram) {
        mvBcRunProgram();
    }
    mvUpdateTimers(dt_ms);
    mvUpdateCounters();
    mvUpdateFlowMeters();
    mvUpdatePids(dt_ms);
    mvUpdateAverages();
    mvUpdateAlternators();
    mvWritePhysicalOutputs();
    g_cycles++;
    g_lastCycleUs = dt_ms * 1000;
}

void mvExecuteIoScan(void)
{
    mvReadPhysicalInputs();
    mvWritePhysicalOutputs();
    g_cycles++;
}

bool mvRuntimeIsRunning(void)
{
    return g_runtimeRunning;
}
void mvRuntimeSetRunning(bool on)
{
    g_runtimeRunning = on;
}
uint32_t mvRuntimeScanMs(void)
{
    return g_scanMs;
}
void mvRuntimeSetScanMs(uint32_t ms)
{
    if (ms >= 10 && ms <= 60000) {
        g_scanMs = ms;
    }
}
uint32_t mvRuntimeCycles(void)
{
    return g_cycles;
}
uint32_t mvRuntimeLastCycleUs(void)
{
    return g_lastCycleUs;
}
