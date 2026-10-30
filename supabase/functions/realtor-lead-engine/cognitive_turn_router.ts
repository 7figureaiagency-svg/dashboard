/**
 * COGNITIVE TURN ROUTER & MULTI-TENANT INTENT DISPATCHER
 * Phase 40.1: Micro-LLM Perception Layer, 3-Tier Multi-Tenant Scaling Pool & Structured Schema Router
 *
 * Implements high-speed, hyper-focused Micro-LLM Perception (< 250ms, ~400 tokens/turn).
 * Outputs strictly valid typed JSON conforming to MicroIntentResult schema.
 * 3-Tier Scaling: Gemini 2.0 Flash primary -> Groq Llama 3.3 70B hot fallback -> Pure Deterministic engine.
 */

export interface MicroIntentResult {
  primary_intent:
    | "SEARCH_PROPERTY"      // User looking to buy/rent/lease
    | "SUBMIT_PROPERTY"      // User looking to sell/rent out/list
    | "DUAL_ROLE_INTENT"     // User mentions both: sell old + buy new
    | "SELECT_OPTION"        // User replies with digit/choice
    | "BOOK_VISIT"           // User confirms a site visit
    | "RESCHEDULE_VISIT"     // User requests date/time change
    | "CANCEL_VISIT"         // User cancels visit
    | "VISIT_ATTENDED"       // User confirms post-visit attendance
    | "VISIT_NOT_ATTENDED"   // User confirms post-visit absence
    | "ASK_FAQ"              // Side-question (RERA, Loan, Brokerage, Map)
    | "REQUEST_CALL"         // "Call me", "Kal 5 baje call karo", "talk to human"
    | "GREETING"             // "Hi", "Hello", "Kem cho", "Namaste"
    | "OPT_OUT"              // "Stop", "Don't message", "DND"
    | "OFF_TOPIC";           // Unrelated chitchat
  active_role: "BUYER" | "SELLER" | "DUAL_ROLE" | "UNKNOWN";
  detected_language: "GUJARATI_SCRIPT" | "GUJLISH" | "HINGLISH" | "ENGLISH";
  reset_previous_context: boolean;
  selected_option: number | null;
  entities: {
    property_type: string | null;      // "Flat", "Villa", "Commercial Shop", "Office", "Plot"
    property_category: "RESIDENTIAL" | "COMMERCIAL" | "PLOT_LAND" | null;
    unit_bhk: number | null;           // 1, 2, 3, 4, 5
    location: string | null;           // Clean English locality e.g. "Alkapuri", "Gotri"
    budget_max: number | null;         // Pure integer in INR e.g. 10000000 (1 Cr), 8500000 (85L)
    budget_min: number | null;
    possession_timeline: "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | null;
    size_area_sqft: number | null;     // Carpet or plot sqft
    project_or_society: string | null; // Society name for sellers
    expected_price_inr: number | null; // Price for sellers
    transaction_type: "BUY" | "RENT" | "LEASE" | "SELL" | "RENT_OUT" | "LEASE_OUT" | null;
    purpose: "buy" | "rent" | "lease" | "sell" | null;
    reschedule_date: string | null;
    reschedule_time: string | null;
  };
  side_question: string | null;
  missing_critical_slots: string[];
  user_negated_assumptions: boolean;
  reasoning?: string;
}

export type CognitiveTurnResult = MicroIntentResult;

// Indic Script Normalizer
export function normalizeIndicNumerals(text: string): string {
  if (!text) return "";
  const indicMap: Record<string, string> = {
    // Gujarati numerals
    "૦": "0", "૧": "1", "૨": "2", "૩": "3", "૪": "4",
    "૫": "5", "૬": "6", "૭": "7", "૮": "8", "૯": "9",
    // Devanagari numerals
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
  };
  return text.replace(/[૦-૯०-९]/g, (ch) => indicMap[ch] || ch);
}

