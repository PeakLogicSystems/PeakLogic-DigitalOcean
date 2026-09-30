# Architecture Artifacts

Documents are produced in dependency order — each one builds on decisions locked in by the ones before it. Later documents may force revisions to earlier ones; check this table for live status before assuming anything is final. This discipline is adapted from the `PeakLogic-AWS` and IronQuill projects' own artifact lists (see that repo's `docs/architecture/README.md` for the original) — items specific to those products' domains (AWS CDK infrastructure, IoT device fleets, an immutable ledger) are replaced here with items specific to this product's actual scope: a dual-deployment-mode (cloud SaaS / on-prem appliance) SCADA, HMI, and CMMS monolith.

**Note on existing code and docs:** this repo already has a working, deployed v2.3.7 product and an extensive organic `docs/*.md` tree (see the repo root's `docs/` directory) built before this architecture-first discipline was adopted (2026-09-29). That material is **reference, not superseded** — every document below was written by reverse-engineering the real implementation as it exists today, not designed first and implemented after. Where a document identifies a gap between what's documented and what's built, that gap is called out explicitly in the document rather than silently papered over.

| # | Artifact | Status |
|---|----------|--------|
| 1 | [Vision Document](vision-document.md) | 🟡 Draft v1 — reverse-engineered 2026-09-29 |
| 2 | [Product Requirements Document (PRD)](prd.md) | 🟡 Draft v1 |
| 3 | [Software Requirements Specification (SRS)](srs.md) | 🟡 Draft v1 |
| 4 | [Domain Model](domain-model.md) | 🟡 Draft v1 |
| 5 | [User Personas](user-personas.md) | 🟡 Draft v1 |
| 6 | [User Stories](user-stories.md) | 🟡 Draft v1 |
| 7 | [Information Architecture](information-architecture.md) | 🟡 Draft v1 |
| 8 | [UX Wireframes / Design System Notes](ux-wireframes.md) | 🟡 Draft v1 |
| 9 | [Security Architecture](security-architecture.md) | 🟡 Draft v1 |
| 10 | [Multi-Tenant & Deployment-Mode Architecture](multi-tenant-deployment-modes.md) | 🟡 Draft v1 |
| 11 | [Device & Protocol Integration Architecture](device-protocol-integration.md) | 🟡 Draft v1 |
| 12 | [Facility Builder & HMI Composer Architecture](facility-builder-hmi-composer.md) | 🟡 Draft v1 |
| 13 | [Data & Storage Architecture](data-storage-architecture.md) | 🟡 Draft v1 |
| 14 | [API Specification](api-specification.md) | 🟡 Draft v1 (index-level — see doc for scope) |
| 15 | [Deployment Architecture](deployment-architecture.md) | 🟡 Draft v1 |
| 16 | [CI/CD Pipeline](cicd-pipeline.md) | 🔴 Proposed — no CI exists today, this is a gap analysis + plan, not a description of something built |
| 17 | [Test Strategy](test-strategy.md) | 🟡 Draft v1 |
| 18 | [Threat Model](threat-model.md) | 🟡 Draft v1 |
| 19 | [Technical Debt Register](technical-debt-register.md) | 🟡 Draft v1 |
| 20 | [Roadmap (MVP + Enterprise)](roadmap.md) | 🟡 Draft v1 |
| 21 | [Compliance Roadmap](compliance-roadmap.md) | 🟡 Draft v1 |

**What "Draft v1" means here, specifically:** each document reflects a good-faith, single-session reverse-engineering pass by an AI assistant with live access to the running code, not a reviewed/approved artifact in the sense `PeakLogic-AWS`'s process uses those words. Treat every factual claim as *probably* correct and *specifically checkable* against the cited file paths — not as settled truth. A human (or a future AI session) should read each document against the code it cites before relying on it for a real decision, and bump the status to "✅ Approved" only after doing so.

**Why this was written now:** the user's explicit purpose is enabling a fresh clone of this repository, opened by a different Claude account with no memory of this session, to understand what has been built, why, and what the intended development direction is — see `CHANGELOG.md`'s `[Unreleased]` section for the concrete changes this same session made, and the root `CLAUDE.md` for the fast-path orientation a new session should read first.
