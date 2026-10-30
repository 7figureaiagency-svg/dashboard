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

## Phase 40 Decisions: Dual-Role Modular Slot Engine, Conversational Steering & Production Restructuring

**Date:** 2026-10-30

### Scope
- Ground-up architectural restructuring from monolithic procedural code to a clean **3-Layer Slot-Filling Cognitive Engine** (`Layer 1: Perception/AI`, `Layer 2: Slot Memory & Dual-Role Engine`, `Layer 3: Action & Presentation`).
- **Open Intake Greeting**: Natural, conversational open greeting (`"Namaste! Griham Realty me aapka swagat hai. Aap kis type ki property search ya list karna chahte hain?"`) with instant auto-bypass for messages with concrete details.
- **Fast-Track 4-Slot Buyer Qualification**:
  1. `Property Type` (Flat, Villa, Commercial Shop/Office, Plot)
  2. `Location/Area` (Geographical locality: Alkapuri, Gotri, etc.)
  3. `Budget Range` (Normalized to INR, e.g. 1 Cr, 85 Lakhs)
  4. `Timeline / Possession` (Ready to Move vs Under Construction)
  - Purpose auto-defaults to `Self-Use` unless specified otherwise.
  - Zero hallucination: DB query triggered strictly when all 4 slots are fulfilled.
  - No matching inventory in DB: Honest reassurance (*"Hamari team aapke liye best option dekh rahi hai, jaldi hi connect karegi"*) + real-time sales alert.
- **Fast-Track 3-Slot Seller Intake**:
  1. `Property Type & Society/Project Name` (e.g. 3BHK Flat in Nilamber Bellissimo)
  2. `Size / Area` (Carpet/Built-up area or BHK)
  3. `Expected Price / Rent` (e.g. 85 Lakhs)
  - Syncs to `property_submissions` table under `PENDING_VERIFICATION`.
- **Dual-Role Lifecycle (Relocation & Upgrade)**:
  - If user mentions both buying and selling (e.g., *"Mera 2BHK bechna hai aur naya 3BHK lena hai"*):
    - Ask user which one to address first: *"Bahut badhiya! Pehle aap naya flat explore karna chahenge ya purana flat list karna chahenge?"*
  - Complete isolation between `metadata.seeker_profile` and `metadata.seller_profile` with active persona pointer (`active_persona: "BUYER" | "SELLER"`).
  - Clean Bridge Handoff once one track completes to smoothly resume the other.
- **Conversational Steering & Anti-Derailment**:
  - Enforce **AAS Formula (Acknowledge -> Answer Side-FAQ -> Steer Back to Pending Slot)**.
  - Every bot turn ends with exactly 1 clear question or 1-tap option, keeping the bot in the driver's seat.
- **Site Visit Booking & Reschedule Ergonomics**:
  - Open date/time prompt with clear example format: *"Aap kis date aur time par visit plan karna chahenge? 📅 (Jaise: 'Kal shaam 5:00 baje' ya 'Sunday 11:00 AM')"*.
  - Rescheduling: Directly acknowledges reschedule, prompts for new date/time, updates `site_visits` table, and notifies executive.
- **Pre-Visit Reminder & Inability Handling**:
  - Single reminder 1-2 hours prior to scheduled site visit with Google Maps pin & senior on-site executive contact details.
  - If user replies "Nahi aa paunga" / "Late ho jaunga": Immediately acknowledge with empathy and prompt to reschedule a new slot on the spot without dropping the lead.
- **Post-Visit Attendance & Feedback Engine**:
  - Sent 1-2 hours after scheduled visit time:
    - Step 1 (Attendance Check): `1️⃣ Haan, visit ho gayi` vs `2️⃣ Nahi, visit nahi ho paayi`.
    - If 1️⃣ (Attended): Ask property feedback and offer official price sheet / developer token negotiation meeting.
    - If 2️⃣ (Not attended): Immediately offer to reschedule for tomorrow or weekend.
- **Incomplete Lead Recovery Sweeps**:
  - Nudge 1: Next day at 11:30 AM IST, gently recalling where conversation paused and asking for the specific missing slot.
  - Nudge 2 (Day 3): Value-add teaser (fresh deal matching their area).
  - Max 2 nudges before marking lead dormant (zero spam).
- **Industry Standard Drip Cadence (Qualified Unvisited Buyers)**:
  - Day 1 (24 hours after options shown): Price breakdown / brochure nudge.
  - Day 3: Alternative matching inventory / price point comparison.
  - Day 7 (Friday 11:30 AM): Weekend VIP site visit invitation.