// Vernacular Locality Dictionary for Vadodara / Pan-India
export const VERNACULAR_LOCALITY_MAP: Record<string, string> = {
  // Gujarati script
  "અલકાપુરી": "Alkapuri",
  "વાઘોડિયા": "Waghodia Road",
  "વાઘોડિયા રોડ": "Waghodia Road",
  "ગોત્રી": "Gotri",
  "વાસણા": "Vasna",
  "વાસણા ભાયલી": "Vasna-Bhayli Road",
  "ભાયલી": "Bhayli",
  "અકોટા": "Akota",
  "કારેલીબાગ": "Karelibaug",
  "માંજલપુર": "Manjalpur",
  "ફતેહગંજ": "Fatehgunj",
  "હરણી": "Harni",
  "સમા": "Sama",
  "સુભાનપુરા": "Subhanpura",
  "અટલાદરા": "Atladra",
  "સયાજીગંજ": "Sayajigunj",
  "ગોરવા": "Gorwa",
  "સેવાસી": "Sevasi",
  "બિલ": "Bill",
  "કલાલી": "Kalali",
  "તરસાલી": "Tarsali",
  "તાંદલજા": "Tandalja",
  "મકરપુરા": "Makarpura",
  "નિઝામપુરા": "Nizampura",
  "સન ફાર્મા": "Sun Pharma Road",
  // Devanagari Hindi
  "अलकापुरी": "Alkapuri",
  "वाघोडिया": "Waghodia Road",
  "गोत्री": "Gotri",
  "वासणा": "Vasna",
  "भायली": "Bhayli",
  "अकोटा": "Akota",
  "करेलीबाग": "Karelibaug",
  "मांजलपुर": "Manjalpur",
  "हर्णी": "Harni",
  "समा": "Sama",
  "सुभानपुरा": "Subhanpura",
  "अटलादरा": "Atladra",
  "माकरपुरा": "Makarpura",
};

const STOP_WORDS_EXTRACT = new Set([
  "usko", "isko", "unko", "inko", "use", "ise", "unhe", "inhe", "usse", "isse", "usme", "isme", "unme", "inme",
  "uska", "uski", "uske", "iska", "iski", "iske", "unka", "unki", "unke", "inka", "inki", "inke",
  "wo", "woh", "voh", "yeh", "ye", "mera", "meri", "mere", "apna", "apni", "apne", "maro", "mari", "maru",
  "karna", "karni", "karne", "karvu", "karva", "karo", "list", "listing", "bechna", "bechni", "vechvu", "vechva",
  "hai", "he", "h", "hain", "chhe", "che", "me", "ma", "par", "pe", "se", "thi", "in", "at", "to", "for",
  "tene", "aene", "ene", "temne", "emne", "tenu", "teni", "teno", "tena", "enu", "eni", "eno", "ena",
  "peli", "pelo", "pelu", "pela", "aavu", "tevu", "bhi", "toh", "ab", "fir", "phir", "sirf", "bas",
  "realty", "realtors", "broker", "brokerage", "agent", "griham", "nextgen"
]);

function isAllStopWords(str: string): boolean {
  if (!str) return true;
  const words = str.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
  return words.length === 0 || words.every(w => STOP_WORDS_EXTRACT.has(w));
}

