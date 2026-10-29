/**
 * VERIFIER GATE: Pre-Flight Self-Correction & Outbound Response Validator
 * Phase 33.4: Autonomous Universal Multimodal Real Estate Agent
 *
 * Verifies outbound responses before dispatch across 4 critical invariants:
 *  1. Contradiction Check: Detects mismatch between user intent (e.g. seller vs buyer) and bot reply
 *  2. Redundancy Check: Detects if bot re-asks for an entity already provided by the user
 *  3. Hallucination Check: Detects ungrounded project names, false price promises, and wild ROI claims
 *  4. Policy & Compliance Check: Checks WABA compliance, hostile language, and Telegram HTML tag balance
 *
 * If any invariant fails, triggers an instant lightweight corrective re-synthesis before customer delivery.
 */

export interface OutboundVerificationParams {
  userMessage: string;
  proposedReply: string;
  extractedIntent?: any;
  leadState?: string;
  lastBotPrompt?: any;
  languageProfile?: any;
  allowedProjectNames?: string[];
  options?: {
    groqApiKey?: string;
    geminiApiKey?: string;
  };
}

export interface OutboundVerificationResult {
  isValid: boolean;
  correctedReply?: string;
  reason?: string;
  violations: string[];
}

// -----------------------------------------------------------------------------
// 1. Invariant Checks
// -----------------------------------------------------------------------------

/**
 * Invariant 1: Contradiction Check
 */
export function checkContradiction(params: OutboundVerificationParams): string | null {
  const userText = (params.userMessage || "").toLowerCase();
  const replyText = (params.proposedReply || "").toLowerCase();
  const extracted = params.extractedIntent;
  const leadState = (params.leadState || "").toUpperCase();

  // A. Seller intent expressed by user
  const isSellerUser =
    /\b(bechni|vechvi|vechvo|vechvu|bechna|sell|bikri|rent\s*pe\s*deni|bhadu\s*aapo|bhade\s*aapvi)\b/i.test(userText) ||
    extracted?.primary_intent === "SELLER_LISTING" ||
    extracted?.action?.intent === "SUBMIT_LISTING" ||
    extracted?.lead_role === "SELLER" ||
    leadState.startsWith("OWNER_");

  if (isSellerUser) {
    // Reply must NOT ask buyer-intake questions
    const hasBuyerQuestions =
      /\b(kharidna\s*chahte|kharidni\s*hai|buy\s*karni|leni\s*chhe|leni\s*hai|property\s*search\s*kar\s*rahe|kis\s*type\s*ki\s*property\s*chahiye|kaya\s*type\s*ni\s*property\s*ma\s*interest)\b/i.test(replyText);
    if (hasBuyerQuestions) {
      return "CONTRADICTION: User expressed seller intent, but proposed reply asks buyer intake questions.";
    }
  }

  // B. Buyer intent expressed by user
  const isBuyerUser =
    (/\b(kharidna|buy|lena|leni|chahiye|joiye|searching\s*for)\b/i.test(userText) && !isSellerUser) ||
    extracted?.primary_intent === "BUYER_REQUIREMENT" ||
    extracted?.lead_role === "BUYER";

  if (isBuyerUser && !leadState.startsWith("OWNER_")) {
    const hasSellerQuestions =
      /\b(expected\s*selling\s*price|property\s*bechni|property\s*vechvi|carpet\s*area\s*ketli\s*chhe\s*vechva)\b/i.test(replyText);
    if (hasSellerQuestions) {
      return "CONTRADICTION: User expressed buyer intent, but proposed reply asks seller listing questions.";
    }
  }

  // C. Inability to attend / Reschedule intent
  const isCannotAttend =
    /\b(nahi\s*aa\s*sakta|nhi\s*aa\s*paunga|aavi\s*nahi\s*shaku|cannot\s*attend|cant\s*attend|cancel\s*visit|reschedule)\b/i.test(userText) ||
    extracted?.primary_intent === "RESCHEDULE_VISIT" ||
    extracted?.action?.intent === "CANNOT_ATTEND_VISIT" ||
    extracted?.action?.intent === "RESCHEDULE_VISIT";

  if (isCannotAttend) {
    const confirmsOriginalAttendance =
      /\b(visit\s*confirm\s*ho\s*gaya|looking\s*forward\s*to\s*seeing\s*you\s*at\s*the\s*scheduled\s*time|milte\s*hain\s*site\s*par)\b/i.test(replyText) &&
      !/\b(reschedule|koi\s*baat\s*nahi|next\s*slot|dusra\s*time|fari\s*schedule)\b/i.test(replyText);
    if (confirmsOriginalAttendance) {
      return "CONTRADICTION: User stated inability to attend, but proposed reply confirms attendance without addressing reschedule.";
    }
  }

  return null;
}

