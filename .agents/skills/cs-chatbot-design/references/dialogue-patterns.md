# Enterprise Dialogue Patterns & WhatsApp Ergonomics

This document specifies the conversational patterns, typography standards, and mobile ergonomics governing all WhatsApp and Telegram interactions in Nextgn Realtors CRM.

---

## 1. The 3 Golden Response Principles in Action

Every message synthesized by `multilingual_synthesizer.ts` or dispatched by `index.ts` must follow these 3 Golden Principles.

### Principle 1: Acknowledge First (Echo & Validate)

Never ask a follow-up question cold. Always validate the entity or preference the user just shared.

```
❌ BAD (Cold Interrogation):
User: "Vasna road par 3 BHK chahiye"
Bot:  "Aapka budget kitna hai?"

✅ GOOD (Acknowledge First):
User: "Vasna road par 3 BHK chahiye"
Bot:  "Zaroor! Vasna Road me 3 BHK apartment note kar liya hai. 📍
       Aapka budget kis range me comfortable rahega?
       1️⃣ ₹50L - ₹75L
       2️⃣ ₹75L - ₹1 Cr
       3️⃣ ₹1 Cr se zyada"
```

#### Multilingual Acknowledgment Anchors
| Language / Dialect | Acknowledgment Anchors |
|:---|:---|
| **English** | "Got it! [Entity] noted. 📍" / "Understood! Looking at [Entity] options." |
| **Hinglish** | "Bilkul! [Entity] note kar liya hai. 📍" / "Samajh gaya! [Entity] ke options check kar rahe hain." |
| **Gujlish** | "Barobar! [Entity] note kari lidhu chhe. 📍" / "Samji gayo! [Entity] ma sari options joiye." |
| **Gujarati Script** | "ચોક્કસ! [Entity] ની વિગતો નોંધી લીધી છે. 📍" |

---

### Principle 2: Be Concise (Mobile Readability Discipline)

Mobile chat apps have limited viewport height. Long paragraphs force users to scroll, increase bounce rate, and look like AI spam.

* **Line Cap**: Outbound prompts must **never exceed 3 to 4 lines** of body text.
* **Whitespace & Breathing Room**: Use a single blank line between acknowledgment and options.
* **Scannable Bullets**: Use clean bullet points or numbered lists.
* **No Robotic Prefixes**: Never use `System Notice:`, `Noted:`, or raw status dumps.

```
❌ BAD (Wall of Text):
"Hello sir, thank you for contacting Nextgn Realtors. We are a premier real estate agency in Vadodara with over 15 years of experience. We have multiple 3 BHK properties in Vasna Road that match your criteria. Please let us know if your budget is between 50 to 75 lakhs or higher so we can send the brochures right away."

✅ GOOD (Concise & Scannable):
"Zaroor! Vasna Road me 3 BHK properties ke badhiya options available hain. 📍

Aapka budget kis range me comfortable rahega?
1️⃣ ₹50 Lakhs - ₹75 Lakhs
2️⃣ ₹75 Lakhs - ₹1 Crore
3️⃣ ₹1 Crore+"
```

---

### Principle 3: Offer Next Steps (Frictionless Quick-Replies)

Every question must guide the user with clear next actions. On mobile devices, typing long responses causes drop-offs.

* **1-Tap Emoji Selectors**: Always prepend options with `1️⃣`, `2️⃣`, `3️⃣`.
* **Interchangeable Input Acceptance**: The parser must accept:
  - The exact digit (`1`, `2`)
  - The emoji digit (`1️⃣`, `2️⃣`)
  - Key vernacular tokens (`pehla`, `family`, `invest`, `ready`)

```
✅ Example (Purpose Intake):
"Yeh property aap family ke self-use ke liye dekh rahe hain ya investment ke liye?

1️⃣ Family ke rehne ke liye (Self-Use)
2️⃣ Investment / Rental Income ke liye"
```

---

## 2. WhatsApp Typography & Layout Standards

To ensure premium readability matching Apple HIG ergonomics across iOS and Android WhatsApp clients:

1. **Bold Key Entities**:
   - Highlight locations, budgets, and property names: `*Vasna Road*`, `*3 BHK Villa*`, `*₹85 Lakhs*`.
2. **Apple HIG Semantic Emojis**:
   - `📍` Location / Micro-market
   - `💰` Budget / Pricing
   - `🏡` Property Type / Home
   - `🗓️` Site Visit / Calendar Slot
   - `✅` Confirmed / Success
   - `📋` Recap / Summary