export function extractSocietyOrProjectName(text: string): string | null {
  if (!text) return null;
  const t = text.trim();
  if (/^(?:hi|hello|hey|namaste|kem cho|pranam|ok|okay|yes|ha|haan|no|nahi|cancel|reschedule|1|2|3|4)\b/i.test(t)) return null;
  if (/^(?:flat|apartment|villa|plot|shop|office|commercial|residential|tenement)\b/i.test(t)) return null;

  const societySuffixPattern = /\b([a-zA-Z0-9\s]{2,30}?)\s+(heights|residency|enclave|palms|park|greens|villas|villa|towers|tower|apartments|apartment|complex|square|hub|icon|status|pride|paradise|regency|county|city|terrace|flora|orchid|sapphire|emerald|pearl|perl|diamond|solitaire|avenue|woods|nest|oasis|horizon|antica|elegance|serene|empire|skyline|arcade|heritage|classic|lifestyle|court|gardens|garden|estate|manor|view|valley|hills|breeze|vista|retreat|haven|bliss|corner|clover|aurum|crest|grove)\b/i;
  const matchSuffix = t.match(societySuffixPattern);
  if (matchSuffix) {
    const raw = matchSuffix[0].trim();
    if (!isAllStopWords(raw)) {
      return raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
  }

  const developerPrefixPattern = /\b(darshanam|shreeji|avadh|nilamber|narayan|samanvay|vihav|alembic|shree ram|shri ram)\s+([a-zA-Z0-9\s]{2,25})\b/i;
  const matchPrefix = t.match(developerPrefixPattern);
  if (matchPrefix) {
    const suffixPart = matchPrefix[2].trim();
    if (!isAllStopWords(suffixPart)) {
      const raw = matchPrefix[0].trim();
      return raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
  }

  if (/\b(?:perl|pearl)\s+[a-zA-Z0-9]+/i.test(t) || /[a-zA-Z0-9]+\s+(?:perl|pearl)\b/i.test(t)) {
    const candidate = t.split(/\s+/).slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    if (!isAllStopWords(candidate)) {
      return candidate;
    }
  }

  return null;
}

export const COGNITIVE_TURN_SCHEMA = {
  type: "OBJECT",
  properties: {
    primary_intent: {
      type: "STRING",
      enum: [
        "SEARCH_PROPERTY",
        "SUBMIT_PROPERTY",
        "DUAL_ROLE_INTENT",
        "SELECT_OPTION",
        "BOOK_VISIT",
        "RESCHEDULE_VISIT",
        "CANCEL_VISIT",
        "VISIT_ATTENDED",
        "VISIT_NOT_ATTENDED",
        "ASK_FAQ",
        "REQUEST_CALL",
        "GREETING",
        "OPT_OUT",
        "OFF_TOPIC",
      ],
    },
    active_role: {
      type: "STRING",
      enum: ["BUYER", "SELLER", "DUAL_ROLE", "UNKNOWN"],
    },
    detected_language: {
      type: "STRING",
      enum: ["GUJARATI_SCRIPT", "GUJLISH", "HINGLISH", "ENGLISH"],
    },
    reset_previous_context: {
      type: "BOOLEAN",
      description: "True if user introduces a new location, new property type, asks to see other properties, or restarts search.",
    },
    selected_option: {
      type: "INTEGER",
      nullable: true,
      description: "Only set if user specifically types an option number (1, 2, 3) to pick from a list. NEVER set if the number is part of budget (e.g. 1 cr) or BHK (e.g. 3bhk).",
    },
    entities: {
      type: "OBJECT",
      properties: {
        property_type: { type: "STRING", nullable: true },
        property_category: {
          type: "STRING",
          enum: ["RESIDENTIAL", "COMMERCIAL", "PLOT_LAND"],
          nullable: true,
        },
        unit_bhk: { type: "INTEGER", nullable: true },
        location: { type: "STRING", nullable: true },
        budget_max: { type: "INTEGER", nullable: true },
        budget_min: { type: "INTEGER", nullable: true },
        possession_timeline: {
          type: "STRING",
          enum: ["READY_TO_MOVE", "UNDER_CONSTRUCTION"],
          nullable: true,
        },
        size_area_sqft: { type: "INTEGER", nullable: true },
        project_or_society: { type: "STRING", nullable: true },
        expected_price_inr: { type: "INTEGER", nullable: true },
        transaction_type: {
          type: "STRING",
          enum: ["BUY", "RENT", "LEASE", "SELL", "RENT_OUT", "LEASE_OUT"],
          nullable: true,
        },
        purpose: {
          type: "STRING",
          enum: ["buy", "rent", "lease", "sell"],
          nullable: true,
        },
        reschedule_date: { type: "STRING", nullable: true },
        reschedule_time: { type: "STRING", nullable: true },
      },
      required: ["property_type", "location", "budget_max"],
    },
    side_question: { type: "STRING", nullable: true },
    missing_critical_slots: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "List of missing slots needed to fulfill intent, e.g. ['reschedule_slot'] if RESCHEDULE_VISIT has no date/time.",
    },
    user_negated_assumptions: { type: "BOOLEAN" },
    reasoning: { type: "STRING" },
  },
  required: [
    "primary_intent",
    "active_role",
    "detected_language",
    "reset_previous_context",
    "entities",
    "missing_critical_slots",
  ],
};

/**
 * Deterministic Vernacular Fallback Router
 * Runs in < 2ms if external AI API times out or is unreachable.
 */
export function routeCognitiveTurnDeterministic(
  rawText: string,
  lead: any = {}
): MicroIntentResult {
  const norm = normalizeIndicNumerals(rawText || "");
  const lower = norm.toLowerCase().trim();

  // 1. Language Detection
  let detected_language: MicroIntentResult["detected_language"] = "ENGLISH";
  if (/[\u0A80-\u0AFF]/.test(rawText)) {
    detected_language = "GUJARATI_SCRIPT";
  } else if (/[\u0900-\u097F]/.test(rawText)) {
    detected_language = "HINGLISH";
  } else if (/\b(joiye|che|chhe|moklo|nathi|karo|bhai|tamare|aavu|thase|aavi|vechvo|vechvu|vechva|bechvo|bechvu|bechva|maro|mari|potano|potani)\b/i.test(lower)) {
    detected_language = "GUJLISH";
  } else if (/\b(chahiye|karna|hai|hoga|batao|bhejo|dekhna|mera|meri|mujhe|hum|bechna|bechni|bechne)\b/i.test(lower)) {
    detected_language = "HINGLISH";
  }

  // 2. Intent Detection
  const isInOwnerMode = Boolean(
    lead?.state?.startsWith("OWNER_") ||
    lead?.lead_type === "PROVIDER" ||
    lead?.metadata?.active_persona === "SELLER" ||
    lead?.metadata?.awaiting_listing_initiation
  );

  let primary_intent: MicroIntentResult["primary_intent"] = isInOwnerMode ? "SUBMIT_PROPERTY" : "SEARCH_PROPERTY";
  let active_role: MicroIntentResult["active_role"] = isInOwnerMode ? "SELLER" : "BUYER";
  const missing_critical_slots: string[] = [];
  let reset_previous_context = false;
  let user_negated_assumptions = false;
  let side_question: string | null = null;
  let selected_option: number | null = null;

  // Single isolated digit menu choice
  const digitMatch = lower.match(/^([1-4])$/);
  if (digitMatch) {
    selected_option = parseInt(digitMatch[1], 10);
  }

  // Selling Action Check (Inclusive of Gujarati 'bechvo', 'vechvo', 'bechvu', 'vechvu', 'vechvani')
  const hasSellIntent = /(?:bechvo|bechvu|bechva|bechvano|bechvani|bechna|bechni|bechne|vechvo|vechvu|vechva|vechvano|vechvani|vechavo|sell|selling|resale|bikri|list|listing|property\s*list|list\s*property|લિસ્ટ|लिस्ट|વેચવું|વેચવા|વેચવાનો|વેચવાની|બેચવું|બેચવા|બેચવાનો|બેચવાની|बेचना|बेचनी|बेचने|बिक्री|सेल)/i.test(lower);
  const hasBuyIntent = /(?:buy|purchase|kharid|khareed|kharidvu|kharidva|kharidna|lena|leni|lene|chahiye|joiye|joyiye|levu|leva|dekhna|dekhvu|shodhva)/i.test(lower);
  const hasCallIntent = /(?:call\s*karo|call\s*me|call\s*karjo|phone\s*karo|phone\s*karjo|talk\s*to|executive|agent\s*se|baat\s*karni|connect\s*karo)/i.test(lower);
  const hasOptOut = /(?:stop|unsubscribe|mat\s*bhejo|don'?t\s*message|dnd|band\s*karo|nahi\s*chahiye\s*message)/i.test(lower);
  const hasFaq = /(?:rera|loan|sbi|interest|brokerage|commission|map|address|office|location\s*pin|amenities|possession)/i.test(lower);

  // Post-visit Attendance Check (Guarded: NEVER treat owner turns as visit attendance!)
  const isPostVisitState = !lead?.state?.startsWith("OWNER_") && (
    lead?.state === "SITE_VISIT_DONE" ||
    (lead?.state === "SITE_VISIT_BOOKED" && Boolean(lead?.post_visit_feedback_sent)) ||
    lead?.metadata?.last_bot_prompt?.question_type === "VISIT_ATTENDANCE"
  );
  const hasAttended = isPostVisitState && (
    lower === "1" || /\b(?:haan|ha|yes|done|attended|visit\s*ho\s*gayi|visit\s*thai\s*gai|gaya\s*tha|gaya\s*hati)\b/i.test(lower)
  );
  const hasNotAttended = isPostVisitState && (
    lower === "2" || /\b(?:nahi|nhi|na|nathi|missed|nahi\s*ho\s*paayi|nathi\s*thai|ja\s*nathi\s*shakyo)\b/i.test(lower)
  );

  const isAffirmativeListingTurn = /^(?:yes|haan|ha|haa|ji\s*haan|sure|yep|list\s*another|ek\s*aur|dusri|doosri|property\s*list|list\s*karni|list\s*karvi|list\s*karo)\b/i.test(lower.trim());

  if (hasAttended) {
    primary_intent = "VISIT_ATTENDED";
  } else if (hasNotAttended) {
    primary_intent = "VISIT_NOT_ATTENDED";
  } else if (hasOptOut) {
    primary_intent = "OPT_OUT";
  } else if (hasCallIntent) {
    primary_intent = "REQUEST_CALL";
  } else if (isInOwnerMode && isAffirmativeListingTurn) {
    primary_intent = "SUBMIT_PROPERTY";
    active_role = "SELLER";
  } else if (hasSellIntent && hasBuyIntent) {
    primary_intent = "DUAL_ROLE_INTENT";
    active_role = "DUAL_ROLE";
  } else if (hasSellIntent) {
    primary_intent = "SUBMIT_PROPERTY";
    active_role = "SELLER";
  } else if (hasFaq && lower.split(/\s+/).length <= 6) {
    primary_intent = "ASK_FAQ";
    side_question = rawText;
  }
  // Reschedule Visit check
  else if (/\b(change\s*thase|reschedule|change\s*time|time\s*change|badalna|dusra\s*time|kal\s*nahi|date\s*change|nahi\s*aa\s*paunga|late\s*ho\s*jaunga)\b/i.test(lower)) {
    primary_intent = "RESCHEDULE_VISIT";
    const hasDateTime = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|kal|parso|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(?:baje|vage))\b/i.test(lower);
    if (!hasDateTime) {
      missing_critical_slots.push("reschedule_slot");
    }
  }
  // Visit Confirm check
  else if (/^(ha|yes|confirm|done|aavi\s*jaish|pakka|theek\s*hai|ok)\b/i.test(lower) && lead?.state === "SITE_VISIT_PROPOSED") {
    primary_intent = "BOOK_VISIT";
  }
  // Greeting check
  else if (/^(hi|hello|hey|kem\s*cho|namaste|pranam)\b/i.test(lower) && lower.split(/\s+/).length <= 2) {
    primary_intent = "GREETING";
    active_role = "UNKNOWN";
  }
  // Request other property
  else if (!isInOwnerMode && /\b(dusri|other|biji|dusr[iy]|koi\s*aur|aur\s*dikhao|aur\s*options)\b/i.test(lower)) {
    primary_intent = "SEARCH_PROPERTY";
    reset_previous_context = true;
  } else if (selected_option !== null && (lead?.state === "ROLE_SELECTION_PENDING" || lead?.state === "DUAL_ROLE_MENU_PENDING" || lead?.state === "SITE_VISIT_BOOKED")) {
    primary_intent = "SELECT_OPTION";
  }

  // 3. Entity Extraction
  // Location
  let location: string | null = null;
  for (const [vernacular, engLoc] of Object.entries(VERNACULAR_LOCALITY_MAP)) {
    if (rawText.includes(vernacular) || lower.includes(vernacular.toLowerCase())) {
      location = engLoc;
      break;
    }
  }
  if (!location) {
    const latinLocalities = [
      "alkapuri", "gotri", "vasna", "bhayli", "akota", "karelibaug",
      "manjalpur", "harni", "sama", "subhanpura", "atladra", "sayajigunj",
      "gorwa", "sevasi", "bill", "kalali", "tarsali", "waghodia", "waghodia road"
    ];
    for (const loc of latinLocalities) {
      if (new RegExp(`(?:^|\\b)${loc}(?:\\b|$)`, "i").test(lower)) {
        location = loc.charAt(0).toUpperCase() + loc.slice(1);
        break;
      }
    }
  }

  // BHK / Property Type
  let property_type: string | null = null;
  let property_category: MicroIntentResult["entities"]["property_category"] = null;
  let unit_bhk: number | null = null;

  const bhkMatch = lower.match(/(\d)\s*(?:bhk|bedroom|rk)/i);
  if (bhkMatch) {
    unit_bhk = parseInt(bhkMatch[1], 10);
    property_type = `${unit_bhk}BHK Flat`;
    property_category = "RESIDENTIAL";
  } else if (/\b(villa|bungalow|બંગલો|बंगला)\b/i.test(lower)) {
    property_type = "Villa";
    property_category = "RESIDENTIAL";
  } else if (/\b(shop|dukan|દુકાન|दुकान)\b/i.test(lower)) {
    property_type = "Commercial Shop";
    property_category = "COMMERCIAL";
  } else if (/\b(office|ઓફિસ|ऑफिस)\b/i.test(lower)) {
    property_type = "Commercial Office";
    property_category = "COMMERCIAL";
  } else if (/\b(plot|land|jamin|પ્લોટ|जमीन)\b/i.test(lower)) {
    property_type = "Plot";
    property_category = "PLOT_LAND";
  } else if (/\b(flat|apartment|ફ્લેટ|फ्लैट)\b/i.test(lower)) {
    property_type = "Flat";
    property_category = "RESIDENTIAL";
  }

  // Budget
  let budget_max: number | null = null;
  const crMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|crores|કરોડ|करोड़)(?:(?=[^\w])|$)/i);
  const lakhMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:l|lac|lacs|lakh|lakhs|લાખ|लाख)(?:(?=[^\w])|$)/i);
  if (crMatch) {
    budget_max = Math.round(parseFloat(crMatch[1]) * 10000000);
  } else if (lakhMatch) {
    budget_max = Math.round(parseFloat(lakhMatch[1]) * 100000);
  }

  // Possession Timeline
  let possession_timeline: "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | null = null;
  if (property_category === "PLOT_LAND" || property_type === "Plot" || /(plot|land|zameen|jameen)/i.test(property_type || "")) {
    possession_timeline = "READY_TO_MOVE";
  } else if (/\b(ready|rtm|ready\s*to\s*move|turant)\b/i.test(lower)) {
    possession_timeline = "READY_TO_MOVE";
  } else if (/\b(under\s*construction|construction|new\s*launch|upcoming)\b/i.test(lower)) {
    possession_timeline = "UNDER_CONSTRUCTION";
  }

  // Context Reset detection
  if (location && lead?.location && location.toLowerCase() !== lead.location.toLowerCase()) {
    reset_previous_context = true;
  }
  if (budget_max && lead?.budget && budget_max !== lead.budget) {
    reset_previous_context = true;
  }

  const isRentMsg = /\b(rent|bhadu|bhade|kiraya|kiraye|भाड़ा|ભાડે|ભાડુ)\b/i.test(lower);
  const isLeaseMsg = /\b(lease|pattay|લીઝ|लीज़)\b/i.test(lower);
  const isBuyMsg = /\b(buy|purchase|kharid|khareed|lena|leni|खरीदना|લેવું)\b/i.test(lower);

  const determinedTx: "BUY" | "RENT" | "LEASE" | "SELL" | null = hasSellIntent
    ? "SELL"
    : isRentMsg
    ? "RENT"
    : isLeaseMsg
    ? "LEASE"
    : isBuyMsg
    ? "BUY"
    : null;

  const determinedPurpose: "buy" | "rent" | "lease" | "sell" | null = hasSellIntent
    ? "sell"
    : isRentMsg
    ? "rent"
    : isLeaseMsg
    ? "lease"
    : isBuyMsg
    ? "buy"
    : null;

  return {
    primary_intent,
    active_role,
    detected_language,
    reset_previous_context,
    selected_option,
    entities: {
      property_type,
      property_category,
      unit_bhk,
      location,
      budget_max,
      budget_min: null,
      possession_timeline,
      size_area_sqft: null,
      project_or_society: extractSocietyOrProjectName(rawText),
      expected_price_inr: hasSellIntent ? budget_max : null,
      transaction_type: determinedTx,
      purpose: determinedPurpose,
      reschedule_date: null,
      reschedule_time: null,
    },
    side_question,
    missing_critical_slots,
    user_negated_assumptions,
    reasoning: "deterministic_vernacular_fallback",
  };
}

