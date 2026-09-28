# Phase 1 DigitalOcean inventory (NYC1 VPC)

Do not commit secrets. Mongo URI / MQTT pass / archive token stay in `/etc/peaklogic/*.env` on hosts.

## Droplets

| Name | Role | Private IP | Public IP |
|------|------|------------|-----------|
| cloud-1-saas-nyc1 | SaaS nginx→3100 | 10.116.0.2 | 159.223.154.210 |
| cloud-mqtt-nyc | Mosquitto 1883/8883 | 10.116.0.6 | 167.99.9.171 |
| archive-prod-nyc | Archive :8090 | 10.116.0.7 | 159.203.186.17 |

## DNS

| Name | Target |
|------|--------|
| peaklogic.io / www | 159.223.154.210 |
| mqtt.peaklogic.io | 167.99.9.171 |

## Internal URLs (VPC)

| Service | URL |
|---------|-----|
| MQTT (from SaaS) | `mqtts://mqtt.peaklogic.io:8883` (or `mqtt://10.116.0.6:1883` lab) |
| Archive (from SaaS) | `http://10.116.0.7:8090` |

## SSH aliases

`mv-saas` · `mv-mqtt` · `mv-archive`
