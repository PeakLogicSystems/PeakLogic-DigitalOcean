# GitHub + Digital Ocean App Platform

Repo: **`PeakLogicSystems/PeakLogic-DigitalOcean`**, branch **`main`**. Root contains **`package.json`**, **`Dockerfile`**, and **`.do/app.yaml`** so Digital Ocean App Platform detects a Node service without extra configuration.

## Digital Ocean App Platform setup

1. **Create App → GitHub** → authorize → select **`PeakLogicSystems/PeakLogic-DigitalOcean`**
2. Branch: **`main`**
3. **Source directory:** `/` (repo root)
4. DO should detect **Node.js** or the **Dockerfile**:
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

### Custom domain

**TBD** — no production domain has been decided yet for this rebrand. Once one is, **Settings → Domains** → add the API subdomain → set DNS CNAME per DO instructions, and update `.do/app.yaml` / `DEPLOY.md` accordingly.

### Troubleshooting "No components detected"

| Cause | Fix |
|-------|-----|
| Wrong branch | Select `main` in DO |
| Source subdirectory | Set source dir to **`/`** |
| Code not pushed | Push the branch; refresh DO import |
| Permissions | Re-authorize GitHub in DO → Settings → GitHub |
