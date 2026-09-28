# GitHub + Digital Ocean App Platform

Use repo **`RoyMooreACE/peaklogic-cloud`** (not empty placeholder repos like `mvcloud`).

GitHub account: **RoyMooreACE** (not `recycleroy`).

Root must contain **`package.json`** (and now **`Dockerfile`** + **`.do/app.yaml`**) so Digital Ocean detects a Node service.

## Recreate / fix GitHub repo

### 1. Delete empty repos (if any)

On GitHub, delete repos that only have a README or `.gitattributes` and no `package.json`:

- `mvcloud`, `mn-cloud`, or other empty test repos

Keep or recreate:

- **`peaklogic-cloud`** — cloud API (this folder)
- **`peaklogic-pc`** — desktop/server (`est-pc`)

### 2. GitHub Desktop — push this folder

1. **File → Add local repository** → `C:\Users\public\data\peaklogic-cloud`
2. **Repository → Repository settings**
   - Remote: `https://github.com/RoyMooreACE/peaklogic-cloud.git`
3. Commit any pending changes (Dockerfile, `.do/app.yaml`, `package.json`)
4. **Push origin** — branch **`master`** (not an empty `main` with no code)

Verify on GitHub: repo root shows `package.json`, `Dockerfile`, `src/server.js`.

### 3. Digital Ocean App Platform

1. **Create App → GitHub** → authorize → select **`RoyMooreACE/peaklogic-cloud`**
2. Branch: **`main`**
3. **Source directory:** `/` (repo root — do not use `mvcloud/` or `mn-cloud/`)
4. DO should detect **Node.js** or **Dockerfile**
   - Build: `npm ci --omit=dev`
   - Run: `npm start`
   - HTTP port: **3100**
   - Health check: `/health`
5. **Environment variables** (encrypted):
   - `MONGODB_URI` — Digital Ocean Managed MongoDB connection string
   - `JWT_SECRET` — long random string
   - `MONGODB_DB` — `peaklogic_cloud`
   - `NODE_ENV` — `production`
6. Add the app as a **trusted source** on your MongoDB cluster.
7. Deploy.

### 4. Custom domain

**Settings → Domains** → add `api.peaklogic.io` → set DNS CNAME per DO instructions.

### Troubleshooting “No components detected”

| Cause | Fix |
|-------|-----|
| Wrong repo (empty) | Use `peaklogic-cloud` with `package.json` at root |
| Wrong branch | Push `master`; select that branch in DO |
| Source subdirectory | Set source dir to **`/`** |
| Code not pushed | Push from GitHub Desktop; refresh DO import |
| Permissions | Re-authorize GitHub in DO → Settings → GitHub |

### peaklogic-pc (separate app)

`est-pc` is the full Windows/Linux MVP suite (`peaklogic-mvp-suite`). Deploy **`peaklogic-cloud`** only for the multi-tenant API on `api.peaklogic.io`.