/**
 * Invariant 2: Redundancy Check
 */
export function checkRedundancy(params: OutboundVerificationParams): string | null {
  const userText = (params.userMessage || "").toLowerCase();
  const replyText = (params.proposedReply || "").toLowerCase();
  const extracted = params.extractedIntent;
  const entities = extracted?.entities || extracted?.extracted?.entities || {};

  // A. Location Redundancy
  const providedLocation =
    entities.location_name ||
    extracted?.location ||
    extracted?.extracted?.entities?.location_name;

  const userMentionsKnownLocation =
    /\b(waghodia|alkapuri|gotri|vasna|manjalpur|akota|karelibaug|bhayli|sevasi|atladra|sayajigunj|chhani|harni|subhanpura|tarsali|gorwa|fatehgunj|makarpura|nizampura|sama|kalali|vadapalani|bandra|andheri|whitefield|koramangala)\b/i.test(userText);

  if ((providedLocation && providedLocation !== "UNKNOWN" && providedLocation !== "FLEXIBLE") || userMentionsKnownLocation) {
    const locName = providedLocation || "given area";
    const reAsksLocation =
      /\b(konsi\s*location|kaya\s*vistar|preferred\s*location|which\s*location|kaya\s*area\s*ma|location\s*batayein|area\s*batayein)\b/i.test(replyText);
    if (reAsksLocation) {
      return `REDUNDANCY: User explicitly provided location (${locName}), but proposed reply re-asks for location.`;
    }
  }

  // B. Property Type / Configuration Redundancy
  const providedPropType =
    entities.property_type ||
    entities.configuration ||
    extracted?.property_type ||
    extracted?.extracted?.entities?.property_type;

  const userMentionsPropType =
    /\b(1bhk|2bhk|3bhk|4bhk|5bhk|villa|penthouse|duplex|tenement|flat|apartment|shop|office|plot)\b/i.test(userText);

  if ((providedPropType && providedPropType !== "UNKNOWN") || userMentionsPropType) {
    const reAsksPropType =
      /\b(kitne\s*bhk|kis\s*type\s*ki\s*property|kaya\s*type\s*ni\s*property|flat,\s*villa,\s*ya\s*commercial|flat\s*ke\s*villa)\b/i.test(replyText);
    if (reAsksPropType) {
      return "REDUNDANCY: User already specified property type/BHK, but proposed reply re-asks for property type.";
    }
  }

  // C. Budget Redundancy
  const providedBudget =
    entities.budget_inr ||
    extracted?.budget ||
    extracted?.extracted?.entities?.budget_inr;

  const userMentionsBudget =
    /\b(\d+\s*(?:lakh|lakhs|cr|crore|crores|hazar|k))\b/i.test(userText);

  if (providedBudget || userMentionsBudget) {
    const reAsksBudget =
      /\b(aapka\s*budget\s*kitna|budget\s*range\s*batayein|ketlu\s*budget\s*chhe|what\s*is\s*your\s*budget)\b/i.test(replyText);
    if (reAsksBudget) {
      return "REDUNDANCY: User already specified budget, but proposed reply re-asks for budget.";
    }
  }

  return null;
}

/**
 * Invariant 3: Hallucination Check
 */
