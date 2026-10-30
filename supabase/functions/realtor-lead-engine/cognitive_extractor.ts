/**
 * COGNITIVE INTENT & ENTITY EXTRACTOR MODULE
 * Phase 33.2 / Phase 33.4: Zero-Regex Cognitive Intent & Entity Extractor
 *
 * Employs Gemini 2.5 Flash / Pro with strict responseSchema and automatic Pro escalation
 * on negation/corrections, backed by Groq Llama-3.3-70b and a deterministic Indic extractor.
 */

import { normalizeGujaratiDigits, normalizeIndicDigits } from "./multilingual_synthesizer.ts";

export interface CognitiveExtractionEntities {
  property_category: "RESIDENTIAL" | "COMMERCIAL" | "PLOT_LAND" | "UNKNOWN";
  property_type: "FLAT" | "TENEMENT" | "DUPLEX" | "VILLA" | "SHOP" | "OFFICE" | "PLOT" | "UNKNOWN";
  unit_bhk: number | null;
  budget_inr: number | null;
  budget_type: "OUTRIGHT_BUY" | "MONTHLY_RENT" | "COMMERCIAL_LEASE" | "UNKNOWN";
  location_name: string | null;
  carpet_area_sqft: number | null;
  purpose: "END_USE" | "INVESTMENT" | "UNKNOWN";
  timeline: "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | "UNKNOWN";
  furnishing: "FULLY_FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED" | "UNKNOWN";
}

export interface CognitiveExtractionLanguage {
  primary_language: string;
  code: string;
  dialect: string;
  script: "Latin" | "Devanagari" | "Gujarati" | "Other";
  formality: "POLITE_RESPECTFUL" | "CASUAL" | "FORMAL";
}

export interface CognitiveExtractionResult {
  lead_role: "BUYER" | "TENANT" | "SELLER" | "LANDLORD" | "BROKER" | "UNKNOWN";
  primary_intent:
    | "NEW_INQUIRY"
    | "ANSWER_QUESTION"
    | "NEGATION_CORRECTION"
    | "SELECT_OPTION"
    | "BOOK_VISIT"
    | "RESCHEDULE_VISIT"
    | "CANCEL_VISIT"
    | "CONFIRM_VISIT"
    | "SIDE_FAQ"
    | "HUMAN_ESCALATION"
    | "GREETING_ONLY"
    | "OFF_TOPIC";
  direct_answer_to_last_question: boolean;
  user_negated_assumptions: boolean;
  selected_menu_option: number | null;
  entities: CognitiveExtractionEntities;
  detected_language: CognitiveExtractionLanguage;
}

export const REAL_ESTATE_EXTRACTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    lead_role: {
      type: "STRING",
      enum: ["BUYER", "TENANT", "SELLER", "LANDLORD", "BROKER", "UNKNOWN"],
    },
    primary_intent: {
      type: "STRING",
      enum: [
        "NEW_INQUIRY",
        "ANSWER_QUESTION",
        "NEGATION_CORRECTION",
        "SELECT_OPTION",
        "BOOK_VISIT",
        "RESCHEDULE_VISIT",
        "CANCEL_VISIT",
        "CONFIRM_VISIT",
        "SIDE_FAQ",
        "HUMAN_ESCALATION",
        "GREETING_ONLY",
        "OFF_TOPIC",
      ],
    },
    direct_answer_to_last_question: { type: "BOOLEAN" },
    user_negated_assumptions: { type: "BOOLEAN" },
    selected_menu_option: { type: "INTEGER", nullable: true },
    entities: {
      type: "OBJECT",
      properties: {
        property_category: {
          type: "STRING",
          enum: ["RESIDENTIAL", "COMMERCIAL", "PLOT_LAND", "UNKNOWN"],
        },
        property_type: {
          type: "STRING",
          enum: [
            "FLAT",
            "TENEMENT",
            "DUPLEX",
            "VILLA",
            "SHOP",
            "OFFICE",
            "PLOT",
            "UNKNOWN",
          ],
        },
        unit_bhk: { type: "INTEGER", nullable: true },
        budget_inr: { type: "INTEGER", nullable: true },
        budget_type: {
          type: "STRING",
          enum: ["OUTRIGHT_BUY", "MONTHLY_RENT", "COMMERCIAL_LEASE", "UNKNOWN"],
        },
        location_name: { type: "STRING", nullable: true },
        carpet_area_sqft: { type: "INTEGER", nullable: true },
        purpose: {
          type: "STRING",
          enum: ["END_USE", "INVESTMENT", "UNKNOWN"],
        },
        timeline: {
          type: "STRING",
          enum: ["READY_TO_MOVE", "UNDER_CONSTRUCTION", "UNKNOWN"],
        },
        furnishing: {
          type: "STRING",
          enum: ["FULLY_FURNISHED", "SEMI_FURNISHED", "UNFURNISHED", "UNKNOWN"],
        },
      },
      required: [
        "property_category",
        "property_type",
        "unit_bhk",
        "budget_inr",
        "budget_type",
        "location_name",
        "carpet_area_sqft",
        "purpose",
        "timeline",
        "furnishing",
      ],
    },
    detected_language: {
      type: "OBJECT",
      properties: {
        primary_language: { type: "STRING" },
        code: { type: "STRING" },
        dialect: { type: "STRING" },
        script: {
          type: "STRING",
          enum: ["Latin", "Devanagari", "Gujarati", "Other"],
        },
        formality: {
          type: "STRING",
          enum: ["POLITE_RESPECTFUL", "CASUAL", "FORMAL"],
        },
      },
      required: ["primary_language", "code", "dialect", "script", "formality"],
    },
  },
  required: [
    "lead_role",
    "primary_intent",
    "direct_answer_to_last_question",
    "user_negated_assumptions",
    "entities",
    "detected_language",
  ],
};

