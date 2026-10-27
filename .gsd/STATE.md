---
updated: 2026-10-27T09:24:00+05:30
---

# Project State

## Current Position

**Milestone:** Multi-Tenant Onboarding, Data Isolation & Dynamic AI Knowledge  
**Phase:** 25 - Owner Intake Stop-Word Guard & Entity Extraction Disambiguation  
**Status:** ✅ Complete  
**Plans:**
- `.gsd/phases/25/25.1-PLAN.md` (Owner Intake Stop-Word Guard & Entity Extraction Disambiguation) — ✅ Complete

## Last Action

Completed Phase 25 (Owner Intake Stop-Word Guard & Entity Extraction Disambiguation):
- Plan 25.1:
  - Created `STOP_WORDS_SET` with comprehensive dictionary covering vernacular pronouns, auxiliary verbs, property type keywords, and intent verbs.
  - Implemented `isLikelySocietyOrProjectName(name: string): boolean` guard function in `supabase/functions/realtor-lead-engine/index.ts` to reject conversational boilerplate ('Muje meri he', 'flat', 'shop bechni he').
  - Upgraded `extractProjectOrSocietyFromText` and `formatSocietyName` to strip property subtype tokens ('shop', 'office', 'flat', etc.) and validate candidates against `isLikelySocietyOrProjectName`.
  - Added direct owner listing routing in `FRESH` and `ROLE_SELECTION_PENDING` states so first-message owner declarations like 'muje meri shop bechni he' immediately enter `handleOwnerFlow`.
  - Bumped Edge Function version to `v74-owner-entity-guard` and deployed to Supabase production (`yeiygfysijptjdepctnx`).
  - Verified live health check: HTTP 200, `status: "ONLINE"`, `version: "v74-owner-entity-guard"`.
  - Verified 16/16 assertions pass in `scratch/test_phase25_owner_entity_guard.cjs`.
  - Frontend build verified: `npm run build` compiled in 1.23s with 0 errors.

Completed Phase 24 (E2E QA Audit Bug Remediation & Role Governance Hardening):
- Plan 24.1:
  - Added `user_id` column to `public.executives` linking to `auth.users(id)`.
  - Created `public.current_executive_id()` and `public.is_admin()` SECURITY DEFINER functions.
  - Recreated `leads` SELECT and UPDATE RLS policies enforcing executive row-level isolation (`assigned_executive_id = current_executive_id() OR is_admin() OR assigned_executive_id IS NULL`).
  - Recreated `property_submissions` SELECT, UPDATE, DELETE RLS policies strictly requiring `client_id = current_client_id() AND is_admin()` (0 rows accessible to non-admin users).
  - Applied migration `20261027120000_executive_rls_and_admin_property_governance.sql` to Supabase production.
- Plan 24.2:
  - Added Apple HIG "Assigned Executive" `Select` dropdown in `LeadDrawer` profile form for Admins and Managers to reassign lead ownership.
  - Strictly gated the "Seller" tab in `LeadDrawer` behind `isAdmin`, completely hiding owner property submissions from Sales Executives.
  - Retained `adminOnly: true` on the Inventory nav item in `dashboard.tsx` and added an active tab reset guard for non-admins.
  - Verified `useApprovePropertySubmission` dispatches zero outbound WhatsApp/Telegram messages (preserving anti-ban & minimizing message volume) and logs internally to `lead_events`.
  - Added compound sorting by timestamp and ID to `useActivity` and `HistoryTimeline` to eliminate flickering.
- Verification:
  - Verified `scratch/test_phase24_bug_remediation.cjs`: 13/13 assertions passed (100%).
  - Verified `npm.cmd run build`: 796ms, 0 errors.
