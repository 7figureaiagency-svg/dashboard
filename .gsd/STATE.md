---
updated: 2026-10-25T15:48:00+05:30
---

# Project State

## Current Position

**Milestone:** Multi-Tenant Onboarding, Data Isolation & Dynamic AI Knowledge  
**Phase:** 17 - Portal-Exclusive Missing WhatsApp Banner & Telegram Lead Identity Isolation  
**Status:** ⏳ Ready to Execute  
**Plans:**
- `.gsd/phases/17/17.1-PLAN.md` (Portal-Exclusive Missing WhatsApp Banner & Telegram Lead Identity Isolation) — ⏳ Ready to Execute

## Last Action

Completed Phase 16:
- Enhanced `hydrateLead` in `src/lib/crm.ts` to canonically set `status = "SITE_VISIT_BOOKED"` when `site_visit_booked: true` or `site_visit_datetime` is set.
- Refactored `pipelineColumns` in `src/components/crm/leads-tab.tsx` into 6 mutually exclusive, exhaustive stages so 100% of leads in `rows` appear on the Pipeline Board with zero lost leads.
- Updated Edge Function `realtor-lead-engine` FAQ interceptors to preserve `currentState` rather than resetting to `ROLE_SELECTION_PENDING`, and deployed to production.
- Aligned Manthan's database record to `state = 'SITE_VISIT_BOOKED'`.
- Verified build passes (`npm.cmd run build` in 875ms). Manthan visibly appears under 'Visit Scheduled (1)'.

## Active Decisions

| Decision | Choice | Made | Affects |
| :--- | :--- | :--- | :--- |
| Dynamic FAQ Architecture | Pure AI semantic intent understanding + Database JSONB grounded answers (Zero regex cascades) | 2026-10-25 | Edge Function & CRM Profile Tab |
| Architecture | 100% Non-n8n (Supabase Edge Functions + React CRM) | 2026-10-19 | Entire codebase |
| Multi-Tenant Isolation | Two-Tier: PostgreSQL RLS via `public.current_client_id()` + TanStack Query Key Partitioning `[key, clientId]` | 2026-10-24 | Database & Frontend |
| Dual-Persona Model | Option A: Parallel co-existence of Buyer criteria & Seller listings with `DUAL_ROLE` type | 2026-10-21 | Edge Function & CRM |
| Executive Roles | 3-Tier Hierarchy: Admin (Listings/Inventory), Manager (Unassigned/Triage), Sales (Visits/Conversion) | 2026-10-22 | Edge Function & CRM |
| Listing Approval | Strictly restricted to Admin role; sales team blocked from converting submissions | 2026-10-22 | Live Inventory CRM UI |
| Unassigned Triage | Unmatched buyer criteria and unassigned leads route to Manager role | 2026-10-22 | Edge Function alerts |
| Keyword Immunity | Real estate property terms never trigger OFF_TOPIC interceptor | 2026-10-21 | Dialog Engine |
| Multi-Listing Intake | Direct affirmative replies ("Haan", "Yes") in OWNER_DETAILS_GATHERED start second listing | 2026-10-21 | Owner Flow |
| Design Standard | Apple HIG (Squircles, `.apple-glass` translucent materials, hairline borders, macOS/iOS ergonomics) | 2026-10-19 | All tabs |

## Blockers

None.

## Concerns

None.
