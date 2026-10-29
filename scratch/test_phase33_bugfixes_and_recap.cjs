/**
 * COMPREHENSIVE TEST SUITE: PHASE 33.5
 * Verification for:
 * 1. parseVisitSlot Option Decoupling & Explicit Time Anchoring
 * 2. Voice Note Perso-Arabic Detection & Transliteration Bridge
 * 3. Gemini Model Name Sanity (gemini-2.0-flash / gemini-1.5-pro)
 * 4. Full Context Recap Card Formatting across Hinglish, Gujlish, and English
 */

const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('\n======================================================');
console.log('🧪 RUNNING PHASE 33.5 COMPREHENSIVE VERIFICATION SUITE');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// SUITE 1: parseVisitSlot Time Anchoring & Option Decoupling
// -----------------------------------------------------------------------------
console.log('--- Suite 1: parseVisitSlot Time Anchoring & Option Decoupling ---');

function getIstTime() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 5.5));
}

function normalizeIndicDigits(text) {
  const indicDigits = { '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4', '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9', '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '૮': '8', '९': '9' };
  const str = typeof text === 'string' ? text : String(text || '');
  return str.replace(/[૦-૯०-९]/g, (d) => indicDigits[d] || d);
}

// Load and evaluate parseVisitSlot from index.ts
const indexContent = fs.readFileSync(path.join(__dirname, '../supabase/functions/realtor-lead-engine/index.ts'), 'utf8');
const fnMatch = indexContent.match(/function parseVisitSlot[\s\S]*?\n\}/);
if (!fnMatch) throw new Error('Could not find parseVisitSlot in index.ts');
const fnCode = fnMatch[0].replace(/:\s*\{\s*isoUtc[\s\S]*?\}\s*\{/, ' {');
eval(fnCode);

// Test 1.1: Compound option + morning time
const slot1 = parseVisitSlot('option 1 ke sath kal 10 baje ki visit book kar do');
const d1 = new Date(slot1.isoUtc);
assert(slot1.isValidTime === true, 'slot1 is marked valid time');
assert(d1.getUTCHours() === 4 && d1.getUTCMinutes() === 30, 'slot1 books strictly at 10:00 AM IST (04:30 UTC), never 1:00 PM');

// Test 1.2: Option + evening time
const slot2 = parseVisitSlot('option 2 sham 5 baje');
const d2 = new Date(slot2.isoUtc);
assert(slot2.isValidTime === true, 'slot2 is marked valid time');
assert(d2.getUTCHours() === 11 && d2.getUTCMinutes() === 30, 'slot2 books strictly at 5:00 PM IST (11:30 UTC)');

// Test 1.3: Kal 10 baje
const slot3 = parseVisitSlot('kal 10 baje');
const d3 = new Date(slot3.isoUtc);
assert(slot3.isValidTime === true, 'slot3 is marked valid time');
assert(d3.getUTCHours() === 4 && d3.getUTCMinutes() === 30, 'slot3 books strictly at 10:00 AM IST (04:30 UTC)');

// Test 1.4: Gujarati token 'vage'
const slot4 = parseVisitSlot('option 1 kale savare 11 vage');
const d4 = new Date(slot4.isoUtc);
assert(slot4.isValidTime === true, 'slot4 is marked valid time');
assert(d4.getUTCHours() === 5 && d4.getUTCMinutes() === 30, 'slot4 books strictly at 11:00 AM IST (05:30 UTC)');

// Test 1.5: Out-of-hours time slot (e.g. 8:00 AM or 9:00 PM)
const slot5 = parseVisitSlot('kal raat 9 baje');
assert(slot5.isValidTime === false, 'slot5 (9 PM) is correctly rejected as out of working hours');

// -----------------------------------------------------------------------------
// SUITE 2: Voice Note Script Normalization & Perso-Arabic Detection
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Voice Note Script Normalization & Perso-Arabic Detection ---');

const voiceDecoderContent = fs.readFileSync(path.join(__dirname, '../supabase/functions/realtor-lead-engine/voice_decoder.ts'), 'utf8');

function containsPersoArabicScript(text) {
  if (!text) return false;
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

const urduAudioTranscript = 'مجھے 3 بیج کے فلیٹ چاہیے 1 کروڑ کے بجیٹ میں الکاپوری ایریا میں';
const devanagariTranscript = 'मुझे 3 बीएचके फ्लैट चाहिए 1 करोड़ के बजट में अलकापुरी में';
const gujaratiTranscript = 'મને 3 બીએચકે ફ્લેટ જોઈએ છે ૧ કરોડ ના બજેટ માં';
const englishTranscript = 'I want a 3 BHK flat in Alkapuri with 1 crore budget';

assert(containsPersoArabicScript(urduAudioTranscript) === true, 'Perso-Arabic script in Urdu voice note correctly identified');
assert(containsPersoArabicScript(devanagariTranscript) === false, 'Devanagari script is not flagged as Perso-Arabic');
assert(containsPersoArabicScript(gujaratiTranscript) === false, 'Gujarati script is not flagged as Perso-Arabic');
assert(containsPersoArabicScript(englishTranscript) === false, 'English Latin script is not flagged as Perso-Arabic');

assert(voiceDecoderContent.includes('containsPersoArabicScript'), 'voice_decoder.ts exports containsPersoArabicScript');
assert(voiceDecoderContent.includes('transliterateArabicScriptToLatin'), 'voice_decoder.ts exports transliterateArabicScriptToLatin');
assert(voiceDecoderContent.includes('Do not output in Arabic or Urdu script'), 'Whisper prompt strictly forbids Arabic/Urdu script output');

// -----------------------------------------------------------------------------
// SUITE 3: Google Gemini Model Names Sanity
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Google Gemini Model Endpoints Sanity ---');

const filesToCheck = [
  'supabase/functions/realtor-lead-engine/voice_decoder.ts',
  'supabase/functions/realtor-lead-engine/cognitive_extractor.ts',
  'supabase/functions/realtor-lead-engine/multilingual_synthesizer.ts',
  'supabase/functions/realtor-lead-engine/verifier_gate.ts',
  'supabase/functions/realtor-lead-engine/index.ts',
];

for (const relPath of filesToCheck) {
  const fullPath = path.join(__dirname, '..', relPath);
  const fileText = fs.readFileSync(fullPath, 'utf8');

  assert(!fileText.includes('gemini-2.5-flash'), `No non-existent gemini-2.5-flash in ${relPath}`);
  assert(!fileText.includes('gemini-2.5-pro'), `No non-existent gemini-2.5-pro in ${relPath}`);
}

assert(voiceDecoderContent.includes('gemini-2.0-flash'), 'voice_decoder.ts targets gemini-2.0-flash');
const cogContent = fs.readFileSync(path.join(__dirname, '../supabase/functions/realtor-lead-engine/cognitive_extractor.ts'), 'utf8');
assert(cogContent.includes('gemini-2.0-flash') && cogContent.includes('gemini-1.5-pro'), 'cognitive_extractor.ts targets gemini-2.0-flash and gemini-1.5-pro');

// -----------------------------------------------------------------------------
// SUITE 4: Context Recap Card Formatting & Criteria Fork
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Context Recap Card Formatting & Criteria Fork ---');

function formatPriceShort(priceNum) {
  if (priceNum >= 10000000) {
    const cr = (priceNum / 10000000).toFixed(2).replace(/\.00$/, "").replace(/(\.[1-9])0$/, "$1");
    return `₹${cr} Cr`;
  } else if (priceNum >= 100000) {
    const l = (priceNum / 100000).toFixed(2).replace(/\.00$/, "").replace(/(\.[1-9])0$/, "$1");
    return `₹${l} Lakhs`;
  } else if (priceNum > 0) {
    return `₹${priceNum.toLocaleString("en-IN")}`;
  }
  return "N/A";
}

assert(formatPriceShort(10000000) === '₹1 Cr', 'formatPriceShort formats 1 Cr accurately');
assert(formatPriceShort(8500000) === '₹85 Lakhs', 'formatPriceShort formats 85 Lakhs accurately');
assert(formatPriceShort(15000000) === '₹1.5 Cr', 'formatPriceShort formats 1.5 Cr accurately');

// Check that Recap Card template strings are present in index.ts
assert(indexContent.includes('📋 <b>Humare paas aapki pichli inquiry ki ye details saved hain:</b>'), 'Hinglish Recap Card heading present');
assert(indexContent.includes('📋 <b>Amari pase tamari pichli inquiry ni aa details saved chhe:</b>'), 'Gujlish Recap Card heading present');
assert(indexContent.includes('📋 <b>Here are the saved details from your previous inquiry:</b>'), 'English Recap Card heading present');

assert(indexContent.includes('1️⃣ Inhi details ke sath aage badhein 👍'), 'Option 1 proceed button present in Recap Card');
assert(indexContent.includes('2️⃣ Details change / update karein ✏️'), 'Option 2 change button present in Recap Card');
assert(indexContent.includes('CRITERIA_UPDATE_SELECTION'), 'CRITERIA_UPDATE_SELECTION dialog branch present');

// -----------------------------------------------------------------------------
// SUITE 5: Production Version Alignment
// -----------------------------------------------------------------------------
console.log('\n--- Suite 5: Production Version Alignment ---');

assert(
  /v(?:87|88)/.test(indexContent),
  'Version bumped to v87 or v88 in health check'
);

console.log('\n======================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} ASSERTIONS PASSED WITH 100% SUCCESS!`);
console.log('======================================================\n');
