# Phase 1 DigitalOcean inventory (template)

Copy to `do-inventory.md` (gitignored locally) or a password manager. **Do not commit real secrets.**

## Account

| Field | Value |
|-------|-------|
| DO team / project | |
| Region | NYC3 |
| SSH key fingerprint | |
| Admin SSH CIDR | |

## Resources

| Name | Type | Size | Public IP | Notes |
|------|------|------|-----------|-------|
| peaklogic-saas | Droplet | 4 GB | | Debian 12 |
| peaklogic-mqtt | Droplet | 2 GB | | Mosquitto |
| peaklogic-archive | Droplet | 2 GB + volume | | :8090 |
| peaklogic-mongo | Managed MongoDB | 10–20 GB | *(private host)* | DB `peaklogic_cloud` |
| fw-saas | Firewall | | | 22, 80, 443 |
| fw-mqtt | Firewall | | | 22, 1883, 8883 |
| fw-archive | Firewall | | | 22, 8090←SaaS IP |

## DNS

| Name | Type | Value |
|------|------|-------|
| peaklogic.io | A | *(saas IP)* |
| www | A | *(saas IP)* |
| mqtt.peaklogic.io | A | *(mqtt IP)* |
| archive.peaklogic.io | A | *(archive IP, optional)* |

## Secrets (store offline)

| Secret | Where used | Generated |
|--------|------------|-----------|
| Mongo connection string | `/etc/peaklogic/saas.env` `MONGODB_URI` | DO console |
| `JWT_SECRET` | saas.env | `openssl rand -hex 32` |
| `PLATFORM_ADMIN_KEY` | saas.env | `openssl rand -hex 24` |
| `MOSQUITTO_PASS` | mqtt.env + appliance uplink | |
| `ARCHIVE_SERVER_TOKEN` | saas.env + archive.env | `openssl rand -hex 32` |

## Post-create checklist

- [ ] Mongo trusted source = SaaS IP only
- [ ] SaaS TLS (certbot)
- [ ] MQTT password + TLS
- [ ] Archive firewall = SaaS IP only
- [ ] `npm run seed` on SaaS
- [ ] Appliance broker URL = `mqtts://mqtt.peaklogic.io:8883`
- [ ] Health checks pass (see ATL-MQTT acceptance checklist)
