// Comprehensive Unit & Invariant Test Suite for Plan 33.4:
// Pre-Flight Self-Correction Gate (verifier_gate.ts)
const assert = require("assert");
const fs = require("fs");

console.log("========================================================================");
console.log("=== RUNNING PLAN 33.4 PRE-FLIGHT VERIFIER GATE TEST SUITE ===");
console.log("========================================================================\n");

// 1. Verify exports in verifier_gate.ts and index.ts
console.log("--- Test 1: Function & Interface Exports Verification ---");
const verifierCode = fs.readFileSync("supabase/functions/realtor-lead-engine/verifier_gate.ts", "utf8");
const indexCode = fs.readFileSync("supabase/functions/realtor-lead-engine/index.ts", "utf8");

assert.ok(verifierCode.includes("export function checkContradiction"), "checkContradiction must be exported");
assert.ok(verifierCode.includes("export function checkRedundancy"), "checkRedundancy must be exported");
assert.ok(verifierCode.includes("export function checkHallucination"), "checkHallucination must be exported");
assert.ok(verifierCode.includes("export function checkPolicyAndCompliance"), "checkPolicyAndCompliance must be exported");
assert.ok(verifierCode.includes("export async function verifyOutboundReply"), "verifyOutboundReply must be exported");
assert.ok(indexCode.includes('import { verifyOutboundReply } from "./verifier_gate.ts";'), "index.ts must import verifyOutboundReply");
assert.ok(indexCode.includes('export * from "./verifier_gate.ts";'), "index.ts must re-export verifier_gate");
assert.ok(indexCode.includes("preflightVerification = await verifyOutboundReply"), "index.ts must call verifyOutboundReply before dispatch");
console.log("✓ Export and dispatch wiring assertions passed (100%)\n");

const ts = require("typescript");