export function checkHallucination(params: OutboundVerificationParams): string | null {
  const replyText = params.proposedReply || "";
  const allowedProjects = params.allowedProjectNames || [];

  // A. Wild ungrounded financial promises or guarantees
  if (
    /\b(100%\s*guarantee|guaranteed\s*(?:returns|roi|profit)|double\s*your\s*money|paisa\s*double|pakka\s*munafa)\b/i.test(replyText)
  ) {
    return "HALLUCINATION: Proposed reply makes ungrounded financial or ROI guarantee claims.";
  }

  // B. Phantom Project Hallucination
  // If allowedProjectNames is provided with explicit catalog context, verify bolded project titles
  if (allowedProjects.length > 0) {
    const boldMatches = Array.from(replyText.matchAll(/<b>(.*?)<\/b>/g)).map(m => m[1].trim());
    const genericTerms = new Set([
      "flat", "villa", "shop", "office", "commercial", "penthouse", "duplex", "tenement",
      "plot", "budget", "ready to move", "under construction", "bhai", "ji", "customer",
      "friend", "view on google maps", "download official brochure"
    ]);

    for (const boldText of boldMatches) {
      const lowerBold = boldText.toLowerCase();
      if (genericTerms.has(lowerBold)) continue;
      if (boldText.length < 3 || boldText.length > 40) continue;
      // If it looks like a named project (starts with uppercase, 2+ words)
      if (/^[A-Z][a-zA-Z0-9\s]+$/.test(boldText) && boldText.split(/\s+/).length >= 2) {
        const matchesAllowed = allowedProjects.some(
          p => p.toLowerCase().includes(lowerBold) || lowerBold.includes(p.toLowerCase())
        );
        if (!matchesAllowed) {
          return `HALLUCINATION: Proposed reply references unconfirmed project name '<b>${boldText}</b>' not present in allowed catalog.`;
        }
      }
    }
  }

  return null;
}

/**
 * Invariant 4: Policy, WABA Compliance & HTML Safety Check
 */
