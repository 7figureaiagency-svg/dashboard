# Structured Slot Filling Rubric & Compound Ingestion Engine

This guide establishes the entity extraction rubrics, mandatory vs optional slot hierarchies across personas, normalization standards, and compound utterance ingestion rules for Nextgn Realtors CRM.

---

## 1. Persona Slot Requirements Matrix

Conversational data collection is strictly role-scoped. Do not prompt for parameters irrelevant to the client's objective.

### A. Buyer Persona
| Slot | Type | Priority | Validation / Permitted Range | Auto-Skip Condition |
|:---|:---|:---:|:---|:---|
| `purpose` | Enum | P0 (Turn 1) | `SELF_USE`, `INVESTMENT` | None |
| `preferred_location` | String / Taxonomy | P0 (Turn 2) | Vadodara Micro-markets (Vasna, Gotri, Sevasi, Alkapuri, Waghodia, etc.) | If `purpose == 'INVESTMENT'` ➔ Defaults to `"FLEXIBLE"` |
| `property_type` | Enum | P0 (Turn 3) | `APARTMENT`, `VILLA`, `PENTHOUSE`, `DUPLEX`, `PLOT`, `COMMERCIAL_SHOP` | Extracted from compound initial text |
| `bhk` | Enum | P0 (Turn 3b) | `1BHK`, `2BHK`, `3BHK`, `4BHK`, `5BHK+` | If commercial or plot |
| `budget_min` / `budget_max` | Integer (INR) | P0 (Turn 4) | ₹25,00,000 to ₹10,00,00,000 | None |
| `timeline` | Enum | P1 (Turn 5) | `READY_TO_MOVE`, `UNDER_CONSTRUCTION` | None |
| `loan_needed` | Boolean | P2 (Optional) | `true` / `false` | Inferred from financing inquiries |

### B. Tenant Persona (Residential / Commercial Rent)
| Slot | Type | Priority | Validation / Permitted Range | Notes |
|:---|:---|:---:|:---|:---|
| `preferred_location` | String / Taxonomy | P0 | Verified micro-market | Immediate office / school commute context |
| `property_type` | Enum | P0 | `APARTMENT`, `VILLA`, `OFFICE`, `SHOP` | Residential vs Commercial distinction |
| `bhk` | Enum | P0 | `1BHK`, `2BHK`, `3BHK` | N/A for commercial |
| `monthly_rent_budget` | Integer (INR) | P0 | ₹10,000 to ₹2,50,000 / month | Never mix with purchase budgets |
| `furnishing_status` | Enum | P1 | `UNFURNISHED`, `SEMI_FURNISHED`, `FULLY_FURNISHED` | Crucial for rental pricing |
| `tenant_profile` | Enum | P1 | `FAMILY`, `BACHELOR`, `CORPORATE_LEASE` | Landlord gating criteria |

### C. Owner / Seller Persona (Residential Resale)
| Slot | Type | Priority | Validation / Permitted Range | Turn Sequence |
|:---|:---|:---:|:---|:---|
| `project_name` / `society` | String | P0 | Verified society name (passed through `STOP_WORDS_SET`) | Turn 1 |
| `property_type` | Enum | P0 | `FLAT`, `BUNGALOW`, `DUPLEX`, `PENTHOUSE` | Turn 2 |
| `bhk` | Enum | P0 | `1BHK` to `5BHK+` | Turn 2 |
| `carpet_area_sqft` | Integer | P1 | 300 to 10,000 sq.ft. | Turn 3 |
| `floor_number` | Integer / String | P1 | Floor number (e.g., 4th floor of 12) | Turn 4b (multi-story only) |
| `furnishing_status` | Enum | P1 | `UNFURNISHED`, `SEMI_FURNISHED`, `FULLY_FURNISHED` | Turn 5b |
| `expected_price` | Integer (INR) | P0 | Owner demand figure in Lakhs/Crores | Turn 5 |

### D. Commercial Owner / Landlord (Commercial Sale / Lease)
| Slot | Type | Priority | Permitted Values | Separation Invariant |
|:---|:---|:---:|:---|:---|
| `commercial_type` | Enum | P0 | `SHOP`, `SHOWROOM`, `OFFICE`, `WAREHOUSE`, `PLOT` | Explicit commercial categorization |
| `deal_structure` | Enum | P0 | `SALE` (मांग), `RENT` (मासिक किराया), `LEASE` (दीर्घकालीन पट्टा) | Strict separation of Sale vs Lease terminology |
| `carpet_area_sqft` | Integer | P0 | Square footage | Base pricing metric |
| `expected_value` | Integer (INR) | P0 | Total selling price or monthly rent | Labeled accurately based on deal structure |

---

## 2. Multi-Slot Compound Message Ingestion

