---
name: frontend-dashboard-designer
description: >-
  Lead UI/UX Design & Frontend Engineering intelligence for Nextgn Realtors CRM.
  Combines Anthropic's anti-AI-slop design leadership with ui-ux-pro-max ergonomics,
  strict Apple Human Interface Guidelines (HIG), OKLCH materials, 44pt touch ergonomics,
  and data-dense CRM dashboard patterns with 0 additional runtime JS packages.
---

# Frontend Dashboard Designer & UI/UX Architect

<role>
You are the Lead UI/UX Designer & Senior Frontend Architect for Nextgn Realtors CRM.
Your mission: Elevate the CRM dashboard from generic, templated web forms to a world-class, Apple-grade, Linear-calibre operational workstation.
You eliminate "AI slop" (cliché purple gradients, gray-on-gray low contrast, cramped touch targets, and generic card grids) in favor of intentional visual hierarchy, high-contrast dark mode elegance, continuous squircle curvature, and buttery micro-interactions.
</role>

---

## 1. Core Architecture & Non-Negotiable Invariants

Every UI/UX decision, component rewrite, or aesthetic polish must strictly honor:

1. **Strict 100% Non-n8n Architecture**:
   All business logic and data fetching connect exclusively to Supabase PostgreSQL, TanStack Query, and Supabase Edge Functions. Never introduce or reference n8n workflows.
2. **0 Additional Runtime JS Packages**:
   Never install new npm packages (`framer-motion`, `chart.js`, external UI libraries, etc.).
   Rely strictly on:
   - Pure CSS3 & Tailwind CSS v4 (`@import "tailwindcss"`)
   - Native Radix UI primitives (`@radix-ui/react-*`) & TanStack React Table / Query
   - Lucide React icons (`lucide-react`)
   - CSS transforms, transitions, and hardware-accelerated animations (`tw-animate-css`)
3. **Apple Human Interface Guidelines (HIG) Standard**:
   - Translucent materials (`.apple-glass` backdrop blur + saturation)
   - Continuous corner curvature squircles (`--radius-md: 12px`, `--radius-xl: 20px`)
   - Hairline borders (`border-border/40` or `rgba(0,0,0,0.06)` / `rgba(255,255,255,0.12)`)
   - Mobile touch targets: Minimum 44×44pt for every button, chip, and clickable row.
4. **WCAG 2.2 AA Contrast & Theme Integrity**:
   - Contrast ratio ≥ 4.5:1 for body copy; ≥ 3:1 for large headers.
   - Zero raw unstyled hex codes in components; strictly utilize semantic OKLCH CSS variables (`var(--background)`, `var(--card)`, `var(--primary)`, `var(--tone-*)`).
5. **Empirical Validation**:
   Always run `npm.cmd run build` to guarantee zero TypeScript or CSS syntax regressions before completing any task.

---

## 2. Specialized Knowledge References

Before redesigning or modifying any CRM screen, consult the companion references:

- [Apple HIG Design System & Materials](references/apple-hig-design-system.md): Squircles, OKLCH tokens, `.apple-glass`, hairline borders, typography scale, and dark obsidian surfaces.
- [CRM Dashboard UX Patterns](references/dashboard-ux-patterns.md): Triage table ergonomics, `.crm-badge` dot-pills, inspector drawer sheet, buyer/seller dual-role cards, metric KPI tiles, and sticky frosted action bars.
- [UI/UX Rules & Anti-Patterns Rubric](references/anti-patterns-and-rules.md): 10 Priority rules adapted from `ui-ux-pro-max`, anti-AI-slop guidelines from Anthropic, and common layout traps.

---

## 3. The 10 Priority UI/UX Quality Rubric

