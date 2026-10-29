# Adversarial Attack Vectors for Real Estate Conversational Engines

This reference catalogs real-world edge cases, ambiguities, and adversarial inputs observed across real estate messaging bots (WhatsApp/Telegram).

---

## 1. Geographical & Landmark Collision Vectors

### Vector 1.1: City Name Inside Landmark String
* **Symptom:** User names a city (e.g., *"Vadodara"*), but the bot matches a property landmark (e.g., *"Vadodara Central"* in Alkapuri) and incorrectly pins the user to that specific locality.
* **Invariant:** City names (`MAJOR_INDIAN_CITIES`) must NEVER trigger local landmark matching. The bot must prompt: *"In which specific area or landmark in {City} are you looking?"*

### Vector 1.2: Out-of-Market Cities
* **Symptom:** User inquires for properties in a city not serviced by the agency (e.g., *"Surat me 3BHK flat"* or *"Mumbai flat"*).
* **Invariant:** The bot must detect the non-primary city, inform the user about the agency's primary jurisdiction, and offer high-ROI investment or local relocation options without hallucinating inventory.

### Vector 1.3: Flexible / No-Preference Locations
* **Symptom:** User types *"koi bhi chalegi"*, *"kahi bhi"*, *"any location"*, *"flexible"*, *"aakhi city"*.
* **Invariant:** Set `location = "FLEXIBLE"`, do not re-prompt for location, and match inventory across the entire city.

---

## 2. Currency, Budget & Number Parsing Vectors

### Vector 2.1: Western vs Indian Crore Hallucination
* **Symptom:** User inputs *"1 cr"*. Western-trained LLMs interpret "1 cr" as Western 100 Million (`100,000,000` = 10 Cr), blowing past all inventory limits.
* **Invariant:** Deterministic regex parsing must enforce `1 Cr = 10,000,000` (10 Million).

### Vector 2.2: Double Rupee Symbol `₹₹`
* **Symptom:** String templates interpolate `₹${formatPriceShort(val)}` where `formatPriceShort` already includes `₹`.
* **Invariant:** Never double-prefix the currency glyph.

### Vector 2.3: Sub-50k Budget Trapping
* **Symptom:** User says *"30,000"*, which is a monthly rent budget, but bot expects purchase budget in Lakhs.
* **Invariant:** Budgets below ₹1,00,000 without "Lakh/Cr" cues default to `RENT` or `LEASE`.

---

## 3. Owner Listing Intake Vectors

### Vector 3.1: Numeric Area Measurement Trap in Location Turn
* **Symptom:** When asked for location, user types *"2000"* or *"1250 sqft"*.
* **Invariant:** Pure numbers or area strings during location questions must be saved into `carpet_area_sqft` and the bot must re-ask for the physical locality/society name.

### Vector 3.2: Rent-per-Month in Expected Price Turn
* **Symptom:** Owner says *"30k per month"* or *"bhadu 25000"*. If checked against minimum ₹1,00,000 sale price, bot enters an infinite loop.
* **Invariant:** Detect rental cues (`per month`, `/mo`, `bhadu`, `rent`, `kiraya`), set `transaction_type = "RENT_OUT"`, store `expected_rent`, and advance to next turn.

---

## 4. Menu & Navigation Routing Vectors

### Vector 4.1: Option Number Apology Bug
* **Symptom:** User replies `"1"` to a 3-choice menu. LLM hallucinates `intent = "CHANGE_REQUIREMENT"` without entities, prompting *"Maaf kijiye, main samajh nahi paya"*.
* **Invariant:** Pure option inputs (`1`, `2`, `3`) and affirmations (`Ha`, `Yes`) must NEVER be treated as typos or unrecognized inputs.

### Vector 4.2: Returning Qualified Lead Menu
* **Symptom:** Returning lead selects Option 1 ("Top property options dekhein"). Bot re-asks qualification questions instead of presenting matching inventory cards.
* **Invariant:** Populate defaults for unasked secondary fields (`purpose: SELF_USE`, `timeline: READY_TO_MOVE`) and display matching inventory immediately.

---

## 5. Drip, Follow-Up & Site Visit Vectors

### Vector 5.1: Phantom Inventory Pitch in Follow-Up
* **Symptom:** Lead received `NO_PROPERTY_MATCH` earlier. Follow-up drip says: *"Jo properties humne share ki thin (jaise Griham Green Valley Enclave)..."*.
* **Invariant:** Never reference previously shared properties if none were sent. Send an off-market concierge update instead.

### Vector 5.2: Category Mismatch Fallback
* **Symptom:** Commercial showroom seeker is pitched a residential plotting project in automated follow-ups.
* **Invariant:** Inventory resolution fallbacks must strictly enforce `property_category` matching.

### Vector 5.3: Morning Briefing Confirmation Trapping
* **Symptom:** Lead receives morning briefing (*"Kya hum timing confirm samjhein?"*) and replies *"Ha"*. Bot treats it as a new visit booking and asks for time slots.
* **Invariant:** Affirmations on booked upcoming/today visits must confirm the visit, update status to `CONFIRMED`, and retain the scheduled slot.
