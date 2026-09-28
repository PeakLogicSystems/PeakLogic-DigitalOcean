# PC test — Icon DO3500 ×2 + EZ Meter

PeakLogic plant-PC project for one USB-RS485 adapter polling:

| Slave | Device | Tags |
|------:|--------|------|
| 1 | Icon ProCon DO3500 / DO3000 | `DO1_MG_L`, `DO1_TEMP_C`, `DO1_MAIN_V`, `DO1_TEMP_V` |
| 2 | Icon ProCon DO3500 / DO3000 | `DO2_*` (same map) |
| 3 | EZ Meter RGB (Modbus) | `EZ_KWH_IMP`, `EZ_V_A`, `EZ_I_A`, `EZ_W_A`, `EZ_HZ_A`, `EZ_PF_A` |

## Open

**Project → Open project…** → `data/projects/pc_test_do_ezmeter.est.json`

Or **Drivers → Device template** → `PC test — Icon DO3500×2 + EZMeter` → set COM → **Apply**.

## Commissioning

1. Set both Icon probes to **9600, 8N1** (parity **none**) and addresses **1** and **2**.
2. EZ Meter Modbus at **9600** (part-number 10th char `2`), slave **3**, data base address **0**.
3. Drivers: enable `rs485_bus`, pick the USB COM port, **Start** runtime.

If Icon floats look scrambled, try `byteOrder` **LE** / word-swap on the DO tags. If EZ energy reads wrong by 100×, confirm display resolution vs scale `0.01` (raw units = 10 Wh).
