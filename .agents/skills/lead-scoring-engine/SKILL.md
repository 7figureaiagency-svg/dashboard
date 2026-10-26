---
name: lead-scoring-engine
description: >-
  Autonomous Real Estate Lead Scoring, Behavioral Intent Tracking & Conversion Probability Engine for Nextgn Realtors CRM.
  Calculates dynamic 0-100 scores and temperature classifications (HOT 🔥, WARM ⚡, COLD ❄️) from FSM transitions,
  financial viability, visit attendance, conversational velocity, and objection patterns to prioritize high-intent buyers and sellers.
---

# Lead Scoring Engine & Behavioral Intent System

<role>
You are the Chief Data & Conversion Intelligence Architect for Nextgn Realtors CRM.
Your objective: Transform raw real estate inquiries and multi-channel interactions (WhatsApp, Telegram, Portals) into actionable, mathematically grounded lead scores (0–100) and temperature tiers (**HOT 🔥**, **WARM ⚡**, **COLD ❄️**) that enable brokers to close deals 3x faster by focusing on the top 10% closing-ready leads.
</role>

---

## 1. Core Architectural Invariants

1. **100% Non-n8n Architecture**:
   - All scoring calculations reside entirely in `supabase/functions/realtor-lead-engine/index.ts` and client-side helper `src/lib/lead-scoring.ts`.
   - Never use or invoke any n8n workflows for scoring or automation.
2. **Zero Additional Runtime JS Packages**:
   - Pure TypeScript mathematical calculation; zero external npm analytics packages.
3. **Deterministic & Transparent**:
   - Every score is strictly explainable with an explicit breakdown (e.g. `+45 Site Visit Done`, `+20 Budget >= 75L`, `+10 Immediate Response`).
   - Stored in `leads.metadata.lead_score` and `leads.metadata.lead_temperature` for seamless CRM indexing.
4. **Apple HIG Visual Ergonomics**:
   - Visualized in the React CRM using Apple HIG dot-pills (`.crm-badge`) with tactile color accents:
     - 🔥 **HOT**: Obsidian Dark background with Amber-Orange pulse accent (`oklch(0.72 0.22 45)`)
     - ⚡ **WARM**: Amber/Yellow accent (`oklch(0.78 0.18 75)`)
     - ❄️ **COLD**: Muted Slate-Blue accent (`oklch(0.65 0.08 240)`)

---

## 2. Mathematical Scoring Rubric (0 – 100 Scale)

Total Score = $\min(100, \max(0, \sum \text{Positive Signals} - \sum \text{Penalty Signals}))$

### A. Stage & Commitment Signals (Max 45 Pts)
The single biggest predictor of real estate conversion is physical or confirmed commitment.

| Event / State | Points | Rationale |
|:---|:---:|:---|
| **Site Visit Attended / Completed** (`SITE_VISIT_DONE` / `COMPLETED`) | **+45** | Physical site visit completed; highest intent indicator in Indian real estate. |
| **Site Visit Confirmed / Booked** (`SITE_VISIT_BOOKED` / `SCHEDULED`) | **+35** | Specific date and time slot locked into field executive schedule. |
| **Site Visit Proposed / Slot Selected** (`SITE_VISIT_PROPOSED`) | **+25** | Customer agreed to visit and selected specific morning/evening preference. |
| **Alternative Property Cards Requested** (`OPTIONS_SENT` / Option request) | **+18** | High curiosity, active comparison shopping. |
| **Requirement Fully Qualified** (`QUALIFIED` - Budget, Locality, BHK provided) | **+12** | Serious buyer with clear parameters, not a casual window-shopper. |
| **Dual-Role Profile** (`has_seller_profile` & `has_buyer_profile`) | **+10** | High lifetime value client looking to sell existing asset to fund new purchase. |

### B. Financial Viability & Ticket Size (Max 25 Pts)

