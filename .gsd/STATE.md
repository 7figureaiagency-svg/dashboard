---
updated: 2026-10-25T14:35:00+05:30
---

# Project State

## Current Position

**Milestone:** Multi-Tenant Onboarding, Data Isolation & Dynamic AI Knowledge  
**Phase:** 13 - Dynamic Multi-Tenant AI Knowledge Base & Agency Profile FAQ Studio  
**Status:** ✅ Complete  
**Plans:**
- `.gsd/phases/13/13.1-PLAN.md` (Database Schema Expansion & Edge Function Dynamic AI Knowledge Engine) — ✅ Complete
- `.gsd/phases/13/13.2-PLAN.md` (Apple HIG Profile Tab "AI Bot Knowledge & FAQ Studio" UI) — ✅ Complete

## Last Action

Completed Phase 13:
- Extended `public.clients` database schema with `bot_knowledge JSONB DEFAULT '{}'::jsonb`.
- Seeded multi-tenant knowledge bases for Griham Realty (Alkapuri address, 10 AM - 7:30 PM hours, 0% builder/1% resale brokerage, SBI/HDFC/ICICI banking, booking KYC documentation FAQ) and NextGen Realty (Gotri-Sevasi Road address, 0% builder/1% luxury resale brokerage).
- Upgraded `realtor-lead-engine` Edge Function to `v71-dynamic-bot-knowledge` (deployed version 114):
  - Injected `tenantClient.bot_knowledge` into DialogContext.
  - Added new intent classification topics: `OFFICE_ADDRESS`, `OFFICE_TIMINGS`, `AGENCY_INFO`, `CUSTOM_FAQ`.
  - Immunized office inquiries against false-positive Commercial Office overrides.
  - Dynamically grounded all FAQ responses (brokerage, loans, RERA, office address, timings, custom Q&As) in tenant knowledge.
- Verified live replies on Griham Realty bot via test suite with 100% accuracy.
- Built Apple HIG "AI Bot Knowledge & FAQ Studio" in `src/components/crm/profile-tab.tsx` with Operations, Commercial Policies, Custom Q&A Studio, and Live Simulated Chat Preview.
- Verified `npm.cmd run build` passes with zero errors and multi-tenant persistence round-trip passes with 100% data isolation.

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
