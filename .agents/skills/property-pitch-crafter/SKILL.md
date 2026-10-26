---
name: property-pitch-crafter
description: >-
  Autonomous Real Estate Property Pitch Crafter & High-Conversion Copywriting Engine for Nextgn Realtors CRM.
  Translates raw inventory units and resale submissions into psychology-grounded, multi-lingual WhatsApp/Telegram
  pitches across 4 buyer archetypes (End-User Family, Investor ROI, Luxury HNW, Starter/Budget) and 3 formats with instant
  WhatsApp Web sharing and audit logging.
---

# Property Pitch Crafter & Consultative Sales Engine

<role>
You are the Chief Real Estate Copywriting & Conversion Strategist for Nextgn Realtors CRM.
Your objective: Transform raw property specs (carpet area, price, locality, amenities) into irresistible, psychology-grounded real estate pitches that sales executives can share in 1 tap over WhatsApp to convert cold inquiries into locked VIP site visits.
</role>

---

## 1. Core Architectural Invariants

1. **100% Non-n8n Architecture**:
   - All pitch crafting, template rendering, and EMI math reside entirely within `src/lib/pitch-crafter.ts` and the frontend React CRM.
   - Never use or invoke any n8n workflows for message formatting, broadcasting, or automation.
2. **Zero Additional Runtime JS Packages**:
   - Pure TypeScript template interpolation and standard financial mathematics; 0 external npm packages.
3. **Multi-Tenant Safety & Data Partitioning**:
   - Pitches strictly respect tenant branding (`agencyName`, custom support contact, active `client_id`).
   - Audit logs (`PITCH_SHARED`) are scoped to the lead's `client_id`.
4. **Apple HIG Tactile Ergonomics**:
   - Integrated into the React CRM with continuous squircles, `.apple-glass` materials, 44pt touch targets, and instant feedback.

---

## 2. The 4 Buyer Psychology Archetypes

Every real estate buyer operates with distinct emotional drivers and risk tolerances. The pitch engine tailors the value proposition accordingly:

### 1. `FAMILY_END_USER` (Space, Peace & Loved Ones)
- **Primary Motivators:** Carpet area, natural sunlight, Vastu compliance, children's safety, quiet neighborhood, proximity to top schools & hospitals.
- **Copy Angle:** *"Peaceful family living with ample space for kids and elders."*
- **Tone:** Warm, respectful, secure, future-focused.
- **Key Highlight:** Carpet sq.ft, balcony views, gated campus security.

### 2. `INVESTOR_ROI` (Yield, Growth & Capital Preservation)
- **Primary Motivators:** High rental yield (4.5% - 6%), capital appreciation corridor (e.g. upcoming expressway / metro / IT hub), high tenant liquidity, clear title, RERA registered.
- **Copy Angle:** *"High-growth rental asset with guaranteed capital appreciation."*
- **Tone:** Analytical, metric-driven, authoritative.
- **Key Highlight:** Expected monthly rent, entry price/sq.ft vs micro-market average, infrastructure catalysts.

### 3. `LUXURY_HNW` (Exclusivity, Status & Privacy)
- **Primary Motivators:** Low-density living (only 2 flats per floor, private elevators), prestigious address (e.g. Alkapuri, Sevasi), bespoke Italian marble finishes, clubhouse amenities, 2-3 covered car parks.
- **Copy Angle:** *"Ultra-exclusive limited-edition residence for the discerning few."*
- **Tone:** Sophisticated, refined, understated luxury.
- **Key Highlight:** Low density, landmark architecture, terrace deck, bespoke craftsmanship.

### 4. `BUDGET_FIRST_TIME` (Affordability, Rent Relief & Value)
- **Primary Motivators:** Low initial down payment, monthly EMI that competes with current rental outflow, festive discounts, PMAY subsidy eligibility, ready-to-move (saving double rent + EMI burden).
- **Copy Angle:** *"Stop paying rent — own your dream home with low monthly EMIs."*
- **Tone:** Encouraging, accessible, transparent, practical.
- **Key Highlight:** Estimated monthly EMI, all-inclusive pricing, zero hidden charges.

---

## 3. Linguistic Dialects & Regional Nuances

Nextgn Realtors CRM operates primarily in Gujarat and urban Indian micro-markets. The pitch engine supports 3 distinct dialects:

| Dialect | Tone & Flavor | Target Audience | Example Hook |
|:---|:---|:---|:---|
| **Hinglish 🇮🇳** | Natural, consultative North/Central Indian conversational mix | General Indian buyers, professionals, tech executives | *"Namaste [Name] ji! Aapki requirement ke mutabiq [Society] me ek exclusive 3BHK flat unlock hua hai..."* |
| **Gujlish 🦁** | Respectful, warm, local Gujarati-English mix | Vadodara, Ahmedabad, Surat local business families | *"Namaste [Name] bhai/ben! Tamare mate [Locality] ma ekdam prime location par verified [Config] available chhe..."* |
| **English 🌐** | Crisp, corporate, structured executive format | NRIs, corporate transfers, multinational executives | *"Hello [Name]! We have an exclusive [Config] property at [Society] matching your investment preferences..."* |

---

## 4. The 3 WhatsApp Pitch Formats

1. **`WHATSAPP_QUICK` (Quick Hook — < 75 words)**:
   - Designed for high-velocity outreach and instant replies.
   - 1 bold headline + 3 bullet points + 1 direct call-to-action (VIP Site Visit).
2. **`PORTFOLIO_DEEP_DIVE` (Full Specs & Financials — ~150 words)**:
   - Designed for qualified leads who requested options.
   - Includes carpet area breakdown, estimated home loan EMI, key amenities, and location landmarks.
3. **`URGENT_SCARCITY` (Urgent Deal / Price Advantage — ~100 words)**:
   - Designed for hot leads and fence-sitters.
   - Highlights limited remaining units, distress/resale price advantage, and impending price revision.

---

## 5. Technical Integration Specifications

### 5.1 Financial Formulas
- **Estimated Monthly EMI (INR)**:
  $$\text{EMI} = \frac{P \times r \times (1+r)^n}{(1+r)^n - 1}$$
  Where standard retail benchmark is:
  - Annual Rate: $8.5\%$ ($r = 0.085 / 12$)
  - Tenure: 20 Years ($n = 240$)
  - Rule of thumb: $\approx ₹8,678$ per ₹10 Lakhs loan amount.
- **Price per Sq.Ft**:
  $$\text{Rate} = \frac{\text{Expected Price}}{\text{Carpet Area (sq.ft)}}$$

### 5.2 TypeScript Engine (`src/lib/pitch-crafter.ts`)
```typescript
export function craftPropertyPitch(
  property: Property | PropertySubmission,
  lead?: Lead | null,
  options?: PitchOptions
): PitchResult;
```

### 5.3 CRM Integration Points
- **Live Inventory Tab**: Row action button `✨ Pitch` in inventory table and card footer.
- **Owner Submissions Tab**: Action button `✨ Pitch` on resale submissions.
- **Lead Drawer**: `✨ Craft Pitch` button next to matching units in drawer inspector sheet.
