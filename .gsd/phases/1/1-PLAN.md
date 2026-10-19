---
phase: 1
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 1.1: Apple Human Interface Guidelines (HIG) Dashboard Transformation

## Objective
Elevate the Nextgn Realtors CRM Dashboard into an Apple-grade, high-performance web experience adhering strictly to Apple's Human Interface Guidelines (Clarity, Deference, Depth, Translucent Materials, Squircles, and Frictionless Ergonomics). The transformation retains 100% of existing Supabase Edge Function logic and zero-latency TanStack Query caching while delivering a macOS Sonoma/iOS 18 aesthetic with sub-pixel borders, soft ambient elevation, and seamless mobile touch interactions.

## Context
Load these files for context:
- `src/styles.css` (Design tokens, OKLCH palette, Apple materials, typography, squircle radiuses)
- `src/routes/_authenticated/dashboard.tsx` (Top translucent navigation toolbar, macOS segmented controls, sidebar)
- `src/components/crm/leads-tab.tsx` (Apple widget triage strip, inset-grouped table, mobile action cards)
- `src/components/crm/badges.tsx` (Status badges aligned with Apple semantic system tones)
- `src/components/crm/lead-drawer.tsx` (iOS Sheet inspector with grabber, iMessage bubbles, sticky frosted action bar)

> *Note on Scope:* Secondary tabs (`performance-tab.tsx`, `inventory-tab.tsx`, `budget-tab.tsx`) inherit global Apple materials and squircle tokens from Task 1. Specialized secondary-tab layout enhancements are scheduled for Phase 2.

---

## Gap Analysis: Current vs. Apple HIG Standards

| Dimension | Current State | Apple HIG Standard |
| :--- | :--- | :--- |
| **Canvas & Surfaces** | Flat off-white canvas with hard borders (`border-border`) | Apple System Gray 6 (`#F5F5F7` / `oklch(0.985 0.003 240)`), translucent frosted glass (`.apple-glass`), hairline sub-pixel borders (`border-black/[0.06]`). |
| **Corner Curvature** | Uniform standard `0.625rem` (10px) corners | Continuous curvature squircles: `12px` (cards), `16px` (widgets), `20px` (sheets/drawers), `9999px` (capsules/pills). |
| **Top Navigation** | Standard block header with solid tabs | macOS/iOS Navigation Bar: translucent blurred background pinned to top (`.apple-glass`), floating macOS segmented control. |
| **KPI Triage Strip** | Colored square cards | Apple Health/Home-style "Complication Widgets": circular translucent icon backdrops, large SF Pro bold metrics, clean contextual labels. |
| **Tables & Data** | Standard HTML data table | Apple Inset Grouped Table: rounded squircle container (`rounded-2xl`), subtle dividers (`border-border/40`), tabular figures (`tnum`). |
| **Lead Drawer** | Standard web drawer | iOS Bottom Sheet / macOS Inspector: top grabber handle, iMessage speech bubbles (tinted bot, frosted client), sticky frosted glass footer. |
| **Mobile Actions** | Standard buttons | Apple Touch Targets (min 44×44pt), haptic-like micro-scale transitions (`active:scale-[0.98]`). |

---

## Tasks

<task type="auto">
  <name>Task 1: Apple Design Materials & Token Consolidation</name>
  <files>
    src/styles.css
  </files>
  <action>
    Refactor design tokens in `src/styles.css` to adopt Apple System Materials:
    1. Base Canvas: `#F5F5F7` (Apple System Gray 6: `oklch(0.985 0.003 240)`) in light mode, `#000000` / `oklch(0.12 0.03 255)` in dark mode.
    2. Frosted Materials: Add `.apple-glass` utility class utilizing:
       `backdrop-filter: blur(20px) saturate(180%);`
       `background: color-mix(in srgb, var(--card) 80%, transparent);`
       `border: 1px solid rgba(0, 0, 0, 0.06);` (and dark mode equivalent `rgba(255, 255, 255, 0.08)`).
    3. Apple System Accent Tints (OKLCH approximations of native Apple tints):
       - System Blue: `oklch(0.55 0.22 255)` (Selection, primary actions)
       - System Green: `oklch(0.68 0.20 145)` (Visits confirmed, deal won)
       - System Orange: `oklch(0.68 0.19 50)` (Urgent attention, missed visit)
       - System Purple: `oklch(0.58 0.22 305)` (AI & automation indicators)
    4. Squircles: Update radius scale to match Apple continuous curvature:
       `--radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px; --radius-2xl: 24px; --radius-full: 9999px;`
    5. Hairline sub-pixel borders: Use `border-black/[0.06]` (light) and `border-white/[0.08]` (dark).
    6. Micro-interaction: Add `.apple-button` with `transition: transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)` and `active:scale-[0.98]`.

    AVOID: Heavy drop shadows or saturated muddy borders. Apple HIG mandates light, diffuse ambient shadows (`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)`).
  </action>
  <verify>
    Run `npm.cmd run build` to confirm zero Tailwind v4 / CSS token compilation errors.
  </verify>
  <done>
    Design tokens reflect Apple HIG palette, `.apple-glass` utility exists, and all color variables compile cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apple Navigation Toolbar & Segmented Controls</name>
  <files>
    src/routes/_authenticated/dashboard.tsx
  </files>
  <action>
    Transform the top header and navigation in `dashboard.tsx`:
    1. Header Bar: Apply sticky translucent styling using `.apple-glass` (`sticky top-0 z-30 apple-glass border-b border-border/40`).
    2. Date Preset Control: Redesign as a genuine macOS segmented control:
       - Outer track: `bg-muted/60 p-1 rounded-xl border border-border/30`
       - Active item: `bg-card text-foreground shadow-xs font-semibold rounded-lg`
       - Inactive item: `text-muted-foreground hover:text-foreground`
    3. Navigation Rail: Convert `TabsList` into an Apple sidebar style:
       - Translucent pill buttons with subtle iconography and pill counters (`tabular-nums font-semibold`).
       - On mobile, ensure horizontal swipe is silky smooth with zero scrollbars via `.touch-scroll`.

    AVOID: Solid black aggressive header backgrounds that conflict with Apple's deference principle.
  </action>
  <verify>
    Run `npm.cmd run build` and inspect layout on desktop (1440px) and mobile viewport (375px).
  </verify>
  <done>
    Top header is sticky with frosted blur, segmented control mimics native Apple UI, and tabs navigate seamlessly.
  </done>
