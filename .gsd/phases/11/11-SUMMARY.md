# Phase 11: High-Density Lead History & Dual-Actor (Sales Rep + AI Bot) Activity Stream Summary

**Completed:** 2026-10-24  
**Scope:** Activity Timeline Redesign, Dual-Actor (Sales Rep vs AI Bot) Segmentation, Concise Summarization, and Executive Action Audit Persistence  

---

## 1. Problem Diagnosis & Motivation

In the Lead Profile Drawer (`LeadDrawer`), the **History** tab previously suffered from:
1. **Excessive Vertical Bloat & Height:** Every event was rendered as a full 100px+ card with borders, badges, and the full multi-line WhatsApp reply dumped verbatim (duplicating the WhatsApp Chat view).
2. **Difficult to Understand:** Raw HTML bold tags (`<b>...</b>`), emojis, and long conversational bot prompts made it hard for sales executives to quickly scan what happened.
3. **Mixed & Unfiltered Feed:** Human sales executive calls, notes, and status changes were buried amidst dozens of bot interactions with no way to isolate sales rep actions.
4. **Scrolling Exhaustion:** A lead with 20 interactions required scrolling over 2,000px vertically.

---

## 2. Key Architectural & UI/UX Solutions Implemented

### Tier 1: Data Normalization & Executive Action Persistence (`src/lib/crm.ts`, `src/lib/crm-data.ts`)
- **Actor Categorization:** Defined `ActorType = "SALES_REP" | "AI_BOT" | "SYSTEM"`.
- **Intelligent 1-Line Summarizer (`summarizeLeadEvent`):**
  - Parses bot and executive events into crisp 1-line action titles (e.g. *"AI confirmed VIP Site Visit"*, *"Logged Call: Customer interested in Alkapuri 3BHK"*, *"AI shared 3 matching property options"*).
  - Strips HTML tags and collapses newlines via `cleanSummaryText`.
- **Date Grouping (`groupActivityByDate`):** Groups activities logically into *"Today"*, *"Yesterday"*, *"This Week"*, and *"Older"*.
- **Executive Audit Persistence:**
  - `useUpdateLead()` now inserts structured executive actions (`source: "EXECUTIVE_ACTION"`, `executive_name`, `action`, `field`, `old_value`, `new_value`, `note`) directly into `public.lead_events`.
  - Invalidate `["lead_activity"]` and `["lead_events"]` upon mutations so updates reflect instantly.

### Tier 2: Apple HIG Compact Timeline Component (`src/components/crm/history-timeline.tsx`)
- **3-Way Apple Segmented Filter:**
  - `All Actions ({total})`
  - `👤 Sales Rep ({salesCount})` (human calls, notes, assignments, takeovers)
  - `🤖 AI Bot ({aiCount})` (bot qualifications, option deliveries, reminder sweeps)
- **KPI Summary Ribbon:** Mini frosted badges showing `📞 X Calls`, `📝 Y Notes`, and relative timestamp (`⚡ Latest: 12m ago`).
- **High-Density Rows (36px–44px):**
  - Reduced vertical height by **~65%**.
  - Left: Semantic colored micro-icon node (Blue for Call, Green for Visit, Indigo for Note, Teal for AI Bot).
  - Center: Bold concise action title + actor pill (`👤 Amit Patel` vs `🤖 AI Bot`).
  - Right: Relative time in `font-mono tabular-nums text-[11px]` (`12m ago`, `Yesterday, 5:00 PM`).
- **Progressive Disclosure Accordion:**
  - Clicking any row expands an inline detail drawer revealing full executive notes, field diffs (`old → new`), and exact timestamp.
- **Search & Filter:** Instant search box for quickly finding specific notes or actions when >5 records exist.

### Tier 3: Lead Drawer Integration (`src/components/crm/lead-drawer.tsx`)
- Added automatic query fallback `useActivity(lead?.client_id)` so history is fully populated even when `LeadDrawer` is opened from other tabs (e.g. `inventory-tab.tsx`).
- Synchronized tab trigger action count: `<History /> History ({effectiveActivity.length})`.

---

## 3. Empirical Verification Evidence

1. **Unit Test (`scratch/test_history_timeline.cjs`):**
   - `cleanSummaryText`: Successfully stripped `<b>` and `\n` tags into clean 1-line previews.
   - `summarizeLeadEvent`: Correctly recognized `SALES_REP` (Logged Call) vs `AI_BOT` (Options Sent, Site Visit).
   - `groupActivityByDate`: Successfully grouped into Today, Yesterday, This Week, and Older.
   - Status: **ALL TESTS PASSED**.
2. **Frontend Compilation:**
   - Command: `npm.cmd run build`
   - Result: **0 compilation errors** (Built in 1.24s).

---

## 4. Invariants Status

- [x] **100% Non-n8n Architecture:** All logic stays in Supabase Edge Functions + PostgreSQL + React frontend.
- [x] **0 Extra Runtime JS Packages:** Pure Radix UI + Tailwind v4 + Lucide icons.
- [x] **Apple HIG Standard:** Segmented controls, squircle cards, hairline borders, and 44px touch targets.
- [x] **Multi-Tenant Isolation:** All activities and events strictly partitioned by tenant `client_id`.
