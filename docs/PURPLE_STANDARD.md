# Purple Standard design system

Canonical visual identity for **PeakLogic** products (appliance, cloud, CMMS integration). Product name is always **PeakLogic**; palette and patterns come from TPS CMMS / Purple Standard.

## Color tokens

| Token | Hex | Usage |
|-------|-----|--------|
| `--ps-purple` | `#6f42c1` | Primary brand, navbar, buttons, links |
| `--ps-purple-dark` | `#5a32a3` | Hover states, active nav |
| `--ps-purple-deep` | `#4e2a84` | Gradient end, deep accents |
| `--ps-purple-light` | `#e9d5ff` | Wordmark accent on dark backgrounds |
| `--ps-purple-muted` | `rgba(111, 66, 193, 0.12)` | Subtle fills |
| `--ps-gradient-start` | `rgba(111, 66, 193, 0.9)` | Login splash overlay |
| `--ps-gradient-end` | `rgba(78, 42, 132, 0.95)` | Login splash overlay |
| `--ps-shadow` | `rgba(111, 66, 193, 0.3)` | Button hover shadow |

### Surfaces & text

| Token | Value |
|-------|--------|
| Page background | `#f8f9fa` (Bootstrap `bg-light`) |
| Card background | `#ffffff` |
| Body text | `#212529` |
| Muted text | `#6c757d` |

Status colors (unchanged): success `#198754`, warning `#fd7e14`, danger `#dc3545`.

## Typography

```css
font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

- Headings: `font-weight: 700`
- Wordmark: `letter-spacing: 0.02em`

## Wordmark: PeakLogic

- **Product name:** `PeakLogic` (camelCase; not “Purple Standard CMMS” as product name)
- **On dark purple backgrounds:** `moore` in white, `VIEW` in `#e9d5ff`
- **On light backgrounds:** `moore` in `#212529`, `VIEW` in `#6f42c1`

HTML pattern:

```html
<span class="brand-mark">moore<span>VIEW</span></span>
```

## Components (Bootstrap 5)

Match TPS CMMS class names where possible:

| Class | Purpose |
|-------|---------|
| `.btn-purple` / `.btn-mv` | Primary action button |
| `.text-purple` | Primary text accent |
| `.bg-purple` | Primary background |
| `.btn-outline-purple` | Secondary outline button |
| `.nav-mv` | Top navigation bar gradient |
| `.transition-btn` | Subtle lift on hover |

### Primary button

- Background: `#6f42c1`
- Hover: `#5a32a3`
- Text: `#ffffff` (contrast ratio > 4.5:1)

### Login split panel

- Left: hero image + purple gradient overlay (`135deg`, start → end tokens)
- Right: white card, floating labels, purple submit button
- Reference: `tpscmms/views/login.ejs`, `peaklogic-cloud/views/login.ejs`

## Repo application

| Repo | Styles |
|------|--------|
| **est-pc** | `public/css/pc.css` — `:root` accent, topbar |
| **peaklogic-cloud** | `public/css/peaklogic.css` — web + admin UI |
| **tpscmms** | Inline + partial styles in EJS (reference source) |

## Do not use

- Blue primary `#0d6efd`, `#2563eb` for brand chrome
- Teal accent `#20c997` for wordmark
- Light blue `#93c5fd` for VIEW span (legacy est-pc)

Powered-by line (optional footer): **Purple Standard** — [Purple Standards](https://acesepticandwaste.com)
