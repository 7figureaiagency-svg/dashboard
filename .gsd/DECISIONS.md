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

## Phase 33 Decisions: Autonomous Universal Multimodal Real Estate Agent & Bulletproof Cognitive Engine

**Date:** 2026-10-29

### Scope
- Transform the conversational real estate agent into a 100% accurate, bulletproof, multimodal system that handles both text and voice notes.
- Support all 22 scheduled Indian languages and vernacular regional dialects (Hindi, Gujarati, Marathi, Tamil, Telugu, Kannada, Bengali, Punjabi, Marwari, Kathiyawadi, Hinglish, Gujlish, English).
- Full multimodal voice note ingestion for WhatsApp (`audio/ogg; codecs=opus`) and Telegram (`msg.voice` / `msg.audio`).
- Total elimination of brittle regex cascades and substring matching; full adoption of Gemini 2.5 Flash / Pro Structured JSON Schema (`responseSchema`).
- Pre-flight reflection and self-correction gate prior to dispatching outbound messages.
- Modularization of the 12,000-line `realtor-lead-engine/index.ts` monolith into maintainable submodules.

### Approach
- **Voice Transcription:** Option A (Groq Whisper-Large-v3 primary with ~180ms latency and superhuman Indic accuracy + Gemini 2.5 Flash Audio API zero-downtime fallback).
- **Cognitive Intent & Entity Extraction:** TypeChat-style Gemini 2.5 Flash with Thinking and strict `responseSchema` for 90% of turns; automated escalation to Gemini 2.5 Pro for complex turns (heavy negation, ambiguity, multi-property dispute).
- **Multilingual Synthesis:** Dynamic native Indic prompt synthesis conditioned on the lead's stored `language_profile` in `leads.metadata`, replacing static hardcoded template strings.
- **Verification Gate:** Sub-150ms pre-flight reflection pass verifying that the synthesized reply does not contradict user input, does not re-ask answered questions, does not hallucinate entities, and respects WABA batch caps.
- **Phased Execution:** 4 atomic plans (33.1 Voice Engine, 33.2 Zero-Regex Cognitive Schema, 33.3 Universal Multilingual Synthesizer, 33.4 Self-Correction Gate & Modularization).

### Constraints
- 100% Non-n8n architecture: All logic exclusively within Supabase Edge Functions and the React CRM application.
- WABA Safety Invariants: Max 20 leads per sweep, 350-550ms jitter delay, and transactional messaging guidelines preserved.
- Zero extra client runtime JS packages.
- Token budget is non-restrictive: accuracy, reliability, and precision are Priority #1.


**Date:** 2026-10-28

### Scope
- Execute end-to-end quality assurance and reliability auditing across all Phase 27 conversational upgrades.
- **4 Dialects Tested:** Gujlish (colloquial Roman Gujarati), Hinglish (conversational Roman Hindi), Gujarati Script (શુદ્ધ લિપિ with Indic numeral normalization), and English (NRI/Corporate).
- **5 Real-World User Personas Tested:**
  1. *The 1-Word Texter:* Single-token replies ("2", "Gotri", "Rent", "Office", "Sunday") verifying zero context loss.
  2. *The Compound Storyteller:* Multi-entity single-turn messages capturing configuration, budget, location, and timeline in 1 turn without repetitive questions.
  3. *The Ambiguous Typo & Slang User:* Broken spelling ("flt", "makan", "bhadu", "2bhk levo che") ensuring zero role misclassification.
  4. *The Skeptical Detour Asker:* In-flight FAQ questions (office address, brokerage, RERA) verifying single-turn dual response and seamless intake resumption.
  5. *The Dual-Role Switcher:* Concurrent buyer and seller transactions (Property 1 ➔ Property 2 archival, buyer search with active booked visit preservation).
- **Full Property Spectrum:** Residential (Flats, Duplex, Villa), Commercial (Office, Shop, Showroom, Commercial Lease), Plots/Land (Var/Gaj, Vigha), and Transactions (Buy, Rent, Sell, Rent Out, Lease).
- **Live Production Endpoint:** Test live deployed Edge Function `v76-conversational-intelligence-engine` and assert PostgreSQL database state consistency.

### Approach
- **Choice:** Option C (Hybrid Automated Simulation Harness + Interactive Device Verification)
- **Rationale:**
  - Automated harness executes 25+ diverse conversational permutations against the live edge function in under 45 seconds, asserting database integrity after each turn.
  - Generates an empirical QA Dossier detailing accuracy, token footprint per dialect, and edge-case boundaries.
  - Provides a 2-minute interactive Telegram script for live mobile verification on `@GrihamRealtybot`.

### Constraints
- Strictly 100% Non-n8n architecture.
- Multi-tenant WABA safety invariants.
- Local git commits only. No push to remote.
- Zero extra runtime JS packages.




