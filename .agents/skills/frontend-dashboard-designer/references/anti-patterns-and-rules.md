# UI/UX Anti-Patterns & Quality Rubric

This document enforces strict quality standards to prevent common AI-generated design traps ("AI slop") and ensure the Nextgn Realtors CRM maintains exceptional usability and visual taste.

---

## 1. Top 10 Anti-Patterns to Eliminate ("AI Slop" Traps)

### ❌ Anti-Pattern 1: Cliché Purple/Indigo Gradients
- **The Trap**: Defaulting to `bg-gradient-to-r from-purple-500 to-indigo-600` on every header or hero banner.
- **The Fix**: Use Apple System Gray materials with crisp OKLCH Slate (`var(--primary)`), warm Champagne Gold accents (`var(--accent)`), or refined emerald tones. Let content and typography drive visual interest, not garish gradients.

### ❌ Anti-Pattern 2: Gray-on-Gray Low Contrast
- **The Trap**: Light gray text (`#9CA3AF`) on slightly lighter gray backgrounds (`#F3F4F6`), failing accessibility.
- **The Fix**: Enforce WCAG 2.2 AA contrast (≥ 4.5:1). In light mode, body text is `text-foreground` or high-contrast `text-muted-foreground` (`oklch(0.52 0.02 250)`). In dark mode, card surfaces are elevated 8-12% above canvas with crisp `oklch(0.985 0.003 240)` white text.

### ❌ Anti-Pattern 3: Cramped Mobile Tap Targets
- **The Trap**: Clickable text links, tiny 18px icons, or table action buttons with zero padding, causing mis-taps on phones.
- **The Fix**: Every touch target on mobile must be **at least 44×44px** (Apple HIG touch target minimum). Use `min-h-[44px] min-w-[44px]` or wrap icons in `p-2.5`.

### ❌ Anti-Pattern 4: Raw Hex Codes in Components
- **The Trap**: Scattering `#008069`, `#1a202c`, `#ef4444` across arbitrary component files, breaking theme switches and dark mode.
- **The Fix**: Strictly use semantic CSS tokens (`bg-background`, `bg-card`, `text-primary`, `border-border/40`, `.crm-badge[data-tone="..."]`).

### ❌ Anti-Pattern 5: Numbered Markers on Non-Sequential Data
- **The Trap**: Labeling cards or tabs as `01 / 02 / 03 / 04` when they are independent features or filters.
- **The Fix**: Only use numbered steps for true sequential processes (e.g. `Step 1: Configuration -> Step 2: Location -> Step 3: Budget`).

### ❌ Anti-Pattern 6: Overuse of All-Caps Labels
- **The Trap**: Making every label `UPPERCASE TRACKING-WIDEST`, making screens shout and reducing reading speed.
- **The Fix**: Restrict uppercase solely to tiny table column eyebrows (`text-[10px] uppercase font-semibold text-muted-foreground`). All other labels, buttons, and titles use natural Title Case or Sentence Case.

### ❌ Anti-Pattern 7: Hover-Only Action Reveals on Touchscreens
- **The Trap**: Showing edit/delete buttons only on `:hover`, making them unreachable on iPads and smartphones.
- **The Fix**: Always provide explicit tap actions (e.g. an ellipsis menu button `...` or visible icons) on mobile viewport breakpoints (`sm:hidden`).

### ❌ Anti-Pattern 8: Unstable Cumulative Layout Shift (CLS > 0.1)
- **The Trap**: Content jumping around when images load or TanStack Query fetches data.
- **The Fix**: Always reserve layout space with skeleton loaders (`h-10 w-full animate-pulse rounded-lg bg-muted/50`).

### ❌ Anti-Pattern 9: Heavy Opaque Modals
- **The Trap**: Solid black `bg-black/80` overlays that feel like a blackout curtain.
- **The Fix**: Use `.apple-glass` translucent backdrops (`backdrop-blur-md bg-black/30 dark:bg-black/60`).

### ❌ Anti-Pattern 10: Installing Heavy External JS Libraries
- **The Trap**: Adding `framer-motion`, `chart.js`, `lottie-web`, or foreign CSS frameworks for simple effects.
- **The Fix**: Strictly zero additional runtime packages. Pure CSS3, Tailwind v4 transitions, and native SVG icons from `lucide-react`.

---

## 2. Pre-Delivery Visual Quality Checklist

Before marking any UI/UX task as done, verify:
- [ ] Contrast ratio is ≥ 4.5:1 on both Light and Dark modes.
- [ ] All clickable elements meet 44×44pt tap target minimum on mobile.
- [ ] Continuous squircle radius hierarchy is preserved.
- [ ] Currency and metrics use `tabular-nums` with Indian notation (`₹ Lakhs/Cr`).
- [ ] Active button press feedback (`active:scale-[0.98]`) is present.
- [ ] Empty and loading states are handled gracefully with skeletons.
- [ ] `npm.cmd run build` compiles with zero TypeScript errors.