export const VERNACULAR_RENTAL_REGEX =
  /(?:^|\b)(?:bhade|bhadu|bhada|bhaade|kiraya|kiraye|rent\s*par|bhada\s*par|bhade\s*thi|reva\s*mate)\b/i;
export const VERNACULAR_SALE_REGEX =
  /(?:^|\b)(?:vechva|vechvu|vechvo|bechna|bechni|kharidva\s*nathi|sale|bikri)\b/i;

export function isBhkOrPropertyConfiguration(text: string): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return (
    /^(?:[1-5]\s*bhk|[1-5]\s*rk|[1-5]\s*bed|1bhk|2bhk|3bhk|4bhk|5bhk)$/i.test(t) ||
    /^(?:duplex|penthouse|tenement|villa|flat|shop|office|plot)$/i.test(t)
  );
}

export function parseSingleDigitChoice(text: string): number | null {
  if (!text) return null;
  const t = text.trim();
  const digitMap: Record<string, number> = {
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
    "૧": 1, "૨": 2, "૩": 3, "૪": 4, "૫": 5,
    "१": 1, "२": 2, "३": 3, "४": 4, "५": 5,
    "1️⃣": 1, "2️⃣": 2, "3️⃣": 3, "4️⃣": 4, "5️⃣": 5,
  };
  const match = t.match(/^(?:option\s*)?([1-5]|૧|૨|૩|૪|૫|१|२|३|४|५|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣)$/i);
  if (match && digitMap[match[1]]) {
    return digitMap[match[1]];
  }
  return null;
}

export function disambiguateNumericChoice(
  text: string,
  state?: string,
  lastBotPrompt?: any
): { isChoice: boolean; choiceIndex?: number; reason?: string } {
  if (isBhkOrPropertyConfiguration(text)) {
    return { isChoice: false, reason: "BHK_CONFIGURATION" };
  }
  const choice = parseSingleDigitChoice(text);
  if (choice !== null) {
    return { isChoice: true, choiceIndex: choice, reason: "SINGLE_DIGIT_OPTION" };
  }
  return { isChoice: false };
}

export function parseJsonSafely(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }
    return null;
  }
}

