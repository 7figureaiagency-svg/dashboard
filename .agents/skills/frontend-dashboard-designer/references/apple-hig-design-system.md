# Apple Human Interface Guidelines (HIG) Design System for CRM

This reference codifies the exact design tokens, material layers, and interaction specifications for the Nextgn Realtors CRM Dashboard.

---

## 1. Continuous Curvature Squircles

Standard CSS `border-radius` creates sharp circular arcs. Apple interfaces use **superellipses (squircles)** with continuous curvature. We simulate this via calibrated OKLCH border radii and nested ratios:

| Token | Radius Value | Usage |
| :--- | :--- | :--- |
| `--radius-xs` | `6px` | Inner badges, micro pill indicators, table inline tags |
| `--radius-sm` | `8px` | Segmented controls, dropdown items, filter chips |
| `--radius-md` | `12px` | Standard buttons, input fields, nested cards |
| `--radius-lg` | `16px` | Floating toolbars, sub-dialogs, chat bubbles |
| `--radius-xl` | `20px` | Main dashboard cards (`.apple-card`), table containers |
| `--radius-2xl` | `24px` | Inspector drawer header, modal sheets, KPI stat tiles |
| `--radius-full` | `9999px` | Avatars, dot-pill status badges (`.crm-badge`), floating pills |

**Nested Squircle Rule**: When nesting a container inside another, the inner radius must equal the outer radius minus the padding:
$$\text{radius}_{\text{inner}} = \text{radius}_{\text{outer}} - \text{padding}$$
*(Example: Outer card `rounded-2xl` (24px) with `p-3` (12px) must use `rounded-md` (12px) for inner elements).*

---

## 2. Material Hierarchy & `.apple-glass`

Apple interfaces use translucent materials that pick up the background colors without losing contrast.

### Light Mode Materials
- **Canvas (`var(--background)`)**: OKLCH System Gray 6 (`oklch(0.985 0.003 240)` / `#F5F5F7`).
- **Elevated Card (`var(--card)`)**: Pure White (`oklch(1 0 0)`), Hairline border `rgba(0,0,0,0.06)`, shadow `0 2px 8px rgba(0,0,0,0.04)`.
- **Translucent Navigation (`.apple-glass`)**:
  ```css
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  background: color-mix(in srgb, var(--card) 80%, transparent);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
  ```

### Dark Mode Materials (Obsidian Elegance)
- **Canvas (`var(--background)`)**: Deep Obsidian (`oklch(0.14 0.022 260)` / `#0C1017`).
- **Elevated Card (`var(--card)`)**: Charcoal Slate (`oklch(0.22 0.028 260)` / `#182030`), hairline border `rgba(255,255,255,0.12)`, shadow `0 4px 20px rgba(0,0,0,0.35)`.
- **Translucent Sticky Header (`.dark .apple-glass`)**:
  ```css
  background: rgba(22, 28, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25);
  ```

---

## 3. Typography Scale & Font Ergonomics

- **Font Family**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Plus Jakarta Sans", sans-serif`.
- **Tabular Figures**: Always enable `tabular-nums` (or CSS `font-feature-settings: "tnum"`) for:
  - Phone numbers (`+91 98765 43210`)
  - Timestamps (`11:45 AM`, `22 Oct 2026`)
  - Financial values (`₹75,00,000`, `₹1.25 Cr`)
  - Status counts and lead triage badges (`(14)`)

### Typographic Hierarchy Table
| Style | Size / Leading | Weight | Usage |
| :--- | :--- | :--- | :--- |
| **Large Title** | `text-2xl` (24px) / `leading-tight` | `font-bold` (700) | Main section headers (Dashboard, Inventory) |
| **Headline** | `text-base` (16px) / `leading-snug` | `font-semibold` (600) | Card titles, Inspector drawer title |
| **Subhead** | `text-sm` (14px) / `leading-normal` | `font-medium` (500) | Table column headers, tab labels, lead names |
| **Body** | `text-sm` (14px) / `leading-relaxed` | `font-normal` (400) | Descriptions, chat messages, summary notes |
| **Footnote** | `text-xs` (12px) / `leading-tight` | `font-medium` (500) | Timestamps, meta details, carpet area specs |
| **Caption** | `text-[11px]` / `leading-none` | `font-semibold` (600) | Dot-pill status badges, hot indicator tags |

---

## 4. Tactile Feedback & Micro-Interactions

Buttons and interactive cards must feel physically responsive:
- **Active Scale**: `.apple-button` applies `active:scale-[0.98]` on click/tap with `transition: transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)`.
- **Hover Transition**: Subtle surface background tint shift (`hover:bg-muted/60 transition-colors duration-150`).
- **Focus Rings**: Never remove focus outlines; use Apple-style blue ring offset:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