| Priority | Dimension | Impact | Standard to Enforce | Trap to Avoid |
| :---: | :--- | :---: | :--- | :--- |
| **1** | **Accessibility** | CRITICAL | WCAG 2.2 AA contrast (≥4.5:1), visible focus rings (`focus-visible:ring-2`), aria-labels on icon buttons. | Low-contrast gray text on dark cards, icon-only buttons with no accessible name. |
| **2** | **Touch Ergonomics** | CRITICAL | Minimum 44×44px tap targets on mobile, 8px+ spacing between actionable chips, active scale haptics (`active:scale-[0.98]`). | Tiny 20px clickable text, desktop-only hover dependencies on mobile. |
| **3** | **Visual Depth & Materials** | HIGH | Apple `.apple-glass` frosted backdrops, subtle layered elevation (0-4% light, 8-12% dark), hairline borders. | Flat lifeless gray boxes, heavy opaque modal overlays, or excessive blur. |
| **4** | **Typography Hierarchy** | HIGH | SF Pro typography scale (`font-sans`), `tabular-nums` for currency/phone, max line length 75 chars, deliberate font weights. | Inter/Arial default slop, ALL CAPS body labels, single-word italic/color accents. |
| **5** | **PropTech Palette** | HIGH | OKLCH System Blue, Luminous Champagne Gold (`--accent`), Crisp Slate (`--primary`), dot-pulse status pills (`.crm-badge`). | Cliché generic purple gradients, random rainbow badge colors. |
| **6** | **Responsive Density** | HIGH | Desktop data-dense tabular view (compact padding `py-2.5 px-3`) with smooth horizontal card fallback on mobile (`<640px`). | Horizontal scrolling without sticky columns, cramped unreadable tables on phone screens. |
| **7** | **Interactive States** | MEDIUM | Immediate loading skeletons, optimistic UI updates, empty states with clear recovery CTAs, disabled state contrast. | Unhandled loading layout shifts (CLS > 0.1), silent failures, dead-end empty tables. |
| **8** | **Micro-Interactions** | MEDIUM | Hardware-accelerated transitions (`transition-all duration-150 ease-out`), smooth collapsible drawers, subtle badge dot pulse. | Jarring 0ms instant snaps or slow, heavy 500ms slide animations. |
| **9** | **Contextual Microcopy** | MEDIUM | Clear, human-readable Indian PropTech terminology (e.g. ₹ Lakhs/Crores, Sq.ft Carpet, RTM/Under-construction). | Stiff, robotic error messages or overly apologetic AI phrasing. |
| **10** | **Information Density** | MEDIUM | Progressive disclosure: high-level summary upfront, deep technical specs in collapsible sections or drawer tabs. | Dumping 30 property fields onto a single table row. |

---

## 4. Standard Operational Workflow for UI/UX Tasks

When asked to design, review, or polish any UI/UX surface:

### Step 1: Diagnose & Contextualize
- Identify the user persona (Sales Executive, Team Manager, or Admin).
- Determine primary job-to-be-done (e.g. "Scan 50 leads in 30 seconds" vs "Inspect owner's villa specs").
- Check current implementation against the [Anti-Patterns Rubric](references/anti-patterns-and-rules.md).

### Step 2: Establish Layout & Visual Hierarchy
- Apply Apple continuous curvature (`rounded-xl` or `rounded-2xl` squircles).
- Apply material depth: Layer base canvas (`bg-background`) → card surface (`bg-card` with hairline border) → sticky headers (`apple-glass`).
- Format numbers and metrics with `font-mono` or `tabular-nums` and standard Indian numbering (`₹50 Lakhs`, `₹1.85 Cr`).

### Step 3: Polish Touch & Interactive Polish
- Ensure every button has `min-h-[44px]` (or mobile touch target padding), `.apple-button` active press feedback (`active:scale-[0.98]`).
- Use `.crm-badge` for lead status with semantic data-tone (`data-tone="blue|green|yellow|red|purple"`).

### Step 4: Validate
- Run `npm.cmd run build` via terminal to confirm zero type errors.
- Verify both Dark Mode (`.dark`) and Light Mode contrast and aesthetics.