export function buildCognitivePrompt(context: {
  messageText: string;
  currentLead: any;
  lastPrompt?: any;
  recentMessages?: any[];
}): string {
  const { messageText, currentLead, lastPrompt, recentMessages } = context;
  const leadState = currentLead?.state || "FRESH";
  const leadType = currentLead?.lead_type || currentLead?.metadata?.active_persona || "UNKNOWN";
  const lastBotPromptText =
    lastPrompt?.text_preview || currentLead?.metadata?.last_bot_prompt?.text_preview || "None";
  const lastBotQuestionType =
    lastPrompt?.question_type || currentLead?.metadata?.last_bot_prompt?.question_type || "None";

  let historySection = "No previous turns recorded.";
  if (Array.isArray(recentMessages) && recentMessages.length > 0) {
    const turns = recentMessages.slice(-6).map((m: any, idx: number) => {
      const speaker = m.sender || (m.role === "assistant" || m.event_type?.includes("BOT") ? "BOT" : "USER");
      const text = m.text || m.payload?.userText || m.payload?.reply_sent || m.content || "";
      return `Turn ${idx + 1} [${speaker}]: ${text}`;
    });
    historySection = turns.join("\n");
  } else if (currentLead?.metadata?.recent_turns && Array.isArray(currentLead.metadata.recent_turns)) {
    historySection = currentLead.metadata.recent_turns.slice(-6).join("\n");
  }

  return `You are an expert Real Estate Cognitive Intent & Entity Extractor for Indian real estate dialogs across Hinglish, Gujlish, Gujarati, Hindi, and English.
Analyze the user's message in the full context of the dialog state, pending bot question, and recent conversation turns.

### CURRENT CONVERSATION CONTEXT:
- Active Lead State: ${leadState}
- Lead Persona/Role: ${leadType}
- Pending Question Type: ${lastBotQuestionType}
- Last Bot Prompt: "${lastBotPromptText}"

### RECENT DIALOG TURNS:
${historySection}

### CRITICAL DISAMBIGUATION RULES:
1. PROPERTY TYPE vs SOCIETY/PROJECT NAME:
   - "ternament", "tenament", "tenaments", "ternaments", "row house", "ટેનામેન્ટ" is property_type: "TENEMENT" (Tenement/Row house). It is NEVER a project or society name, and NEVER a location!
   - "shop", "office", "flat", "apartment", "duplex", "villa", "penthouse", "plot" are property types. NEVER put them into location_name!

2. SELLER vs SEEKER NEGATION:
   - "shop bechni he lena nahi", "muje shop bechni hai", "flat vechvano chhe", "bechvu che": lead_role is strictly "SELLER", budget_type is "OUTRIGHT_BUY" (expected price), NOT a commercial lease or rent seeker!
   - "chahiye nahi, bechni hai", "lena nahi hai", "nahi lena": user_negated_assumptions MUST BE TRUE, lead_role is "SELLER", primary_intent is "NEGATION_CORRECTION".

3. NUMERIC MENU SELECTIONS & DISAMBIGUATION:
   - If user responds with a single isolated digit like "1", "2", "3" or "option 2":
     - Map to selected_menu_option as 1-based integer (1, 2, 3, etc.).
     - In post-visit attendance (SITE_VISIT_DONE, VISIT_ATTENDANCE), "1" = attended (CONFIRM_VISIT), "2" = did not attend / reschedule (RESCHEDULE_VISIT). NEVER confuse "2" with "Option 3: search new properties"!
     - In ROLE_SELECTION_PENDING, "1" = BUYER, "2" = SELLER, "3" = HUMAN_ESCALATION.
     - In DUAL_ROLE_MENU_PENDING, "1" = SELECT_OPTION, "2" = CHECK_STATUS, "3" = HUMAN_ESCALATION.
     - However, "2bhk", "2 bhk", "3 bed" is property configuration (unit_bhk), NOT a menu selection!

4. VERNACULAR ADJECTIVES vs LOCALITIES:
   - "purana", "purani", "juno", "juni" mean OLD/RESALE. They are condition descriptors, NEVER locations!
   - "navo", "nava", "naya", "nayi" mean NEW. NEVER locations!
   - location_name must be a pure geographical area or locality (e.g. "Alkapuri", "Waghodia Road", "Gotri", "Vasna"). If no real locality is mentioned, location_name MUST BE NULL!

5. BUDGET & CURRENCY NORMALIZATION:
   - "1 cr", "1 crore", "૧ કરોડ" = 10000000 INR
   - "50 lakh", "50L", "૫૦ લાખ", "50 lac" = 5000000 INR
   - "25 hazar", "25k", "૨૫ હજાર" = 25000 INR

6. LINGUISTIC PROFILE:
   - Detect primary language, script (Devanagari, Gujarati, Latin, Other), and dialect (Hinglish, Gujlish, Pure Gujarati, Marathi, Tamil, Telugu, English).
   - Detect formality ("POLITE_RESPECTFUL", "CASUAL", "FORMAL").

USER MESSAGE TO EXTRACT:
"${messageText}"`;
}

