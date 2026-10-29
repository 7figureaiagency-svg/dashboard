/**
 * COGNITIVE TURN ROUTER & MULTI-TENANT INTENT DISPATCHER
 * Phase 35.2: Zero-Regex Single-Pass Cognitive Turn Router
 *
 * Replaces legacy brittle regexes with single-pass structured schema parsing.
 * Captures primary intent, language, entities (with Indic script & numeral conversion),
 * context pivots (e.g. Waghodia Road -> Alkapuri), and missing critical slots.
 */

export interface CognitiveTurnResult {
  primary_intent:
    | "SEARCH_PROPERTY"
    | "RESCHEDULE_VISIT"
    | "REQUEST_BROCHURE"
    | "CONFIRM_VISIT"
    | "CANCEL_VISIT"
    | "ASK_FAQ"
    | "SUBMIT_PROPERTY"
    | "GREETING"
    | "GENERAL_QUERY";
  detected_language: "GUJARATI_SCRIPT" | "GUJLISH" | "HINGLISH" | "ENGLISH";
  reset_previous_context: boolean;
  selected_option: number | null;
  entities: {
    property_type: string | null;     // e.g. "3BHK Flat", "Commercial Shop", "Villa"
    property_category: "RESIDENTIAL" | "COMMERCIAL" | "PLOT_LAND" | null;
    location: string | null;          // Normalized English string e.g. "Alkapuri"
    budget_max: number | null;        // Pure numeric integer in INR, e.g. 10000000 for 1 crore
    budget_min: number | null;
    purpose: "buy" | "rent" | "lease" | "sell" | null;
    reschedule_date: string | null;   // e.g. "tomorrow", "2026-10-31"
    reschedule_time: string | null;   // e.g. "5 PM", "11:00 AM"
  };
  missing_critical_slots: string[];   // e.g. ["reschedule_slot"] if user asks to change visit without slot
  reasoning?: string;
}

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

export const COGNITIVE_TURN_SCHEMA = {
  type: "OBJECT",
  properties: {
    primary_intent: {
      type: "STRING",
      enum: [
        "SEARCH_PROPERTY",
        "RESCHEDULE_VISIT",
        "REQUEST_BROCHURE",
        "CONFIRM_VISIT",
        "CANCEL_VISIT",
        "ASK_FAQ",
        "SUBMIT_PROPERTY",
        "GREETING",
        "GENERAL_QUERY",
      ],
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
        location: { type: "STRING", nullable: true },
        budget_max: { type: "INTEGER", nullable: true },
        budget_min: { type: "INTEGER", nullable: true },
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
    missing_critical_slots: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "List of missing slots needed to fulfill intent, e.g. ['reschedule_slot'] if RESCHEDULE_VISIT has no date/time.",
    },
    reasoning: { type: "STRING" },
  },
  required: [
    "primary_intent",
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
): CognitiveTurnResult {
  const norm = normalizeIndicNumerals(rawText || "");
  const lower = norm.toLowerCase().trim();

  // 1. Language Detection
  let detected_language: CognitiveTurnResult["detected_language"] = "ENGLISH";
  if (/[\u0A80-\u0AFF]/.test(rawText)) {
    detected_language = "GUJARATI_SCRIPT";
  } else if (/[\u0900-\u097F]/.test(rawText)) {
    detected_language = "HINGLISH";
  } else if (/\b(joiye|che|chhe|moklo|nathi|karo|bhai|tamare|aavu|thase|aavi)\b/i.test(lower)) {
    detected_language = "GUJLISH";
  } else if (/\b(chahiye|karna|hai|hoga|batao|bhejo|dekhna|mera|meri|mujhe|hum)\b/i.test(lower)) {
    detected_language = "HINGLISH";
  }

  // 2. Intent Detection
  let primary_intent: CognitiveTurnResult["primary_intent"] = "SEARCH_PROPERTY";
  const missing_critical_slots: string[] = [];
  let reset_previous_context = false;

  // Brochure Request check
  if (/\b(brocher|brochure|brochur|pdf|pamphlet|moklo|bhejo|send\s*brochure)\b/i.test(lower) && !/\b(bhk|flat|villa|plot|cr|lakh)\b/i.test(lower)) {
    primary_intent = "REQUEST_BROCHURE";
  }
  // Reschedule Visit check
  else if (/\b(change\s*thase|reschedule|change\s*time|time\s*change|badalna|dusra\s*time|kal\s*nahi|date\s*change)\b/i.test(lower)) {
    primary_intent = "RESCHEDULE_VISIT";
    const hasDateTime = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|kal|parso|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(?:baje|vage))\b/i.test(lower);
    if (!hasDateTime) {
      missing_critical_slots.push("reschedule_slot");
    }
  }
  // Visit Confirm check
  else if (/^(ha|yes|confirm|done|aavi\s*jaish|pakka|theek\s*hai|ok)\b/i.test(lower) && lead?.state === "SITE_VISIT_PROPOSED") {
    primary_intent = "CONFIRM_VISIT";
  }
  // Greeting check
  else if (/^(hi|hello|hey|kem\s*cho|namaste|pranam)\b/i.test(lower) && lower.split(/\s+/).length <= 2) {
    primary_intent = "GREETING";
  }
  // Request other property
  else if (/\b(dusri|other|biji|dusr[iy]|koi\s*aur)\b/i.test(lower)) {
    primary_intent = "SEARCH_PROPERTY";
    reset_previous_context = true;
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
  let property_category: CognitiveTurnResult["entities"]["property_category"] = null;
  const bhkMatch = lower.match(/(\d)\s*(?:bhk|bedroom)/i);
  if (bhkMatch) {
    property_type = `${bhkMatch[1]}BHK Flat`;
    property_category = "RESIDENTIAL";
  } else if (/\b(villa|bungalow|બંગલો)\b/i.test(lower)) {
    property_type = "Villa";
    property_category = "RESIDENTIAL";
  } else if (/\b(shop|dukan|દુકાન)\b/i.test(lower)) {
    property_type = "Commercial Shop";
    property_category = "COMMERCIAL";
  } else if (/\b(office|ઓફિસ)\b/i.test(lower)) {
    property_type = "Commercial Office";
    property_category = "COMMERCIAL";
  } else if (/\b(plot|land|jamin|પ્લોટ)\b/i.test(lower)) {
    property_type = "Plot";
    property_category = "PLOT_LAND";
  }

  // Budget
  let budget_max: number | null = null;
  // Crore match (Unicode safe regex)
  const crMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|crores|કરોડ|करोड़)(?:(?=[^\w])|$)/i);
  // Lakh match
  const lakhMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:l|lac|lacs|lakh|lakhs|લાખ|लाख)(?:(?=[^\w])|$)/i);
  if (crMatch) {
    budget_max = Math.round(parseFloat(crMatch[1]) * 10000000);
  } else if (lakhMatch) {
    budget_max = Math.round(parseFloat(lakhMatch[1]) * 100000);
  }

  // Context Reset detection
  if (location && lead?.location && location.toLowerCase() !== lead.location.toLowerCase()) {
    reset_previous_context = true;
  }
  if (budget_max && lead?.budget && budget_max !== lead.budget) {
    reset_previous_context = true;
  }

  return {
    primary_intent,
    detected_language,
    reset_previous_context,
    selected_option: null,
    entities: {
      property_type,
      property_category,
      location,
      budget_max,
      budget_min: null,
      purpose: /\b(rent|bhadu|भाड़ा)\b/i.test(lower) ? "rent" : "buy",
      reschedule_date: null,
      reschedule_time: null,
    },
    missing_critical_slots,
    reasoning: "deterministic_vernacular_fallback",
  };
}

