// Comprehensive End-to-End Simulation Test Harness for Phase 33:
// Autonomous Universal Multimodal Real Estate Agent & Bulletproof Cognitive Engine
const assert = require("assert");
const fs = require("fs");
const ts = require("typescript");

console.log("==========================================================================");
console.log("=== RUNNING PHASE 33 COMPREHENSIVE E2E MULTIMODAL VERIFICATION SUITE ===");
console.log("==========================================================================\n");

// -----------------------------------------------------------------------------
// Module Transpilation & Loading
// -----------------------------------------------------------------------------
function loadTsModule(relativePath) {
  const code = fs.readFileSync(relativePath, "utf8");
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const m = { exports: {} };
  const customRequire = (id) => {
    if (id.startsWith("./")) {
      const fullPath = "supabase/functions/realtor-lead-engine/" + id.replace("./", "");
      return loadTsModule(fullPath);
    }
    return require(id);
  };
  const fn = new Function("exports", "require", "module", "process", transpiled);
  fn(m.exports, customRequire, m, process);
  return m.exports;
}

console.log("--- Loading Modular Architecture Submodules ---");
const voiceDecoder = loadTsModule("supabase/functions/realtor-lead-engine/voice_decoder.ts");
const cognitiveExtractor = loadTsModule("supabase/functions/realtor-lead-engine/cognitive_extractor.ts");
const multilingualSynthesizer = loadTsModule("supabase/functions/realtor-lead-engine/multilingual_synthesizer.ts");
const verifierGate = loadTsModule("supabase/functions/realtor-lead-engine/verifier_gate.ts");
console.log("✓ All 4 submodules loaded with 0 import errors (100%)\n");

