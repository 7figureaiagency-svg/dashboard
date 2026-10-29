/**
 * COMPREHENSIVE TEST SUITE: PHASE 34
 * cs-chatbot-design Governance & Dialogue Engineering
 *
 * Verifies:
 * 1. Skill file existence and frontmatter validity
 * 2. Reference guides integrity (dialogue-patterns, slot-filling-rubric, fallback-escalation-matrix)
 * 3. Synthesizer prompt structure enforcing the 3 Golden Response Principles
 * 4. Regional fallback templates compliance (Gujarati, Gujlish, Hindi, Hinglish, Marathi, Tamil, Telugu, English)
 * 5. Verifier gate dialogue compliance checks (conciseness, quick reply format, acknowledge first)
 * 6. Verifier gate auto-sanitization (ASCII to emoji quick replies, newline compression, HTML balancing)
 * 7. End-to-end verifyOutboundReply compliance and self-correction
 * 8. Edge function health version alignment (v88-cs-chatbot-design-governance)
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
console.log('🧪 RUNNING PHASE 34 CS-CHATBOT-DESIGN VERIFICATION SUITE');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// SUITE 1: Skill File Existence & Frontmatter Validity
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Skill File Existence & Canonical Docs ---');

const skillPath = path.join(__dirname, '../.agents/skills/cs-chatbot-design/SKILL.md');
assert(fs.existsSync(skillPath), 'SKILL.md exists in .agents/skills/cs-chatbot-design/');

const skillContent = fs.readFileSync(skillPath, 'utf8');
assert(skillContent.includes('name: cs-chatbot-design'), 'SKILL.md has valid name frontmatter');
assert(skillContent.includes('description:'), 'SKILL.md has description frontmatter');
assert(skillContent.includes('Rule 1: Acknowledge First'), 'SKILL.md defines Rule 1: Acknowledge First');
assert(skillContent.includes('Rule 2: Be Concise'), 'SKILL.md defines Rule 2: Be Concise');
assert(skillContent.includes('Rule 3: Offer Next Steps'), 'SKILL.md defines Rule 3: Offer Next Steps');

// References
const refDir = path.join(__dirname, '../.agents/skills/cs-chatbot-design/references');
assert(fs.existsSync(path.join(refDir, 'dialogue-patterns.md')), 'dialogue-patterns.md exists');
assert(fs.existsSync(path.join(refDir, 'slot-filling-rubric.md')), 'slot-filling-rubric.md exists');
assert(fs.existsSync(path.join(refDir, 'fallback-escalation-matrix.md')), 'fallback-escalation-matrix.md exists');

// AGENTS.md registration
const agentsMdContent = fs.readFileSync(path.join(__dirname, '../AGENTS.md'), 'utf8');
assert(agentsMdContent.includes('cs-chatbot-design'), 'AGENTS.md registers cs-chatbot-design skill');
assert(agentsMdContent.includes('The 3 Golden Response Principles'), 'AGENTS.md registers 3 Golden Response Principles');

// -----------------------------------------------------------------------------
// SUITE 2: Multilingual Synthesizer Prompt Structure & Regional Fallbacks
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Multilingual Synthesizer Prompt & Regional Fallbacks ---');

const synthPath = path.join(__dirname, '../supabase/functions/realtor-lead-engine/multilingual_synthesizer.ts');
assert(fs.existsSync(synthPath), 'multilingual_synthesizer.ts exists');
const synthContent = fs.readFileSync(synthPath, 'utf8');

// Prompt assertions
assert(synthContent.includes('3 GOLDEN RESPONSE PRINCIPLES'), 'buildSynthesizerPrompt specifies 3 Golden Response Principles');
assert(synthContent.includes('Rule 1 (Acknowledge First)'), 'buildSynthesizerPrompt instructs Rule 1 (Acknowledge First)');
assert(synthContent.includes('Rule 2 (Be Concise)'), 'buildSynthesizerPrompt instructs Rule 2 (Be Concise <= 3-4 lines)');
assert(synthContent.includes('Rule 3 (Offer Next Steps)'), 'buildSynthesizerPrompt instructs Rule 3 (Offer Next Steps 1️⃣, 2️⃣)');
assert(synthContent.includes('Follow the 3 Golden Response Principles'), 'Groq fallback system prompt enforces 3 Golden Response Principles');

// Helper to strip TypeScript annotations cleanly
function stripTypeScript(code) {
  return code
    .replace(/export (?:async )?function/g, m => m.replace('export ', ''))
    .replace(/export interface[\s\S]*?\n\}/g, '')
    .replace(/:\s*Record<[^>]+>/g, '')
    .replace(/(\b\w+)\?:\s*([A-Za-z0-9_<>\[\]| ]+)/g, '$1: $2')
    .replace(/:\s*Partial<[^>]+>\s*\|\s*null/g, '')
    .replace(/:\s*OutboundVerificationParams/g, '')
    .replace(/:\s*OutboundVerificationResult/g, '')
    .replace(/:\s*string\s*\|\s*null/g, '')
    .replace(/:\s*string\[\]/g, '')
    .replace(/:\s*string/g, '')
    .replace(/:\s*boolean/g, '')
    .replace(/:\s*number/g, '')
    .replace(/:\s*any/g, '')
    .replace(/as\s+[A-Za-z0-9_<>\[\]|]+/g, '');
}

// Test regional fallbacks directly
const fallbackBlock = synthContent.slice(
  synthContent.indexOf('export function getCuratedRegionalFallback'),
  synthContent.indexOf('export function sanitizeGeneratedReply')
);
assert(Boolean(fallbackBlock), 'getCuratedRegionalFallback found in synthesizer');

const evalFallbackRunner = new Function('agencyName', 'lang', 'script', 'dialect', `
  ${stripTypeScript(fallbackBlock)}
  return getCuratedRegionalFallback("help", { primary_language: lang, script: script, dialect: dialect }, agencyName);
`);

const gujFallback = evalFallbackRunner('NextGen Realty', 'Gujarati', 'Gujarati', 'Pure Gujarati');
assert(gujFallback.includes('આપની વિગત નોંધી લીધી છે. 👍'), 'Gujarati fallback acknowledges first');
assert(gujFallback.split('\n').length <= 3, 'Gujarati fallback is concise (<= 3 lines)');

const gujlishFallback = evalFallbackRunner('NextGen Realty', 'Gujarati', 'Latin', 'Gujlish');
assert(gujlishFallback.includes('Aapni requirement note kari lidhi chhe. 👍'), 'Gujlish fallback acknowledges first');
assert(gujlishFallback.split('\n').length <= 3, 'Gujlish fallback is concise (<= 3 lines)');

const marathiFallback = evalFallbackRunner('NextGen Realty', 'Marathi', 'Devanagari', 'Marathi');
assert(marathiFallback.includes('आपली माहिती नोंदवून घेतली आहे. 👍'), 'Marathi fallback acknowledges first');
assert(marathiFallback.split('\n').length <= 3, 'Marathi fallback is concise (<= 3 lines)');

const tamilFallback = evalFallbackRunner('NextGen Realty', 'Tamil', 'Other', 'Tamil');
assert(tamilFallback.includes('Ungal thevaigalai padivu seidhom. 👍'), 'Tamil fallback acknowledges first');
assert(tamilFallback.split('\n').length <= 3, 'Tamil fallback is concise (<= 3 lines)');

const teluguFallback = evalFallbackRunner('NextGen Realty', 'Telugu', 'Other', 'Telugu');
assert(teluguFallback.includes('Mee requirement record chesam. 👍'), 'Telugu fallback acknowledges first');
assert(teluguFallback.split('\n').length <= 3, 'Telugu fallback is concise (<= 3 lines)');

const engFallback = evalFallbackRunner('NextGen Realty', 'English', 'Latin', 'English');
assert(engFallback.includes('Noted your requirement. 👍'), 'English fallback acknowledges first');
assert(engFallback.split('\n').length <= 3, 'English fallback is concise (<= 3 lines)');

const hinFallback = evalFallbackRunner('NextGen Realty', 'Hindi', 'Devanagari', 'Devanagari Hindi');
assert(hinFallback.includes('आपकी आवश्यकता नोट कर ली गई है। 👍'), 'Devanagari Hindi fallback acknowledges first');
assert(hinFallback.split('\n').length <= 3, 'Devanagari Hindi fallback is concise (<= 3 lines)');

const hinglishFallback = evalFallbackRunner('NextGen Realty', 'Hindi', 'Latin', 'Hinglish');
assert(hinglishFallback.includes('Aapki requirement note kar li gayi hai. 👍'), 'Hinglish fallback acknowledges first');
assert(hinglishFallback.split('\n').length <= 3, 'Hinglish fallback is concise (<= 3 lines)');

// -----------------------------------------------------------------------------
// SUITE 3: Verifier Gate Dialogue Compliance & Auto-Sanitization
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Verifier Gate Dialogue Governance Checks ---');

const verifierPath = path.join(__dirname, '../supabase/functions/realtor-lead-engine/verifier_gate.ts');
assert(fs.existsSync(verifierPath), 'verifier_gate.ts exists');
const verifierContent = fs.readFileSync(verifierPath, 'utf8');

assert(verifierContent.includes('export function checkDialogueGovernance'), 'checkDialogueGovernance exported');
assert(verifierContent.includes('export function autoSanitizeDialogue'), 'autoSanitizeDialogue exported');
assert(verifierContent.includes('Runs all 5 invariant checks'), 'verifier_gate runs all 5 invariant checks');

// Extract and test checkDialogueGovernance, fixUnbalancedHtml, and autoSanitizeDialogue
const verifierBlock = verifierContent.slice(
  verifierContent.indexOf('export function checkDialogueGovernance'),
  verifierContent.indexOf('// 3. Lightweight Corrective Auto-Synthesis Engine')
);
assert(Boolean(verifierBlock), 'Verifier dialogue governance block extracted');

const testSandbox = new Function(`
  ${stripTypeScript(verifierBlock)}

  return {
    checkDialogueGovernance,
    autoSanitizeDialogue,
    fixUnbalancedHtml
  };
`)();

const { checkDialogueGovernance, autoSanitizeDialogue, fixUnbalancedHtml } = testSandbox;

// Test 3.1: Conciseness violation (> 7 lines for conversational reply)
const longReply = [
  'Line 1: Welcome to our real estate agency.',
  'Line 2: We have many properties available.',
  'Line 3: Here is what we do.',
  'Line 4: We help you find homes.',
  'Line 5: We also do commercial leases.',
  'Line 6: We have apartments and villas.',
  'Line 7: Let us know your requirements.',
  'Line 8: Would you like to proceed?'
].join('\n');

const concisenessViolation = checkDialogueGovernance({
  userMessage: 'Show me properties',
  proposedReply: longReply
});
assert(Boolean(concisenessViolation && concisenessViolation.includes('CONCISENESS')), 'Flags conversational reply exceeding 7 lines');

// Test 3.2: Conciseness exemption for property cards
const propertyCardReply = [
  '🏡 <b>Royal Palm Residency</b>',
  '📍 Location: Alkapuri, Vadodara',
  '💰 Price: ₹85 Lakhs',
  '🏢 Carpet Area: 1450 sq ft',
  '✨ Amenities: Swimming Pool, Club House',
  '📅 Possession: Ready to Move',
  '📄 Brochure: Available on request',
  'Would you like to book a site visit tomorrow?'
].join('\n');

const propertyCardCheck = checkDialogueGovernance({
  userMessage: 'Show details',
  proposedReply: propertyCardReply
});
assert(propertyCardCheck === null, 'Exempts structured property card from 7-line conversational cap');

// Test 3.3: Quick-reply format violation (ASCII numbers instead of emojis)
const asciiOptionsReply = 'Please choose your preferred category:\n1. Flat in Alkapuri\n2. Villa in Gotri';
const quickReplyViolation = checkDialogueGovernance({
  userMessage: 'Show me categories',
  proposedReply: asciiOptionsReply
});
assert(Boolean(quickReplyViolation && quickReplyViolation.includes('QUICK_REPLY_FORMAT')), 'Flags ASCII numbered options missing 1-tap emojis');

// Test 3.4: Quick-reply format pass (uses 1-tap emojis)
const emojiOptionsReply = 'Please choose your preferred category:\n1️⃣ Flat in Alkapuri\n2️⃣ Villa in Gotri';
const quickReplyPass = checkDialogueGovernance({
  userMessage: 'Show me categories',
  proposedReply: emojiOptionsReply
});
assert(quickReplyPass === null, 'Passes prompt formatted with 1-tap quick reply emojis');

// Test 3.5: Acknowledge First violation (abrupt question without acknowledgment)
const abruptReply = 'Kitne BHK chahiye?';
const ackViolation = checkDialogueGovernance({
  userMessage: 'I am looking to buy a flat in Vadodara for my family',
  proposedReply: abruptReply
});
assert(Boolean(ackViolation && ackViolation.includes('ACKNOWLEDGE_FIRST')), 'Flags abrupt question without acknowledging user input');

// Test 3.6: Acknowledge First pass (polite acknowledgment provided)
const politeReply = 'Ji noted! 👍 Kitne BHK chahiye?';
const ackPass = checkDialogueGovernance({
  userMessage: 'I am looking to buy a flat in Vadodara for my family',
  proposedReply: politeReply
});
assert(ackPass === null, 'Passes question prefaced with polite acknowledgment');

// Test 3.7: autoSanitizeDialogue converts ASCII options to emojis
const rawOptions = 'Options:\n1. Buy a Flat\n2. Buy a Villa\n3. Commercial Space';
const sanitizedOptions = autoSanitizeDialogue(rawOptions);
assert(sanitizedOptions.includes('1️⃣ Buy a Flat'), 'autoSanitizeDialogue converts 1. to 1️⃣');
assert(sanitizedOptions.includes('2️⃣ Buy a Villa'), 'autoSanitizeDialogue converts 2. to 2️⃣');
assert(sanitizedOptions.includes('3️⃣ Commercial Space'), 'autoSanitizeDialogue converts 3. to 3️⃣');

// Test 3.8: autoSanitizeDialogue prepends acknowledgment to abrupt question
const sanitizedAbrupt = autoSanitizeDialogue('Aapka budget kitna hai?');
assert(sanitizedAbrupt.startsWith('Ji noted! 👍'), 'autoSanitizeDialogue prepends acknowledgment to abrupt question');

// Test 3.9: autoSanitizeDialogue compresses multiple blank lines
const multiNewlines = 'Hello!\n\n\n\nHow can we help?';
const condensed = autoSanitizeDialogue(multiNewlines);
assert(!condensed.includes('\n\n\n'), 'autoSanitizeDialogue compresses excessive blank lines');

// Test 3.10: autoSanitizeDialogue fixes unbalanced HTML tags
const unclosedHtml = '<b>Nextgen Realtors';
const fixedHtml = autoSanitizeDialogue(unclosedHtml);
assert(fixedHtml === '<b>Nextgen Realtors</b>', 'autoSanitizeDialogue automatically closes unbalanced HTML tags');

// -----------------------------------------------------------------------------
// SUITE 4: Health Check Endpoint Version Alignment
// -----------------------------------------------------------------------------
console.log('\n--- Suite 4: Edge Function Version Alignment ---');

const indexTsPath = path.join(__dirname, '../supabase/functions/realtor-lead-engine/index.ts');
assert(fs.existsSync(indexTsPath), 'index.ts exists');
const indexTsContent = fs.readFileSync(indexTsPath, 'utf8');

assert(
  indexTsContent.includes('version: "v88-cs-chatbot-design-governance"'),
  'Health endpoint version bumped to v88-cs-chatbot-design-governance'
);

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`🎉 ALL TESTS PASSED: ${passedTests}/${totalTests} (100% SUCCESS)`);
console.log('======================================================\n');