/**
 * Route Cognitive Turn using Gemini 2.0 Flash / Groq LLM with Strict Schema
 */
export async function routeCognitiveTurn(
  messageText: string,
  lead: any = {},
  recentHistory: any[] = [],
  tenantContext: { agencyName?: string; operatingCity?: string; botKnowledge?: any } = {}
): Promise<CognitiveTurnResult> {
  const normText = normalizeIndicNumerals(messageText || "");
  const geminiKey = (
    (typeof Deno !== "undefined" ? Deno.env.get("GEMINI_API_KEY") : process.env.GEMINI_API_KEY) || ""
  ).trim().replace(/^["']|["']$/g, "");

  const groqKey = (
    (typeof Deno !== "undefined" ? Deno.env.get("GROQ_API_KEY") : process.env.GROQ_API_KEY) || ""
  ).trim().replace(/^["']|["']$/g, "");

  // If no keys available, run deterministic fallback
  if (!geminiKey && !groqKey) {
    return routeCognitiveTurnDeterministic(normText, lead);
  }

  const prompt = `You are the lead intelligence router for ${tenantContext.agencyName || "NextGen Realty"} in ${tenantContext.operatingCity || "Vadodara"}.
Parse this user message and determine:
1. primary_intent: SEARCH_PROPERTY, RESCHEDULE_VISIT, REQUEST_BROCHURE, CONFIRM_VISIT, CANCEL_VISIT, ASK_FAQ, SUBMIT_PROPERTY, GREETING, or GENERAL_QUERY.
2. detected_language: GUJARATI_SCRIPT (if Gujarati script characters used), GUJLISH (colloquial Roman Gujarati), HINGLISH, or ENGLISH.
3. reset_previous_context: true if user is starting a fresh search, asking to see other properties, or explicitly specifying a different location or budget than previously stored.
4. selected_option: ONLY integer 1, 2, or 3 if user explicitly chooses Option 1/2/3 from a list. NEVER set if '1' is part of budget ('1 crore', '1 cr', '૧ કરોડ') or '3' is BHK ('3bhk', '3 bhk', '૩bhk').
5. entities:
   - property_type: normalized (e.g. '3BHK Flat', '2BHK Flat', 'Commercial Shop', 'Villa')
   - location: normalized English name (e.g. 'Alkapuri', 'Gotri', 'Vasna', 'Waghodia Road'). If user writes in Gujarati script (e.g. 'અલકાપુરી'), map to English 'Alkapuri'!
   - budget_max: integer in INR. '1 કરોડ' or '1 cr' -> 10000000; '50 લાખ' -> 5000000.
6. missing_critical_slots: array of missing information needed. If user wants to reschedule (e.g. 'Site visit change thase') but didn't provide new date or time, add 'reschedule_slot'!

CURRENT CONTEXT:
- Lead Stored Location: ${lead?.location || "None"}
- Lead Stored Budget: ${lead?.budget || "None"}
- Lead State: ${lead?.state || "FRESH"}
- User Message: "${normText}"`;

  // 1. Try Gemini 2.0 Flash
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
              maxOutputTokens: 600,
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
              return parsed as CognitiveTurnResult;
            }
          }
        }
      } catch (err: any) {
        console.warn(`[CognitiveTurnRouter] Gemini ${model} failed:`, err.message);
      }
    }
  }

  // 2. Try Groq Llama 3.3 70B
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
                "You are a structured real estate intent router. Respond ONLY with a valid JSON matching CognitiveTurnResult schema.",
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
            return parsed as CognitiveTurnResult;
          }
        }
      }
    } catch (err: any) {
      console.warn("[CognitiveTurnRouter] Groq failed:", err.message);
    }
  }

  // Fallback
  return routeCognitiveTurnDeterministic(normText, lead);
}
