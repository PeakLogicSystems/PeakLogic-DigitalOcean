# PeakLogic BACnet/IP integration

PeakLogic includes a first-class **BACnet/IP** driver for edge appliances. Use it to read (and optionally write) BACnet points into the same tag database as Modbus, MQTT Parc, and cloud APIs — for proactive CMMS, PdM, and fleet views **alongside** an existing campus BMS.

## Deployment

| Mode | BACnet |
|------|--------|
| Appliance / cloud hub (3090) | **Yes** — UDP on site LAN |
| Cloud SaaS (3100) | **No** — field buses run on the edge appliance |

BACnet/IP requires UDP broadcast and subnet discovery. Run the driver on the appliance that sits on the BMS VLAN or a routed path to controllers.

## Quick start

1. **Drivers → Add** → type **`bacnet`**
2. Set **UDP port** (default `47808`), optional **bind interface**, **poll ms**
3. **Apply & save**
4. On the driver card: **Discover devices** (Who-Is / I-Am)
5. Enter **Host** + **Device inst** → **Browse & import tags**
6. Start runtime — tags poll on the scan interval

## Device builder (fleet profiles)

Use **Drivers → BACnet device builder** when you know the *point layout* but not how many devices exist on the LAN yet.

1. Add a **`bacnet`** driver and save.
2. Open **BACnet device builder** tab (or **Device builder…** on the driver card).
3. **Capture from sample** — browse one controller, then **Capture profile from browse** (creates reusable **slots** matched by object name or fixed instance).
4. Or **Load example profile** (`st/fixtures/bacnet-profiles.example.json` — VAV space temp / damper / heat).
5. Set **Tag prefix pattern** (default `{profileId}_{deviceInstance}`) so each discovered device gets unique tag ids.
6. Optional **Device name filter** (regex) limits Who-Is results (e.g. `(?i)vav`).
7. **Preview tags** — discover + browse + match without importing.
8. **Discover & import tags** — applies the profile to every matching device found on the LAN.

Profiles persist in `data/bacnet-profiles.json`. Slots can use **fixed** object instance (same map on every device) or **name** regex (match `Space Temp`, `Damper`, etc.).

## Driver settings

| Field | Purpose |
|-------|---------|
| Bind interface | Local NIC IP (blank = auto) |
| UDP port | Local BACnet port (default 47808) |
| Broadcast | Subnet broadcast (optional) |
| APDU timeout ms | Read/write timeout |
| Poll ms | Fieldbus throttle (0 = every scan) |
| Default host | Fallback IP when tags omit `host` |
| Allow writes | Enable `writeProperty` for output tags |
| Write priority | BACnet priority 1–16 (default 8) |

## Tag addressing

Each tag wired to BACnet uses `driverAddress`:

```json
{
  "host": "192.168.10.50",
  "deviceInstance": 1001,
  "objectType": "analogInput",
  "objectInstance": 1,
  "property": "presentValue"
}
```

| Field | Description |
|-------|-------------|
| `host` | Target device IP (or use driver **Default host**) |
| `deviceInstance` | BACnet device instance |
| `objectType` | e.g. `analogInput`, `binaryValue`, or numeric type id |
| `objectInstance` | Object instance number |
| `property` | Default `presentValue`; supports BACnet property names |

Suggested tag types: **BOOL** for binary objects, **INT** for multi-state, **REAL** for analog.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/drivers/bacnet/discover` | Who-Is scan (`driverId`, optional limits) |
| POST | `/api/drivers/bacnet/browse` | Read object-list + metadata (`host`, `deviceInstance`) |
| POST | `/api/drivers/bacnet/import-tags` | Merge browse points into tag store |
| POST | `/api/drivers/bacnet/load-example-tags` | Load `st/fixtures/tags.bacnet.json` for a driver |
| GET | `/api/drivers/bacnet/profiles` | List saved device profiles |
| PUT | `/api/drivers/bacnet/profiles` | Replace all profiles |
| POST | `/api/drivers/bacnet/profiles/save` | Upsert one profile |
| DELETE | `/api/drivers/bacnet/profiles/:id` | Delete profile |
| GET | `/api/drivers/bacnet/profiles/example` | Example VAV profile fixture |
| POST | `/api/drivers/bacnet/profiles/from-browse` | Build profile from browse points |
| POST | `/api/drivers/bacnet/profiles/preview` | Discover + preview tag materialization |
| POST | `/api/drivers/bacnet/profiles/apply` | Discover fleet + import tags |

## Coexistence with BMS

PeakLogic is **not** a BMS replacement. Typical use:

- Import **read-mostly** points (space temp, status, energy, critical alarms)
- Leave sequences, schedules, and compliance logic on the incumbent BMS
- Layer PeakLogic **CMMS**, **PdM**, and contractor fleet workflows on top

Keep **Allow writes** off until setpoint ownership is agreed with facilities/controls.

## Dependency

The driver uses [`node-bacnet`](https://www.npmjs.com/package/node-bacnet) (pure JavaScript BACnet/IP stack). MS/TP serial BACnet is not included in v1 — use an IP gateway or BACnet-to-Modbus bridge if needed.