3. **Hyperlink Formatting**:
   - Never paste raw, ugly URL parameters into chat.
   - Use descriptive text: `[Google Maps Location](url)` or `[Download Brochure PDF](url)`.
4. **Site Visit Anchors**:
   - Always anchor site visit meetings at the physical site: *"Site par milte hain!"* / *"Site par maliye chiye!"*.
   - Never promise that an executive will pick up the customer from home.

---

## 3. Canonical Conversational Flows

### Flow A: Triage & Role Discovery
```
Bot: "Namaste! Nextgn Realtors me aapka swagat hai. 🏡
      Hum aapki kya madad kar sakte hain?

      1️⃣ Property kharidni / rent par leni hai (Buyer/Tenant)
      2️⃣ Apni property bechni ya rent par deni hai (Owner)
      3️⃣ Dono (Kharidni aur bechni dono hai)"
```

### Flow B: Purpose-First Buyer Cascade
```
Step 1 (Purpose):
"Aapka main purpose kya hai?
 1️⃣ Family ke rehne ke liye (Self-Use)
 2️⃣ Investment / Rental Income ke liye"

Step 2 (Location - Bypassed if Investment):
"Vadodara me aapki preferred location kaunsi hai?
 (E.g. Vasna Road, Gotri, Sevasi, Waghodia)"

Step 3 (Configuration):
"Aap kitne BHK ka plan kar rahe hain?
 1️⃣ 2 BHK
 2️⃣ 3 BHK
 3️⃣ 4 BHK / Villa"

Step 4 (Budget):
"Aapka comfortable budget bracket kya hai?
 1️⃣ ₹45L - ₹65L
 2️⃣ ₹65L - ₹90L
 3️⃣ ₹90L - ₹1.5 Cr+"

Step 5 (Timeline):
"Aap kab tak shift hona chahte hain?
 1️⃣ Ready to Move (Turant shift)
 2️⃣ Under Construction (6-12 mahine)"
```

### Flow C: Site Visit Scheduling & Option Anchor
When inviting a qualified buyer to an in-person site visit:
```
Bot: "Vasna Road par aapke budget me 2 shandaar verified options shortlisted hain! 🏡
      Kya hum kal subah 10:00 AM ya dopahar 4:00 PM par site visit schedule karein?

      1️⃣ Kal subah 10:00 AM
      2️⃣ Kal dopahar 4:00 PM
      3️⃣ Koi aur samay (Apna time batayein)"
```

*Time Anchor Rule*: If user replies `"Option 1 ke sath kal 10 baje ki visit book kar do"`, the engine strictly books `10:00 AM IST` (`04:30 UTC`), without confounding "Option 1" with "1:00 PM".

### Flow D: Rescheduling & Missed Visit Protocol
When a lead informs they cannot make the scheduled visit:
```
User: "Aaj emergency aa gayi, nahi aa paunga"
Bot:  "Koi baat nahi, emergency pehle hai! Aap bilkul chinta mat kijiye. 🙏
       Jab aap comfortable hon, tab hum reschedule kar lenge:

       1️⃣ Kal same time par (10:00 AM)
       2️⃣ Weekend par (Saturday/Sunday)
       3️⃣ Main baad me batata hoon"
```

---

## 4. Forbidden Dialogue Anti-Patterns

| Anti-Pattern | Why It Is Banned | Correct Implementation |
|:---|:---|:---|
| **Rental Price on Buyer Inquiries** | Showing `₹25,000/mo` to someone buying a ₹1 Cr home damages credibility. | Filter budget brackets strictly by `lead_type = 'BUYER'`. Show only total purchase prices. |
| **"System Notice:" / "Bot:" Prefixes** | Destroys conversational warmth and feels like terminal debug output. | Speak directly as Nextgn Realtors' dedicated property concierge. |
| **Pick-up from Home Promises** | Field agents do not offer chauffeur services; causes operational confusion. | State *"Milte hain site par"* / *"Site par maliye chiye"*. |
| **Restarting Qualified Leads on "Hi"** | Forcing returning buyers back to Step 1 ruins user experience. | Inspect `leads.state` & `site_visits`. Welcome back with scheduled visit recap. |
| **Random Fallback Inventory** | Recommending irrelevant projects when requested criteria has no inventory. | Inform user honestly that executive is curating custom off-market options. |