export function runDeterministicCognitiveExtractor(
  messageText: string,
  currentLead?: any,
  lastPrompt?: any
): CognitiveExtractionResult {
  const normalized = normalizeIndicDigits(normalizeGujaratiDigits(messageText || ""));
  const lower = normalized.toLowerCase().trim();

  // 1. Script & Language Detection
  let script: "Latin" | "Devanagari" | "Gujarati" | "Other" = "Latin";
  let primaryLang = "Hindi";
  let code = "hi-IN";
  let dialect = "Hinglish";
  let formality: "POLITE_RESPECTFUL" | "CASUAL" | "FORMAL" = "POLITE_RESPECTFUL";

  if (/[\u0A80-\u0AFF]/.test(normalized)) {
    script = "Gujarati";
    primaryLang = "Gujarati";
    code = "gu-IN";
    dialect = "Pure Gujarati";
  } else if (/[\u0900-\u097F]/.test(normalized)) {
    script = "Devanagari";
    if (/(?:मला|पाहिजे|आहे|विकायचे|विकणे|किती|दाखवा|भाड्याने|माला|mala|pahije|aahe|vikayche|vikne|kiti|dakhva)/i.test(lower)) {
      primaryLang = "Marathi";
      code = "mr-IN";
      dialect = "Marathi";
    } else {
      primaryLang = "Hindi";
      code = "hi-IN";
      dialect = "Devanagari Hindi";
    }
  } else if (/[\u0B80-\u0BFF]/.test(normalized)) {
    script = "Other";
    primaryLang = "Tamil";
    code = "ta-IN";
    dialect = "Tamil";
  } else if (/[\u0C00-\u0C7F]/.test(normalized)) {
    script = "Other";
    primaryLang = "Telugu";
    code = "te-IN";
    dialect = "Telugu";
  } else if (/[\u0C80-\u0CFF]/.test(normalized)) {
    script = "Other";
    primaryLang = "Kannada";
    code = "kn-IN";
    dialect = "Kannada";
  } else if (/[\u0980-\u09FF]/.test(normalized)) {
    script = "Other";
    primaryLang = "Bengali";
    code = "bn-IN";
    dialect = "Bengali";
  } else if (/[\u0A00-\u0A7F]/.test(normalized)) {
    script = "Other";
    primaryLang = "Punjabi";
    code = "pa-IN";
    dialect = "Punjabi";
  } else {
    // Latin Script
    script = "Latin";
    const hasGujLex = /\b(kem|cho|chho|chhe|che|nathi|joiye|joyiye|joie|mane|aapo|aapjo|batavo|shu|bhai|ben|tamare|amare|vechvu|vechvano|bhade|bhadu|kale|aaje)\b/i.test(lower);
    const hasMarLex = /\b(mala|pahije|aahe|vikaycha|vikayche|vikne|kiti|dakhva|bhadane|ghyaye)\b/i.test(lower);
    const hasTamLex = /\b(enakku|vendum|kaatunga|vaanga|enna|irukku|illai)\b/i.test(lower);
    const hasTelLex = /\b(naaku|kaavaali|chupinchandi|undi|ledu|kavalenu)\b/i.test(lower);
    const hasPunLex = /\b(mainu|chahida|kithe|daso|vechna|kidaan)\b/i.test(lower);
    const hasExplicitEnglish = lower.includes("in english") || lower.includes("speak english") || lower.includes("english please") || lower === "english";
    const hasEnglishGrammar = /\b(can you|could you|would you|please send|please show|please share|i am looking|i want to|i need to|we are looking|we want to|what is the|what are the|tell me about|could we|how much is|where is it|show me some|looking for|interested in|share with me|under construction|ready to move|reschedule|cancel|call me)\b/i.test(lower);
    const hasHinLex = /\b(hai|hain|nahi|nhi|nai|chahiye|chahye|chahie|chaiye|karna|karni|dekhna|dikhao|batao|bhejo|kitna|kitne|kaunsa|kahan|kidhar|milega|mujhe|mera|meri|apna)\b/i.test(lower);

    if (hasGujLex) {
      primaryLang = "Gujarati";
      code = "gu-IN";
      dialect = "Gujlish";
    } else if (hasMarLex) {
      primaryLang = "Marathi";
      code = "mr-IN";
      dialect = "Marathi";
    } else if (hasTamLex) {
      primaryLang = "Tamil";
      code = "ta-IN";
      dialect = "Tamil";
    } else if (hasTelLex) {
      primaryLang = "Telugu";
      code = "te-IN";
      dialect = "Telugu";
    } else if (hasPunLex) {
      primaryLang = "Punjabi";
      code = "pa-IN";
      dialect = "Punjabi";
    } else if (hasExplicitEnglish || (hasEnglishGrammar && !hasHinLex && !hasGujLex)) {
      primaryLang = "English";
      code = "en-IN";
      dialect = "English";
    } else {
      primaryLang = "Hindi";
      code = "hi-IN";
      dialect = "Hinglish";
    }
  }

  // Formality detection
  if (/\b(ji|aap|tamare|kripya|please|namaste|pranam|sir|madam|saheb)\b/i.test(lower)) {
    formality = "POLITE_RESPECTFUL";
  } else if (/\b(yaar|bhai|re|tu|tare|tere)\b/i.test(lower)) {
    formality = "CASUAL";
  }

  // 2. Negation Check
  const hasNegationOfTaking =
    /(?:nahi|nhi|na|nathi|not)\s*(?:chahiye|chahye|chahie|chaiye|leni|lena|lene|joiye|leva|kharidvu|kharidna|buy)/i.test(lower) ||
    /(?:chahiye|chahye|chahie|chaiye|leni|lena|joiye|leva)\s*(?:nahi|nhi|na|nathi|not)/i.test(lower);
  const hasSellingAction =
    /(?:bechni|bechna|bechne|vechvu|vechvo|vechva|vechvano|vechvani|sell|resale|bikri|list|listing|property\s*list|list\s*property|લિસ્ટ|लिस्ट|વેચવું|વેચવા|વેચવાનો|बेचना|बेचनी)\b/i.test(lower);
  const userNegatedAssumptions = Boolean(
    hasNegationOfTaking && (hasSellingAction || lower.includes("bech") || lower.includes("vech"))
  );

  // 3. Lead Role & Budget Type
  let leadRole: "BUYER" | "TENANT" | "SELLER" | "LANDLORD" | "BROKER" | "UNKNOWN" = "UNKNOWN";
  let budgetType: "OUTRIGHT_BUY" | "MONTHLY_RENT" | "COMMERCIAL_LEASE" | "UNKNOWN" = "UNKNOWN";

  if (hasSellingAction || userNegatedAssumptions) {
    leadRole = "SELLER";
    budgetType = "OUTRIGHT_BUY";
  } else if (/\b(rent\s*out|bhade\s*aapvu|kiraye\s*pe\s*deni|kiraye\s*pe\s*dena)\b/i.test(lower)) {
    leadRole = "LANDLORD";
    budgetType = "MONTHLY_RENT";
  } else if (/\b(rent|kiraya|kiraye|bhadu|bhade|bhaade|reva\s*mate)\b/i.test(lower)) {
    leadRole = "TENANT";
    budgetType = "MONTHLY_RENT";
  } else if (/\b(lease|corporate\s*lease|commercial\s*lease)\b/i.test(lower)) {
    leadRole = "TENANT";
    budgetType = "COMMERCIAL_LEASE";
  } else if (/\b(buy|purchase|kharid|khareed|leni|lena|chahiye|joiye)\b/i.test(lower)) {
    leadRole = "BUYER";
    budgetType = "OUTRIGHT_BUY";
  } else if (currentLead?.lead_type === "PROVIDER") {
    leadRole = "SELLER";
  } else if (currentLead?.lead_type === "SEEKER") {
    leadRole = currentLead?.requirement === "RENT" ? "TENANT" : "BUYER";
    budgetType = currentLead?.requirement === "RENT"
      ? "MONTHLY_RENT"
      : (currentLead?.requirement === "LEASE"
        ? "COMMERCIAL_LEASE"
        : (currentLead?.requirement === "BUY" ? "OUTRIGHT_BUY" : "UNKNOWN"));
  }

  // 4. Property Type & Category
  let propertyType: "FLAT" | "TENEMENT" | "DUPLEX" | "VILLA" | "SHOP" | "OFFICE" | "PLOT" | "UNKNOWN" = "UNKNOWN";
  let propertyCategory: "RESIDENTIAL" | "COMMERCIAL" | "PLOT_LAND" | "UNKNOWN" = "UNKNOWN";
  let unitBhk: number | null = null;

  const bhkMatch = lower.match(/(?:^|\b)([1-5])\s*(?:bhk|rk|bed|bedroom|bedrooms)\b/i);
  if (bhkMatch) {
    unitBhk = parseInt(bhkMatch[1], 10);
  }

  if (
    /(?:^|\b)(?:ternament|ternaments|tenament|tenaments|tenement|tenements|row\s*house|rowhouse|rowhouses|ટેનામેન્ટ|ટેનામેંટ|टेनामेंट|टेनमेंट)\b/i.test(lower)
  ) {
    propertyType = "TENEMENT";
    propertyCategory = "RESIDENTIAL";
  } else if (/(?:^|\b)(?:shop|shops|dukan|dukaan|દુકાન|दुकान)\b/i.test(lower)) {
    propertyType = "SHOP";
    propertyCategory = "COMMERCIAL";
  } else if (/(?:^|\b)(?:office|offices|corporate\s*space|ઓફિસ|ऑफिस)\b/i.test(lower)) {
    propertyType = "OFFICE";
    propertyCategory = "COMMERCIAL";
  } else if (/(?:^|\b)(?:duplex|ડુપ્લેક્સ|डुप्लेक्स)\b/i.test(lower)) {
    propertyType = "DUPLEX";
    propertyCategory = "RESIDENTIAL";
  } else if (/(?:^|\b)(?:villa|villas|bungalow|bungalows|બંગલો|बंगला)\b/i.test(lower)) {
    propertyType = "VILLA";
    propertyCategory = "RESIDENTIAL";
  } else if (/(?:^|\b)(?:plot|plots|land|jamin|zameen|પ્લોટ|जमीन)\b/i.test(lower)) {
    propertyType = "PLOT";
    propertyCategory = "PLOT_LAND";
  } else if (
    /(?:^|\b)(?:flat|flats|apartment|apartments|એપાર્ટમેન્ટ|ફ્લેટ|फ्लैट)\b/i.test(lower) ||
    unitBhk !== null
  ) {
    propertyType = "FLAT";
    propertyCategory = "RESIDENTIAL";
  }

  // 5. Budget In INR
  let budgetInr: number | null = null;
  const crMatch = lower.match(/(?:^|\b)(\d+(?:\.\d+)?)\s*(?:cr|crore|crores|કરોડ|करोड़)\b/i);
  const lakhMatch = lower.match(/(?:^|\b)(\d+(?:\.\d+)?)\s*(?:l|lac|lacs|lakh|lakhs|લાખ|लाख)\b/i);
  const kMatch = lower.match(/(?:^|\b)(\d+(?:\.\d+)?)\s*(?:k|hazar|thousand|હજાર|हजार)\b/i);

  if (crMatch) {
    budgetInr = Math.round(parseFloat(crMatch[1]) * 10000000);
  } else if (lakhMatch) {
    budgetInr = Math.round(parseFloat(lakhMatch[1]) * 100000);
  } else if (kMatch) {
    budgetInr = Math.round(parseFloat(kMatch[1]) * 1000);
  } else {
    const rawNumMatch = lower.match(/(?:^|\b)(\d{5,9})\b/);
    if (rawNumMatch) {
      budgetInr = parseInt(rawNumMatch[1], 10);
    }
  }

  // 6. Location Name
  let locationName: string | null = null;
  const knownLocalities = [
    "Alkapuri", "Waghodia Road", "Waghodia", "Gotri", "Vasna", "Akota",
    "Karelibaug", "Manjalpur", "Fatehgunj", "Harni", "Bhayli", "Sama",
    "Subhanpura", "Atladra", "Sayajigunj", "Gorwa", "Chhani", "Sevasi",
    "Bill", "Kalali", "Tarsali", "Tandalja", "Makarpura", "Nizampura",
    "Ellora Park", "Sun Pharma Road", "Ajwa Road", "Dabhoi Road",
    "Old Padra Road", "New VIP Road", "VIP Road",
  ];

  for (const loc of knownLocalities) {
    const locLower = loc.toLowerCase();
    const regex = new RegExp(
      `(?:^|\\b)${locLower}(?:\\s*(?:road|area|circle|cross\\s*roads?))?(?:\\s*(?:ma|me|mein|pase|paas))?(?:\\b|$)`,
      "i"
    );
    if (regex.test(lower)) {
      locationName = loc;
      break;
    }
  }

  // 7. Selected Menu Option & Primary Intent
  let selectedMenuOption: number | null = null;
  let primaryIntent: CognitiveExtractionResult["primary_intent"] = "NEW_INQUIRY";

  const isolatedDigitMatch = lower.match(
    /^(?:option\s*)?([1-5]|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣)(?:\s*(?:no|number|num|chhe|che|karo|bhai|ji|wala|vala))?$/i
  );
  if (isolatedDigitMatch && !unitBhk) {
    const digitChar = isolatedDigitMatch[1]
      .replace("1️⃣", "1")
      .replace("2️⃣", "2")
      .replace("3️⃣", "3")
      .replace("4️⃣", "4")
      .replace("5️⃣", "5");
    selectedMenuOption = parseInt(digitChar, 10);
  }

  const isVisitAttendanceTurn =
    currentLead?.state === "SITE_VISIT_DONE" ||
    Boolean(currentLead?.post_visit_feedback_sent) ||
    lastPrompt?.question_type === "VISIT_ATTENDANCE" ||
    currentLead?.metadata?.last_bot_prompt?.question_type === "VISIT_ATTENDANCE";

  if (userNegatedAssumptions) {
    primaryIntent = "NEGATION_CORRECTION";
  } else if (selectedMenuOption !== null) {
    if (isVisitAttendanceTurn) {
      if (selectedMenuOption === 1) primaryIntent = "CONFIRM_VISIT";
      else if (selectedMenuOption === 2) primaryIntent = "RESCHEDULE_VISIT";
      else primaryIntent = "SELECT_OPTION";
    } else {
      primaryIntent = "SELECT_OPTION";
    }
  } else if (isVisitAttendanceTurn) {
    if (/(?:nahi|nhi|na|nathi|miss|missed|cancel|attend\s*nahi)/i.test(lower)) {
      primaryIntent = "RESCHEDULE_VISIT";
      selectedMenuOption = 2;
    } else if (/(?:ha|haan|yes|yep|done|attended|gaya|gaye)/i.test(lower)) {
      primaryIntent = "CONFIRM_VISIT";
      selectedMenuOption = 1;
    }
  } else if (/(?:call|talk|contact|agent|human|baat\s*karni|fon|phone)/i.test(lower)) {
    primaryIntent = "HUMAN_ESCALATION";
  } else if (/(?:reschedule|change\s*time|badalna|dusra\s*time)/i.test(lower)) {
    primaryIntent = "RESCHEDULE_VISIT";
  } else if (/(?:cancel|drop)/i.test(lower)) {
    primaryIntent = "CANCEL_VISIT";
  } else if (/(?:hi|hello|hey|namaste|kem\s*cho|pranam)/i.test(lower) && lower.split(/\s+/).length <= 3) {
    primaryIntent = "GREETING_ONLY";
  } else if (/(?:loan|rera|brokerage|amenities|distance|possession)/i.test(lower)) {
    primaryIntent = "SIDE_FAQ";
  }

  // Purpose & Timeline & Furnishing
  let purpose: "END_USE" | "INVESTMENT" | "UNKNOWN" = "UNKNOWN";
  if (/(?:invest|investment|roi|rental\s*yield|retire)/i.test(lower)) purpose = "INVESTMENT";
  else if (/(?:reva|rehna|family|self\s*use|own\s*use|living)/i.test(lower)) purpose = "END_USE";

  let timeline: "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | "UNKNOWN" = "UNKNOWN";
  if (/(?:ready|immediate|turant|ready\s*to\s*move|rtm)/i.test(lower)) timeline = "READY_TO_MOVE";
  else if (/(?:under\s*construction|chal\s*raha|ban\s*raha|bante|uc)/i.test(lower)) timeline = "UNDER_CONSTRUCTION";

  let furnishing: "FULLY_FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED" | "UNKNOWN" = "UNKNOWN";
  if (/(?:full|fully|pura\s*furnished)/i.test(lower)) furnishing = "FULLY_FURNISHED";
  else if (/(?:semi|adhadhu)/i.test(lower)) furnishing = "SEMI_FURNISHED";
  else if (/(?:unfurnished|raw|bina\s*furniture)/i.test(lower)) furnishing = "UNFURNISHED";

  // Carpet area
  let carpetAreaSqft: number | null = null;
  const sqftMatch = lower.match(/(?:^|\b)(\d{3,5})\s*(?:sq\s*ft|sqft|square\s*feet|sq\s*feet|foot|वार|var|ચોરસ\s*ફૂટ)\b/i);
  if (sqftMatch) {
    carpetAreaSqft = parseInt(sqftMatch[1], 10);
  }

  return {
    lead_role: leadRole,
    primary_intent: primaryIntent,
    direct_answer_to_last_question:
      selectedMenuOption !== null ||
      locationName !== null ||
      propertyType !== "UNKNOWN" ||
      budgetInr !== null ||
      timeline !== "UNKNOWN" ||
      purpose !== "UNKNOWN",
    user_negated_assumptions: userNegatedAssumptions,
    selected_menu_option: selectedMenuOption,
    entities: {
      property_category: propertyCategory,
      property_type: propertyType,
      unit_bhk: unitBhk,
      budget_inr: budgetInr,
      budget_type: budgetType,
      location_name: locationName,
      carpet_area_sqft: carpetAreaSqft,
      purpose,
      timeline,
      furnishing,
    },
    detected_language: {
      primary_language: primaryLang,
      code,
      dialect,
      script,
      formality,
    },
  };
}

