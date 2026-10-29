/**
 * MULTILINGUAL SYNTHESIZER MODULE
 * Phase 33.3 / Phase 33.4: Universal Multilingual Dynamic Synthesizer
 *
 * Maintains persistent language profiles (22 Indian languages) and synthesizes
 * dialect-authentic, culturally appropriate WhatsApp responses via Google Gemini 2.5 Flash
 * with Groq Llama-3.3-70b and curated regional templates as fallbacks.
 */

export interface LanguageProfile {
  primary_language: string; // e.g. "Hindi", "Gujarati", "Marathi", "English", "Tamil", "Telugu"
  language_code: string;    // e.g. "hi-IN", "gu-IN", "mr-IN", "en-IN", "ta-IN", "te-IN"
  dialect: string;          // e.g. "Hinglish", "Gujlish", "Pure Gujarati", "Devanagari Hindi", "Marathi"
  script: "Latin" | "Devanagari" | "Gujarati" | "Other";
  formality: "POLITE_RESPECTFUL" | "CASUAL" | "FORMAL";
  detected_at: string;
}

export interface SynthesizeReplyParams {
  goal: string;
  lead?: any;
  contextData?: {
    matchedInventory?: any[];
    availableSlots?: string[];
    brochureUrl?: string;
    mapUrl?: string;
    propertySummary?: string;
    options?: string[];
    [key: string]: any;
  };
  languageProfile?: Partial<LanguageProfile> | null;
  agencyBranding?: {
    agencyName?: string;
    city?: string;
    contactNumber?: string;
  };
  fallbackTemplate?: string;
  fetchFn?: typeof fetch;
}

export function normalizeGujaratiDigits(text: string): string {
  if (!text) return "";
  return text
    .replace(/૧/g, "1")
    .replace(/૨/g, "2")
    .replace(/૩/g, "3")
    .replace(/૪/g, "4")
    .replace(/૫/g, "5")
    .replace(/૬/g, "6")
    .replace(/૭/g, "7")
    .replace(/૮/g, "8")
    .replace(/૯/g, "9")
    .replace(/૦/g, "0");
}

export function normalizeIndicDigits(text: string): string {
  const indicDigits: Record<string, string> = {
    "૦": "0", "૧": "1", "૨": "2", "૩": "3", "૪": "4",
    "૫": "5", "૬": "6", "૭": "7", "૮": "8", "૯": "9",
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
  };
  const str = typeof text === "string" ? text : (text?.text || text?.body || (text != null ? String(text) : ""));
  return str.replace(/[૦-૯०-९]/g, (d: string) => indicDigits[d] || d);
}

/**
 * Maintains lead dialect and script preferences across 22 scheduled Indian languages.
 * Handles seamless dynamic language switching while preserving continuity on short tokens.
 */