function sanitizeCognitiveResult(res: any): MicroIntentResult {
  if (res && res.entities) {
    const isPlot = res.entities.property_category === "PLOT_LAND" || res.entities.property_type === "Plot" || /(plot|land|zameen|jameen)/i.test(res.entities.property_type || "");
    if (isPlot) {
      res.entities.possession_timeline = "READY_TO_MOVE";
    }
    if (res.entities.project_or_society) {
      const rawProj = String(res.entities.project_or_society).trim();
      if (STOP_WORDS_EXTRACT.has(rawProj.toLowerCase()) || isAllStopWords(rawProj)) {
        res.entities.project_or_society = null;
      }
    }
  }
  return res as MicroIntentResult;
}

export function buildCognitiveLeadContext(lead: any): string {
  const isInOwnerMode = Boolean(
    lead?.state?.startsWith("OWNER_") ||
    lead?.lead_type === "PROVIDER" ||
    lead?.metadata?.active_persona === "SELLER" ||
    lead?.metadata?.awaiting_listing_initiation
  );

  const lastPrompt = lead?.metadata?.last_bot_prompt;
  const lastPromptText = lastPrompt?.text_preview
    ? `"${lastPrompt.text_preview}" (type: ${lastPrompt.question_type || "UNKNOWN"})`
    : "None";

  const knownPropType = isInOwnerMode
    ? (lead?.metadata?.owner_draft?.property_type || lead?.property_type || "None")
    : (lead?.metadata?.seeker_draft?.property_type || lead?.property_type || "None");

  const knownLocation = isInOwnerMode
    ? (lead?.metadata?.owner_draft?.location || lead?.location || "None")
    : (lead?.metadata?.seeker_draft?.location || lead?.location || "None");

  const knownBudgetOrPrice = isInOwnerMode
    ? (lead?.metadata?.owner_draft?.expected_price ? `₹${Number(lead.metadata.owner_draft.expected_price).toLocaleString("en-IN")}` : "None")
    : (lead?.metadata?.seeker_draft?.budget ? `₹${Number(lead.metadata.seeker_draft.budget).toLocaleString("en-IN")}` : lead?.budget ? `₹${Number(lead.budget).toLocaleString("en-IN")}` : "None");

  return `CURRENT CONTEXT:
- Lead Role: ${lead?.lead_type || "UNKNOWN"}
- Active Persona: ${lead?.metadata?.active_persona || (isInOwnerMode ? "SELLER" : "BUYER")}
- Lead State: ${lead?.state || "FRESH"}
- In-Progress Owner Intake: ${isInOwnerMode ? "YES" : "NO"}
- Bot Question Waiting For: ${lastPrompt?.question_type || "NONE"}
- LAST BOT PROMPT: ${lastPromptText}
- Known Property Type: ${knownPropType}
- Known Location: ${knownLocation}
- Known Budget/Price: ${knownBudgetOrPrice}
- Has Active Site Visit: ${lead?.site_visit_booked ? "YES" : "NO"}`;
}

