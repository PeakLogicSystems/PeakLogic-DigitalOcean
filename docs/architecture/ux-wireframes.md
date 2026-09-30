# UX Wireframes / Design System Notes

**Status:** 🟡 Draft v1 — reverse-engineered 2026-09-29
**Depends on:** information-architecture.md

No actual wireframe files (Figma links, image mockups) were found in this repo — this document instead records the real, implemented design-system conventions this session worked with directly, as the closest available substitute.

## 1. Brand tokens (verified, `public/css/peaklogic.css` header comment)

```
--ps-purple: #7c3aed        (Tailwind violet-600)
--ps-purple-dark: #6d28d9
--ps-purple-deep: #5b21b6
--ps-purple-light: #ede9fe   (do NOT use this for "Logic" — see CLAUDE.md)
--peaklogic-green: #22c55e
--peaklogic-navy: #0f172a
```

Font: Inter (weights 400/600/700/800), loaded via Google Fonts `<link>` tags per-page (not bundled) — several pages (dashboard.ejs and its siblings using `pc.css`) did **not** load Inter at all until this session added it, meaning their headers rendered in a system-font fallback instead of the brand typeface; fixed as part of the header/login work (see `CHANGELOG.md`).

## 2. The logomark+logotype lockup — the one component with an external spec

Referenced throughout this session from a brand guide artifact the product owner maintains. Two forms in use:
- **Compact (in-toolbar):** `<img>` icon + `<span>` wordmark, sized via the `em`-ratio CSS pattern documented in `CLAUDE.md`.
- **Full lockup (splash/login):** inline SVG matching the guide's exact `viewBox="0 0 230 48"` markup — used on both login pages. Prefer this form for any new full-size brand placement (marketing pages, splash screens) rather than composing icon+text, since it's the only form that can't drift from spec.

## 3. Login page pattern (established this session)

Single centered composition, not a split hero/card layout: full-page diagonal gradient background (navy → deep purple, not flat purple — a flat purple background was explicitly rejected earlier in this product's history because it washes out the purple "Logic" wordmark), centered logo lockup, one translucent "glass" card (`rgba(255,255,255,0.06)` on a dark background, `inset 0 0 10px rgba(0,0,0,0.2)` shadow, plain white input fields, bold solid-purple submit button), small copyright footer pinned to the bottom of the viewport. Modeled on a reference the user supplied (a NextCentury Meters login page) but adapted to PeakLogic's own brand colors and the specific form fields this product's login actually needs (Organization ID + MFA step in cloud mode, none of which the reference had).

## 4. Popup/dialog conventions (dashboard shell)

`views/dashboard.ejs` uses two parallel popup systems: a `data-popup-open`/`data-popup-close` delegated-click-handler system (`public/js/app.js`'s `bindPopups()`), and several dedicated `<dialog>`-element-based popups with their own individually-bound close handlers (`st-pid-cancel`, `project-picker-cancel`, etc.). Both were investigated this session for "broken Close button" reports and found working — the actual broken interactions were the camera popup and Facility Builder composer deep link (neither of which used either popup system — they were plain custom show/hide logic with a missing handler). See `facility-builder-hmi-composer.md` §5's note on this bug pattern.

## 5. What this document does not cover

Actual visual mockups/wireframes for un-built features, accessibility audit findings (no formal a11y review was performed this session, though `aria-label`/`role` attributes are present in several places touched, e.g. the login SVG lockups), or a component-library-style catalog of every reusable UI piece (buttons, badges, form-floating inputs) across the three shells named in `information-architecture.md`.