</task>

<task type="auto">
  <name>Task 3: Apple Widget Triage Strip & Inset Grouped Table</name>
  <files>
    src/components/crm/leads-tab.tsx
    src/components/crm/badges.tsx
  </files>
  <action>
    Upgrade `leads-tab.tsx` and status badges to Apple Standards:
    1. Triage Strip: Style 4 operational cards as Apple Complication Widgets:
       - Squircle corners (`rounded-2xl`), subtle hairline border (`border-border/50`), ambient diffuse shadow.
       - Icon in circular tinted container (e.g. green circle for visits, amber circle for action needed).
       - Prominent bold counter with `tabular-nums tracking-tight text-2xl font-bold`.
    2. Inset Grouped Table:
       - Frame table inside an `overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xs`.
       - Table header: uppercase small label tracking (`text-[11px] font-semibold tracking-wider text-muted-foreground uppercase bg-muted/30`).
       - Alternate row hover: delicate lift `hover:bg-muted/40 transition-colors`.
    3. Mobile Action Cards:
       - Grouped cards with clean 12px radii, clear customer name typography, and prominent iOS-style touch targets (min 44pt height for Call & WhatsApp buttons).
    4. Status Badges (`badges.tsx`):
       - Ensure dot-pill badges use Apple system tints (system green for visited/won, system orange for followup, system purple for ai/bot).

    AVOID: Badge clutter. Ensure each row has exactly one primary status pill; auxiliary metadata uses muted sub-labels.
  </action>
  <verify>
    Run `npm.cmd run build` and verify LeadsTab renders with zero layout shift on desktop and mobile viewports.
  </verify>
  <done>
    Triage strip looks like native Apple widgets, table adopts inset-grouped style, and mobile cards have Apple touch ergonomics.
  </done>
</task>

<task type="auto">
  <name>Task 4: iOS Inspector Sheet (Lead Drawer) with iMessage Chat</name>
  <files>
    src/components/crm/lead-drawer.tsx
  </files>
  <action>
    Upgrade `lead-drawer.tsx` to an Apple Sheet Inspector:
    1. Top Sheet Grabber: Add native iOS grabber indicator (`w-9 h-1 rounded-full bg-muted-foreground/30 mx-auto mt-2 mb-3 sm:hidden`).
    2. iMessage Style Chat:
       - Client message: Frosted light gray bubble with rounded squircle corners (`bg-muted/80 text-foreground rounded-2xl rounded-bl-xs px-4 py-2.5`).
       - AI Bot message: Subtle tinted green/blue bubble (`bg-primary/10 text-primary rounded-2xl rounded-br-xs px-4 py-2.5 border border-primary/20`).
       - Precise timestamps below bubbles with sub-pixel font formatting.
    3. Floating Action Bar: Sticky footer with translucent frosted background (`sticky bottom-0 bg-card/85 backdrop-blur-lg border-t border-border/40 p-3 flex gap-2`) with `[📞 Call Client]` and `[💬 WhatsApp]` CTAs (touch targets >= 44pt).

    AVOID: Long scrolls to reach critical communication actions.
  </action>
  <verify>
    Run `npm.cmd run build` and open LeadDrawer on mobile and desktop, verifying sticky footer remains pinned and conversation bubbles render correctly.
  </verify>
  <done>
    Drawer resembles native iOS Sheet with grabber, iMessage conversation aesthetics, and persistent 1-tap contact buttons.
  </done>
</task>

---

## Must-Haves
After all tasks complete, verify:
- [ ] Base canvas and cards render Apple System Gray 6 and `.apple-glass` translucent frosted surfaces.
- [ ] Header toolbar is sticky translucent with a functional macOS segmented date preset control.
- [ ] Triage strip renders 4 complication-style widgets with squircle corners (`rounded-2xl`) and tabular figures.
- [ ] Desktop leads table adopts an Apple Inset-Grouped appearance with subtle hairline dividers.
- [ ] Mobile view renders 44pt touch-friendly action cards with instant 1-tap Call and WhatsApp CTAs.
- [ ] Lead drawer renders an iOS top grabber handle, iMessage-style speech bubbles, and a sticky frosted glass bottom action bar.
- [ ] Pure CSS & Tailwind v4 execution: zero additional runtime JavaScript packages and 100% Non-n8n compliance.

## Success Criteria
- [ ] All 4 tasks verified passing with `npm.cmd run build`.
- [ ] Zero TypeScript errors and zero Tailwind v4 compilation warnings.
- [ ] Must-haves empirically confirmed across mobile (375px) and desktop (1440px) viewports.
- [ ] Multi-tenant WABA safety and Supabase caching invariants preserved.
