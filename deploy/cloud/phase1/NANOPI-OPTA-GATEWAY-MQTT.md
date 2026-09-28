# Opta Parc — NanoPi NEO CAT1 gateway (LAN :1883 → cloud :8883)

Transparent gateway: Opta talks to **local Mosquitto** on the NanoPi; the NanoPi bridges **`peaklogic/v1/#`** to the cloud over LTE.

Field-validated stack: FriendlyWrt on NanoPi NEO + NEO CAT1 (`19d1:0001`), Mosquitto 1.6 SSL bridge.

**Production runbook:** [NANOPI-NEO-PRODUCTION.md](./NANOPI-NEO-PRODUCTION.md)  
Hardware guide: [nanopi-opta-gateway.md](../../../docs/training/reference/hardware/nanopi-opta-gateway.md).

---

## Opta `/setup` → MQTT Parc broker

| Field | Value |
|-------|--------|
| Ethernet | DHCP |
| Broker host | **`192.168.1.1`** |
| Port | **`1883`** |
| Use TLS | **unchecked** |
| Username | *(blank)* |
| Password | *(blank)* |

Save — Opta reconnects to the NanoPi LAN broker. **Do not** point Opta at the cloud host; credentials stay on the gateway.

---

## NanoPi gateway → cloud Mosquitto

| Field | Value |
|-------|--------|
| **Host** | `mqtt.peaklogic.io` (or `167.99.9.171`) |
| **Port** | **8883** |
| **TLS** | **On** (Let's Encrypt via `ca-bundle`) |
| **Username** | `peaklogic` |
| **Password** | `/etc/mosquitto/cloud.pass` on the NanoPi |

Set password on the gateway:

```sh
echo 'YOUR_MOSQUITTO_PASS' > /etc/mosquitto/cloud.pass
chmod 600 /etc/mosquitto/cloud.pass
sh /root/setup-nanopi-opta-gateway.sh configure
```

Read password on the MQTT droplet:

```bash
ssh mv-mqtt
sudo grep MOSQUITTO_PASS /etc/peaklogic/mqtt.env
```

Copy [nanopi-gateway-cloud.env.example](./nanopi-gateway-cloud.env.example) → `nanopi-gateway-cloud.env` locally (gitignored) for bench notes only — **do not commit** production passwords.

---

## Compile-time Opta preset (field flash)

Copy `opta-nanopi-gateway.defaults.example` → `opta-nanopi-gateway.defaults` (gitignored), then in Arduino IDE **Compiler flags**:

```
-DMV_MQTT_CLOUD_PRESET=1
```

First boot seeds NV: broker **`192.168.1.1`**, port **1883**, TLS off, no user/pass.

---

## Network roles (after `apply-lan`)

| Interface | Role | Address |
|-----------|------|---------|
| **eth0** | Opta LAN | **`192.168.1.1/24`** (static) + DHCP for Opta |
| **eth1** | Cellular WAN | DHCP from modem (~`192.168.10.2`) |

Wire **Opta Ethernet → NanoPi eth0** only. Do not connect eth0 to the office UniFi LAN while set to `192.168.1.1`.

---

## Topics (unchanged)

```
peaklogic/v1/{deviceId}/telemetry
peaklogic/v1/{deviceId}/cmd
peaklogic/v1/{deviceId}/online
peaklogic/v1/{deviceId}/cmd/response
peaklogic/v1/g/{siteKey}/{tag}
```

`deviceId` = `opta_<ATECC608 serial>` (automatic on Opta).

Bridge topic rule on NanoPi: `topic peaklogic/v1/# both 1`

---

## Verify bridge

On the NanoPi (after `cloud.pass` is set):

```sh
# local → cloud
cat > /tmp/bridge-test.sh << 'EOF'
#!/bin/sh
mosquitto_sub -h mqtt.peaklogic.io -p 8883 \
  --cafile /etc/ssl/certs/ca-certificates.crt \
  -u peaklogic -P "$(cat /etc/mosquitto/cloud.pass)" \
  -t peaklogic/v1/test/gateway/ping -C 1 -W 8 &
SPID=$!
sleep 2
mosquitto_pub -h 127.0.0.1 -p 1883 \
  -t peaklogic/v1/test/gateway/ping -m ok -q 1
wait $SPID
EOF
sh /tmp/bridge-test.sh
```

Expect output `ok` from the subscriber.

From PeakLogic cloud (MQTT Parc hub enabled): confirm Opta **telemetry** after Opta is on `192.168.1.1:1883`.

---

## vs direct cloud Opta

| | Direct cloud ([OPTA-CLOUD-MQTT.md](./OPTA-CLOUD-MQTT.md)) | **NanoPi gateway (this doc)** |
|--|-------------------------------------------------------------|-------------------------------|
| Opta broker | `mqtt.peaklogic.io:8883` + TLS + auth | **`192.168.1.1:1883`** anonymous |
| Uplink | Opta Ethernet or site LAN | **LTE on NanoPi** |
| Credentials on Opta | Yes | **No** (gateway only) |

Use the NanoPi path when the site has no reliable wired internet but needs the same Parc/cloud workflow as the LilyGO cellular-opta-gateway.
