# User Personas

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** domain-model.md

Derived from the actual role strings found in code (`domain-model.md` §1) rather than invented — each persona below maps to a real `role` value.

## 1. Platform Administrator (`platform_admin`)
Operates the Control Center (`/admin/*`) — creates tenants, toggles CMMS entitlement, and (as of this session) can drill directly into any tenant's live portal. Authenticates via the `mv_platform_admin` shared-secret cookie, distinct from every other persona below. See `security-architecture.md` for why this persona's credential model is architecturally different from everyone else's.

## 2. Tenant Administrator (`tenant_admin`, appliance `admin`)
The customer-side owner of one organization's account — manages their own users, sites, and settings within their tenant. Cannot see or act on other tenants' data (no `platform_admin` bypass).

## 3. Supervisor / Operator / Technician (`supervisor`, `operator`, `technician`)
Day-to-day users of the HMI/Studio dashboard — monitoring live tag values, acknowledging alarms, working CMMS work orders. The role hierarchy between these three was not fully traced this session (which specific UI actions are gated to which of the three) — see `security-architecture.md`'s note that authorization checks are scattered per-route rather than centrally documented.

## 4. Viewer (`viewer`)
Read-only access, inferred from the role name — specific enforcement points not traced this session.

## 5. Homeowner (`homeowner`)
A distinct role from the tenant-organization staff roles above — corroborates the residential-pool/single-family demo data found in `test/fixtures/` and `docs/RESIDENTIAL_POOL_SPA.md`. Likely represents an end customer of a pool-service or similar residential channel-partner relationship, viewing their own single property rather than a multi-site organization. Not fully investigated this session.

## 6. Channel Partner Admin / Technician (`partner_admin`, `partner_technician`)
Roles distinct from a tenant's own staff — `src/tenants/partnerAccess.js`'s `canAccessTenant()` gates a partner's access to a *linked* tenant's data (via `customer.partnerId === user.tenantId`), corroborating a channel-partner/dispatcher business model similar in shape to (but a separate implementation from) `PeakLogic-AWS`'s own Channel Partner Portal concept.

## 7. Appliance Gateway (`appliance_gateway`)
A non-human/service-account-style role (name suggests a device or hub identity, not a person) — not investigated further this session.

## 8. What this document does not cover

Goals, pain points, or day-in-the-life narratives for each persona — a real product/UX exercise, not something derivable purely from role-string greps. This document establishes *who the roles are*, not *what they need*; a follow-up pass with actual user research or product-owner input would be needed for that.
