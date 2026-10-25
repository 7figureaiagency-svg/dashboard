---
updated: 2026-10-25T15:41:00+05:30
---

# Project State

## Current Position

**Milestone:** Multi-Tenant Onboarding, Data Isolation & Dynamic AI Knowledge  
**Phase:** 16 - Pipeline Board Exhaustive Stage Mapping & Site Visit Preservation  
**Status:** ⏳ Ready to Execute  
**Plans:**
- `.gsd/phases/16/16.1-PLAN.md` (Pipeline Board Exhaustive Stage Mapping & Site Visit Preservation) — ⏳ Ready

## Last Action

Completed Phase 15:
- Enforced Explicit Property Locking in `src/components/crm/inventory-tab.tsx`: leads with a `selected_property_id` (or site visit booked) match ONLY that exact property and never bleed into unrelated properties.
- Implemented strict category isolation (Commercial vs Plot vs Residential) and multi-factor scoring (threshold >= 4; budget alone can no longer qualify a match).
- Fixed undefined `setDemandModalProp` in card view, replacing with `setMatchingDialogProperty` and Apple HIG emerald button styling.
- Enriched matchmaker dialog with `🎯 Direct Property Lead / Site Visit Booked` vs `✨ Criteria Match` badges and direct Call/WhatsApp action buttons.
- Verified build passes (`npm.cmd run build` in 990ms). Griham Heights shows 1 Buyer (Manthan), and Griham Business Central & Green Valley show 0 Buyers (None yet).

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
