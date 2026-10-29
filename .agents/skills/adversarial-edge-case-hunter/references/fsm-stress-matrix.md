# Finite State Machine (FSM) Stress Matrix

This matrix outlines every state in `realtor-lead-engine` and the stress vectors required to verify 100% accuracy.

---

## State Matrix & Stress Vectors

| State | Typical Trigger | Adversarial Stress Vector | Expected Behavior |
|-------|-----------------|---------------------------|-------------------|
| `FRESH` / `ROLE_SELECTION_PENDING` | Inbound message | User replies `"1"`, `"2"`, `"3"`, `"hi"`, or a BHK config like `"3BHK"` | "1" -> Seeker Turn 1 without apology; "2" -> Owner intake; "3" -> Dual role; "hi" -> Triage menu without defaulting; "3BHK" -> Seeker qualification |
| `QUALIFYING` | Role confirmed | Compound message: *"Alkapuri me 3bhk buy krna he 1 cr me"* | Ingests BHK, Location, Budget, Buy in 1 turn; asks next missing field (Purpose); never re-asks Location |
| `QUALIFYING` (City input) | Location question | User inputs *"Vadodara"* or *"Surat"* | Vadodara -> prompts for Area in Vadodara; Surat -> out-of-market concierge guidance |
| `QUALIFYING` (Budget input) | Budget question | User inputs *"1 cr"*, *"2.5 cr"*, *"85L"*, *"30k"* | 1 cr = 10,000,000; 30k = monthly rent; never format as ₹₹ |
| `OPTIONS_SENT` | 6 fields qualified | User replies `"1"` (Select top option) or `"2"` (VIP Visit) | Renders property details or slot options without resets |
| `OPTIONS_SENT` (No match) | Inventory exhausted | Lead had 0 matches; followup cron fires | Sends off-market sourcing update; NEVER claims properties were shared |
| `SITE_VISIT_BOOKED` | Slot selected | Morning briefing sent; user replies *"Ha"*, *"Yes"*, *"Bilkul"* | Confirms today's visit; sets status `CONFIRMED`; NEVER re-asks time slots |
| `SITE_VISIT_BOOKED` | Visit upcoming | User sends inquiry about another property | Archives primary search, activates secondary search, preserves booked visit |
| `SITE_VISIT_BOOKED` | Post-visit | User says *"mene visit attend nahi kiya"* | Marks visit MISSED; prompts reschedule slot |
| `VISIT_MISSED` | Visit passed | User suggests slot *"Kal 4 baje"* | Reschedules visit; updates `site_visits` table; sets state `SITE_VISIT_BOOKED` |
| `OWNER_CONFIG_PENDING` | Option 2 selected | User says *"maro 2bhk flat vechvano che"* | Extracts 2BHK and SELL; prompts for society/locality |
| `OWNER_LOCATION_PENDING` | Config gathered | User inputs *"2000"* or *"1250 sqft"* | Stores in `carpet_area_sqft`; re-prompts for locality/society |
| `OWNER_PRICE_PENDING` | Location gathered | User inputs *"30k per month and semi furnished"* | Sets `RENT_OUT`, `expected_rent = 30000`, `SEMI_FURNISHED`; advances state |
| `OWNER_DETAILS_GATHERED` | Listing complete | Admin approves submission in CRM | Upserts row to live `inventory` table with `AVAILABLE` status |