/**
 * Route Cognitive Turn using 3-Tier Multi-Tenant Scaling Pool
 * Tier 1: Google Gemini 2.0 Flash (with Round-Robin Key Pool)
 * Tier 2: Groq Llama 3.3 70B (Instant Hot Fallover)
 * Tier 3: Pure Deterministic Slot Engine (< 2ms offline guarantee)
 */
export async function routeCognitiveTurn(
  messageText: string,
  lead: any = {},
  recentHistory: any[] = [],
  tenantContext: { agencyName?: string; operatingCity?: string; botKnowledge?: any } = {}
): Promise<MicroIntentResult> {
  const normText = normalizeIndicNumerals(messageText || "");

  // Key Pool support for Gemini (comma-separated keys for load distribution)
  const geminiRaw = (
    (typeof Deno !== "undefined" ? Deno.env.get("GEMINI_API_KEY") : process.env.GEMINI_API_KEY) || ""
  );
  const geminiKeys = geminiRaw.split(",").map(k => k.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const geminiKey = geminiKeys.length > 0 ? geminiKeys[Math.floor(Math.random() * geminiKeys.length)] : "";

  const groqKey = (
    (typeof Deno !== "undefined" ? Deno.env.get("GROQ_API_KEY") : process.env.GROQ_API_KEY) || ""
  ).trim().replace(/^["']|["']$/g, "");

  // If no API keys available, immediately run Tier 3
  if (!geminiKey && !groqKey) {
    return routeCognitiveTurnDeterministic(normText, lead);
  }

  const leadContextBlock = buildCognitiveLeadContext(lead);

  const prompt = `You are the lead intelligence perception engine for ${tenantContext.agencyName || "NextGen Realty"} in ${tenantContext.operatingCity || "Vadodara"}.
Analyze the user message and extract strictly valid JSON conforming to MicroIntentResult schema.

### INTENT DEFINITIONS:
- SEARCH_PROPERTY: User wants to buy, rent, or lease property (e.g. "3bhk flat chahiye", "flat lena hai", "office rent par").
- SUBMIT_PROPERTY: User wants to SELL, rent out, or list property they own (e.g. "mare maro juno flat bechvo che", "flat vechvo che", "bechna hai", "ghar bechna hai", "vechvu che", "property list karni hai").
- DUAL_ROLE_INTENT: User mentions BOTH selling old property and buying/renting new one (e.g. "mera 2bhk bechna hai aur 3bhk flat lena hai", "flat bechkar naya ghar dekhna hai").
- SELECT_OPTION: User replies with a single menu choice (e.g. "1", "2", "option 1", "first").
- BOOK_VISIT: User confirms or schedules a visit time (e.g. "Kal 5 baje confirm karo", "Sunday 11 am chalega").
- RESCHEDULE_VISIT: User asks to change visit time or says they cannot come (e.g. "Site visit change thase", "reschedule", "kal nahi aa paunga", "late ho jaunga").
- CANCEL_VISIT: User explicitly cancels visit (e.g. "visit cancel karo", "nahi aana ab").
- VISIT_ATTENDED: User confirms post-visit attendance (e.g. "haan visit ho gayi", "dekh liya project").
- VISIT_NOT_ATTENDED: User confirms post-visit absence (e.g. "nahi ja paaya", "visit nahi ho paayi").
- ASK_FAQ: Side-question about project, RERA, loans, brokerage, office address, map pin.
- REQUEST_CALL: User requests phone call or human agent (e.g. "Kal 5 baje call karo", "Mujhe call karo", "talk to human").
- GREETING: Pure greeting with no criteria (e.g. "Hi", "Hello", "Kem cho", "Namaste").
- OPT_OUT: User opts out (e.g. "Stop", "Don't message", "Mat bhejo", "Not interested").
- OFF_TOPIC: Unrelated chitchat.

### CRITICAL RULES:
1. "bechvo", "bechvu", "vechvo", "vechvu", "bechna", "bechni", "list", "listing" is STRICTLY SUBMIT_PROPERTY (active_role: "SELLER"), NEVER SEARCH_PROPERTY!
2. NEVER map an isolated digit "1", "2", "3" to budget_inr! Single digits are ALWAYS selected_option.
3. Detect detected_language accurately: GUJARATI_SCRIPT, GUJLISH, HINGLISH, or ENGLISH.
4. If property_type is "Plot" or property_category is "PLOT_LAND": possession_timeline MUST be "READY_TO_MOVE" (never "UNDER_CONSTRUCTION", plots have no building construction).
5. If user utterance does not explicitly state "buy", "rent", or "sell", leave transaction_type and purpose as null (do NOT assume BUY). If user states "rent" or "bhade", transaction_type is STRICTLY "RENT".
6. project_or_society should ONLY be extracted if it is a genuine building, residency, or township name (e.g. "Nilamber Bellissimo", "Perl Heights"). NEVER extract pronouns ("usko", "isko"), filler words, or the agency name ("Griham", "Nextgen").
7. DUAL-ROLE & CONTEXT CONTINUITY:
   - When Active Persona is "SELLER" or Lead State is "OWNER_*":
     * Affirmative answers ("yes", "haan", "sure", "ha") or property field answers ("2BHK", "Commercial Shop", "Gotri", "50 lakh", "800 sqft") MUST have active_role: "SELLER" and primary_intent: "SUBMIT_PROPERTY".
     * ONLY switch active_role to "BUYER" if user explicitly demands to search, buy, or rent another property (e.g. "mere liye 3bhk flat dikhao", "flat kharidna hai").
   - When Active Persona is "BUYER" or Lead State is "QUALIFYING" / "OPTIONS_SENT" / "SITE_VISIT_*":
     * Criteria answers ("3BHK", "Alkapuri", "90 lakh", "ready to move") MUST have active_role: "BUYER" and primary_intent: "SEARCH_PROPERTY".
     * ONLY switch active_role to "SELLER" if user explicitly states they want to sell, list, or rent out their own property.
   - When user expresses BOTH intents in a single turn (e.g. "mera 2bhk bechna hai aur 3bhk lena hai"):
     * primary_intent: "DUAL_ROLE_INTENT", active_role: "DUAL_ROLE".

${leadContextBlock}
- User Message: "${normText}"`;

  // TIER 1: Google Gemini 2.0 Flash
  if (geminiKey) {
    const candidateModels = ["gemini-2.0-flash", "gemini-1.5-flash"];
    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 500,
              responseMimeType: "application/json",
              responseSchema: COGNITIVE_TURN_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(2500),
        });

        if (resp.ok) {
          const data = await resp.json();
          const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJson) {
            const parsed = JSON.parse(rawJson);
            if (parsed && parsed.primary_intent && parsed.detected_language) {
              return sanitizeCognitiveResult(parsed);
            }
          }
        }
      } catch (err: any) {
        console.warn(`[CognitiveTurnRouter:Tier1] Gemini ${model} failed (${err.message}) -> Failing over to Tier 2 (Groq)`);
      }
    }
  }

  // TIER 2: Groq Llama 3.3 70B (Instant Hot Fallover)
  if (groqKey) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an expert real estate intent classifier. Output ONLY valid JSON matching the MicroIntentResult schema: " +
                JSON.stringify(COGNITIVE_TURN_SCHEMA),
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed && parsed.primary_intent) {
            return sanitizeCognitiveResult(parsed);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[CognitiveTurnRouter:Tier2] Groq failed (${err.message}) -> Failing over to Tier 3 (Deterministic)`);
    }
  }

  // TIER 3: Pure Deterministic Slot Engine (Zero-Downtime Guarantee)
  return routeCognitiveTurnDeterministic(normText, lead);
}
