# PeakLogic IP cameras — integration guide

PeakLogic MVP Suite includes full IP camera integration for **Reolink** and other **ONVIF** cameras: discovery, live viewing, snapshot archive, vision AI, and HMI operator popups.

## Discovery

PeakLogic uses **three** methods to find cameras (run together on **Scan network**):

| Method | How | When it helps |
|--------|-----|----------------|
| **WS-Discovery** | UDP multicast + per-adapter broadcast on `239.255.255.250:3702` | Standard ONVIF cameras that respond to discovery |
| **Subnet TCP sweep** | Scans your local /24 for ONVIF ports **8000**/**80**, plus native **9000** (Reolink) and RTSP **554** to *detect* cameras with ONVIF off | Managed switches that block multicast; DHCP cameras that don't answer WS-Discovery |
| **Add by IP** | Direct ONVIF probe to one address | You know the IP from your router or Reolink app |

Disable subnet sweep on the **Discover** tab with **Subnet TCP sweep** unchecked if scan is too slow on large VLANs.

> **Reolink ships with ONVIF and RTSP disabled by default.** A camera in this state answers on its native port (9000) but exposes no ONVIF endpoint, so discovery cannot use it. The subnet sweep now flags these under **"Cameras found but not usable yet"** on the Discover tab. Enable **ONVIF** and **RTSP** in the Reolink app/web UI (*Settings → Network → Advanced → Server Settings / Port Settings*), then click **Add by IP** or re-scan.

## Quick start (Reolink)

1. On each camera web UI: enable **ONVIF** (port **8000**) and **RTSP** (port **554**).
2. Start PeakLogic: `npm start` → http://127.0.0.1:3090
3. **Tools → Cameras → Settings**: set default username/password.

> **DHCP camera not found by scan?** Discovery probes every network adapter and subnet broadcast, but some networks block multicast. Use **Discover → Add & probe by IP** and enter the camera's address (from your router's DHCP list or the Reolink app).
4. **Discover ONVIF** → **Probe all** (fills RTSP, snapshot URL, viewer URL).
5. **HMI Setup**: place **Camera** button, pick from inventory dropdown.
6. Live HMI: click camera button → popup plays live stream.

Optional: `npm run go2rtc:download` installs the go2rtc binary for H.264 WebRTC/MSE streaming.

## Architecture

```
ONVIF WS-Discovery (UDP 239.255.255.250:3702)
        ↓
  cameraRegistry (data/cameras.json)
        ↓ ONVIF probe (Digest auth)
  rtspUrl + snapshotUrl + eventsUrl
        ↓
  ┌─────────────────┬──────────────────────┐
  │ go2rtc (RTSP)   │ GridFS snapshots     │
  │ → /player       │ → camera_snapshots   │
  └─────────────────┴──────────────────────┘
        ↓                      ↓
  HMI iframe popup      Vision AI pipeline
                        → edge_inference_ts
```

## Tools → Cameras

| Tab | Purpose |
|-----|---------|
| **Inventory** | Add/edit/delete cameras; Probe; Test popup; Capture snapshot; Run AI infer |
| **Discover** | WS-Discovery scan; auto-add; auto-probe |
| **Settings** | Credentials, go2rtc, GridFS archive, vision AI backends |

### Inventory fields (after probe)

| Field | Example |
|-------|---------|
| ONVIF URL | `http://192.168.1.88:8000/onvif/device_service` |
| RTSP URL | `rtsp://admin:pass@192.168.1.88:554/h264Preview_01_sub` |
| Viewer URL | `/api/cameras/cam_yard/player` (go2rtc) or `…/mjpeg` |
| Probe status | `ok` / `error` |

## Live streaming

### go2rtc (recommended)

- Binary: `vendor/go2rtc/go2rtc.exe` (install: `npm run go2rtc:download`)
- Auto-starts on server boot when enabled in camera settings
- Viewer: `/api/cameras/{cameraId}/player` (WebRTC/MSE in iframe)
- Proxied API: `/api/go2rtc/*`

### MJPEG fallback

- `/api/cameras/{cameraId}/mjpeg` — ONVIF snapshot polling
- Used when go2rtc is off or unavailable

## MongoDB GridFS archive

Requires `mongoLogger.uri` in **Historian → Logger config…** (same MongoDB as tag historian).

| Bucket | Content |
|--------|---------|
| `camera_snapshots` | ONVIF snapshot JPEGs |
| `hmi_assets` | Mirrored HMI user imports |
| `project_bundles` | Project `.est.zip` snapshots on save (optional GridFS mirror) |
| `report_pdfs` | Historian PDF exports |

### Snapshot archive settings

- **Archive camera snapshots to GridFS** — on by default
- **Snapshot interval** — default 60 s (scheduled capture)
- **Snapshot retention** — default 30 days

Snapshots are also captured on: manual request, probe, ONVIF motion events.

## Camera vision AI (edge + post-capture)

Three inference paths (all optional):

| Path | Trigger | Frame source |
|------|---------|--------------|
| **Post-capture** | After GridFS snapshot | Archived JPEG |
| **Live edge** | Every 5 s (configurable) | go2rtc `frame.jpeg` |
| **ONVIF motion** | Motion event from camera | Capture + infer |

Results stored in MongoDB `edge_inference_ts` with `cameraId`, `snapshotId`, `score`, `label`.  
PdM asset ID format: `cam:{cameraId}`.

### Backends

| Backend | Use |
|---------|-----|
| **stub** | Dev/test — no external model |
| **http** | POST image to your inference service |
| **off** | Disable inference |

### HTTP inference contract

```http
POST {cameraAiHttpUrl}
Content-Type: application/json

{
  "cameraId": "cam_yard",
  "source": "live_edge",
  "snapshotId": "674abc...",
  "contentType": "image/jpeg",
  "imageBase64": "..."
}
```

Response:

```json
{
  "score": 0.92,
  "label": "person",
  "confidence": 0.88,
  "modelId": "yolov8",
  "boxes": []
}
```

### Alarm integration

Set **Alarm tag** to a BOOL memory tag (e.g. `CAM_ALARM`). When `score >= threshold`, PeakLogic sets the tag `true` and logs `inference_alarm` in `camera_events`.

## Top-bar quick access

The **camera icon** in the top bar (right of **Tools**) opens a dropdown of all cameras. Click any camera to open its live view anchored under the top bar. The status dot is green when the camera is probed. This works from any screen without placing an HMI button.

## HMI integration

Three placement kinds in **HMI Setup → Object type**:

| Kind | Behavior |
|------|----------|
| **Camera (popup iframe)** | Operator clicks a button → modal plays live stream |
| **Camera live tile (embedded)** | Live video embedded in the grid cell (span 2×2 recommended) |
| **Camera + I/O overlays** | Embedded video + BOOL tag markers from overlay registry + optional AI boxes |

### Camera popup button

1. **HMI Setup** → place kind **Camera (popup iframe)**
2. Pick camera from **inventory dropdown** (sets `cameraId` + viewer URL)
3. On live HMI: click button → popup opens stream
4. Alt+click in HMI Setup previews the stream

### Embedded live tile + I/O overlays

1. **Tools → Cameras → Detail** — configure **I/O overlays on video** (tag, X/Y %, symbol, on/off colors, snapshot triggers)
2. **HMI Setup** → place kind **Camera + I/O overlays** (or **Camera live tile** for video only)
3. Set **Col/Row span** ≥ 2 for a usable frame; Z layer **0**
4. On the live HMI, overlay colors update from tag values (~500 ms poll). BOOL **rising/falling** edges can capture GridFS snapshots when enabled on an overlay

Overlay registry example in `data/cameras.json`:

```json
{
  "overlays": [{
    "id": "ovl_valve1",
    "tagId": "VALVE1_OPEN",
    "label": "Valve 1",
    "xPct": 25,
    "yPct": 40,
    "symbol": "valve",
    "onColor": "#22c55e",
    "offColor": "#ef4444",
    "snapshotOnRising": true
  }]
}
```

Symbols: `valve`, `pump`, `motor`, `dot`, `text`, `box`. Latest AI inference bounding boxes render on overlay tiles when **Camera + I/O overlays** is used.

`cameraId` and overlay registry are resolved at runtime — probe updates do not break HMI bindings.

## Project export

`.est` and `.mvbundle` exports include the full camera inventory and settings. Import restores cameras into `data/cameras.json`.

## REST API summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/cameras` | List inventory + settings |
| POST | `/api/cameras/discover` | ONVIF scan |
| POST | `/api/cameras/:id/probe` | ONVIF probe one camera |
| GET | `/api/cameras/:id/player` | go2rtc HTML player |
| GET | `/api/cameras/:id/mjpeg` | MJPEG stream |
| GET | `/api/cameras/:id/viewer` | Resolve viewer URL + overlays + latest snapshot/inference |
| GET | `/api/cameras/:id/overlays` | List I/O overlay registry for camera |
| PUT | `/api/cameras/:id/overlays` | Replace overlay registry |
| POST | `/api/cameras/:id/snapshot` | Capture to GridFS |
| GET | `/api/cameras/:id/snapshots` | List archived snapshots |
| POST | `/api/cameras/:id/infer` | Manual AI inference |
| GET | `/api/cameras/:id/inferences` | AI history (24 h default) |
| GET | `/api/cameras/:id/events` | Event log |
| GET | `/api/cameras/ai/status` | AI monitor status |
| GET | `/api/storage/gridfs/status` | GridFS connectivity |

## npm scripts

| Script | Purpose |
|--------|--------|
| `npm run go2rtc:download` | Install go2rtc binary to `vendor/go2rtc/` |
| `npm run go2rtc:start` | Start go2rtc standalone |
| `npm run go2rtc:stop` | Stop go2rtc |

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Discover finds nothing | Discovery now probes every adapter + subnet broadcast. If still empty: same LAN/VLAN as camera, Windows Firewall allowing UDP 3702, ONVIF enabled on camera. Fallback: **Discover → Add & probe by IP** with the camera's DHCP address. |
| DHCP camera not found by scan | Some cameras/switches block multicast. Use **Discover → Add & probe by IP** (enter the address from your router or the Reolink app). |
| Camera pings but scan misses it (only port 9000 open) | ONVIF/RTSP are disabled on the camera. Enable **ONVIF** and **RTSP** in the Reolink app/web UI (*Settings → Network → Advanced → Server/Port Settings*), then re-scan or **Add by IP**. The sweep lists such devices under **"Cameras found but not usable yet"**. |
| Probe fails on Reolink | ONVIF enabled port 8000; credentials in Settings |
| Player blank | go2rtc running; RTSP URL correct; `npm run go2rtc:download` |
| GridFS errors | `mongoLogger.uri` in Logger config; MongoDB reachable |
| AI always stub scores | Set backend to **http** and configure inference URL |
| Motion never triggers | Camera ONVIF events enabled; `eventsUrl` after probe |
| HMI button does nothing | Camera probed; cameraId set; Alt+click in Setup to test |
| Overlays static on live HMI | Overlay registry saved in Tools → Cameras → Detail; use **Camera + I/O overlays** tile kind |
| No snapshot on valve open | Enable **snapshot on rising** on overlay; tag bridge enabled in camera settings |

## Data files

| Path | Content |
|------|---------|
| `data/cameras.json` | Camera inventory + settings (credentials in plain text) |
| `data/go2rtc.yaml` | Auto-generated go2rtc config |
| `data/go2rtc.pid` | go2rtc process id |
| `vendor/go2rtc/go2rtc.exe` | go2rtc binary (not in git; run download script) |

## Security notes

- Camera credentials stored locally in `data/cameras.json` (not encrypted).
- go2rtc binds to `127.0.0.1` only; PeakLogic proxies `/api/go2rtc`.
- RTSP URLs contain embedded passwords — protect project exports.

## Appliance → SaaS (Cloud Studio)

LAN cameras stay on the **site appliance** (port **3090**) for discover/probe/credentials. The **SaaS droplet** runs **full Cloud Studio** on port **3100** (ST, Projects, HMI, Drivers, …) plus **Tools → Sites & remote cameras** for pairing and live view through the site agent. Cloud never runs WS-Discovery or subnet sweeps.

**Operator flow (cloud):** open `https://peaklogic.io/` (full Studio) → **Tools → Sites & remote cameras** → create site → copy pairing code → on the appliance paste under **Cameras → Settings → Cloud Studio** → **Open live**.

```
[Reolink] ← ONVIF/RTSP → [Appliance + go2rtc + siteAgent]
                              │ outbound WSS (pairing / agent token)
                              ▼
                    [Cloud agent hub + camera catalog]
                              │
                              ▼
                    [Operator browser → /api/sites/:siteId/cameras/:id/player]
```

### Responsibilities

| Layer | Owns |
|-------|------|
| Appliance | Discover, probe, credentials, go2rtc, site agent |
| Cloud | Sites, pairing codes, redacted catalog, media gateway, HMI `siteId`+`cameraId` |
| Browser | Opens cloud player URL only |

Cloud catalog fields (no passwords): `siteId`, `cameraId`, `name`, `host`, `model`, `probeStatus`, `hasStream`, `viewerPath`, `lastSeenAt`.

### Agent WebSocket protocol (`src/cloud/agentProtocol.js`)

Control channel `WSS /api/sites/:siteId/agent?pairingCode=` or `?token=`:

| Type | Direction | Purpose |
|------|-----------|---------|
| `hello` / `welcome` | both | Pairing; `welcome` may include one-time `agentToken` |
| `heartbeat` / `heartbeat_ack` | appliance → cloud | Liveness |
| `inventory` / `inventory_ack` | appliance → cloud | Redacted camera list |
| `viewer.open` / `viewer.close` | cloud → appliance | Start/stop media bridge |
| `viewer.ready` / `viewer.error` | both | Session status |
| `snapshot.push` / `snapshot.ack` | appliance → cloud | Phase 2 snapshot mirror hook |

Media: appliance opens `WSS /api/sites/:siteId/agent/media?token=&sessionId=&cameraId=` and pipes local go2rtc `/api/ws`. Browser connects to `/api/sites/:siteId/cameras/:cameraId/ws`.

### Pairing (Phase 1)

1. On cloud (`PEAKLOGIC_DEPLOYMENT=cloud` or `PEAKLOGIC_CLOUD_SITES=1`): `POST /api/sites` → `{ site, pairingCode, agentToken }`.
2. Appliance **Tools → Cameras → Settings → Cloud Studio**: Cloud URL, Site ID, Pairing code → **Save cloud pairing**.
3. Agent connects; cloud rotates/issues `agentToken` in `welcome` (pairing code invalidated).
4. Inventory syncs automatically; cloud `GET /api/sites/:siteId/cameras`.
5. HMI camera button: set **siteId** + **cameraId** (SaaS). Live view uses cloud player proxy.

### Phase 2 hardening

- Offline player page when site agent is down
- `maxViewersPerSite` (default 4) in `data/cloud_sites.json` settings
- `entitlementRemoteView` flag
- Snapshot mirror ack (`snapshot.push`) — GridFS store optional
- TURN for WebRTC across NATs (MSE-over-proxied-WS works without TURN)

### Data files

| Path | Content |
|------|---------|
| `data/cloud-agent.json` | Appliance outbound agent config (token) |
| `data/cloud_sites.json` | Cloud sites, hashed tokens, camera catalog |

### Env flags

| Variable | Effect |
|----------|--------|
| `PEAKLOGIC_DEPLOYMENT=cloud` | Enable agent hub + `/api/sites/*` |
| `PEAKLOGIC_CLOUD_SITES=1` | Same sites API on a non-cloud process (dev/test) |

## See also

- **F1 Help → Cameras & video**
- **F2 Training → M15 — IP cameras & vision AI**
- Reolink paths: `h264Preview_01_sub` (substream), `h264Preview_01_main` (main)
