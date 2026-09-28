/*
 * Sequent SM-I-010 (4relind) I2C driver for ESP-IDF.
 * SPDX-License-Identifier: Apache-2.0
 */
#include "sm_i010.h"

#include <string.h>

#include "driver/i2c.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "sm_i010";

/* IO-expander (older / PCA-style) registers */
#define RELAY4_INPORT_REG  0x00
#define RELAY4_OUTPORT_REG 0x01
#define RELAY4_CFG_REG     0x03

/* CPU card (v4+) memory map */
#define I2C_MEM_RELAY_VAL  0x00
#define I2C_MEM_AC_IN      0x04

#define DEVICE_ADDRESS_BASE     0x38
#define ALTERNATE_ADDRESS_BASE  0x20
#define CPU_ADDRESS_BASE        0x0e

static const uint8_t RELAY_MASK[4] = { 0x80, 0x40, 0x20, 0x10 };
static const uint8_t OPTO_MASK[4] = { 0x08, 0x04, 0x02, 0x01 };

static int s_port = -1;
static uint8_t s_addr;
static sm_i010_kind_t s_kind = SM_I010_KIND_NONE;
static bool s_present;
static uint8_t s_opto_mask;  /* bit0 = ch0 */
static uint8_t s_relay_mask; /* bit0 = ch0 */
static uint8_t s_out_raw;    /* last IO-exp output byte */

static uint8_t relay_to_io(uint8_t relay_bits)
{
    uint8_t val = 0;
    for (int i = 0; i < 4; i++) {
        if (relay_bits & (1u << i)) {
            val |= RELAY_MASK[i];
        }
    }
    return val;
}

static uint8_t io_to_relay(uint8_t iov)
{
    uint8_t val = 0;
    for (int i = 0; i < 4; i++) {
        if (iov & RELAY_MASK[i]) {
            val |= (1u << i);
        }
    }
    return val;
}

static uint8_t io_to_opto(uint8_t iov)
{
    /* Opto active-low on IO expander: bit clear means ON */
    uint8_t val = 0;
    for (int i = 0; i < 4; i++) {
        if ((iov & OPTO_MASK[i]) == 0) {
            val |= (1u << i);
        }
    }
    return val;
}

static esp_err_t i2c_wr(uint8_t reg, uint8_t val)
{
    uint8_t buf[2] = { reg, val };
    return i2c_master_write_to_device(s_port, s_addr, buf, 2, pdMS_TO_TICKS(50));
}

static esp_err_t i2c_rd(uint8_t reg, uint8_t *val)
{
    return i2c_master_write_read_device(s_port, s_addr, &reg, 1, val, 1, pdMS_TO_TICKS(50));
}

static bool probe_addr(uint8_t addr, sm_i010_kind_t *out_kind)
{
    uint8_t cfg = 0;
    uint8_t cfg_reg = RELAY4_CFG_REG;
    esp_err_t err = i2c_master_write_read_device(s_port, addr, &cfg_reg, 1, &cfg, 1, pdMS_TO_TICKS(30));
    if (err != ESP_OK) {
        uint8_t dummy = 0;
        uint8_t mem = I2C_MEM_RELAY_VAL;
        err = i2c_master_write_read_device(s_port, addr, &mem, 1, &dummy, 1, pdMS_TO_TICKS(30));
        if (err != ESP_OK) {
            return false;
        }
        if (addr >= CPU_ADDRESS_BASE && addr < CPU_ADDRESS_BASE + 8) {
            *out_kind = SM_I010_KIND_CPU;
            return true;
        }
        return false;
    }

    if (addr >= CPU_ADDRESS_BASE && addr < CPU_ADDRESS_BASE + 8) {
        *out_kind = SM_I010_KIND_CPU;
        return true;
    }

    *out_kind = SM_I010_KIND_IOEXP;
    if (cfg != 0x0f) {
        uint8_t cfg_buf[2] = { RELAY4_CFG_REG, 0x0f };
        uint8_t out_buf[2] = { RELAY4_OUTPORT_REG, 0x00 };
        i2c_master_write_to_device(s_port, addr, cfg_buf, 2, pdMS_TO_TICKS(50));
        i2c_master_write_to_device(s_port, addr, out_buf, 2, pdMS_TO_TICKS(50));
    }
    return true;
}

