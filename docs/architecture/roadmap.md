# Roadmap (MVP + Enterprise)

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** technical-debt-register.md

Synthesized from `docs/ARCHITECTURE.md`'s existing "Cloud roadmap (after appliance)" section (still the authoritative source for the product's own stated direction) plus the gaps surfaced by this session's Technical Debt Register.

## 1. Near-term (closes real, currently-open gaps)

1. **Set `JWT_SECRET` explicitly in every real deployment** (TD-15) — a one-line env change with outsized blast-radius reduction; do this before anything else on this list.
2. **Resolve or clearly mark TD-12** (dead auth code) — a deliberate decision (remove vs. mark-dead-with-comment), not a code change requiring design work.
3. **Minimal CI** (`cicd-pipeline.md`'s proposal, TD-16) — lowest-effort, highest-leverage item that isn't already someone's explicit decision to defer.
4. **Regression tests for this session's fixes** (TD-17) — camera popup, composer-mode race, brand-ratio CSS — given the codebase's own established test density, this is closing a gap against its *own* norm, not adding new process.

## 2. Medium-term (the product's own stated direction, from docs/ARCHITECTURE.md)

Per the existing "Cloud roadmap" section, unchanged by this session:
1. Split the cloud monolith into the planned four processes (ingestion / alarm+notify / GUI API / AI) — explicitly **not started** as of this session (see `multi-tenant-deployment-modes.md` §4).
2. Extract shared packages (`userProfileSchema`, `tagStore`, alarm evaluation, API routers) so cloud imports them rather than forking from the appliance codebase — a prerequisite for #1, also not started.
3. Wire email/SMS alarm delivery (queue exists, SendGrid/Twilio integration does not) — listed "Open" in the pre-existing appliance completion checklist, still open.
4. Target scale stated in the existing docs: 1k locations/systems/devices per tenant today, target 10M devices / 10K users with sharded ingestion and stream-based alarm evaluation — a long-horizon target, not a near-term commitment.

## 3. Architectural investments worth sequencing deliberately

1. **Framework-level tenant-scoping enforcement** (TD-13) — the single highest-leverage security investment named in this pass; do this *before* scaling to meaningfully more tenants or engineers, since it gets harder to retrofit the more routes exist.
2. **Per-admin identity for the Control Center** (TD-10) — worth doing before onboarding more than one human platform administrator, since the shared-secret model has no way to distinguish or audit them today.
3. **Canonical data schema documentation** (TD-19) and **a real API specification pass** (TD-21) — both explicitly deferred multi-session efforts; sequence after the above since they're documentation debt, not functional risk.

## 4. Explicit non-roadmap (things intentionally not planned, as far as this session could determine)

- Native mobile apps — no evidence anywhere in this codebase that one is planned (contrast with `PeakLogic-AWS`, which has a dedicated iOS Application architecture doc for its own product).
- Migrating off MongoDB to a SQL database — no evidence this is under consideration; the existing dual-mode (Mongo/JSON-file) pattern appears to be a deliberate, ongoing design choice (see `data-storage-architecture.md` §1), not a stopgap awaiting replacement.

## 5. What this document does not cover

Specific target dates or version numbers — none were found associated with any of the above in the existing docs, and this session did not fabricate any. Business/commercial roadmap (pricing, go-to-market) — out of scope for an architecture document; see `compliance-roadmap.md` for the one adjacent business-facing item this set does cover.
