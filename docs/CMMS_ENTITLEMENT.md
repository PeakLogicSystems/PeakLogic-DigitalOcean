# Cloud CMMS entitlement

Platform admins enable TPS CMMS per organization.

## Endpoints

### `GET /api/tenant`
Returns `{ tenant, cmmsEnabled, user }`.

### `GET /api/auth/me`
Returns `{ user, tenant, cmmsEnabled }`.

### `PATCH /api/admin/tenants/:id/cmms`
Platform admin only.

```json
{ "enabled": true, "externalUrl": "https://cmms.example.com" }
```

Response: `{ tenant, cmmsEnabled }`.

### `GET /api/tenant/cmms`
Tenant-scoped status for Cloud Studio CMMS page.

When `cmmsEnabled` is false, hide or disable CMMS UI entry points for that tenant.