- **WABA Anti-Ban Safety Invariants**:
  - Automated sweeps restricted strictly to 11:00 AM - 6:30 PM IST.
  - Batch caps: Maximum 20 leads per sweep run with 350ms-550ms inter-message delay jitter.
  - Instant quiet DND opt-out if user says "stop", "mat bhejo", "not interested".
- **Inventory Pagination ("Aur Dikhao")**:
  - Deduplication via `last_option_ids`. Next 2 unseen properties shown if available; otherwise honest team handoff message.
- **Language Mirroring**:
  - 100% dialect lock matching incoming user text (Gujlish -> Gujlish, Hinglish -> Hinglish, English -> English).
- **Human Sales Escalation Points**:
  - Real-time sales alert to human realtor when: (1) Site visit booked, (2) User asks for a call/executive, (3) No matching inventory found for qualified criteria.
- **Micro-LLM Token Efficiency & Scalability**:
  - Hyper-focused Micro-LLM extraction prompt: ~400 tokens per turn (~₹0.004/msg on Gemini 2.0 Flash).
  - 3-Tier Multi-Tenant Scaling: Gemini 2.0 Flash primary -> Groq Llama 3.3 70B instant hot fallback -> Pure deterministic slot engine.

### Constraints
- 100% Non-n8n architectural compliance.
- Zero runtime JavaScript packages added.
- Multi-tenant WABA safety: inter-message delay jitter and batch caps enforced.

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

## Phase 35 Decisions: Enterprise Multi-Tenant Hardening & Zero-Regex Autonomous Cognitive Engine

**Date:** 2026-10-29

### Scope
- **100% Regex Eradication:** Eliminate all legacy brittle regexes, number option interceptors (preventing `1 કરોડ` from triggering Menu Option 1), and rigid priority chains that override AI intent.
- **Single-Pass Cognitive Turn Router:** Route all inbound turns (WhatsApp & Telegram) through a fast, structured JSON Schema parser (Gemini 2.5 Flash / Groq / OpenAI compatible) capturing Primary Intent, Language/Script, Context Pivot, Extracted Entities (normalized numbers/localities), and Missing Critical Slots in a single turn (< 400ms).
- **Dynamic Context Shift & Reschedule Flow:**
  - "Site visit change thase" ➔ Identifies `RESCHEDULE_VISIT` with missing date/time, prompts for new slot instead of premature booking.
  - "Brocher moklo ne" ➔ Identifies `REQUEST_BROCHURE`, dispatches brochure PDF/link directly instead of suggesting alternate properties.
  - Requirement changes (e.g., Waghodia Road ➔ Alkapuri) ➔ Identifies `reset_previous_context: true`, purges stale search memory, and initiates fresh search without stale location leakage.
- **Enterprise Multi-Tenant Hardening for 100+ Clients:**
  - **Zero Cross-Tenant Leakage:** Completely eradicate dangerous fallbacks to `defaultTenantId` (specifically line 902 inventory fallback and silent webhook defaulting). Every query strictly scoped by `client_id = activeTenantId`.
  - **In-Memory Tenant Config Cache:** Cache tenant branding, operating city, bot tokens, WABA credentials, and `bot_knowledge` in Edge Function memory (TTL: 5-10 min) reducing DB hits from 4-5 to 1 per turn.
  - **Composite PostgreSQL Indexing:** Add composite indexes on `leads(client_id, lead_id)`, `leads(client_id, status, last_active_at)`, `inventory(client_id, status, property_type)`, and `site_visits(client_id, scheduled_at, status)` to guarantee sub-5ms query times under 100+ tenants and 500k+ rows.
  - **Isolated Tenant AI Personas:** Dynamically inject only the active tenant's operating city, agency branding, and inventory portfolio into the cognitive prompt context.

### Approach
- **Choice:** Native Single-Pass Structured Cognitive Router + In-Memory Tenant Isolation (Model-Agnostic direct REST).
- **Rationale:**
  - Avoids heavy 3rd-party Agent SDKs (which cause Deno bundle bloat, 3-6s multi-hop latency, and 15x cost bloat).
  - Delivers sub-600ms end-to-end webhook response times.
  - Guarantees 100% data isolation for 100+ brokerages with zero cross-tenant contamination.
  - Ensures seamless Gujarati script (`અલકાપુરી`, `૩bhk`, `૧ કરોડ`), Gujlish, Hinglish, and English comprehension.
  - Strictly follows `cs-chatbot-design` 3 Golden Response Principles (Acknowledge First, Be Concise, Offer Next Steps).

### Constraints
- 100% Non-n8n architecture (Supabase Edge Functions + PostgreSQL + React CRM).
- Zero extra client runtime JS packages.
- Test suite execution policy: Do not run automated test suites unless explicitly requested by the user.
- Multi-tenant WABA safety: Enforce tenant-scoped rate limits, batch caps (max 20), and delay jitter.