| Budget Threshold (INR) | Points | Rationale |
|:---|:---:|:---|
| **Ultra-Luxury (Budget $\ge$ ₹1.5 Cr)** | **+25** | High margin brokerage commission; VIP advisory priority. |
| **Premium (Budget ₹75L – ₹1.5 Cr)** | **+20** | Sweet-spot buyer in Vadodara/Gujarat urban market. |
| **Mid-Segment (Budget ₹40L – ₹75L)** | **+15** | Standard high-volume 2BHK/3BHK ready inventory. |
| **Affordable / Starter (< ₹40L)** | **+10** | Entry-level investor or 1BHK seeker. |
| **Cash Ready / Low Loan Dependency** | **+10** | Stated token availability or upfront payment capability. |

### C. Conversational Velocity & Engagement (Max 20 Pts)

| Engagement Behavior | Points | Rationale |
|:---|:---:|:---|
| **Fast Replier (Under 5 minutes)** | **+15** | Actively engaged with mobile in hand; prime call window. |
| **Shared Specific Objection/Feedback** (e.g. layout, canal, road) | **+10** | Authentic evaluator; ready to buy if specific objection is resolved. |
| **Requested Direct Human Advisor Call** | **+15** | Demanded human executive; ready for sitting. |
| **High Message Volume ($>$ 4 conversational turns)** | **+10** | Deep interaction with bot or executive. |

### D. Negative & Churn Penalties (-10 to -35 Pts)

| Churn Factor | Penalty | Action Taken |
|:---|:---:|:---|
| **Explicit Rejection** (*"Budget bahar hai"*, *"Not interested"*) | **-35** | Downgrades to COLD; marks `state = 'DROPPED'`. |
| **Unexcused Missed Visit** (`site_visits.status = 'MISSED'`) | **-20** | Downgrades priority; triggers soft reschedule drip. |
| **Dormant / Inactive > 7 Days** (No replies to nudges) | **-15** | Shifts from HOT/WARM to COLD. |
| **Missing WhatsApp Phone Number** (Portal lead with null phone) | **-10** | Flagged with missing phone alert banner in CRM. |

---

## 3. Temperature Classification Rubric

```
┌────────────────────────────────────────────────────────┐
│  🔥 HOT LEADS (Score: 70 – 100)                        │
│  - Conversion Probability: ~65% - 85%                  │
│  - SLA: 10-Minute Executive Contact Guarantee          │
│  - CRM Action: Top of Triage Strip, Amber Badge        │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│  ⚡ WARM LEADS (Score: 40 – 69)                        │
│  - Conversion Probability: ~30% - 50%                  │
│  - SLA: Same-Day Consultative Follow-up                │
│  - CRM Action: Automated Project Card & Drip Nudge     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│  ❄️ COLD LEADS (Score: 0 – 39)                         │
│  - Conversion Probability: < 15%                       │
│  - SLA: Low-Frequency WABA Broadcast Only (Festivals)   │
│  - CRM Action: Bottom of Table, Archived from Triage   │
└────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Specifications

### 4.1 Database Metadata Contract (`leads.metadata`)
```json
{
  "lead_score": 85,
  "lead_temperature": "HOT",
  "score_breakdown": {
    "stage_commitment": 45,
    "financial_viability": 20,
    "conversational_velocity": 20,
    "penalties": 0
  },
  "score_updated_at": "2026-10-26T11:45:00.000Z"
}
```

### 4.2 Edge Function Hook (`supabase/functions/realtor-lead-engine/index.ts`)
On every inbound message and FSM transition:
1. Run `computeLeadScore(lead, currentState, messageText, context)`.
2. Attach `metadata.lead_score` and `metadata.lead_temperature` to `leadUpdates`.
3. If score crosses $\ge 70$, dispatch high-priority `HOT_LEAD_ALERT` to sales executives.

### 4.3 React CRM Frontend Integration
1. **`src/lib/lead-scoring.ts`**: Pure TypeScript scoring utility used for client-side rendering and instant calculation.
2. **`src/components/crm/badges.tsx`**: Add `LeadScoreBadge` rendering squircle dot-pills with fire emoji and score integer.
3. **`src/components/crm/leads-tab.tsx`**:
   - Add "Score" column in table.
   - Add segmented filter chip: `[ All (45) | 🔥 Hot (12) | ⚡ Warm (21) | ❄️ Cold (12) ]`.
   - Sort table by Lead Score descending by default.
