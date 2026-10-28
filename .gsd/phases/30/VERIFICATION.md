---
phase: 30
verified: 2026-10-28T17:40:00+05:30
status: passed
score: 6/6 must-haves verified
is_re_verification: false
---

# Phase 30 Verification: Vernacular Entity Extraction Guard & Remaining-Question Recovery Protocol

## Executive Summary

Phase 30 successfully resolved conversational entity leakages and skipped attribute collection during seller listing intake. 
Specifically:
1. It eliminated false society extraction where vernacular adjectives and seller verbs (e.g. *"ek maro juno flat vechvano che"*) previously extracted `"Juno Vechvano"` as a project/society name.
2. It enforces the strict compound question invariant (*"ek sath do sawal puche and ek ka hi jawab mile to next me remaining question firse pucho"*):
   - When carpet area is provided without floor on multi-story properties, the engine transitions to `OWNER_FLOOR_PENDING` and asks the remaining floor question.
   - When price is provided without furnishing status, the engine transitions to `OWNER_FURNISHING_PENDING` and prompts for furnishing status.
3. Live Supabase PostgreSQL database records and live Edge Function `v82-vernacular-entity-guard-and-remaining-questions` execution confirmed 100% attribute fidelity across the full 7-turn seller intake sequence.

---

## Must-Haves Empirical Verification

### Truths & Empirical Evidence

| Truth | Status | Empirical Evidence |
| :--- | :---: | :--- |
| **Vernacular Stop-Word Expansion (`STOP_WORDS_SET`)**<br>Comprehensive Gujarati, Hindi, and English real estate adjectives (`juno`, `juni`, `purana`, `navo`, `resale`, etc.) and seller verb conjugations (`vechvano`, `vechvani`, `bechvano`, `bechna`, etc.) added to stop-words. | ✅ PASS | Verified in `supabase/functions/realtor-lead-engine/index.ts` lines 1383–1411: exhaustive vernacular tokens across Latin script and Unicode Indic alphabets. |
| **Entity Guard (`isLikelySocietyOrProjectName` & `extractProjectOrSocietyFromText`)**<br>Rejects descriptive modifier + property type + verb combinations (e.g. "Juno Vechvano", "purana flat bechna") and pure city localities. `"ek maro juno flat vechvano che"` resolves to `""` (no society extracted). | ✅ PASS | Verified against regex token stripper (lines 1424–1433 and 1492–1506). In live execution for lead `tg_test_p30_1793188259497`, Turn 1 extracted `property_type: Flat`, `transaction_type: SELL`, and `project_or_society: null`. |
| **Turn 2 Greeting & Locality Disambiguation**<br>Initial seller intake prompts for project/society cleanly without mentioning "Juno Vechvano". Locality replies like "waghodia" during society turn normalize to "Waghodia Road", set standalone, and skip redundant location prompt. | ✅ PASS | Live database record in `lead_events` (ID: `d4191782-755d-4209-903e-260a68bad35f`): bot replied `"Bahuj saras! <b>Flat</b> note kari lidhu chhe. 👍\nAa property kaya <b>Project ke Society</b> ma aaveli chhe? (e.g. Nilamber Bellissimo, Sun Crest) 🏢"`. Replying `"waghodia"` advanced directly to `OWNER_AREA_PENDING`. |
| **Floor Recovery Protocol (`OWNER_FLOOR_PENDING`)**<br>When user answers only Area ("1250") on a multi-story unit, bot saves 1,250 sq.ft, transitions to `OWNER_FLOOR_PENDING`, and prompts for floor. Answering "4th floor" saves floor 4 and moves to price. | ✅ PASS | Live database record in `lead_events`: Turn 3 user `"1250"` -> `state: OWNER_FLOOR_PENDING`, reply: `"Noted <b>1,250 sq.ft</b>! 👍 Ane aa property kaya <b>Floor</b> par chhe? (e.g. Ground floor, 2nd floor, 5th floor) 🏢"`. Turn 4 user `"4th floor"` -> `state: OWNER_PRICE_PENDING`, floor 4 saved in metadata. |
| **Furnishing Recovery Protocol (`OWNER_FURNISHING_PENDING`)**<br>When user answers only price ("40 lakh ma"), bot saves ₹40L, transitions to `OWNER_FURNISHING_PENDING`, and prompts for furnishing. Answering "semi" saves `SEMI_FURNISHED` and moves to Turn 6. | ✅ PASS | Live database record in `lead_events`: Turn 5 user `"40 lakh ma"` -> `state: OWNER_FURNISHING_PENDING`, reply: `"Expected price <b>₹40 Lakhs</b> note kari lidhi chhe! 👍 Property <b>Furnished</b> chhe, <b>Semi-Furnished</b> ke <b>Unfurnished</b>? 🛋️"`. Turn 6 user `"semi"` -> `state: OWNER_AMENITIES_PENDING`, `furnishing_status: SEMI_FURNISHED` saved. |
| **Final Listing Registration & DB Persistence**<br>Full summary displays `Flat in Waghodia Road (4th Floor)` with zero hallucinations. `property_submissions` records row with exact floor, area, price, and furnishing. | ✅ PASS | Database query on `property_submissions` for `lead_id = 'tg_test_p30_1793188259497'`: Row `4a255c15-fcc5-40f1-8ae2-bceee02b5e2c` persisted with `project_name: "Flat in Waghodia Road"`, `location: "Waghodia Road"`, `carpet_area_sqft: 1250`, `expected_price: 4000000`, `furnishing_status: "SEMI_FURNISHED"`, `attributes: {"floor_number": 4, "parking": "Available"}`. |