- Plan 23.1:
  - Upgraded `parseVisitSlot` in `supabase/functions/realtor-lead-engine/index.ts` with Gujarati temporal day tokens (aje, aaje, આજે -> Today; kale, kaale, કાલે -> Tomorrow; parso, parsva -> Day After), Gujarati time tokens (vage, વાગે), Indic digit normalization, and morning/AM default for 10-11 AM IST.
  - Upgraded slot assembly across all 5 booking/reschedule handlers to concatenate `preferred_date_raw` and `preferred_time_raw`, ensuring time slots are never lost.
  - Introduced `formatMapHyperlink` and `formatBrochureHyperlink` helpers and replaced all raw map/brochure URL occurrences across morning briefings, pre-visit reminders, and confirmations with clean hyperlinks.
- Plan 23.2:
  - Added Duplex disambiguation in `parsePropertyTypeFromText` (no longer collapses to Penthouse).
  - Added multi-entity simultaneous extraction (`extractProjectOrSocietyFromText`) for project + property type utterances like `'Ananta astha' as project ka name and property type '3bhk duplex'`.
  - Added fallback property type extraction in `OWNER_CONFIG_PENDING`.
  - Fixed FSM metadata handshake in `handleOwnerFlow`: returns `leadUpdates: buildOwnerLeadUpdates(...)` across all return paths, forwarded by `dispatchStateAction` to prevent metadata wipeout in the main router.
- Code Review & Deployment:
  - Addressed Code Review findings: P0 `ReferenceError: archived is not defined` fixed with safe array fallback; P1 tenant WhatsApp token fallback added.
  - Deployed Edge Function `v73-vernacular-slot-owner-precision` to Supabase production (`yeiygfysijptjdepctnx`).
  - Verified 16/16 assertions pass in `scratch/test_phase23_slot_owner_hyperlink.cjs`.
  - Frontend build verified (`npm.cmd run build`: 850ms, 0 errors).

Completed Phase 22 (Plan 22.2 Gap Closure):
- Aligned Edge Function version string to `v72-state-conditioned-intent-engine` across `/health` and root greeting endpoints in `supabase/functions/realtor-lead-engine/index.ts`.
- Deployed `realtor-lead-engine` v72 to Supabase production (`yeiygfysijptjdepctnx`) via MCP session.
- Updated `scratch/test_phase22_state_conditioned_intent.cjs` to strictly enforce live version matching (`v72-state-conditioned-intent-engine` and root greeting `v72`).
- Live health check verified: returns HTTP 200, `status: "ONLINE"`, `version: "v72-state-conditioned-intent-engine"`.
- Verified 100% pass rate (27/27 assertions) on `scratch/test_phase22_state_conditioned_intent.cjs`.

Completed Phase 21:
- Implemented full `property-pitch-crafter` skill and copywriting frameworks (`.agents/skills/property-pitch-crafter/SKILL.md` and `pitch-frameworks.md`).
- Developed deterministic pitch calculation engine in `src/lib/pitch-crafter.ts` with 4 archetypes, 3 linguistic dialects, 3 formats, EMI calculator, and unit tests passing 100%.
- Created Apple HIG `PropertyPitchModal` in `src/components/crm/property-pitch-modal.tsx` with segmented controls, live WhatsApp bubble preview, and 1-tap copy/WhatsApp share with audit logging.
- Integrated multi-surface pitch triggers across Live Inventory, Owner Submissions, and the Lead Drawer in `src/components/crm/inventory-tab.tsx` and `src/components/crm/lead-drawer.tsx`.
- Verified production build cleanly with `npm.cmd run build` (0 compilation errors, 756ms).

Completed Plan 4.9:
- Implemented In-House Cross-Matchmaker Studio in `src/components/crm/inventory-tab.tsx` matching owner resale submissions against active CRM buyer leads by location, configuration, and budget viability (80%).
- Added Apple HIG `{count} In-House Buyers Matching` badges on submission cards/table rows with slide-over drawer showing matched buyers with `LeadScoreBadge` and 1-tap "Pitch Resale via WhatsApp" CTA.
- Implemented natural "Buyer Mila Kya?" intent handler in `supabase/functions/realtor-lead-engine/index.ts` returning grounded, authentic matching metrics and budget brackets without hallucinations.
- Deployed Edge Function to Supabase production (`yeiygfysijptjdepctnx`).
- Verified empirically with `scratch/test_dual_persona_matchmaker.cjs` (100% assertions passed) and `npm.cmd run build` (0 compilation errors, 914ms).