export function computeUpdatedLanguageProfile(
  detectedLanguage: Partial<any> | undefined,
  currentLead: any,
  messageText: string
): LanguageProfile {
  const existingProfile: LanguageProfile | undefined = currentLead?.metadata?.language_profile;
  const normalized = normalizeIndicDigits(normalizeGujaratiDigits(messageText || ""));
  const lower = normalized.toLowerCase().trim();

  // Guard against flipping on isolated numbers ("1", "2", "3", "1bhk") or universal short tokens/greetings
  const isGreetingOrShortToken =
    /^(?:hi|hello|hey|namaste|kem cho|pranam|namaskar|start|restart|fresh|naya|ok|okay|k|1|2|3|4|5|done|yes|ha|haan|theek|saras)$/i.test(lower) ||
    lower.split(/\s+/).length <= 1;

  if (existingProfile && isGreetingOrShortToken) {
    return existingProfile;
  }

  // Derive primary_language, code, dialect, script, and formality
  let primaryLang = detectedLanguage?.primary_language || "";
  let code = detectedLanguage?.code || "";
  let dialect = detectedLanguage?.dialect || "";
  let script: "Latin" | "Devanagari" | "Gujarati" | "Other" = detectedLanguage?.script || "Latin";
  let formality: "POLITE_RESPECTFUL" | "CASUAL" | "FORMAL" = detectedLanguage?.formality || "POLITE_RESPECTFUL";

  // Vernacular heuristics & normalization
  if (/[\u0A80-\u0AFF]/.test(normalized)) {
    script = "Gujarati";
    primaryLang = "Gujarati";
    code = "gu-IN";
    dialect = "Pure Gujarati";
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
  } else if (/[\u0900-\u097F]/.test(normalized)) {
    script = "Devanagari";
    if (
      detectedLanguage?.primary_language === "Marathi" ||
      detectedLanguage?.dialect?.toLowerCase().includes("marathi") ||
      /(?:मला|पाहिजे|आहे|विकायचे|विकणे|किती|दाखवा|भाड्याने|माला|mala|pahije|aahe|vikayche|vikne|kiti|dakhva)/i.test(lower)
    ) {
      primaryLang = "Marathi";
      code = "mr-IN";
      dialect = "Marathi";
    } else {
      primaryLang = "Hindi";
      code = "hi-IN";
      dialect = "Devanagari Hindi";
    }
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
    } else if (primaryLang) {
      // Keep existing primaryLang if set
    } else if (existingProfile?.primary_language && !hasHinLex) {
      return existingProfile;
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

  return {
    primary_language: primaryLang || "Hindi",
    language_code: code || "hi-IN",
    dialect: dialect || "Hinglish",
    script: script || "Latin",
    formality: formality,
    detected_at: new Date().toISOString(),
  };
}

export function buildSynthesizerPrompt(params: SynthesizeReplyParams): string {
  const { goal, lead, contextData, languageProfile, agencyBranding } = params;
  const agencyName = agencyBranding?.agencyName || "NextGen Realty";
  const city = agencyBranding?.city || "Vadodara";
  const primaryLang = languageProfile?.primary_language || "Hindi";
  const dialect = languageProfile?.dialect || (primaryLang === "Gujarati" ? "Gujlish" : "Hinglish");
  const script = languageProfile?.script || "Latin";
  const formality = languageProfile?.formality || "POLITE_RESPECTFUL";
  const userName = lead?.name && lead.name !== "Unknown" ? lead.name : "";

  let contextSnippet = "";
  if (contextData) {
    if (contextData.propertySummary) {
      contextSnippet += `\n- Property Details: ${contextData.propertySummary}`;
    }
    if (Array.isArray(contextData.options) && contextData.options.length > 0) {
      contextSnippet += `\n- Numbered Options:\n${contextData.options.map((opt, i) => `  ${i + 1}. ${opt}`).join("\n")}`;
    }
    if (Array.isArray(contextData.availableSlots) && contextData.availableSlots.length > 0) {
      contextSnippet += `\n- Available Visit Slots: ${contextData.availableSlots.join(", ")}`;
    }
    if (contextData.brochureUrl) {
      contextSnippet += `\n- Brochure Link: ${contextData.brochureUrl}`;
    }
    if (contextData.mapUrl) {
      contextSnippet += `\n- Location Map: ${contextData.mapUrl}`;
    }
  }

  return `You are an elite, highly professional real estate advisor for ${agencyName} in ${city}.
Generate a conversational, warm, and concise reply (strictly <= 4 lines, formatted for WhatsApp) fulfilling this exact goal:
"${goal}"

### RECIPIENT CONTEXT:
- Recipient Name: ${userName ? userName : "Valued Client"}
- Role: ${lead?.lead_type || lead?.metadata?.active_persona || "Client"}${contextSnippet}

### LINGUISTIC & DIALECT SPECIFICATIONS:
- Primary Language: Strictly write in ${primaryLang}.
- Dialect: Strictly write in ${dialect}.
- Script: Strictly use ${script} script.
  * If script is "Gujarati", output genuine Gujarati text (ગુજરાતી લિપિ).
  * If script is "Devanagari", output Devanagari text (देवनागरी लिपि) for Hindi or Marathi.
  * If script is "Latin" and dialect is "Gujlish", write conversational phonetic Gujlish (e.g. "Namaste ji! Alkapuri ma 1BHK Tenement mate tamari expected price shu chhe?").
  * If script is "Latin" and dialect is "Hinglish", write natural conversational Hinglish.
  * If language is "English", write professional English.
- Formality: ${formality === "POLITE_RESPECTFUL" ? "Respectful Indian hospitality (use respectful honorifics like 'ji', 'aap', 'tame')" : "Warm and courteous"}.
- Formatting: Clean WhatsApp typography. Use <b>bolding</b> for key figures, project names, or options. Do NOT use markdown code blocks, backticks, or hashtags.

### STRICT REAL ESTATE DOMAIN INVARIANTS:
1. Never hallucinate prices, configurations, or inventory not provided in the goal or context data.
2. Use standard Indian real estate conventions (BHK, Lakh, Crore, Carpet Area, Sq. Ft.).
3. If numbered options are provided, keep them clearly numbered so the user can easily reply with 1, 2, or 3.
4. Keep the response under 4 lines total. Be direct, helpful, and polite.`;
}

export function getCuratedRegionalFallback(
  goal: string,
  languageProfile?: Partial<LanguageProfile> | null,
  agencyName = "NextGen Realty",
  fallbackTemplate?: string
): string {
  if (fallbackTemplate && fallbackTemplate.trim()) {
    return fallbackTemplate.trim();
  }

  const lang = (languageProfile?.primary_language || "").toLowerCase();
  const dialect = (languageProfile?.dialect || "").toLowerCase();
  const script = languageProfile?.script || "Latin";

  if (lang.includes("guj") || dialect.includes("guj")) {
    if (script === "Gujarati") {
      return `નમસ્તે! ${agencyName} માં આપનું સ્વાગત છે. તમારી જરૂરિયાત નોંધી લીધી છે. વિગતો માટે અમારા એડવાઈઝર ટૂંક સમયમાં સંપર્ક કરશે. 🙏`;
    }
    return `Namaste! ${agencyName} ma aapnu swagat chhe. Tamari requirement nondhi lidhi chhe. Amari team jald thi aapse contact karshe. 🙏`;
  }
  if (lang.includes("marathi") || dialect.includes("marathi")) {
    if (script === "Devanagari") {
      return `नमस्कार! ${agencyName} मध्ये आपले स्वागत आहे. तुमची माहिती नोंदवून घेतली आहे. आमची टीम लवकरच आपल्याशी संपर्क करेल. 🙏`;
    }
    return `Namaskar! ${agencyName} madhye aple swagat aahe. Tumchi requirement nondavli aahe. Aamchi team lavkarach aapyashi sampark karel. 🙏`;
  }
  if (lang.includes("tamil") || dialect.includes("tamil")) {
    return `Vanakkam! ${agencyName}-il ungalai varaverkirom. Ungal thevaigalai padivu seidhom. Engal kulu viraivil ungalai thodarbu kollum. 🙏`;
  }
  if (lang.includes("telugu") || dialect.includes("telugu")) {
    return `Namaskaram! ${agencyName} ki swagatham. Mee requirement record chesam. Ma team tvaralo mimmalni contact chestundi. 🙏`;
  }
  if (lang.includes("eng") || dialect.includes("eng")) {
    return `Hello! Welcome to ${agencyName}. We have noted your requirement and our real estate team will connect with you shortly. 🙏`;
  }
  // Default Hinglish / Hindi
  if (script === "Devanagari") {
    return `नमस्ते! ${agencyName} में आपका स्वागत है। आपकी आवश्यकता नोट कर ली गई है। हमारी टीम जल्द ही आपसे संपर्क करेगी। 🙏`;
  }
  return `Namaste! ${agencyName} me aapka swagat hai. Aapki requirement note kar li gayi hai. Hamari team jald hi aapse connect karegi. 🙏`;
}

export function sanitizeGeneratedReply(text: string): string {
  let clean = text.replace(/^```(?:markdown)?\n?/i, "").replace(/```$/g, "").trim();
  clean = clean.replace(/^["']|["']$/g, "").trim();
  return clean;
}

export async function synthesizeMultilingualReply(params: SynthesizeReplyParams): Promise<string> {
  const fetchFn = params.fetchFn || fetch;
  const agencyName = params.agencyBranding?.agencyName || "NextGen Realty";

  // Clean / prepare API keys
  let geminiKey = "";
  let groqKey = "";
  try {
    if (typeof Deno !== "undefined" && Deno.env) {
      geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
      groqKey = Deno.env.get("GROQ_API_KEY") || "";
    }
  } catch (_) {}
  if (!geminiKey && typeof process !== "undefined" && process.env) {
    geminiKey = process.env.GEMINI_API_KEY || "";
  }
  if (!groqKey && typeof process !== "undefined" && process.env) {
    groqKey = process.env.GROQ_API_KEY || "";
  }
  geminiKey = geminiKey.trim().replace(/^["']|["']$/g, "");
  groqKey = groqKey.trim().replace(/^["']|["']$/g, "");

  const promptText = buildSynthesizerPrompt(params);

  // 1. Google Gemini 2.0 Flash Primary (~150-300ms)
  if (geminiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const res = await fetchFn(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 250,
          },
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok) {
        const data = await res.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (generatedText && generatedText.length > 5) {
          return sanitizeGeneratedReply(generatedText);
        }
      }
    } catch (geminiErr: any) {
      console.warn("[Synthesizer] Gemini 2.0 Flash call failed:", geminiErr.message);
    }
  }

  // 2. Groq Llama-3.3-70b Fallback (~200ms)
  if (groqKey) {
    try {
      const groqUrl = "https://api.groq.com/openai/v1/chat/completions";
      const groqRes = await fetchFn(groqUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.3,
          max_tokens: 250,
          messages: [
            {
              role: "system",
              content: `You are an elite real estate advisor for ${agencyName}. Write concise WhatsApp replies under 4 lines adhering strictly to the user's language, dialect, and script.`,
            },
            {
              role: "user",
              content: promptText,
            },
          ],
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const text = groqData.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 5) {
          return sanitizeGeneratedReply(text);
        }
      }
    } catch (groqErr: any) {
      console.warn("[Synthesizer] Groq fallback failed:", groqErr.message);
    }
  }

  // 3. Curated Regional Fallback Template
  return getCuratedRegionalFallback(params.goal, params.languageProfile, agencyName, params.fallbackTemplate);
}