async function runE2eTestSuite() {
  // ---------------------------------------------------------------------------
  // Suite 1: Multimodal Voice Note Ingestion Engine
  // ---------------------------------------------------------------------------
  console.log("--- Suite 1: Multimodal Voice Note Ingestion Engine ---");

  // A. Inaudible recovery across 3 languages
  const inaudibleGuj = voiceDecoder.getVoiceInaudibleReply("GUJLISH");
  assert.ok(inaudibleGuj.includes("Tamaro voice note"), "Must return authentic Gujlish inaudible notice");
  const inaudibleHin = voiceDecoder.getVoiceInaudibleReply("HINGLISH");
  assert.ok(inaudibleHin.includes("Aapka voice note"), "Must return authentic Hinglish inaudible notice");
  const inaudibleEng = voiceDecoder.getVoiceInaudibleReply("ENGLISH");
  assert.ok(inaudibleEng.includes("couldn't clearly hear"), "Must return authentic English inaudible notice");
  console.log("✓ Empathetic inaudible voice recovery verified across 3 linguistic dialects");

  // B. Base64 audio conversion
  const dummyAudio = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]); // OggS header
  const base64Audio = voiceDecoder.uint8ArrayToBase64(dummyAudio);
  assert.strictEqual(base64Audio, "T2dnUwAC", "Must correctly encode binary audio buffer to base64");
  console.log("✓ Binary audio buffer conversion verified");

  // C. Audio buffer null safety
  const emptyRes = await voiceDecoder.transcribeAudioBuffer(new Uint8Array(0), "audio/ogg");
  assert.strictEqual(emptyRes.provider, "NONE", "Empty audio must return provider: NONE");
  console.log("✓ Empty audio buffer guard verified (100%)\n");

  // ---------------------------------------------------------------------------
  // Suite 2: Zero-Regex Cognitive Intent & Entity Extractor
  // ---------------------------------------------------------------------------
  console.log("--- Suite 2: Zero-Regex Cognitive Intent & Entity Extractor ---");

  // Case 1: Tricky Vernacular Tenement Utterance ("1bhk ternament")
  const tenementExtracted = cognitiveExtractor.runDeterministicCognitiveExtractor(
    "Mane Gotri ma 1bhk ternament joiye che 40 lakh ma"
  );
  assert.strictEqual(tenementExtracted.entities.property_type, "TENEMENT", "ternament must map to TENEMENT");
  assert.strictEqual(tenementExtracted.entities.location_name, "Gotri", "Location must be Gotri, not tenement");
  assert.strictEqual(tenementExtracted.entities.unit_bhk, 1, "unit_bhk must be 1");
  assert.strictEqual(tenementExtracted.entities.budget_inr, 4000000, "Budget must be 40 Lakhs");
  console.log("✓ Case 1: '1bhk ternament' successfully disambiguated from society/project");

  // Case 2: Role Negation & Seller Correction ("shop bechni he lena nahi")
  const sellerExtracted = cognitiveExtractor.runDeterministicCognitiveExtractor(
    "bhai shop bechni he lena nahi hai mujhko"
  );
  assert.strictEqual(sellerExtracted.lead_role, "SELLER", "Lead role must be SELLER");
  assert.strictEqual(sellerExtracted.primary_intent, "NEGATION_CORRECTION", "Intent must be NEGATION_CORRECTION");
  assert.strictEqual(sellerExtracted.user_negated_assumptions, true, "user_negated_assumptions must be true");
  assert.strictEqual(sellerExtracted.entities.property_type, "SHOP", "Property type must be SHOP");
  console.log("✓ Case 2: 'shop bechni he lena nahi' correctly detected seller negation without buyer trap");

  // Case 3: Post-Visit Attendance Numeric Disambiguation ("2" -> Reschedule)
  const attendanceExtracted = cognitiveExtractor.runDeterministicCognitiveExtractor(
    "2",
    { state: "SITE_VISIT_DONE" },
    { question_type: "VISIT_ATTENDANCE" }
  );
  assert.strictEqual(attendanceExtracted.selected_menu_option, 2, "Menu option must be 2");
  assert.strictEqual(attendanceExtracted.primary_intent, "RESCHEDULE_VISIT", "Intent must be RESCHEDULE_VISIT");
  console.log("✓ Case 3: '2' in visit attendance turn correctly routes to RESCHEDULE_VISIT (100%)\n");

  // ---------------------------------------------------------------------------
  // Suite 3: Universal Multilingual Dynamic Synthesizer
  // ---------------------------------------------------------------------------
  console.log("--- Suite 3: Universal Multilingual Dynamic Synthesizer ---");

  // Dialect continuity invariant
  const initialLead = {
    metadata: {
      language_profile: {
        primary_language: "Gujarati",
        language_code: "gu-IN",
        dialect: "Gujlish",
        script: "Latin",
        formality: "POLITE_RESPECTFUL",
      },
    },
  };

  const shortTokenProfile = multilingualSynthesizer.computeUpdatedLanguageProfile(
    { primary_language: "English", code: "en-IN" },
    initialLead,
    "2"
  );
  assert.strictEqual(shortTokenProfile.dialect, "Gujlish", "Short token '2' must preserve existing Gujlish profile");

  const englishProfile = multilingualSynthesizer.computeUpdatedLanguageProfile(
    { primary_language: "English", code: "en-IN" },
    initialLead,
    "Could you please share with me the complete brochure in English?"
  );
  assert.strictEqual(englishProfile.dialect, "English", "Explicit English sentence must switch profile to English");
  console.log("✓ Dialect continuity invariant and dynamic switching verified");

  // Regional fallback coverage
  const gujFallback = multilingualSynthesizer.getCuratedRegionalFallback("Send greeting", { primary_language: "Gujarati", script: "Gujarati" });
  assert.ok(gujFallback.includes("નમસ્તે"), "Must produce authentic Gujarati script fallback");
  const marFallback = multilingualSynthesizer.getCuratedRegionalFallback("Send greeting", { primary_language: "Marathi", script: "Devanagari" });
  assert.ok(marFallback.includes("नमस्कार"), "Must produce authentic Marathi Devanagari fallback");
  console.log("✓ Regional fallback templates verified across regional Indic languages (100%)\n");

  // ---------------------------------------------------------------------------
  // Suite 4: Pre-Flight Self-Correction Gate
  // ---------------------------------------------------------------------------
  console.log("--- Suite 4: Pre-Flight Self-Correction Gate ---");

  // 1. Contradiction auto-correction
  const contradictionCheck = await verifierGate.verifyOutboundReply({
    userMessage: "meri shop bechni hai",
    proposedReply: "Aapko konsi property kharidni hai?",
    leadState: "FRESH",
  });
  assert.strictEqual(contradictionCheck.isValid, false, "Must fail contradiction check");
  assert.ok(contradictionCheck.correctedReply.includes("bechne"), "Corrected reply must address selling");
  console.log("✓ Contradiction invariant: seller input with buyer reply auto-corrected");

  // 2. Redundancy auto-correction
  const redundancyCheck = await verifierGate.verifyOutboundReply({
    userMessage: "Alkapuri me 3bhk flat chahiye",
    proposedReply: "Ji! Aapko konsi location me property chahiye?",
    extractedIntent: { entities: { location_name: "Alkapuri", property_type: "FLAT" } },
    leadState: "QUALIFYING",
  });
  assert.strictEqual(redundancyCheck.isValid, false, "Must fail redundancy check");
  assert.ok(redundancyCheck.correctedReply.includes("budget"), "Corrected reply must advance to budget");
  console.log("✓ Redundancy invariant: location already provided auto-advances to budget");

  // 3. Hallucination sanitization
  const hallucinationCheck = await verifierGate.verifyOutboundReply({
    userMessage: "Returns kya milenge?",
    proposedReply: "We give 100% guarantee double your money in 2 years!",
  });
  assert.strictEqual(hallucinationCheck.isValid, false, "Must fail hallucination check");
  assert.ok(!hallucinationCheck.correctedReply.includes("100% guarantee"), "Corrected reply must strip false guarantee");
  console.log("✓ Hallucination invariant: false financial guarantees intercepted and sanitized");

  // 4. HTML tag auto-balance
  const htmlCheck = await verifierGate.verifyOutboundReply({
    userMessage: "Hi",
    proposedReply: "Namaste <b>Manthan ji! Kaise hain aap?",
  });
  assert.strictEqual(htmlCheck.isValid, false, "Must detect unclosed <b> tag");
  assert.ok(htmlCheck.correctedReply.includes("</b>"), "Corrected reply must balance HTML tags");
  console.log("✓ HTML syntax invariant: unclosed tags balanced for Telegram API safety");

  // 5. Compliant clean reply
  const cleanPass = await verifierGate.verifyOutboundReply({
    userMessage: "Looking for 3BHK in Gotri",
    proposedReply: "Hello! We have noted your interest in a <b>3BHK Flat</b> in <b>Gotri</b>. What is your approximate budget? 🏡",
  });
  assert.strictEqual(cleanPass.isValid, true, "Clean reply must pass with isValid: true");
  console.log("✓ Compliant reply passed untouched (100%)\n");

  console.log("==========================================================================");
  console.log("=== ALL 4 PHASE 33 COMPREHENSIVE E2E TEST SUITES PASSED (100%) ===");
  console.log("==========================================================================");
}

runE2eTestSuite().catch(err => {
  console.error("E2E Test Failure:", err);
  process.exit(1);
});
