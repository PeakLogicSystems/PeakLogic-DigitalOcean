# NanoPi NEO CAT1 — production deployment runbook

Put a **PeakLogic Opta Parc** site into production using a **NanoPi NEO** + **NEO CAT1** LTE module as the transparent MQTT gateway.

| Doc | Use |
|-----|-----|
| **This runbook** | Bench → field → sign-off checklist |
| [NANOPI-OPTA-GATEWAY-MQTT.md](./NANOPI-OPTA-GATEWAY-MQTT.md) | MQTT settings (Opta + cloud) |
| [nanopi-opta-gateway.md](../../../docs/training/reference/hardware/nanopi-opta-gateway.md) | Architecture and hardware notes |

---

## What you are building

```
[ Arduino Opta ] ── Ethernet ──► [ NanoPi 192.168.1.1:1883 ]
                                       Mosquitto (LAN, no auth)
                                       bridge peaklogic/v1/#
                                       ▼
                              [ LTE → mqtt.peaklogic.io:8883 ]
                                       ▼
                              [ PeakLogic cloud Parc hub ]
```

- **Opta** runs ST + Parc firmware (`PeaklogicOptaMqttSt`) — no change to sketch logic; only broker IP/port.
- **NanoPi** runs FriendlyWrt + Mosquitto; cloud credentials live **only on the NanoPi**.

---

## 1. Bill of materials

| Qty | Item | Notes |
|-----|------|--------|
| 1 | NanoPi NEO (H3) | 512 MB RAM; one RJ45 |
| 1 | NEO CAT1 LTE module | Stacked on NEO; USB `19d1:0001` |
| 1 | microSD ≥ 8 GB | Class 10 |
| 1 | 5 V / **3 A** DC supply | Barrel or screw terminal — **not** weak USB |
| 1 | LTE antenna | MAIN port, tight |
| 1 | Nano SIM | **Data** plan activated |
| 1 | Arduino Opta | `PeaklogicOptaMqttSt` flashed |
| 1 | Ethernet cable | Opta ↔ NanoPi **eth0** (direct or via panel switch) |

Optional bench: USB-TTL serial (NanoPi debug header), office LAN cable for initial SSH.

---

## 2. Software versions (validated)

| Component | Version |
|-----------|---------|
| OS image | FriendlyElec **h3-sd-friendlywrt** (OpenWrt 19.07, kernel 4.14) |
| Setup script | `scripts/setup-nanopi-opta-gateway.sh` |
| Mosquitto | 1.6.15 (OpenWrt `mosquitto-ssl`) |
| Cloud broker | `mqtt.peaklogic.io:8883`, user `peaklogic` |

---

## 3. Bench provisioning (shop)

Complete these steps **before** shipping to site.

### 3.1 Flash SD card

**Windows (admin PowerShell):**

```powershell
# Image: FriendlyElec h3-sd-friendlywrt-4.14-armhf-*.img.gz
# Script: scripts/flash-sd-friendlywrt.ps1 (edit $diskNumber if needed)
powershell -ExecutionPolicy Bypass -File scripts\flash-sd-friendlywrt.ps1
```

Insert SD, connect **5 V / 3 A**, antenna, SIM. For first boot you may use **eth0 → office LAN** to find the device on DHCP.

### 3.2 Find the board on the office LAN

- UniFi / router client list, or
- SSH: `ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa root@<dhcp-ip>`  
  Default LuCI password: try empty, then `password`.

**Set a strong root password:**

```sh
passwd
```

### 3.3 Install gateway software

Copy `scripts/setup-nanopi-opta-gateway.sh` to `/root/` on the NanoPi, then:

```sh
sed -i 's/\r$//' /root/setup-nanopi-opta-gateway.sh
chmod +x /root/setup-nanopi-opta-gateway.sh
sh /root/setup-nanopi-opta-gateway.sh install-packages
```

Get cloud MQTT password from the droplet:

```bash
ssh mv-mqtt
sudo grep MOSQUITTO_PASS /etc/peaklogic/mqtt.env
```

On the NanoPi:

```sh
echo 'PASTE_MOSQUITTO_PASS_HERE' > /etc/mosquitto/cloud.pass
chmod 600 /etc/mosquitto/cloud.pass
sh /root/setup-nanopi-opta-gateway.sh configure
```

### 3.4 Bench tests (still on office LAN)

