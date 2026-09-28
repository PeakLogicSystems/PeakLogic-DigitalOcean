'use strict';

/**
 * EZ Meter DDS-RGB 2.025 — Modbus holding register map (RGB firmware v1.600).
 * Data §9.2 (HR 40001+, offset 0) + control §9.1 (HR 41001+, offset 1010).
 * @see st/fixtures/dds-rgb-modbus-extract.txt
 */

const { explicitModbusTags } = require('../devices/tagBuilders');

/** @typedef {{ id: string, address: number, type?: string, wordWidth?: number, signed?: boolean, scale?: number, graphEnabled?: boolean, role?: string, comment: string }} RegSpec */

/** Metered values — HR 40001+ (offset from 40001). */
const DATA_REGISTERS = [
  { id: 'DDS_WH_A_IMP', address: 0, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40001 — Acc. Wh phase A import (×10 Wh)' },
  { id: 'DDS_WH_B_IMP', address: 2, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40003 — Acc. Wh phase B import' },
  { id: 'DDS_WH_C_IMP', address: 4, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40005 — Acc. Wh phase C import' },
  { id: 'DDS_WH_A_EXP', address: 8, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40009 — Acc. Wh phase A export' },
  { id: 'DDS_WH_B_EXP', address: 10, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40011 — Acc. Wh phase B export' },
  { id: 'DDS_WH_C_EXP', address: 12, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40013 — Acc. Wh phase C export' },
  { id: 'DDS_WH_SUM_IMP', address: 16, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40017 — Summed acc. Wh import' },
  { id: 'DDS_WH_SUM_EXP', address: 18, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40019 — Summed acc. Wh export' },
  { id: 'DDS_VAH_SUM_IMP', address: 20, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40021 — Summed acc. VAh import' },
  { id: 'DDS_VAH_SUM_EXP', address: 22, type: 'INT', wordWidth: 32, signed: false, scale: 10, graphEnabled: false, comment: 'HR 40023 — Summed acc. VAh export' },
  { id: 'DDS_V_A', address: 24, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40025 — Phase A voltage (V)' },
  { id: 'DDS_I_A', address: 25, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40026 — Phase A current (A)' },
  { id: 'DDS_W_A', address: 26, type: 'REAL', wordWidth: 32, signed: true, scale: 0.1, comment: 'HR 40027 — Phase A real power (W)' },
  { id: 'DDS_HZ_A', address: 28, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40029 — Phase A frequency (Hz)' },
  { id: 'DDS_PF_A', address: 29, type: 'REAL', signed: true, scale: 0.01, comment: 'HR 40030 — Phase A power factor' },
  { id: 'DDS_V_B', address: 30, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40031 — Phase B voltage (V)' },
  { id: 'DDS_I_B', address: 31, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40032 — Phase B current (A)' },
  { id: 'DDS_W_B', address: 32, type: 'REAL', wordWidth: 32, signed: true, scale: 0.1, comment: 'HR 40033 — Phase B real power (W)' },
  { id: 'DDS_HZ_B', address: 34, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40035 — Phase B frequency (Hz)' },
  { id: 'DDS_PF_B', address: 35, type: 'REAL', signed: true, scale: 0.01, comment: 'HR 40036 — Phase B power factor' },
  { id: 'DDS_V_C', address: 36, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40037 — Phase C voltage (V)' },
  { id: 'DDS_I_C', address: 37, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40038 — Phase C current (A)' },
  { id: 'DDS_W_C', address: 38, type: 'REAL', wordWidth: 32, signed: true, scale: 0.1, comment: 'HR 40039 — Phase C real power (W)' },
  { id: 'DDS_HZ_C', address: 40, type: 'REAL', signed: false, scale: 0.1, comment: 'HR 40041 — Phase C frequency (Hz)' },
  { id: 'DDS_PF_C', address: 41, type: 'REAL', signed: true, scale: 0.01, comment: 'HR 40042 — Phase C power factor' },
  { id: 'DDS_VA_A', address: 42, type: 'REAL', wordWidth: 32, signed: true, scale: 0.1, comment: 'HR 40043 — Phase A apparent power (VA)' },
  { id: 'DDS_VA_B', address: 44, type: 'REAL', wordWidth: 32, signed: true, scale: 0.1, comment: 'HR 40045 — Phase B apparent power (VA)' },
  { id: 'DDS_VA_C', address: 46, type: 'REAL', wordWidth: 32, signed: true, scale: 0.1, comment: 'HR 40047 — Phase C apparent power (VA)' },
];

/** Control / status — HR 41001+ (offset 1010 from data base 40001). Read-only in PeakLogic. */
const CONTROL_REGISTERS = [
  { id: 'DDS_CTL_PROT_LVL', address: 1010, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41011 — Protection level' },
  { id: 'DDS_CTL_SER_NO', address: 1011, type: 'INT', wordWidth: 32, signed: false, graphEnabled: false, role: 'input', comment: 'HR 41012 — Serial number (MS 3-byte SN + LSB ID)' },
  { id: 'DDS_CTL_DATA_BASE', address: 1013, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41014 — Modbus data register base (typically 0x03E8 → 40001)' },
  { id: 'DDS_CTL_CTL_BASE', address: 1014, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41015 — Modbus control register base (typically 0x03E8 → 41001)' },
  { id: 'DDS_CTL_COMM', address: 1015, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41016 — Comm settings (default 0x13 = 9600 8N1)' },
  { id: 'DDS_CTL_RESP_MS', address: 1016, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41017 — Response delay (ms)' },
  { id: 'DDS_CTL_MODEL_W1', address: 1017, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41018 — Model option bytes (word 1 of 5, ASCII)' },
  { id: 'DDS_CTL_MODEL_W2', address: 1018, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41019 — Model option bytes (word 2 of 5)' },
  { id: 'DDS_CTL_MODEL_W3', address: 1019, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41020 — Model option bytes (word 3 of 5)' },
  { id: 'DDS_CTL_MODEL_W4', address: 1020, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41021 — Model option bytes (word 4 of 5)' },
  { id: 'DDS_CTL_MODEL_W5', address: 1021, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41022 — Model option bytes (word 5 of 5)' },
  { id: 'DDS_CTL_CUST_W1', address: 1023, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41024 — Customer ID (word 1 of 10, ASCII)' },
  { id: 'DDS_CTL_CUST_W2', address: 1024, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41025 — Customer ID (word 2 of 10)' },
  { id: 'DDS_CTL_CUST_W3', address: 1025, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41026 — Customer ID (word 3 of 10)' },
  { id: 'DDS_CTL_CUST_W4', address: 1026, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41027 — Customer ID (word 4 of 10)' },
  { id: 'DDS_CTL_CUST_W5', address: 1027, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41028 — Customer ID (word 5 of 10)' },
  { id: 'DDS_CTL_CUST_W6', address: 1028, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41029 — Customer ID (word 6 of 10)' },
  { id: 'DDS_CTL_CUST_W7', address: 1029, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41030 — Customer ID (word 7 of 10)' },
  { id: 'DDS_CTL_CUST_W8', address: 1030, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41031 — Customer ID (word 8 of 10)' },
  { id: 'DDS_CTL_CUST_W9', address: 1031, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41032 — Customer ID (word 9 of 10)' },
  { id: 'DDS_CTL_CUST_W10', address: 1032, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41033 — Customer ID (word 10 of 10)' },
  { id: 'DDS_CTL_SIGNED_FMT', address: 1033, type: 'INT', signed: false, graphEnabled: false, role: 'input', comment: 'HR 41034 — Signed-integer format for avg power & PF (0=unsigned)' },
];

const ALL_REGISTERS = [...DATA_REGISTERS, ...CONTROL_REGISTERS];

function registerSpecsToExplicit(list) {
  return list.map((r) => ({
    id: r.id,
    type: r.type || 'INT',
    role: r.role || 'input',
    table: 'holding',
    address: r.address,
    wordWidth: r.wordWidth,
    signed: r.signed,
    scale: r.scale,
    graphEnabled: r.graphEnabled,
    comment: r.comment,
  }));
}

function buildEzMeterModbusTags(driverId = 'dds_rgb') {
  return explicitModbusTags(driverId, registerSpecsToExplicit(ALL_REGISTERS));
}

function buildEzMeterDriver(opts = {}) {
  return {
    id: opts.driverId || 'dds_rgb',
    type: 'modbus_rtu',
    enabled: opts.enabled !== false,
    serialPort: opts.serialPort || 'COM3',
    baud: opts.baud ?? 9600,
    slaveId: opts.slaveId ?? 1,
    parity: opts.parity || 'none',
    stopBits: opts.stopBits ?? 1,
    timeoutMs: opts.timeoutMs ?? 3000,
  };
}

function liveAnalogRegisterCount() {
  return DATA_REGISTERS.filter((r) => r.type === 'REAL' && r.graphEnabled !== false).length;
}

module.exports = {
  DATA_REGISTERS,
  CONTROL_REGISTERS,
  ALL_REGISTERS,
  buildEzMeterModbusTags,
  buildEzMeterDriver,
  liveAnalogRegisterCount,
  registerSpecsToExplicit,
};
