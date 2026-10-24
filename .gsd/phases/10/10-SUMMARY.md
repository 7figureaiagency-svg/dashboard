# Phase 10: Multi-Tenant Lead Engine Query Isolation & False Dual-Role Sanitization Summary

**Completed:** 2026-10-24  
**Scope:** Edge Function Multi-Tenant Query Scoping, Lead 5117510624 Persona Sanitization, and CRM AI Summary Verification  

---

## 1. Problem Diagnosis & Root Cause

When Telegram user `5117510624` interacted with Griham Realty's bot (`@GrihamRealtybot`), the CRM dashboard falsely displayed the lead as:
- **Badge:** `DUAL: BUYER + SELLER 🌟`
- **AI Conversation Summary:** Listed property on record as `"Spring field"` (which belongs to Nextgen Realty).

### Root Cause Analysis:
1. The Supabase Edge Function `realtor-lead-engine` runs with `SUPABASE_SERVICE_ROLE_KEY`. Because service-role bypasses PostgreSQL Row-Level Security (RLS), tables queried without an explicit `.eq("client_id", activeTenantId)` condition fetched records across all tenants.
2. In `index.ts` (around line 4817), the greeting / returning lead handler queried `property_submissions` by `lead_id` without filtering by `client_id`.
3. Telegram user `5117510624` previously tested Nextgen Realty and had submitted a listing for `"Spring field"`. When querying Griham Realty, the unscoped query matched Nextgen's submission, causing `hasSellerListing` to evaluate to `true`.
4. The bot transitioned the lead to `DUAL_ROLE_MENU_PENDING`, set `lead_type = 'DUAL_ROLE'`, and updated `metadata.has_seller_profile = true`.
5. In the CRM frontend, `isDualRoleLead` and `buildLeadSummary` rendered the lead as a Dual-Role client with Nextgen's "Spring field" briefing.

---

## 2. Key Changes & Architectural Solutions

### Tier 1: Strict Multi-Tenant Query Scoping in `realtor-lead-engine` (v69)
- Audited every single `.from(...)` query across the 7,300+ line Edge Function:
  - **`property_submissions`:** Scoped lines 4071, 4819, 5170, 5384, 5436 with `.eq("client_id", activeTenantId)`.
  - **`inventory`:** Scoped lines 3544, 5616, 5823, 5994, 6444, 6607, 6952, 6956, and dynamic helper `resolveLeadProjectName` with `.eq("client_id", effectiveTenantId)`.
  - **`site_visits`:** Scoped lines 4832, 5281, 5813, 5985, 6467 with `.eq("client_id", activeTenantId)`.
  - Replaced hardcoded fallback `"PROP-NXG-001"` with dynamic tenant-scoped lookup (`.eq("client_id", activeTenantId).eq("status", "AVAILABLE").limit(1)`).
- Deployed Edge Function `realtor-lead-engine` live to Supabase (build 109, version `v69-multi-tenant-query-isolation`).

### Tier 2: Database Sanitization for Griham Realty Lead `5117510624`
- Updated `public.leads` for `lead_id = '5117510624'` and `client_id = 'c0000000-0000-0000-0000-000000000001'`:
  - Reset `lead_type` to `'SEEKER'`.
  - Cleaned `metadata` to `{"active_persona": "BUYER", "has_buyer_profile": true, "has_seller_profile": false, "selected_property_name": "Griham Heights Luxury Residences"}`.
- Sanitized `public.lead_events` record `856293c5-15fc-4c7b-a444-2d78f8e8b3c3` to remove contaminated mentions of Nextgen's "Spring field".
- Confirmed that Nextgen Realty's lead records for `5117510624` remained completely intact and isolated.

### Tier 3: Frontend Multi-Tenant Defense-in-Depth
- **`src/components/crm/lead-drawer.tsx`:** Updated `submissions` filter with strict tenant match check:
  `if (lead.client_id && s.client_id && s.client_id !== lead.client_id) return false;`
- **`src/lib/crm.ts` (`buildLeadSummary`):** Filtered `matchingSubmissions` by `s.client_id === lead.client_id` before extracting `primarySub`, ensuring foreign tenant submissions can never populate the AI briefing.

---

## 3. Empirical Verification Evidence

1. **Live Telegram Inbound Greeting Simulation:**
   - Script: `scratch/test_live_telegram_greeting.cjs`
   - Target: `POST /functions/v1/realtor-lead-engine?client_id=c0000000-0000-0000-0000-000000000001&bot_token=8931392683:...`
   - Response:
     ```json
     {
       "success": true,
       "platform": "TELEGRAM",
       "lead_id": "5117510624",
       "state": "SITE_VISIT_BOOKED",
       "reply_sent": "Welcome back Manthan ji! 🙏\n\nAapki VIP Site Visit already booked hai:\n🏢 Property: Griham Heights Luxury Residences (Alkapuri)\n⏰ Scheduled Time: 24 Oct 2026, 5:00 pm\n📍 Google Map Location: https://maps.google.com/?q=Alkapuri+Vadodara\n..."
     }
     ```
   - **Verification:**
     - `Spring field` mentions: **0** (Zero cross-tenant leakage).
     - `lead_type` in database: **`SEEKER`** (Did not transition to `DUAL_ROLE`).
2. **CRM Persona Resolution:**
   - `isDualRoleLead`: **`false`**
   - `hasListedProperty`: **`false`**
   - `hasBuyerInterest`: **`true`**
   - Result: **Pure Buyer Briefing**
3. **Frontend Build Check:**
   - Ran `npm.cmd run build`: Built cleanly with **0 errors** in 1.55s.

---

## 4. Invariants Status

- [x] **100% Non-n8n Architecture:** 0 n8n workflows touched.
- [x] **Multi-Tenant Data Isolation:** Two-tier enforcement (PostgreSQL RLS + Edge Function `.eq("client_id", activeTenantId)`).
- [x] **0 Extra Runtime JS Packages:** Pure TypeScript & Tailwind v4.
- [x] **Apple HIG Design:** Tactile cards and badges preserved.
