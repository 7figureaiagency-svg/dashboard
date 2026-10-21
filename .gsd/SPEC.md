# System Specification: Realtor Lead Engine & Conversational Architecture

**Status:** FINALIZED  
**Updated:** 2026-10-21  

---

## 1. System Vision & Objective
Nextgen Realtors Lead Engine is a 100% Non-n8n real estate customer intelligence platform running on Supabase PostgreSQL + Supabase Edge Functions (Deno TypeScript) + React Tailwind CRM Dashboard. It handles multi-channel lead acquisition (WhatsApp, Telegram), multilingual customer conversations (English, Hindi/Hinglish, Gujarati/Gujlish), property inventory curation, and VIP site visit scheduling.

## 2. Core Constraints & Safety Invariants
1. **100% Non-n8n Architecture Rule:** All conversational intelligence, lead qualification, and scheduling must reside strictly in Supabase Edge Functions and the React codebase. n8n workflows are strictly historical read-only files.
2. **Multi-Tenant WABA Safety:** Automated sweeps (reminders, feedback, follow-ups) must enforce batch caps (max 20 leads/run), inter-message jitter (350-550ms), and strict business hours cut-off (11:00 AM - 6:30 PM IST).
3. **No Automated Test Suites on Deploy:** Automated test suites must only be run when explicitly requested by user.
4. **Git Policy:** Local git commits only (`git commit`). Do NOT push to remote without explicit user instructions.

## 3. Conversational Architecture Requirements
1. **Schema-Guided Zero-Regex Intent Classification:**
   - Eliminate brittle cascading regular expressions and section hijacking.
   - Use structured, typed discriminated union intent definitions (TypeChat/Instructor pattern).
   - Discriminate between: `BOOK_VISIT`, `SELECT_OPTION`, `CHANGE_REQUIREMENT`, `CONFIRM_CRITERIA`, `ASK_FAQ`, `SUBMIT_LISTING`, `GENERAL_QUERY`.
2. **Deterministic Dialog State Machine:**
   - Every lead state (`QUALIFYING`, `OPTIONS_SENT`, `CRITERIA_CONFIRMATION_PENDING`, `SITE_VISIT_BOOKED`, `ROLE_SELECTION_PENDING`) has mathematically valid event transitions.
   - Accidental criteria wipes or premature option anchoring must be impossible.
3. **Zero Silent Drops:**
   - Every inbound message must produce a deterministic, helpful reply.
   - Outbound dispatch must enforce an invariant where `replyText` cannot be empty.