export async function extractCognitiveIntentWithAI(context: {
  messageText: string;
  currentLead: any;
  lastPrompt?: any;
  recentMessages?: any[];
  options?: {
    geminiApiKey?: string;
    groqApiKey?: string;
    forceProEscalation?: boolean;
    fetchImpl?: typeof fetch;
  };
}): Promise<{
  extracted: CognitiveExtractionResult;
  provider_used: "GEMINI_FLASH" | "GEMINI_PRO" | "GROQ_LLAMA" | "DETERMINISTIC_FALLBACK";
  latency_ms: number;
  escalated_to_pro: boolean;
}> {
  const start = Date.now();
  const fetchFn = context.options?.fetchImpl || fetch;

  const geminiKey = (
    context.options?.geminiApiKey ||
    (typeof Deno !== "undefined" ? Deno.env.get("GEMINI_API_KEY") : process.env.GEMINI_API_KEY) ||
    ""
  ).trim().replace(/^["']|["']$/g, "");

  const groqKey = (
    context.options?.groqApiKey ||
    (typeof Deno !== "undefined" ? Deno.env.get("GROQ_API_KEY") : process.env.GROQ_API_KEY) ||
    ""
  ).trim().replace(/^["']|["']$/g, "");

  const promptText = buildCognitivePrompt(context);

  // 1. Google Gemini 2.5 Flash / 1.5 Pro with responseSchema
  if (geminiKey) {
    try {
      const isForcePro = Boolean(context.options?.forceProEscalation);
      const geminiCandidateModels = isForcePro
        ? ["gemini-1.5-pro", "gemini-2.5-flash", "gemini-1.5-flash"]
        : ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro", "gemini-2.0-flash"];

      let res: Response | null = null;
      let usedGeminiModel = geminiCandidateModels[0];

      for (const modelName of geminiCandidateModels) {
        try {
          const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;
          const candidateRes = await fetchFn(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 600,
                responseMimeType: "application/json",
                responseSchema: REAL_ESTATE_EXTRACTION_SCHEMA,
              },
            }),
            signal: AbortSignal.timeout(isForcePro ? 4000 : 2500),
          });
          if (candidateRes.ok) {
            res = candidateRes;
            usedGeminiModel = modelName;
            break;
          }
        } catch (_) {}
      }

      if (res && res.ok) {
        const data = await res.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
          const parsed = parseJsonSafely(rawJsonText);
          if (parsed && parsed.lead_role && parsed.primary_intent && parsed.entities) {
            if (parsed.user_negated_assumptions && !isForcePro) {
              try {
                const proUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`;
                const proRes = await fetchFn(proUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    contents: [
                      {
                        parts: [
                          {
                            text:
                              "USER ASSUMPTION NEGATION / ROLE CORRECTION DETECTED. Re-evaluate this user turn with maximum reasoning depth:\n" +
                              promptText,
                          },
                        ],
                      },
                    ],
                    generationConfig: {
                      temperature: 0.1,
                      maxOutputTokens: 600,
                      responseMimeType: "application/json",
                      responseSchema: REAL_ESTATE_EXTRACTION_SCHEMA,
                    },
                  }),
                  signal: AbortSignal.timeout(3500),
                });
                if (proRes.ok) {
                  const proData = await proRes.json();
                  const proText = proData.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (proText) {
                    const proParsed = parseJsonSafely(proText);
                    if (proParsed && proParsed.lead_role && proParsed.primary_intent) {
                      return {
                        extracted: proParsed,
                        provider_used: "GEMINI_PRO",
                        latency_ms: Date.now() - start,
                        escalated_to_pro: true,
                      };
                    }
                  }
                }
              } catch (proErr: any) {
                console.warn("[CognitiveExtractor] Escalation to Gemini Pro failed (falling back to Flash result):", proErr.message);
              }
            }

            return {
              extracted: parsed,
              provider_used: isForcePro || usedGeminiModel.includes("pro") ? "GEMINI_PRO" : "GEMINI_FLASH",
              latency_ms: Date.now() - start,
              escalated_to_pro: isForcePro,
            };
          }
        }
      }
    } catch (geminiErr: any) {
      console.warn("[CognitiveExtractor] Gemini Flash/Pro call failed:", geminiErr.message);
    }
  }

  // 2. Groq Fallback (verified live models: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b)
  if (groqKey) {
    const groqCandidateModels = [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ];
    for (const groqModel of groqCandidateModels) {
      try {
        const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
        const groqRes = await fetchFn(groqUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: groqModel,
            temperature: 0.1,
            max_tokens: 600,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You are an expert Real Estate Cognitive Intent & Entity Extractor. Output strict JSON matching the requested schema.",
              },
              {
                role: "user",
                content:
                  promptText +
                  "\n\nOutput a valid JSON object matching the REAL_ESTATE_EXTRACTION_SCHEMA format.",
              },
            ],
          }),
          signal: AbortSignal.timeout(2500),
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const rawJsonText = groqData.choices?.[0]?.message?.content;
          if (rawJsonText) {
            const parsed = parseJsonSafely(rawJsonText);
            if (parsed && parsed.lead_role && parsed.primary_intent && parsed.entities) {
              return {
                extracted: parsed,
                provider_used: "GROQ_LLAMA",
                latency_ms: Date.now() - start,
                escalated_to_pro: false,
              };
            }
          }
        }
      } catch (groqErr: any) {
        console.warn(`[CognitiveExtractor] Groq model ${groqModel} failed:`, groqErr.message);
      }
    }
  }

  // 3. Deterministic Indic Extractor Fallback
  const deterministicResult = runDeterministicCognitiveExtractor(
    context.messageText,
    context.currentLead,
    context.lastPrompt
  );

  return {
    extracted: deterministicResult,
    provider_used: "DETERMINISTIC_FALLBACK",
    latency_ms: Date.now() - start,
    escalated_to_pro: false,
  };
}
