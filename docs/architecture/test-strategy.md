# Test Strategy

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** api-specification.md

## 1. What exists

- **238 test files** under `test/*.test.js`, run via Node's built-in test runner: `npm test` → `node --test test/*.test.js`. No Jest/Mocha/Vitest — no test framework dependency in `package.json` at all.
- `test/fixtures/` and `test/helpers/` support directories — e.g. `test/fixtures/nextcenturydata.sample.json`, `test/helpers/nextcenturySampleMock.js`, confirming real fixture-driven tests for at least the NextCentury driver integration.
- `npm run green` runs the same suite preloaded with an in-memory config store (`test/preload-config-memory.js`) — this is the closest thing to a "CI-safe" run command, avoiding a dependency on real MongoDB.
- `npm run test:baseline` runs a specific curated subset (MQTT Parc, Opta driver, ST bytecode, remote scan engine tests) with the same memory-config preload — suggests these are considered the highest-value/most load-bearing tests, worth treating as a smoke-test tier if a CI pipeline is ever built (see `cicd-pipeline.md`).

## 2. Coverage breadth (inferred from filenames, not verified line-by-line)

Test files span nearly every subsystem named in `prd.md`'s functional area table: alarms, appliance auth, assisted-living demo scenarios, the NextCentury driver family, MQTT Parc, PDM, ST bytecode/scan engine — this is a **real, broad, pre-existing test investment**, not a thin or token suite. A new contributor should not assume "no tests exist" the way a from-scratch greenfield project's early SRS might — the bar here is contributing tests consistent with this existing density, not establishing testing from zero.

## 3. What was verified this session (not full test runs — targeted checks only)

- Every JS file touched this session was syntax-checked with `node -c` before being considered done (`hmi.js`, `hmiSetupUi.js`, `facilityDrawApp.js`, `adminWeb.js`, `tenantService.js`, `tenantStore.js`) and EJS templates compile-checked via `ejs.compile()`.
- Behavior was verified **live in a running browser** against the actual dev server for every fix (camera popup open/close/backdrop-click, composer-mode deep link, tenant drill-down end-to-end, brand sizing ratios via `getComputedStyle`) rather than by writing new automated tests for this session's fixes.
- **Gap:** none of this session's bug fixes (camera popup, composer-mode race, popup-blocker workaround, CSS specificity fix, platform-admin session bridge) have a corresponding automated regression test added. Given the codebase's existing test density, this is inconsistent with its own established practice — see `technical-debt-register.md`.

## 4. What a real Test Strategy document should still cover (not attempted this session)

Coverage measurement (no coverage tool/config found), a test pyramid breakdown (unit vs. integration — the flat `test/*.test.js` naming doesn't distinguish them), browser/E2E testing strategy for the client-side JS (none found — `public/js/` behavior appears to be verified manually/live, as this session did, not through an automated browser test suite), and a policy for when a bug fix requires a new regression test (recommended: yes, going forward, given the gap in §3).
