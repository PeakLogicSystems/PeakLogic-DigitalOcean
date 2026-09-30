# Compliance Roadmap

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** threat-model.md

**Not legal advice.** This document records what was and wasn't found in the codebase regarding compliance posture; it makes no claim about what regulatory framework actually applies to this product or its customers, and no filing or certification action is recommended by it.

## 1. What was found

No SOC 2, HIPAA, or other compliance-mapping document exists anywhere in `docs/` as of this session (contrast with `PeakLogic-AWS`'s dedicated `soc2-control-mapping.md`). No evidence of a completed or in-progress third-party security audit was found in the repository.

## 2. Data sensitivity, inferred from the domain

This product handles operational/facility data (equipment telemetry, alarms, work orders) and, per the demo fixtures referencing assisted-living and residential properties (`test/fixtures/`, `docs/RESIDENTIAL_POOL_SPA.md`), potentially data about occupied residential or care-facility sites. This is **not** the same sensitivity class as, say, payment card data or protected health information in the clinical-records sense — but "assisted living" facility operational data could plausibly intersect with resident privacy expectations depending on exactly what's tracked. This was not investigated further this session; flagged as worth a deliberate scoping conversation with the user rather than assumed either way.

## 3. Relevant existing security posture (cross-referenced, not newly assessed)

- Session cookies are `HttpOnly` (mitigates XSS-based session theft) — see `security-architecture.md`.
- No encryption-at-rest policy found documented for MongoDB-stored data (DigitalOcean Managed MongoDB's own at-rest encryption defaults were not independently verified this session).
- No documented policy for data retention or deletion (tenant offboarding, GDPR/CCPA-style "right to be forgotten" requests) was found.

## 4. If real compliance work becomes a priority

The `PeakLogic-AWS` repo's `docs/architecture/soc2-control-mapping.md` and `compliance-certification-roadmap.md` are a reasonable structural template to adapt from — but note that repo's actual control mappings are specific to its own AWS-based infrastructure (IAM, VPC, Cognito) and would need to be substantially rewritten for this product's DigitalOcean-droplet-plus-managed-Mongo topology, not copied wholesale.

## 5. What this document does not cover

Any actual legal/regulatory determination of what applies to PeakLogic's customers or their data — that requires a qualified professional, not an AI reading source code.