```sh
# Modem USB present
lsusb | grep 19d1

# Cellular interface (after rndis loads)
ip -4 addr show eth1
ping -c 2 -I eth1 8.8.8.8

# Mosquitto listening
netstat -ln | grep 1883

# Bridge local → cloud
sh /root/setup-nanopi-opta-gateway.sh status
```

Run the bridge test from [NANOPI-OPTA-GATEWAY-MQTT.md](./NANOPI-OPTA-GATEWAY-MQTT.md#verify-bridge). Expect **`ok`** on the cloud subscriber.

**Modem LEDs:** STS green solid; NET **not** slow 2 s search blink (registered/idle).

### 3.5 Label the unit

Record on site worksheet:

- NanoPi MAC / last bench DHCP IP
- Gateway ID (auto: `gw_nanopi_<eth0 MAC suffix>`, stored in `/etc/peaklogic-gateway.json`)
- SIM ICCID (auto: `sh /root/setup-nanopi-opta-gateway.sh read-cellular`)
- Root password (secure store)
- Cloud tenant / site name
- Opta `deviceId` (from ATECC608 after Opta flash)

After `configure` or `apply-lan`, the gateway publishes a **retained** MQTT message:

`peaklogic/v1/gateway/{gatewayId}/cellular`

Cloud PeakLogic auto-links the ICCID to the Simetry SIM inventory when a match exists. When the Opta publishes telemetry through the gateway (`mqttBroker: 192.168.1.1`), cloud registration also attaches **ICCID + Simetry eID** to the Opta device record and publishes `peaklogic/v1/{deviceId}/registration`.

---

## 4. Opta preparation (bench)

Flash **PeaklogicOptaMqttSt** (Arduino IDE). Optional compile preset — copy `opta-nanopi-gateway.defaults.example` → local defaults, add flag `-DMV_MQTT_CLOUD_PRESET=1` so first boot seeds LAN broker.

### Opta `/setup` (every site — same values)

| Field | Value |
|-------|--------|
| Ethernet | **DHCP** |
| MQTT broker | **`192.168.1.1`** |
| MQTT port | **`1883`** |
| Use TLS | **off** |
| Username / password | **blank** |
| Global site key | Match cloud project |

Click **Save settings** → **Test MQTT** (only works after NanoPi is on `192.168.1.1` in the field).

---

## 5. Field installation

### 5.1 Wiring

```
[5V/3A PSU] ──► NanoPi power input
[LTE antenna] ──► CAT1 MAIN
[Opta RJ45] ──► NanoPi eth0 ONLY
```

**Do not** connect NanoPi eth0 to the site/building LAN router. The gateway LAN is **`192.168.1.1/24`** dedicated to the Opta link. Site routers at `192.168.1.1` will conflict.

### 5.2 Apply production network on the NanoPi

SSH to the bench IP **one last time** while eth0 is still on office LAN, **or** use serial console after moving to the field:

```sh
sh /root/setup-nanopi-opta-gateway.sh apply-lan
```

This sets:

| Interface | Role |
|-----------|------|
| **eth0** | `192.168.1.1/24` — DHCP for Opta (`.50–.99`) |
| **eth1** | Cellular WAN (RNDIS DHCP) |

Power-cycle after apply. SSH/LuCI from a laptop on the Opta cable: **`192.168.1.1`**.

### 5.3 Power-up sequence

1. Antenna + SIM seated  
2. Opta Ethernet → NanoPi eth0  
3. Apply **5 V / 3 A** to NanoPi  
4. Wait ~60 s — modem NET LED should leave slow search  
5. Power Opta (or share supply per panel design)

---

## 6. Cloud / PeakLogic

On the **cloud** tenant (Cloud Studio or SaaS):

1. **System setup → MQTT Parc hub** — enabled, broker `mqtts://mqtt.peaklogic.io:8883` (or `mqtt://…:8883` per your deploy), credentials `peaklogic` + `MOSQUITTO_PASS`.
2. **Drivers** — add **Arduino Opta — MQTT Parc ST runtime** with the Opta `deviceId` (`opta_<serial>` from `/api/status`).
3. **Tools → Cellular SIMs** — sync Simetry inventory; gateway ICCID auto-links when the NanoPi publishes `peaklogic/v1/gateway/{gatewayId}/cellular`.
4. Deploy ST program (**Download & Start**) when ready.

---

## 7. Production acceptance tests

Check each item before leaving site.

| # | Test | Pass criteria |
|---|------|----------------|
| 1 | NanoPi power | STS green; no reboot loop |
| 2 | Cellular | `ping -I eth1 8.8.8.8` from NanoPi (via SSH) |
| 3 | LAN broker | `netstat -ln \| grep 1883` on NanoPi |
| 4 | Cloud bridge | `netstat -tn \| grep 8883` shows **ESTABLISHED** |
| 5 | Opta Ethernet | Opta `/api/status` shows IP in `192.168.1.x` |
| 6 | Opta MQTT | `/api/status` → `mqttConnected: true` |
| 7 | Cloud telemetry | PeakLogic driver **Linked**; telemetry updating |
| 8 | Cloud → Opta | **Download & Start** or cmd reaches device |
| 9 | Global tags | Site key matches; `g/{key}/…` if used |

**Quick Opta check from laptop on Opta link:**

```text
http://<opta-dhcp-ip>/api/status
```

**Quick gateway check:**

```text
http://192.168.1.1
ssh root@192.168.1.1
sh /root/setup-nanopi-opta-gateway.sh status
```

---

## 8. Production sign-off checklist

Print and file with the site packet.

```
Site name: _________________________   Date: __________
Technician: _________________________

[ ] SD flashed FriendlyWrt; root password set
[ ] setup-nanopi-opta-gateway.sh install-packages + configure
[ ] /etc/mosquitto/cloud.pass set (600); bridge test passed on bench
[ ] Opta flashed PeaklogicOptaMqttSt; broker 192.168.1.1:1883 saved
[ ] Field wiring: Opta → eth0 only; 5V/3A supply; antenna fitted
[ ] apply-lan executed; gateway reachable at 192.168.1.1
[ ] Modem registered (NET not slow-searching > 3 min)
[ ] Opta mqttConnected; cloud telemetry live
[ ] SIM linked in PeakLogic Cellular SIMs
[ ] ST program deployed and running (if applicable)

Notes: _______________________________________________________
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| NET slow ~2 s blink | Weak power, bad SIM, no signal | **3 A PSU**; reseat SIM/antenna; check data plan |
| No `eth1` | RNDIS driver not loaded | `modprobe rndis_host`; ensure `/etc/modules.d/rndis` exists; reboot |
| Bridge auth failed | Wrong `cloud.pass` | Re-copy `MOSQUITTO_PASS`; `sh …/configure` |
| Opta no MQTT | Wrong broker or not on Opta LAN | Broker **192.168.1.1:1883**; Opta must DHCP from NanoPi |
| Can't SSH after deploy | Still on office LAN / IP conflict | Use **192.168.1.1** on direct cable; unplug from site router |
| SSH "no matching host key" | Old OpenWrt RSA key | `ssh -o HostKeyAlgorithms=+ssh-rsa …` |
| Telemetry in cloud, no cmd down | Bridge topic or hub config | Confirm `peaklogic/v1/#` bridge; cloud Parc hub enabled |

**Logs on NanoPi:**

```sh
logread | grep -iE 'mosquitto|bridge|network'
/etc/init.d/mosquitto restart
/etc/init.d/network restart
```

---

## 10. Security (production)

- Change **root** password from factory default (`passwd`).
- Store **MOSQUITTO_PASS** only on the NanoPi (`/etc/mosquitto/cloud.pass`) — never on Opta.
- Do not commit passwords to git; use [nanopi-gateway-cloud.env.example](./nanopi-gateway-cloud.env.example) locally only.
- Restrict physical access to the panel; NanoPi LAN has no MQTT auth by design (Opta-only link).

---

## 11. Related files

| Path | Purpose |
|------|---------|
| `scripts/setup-nanopi-opta-gateway.sh` | Provision script |
| `scripts/flash-sd-friendlywrt.ps1` | Windows SD flash |
| `deploy/cloud/phase1/NANOPI-OPTA-GATEWAY-MQTT.md` | MQTT reference |
| `deploy/cloud/phase1/opta-nanopi-gateway.defaults.example` | Opta compile preset |
| `deploy/cloud/phase1/OPTA-CLOUD-MQTT.md` | Direct cloud Opta (not this gateway) |
| `docs/training/reference/hardware/cellular-opta-gateway.md` | LilyGO equivalent |

Run `npm run build:nanopi-neo-production-pdf` for build date.

---

*Revision: 2026-08-11 — field stack NanoPi NEO + NEO CAT1 + FriendlyWrt + Mosquitto bridge.*
