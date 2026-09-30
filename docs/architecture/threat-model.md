# Threat Model

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** security-architecture.md

This is a first-pass, code-reading-level threat model, not a formal STRIDE/PASTA exercise with a security review sign-off. It names the risks visible from this session's work; it does not claim completeness.

## 1. Threats specific to the Auth Triad (see security-architecture.md for full detail)

| Threat | Vector | Current mitigation | Gap |
|---|---|---|---|
| Platform-admin credential compromise | `PLATFORM_ADMIN_KEY` leaked (logs, env file, shoulder-surfing) | Constant-time comparison prevents timing attacks on the check itself | The key itself is a single shared secret with no rotation mechanism, no per-admin identity, and (as of this session) can mint a session for *any* tenant via the drill-down bridge — compromise blast radius is "every tenant," not scoped |
| Session fixation via `?token=` query param | `extractToken()` accepts a token from the URL query string, not just cookie/header | None specific found | A `mv_session` token shared via a URL (chat, email, logs, browser history, referrer headers) authenticates exactly like the cookie — this is a real, currently-live behavior, not hypothetical |
| Session invalidation on every restart (cloud, dev config) | Unset `JWT_SECRET` → random secret generated at boot | Console warning logged | Only a mitigation if someone reads the log; silent in practice for an unattended restart. **Must** be set in real prod deployments — verify it actually is, don't assume |
| Dead auth code confusion | `src/routes/web.js`/`webSession.js` never mounted but still present | None — purely a documentation fix this session (`security-architecture.md` §1.3) | A future contributor could plausibly "fix" or extend dead code believing it's live, as this session initially did with `login.ejs` |

## 2. Threats specific to tenant isolation

| Threat | Vector | Current mitigation | Gap |
|---|---|---|---|
| Cross-tenant data leak via a missed scope check | A new route handler queries the config store or a tenant-scoped collection without filtering by `activeTenantId` | Convention (every store function that should take a tenant ID does) | No framework-level enforcement (no equivalent of AWS's `withTenant()` that fails loudly if skipped) — a missed scope is a silent data leak, not a thrown error. This is the single highest-value future investment for reducing this whole threat category |

## 3. Threats specific to field-device connectivity

Not deeply investigated this session — flagged for a future pass:
- BACnet/Modbus have no strong built-in authentication in their base protocols; whatever network-segmentation assumptions this product relies on for appliance-mode field-device security were not verified against the actual driver code.
- MQTT ("Parc") broker credential/TLS configuration was not reviewed this session.

## 4. Threats specific to the web application surface

- No rate limiting found on any login endpoint in the files read this session (`/login`, `/admin/login`, `/api/auth/login`) — brute-force risk not assessed further.
- No CSRF token mechanism observed on the form-POST admin routes (e.g., `/admin/tenants/:id/enter`) — cookie is `SameSite=Lax`, which mitigates cross-site *form* submission in most modern browsers for this specific case (top-level navigation POST), but this wasn't a deliberately designed CSRF defense, just an incidental property of the cookie setting.

## 5. What this document does not cover

Supply-chain/dependency vulnerability scanning (no `npm audit` policy or Dependabot config found), infrastructure-level threats to the DigitalOcean droplet itself (covered partially by `docs/CLOUD_DEPLOY_DO.md`'s firewall rules, not re-analyzed here), and physical/on-site security for appliance-mode deployments (out of this document's scope entirely).
