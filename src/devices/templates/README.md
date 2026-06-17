# Device templates (JSON)

Add a new Modbus device template by creating a `.json` file in this folder. MooreVIEW picks up `*.json` files automatically (no server restart) and lists them under **Drivers → Device template** on the next dashboard poll.

## Example

Copy `opta_rtu_slave.json` or `datexel_dat10148.json` and edit:

| Field | Meaning |
|-------|---------|
| `id` | Unique preset id (used by API) |
| `label` | Text shown in the dropdown |
| `transport` | `modbus_rtu` or `modbus_tcp` |
| `driverId` | Default driver id on apply — use the **same** id in several templates (e.g. `modbus_rtu`) so they share one bus connection; edit a driver in **Drivers** before Apply to target a different id |
| `sharedBus` | `false` for dedicated instruments (`tags.explicit` only) — creates/uses `driverId` instead of merging onto the first Modbus driver of the same transport |
| `defaults` | Serial port, baud, slave ID, parity |
| `tags.discrete` | BOOL inputs — FC02, `prefix` + number |
| `tags.coil` | BOOL outputs — FC01/05 |
| `tags.input` | INT inputs — FC04 (`start`, `suffix` optional) |
| `tags.holding` | INT memory — FC03 (`H1`… style) |
| `tags.explicit` | Named tags with exact Modbus address (REAL float32, status words, etc.) |

## Blocks

Each array entry:

```json
{ "prefix": "DI", "count": 8, "start": 0, "suffix": "" }
```

- `start` — 0-based Modbus address (default 0)
- `suffix` — appended to tag id (e.g. `_RAW`, `_MV`)

After saving the JSON file, open **Drivers** (or wait for the next poll) — the new template appears in the dropdown.

**Shared Modbus bus:** use the same `driverId` / COM port for several templates (live reload, no restart). Each apply assigns the **next slave address**. Tag names continue sequentially (`DI1`–`DI16`, then `DI17`–`DI32` for a second 16-input module); slave is stored per tag, not in the name.

## S::CAN spectro::lyser

| Template | Transport | Default comm |
|----------|-----------|--------------|
| `scan_spectrolyser.json` | RS-485 Modbus RTU | 38400 8O1, slave **4** |
| `scan_spectrolyser_tcp.json` | Modbus TCP (con::nect / gateway) | host :502, slave **4** |

Register map follows community spectro::lyser mapping (EnviroDIY S-CAN-Modbus): input registers **120** device status, **122+8×n** parameter values as **float32** (`PARM1_VAL`…`PARM8_VAL`). Probe must be in **logging mode** for live values when connected directly (not via ana::gate).

Explicit tag example:

```json
{
  "id": "PARM1_VAL",
  "type": "REAL",
  "table": "input",
  "address": 122,
  "wordWidth": 32,
  "encoding": "float32",
  "byteOrder": "BE"
}
```
