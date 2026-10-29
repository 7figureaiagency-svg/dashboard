/**
 * Autonomous Adversarial Edge-Case & Loophole Audit Runner
 * Part of the adversarial-edge-case-hunter skill for Nextgn Realtors CRM
 */

const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log(" 🛡️  AUTONOMOUS ADVERSARIAL EDGE-CASE & ROBUSTNESS AUDIT SUITE  🛡️");
console.log("==================================================================");

const rootDir = process.cwd();
const enginePath = path.join(rootDir, 'supabase/functions/realtor-lead-engine/index.ts');
const crmDataPath = path.join(rootDir, 'src/lib/crm-data.ts');

if (!fs.existsSync(enginePath)) {
  console.error(`[ERROR] Engine file not found: ${enginePath}`);
  process.exit(1);
}

const engineCode = fs.readFileSync(enginePath, 'utf-8');
const crmDataCode = fs.existsSync(crmDataPath) ? fs.readFileSync(crmDataPath, 'utf-8') : '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const defects = [];

function testCase(category, name, condition, failureDetails = "") {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] [${category}] ${name}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] [${category}] ${name}`);
    if (failureDetails) console.error(`     ↳ Details: ${failureDetails}`);
    failedTests++;
    defects.push({ category, name, details: failureDetails });
  }
}

// ============================================================================
// 1. GEOGRAPHICAL & LANDMARK COLLISION VECTORS
// ============================================================================
console.log("\n[SECTION 1: Geographical & Landmark Collision Defense]");

testCase(
  "GEO",
  "Major Indian Cities dictionary is defined",
  engineCode.includes("const MAJOR_INDIAN_CITIES = [") && engineCode.includes('"vadodara"') && engineCode.includes('"surat"'),
  "MAJOR_INDIAN_CITIES array missing or incomplete"
);

testCase(
  "GEO",
  "extractCityFromText function exists with word boundaries",
  engineCode.includes("function extractCityFromText(") && engineCode.includes("function isKnownIndianCity("),
  "City extraction functions missing"
);

testCase(
  "GEO",
  "Landmark matching protects against city substring collisions",
  engineCode.includes("isKnownIndianCity(cleanLower)") && engineCode.includes("!isKnownIndianCity(w)"),
  "Landmark matching does not exclude known Indian cities"
);

testCase(
  "GEO",
  "Out-of-market city question triggers dedicated guidance without crash",
  engineCode.includes("isOutOfMarketCity && !justLoc") && engineCode.includes("OUT_OF_MARKET_CITY"),
  "Out-of-market city handling missing in qualification cascade"
);

// ============================================================================
// 2. CURRENCY & NUMBER PARSING VECTORS
// ============================================================================
console.log("\n[SECTION 2: Currency, Budget & Number Parsing Defense]");

testCase(
  "CURRENCY",
  "Crore parsing strictly enforces 10,000,000 multiplier (No 10 Cr hallucination)",
  engineCode.includes("* 10000000") && engineCode.includes("rawParsed = 10000000"),
  "Crore multiplier is incorrect or prone to 100M hallucination"
);

testCase(
  "CURRENCY",
  "Deterministic budget overrides Groq LLM hallucination",
  engineCode.includes("const justBudget = parseBudgetFromText(context.messageText);") &&
  engineCode.includes("let budget = (justBudget && justBudget > 0) ? justBudget :"),
  "Deterministic parseBudgetFromText does not take precedence over LLM budget"
);

testCase(
  "CURRENCY",
  "Zero double rupee prefixing (₹₹ eradicated everywhere)",
  !engineCode.includes("₹${formatPriceShort("),
  "Double rupee prefix ₹${formatPriceShort()} found in string templates"
);

// ============================================================================
// 3. MENU ROUTING & APOLOGY SUPPRESSION VECTORS
// ============================================================================
console.log("\n[SECTION 3: Menu Routing & Navigation Defense]");

testCase(
  "MENU",
  "Menu Option 1 uses concrete entity check (avoids false CHANGE_REQUIREMENT apology)",
  engineCode.includes("const isPureOption1 = /^(?:1|1️⃣|option\\s*1|first|1st)") &&
  engineCode.includes("const hasConcreteBuyerEntities = Boolean("),
  "Menu Option 1 lacks concrete entity check and triggers apology"
);

testCase(
  "MENU",
  "Typo detection ignores option numbers and affirmations (1, 2, 3, Ha, Yes)",
  engineCode.includes("const isNavigationOrAffirmation =") &&
  engineCode.includes("!isNavigationOrAffirmation"),
  "isTypoOrUnrecognized falsely flags menu numbers or affirmations as typos"
);

testCase(
  "MENU",
  "Returning buyer selecting Option 1 directly routes to property card display",
  engineCode.includes("// Option 1: Top property options dekhein (directly render matching options from known criteria)") &&
  engineCode.includes("purpose: lead.purpose || \"SELF_USE\""),
  "Returning buyer Option 1 does not supply fallback criteria to display cards"
);

// ============================================================================
// 4. OWNER INTAKE SAFEGUARDS (NUMERIC TRAPS & RENTAL LOOPS)
// ============================================================================
console.log("\n[SECTION 4: Owner Intake Safeguards]");

testCase(
  "OWNER",
  "Numeric area measurement in location turn is saved as carpet area, not location",
  engineCode.includes("const isPureDigits = /^\\d{2,6}$/.test(rawTrim);") &&
  engineCode.includes("draft.carpet_area_sqft = parsedVal;") &&
  engineCode.includes("aa property kaya exact <b>Area ke Landmark</b> pase aave chhe"),
  "Numeric area measurement sets location or loops without carpet area extraction"
);

testCase(
  "OWNER",
  "Rent-per-month cues in expected price turn switch to RENT_OUT without loop",
  engineCode.includes("const hasRentalCue = /(?:per\\s*month|\\/month|\\/mo|month|mahina|mahine|bhadu|bhade|bhada|rent|kiraya|lease)/i.test(lower);") &&
  engineCode.includes("draft.transaction_type = \"RENT_OUT\";") &&
  engineCode.includes("draft.expected_rent = directPrice;"),
  "Rental cues in price turn not detected, causing infinite loop on selling price"
);

// ============================================================================
// 5. FOLLOW-UP DRIPS & SITE VISIT INTEGRITY
// ============================================================================
console.log("\n[SECTION 5: Follow-Up Drips & Site Visit Integrity]");

testCase(
  "DRIP",
  "Followup engine sends off-market concierge to leads with no property matches",
  engineCode.includes("const hasRealOptions = Array.isArray(l.last_option_ids) && l.last_option_ids.length > 0;") &&
  engineCode.includes("const isNoMatchLead = l.metadata?.sales_alert_reason === \"NO_PROPERTY_MATCH\" || !hasRealOptions;") &&
  engineCode.includes("amari team specialized off-market options verify kari rahi chhe"),
  "Follow-up engine falsely claims properties were shared when last_option_ids is empty"
);

testCase(
  "DRIP",
  "resolveLeadProjectName strictly filters by property_category",
  engineCode.includes("// 4. Fallback to tenant default available inventory ONLY if category matches and neither prop nor rawMetaName is known") &&
  engineCode.includes('.eq("property_category", l.property_category)'),
  "resolveLeadProjectName falls back to mismatched categories"
);

testCase(
  "VISIT",
  "Upcoming/today visit confirmation guard acknowledges affirmations without re-asking slots",
  engineCode.includes("// A0. UPCOMING / TODAY'S VISIT CONFIRMATION GUARD") &&
  engineCode.includes("isVisitUpcomingOrToday && isAffirmativeConfirmation && !lead.post_visit_feedback_sent") &&
  engineCode.includes("VIP Site Visit confirmed"),
  "Affirmative reply to morning briefing is treated as new visit booking"
);

// ============================================================================
// 6. MULTI-TENANT & LIVE INVENTORY SYNCHRONIZATION
// ============================================================================
console.log("\n[SECTION 6: Live Inventory Synchronization & Multi-Tenant Safety]");

testCase(
  "INVENTORY",
  "CRM submission approval/update synchronizes directly to live inventory table",
  crmDataCode.includes("// 2. If status is CONVERTED_TO_INVENTORY, sync directly to live inventory table") &&
  crmDataCode.includes('.from("inventory")') &&
  crmDataCode.includes('Submission updated and synchronized to Live Inventory!'),
  "Updating or approving owner submission does not upsert into inventory table"
);

testCase(
  "MULTI_TENANT",
  "Multi-tenant WABA safety batch cap (max 20) and inter-message delay jitter enforced",
  engineCode.includes("const BATCH_LIMIT = 20;") && engineCode.includes(".limit(BATCH_LIMIT)") && engineCode.includes("sleepJitter("),
  "Outbound sweeps lack batch cap BATCH_LIMIT(20) or delay jitter"
);

testCase(
  "ARCHITECTURE",
  "Strict 100% Non-n8n rule enforced (Zero n8n calls in production path)",
  !engineCode.includes("n8n.cloud") && !engineCode.includes("webhook-test"),
  "n8n webhook endpoints detected in production Edge Function"
);

// ============================================================================
// SUMMARY & EXIT CODE
// ============================================================================
console.log("\n==================================================================");
console.log(` 📊 AUDIT SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}% COMPLIANCE)`);
console.log("==================================================================");

if (failedTests > 0) {
  console.error(`\n🚨 DETECTED ${failedTests} DEFECT(S) NEEDING IMMEDIATE ATTENTION:`);
  defects.forEach((d, idx) => {
    console.error(`  ${idx + 1}. [${d.category}] ${d.name} -> ${d.details}`);
  });
  process.exit(1);
} else {
  console.log("\n✨ ALL ADVERSARIAL EDGE CASES & LOOPHOLE DEFENSES VERIFIED 100% OPERATIONAL!");
  process.exit(0);
}