export function checkPolicyAndCompliance(params: OutboundVerificationParams): string | null {
  const replyText = params.proposedReply || "";

  // A. Forbidden or abusive vocabulary
  if (/\b(scam|fraud|bewakoof|idiot|stupid|chutiya|bakwaas)\b/i.test(replyText)) {
    return "POLICY: Reply contains forbidden or unprofessional language.";
  }

  // B. Excessive spammy punctuation
  if (/[!?]{4,}/.test(replyText)) {
    return "POLICY: Excessive exclamation/question marks violate WABA quality standards.";
  }

  // C. HTML Tag Balance Check (Prevents Telegram parse_mode="HTML" 400 Bad Request)
  const tags = ["b", "i", "a", "code", "strong", "em"];
  for (const tag of tags) {
    const openCount = (replyText.match(new RegExp(`<${tag}(?:\\s+[^>]*)?>`, "gi")) || []).length;
    const closeCount = (replyText.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    if (openCount !== closeCount) {
      return `HTML_SYNTAX: Unbalanced <${tag}> tags (opened ${openCount}, closed ${closeCount}), which causes Telegram dispatch failures.`;
    }
  }

  return null;
}

/**
 * Invariant 5: CS-Chatbot-Design Dialogue Governance & Mobile Ergonomics
 * Enforces the 3 Golden Response Principles:
 *  1. Conciseness check: Conversational replies must not exceed 7 lines on mobile WhatsApp/Telegram (excluding inventory cards & recap summaries).
 *  2. Quick-reply format: Multi-choice prompts must use 1-tap numbered emojis (1️⃣, 2️⃣, 3️⃣) instead of plain numbers.
 *  3. Acknowledge check: Bot must not abruptly ask questions without acknowledging user input or providing conversational grounding.
 */
export function checkDialogueGovernance(params: OutboundVerificationParams): string | null {
  const replyText = (params.proposedReply || "").trim();
  const userText = (params.userMessage || "").trim();

  // A. Conciseness Check (max 7 lines for regular conversational turns, excluding property cards and recaps)
  const isPropertyCardOrRecap =
    replyText.includes("📍") ||
    replyText.includes("💰") ||
    replyText.includes("📋") ||
    /carpet\s*area/i.test(replyText) ||
    /brochure/i.test(replyText) ||
    /options\s*matching/i.test(replyText) ||
    /here\s*are\s*some\s*options/i.test(replyText);

  const lines = replyText.split("\n").map(l => l.trim()).filter(Boolean);
  if (!isPropertyCardOrRecap && lines.length > 7) {
    return `CONCISENESS: Proposed reply has ${lines.length} lines, exceeding 7 lines maximum for conversational mobile messaging.`;
  }

  // B. Quick-Reply Format Check
  // Check if reply presents numbered choices with ASCII digits (e.g. "1.", "1)", "Option 1:") without 1-tap emojis
  const hasAsciiOptions = /(?:^|\n)\s*(?:option\s*)?[1-4][\.\)]\s+\S+/i.test(replyText);
  const hasEmojiOptions = /(?:1️⃣|2️⃣|3️⃣|4️⃣)/u.test(replyText);
  if (hasAsciiOptions && !hasEmojiOptions) {
    return "QUICK_REPLY_FORMAT: Multi-choice prompt uses plain ASCII numbers instead of 1-tap quick reply emojis (1️⃣, 2️⃣).";
  }

  // C. Acknowledge First Check
  // If user sent a substantive input (not a generic greeting or isolated option number)
  const isSubstantiveUserMessage =
    userText.length > 3 &&
    !/^(?:hi|hello|hey|namaste|kem cho|pranam|namaskar|start|restart)$/i.test(userText.toLowerCase()) &&
    !/^[1-4]$/.test(userText.trim());

  if (isSubstantiveUserMessage) {
    // Check if reply immediately starts with an abrupt question
    const strippedReply = replyText.replace(/^(?:<b>.*?<\/b>|\s*)+/i, "").trim();
    const startsAbruptlyWithQuestion =
      /^(?:kis\s*type|kitne\s*bhk|aapka\s*budget|konsi\s*location|which\s*location|how\s*many\s*bhk|what\s*is\s*your\s*budget|where\s*are\s*you\s*looking|tamne\s*kaya|ketlu\s*budget|kaya\s*area)\b/i.test(
        strippedReply
      );

    const hasAcknowledgment =
      /\b(ji|noted|samajh|samji|nondhi|shukriya|dhanyawad|thank|thanks|certainly|sure|bilkul|saras|great|got\s*it|perfect|aapki|tamari|hello|namaste|kem\s*cho|pranam|vanakkam|namaskaram)\b/i.test(
        replyText.slice(0, 80).toLowerCase()
      ) || /[👍🙏🏡✨]/.test(replyText.slice(0, 50));

    if (startsAbruptlyWithQuestion && !hasAcknowledgment) {
      return "ACKNOWLEDGE_FIRST: Proposed reply abruptly fires a question without acknowledging user input.";
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// 2. HTML Auto-Fixer & Dialogue Sanitizer Utility
// -----------------------------------------------------------------------------
export function fixUnbalancedHtml(text: string): string {
  let fixed = text;
  const tags = ["b", "i", "code", "strong", "em"];
  for (const tag of tags) {
    const openCount = (fixed.match(new RegExp(`<${tag}>`, "gi")) || []).length;
    const closeCount = (fixed.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    if (openCount > closeCount) {
      fixed += `</${tag}>`.repeat(openCount - closeCount);
    }
  }
  return fixed;
}

/**
 * Auto-sanitizes replies to adhere strictly to cs-chatbot-design mobile ergonomics:
 * 1. Converts ASCII option numbers (1., 1), Option 1:) into 1-tap emojis (1️⃣, 2️⃣, 3️⃣, 4️⃣)
 * 2. Condenses multiple consecutive newlines (max 2)
 * 3. Prepends polite acknowledgment if abruptly asking a question without greeting/ack
 * 4. Ensures HTML tags are balanced
 */
export function autoSanitizeDialogue(text: string, dialect?: string): string {
  if (!text) return "";
  let sanitized = text;

  // 1. Convert ASCII options to emoji buttons: "1. " or "1) " or "Option 1: " -> "1️⃣ "
  const emojiMap: Record<string, string> = {
    "1": "1️⃣",
    "2": "2️⃣",
    "3": "3️⃣",
    "4": "4️⃣",
  };
  sanitized = sanitized.replace(
    /(?:^|\n)\s*(?:option\s*)?([1-4])[\.\:\)]\s+/gim,
    (match, num) => {
      const emoji = emojiMap[num] || num;
      const prefix = match.startsWith("\n") ? "\n" : "";
      return `${prefix}${emoji} `;
    }
  );

  // 2. Condense 3+ newlines to 2 newlines
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  // 3. If abruptly starting with a question, prepend acknowledgment
  const trimmed = sanitized.trim();
  const stripped = trimmed.replace(/^(?:<b>.*?<\/b>|\s*)+/i, "").trim();
  const startsAbruptly =
    /^(?:kis\s*type|kitne\s*bhk|aapka\s*budget|konsi\s*location|which\s*location|how\s*many\s*bhk|what\s*is\s*your\s*budget|where\s*are\s*you\s*looking|tamne\s*kaya|ketlu\s*budget|kaya\s*area)\b/i.test(
      stripped
    );
  const hasAck =
    /\b(ji|noted|samajh|samji|nondhi|shukriya|dhanyawad|thank|thanks|certainly|sure|bilkul|saras|great|got\s*it|perfect|aapki|tamari|hello|namaste|kem\s*cho|pranam|vanakkam|namaskaram)\b/i.test(
      trimmed.slice(0, 80).toLowerCase()
    ) || /[👍🙏🏡✨]/.test(trimmed.slice(0, 50));

  if (startsAbruptly && !hasAck) {
    const d = (dialect || "").toUpperCase();
    if (d.includes("GUJ")) {
      sanitized = `Ji noted! 👍\n${sanitized}`;
    } else if (d.includes("ENG")) {
      sanitized = `Noted! 👍\n${sanitized}`;
    } else {
      sanitized = `Ji noted! 👍\n${sanitized}`;
    }
  }

  // 4. Balance HTML tags
  sanitized = fixUnbalancedHtml(sanitized);

  return sanitized.trim();
}

// -----------------------------------------------------------------------------
// 3. Lightweight Corrective Auto-Synthesis Engine
// -----------------------------------------------------------------------------

/**
 * Deterministic rule-based auto-corrector as instantaneous fallback
 */
export function getDeterministicCorrection(
  params: OutboundVerificationParams,
  violations: string[]
): string {
  const userText = params.userMessage || "";
  const lang = params.languageProfile?.dialect || "HINGLISH";
  const violationSummary = violations.join(" ");

  // 1. Contradiction: User is seller, bot asked buyer questions
  if (violationSummary.includes("seller intent")) {
    if (lang === "GUJLISH" || lang === "GUJARATI_SCRIPT") {
      return "Ji bilkul! Tamari property vechva ma ame sampurna madad karishu. Kripya janavjo property kaya vistar ma chhe ane ketla carpet area/sq ft chhe? 🏡";
    } else if (lang === "ENGLISH") {
      return "Certainly! We would be delighted to assist you in selling your property. Could you please share the location and carpet area? 🏡";
    }
    return "Ji bilkul! Aapki property bechne me hum aapki poori madad karenge. Kripya batayein property kis location par hai aur carpet area kitna hai? 🏡";
  }

  // 2. Contradiction: Cannot attend visit
  if (violationSummary.includes("inability to attend")) {
    if (lang === "GUJLISH" || lang === "GUJARATI_SCRIPT") {
      return "Koi vandho nahi! Ame samji shakie chhiye. Tamne aavta divaso ma kaya divase ane samaye visit anukud rahese? Ame slot reschedule kari aapsu. 🗓️";
    } else if (lang === "ENGLISH") {
      return "No problem at all! We completely understand. Which upcoming date and time would be more convenient for you to reschedule the visit? 🗓️";
    }
    return "Koi baat nahi! Hum samajh sakte hain. Aapko aane wale dino me kaunsa din aur samay anukool rahega? Hum visit reschedule kar denge. 🗓️";
  }

  // 3. Redundancy: Location already given
  if (violationSummary.includes("re-asks for location")) {
    if (lang === "GUJLISH" || lang === "GUJARATI_SCRIPT") {
      return "Ji noted! Tamari pasandida location nodhi lidhi chhe. Kripya janavjo tamaru approximate budget ketlu rahese? 💰";
    } else if (lang === "ENGLISH") {
      return "Noted! We have recorded your preferred location. Could you please share your approximate budget range? 💰";
    }
    return "Ji noted! Aapki preferred location note kar li hai. Kripya batayein aapka approximate budget range kya rahega? 💰";
  }

  // 4. Redundancy: Property type already given
  if (violationSummary.includes("property type")) {
    if (lang === "GUJLISH" || lang === "GUJARATI_SCRIPT") {
      return "Ji bilkul, requirement noted! Tamne kaya specific area athva locality ma property pasand chhe? 📍";
    } else if (lang === "ENGLISH") {
      return "Noted! Which specific locality or neighborhood are you primarily considering? 📍";
    }
    return "Ji bilkul, requirement note kar li hai! Aap kis specific area ya locality me dekh rahe hain? 📍";
  }

  // 5. Redundancy: Budget already given
  if (violationSummary.includes("re-asks for budget")) {
    if (lang === "GUJLISH" || lang === "GUJARATI_SCRIPT") {
      return "Ji noted! Tamaru budget dhyan ma rakhyu chhe. Tamne Ready to Move property joiye chhe ke Under Construction pan chale? 🏗️";
    } else if (lang === "ENGLISH") {
      return "Noted! We have captured your budget. Are you looking for Ready to Move or is Under Construction also suitable? 🏗️";
    }
    return "Ji noted! Aapka budget dhyan me rakh liya hai. Aapko Ready to Move property chahiye ya Under Construction bhi chalega? 🏗️";
  }

  // 6. Dialogue governance: Quick reply format or abrupt question
  if (violationSummary.includes("QUICK_REPLY_FORMAT") || violationSummary.includes("ACKNOWLEDGE_FIRST")) {
    return autoSanitizeDialogue(params.proposedReply, lang);
  }

  // 7. Conciseness: Trim rambling conversational replies beyond 7 lines
  if (violationSummary.includes("CONCISENESS")) {
    const lines = params.proposedReply.split("\n").map(l => l.trim()).filter(Boolean);
    const concise = lines.slice(0, 6).join("\n");
    return autoSanitizeDialogue(concise, lang);
  }

  // 8. HTML syntax errors
  if (violationSummary.includes("HTML_SYNTAX")) {
    return autoSanitizeDialogue(fixUnbalancedHtml(params.proposedReply), lang);
  }

  // 9. Hallucinated guarantees: strip them cleanly
  let cleaned = params.proposedReply
    .replace(/100%\s*guarantee/gi, "trusted quality")
    .replace(/guaranteed\s*(?:returns|roi|profit)/gi, "high potential returns")
    .replace(/double\s*your\s*money/gi, "attractive appreciation potential")
    .replace(/[!?]{4,}/g, "!");

  return autoSanitizeDialogue(cleaned, lang);
}

/**
 * Lightweight corrective re-synthesis using Gemini 2.5 Flash with Groq fallback
 */
export async function correctWithLightweightLlm(
  params: OutboundVerificationParams,
  violations: string[]
): Promise<string | null> {
  const geminiKey =
    params.options?.geminiApiKey ||
    (typeof Deno !== "undefined" ? Deno.env.get("GEMINI_API_KEY") : process.env.GEMINI_API_KEY) ||
    "";
  const groqKey =
    params.options?.groqApiKey ||
    (typeof Deno !== "undefined" ? Deno.env.get("GROQ_API_KEY") : process.env.GROQ_API_KEY) ||
    "";

  const cleanGeminiKey = geminiKey.trim().replace(/^["']|["']$/g, "");
  const cleanGroqKey = groqKey.trim().replace(/^["']|["']$/g, "");

  const prompt = `You are a pre-flight conversational correction gate for Nextgen Realtors CRM.
A proposed bot response failed pre-flight verification due to the following invariant violations:
${violations.map(v => `- ${v}`).join("\n")}

Context:
- User Message: "${params.userMessage}"
- Lead State: "${params.leadState || "QUALIFYING"}"
- Failed Reply: "${params.proposedReply}"
- Language/Dialect: "${params.languageProfile?.dialect || "Hinglish"}"

Instructions:
1. Generate an immediate corrected, compliant, natural, and polite reply.
2. Fix all listed violations strictly.
3. If the user wants to sell/rent out property, reply with seller intake questions, NOT buyer search questions.
4. If the user already provided an entity (e.g. location or property type), acknowledge it and ask the next missing qualification question instead of re-asking.
5. If the user cannot attend a visit, empathize and offer reschedule options.
6. Ensure all HTML tags (<b>, <i>, <a>) are strictly balanced and properly closed.
7. Strictly adhere to the 3 Golden Response Principles: 1) Acknowledge First, 2) Be Concise (<= 3-4 lines for mobile), 3) Offer Next Steps with numbered emojis (1️⃣, 2️⃣).
8. Return ONLY the corrected message text. No explanations or commentary.`;

  // Try Gemini 2.0 Flash first (~150-300ms)
  if (cleanGeminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cleanGeminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 250,
            },
          }),
          signal: AbortSignal.timeout(2200),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return fixUnbalancedHtml(text);
      }
    } catch (_err) {
      // Fall through to Groq
    }
  }

  // Try Groq Llama-3.3-70b fallback (~200ms)
  if (cleanGroqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanGroqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You are a real estate conversational correction gate. Output only the corrected reply." },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 250,
        }),
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return fixUnbalancedHtml(text);
      }
    } catch (_err) {
      // Fall through to deterministic
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// 4. Main Exported Gate: verifyOutboundReply
// -----------------------------------------------------------------------------

/**
 * Pre-Flight Outbound Reply Verification Gate
 * Runs all 5 invariant checks in parallel and self-corrects invalid replies.
 */
export async function verifyOutboundReply(
  params: OutboundVerificationParams
): Promise<OutboundVerificationResult> {
  const violations: string[] = [];

  // Check 1: Contradiction
  const contradictionViolation = checkContradiction(params);
  if (contradictionViolation) violations.push(contradictionViolation);

  // Check 2: Redundancy
  const redundancyViolation = checkRedundancy(params);
  if (redundancyViolation) violations.push(redundancyViolation);

  // Check 3: Hallucination
  const hallucinationViolation = checkHallucination(params);
  if (hallucinationViolation) violations.push(hallucinationViolation);

  // Check 4: Policy & HTML Compliance
  const policyViolation = checkPolicyAndCompliance(params);
  if (policyViolation) violations.push(policyViolation);

  // Check 5: CS-Chatbot-Design Dialogue Governance & Mobile Readability
  const dialogueViolation = checkDialogueGovernance(params);
  if (dialogueViolation) violations.push(dialogueViolation);

  // If all invariants passed cleanly
  if (violations.length === 0) {
    return {
      isValid: true,
      correctedReply: autoSanitizeDialogue(params.proposedReply, params.languageProfile?.dialect),
      violations: [],
    };
  }

  // Violations detected: Trigger lightweight corrective synthesis
  const reason = violations.join("; ");

  // Fast-path: If only dialogue formatting violations (QUICK_REPLY_FORMAT, ACKNOWLEDGE_FIRST, HTML_SYNTAX)
  const isOnlyFormatting = violations.every(
    v => v.includes("QUICK_REPLY_FORMAT") || v.includes("ACKNOWLEDGE_FIRST") || v.includes("HTML_SYNTAX")
  );
  if (isOnlyFormatting) {
    const sanitized = autoSanitizeDialogue(params.proposedReply, params.languageProfile?.dialect);
    return {
      isValid: false,
      correctedReply: sanitized,
      reason,
      violations,
    };
  }

  // 1. Try lightweight LLM re-synthesis
  let corrected: string | null = null;
  try {
    corrected = await correctWithLightweightLlm(params, violations);
  } catch (_e) {
    corrected = null;
  }

  // 2. If LLM unavailable or timed out, apply deterministic correction
  if (!corrected) {
    corrected = getDeterministicCorrection(params, violations);
  }

  return {
    isValid: false,
    correctedReply: autoSanitizeDialogue(corrected, params.languageProfile?.dialect),
    reason,
    violations,
  };
}
