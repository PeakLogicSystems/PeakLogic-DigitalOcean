# MooreVIEW Cloud — Deployment

Multi-tenant REST API backed by **DigitalOcean Managed MongoDB**. The app uses the native `mongodb` driver with `MONGODB_URI` (TLS via `mongodb+srv://` on DO).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | Connection string (`mongodb+srv://user:pass@host/db?tls=true` on DO) |
| `MONGODB_DB` | No | Database name (default `mooreview_cloud`) |
| `JWT_SECRET` | Yes (prod) | Long random string for signing JWTs |
| `JWT_EXPIRES_IN` | No | Token lifetime (default `7d`) |
| `PORT` | No | HTTP port (default `3100`) |
| `MAX_LOCATIONS_PER_TENANT` | No | Default `1000` |
| `MAX_SYSTEMS_PER_LOCATION` | No | Default `1000` |
| `MAX_DEVICES_PER_SYSTEM` | No | Default `1000` |

## DigitalOcean Managed MongoDB

1. In the DO control panel, create **Databases → MongoDB** (choose region near your app).
2. Create a database user with a strong password.
3. Under **Connection details**, copy the **Connection string** (`mongodb+srv://...`).
4. Set `MONGODB_URI` on the app (App Platform env or Droplet `.env`). Example:

   ```
   MONGODB_URI=mongodb+srv://doadmin:PASSWORD@db-mongodb-nyc3-12345.mongo.ondigitalocean.com/mooreview_cloud?tls=true&authSource=admin&replicaSet=db-mongodb-nyc3-12345
   MONGODB_DB=mooreview_cloud
   ```

5. **TLS**: DO Managed MongoDB requires TLS; `mongodb+srv` URLs enable it automatically.
6. **IP allowlist**: In the database **Settings → Trusted sources**, add:
   - App Platform: enable **App Platform** as a trusted source, or
   - Droplet: the Droplet’s public IP (or VPC private IP if app and DB share a VPC).
7. Run indexes once after first deploy: `npm run migrate` (or indexes are ensured on app boot).

## DigitalOcean App Platform

1. Connect this repo; set **Run command** to `npm start`.
2. Add env vars: `MONGODB_URI`, `JWT_SECRET`, `MONGODB_DB`, `NODE_ENV=production`.
3. Add the app as a **trusted source** on the Managed MongoDB cluster.
4. Optional: set **HTTP port** to `3100` (or bind `PORT` from platform).

## Droplet (systemd)

1. Clone to `/opt/mooreview-cloud`, `npm ci --omit=dev`.
2. Copy `.env.example` → `.env` and set `MONGODB_URI` to your DO connection string (not localhost).
3. Install `deploy/mooreview-cloud.service` (uses `src/server.js` for the cloud API).
4. `sudo systemctl enable --now mooreview-cloud`.
5. Terminate TLS at nginx/Caddy; proxy to `127.0.0.1:3100`.

## Local development

```bash
cp .env.example .env
docker compose up -d mongo
npm install
npm run dev
```

Health: `GET http://localhost:3100/health`

For production-like testing against DO Mongo, replace `MONGODB_URI` in `.env` with your `mongodb+srv://` string and ensure your IP is allowlisted.

## est-pc edge runtime (fork)

The legacy ST runtime / historian fork remains at repo root `server.js`:

```bash
npm run start:runtime
```

That process is separate from the multi-tenant cloud API (`npm start` → `src/server.js`).
