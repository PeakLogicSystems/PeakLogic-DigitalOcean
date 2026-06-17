# MooreVIEW Cloud Server

Multi-tenant **Linux cloud API** (account → location → system → device) with MongoDB on Digital Ocean.  
Headless runtime: ST engine, REST API, tag historian, MQTT fleet hub. Pair with **mooreview-client** for HMI.

## Start (local)

```bash
npm install
cp .env.example .env   # set MONGODB_URI and JWT_SECRET
npm run indexes        # ensure MongoDB indexes (also runs on startup)
npm start
```

- Health: `GET /health`
- Default port **3100** (`PORT` in `.env`)

## Deploy (production)

See **[DEPLOY.md](./DEPLOY.md)** for Digital Ocean + **mooreview.io** (`api.mooreview.io`, `app.mooreview.io`) and Managed MongoDB setup.

Environment template: **[.env.example](./.env.example)** (placeholders only — set real values in DO dashboard).

## Regenerate from est-pc fork

```powershell
cd ..\est-pc
powershell -File scripts\create-product-forks.ps1 -Products cloud
```
