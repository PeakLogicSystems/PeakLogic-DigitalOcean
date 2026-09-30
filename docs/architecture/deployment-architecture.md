# Deployment Architecture

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** multi-tenant-deployment-modes.md

This document summarizes the real deployment topology already fully documented in `docs/CLOUD_DEPLOY_DO.md` and its Phase 1 variants (`docs/CLOUD_DEPLOY_DO_PHASE1*.md`) — it does not replace those, it's the map pointing to them.

## 1. Cloud SaaS topology (production)

```
Internet → DO Cloud Firewall (22, 80, 443)
         → Droplet (Debian 12)
             nginx :80/:443 → peaklogic-saas.service → node server.js :3100
         → DO Managed MongoDB (mongodb+srv://, IP-allowlisted to the droplet)

Site appliances (:3090) ──MQTT──► optional runtime on the same or a dedicated droplet
```

- Single droplet, single Node process (`peaklogic-saas.service`, systemd-managed), reverse-proxied by nginx for TLS termination — no load balancer, no container orchestration, no auto-scaling observed anywhere in the deploy docs or scripts.
- **Phase 1 Atlanta** (the recommended real-world topology per `docs/CLOUD_DEPLOY_DO.md`) splits this into **three droplets**: SaaS, a dedicated MQTT broker/hub, and an archive droplet — see `docs/CLOUD_DEPLOY_DO_PHASE1_ATL-MQTT.md` for the exact reasoning and setup. The single-droplet diagram above is the simpler/generic case.
- Managed MongoDB is a separate DigitalOcean product, same region as the droplet, IP-allowlisted rather than open — connection string via `mongodb+srv://`.

## 2. Appliance topology

A single process (`node server.js`, default port 3090) on a site PC or embedded Linux box, talking directly to local field devices over BACnet/Modbus/serial. No reverse proxy, no managed database by default — JSON files under `data/` (or `PEAKLOGIC_DATA`) unless a local MongoDB is configured. See `docs/HAL.md` for the optional native addon needed for embedded-Linux hardware access (`npm run build-native`).

## 3. Local development

This session's actual working setup, since the repo has no lightweight "just run it" dev mode documented elsewhere for cloud-mode testing without real infrastructure:

```bash
PEAKLOGIC_CONFIG_URI=memory PLATFORM_ADMIN_KEY="<any string>" PORT=3090 node scripts/start-cloud.js
```

This avoids needing a real MongoDB (config store falls back to an in-memory Map) and unlocks `/admin/login` (otherwise disabled with no `PLATFORM_ADMIN_KEY` set). `scripts/start-cloud.js` itself just sets `PEAKLOGIC_DEPLOYMENT=cloud` and `PEAKLOGIC_CLOUD_SIMS=1` before requiring `server.js` — it is not a separate entry point with different code.

**Caveat surfaced this session:** without `JWT_SECRET` set, every restart invalidates all sessions (see `security-architecture.md` §3) — expect to re-authenticate after every server restart in this local-dev configuration; this is expected, not a bug to chase.

## 4. Environment variables that gate real behavior

See `CLAUDE.md`'s Environment Setup section for the full list. The two most likely to cause a confusing "nothing works" moment for a new session:
- `PLATFORM_ADMIN_KEY` unset → `/admin/login` renders a 503 explaining exactly this (`isPlatformAdminConfigured()` check in `src/routes/adminWeb.js`) — not a silent failure, but easy to miss if you don't read the error page.
- `PEAKLOGIC_CONFIG_URI` unset and no real MongoDB reachable → boot fails outright with `Error: MongoDB required for configuration` (`src/configStore/mongoBackend.js`) — hit directly this session on a first restart attempt before discovering the `memory` mode.

## 5. What this document does not cover

Full nginx config, TLS cert provisioning (Let's Encrypt, per the deploy docs), systemd unit file contents, MongoDB backup/restore procedure — all in `docs/CLOUD_DEPLOY_DO*.md` and `deploy/cloud/`, not duplicated here. No rollback procedure has been documented or exercised for this deployment target (unlike `PeakLogic-AWS`'s tag-based rollback runbook) — this is a real gap; see `technical-debt-register.md`.
