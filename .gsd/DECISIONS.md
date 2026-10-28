# Architecture Decisions

## Phase 4 Decisions: Bi-Directional Dual-Persona Lifecycle Architecture

**Date:** 2026-10-21

### Scope
- Support bi-directional lifecycle where the same client can act as both Property Seeker (Buyer/Tenant) and Property Provider (Seller/Landlord).
- Maintain both profiles in parallel without criteria wipes or state deadlocks.
- Contextual dual-reminder greeting menu for returning dual clients.

### Approach
- **Choice:** Option A (Multi-Persona Lead Model)
- **Rationale:** 
  - Upgrades `leads.lead_type` to `'DUAL_ROLE'` when both buyer and seller actions are registered.
  - Buyer criteria (`property_type`, `budget`, `location`, `site_visit_at`) persist in `leads` table.
  - Seller properties persist independently in `property_submissions` table (with `lead_id` foreign key).
  - Contextual Dual-Reminder greeting menu acknowledges both upcoming visits and submitted property verification status when user greets.
  - Full visibility in React CRM Dashboard with `[DUAL: BUYER + SELLER 🌟]` badges and Lead Drawer dual tabs.

### Constraints
- 100% Non-n8n architectural compliance.
- Zero criteria wipes: Switching personas must NEVER delete previous search criteria or cancel scheduled visits.
- High-converting Indic language support across English, Hinglish, and Gujlish.

## Phase 7 Decisions: Multi-Portal Lead Webhooks, Auto-Property Presentation & Site Visit Booking Engine

**Date:** 2026-10-23

### Scope
- Universal webhook ingestion for major Indian real estate portals (99acres, MagicBricks, Housing.com, CommonFloor, Facebook Lead Ads, and Custom Webhooks) in `integrations-tab.tsx`.
- Real-time automated property matching and WhatsApp outreach delivery with brochure links, Google map pins, and consultative site visit CTAs.
- Seamless handoff to the TypeChat FSM conversational engine when the lead replies on WhatsApp.
- Prominent missing WhatsApp number indicator in CRM Leads Table, Badges, and Drawer with 1-tap manual phone entry modal.
- Multi-tenant isolation and WABA safety compliance (zero bans, transactional messaging, and anti-ban jitter).

### Approach
- **Outreach Timing:** Option A (Instant Real-Time Automated Outreach) — Triggers WhatsApp outreach within seconds of receiving the portal webhook payload to maximize lead conversion during peak intent.
- **Language & Tone:** Consultative Hinglish — Engaging, high-taste, brand-tailored real estate advisor tone delivering property specs, pricing, brochure PDF link, map pin, and an invitation to schedule an exclusive VIP site visit.
- **Missing Phone UI & Fallbacks:**
  - Leads with no phone, landline, or masked numbers receive a dedicated badge: `⚠️ No WhatsApp Number`.
  - Drawer shows visual alert banner: *"Portal inquiry me WhatsApp number provide nahi kiya gaya"*.
  - 1-tap "Add WhatsApp Number" modal allows sales executives to input verified mobile numbers acquired via phone/email, immediately enabling WhatsApp chat actions.
- **De-duplication:** Automatically merges multiple inquiries from the same phone/email across different portals within a 24-hour window to prevent CRM clutter.

### Constraints
- Strictly 100% Non-n8n (all webhook logic and normalization inside Supabase Edge Function `realtor-lead-engine` and CRM dashboard).
- Zero additional runtime JavaScript packages (pure React, Tailwind v4, Lucide icons, and TanStack Query).
- Multi-tenant WABA safety: tenant-scoped token resolution and compliance with Meta messaging limits.

## Phase 26 Decisions: Universal Conversational Intake, Multi-Persona Triage & City-Agnostic Lead Engine

**Date:** 2026-10-27