---

## Live Production Empirical Audit Details

### 1. Supabase Edge Function Health & Version Verification
- **Endpoint:** `GET https://yeiygfysijptjdepctnx.supabase.co/functions/v1/realtor-lead-engine/health`
- **HTTP Status:** 200 OK
- **Payload Response:**
  ```json
  {
    "status": "ONLINE",
    "version": "v82-vernacular-entity-guard-and-remaining-questions",
    "runtime": "Supabase Edge Serverless (Deno)",
    "uptime_sla": "99.99%",
    "zero_downtime": true,
    "database": "Supabase PostgreSQL 17"
  }
  ```

### 2. Live Supabase PostgreSQL Chronological Turn Audit (`lead_events` table)
Lead ID: `tg_test_p30_1793188259497`

```
Turn 1: "ek maro juno flat vechvano che"
Bot:    Bahuj saras! <b>Flat</b> note kari lidhu chhe. 👍
        Aa property kaya <b>Project ke Society</b> ma aaveli chhe? (e.g. Nilamber Bellissimo, Sun Crest) 🏢
State:  OWNER_SOCIETY_PENDING  [PASS: Zero "Juno Vechvano" hallucination]

Turn 2: "waghodia"
Bot:    Approximate Carpet Area ketlo chhe ane kaya Floor par chhe? (e.g. 1450 sq.ft, 4th floor) 📐
State:  OWNER_AREA_PENDING     [PASS: Waghodia Road normalized, advances to Area + Floor]

Turn 3: "1250"
Bot:    Noted <b>1,250 sq.ft</b>! 👍 Ane aa property kaya <b>Floor</b> par chhe? (e.g. Ground floor, 2nd floor, 5th floor) 🏢
State:  OWNER_FLOOR_PENDING    [PASS: Floor recovery triggered, remaining question asked]

Turn 4: "4th floor"
Bot:    Expected Selling Price ketli chhe, ane property Furnished, Semi ke Unfurnished chhe? 💰
State:  OWNER_PRICE_PENDING    [PASS: Floor 4 saved, prompts for Price + Furnishing]

Turn 5: "40 lakh ma"
Bot:    Expected price <b>₹40 Lakhs</b> note kari lidhi chhe! 👍 Property <b>Furnished</b> chhe, <b>Semi-Furnished</b> ke <b>Unfurnished</b>? 🛋️
State:  OWNER_FURNISHING_PENDING [PASS: Price ₹40L saved, prompts for Furnishing]

Turn 6: "semi"
Bot:    Car parking available chhe? Ane property Ready to Move chhe ke Under Construction? (Sathe direct calling number confirm karjo) 🚗🔑
State:  OWNER_AMENITIES_PENDING [PASS: Furnishing SEMI_FURNISHED saved, prompts for Parking + Possession]

Turn 7: "car parking 1 che and ready to move j che"
Bot:    Khub khub aabhar <b>Kiran bhai</b>! 🎉
        Tamari property listing details Nextgen Realty desk par successfully register thai gai chhe:
        • 🏢 Property: Flat in Waghodia Road (4th Floor)
        • 📏 Area: 1,250 sq.ft Carpet
        • 💰 Expected Demand: ₹40,00,000
        • 🔑 Status: READY TO MOVE | SEMI FURNISHED
State:  OWNER_DETAILS_GATHERED [PASS: Complete listing registered with 100% attribute fidelity]
```

### 3. Frontend Production Build Audit
- **Command:** `npm.cmd run build` (via vite build)
- **Result:** Exit Code 0, built in 2.05s without any TypeScript or bundling errors.

---

## Verdict

```
status: pass
phase: 30
report: .gsd/phases/30/VERIFICATION.md
must_haves: 6/6
failures: []
gap_plans: []
```
Phase 30 is fully verified and met all user requirements and architectural invariants.
