# Mongo hot (0–7d) → zstd archive (server 2)

Two-cloud-server layout for PeakLogic telemetry:

| Server | Role |
|--------|------|
| **Cloud 1 (hot)** | MongoDB 7, PeakLogic, MQTT — JSON documents **0–7 days** |
| **Cloud 2 (archive)** | zstd JSONL blobs + sidecar indexes only — **no Mongo** |

Appliances stay unchanged (local JSON / spool). Cloud alarms and echo remain on server 1.

---

## Collections (server 1 — Mongo)

| Collection | Retention | Notes |
|------------|-----------|--------|
| `tag_logs` (`pen_sample`, `pen_selection`) | **7d hot** then export+delete | Main export source |
| `edge_inference` | 7d optional export | Same pipeline |
| `archive_registry` | permanent | Pointer to blobs on server 2 |
| `site_echo`, config, SIMs | no TTL | Operational |

### Recommended indexes

```javascript
db.tag_logs.createIndex({ event: 1, at: 1, company: 1, siteId: 1 });
db.tag_logs.createIndex({ event: 1, at: 1 }); // compact job scan
db.archive_registry.createIndex({ company: 1, siteId: 1, periodStart: 1 }, { unique: true });
db.archive_registry.createIndex({ sha256: 1 });
```

### Telemetry document shape (cloud ingest)

Export partitions on `company` + `siteId`. Add on ingest (appliance relay / MQTT hub):

```json
{
  "event": "pen_sample",
  "at": "2026-07-01T12:00:00.000Z",
  "company": "ace",
  "siteId": "lift_042",
  "deviceId": "opta_012355b52d66a109ee",
  "pen": { "tagId": "LEVEL" },
  "tag": { "id": "LEVEL", "type": "REAL", "value": 12.4 },
  "sampleValue": 12.4
}
```

Fallback when `siteId` missing: `siteId = deviceId || tag.driverId || projectName`.

---

## Archive path layout (server 2)

```
/archive/
  company=ace/site=lift_042/year=2026/day=2026-06-24.jsonl.zst
  company=ace/site=lift_042/year=2026/day=2026-06-24.index.json
  company=bresa/site=12345/year=2026/day=2026-06-24.jsonl.zst
  company=bresa/site=12345/year=2026/day=2026-06-24.index.json
```

---

## Index JSON schema

One index file per blob. Hourly chunks enable partial decompress.

```json
{
  "version": 1,
  "company": "ace",
  "siteId": "lift_042",
  "codec": "zstd",
  "blobPath": "company=ace/site=lift_042/year=2026/day=2026-06-24.jsonl.zst",
  "periodStart": "2026-06-24T00:00:00.000Z",
  "periodEnd": "2026-06-25T00:00:00.000Z",
  "recordCount": 8640,
  "byteSize": 1843200,
  "sha256": "abc123…",
  "tags": ["LEVEL", "PUMP_RUN"],
  "chunks": [
    {
      "hour": "2026-06-24T14",
      "frameIndex": 14,
      "offset": 184320,
      "length": 128400,
      "records": 720,
      "tagIds": ["LEVEL", "PUMP_RUN"]
    }
  ]
}
```

Each **zstd frame** = one UTC hour of JSONL lines (`\n`-delimited Mongo export docs).

---

## Day-7 compaction job

**Schedule:** daily `02:15 UTC` (cron / systemd timer).

**Export window:** calendar day **D = today − 7 days** (UTC).

```
periodStart = D 00:00:00.000Z
periodEnd   = D+1 00:00:00.000Z
```

**Safety buffer:** do **not** delete Mongo rows until blob + index verified on server 2. Keep Mongo TTL at **8 days** (`691200` s) or delete only after `status: verified`.

### Algorithm

1. `find` all distinct `(company, siteId)` with `pen_sample` in `[periodStart, periodEnd)`.
2. For each partition, stream sorted docs → JSONL → **hourly zstd frames** → `.jsonl.zst`.
3. Build `index.json` (chunks, sha256, counts).
4. `PUT` blob + index to server 2 (`archiveClient`).
5. `HEAD` blob on server 2; compare `sha256` / `Content-Length`.
6. Insert `archive_registry` on server 1 with `status: verified`.
7. `deleteMany` exported `_id`s (or `{ company, siteId, at: { $gte, $lt } }`).

### Failure policy

| Step fails | Action |
|------------|--------|
| Export / compress | Log; **no delete**; retry next run |
| Upload | Keep local temp; retry |
| Verify mismatch | **no delete**; alert |
| Registry insert after verify | Idempotent unique key; safe retry |

---

## Delete policy

| Method | When |
|--------|------|
| **Explicit delete** (preferred) | After `verified` registry row |
| **TTL backup** | `expireAfterSeconds: 691200` (8d) on `at` — safety net only |

Never rely on TTL alone for ACE/Boyette compliance partitions.

---

## Environment (cloud 1 — compact job)

| Variable | Example | Purpose |
|----------|---------|---------|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Hot DB |
| `MONGODB_DB` | `peaklogic` | |
| `MONGODB_COLLECTION` | `tag_logs` | |
| `ARCHIVE_SERVER_URL` | `https://archive.internal:8090` | Server 2 base URL |
| `ARCHIVE_SERVER_TOKEN` | secret | Bearer auth |
| `ARCHIVE_COMPACT_DRY_RUN` | `0` | `1` = no upload/delete |
| `ARCHIVE_ZSTD_LEVEL` | `3` | zstd compression level |
| `ZSTD_BIN` | `zstd` | Path to zstd CLI |

Run: `node scripts/run-archive-compact.js`

---

## Server 2 — archive API

Minimal service: `deploy/cloud/archive-server/`.

| Method | Path | Auth | Body |
|--------|------|------|------|
| `PUT` | `/archive/*` | Bearer | Raw bytes (blob or index) |
| `HEAD` | `/archive/*` | Bearer | — returns `X-SHA256`, `Content-Length` |
| `GET` | `/archive/*` | Bearer | Download (Range supported) |
| `GET` | `/health` | none | `{ ok: true }` |

Install on archive box:

```bash
cd deploy/cloud/archive-server
export ARCHIVE_ROOT=/data/archive
export ARCHIVE_SERVER_TOKEN=your-secret
node server.js
```

---

## Historian read path

| Age | Source |
|-----|--------|
| 0–7d | Mongo `tag_logs` (existing historian API) |
| &gt;7d | `archive_registry` → fetch index → `GET` blob range from server 2 → decompress frame |

---

## Implementation files

| File | Role |
|------|------|
| `src/archive/archivePaths.js` | Path + partition helpers |
| `src/archive/zstdWriter.js` | Hourly framed zstd JSONL |
| `src/archive/archiveClient.js` | HTTP PUT/HEAD to server 2 |
| `src/archive/archiveRegistry.js` | Mongo `archive_registry` |
| `src/archive/compactJob.js` | Daily export job |
| `scripts/run-archive-compact.js` | Cron entrypoint |
| `deploy/cloud/archive-server/server.js` | Archive box API |

---

## Company retention (server 2 disk lifecycle)

| Company | Keep on archive disk |
|---------|----------------------|
| ACE / Boyette | 10 years |
| WTR-Doctor | 7 years |
| Bresa | 3 years (hourly rollups optional second pass) |
| ALF | 5 years (site rollups) |

Implement with cron `find … -mtime +N -delete` per prefix or separate mount quotas.
