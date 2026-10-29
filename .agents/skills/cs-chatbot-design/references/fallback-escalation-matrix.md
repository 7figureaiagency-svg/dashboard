# Graceful Fallback Protocols & Human Escalation Matrix

This guide defines the multi-tier escalation ladder, error-recovery mechanisms, FAQ detour handshakes, and sales desk dispatch protocols for Nextgn Realtors CRM.

---

## 1. The Multi-Tier Escalation Ladder

Conversational friction must be resolved with maximum empathy and zero robotic dead-ends.

```
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: EMPATHETIC CLARIFICATION                            │
│ Inaudible voice notes, ambiguous typos, vernacular slang     │
│ Action: Soft clarify in user dialect, 0 error codes         │
└──────────────────────────────┬──────────────────────────────┘
                               │ Still unresolvable
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 2: CONTEXT RECAP & INTENT DETOUR                       │
│ Returning gaps, mid-flow FAQs ("RERA registered chhe?")      │
│ Action: Answer FAQ dynamically + Resume qualification state │
└──────────────────────────────┬──────────────────────────────┘
                               │ Customer blocked / High-ticket / Dispute
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 3: SENIOR EXECUTIVE DISPATCH (HUMAN HANDOFF)           │
│ Out-of-market inquiries, angry escalation, human request    │
│ Action: Reassure client + CRM Alert + Executive Phone Call  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Tier 1: Empathetic Clarification Protocols

### A. Inaudible / Background Noise Audio Notes
When Groq Whisper or Gemini Audio transcription yields `<inaudible>`, empty text, or heavy background noise:

* **Dialect Inaudible Prompts**:
  * **English**: *"Sorry, the audio was a bit unclear. Could you please send it again or type your requirement in text?"*
  * **Hinglish**: *"Maaf kijiye, audio thoda clear nahi sunai diya. Kya aap dobara bol sakte hain ya text me likh sakte hain?"*
  * **Gujlish**: *"Maaf karsho, tame je audio moklyo e thodo clear nathi sambhlayo. Su tame fari thi boli shako ke text ma lakhi shako?"*
* **Telemetry**: Log `VOICE_NOTE_INAUDIBLE` into `lead_events` for call quality analytics.

### B. Ambiguous Input or Typo Recovery
When user sends gibberish or an unrecognized response to a prompt:

* **Strict Prohibition**: Never say *"Invalid input. Please choose 1, 2, or 3."*
* **Empathetic Guide**:
  > *"Maaf kijiye, main theek se samajh nahi paya. Hum aage badhne ke liye inme se kya choose karein?
  > 1️⃣ [Option 1]
  > 2️⃣ [Option 2]"*

### C. Negation & Reversal Recognition
When a user corrects the bot's assumption:
> **User**: *"Mujhe flat lena nahi hai, mujhe meri shop bechni hai"*

* **Action**:
  1. Detect negation ("nahi hai", "nathi") + switch token ("bechni hai", "vechvani").
  2. Transition lead from `lead_type = 'BUYER'` to `lead_type = 'SELLER'`.
  3. Validate reversal:
     > *"Samajh gaya! Aap shop kharidna nahi balki bechna chahte hain. Chaliye shop ki details note karte hain."*

---

## 3. Tier 2: Dynamic FAQ Detour & Seamless State Resume

Prospects often pause qualification to ask specific due-diligence questions:
> **User**: *"Are these properties RERA approved?"* / *"Title clear chhe ke nahi?"*

### Detour Execution Protocol:
1. **Save Context**: Store the active state in `leads.metadata.suspended_state` (e.g. `BUDGET_PENDING`).
2. **Dynamic Knowledge Fetch**: Query `client_knowledge` for verified, tenant-specific answers (e.g., all properties 100% RERA registered with clear titles).
3. **Deliver Answer + Resume in One Message**:
   ```
   "Haanji! Nextgn Realtors par listed sabhi properties 100% RERA approved aur clear title verified hoti hain. 📄✅

   Aapki requirement complete karne ke liye:
   Aapka comfortable budget bracket kya hai?
   1️⃣ ₹50L - ₹75L
   2️⃣ ₹75L - ₹1 Cr
   3️⃣ ₹1 Cr+"
   ```
4. **Zero Amnesia**: Restore `leads.state` directly without restarting the conversation.

---

## 4. Tier 3: Senior Executive Dispatch (Human Escalation)

### Escalation Triggers
The conversational bot must automatically hand off to a human property advisor under any of the following 5 conditions:

| Trigger Condition | Detection Logic | Action |
|:---|:---|:---|
| **Explicit Human Request** | *"Call me"*, *"Agent se baat karao"*, *"Human representative"*, *"Bhavin bhai sathe vaat karavo"* | Immediate reassurance + Priority call queue |
| **Out-of-Market Inquiry** | User requests properties outside Vadodara (e.g., Ahmedabad, Mumbai, Dubai) | Inform local expertise + Refer to partner network |
| **High-Ticket Commercial / Land Deal** | Transaction value > ₹5 Crores or complex agricultural land NA plotting | VIP advisory triage |
| **Frustration / Negative Sentiment** | Repetitive confusion (3+ unrecognized turns) or angry sentiment keywords | Apologize + Dispatch senior relationship manager |
| **Legal / Negotiation Standoff** | Aggressive price bargaining or broker commission disputes | Inform broker management will discuss directly |

### Human Handoff Dispatch Sequence:

#### 1. Outbound Reassurance Message (Client-Facing)
Send a respectful, confidence-preserving message matching the user's dialect:
> *"Zaroor! Aapki requirement standard options se alag hai, isliye main turant hamare Senior Property Advisor ko aapka profile forward kar raha hoon. 📞
> Wo aapse agle 15 minute ke andar direct call par baat karenge."*

#### 2. Database & State Transition
* Set `leads.state = 'ESCALATED_TO_EXECUTIVE'`.
* Set `leads.metadata.escalation_reason = 'EXPLICIT_AGENT_REQUEST'` (or relevant code).
* Ensure `leads.status = 'CONTACTED'` or `'IN_PROGRESS'`.

#### 3. Real-Time CRM Event Stream Alert
Insert record into `lead_events`:
```json
{
  "lead_id": "<uuid>",
  "client_id": "<uuid>",
  "event_type": "HUMAN_ESCALATION_TRIGGERED",
  "actor_type": "BOT",
  "details": {
    "reason": "EXPLICIT_AGENT_REQUEST",
    "transcript_snippet": "Bhavin bhai sathe direct vaat karavi do",
    "urgency": "HIGH",
    "assigned_executive_id": "<executive_uuid>"
  }
}
```

#### 4. CRM Workstation Push Notification
* The React CRM dashboard receives real-time PostgreSQL broadcast.
* Highlights lead with high-priority pulse badge in the Leads Table and Triage Queue.