bool sm_i010_init(int i2c_port, int sda_gpio, int scl_gpio, int stack_level)
{
    s_present = false;
    s_kind = SM_I010_KIND_NONE;
    s_opto_mask = 0;
    s_relay_mask = 0;
    s_out_raw = 0;

    if (stack_level < 0 || stack_level > 7) {
        ESP_LOGE(TAG, "invalid stack %d", stack_level);
        return false;
    }

    s_port = i2c_port;
    i2c_config_t conf = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = sda_gpio,
        .scl_io_num = scl_gpio,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = 100000,
    };
    esp_err_t err = i2c_param_config(s_port, &conf);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_param_config: %s", esp_err_to_name(err));
        return false;
    }
    err = i2c_driver_install(s_port, conf.mode, 0, 0, 0);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "i2c_driver_install: %s", esp_err_to_name(err));
        return false;
    }

    /* Address decode matches Sequent lib4relind __ident() */
    const int st = stack_level;
    const int stack_xor = 0x07 ^ st;
    const uint8_t candidates[3] = {
        (uint8_t)(DEVICE_ADDRESS_BASE + stack_xor),
        (uint8_t)(ALTERNATE_ADDRESS_BASE + stack_xor),
        (uint8_t)(CPU_ADDRESS_BASE + st),
    };

    for (int i = 0; i < 3; i++) {
        sm_i010_kind_t kind = SM_I010_KIND_NONE;
        if (probe_addr(candidates[i], &kind)) {
            s_addr = candidates[i];
            s_kind = kind;
            s_present = true;
            ESP_LOGI(TAG, "SM-I-010 found @ 0x%02x kind=%s stack=%d", s_addr,
                     kind == SM_I010_KIND_CPU ? "cpu" : "ioexp", stack_level);
            sm_i010_poll();
            return true;
        }
    }

    ESP_LOGW(TAG, "SM-I-010 not found (SDA=%d SCL=%d stack=%d)", sda_gpio, scl_gpio, stack_level);
    return false;
}

bool sm_i010_present(void)
{
    return s_present;
}

sm_i010_kind_t sm_i010_kind(void)
{
    return s_kind;
}

uint8_t sm_i010_addr(void)
{
    return s_addr;
}

bool sm_i010_poll(void)
{
    if (!s_present) {
        return false;
    }

    if (s_kind == SM_I010_KIND_CPU) {
        uint8_t relays = 0;
        uint8_t optos = 0;
        if (i2c_rd(I2C_MEM_RELAY_VAL, &relays) != ESP_OK) {
            return false;
        }
        if (i2c_rd(I2C_MEM_AC_IN, &optos) != ESP_OK) {
            return false;
        }
        s_relay_mask = relays & 0x0f;
        s_opto_mask = optos & 0x0f;
        return true;
    }

    uint8_t inport = 0;
    if (i2c_rd(RELAY4_INPORT_REG, &inport) != ESP_OK) {
        return false;
    }
    s_opto_mask = io_to_opto(inport);
    s_relay_mask = io_to_relay(s_out_raw);
    return true;
}

bool sm_i010_read_opto(uint8_t channel)
{
    if (channel >= 4) {
        return false;
    }
    return (s_opto_mask & (1u << channel)) != 0;
}

bool sm_i010_read_relay(uint8_t channel)
{
    if (channel >= 4) {
        return false;
    }
    return (s_relay_mask & (1u << channel)) != 0;
}

bool sm_i010_write_relay(uint8_t channel, bool on)
{
    if (!s_present || channel >= 4) {
        return false;
    }
    uint8_t mask = s_relay_mask;
    if (on) {
        mask |= (1u << channel);
    } else {
        mask &= (uint8_t) ~(1u << channel);
    }
    return sm_i010_write_relays_all(mask);
}

bool sm_i010_write_relays_all(uint8_t mask)
{
    if (!s_present) {
        return false;
    }
    mask &= 0x0f;
    esp_err_t err;
    if (s_kind == SM_I010_KIND_CPU) {
        err = i2c_wr(I2C_MEM_RELAY_VAL, mask);
    } else {
        s_out_raw = relay_to_io(mask);
        err = i2c_wr(RELAY4_OUTPORT_REG, s_out_raw);
    }
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "relay write failed: %s", esp_err_to_name(err));
        return false;
    }
    s_relay_mask = mask;
    return true;
}
