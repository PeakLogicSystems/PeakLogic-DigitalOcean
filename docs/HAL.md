# PeakLogic HAL — built-in I/O driver

The **`hal`** driver exposes on-board digital, analog, and hardware counter I/O through a small hardware abstraction layer. Use it on embedded Linux (with a board plugin) or everywhere in **`sim`** mode for development.

## Driver type

```json
{
  "id": "hal0",
  "type": "hal",
  "enabled": true,
  "backend": "sim",
  "limits": { "di": 16, "do": 16, "ai": 8, "ao": 4, "cnt": 4 },
  "counterBindings": {
    "0": { "pulseDi": "DI0" },
    "1": { "pulseDi": "DI1" }
  },
  "simValues": { "AI0": 1000 }
}
```

| Field | Purpose |
|-------|---------|
| `backend` | `sim` (default) or `native` / `plugin` (Linux `.so`) |
| `pluginPath` | Path to `libmyboard_hal.so` when `backend` is `native` |
| `limits` | Max channels per kind |
| `counterBindings` | Sim backend: increment `CNTn` on rising edge of `DIx` |
| `simValues` | Initial/simulated pin values (`DI0`, `AI1`, …) |

## Tag addressing

Use `driverAddress.pin`:

| Pin | Role | Tag type |
|-----|------|----------|
| `DI0`–`DI31` | Digital input | `BOOL` input |
| `DO0`–`DO31` | Digital output | `BOOL` output |
| `AI0`–`AI15` | Analog input | `INT` / `REAL` input |
| `AO0`–`AO7` | Analog output | `INT` / `REAL` output |
| `CNT0`–`CNT7` | Hardware counter | `INT` (`field: count`) or `REAL` (`field: freq`) |

Alternative: `{ "kind": "di", "index": 0 }`.

## Device presets

- **Built-in HAL (sim)** — 8 DI, 8 DO, 4 AI, 2 AO, 2 HW counters with DI0/DI1 pulse bindings
- **Built-in HAL (Linux plugin)** — same tag map, `backend: native`

Apply from **Drivers → device preset** in MVP Suite or ST MVP GUI.

## Board plugin (system developers)

Implement `native/hal_plugin.h` in a shared library:

```c
int peaklogic_hal_init(const char* config_json);
void peaklogic_hal_shutdown(void);
int peaklogic_hal_read(enum peaklogic_hal_kind kind, int index, double* out);
int peaklogic_hal_write(enum peaklogic_hal_kind kind, int index, double value);
int peaklogic_hal_counter_read(int index, unsigned long long* count, double* freq_hz);
```

Examples:

| Board | Source | Build |
|-------|--------|-------|
| Desktop / stub | `hal/plugins/example_hal.c` | `make example` |
| **Raspberry Pi 4 + Sequent SM-I-001** | `hal/plugins/rpi4_sm_i001_hal.c` | `make sm_i001` |

See **`hal/plugins/README_SM-I-001.md`** for Pi setup, I2C, pin map, and driver JSON.

```bash
cd hal/plugins
make sm_i001
sudo make install-sm_i001   # → /usr/lib/libpeaklogic_hal_sm_i001.so
```

Apply preset **Raspberry Pi 4 + Sequent SM-I-001 (HAL plugin)** or set `pluginPath` and `halConfig: { "stack": 0, "i2cBus": 1 }`.

Build the Node addon on Linux:

```bash
npm run build-native
```

## API

`GET /api/hal/status` — HAL driver health, backend snapshot, `nativeAvailable`.

## vs ST COUNTER tags

HAL **`CNT`** channels are **hardware pulse counters** (encoders, meter pulses). ST **`COUNTER`** function-block tags (`CTR*`) are soft counters in the PLC program — both can coexist.
