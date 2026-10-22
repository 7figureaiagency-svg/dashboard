# CRM Dashboard UX Patterns & Component Architecture

This reference outlines the specialized component patterns used across the Nextgn Realtors CRM workstation.

---

## 1. Leads Triage Strip & Data-Dense Table

The triage table allows a broker/sales executive to triage 50+ leads in seconds without visual fatigue.

### Structural Pattern:
```tsx
// Outer Apple Inset Grouped Container
<div className="apple-card overflow-hidden border border-border/40 shadow-xs">
  {/* Triage Toolbar with Quick Filter Segmented Control */}
  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-border/40 bg-muted/20">
    <div className="flex items-center gap-2">
      <SearchInput className="h-9 w-64 rounded-xl text-xs" />
      <SegmentedFilterChips />
    </div>
    <div className="flex items-center gap-2">
      <BatchActionButtons />
    </div>
  </div>

  {/* Table with Tabular Numerics and Sticky Header */}
  <div className="overflow-x-auto touch-scroll">
    <table className="w-full text-left border-collapse text-xs">
      <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
        {/* Consistent column headers with min-width constraints */}
      </thead>
      <tbody className="divide-y divide-border/30">
        {/* Compact, high-readability rows (py-2.5 px-3) with hover highlight */}
      </tbody>
    </table>
  </div>
</div>
```

---

## 2. Modern Dot-Pill Status Badges (`.crm-badge`)

All lead stages and submission statuses utilize `.crm-badge`:
- **Structure**: Inline pill with 5.5px rounded indicator dot, subtle 18% opacity border, matching background tint.
- **Pulsing Dot**: Active high-priority leads (e.g. `SITE_VISIT_BOOKED`, `FRESH`, `VIP`) receive `data-pulse="true"` for subtle breathing animation.

```tsx
<span className="crm-badge" data-tone="green" data-pulse="true">
  Site Visit Booked
</span>
```

### Semantic Tones:
- `data-tone="blue"`: Fresh, Qualifying, Criteria Confirmation
- `data-tone="yellow"`: Options Sent, Pending Verification, Owner Intake
- `data-tone="green"`: Site Visit Booked, Deal Won, Approved Inventory
- `data-tone="purple"`: Dual-Role Client, VIP Seeker, Special Route
- `data-tone="red"`: Missed Visit, Rejected, Dropped
- `data-tone="gray"`: Cold, Archive, Unassigned

---

## 3. iOS-Style Inspector Sheet (Lead Drawer)

When a row is clicked, an iOS-style inspector drawer opens from the right without jarring page reloads:
- **Header**: Avatar with Initials, Client Name, Quick Phone/WhatsApp action chips, and Dual-Role indicator badge.
- **AI Conversation Summary Card**: Frosted card with bifurcated Seller vs Buyer briefing and live FSM stage explainer.
- **Segmented Tabs**:
  - `WhatsApp Chat`: iMessage-styled bubbles with incoming/outgoing styling, timestamps, and delivery double-ticks.
  - `AI Intelligence`: Full qualification telemetry, lead score breakdown, and intent confidence.
  - `Submissions (if Seller)`: Listed property details, photos, expected price, and Admin verification controls.
  - `Activity Log`: Audit trail of all state transitions and automated cron follow-ups.
- **Sticky Frosted Bottom Action Bar**:
  - Pinned to bottom of sheet with `.apple-glass`.
  - Direct quick triggers: `Book Site Visit`, `Mark Lost`, `Assign Executive`.

---

## 4. Dual-Role Client Representation

For clients who are both buying and selling (e.g. Manthan with Spring field Villa listing + 3BHK search):
- Always surface both sides in a single view:
  1. **Top Badge**: `🌟 Dual-Role Client (Buyer + Seller)` in luminous purple.
  2. **Seller Card**: Property specs, asking price/rent, carpet area, verification status.
  3. **Buyer Card**: Desired configuration, budget, location, and site visit schedule.
  4. **Never overwrite**: Retain buyer criteria even when owner listing is pending.

---

## 5. Metric KPI Tiles

High-impact summary cards at the top of the dashboard:
- Single large metric number (`text-2xl font-bold tracking-tight`).
- Contextual subtitle (`text-xs text-muted-foreground`).
- Delta pill (`+12% vs last week` in green or red pill).
- Subtle background icon with 10% opacity tint.
- Zero clutter: Max 4 primary KPI cards in a responsive grid (`grid-cols-2 lg:grid-cols-4 gap-3.5`).
