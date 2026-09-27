# PeakLogic Cloud Server

Multi-tenant **Linux cloud API** (account → location → system → device) with MongoDB on Digital Ocean.  
Headless runtime: ST engine, REST API, tag historian, MQTT fleet hub. The frontend (a consolidated React/Vite/Tailwind SPA — see `docs/architecture/feature-gap-analysis.md`) is not yet built; today's UI is server-rendered EJS (auth pages only).

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

See **[DEPLOY.md](./DEPLOY.md)** for Digital Ocean + production domain (**TBD** — not yet decided) and Managed MongoDB setup.

Environment template: **[.env.example](./.env.example)** (placeholders only — set real values in DO dashboard).