Completed Phase 20:
- Built and integrated the full Lead Scoring Engine (Option 1) across the CRM and Edge Function:
  - Skill created: `.agents/skills/lead-scoring-engine/SKILL.md` with complete mathematical rubrics across stage commitment, financial viability, velocity, and penalties.
  - Client library created: `src/lib/lead-scoring.ts` exporting deterministic `computeLeadScore(lead)`.
  - Badges updated: Added squircle Apple HIG `LeadScoreBadge` in `src/components/crm/badges.tsx`.
  - CRM Leads table updated: Added dedicated Score column, default descending sort by score, 1-tap "🔥 Hot Leads" Triage widget card, and mobile card badge.
  - Lead Inspector Drawer updated: Added interactive AI Lead Intent & Conversion Score card with progress bar, component breakdown metrics, signal tags, and sales closing strategy hint.
  - Edge Function updated: Added `computeEngineLeadScore` in `supabase/functions/realtor-lead-engine/index.ts` automatically computing and persisting `lead_score`, `lead_temperature`, `score_breakdown`, and `score_reasons` into `leads.metadata` on every state transition.
  - Deployed to Supabase production (`yeiygfysijptjdepctnx`) and live verified with real-time score persistence (Score 65 WARM on Manthan lead).
  - Verified with `npm.cmd run build` (0 compilation errors, 1.05s).

## Active Decisions

| Decision | Choice | Made | Affects |
| :--- | :--- | :--- | :--- |
| Lead Scoring Rubric | Deterministic 0-100 scale: Stage (45 max), Budget (25 max), Velocity (20 max), Penalties (35 max) | 2026-10-26 | CRM & Edge Function |
| Lead Temperature Tiers | HOT (🔥 >= 70), WARM (⚡ 40-69), COLD (❄️ < 40) | 2026-10-26 | CRM Triage & Badges |
| Post-Visit Alternative Option Matching | Comprehensive singular/plural + 1/2 numeric choice parsing + Empty catalog fallback | 2026-10-26 | Edge Function FSM |
| Post-Visit Objection Handling | Empathetic specific acknowledgment + Save feedback + Sales Alert + Alternative Inventory Pitch (Never reset to qualification) | 2026-10-25 | Edge Function & CRM |
| Schema Safety | Strict isolation of database column names: `leads.state` vs `leads.status` | 2026-10-25 | Edge Function updates |
| Dynamic FAQ Architecture | Pure AI semantic intent understanding + Database JSONB grounded answers (Zero regex cascades) | 2026-10-25 | Edge Function & CRM Profile Tab |
| Architecture | 100% Non-n8n (Supabase Edge Functions + React CRM) | 2026-10-19 | Entire codebase |
| Multi-Tenant Isolation | Two-Tier: PostgreSQL RLS via `public.current_client_id()` + TanStack Query Key Partitioning `[key, clientId]` | 2026-10-24 | Database & Frontend |
| Dual-Persona Model | Option A: Parallel co-existence of Buyer criteria & Seller listings with `DUAL_ROLE` type | 2026-10-21 | Edge Function & CRM |
| Executive Roles | 3-Tier Hierarchy: Admin (Listings/Inventory), Manager (Unassigned/Triage), Sales (Visits/Conversion) | 2026-10-22 | Edge Function & CRM |
| Design Standard | Apple HIG (Squircles, `.apple-glass` translucent materials, hairline borders, macOS/iOS ergonomics) | 2026-10-19 | All tabs |

## Blockers

None.

## Concerns

None. Verified working Supabase Personal Access Token active in configuration.