function loadVerifierModule() {
  const transpiled = ts.transpileModule(verifierCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const m = { exports: {} };
  const customRequire = (id) => require(id);
  const fn = new Function("exports", "require", "module", "process", transpiled);
  fn(m.exports, customRequire, m, process);
  return m.exports;
}

const verifier = loadVerifierModule();

async function runTestSuite() {
  // ---------------------------------------------------------------------------
  // Test 2: Invariant 1 - Contradiction Detection & Correction
  // ---------------------------------------------------------------------------
  console.log("--- Test 2: Invariant 1 - Contradiction Detection & Auto-Correction ---");

  // Case A: Seller intent with buyer question
  const sellerContradictionResult = await verifier.verifyOutboundReply({
    userMessage: "Muje meri shop bechni he, Vadodara me",
    proposedReply: "Ji namaste! Aapko konsi property kharidni hai ya leni hai?",
    leadState: "FRESH",
    languageProfile: { dialect: "HINGLISH" },
  });

  assert.strictEqual(sellerContradictionResult.isValid, false, "Must fail contradiction check");
  assert.ok(sellerContradictionResult.reason.includes("CONTRADICTION"), "Reason must cite CONTRADICTION");
  assert.ok(sellerContradictionResult.correctedReply.includes("bechne"), "Corrected reply must focus on selling");
  console.log("✓ Case A: Seller contradiction caught and auto-corrected to seller intake");

  // Case B: Cannot attend visit contradiction
  const cannotAttendResult = await verifier.verifyOutboundReply({
    userMessage: "Bhai mai kal nahi aa sakta emergency hai",
    proposedReply: "Aapka visit confirm ho gaya hai! Milte hain site par kal 11 baje.",
    leadState: "SITE_VISIT_BOOKED",
    languageProfile: { dialect: "HINGLISH" },
  });

  assert.strictEqual(cannotAttendResult.isValid, false, "Must fail attendance contradiction");
  assert.ok(cannotAttendResult.reason.includes("inability to attend"), "Reason must cite inability to attend");
  assert.ok(cannotAttendResult.correctedReply.includes("reschedule") || cannotAttendResult.correctedReply.includes("Koi baat nahi"), "Corrected reply must offer reschedule");
  console.log("✓ Case B: Inability-to-attend contradiction caught and auto-corrected to reschedule\n");

  // ---------------------------------------------------------------------------
  // Test 3: Invariant 2 - Redundancy Detection & Elimination
  // ---------------------------------------------------------------------------
  console.log("--- Test 3: Invariant 2 - Redundancy Detection & Elimination ---");

  // Case A: User gave location, bot asks for location
  const locationRedundancyResult = await verifier.verifyOutboundReply({
    userMessage: "Waghodia Road par 3bhk flat dekhna hai",
    proposedReply: "Ji bilkul! Aapko Vadodara me konsi location me property chahiye?",
    extractedIntent: { entities: { location_name: "Waghodia Road", property_type: "FLAT" } },
    leadState: "QUALIFYING",
    languageProfile: { dialect: "HINGLISH" },
  });

  assert.strictEqual(locationRedundancyResult.isValid, false, "Must fail redundancy check on location");
  assert.ok(locationRedundancyResult.reason.includes("REDUNDANCY"), "Reason must cite REDUNDANCY");
  assert.ok(
    locationRedundancyResult.correctedReply.includes("budget") || locationRedundancyResult.correctedReply.includes("noted"),
    "Corrected reply must proceed to budget instead of re-asking location"
  );
  console.log("✓ Case A: Location redundancy caught and auto-corrected to budget intake");

  // Case B: User gave budget, bot asks for budget
  const budgetRedundancyResult = await verifier.verifyOutboundReply({
    userMessage: "Mera budget 55 lakhs hai",
    proposedReply: "Noted! Aapka budget kitna hai batayein?",
    extractedIntent: { entities: { budget_inr: 5500000 } },
    leadState: "QUALIFYING",
    languageProfile: { dialect: "HINGLISH" },
  });

  assert.strictEqual(budgetRedundancyResult.isValid, false, "Must fail redundancy check on budget");
  assert.ok(budgetRedundancyResult.reason.includes("budget"), "Reason must cite budget redundancy");
  assert.ok(budgetRedundancyResult.correctedReply.includes("Ready to Move") || budgetRedundancyResult.correctedReply.includes("dhyan"), "Corrected reply must proceed to timeline");
  console.log("✓ Case B: Budget redundancy caught and auto-corrected to timeline intake\n");

  // ---------------------------------------------------------------------------
  // Test 4: Invariant 3 - Hallucination Prevention
  // ---------------------------------------------------------------------------
  console.log("--- Test 4: Invariant 3 - Hallucination Prevention ---");

  // Case A: Wild ROI / 100% guarantee claims
  const guaranteeResult = await verifier.verifyOutboundReply({
    userMessage: "Return kaisa milega?",
    proposedReply: "This commercial project offers a 100% guarantee double your money in 2 years with guaranteed profit!",
    leadState: "QUALIFYING",
  });

  assert.strictEqual(guaranteeResult.isValid, false, "Must fail hallucination on financial guarantee");
  assert.ok(guaranteeResult.reason.includes("HALLUCINATION"), "Reason must cite HALLUCINATION");
  assert.ok(!guaranteeResult.correctedReply.includes("100% guarantee"), "Corrected reply must strip false guarantee");
  console.log("✓ Case A: Wild financial guarantee caught and sanitized");

  // Case B: Phantom project name hallucination
  const phantomProjectResult = await verifier.verifyOutboundReply({
    userMessage: "Mujhe best flats dikhao",
    proposedReply: "Aap <b>Golden Horizon Heights</b> me 3BHK dekh sakte hain.",
    allowedProjectNames: ["Shree Siddheshwar Haven", "Nilamber Bellissimo"],
    leadState: "OPTIONS_SENT",
  });

  assert.strictEqual(phantomProjectResult.isValid, false, "Must fail hallucination on unconfirmed project");
  assert.ok(phantomProjectResult.reason.includes("Golden Horizon Heights"), "Reason must cite phantom project");
  console.log("✓ Case B: Unconfirmed phantom project name caught by catalog guard\n");

  // ---------------------------------------------------------------------------
  // Test 5: Invariant 4 - Policy & Telegram HTML Tag Balance Check
  // ---------------------------------------------------------------------------
  console.log("--- Test 5: Invariant 4 - Policy & HTML Tag Balance Check ---");

  // Unclosed <b> tag (which breaks Telegram HTML parse mode)
  const unclosedTagResult = await verifier.verifyOutboundReply({
    userMessage: "Hello",
    proposedReply: "Namaste <b>Manthan bhai! Kripya batayein aapki requirement.",
    leadState: "FRESH",
  });

  assert.strictEqual(unclosedTagResult.isValid, false, "Must detect unclosed <b> tag");
  assert.ok(unclosedTagResult.reason.includes("HTML_SYNTAX"), "Reason must cite HTML_SYNTAX");
  assert.ok(unclosedTagResult.correctedReply.includes("</b>"), "Auto-fixer must balance HTML tags");
  console.log("✓ HTML unclosed tag detected and auto-balanced for Telegram safety\n");

  // ---------------------------------------------------------------------------
  // Test 6: Valid Clean Replies Pass Unmodified
  // ---------------------------------------------------------------------------
  console.log("--- Test 6: Valid Clean Invariant-Compliant Replies Pass Cleanly ---");

  const validReply = "Ji <b>Manthan ji</b>! Waghodia Road par aapke ₹50 Lakhs budget me hamare paas 2 options available hain. 🏡";
  const validResult = await verifier.verifyOutboundReply({
    userMessage: "Budget 50 lakh Waghodia Road",
    proposedReply: validReply,
    leadState: "QUALIFIED",
  });

  assert.strictEqual(validResult.isValid, true, "Clean reply must pass verification");
  assert.strictEqual(validResult.correctedReply, validReply, "Clean reply must be unchanged");
  assert.strictEqual(validResult.violations.length, 0, "Violations array must be empty");
  console.log("✓ Compliant outbound reply passed 100% untouched\n");

  console.log("========================================================================");
  console.log("=== ALL PRE-FLIGHT VERIFIER GATE INVARIANT CHECKS PASSED (100%) ===");
  console.log("========================================================================");
}

runTestSuite().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