### Scope
- Universal, city-agnostic greeting with 3-choice intent triage (1. Buy/Rent, 2. Sell/Lease, 3. Both/Upgrade) across Hinglish, Gujlish, and English.
- Direct intent auto-bypass: specific first messages (e.g. "muje bhayli me 3bhk chahiye", "shop bechni he", "office lease par dena he") immediately skip the triage menu and route straight into their dedicated flow.
- Smart 6-Turn Compound Owner Intake with area+floor, demand+furnishing, parking+possession, and full Commercial Lease (`LEASE` / `LEASE_OUT`) support.
- Smart 3-Turn Compound Buyer Qualification with BHK/Type, locality+budget band, timeline+purpose (Ready to Move vs Under Construction; Family End-User vs Investor), and Commercial Lease search.
- Multi-property listing (2nd/3rd property without overwriting) and secondary search lifecycle without corrupting existing site visits.
- Culturally authentic, natural Gujlish linguistic polish (eliminating "Mitra", "sthit chhe", "shodhva mango chho", "dhyan rakhjo", "chiye").
- Ultra-short, mobile-first message ergonomics across all languages (max 2-3 lines per message).
- 100% city-agnostic: zero hardcoded "Vadodara" references across prompts, messages, and sweeps.

### Approach
- **Choice:** Unified Smart Progressive Compound Architecture with State-Aware Lifecycle Memory
- **Rationale:**
  - Reduces conversational turns by 50% while capturing 90% of CRM inventory and lead scoring attributes.
  - Eliminates conversational amnesia: returning users with active visits or listings receive compact contextual briefings instead of robotic restarts.
  - Full Commercial Lease alignment across edge function FSM, `property_submissions`, and CRM Live Inventory.
  - Eliminates user drop-off via short, punchy 2-3 line WhatsApp messages.

### Constraints
- 100% Non-n8n architectural compliance.
- Zero hardcoded city names (strictly multi-tenant dynamic).
- Local git commits only. No push to remote.
- WABA safety: batch caps and inter-message delay jitter for sweeps.

## Phase 27 Decisions: Dynamic Stage-Conditioned Intent Engine & Adaptive Real Estate LLM Agent

**Date:** 2026-10-28

### Scope
- Elevate lead inquiry conversational intent accuracy to ~100% across all vernacular dialects (Hinglish, Gujlish, Gujarati script, English, colloquial slangs, and typos).
- Solve intent amnesia and single-token ambiguity (e.g. "Villa", "Rent", "25", "2 BHK", "Gotri").
- Implement Dynamic Stage-Conditioned Prompting: inject current dialog state, last bot question asked, already collected entities, and stage-specific few-shot exemplars into the LLM classifier.
- Guarantee Dual-Redundant Accumulative Context Memory across database columns and `metadata.seeker_draft` / `metadata.owner_draft` with zero criteria wipes.
- Support Conversational Detours (Side Questions & FAQs during intake): answer the user's specific query immediately (office address, RERA, brokerage) and smoothly resume the missing intake field in the same turn without resetting state.
- Implement Zero-Regex Token Tree Fallback with strict word-boundary token trees preventing numeric option and BHK configuration collisions.

### Approach
- **Choice:** Option A (Dynamic Stage-Conditioned Prompting + State Memory)
- **Rationale:**
  - Token Efficiency: Reduces prompt tokens by ~55% (from ~2,150 tokens to ~850 tokens per turn) by modularizing state prompts instead of sending all exemplars on every turn.
  - Cost & Speed: Keeps inference cost under ₹0.05 per turn on Groq Llama 3.3 70B with sub-650ms latency (Gemini 2.0 Flash as secondary fallback).
  - Accuracy: Constrains LLM decision space to the active conversational stage while preserving Tier 1 Global Intent bypasses (Brochure, Call, FAQ, Opt-out).
  - Determinism: Eliminates ping-pong loops and false role switching permanently.

### Constraints
- Strictly 100% Non-n8n architectural compliance.
- Sub-750ms latency SLA for WhatsApp and Telegram webhooks.
- Multi-tenant tenant-scoped inventory and client branding isolation.
- 0 additional runtime JavaScript packages.