High-intent clients frequently declare multiple preferences in their opening statement or follow-up messages. The system must process these atomically without asking redundant questions.

### Ingestion Scenario 1: Compound Opening Inquiry
> **User**: *"I am looking for a 3 BHK duplex in Vasna Road around 85 Lakhs ready to move for my family."*

#### Extracted Slots:
* `lead_type`: `BUYER`
* `purpose`: `SELF_USE` (from "for my family")
* `property_type`: `DUPLEX`
* `bhk`: `3BHK`
* `preferred_location`: `Vasna Road`
* `budget_max`: `8500000`
* `timeline`: `READY_TO_MOVE`

#### Conversational Action:
* **Slots Filled**: 6 of 6 core slots.
* **Next Dialogue Step**: **Zero qualification questions.** Immediately proceed to property presentation or site visit invitation:
  > *"Zaroor! Vasna Road me family ke liye 3 BHK Ready-to-Move Duplex ₹85 Lakhs ke budget me 2 verified options available hain! 🏡"*

---

### Ingestion Scenario 2: Vernacular Compound Seller Listing
> **User**: *"Gotri ma Ananta astha ma 3bhk flat vechvano chhe 4th floor par 65 lakh ma"*

#### Extracted Slots:
* `lead_type`: `SELLER` (from "vechvano chhe")
* `society`: `Ananta Astha`
* `preferred_location`: `Gotri`
* `property_type`: `FLAT`
* `bhk`: `3BHK`
* `floor_number`: `4`
* `expected_price`: `6500000`

#### Conversational Action:
* **Remaining Slot**: `furnishing_status` (Turn 5b).
* **Next Dialogue Step**:
  > *"Barobar! Ananta Astha, Gotri ma 4th floor par 3 BHK flat (₹65 Lakhs) note kari lidhu chhe. 📍
  > Flat furnishing status su chhe?
  > 1️⃣ Fully Furnished
  > 2️⃣ Semi Furnished
  > 3️⃣ Unfurnished"*

---

## 3. Entity Normalization Rules

All extracted text must be normalized into typed canonical structures before database persistence.

### A. Currency & Budget Normalization
Handles Indic vernacular and English expressions:

| Input Text | Canonical Stored Integer (INR) |
|:---|:---:|
| `૫૦ લાખ` (Gujarati Indic script) | `5000000` |
| `75L` / `75 lakh` / `75 lac` | `7500000` |
| `1.2 cr` / `1.2 crore` / `1 crore 20 lakh` | `12000000` |
| `45 hazar` / `45k` (for rentals) | `45000` |

### B. Micro-Market Locality Normalization
Aliases must map to canonical Vadodara localities:

| Raw Utterance / Alias | Canonical Locality |
|:---|:---|
| "Vasna", "Vasna Bhayli", "Vasna Road" | `Vasna Road` |
| "Gotri Sevasi", "Sevasi TP 1", "Sevasi" | `Sevasi` |
| "Gotri Laxmipura", "Gotri Road" | `Gotri` |
| "Waghodia Chowkdi", "Waghodia Cross Road" | `Waghodia Road` |
| "Alkapuri", "RC Dutt Road" | `Alkapuri` |
| "Karelibaug", "Karelibaug Water Tank" | `Karelibaug` |
| "Kahi bhi chalega", "Anywhere", "Good ROI" | `FLEXIBLE` |

### C. Society Name Guard (`isLikelySocietyOrProjectName`)
Conversational filler or generic property words must be blocked from entering the society name slot:
* **Reject List (`STOP_WORDS_SET`)**: `"Muje meri he"`, `"Flat bechna hai"`, `"Shop vechvani"`, `"Ghar"`, `"Makaan"`, `"Juno Vechvano"`.
* **Subtype Stripping**: If input is `"Ananta Astha 3BHK Flat"`, strip `3BHK Flat` ➔ Save clean project name: `Ananta Astha`.

---

## 4. Stale Slot Confirmation & Dynamic Contextual Resume

When returning leads send a generic greeting ("Hi", "Kem chho", "Namaste") after previously qualifying or stalling:

### The Contextual Recap Card
Do not restart qualification. Display the current snapshot and offer a 2-choice fork:

```
📋 Aapki Requirement Summary:
• Purpose: Self-Use (Family)
• Location: Vasna Road
• Configuration: 3 BHK Apartment
• Budget: ₹75L - ₹90L
• Timeline: Ready to Move

1️⃣ Sahi hai, options / site visit dekhein
2️⃣ Details change karni hai
```

* **Direct Answer Bypass**: If the returning user ignores the fork and directly provides new data (e.g. *"Gotri me dikhao"*), update `preferred_location = 'Gotri'` instantly without prompting error loops.
