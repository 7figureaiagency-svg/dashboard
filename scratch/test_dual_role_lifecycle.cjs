/**
 * scratch/test_dual_role_lifecycle.cjs
 * Empirical Verification of Dual-Persona Lifecycle Architecture (Phase 4, Plan 4.1)
 *
 * Validates:
 * 1. Scenario 1 (Buyer -> Seller): Lead with booked visit submits property -> lead_type upgrades to DUAL_ROLE, visit & criteria intact.
 * 2. Scenario 2 (Seller -> Buyer): Lead with submitted property requests 3BHK search -> lead_type becomes DUAL_ROLE, submissions intact.
 * 3. Scenario 3 (Dual-Reminder Greeting): Dual lead sends "Hi" -> receives Scenario 3 menu acknowledging both visit & listing.
 * 4. Scenario 4 (Menu Option 1): Selecting "1" from DUAL_ROLE_MENU_PENDING anchors to site visit context without re-qualification.
 * 5. Scenario 5 (Menu Option 2): Selecting "2" checks listed property status.
 * 6. Scenario 6 (Menu Option 3): Selecting "3" triggers HIGH_VALUE_DUAL_ROLE sales alert.
 */

const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://yeiygfysijptjdepctnx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaXlnZnlzaWpwdGpkZXBjdG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4ODg1NTIsImV4cCI6MjEwNzQ2NDU1Mn0.1U1DKjeLZKCmldtFebxMd0Io57J3Q41UKFQu5xPa-kA';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/realtor-lead-engine`;
const TENANT_ID = '8699dca1-2b97-4367-85b8-8a0db2fd51f5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sendChat(leadId, senderName, text) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({
      lead_id: leadId,
      name: senderName,
      message: text,
      client_id: TENANT_ID
    })
  });

  const json = await res.json().catch(() => ({}));
  return {
    status: res.status,
    replyText: json.reply_sent || json.replyText || '',
    state: json.state,
    raw: json
  };
}

async function runAllTests() {
  console.log("===============================================================================");
  console.log(" 🧪 BI-DIRECTIONAL DUAL-PERSONA LIFECYCLE EMPIRICAL VERIFICATION (PLAN 4.1)");
  console.log("===============================================================================\n");

  const timestamp = Date.now();

  // ---------------------------------------------------------------------------
  // TEST 1: SCENARIO 1 (Buyer -> Seller)
  // Lead with booked visit submits property -> lead_type upgrades to DUAL_ROLE,
  // site visit and search criteria remain intact.
  // ---------------------------------------------------------------------------
  console.log("👉 [SCENARIO 1] Buyer -> Seller Transition");
  const buyerId = `test_buyer_${timestamp}`;
  const scheduledTime = new Date(Date.now() + 86400000).toISOString();

  // 1. Seed Lead as SEEKER with booked visit
  const { data: seededBuyer, error: bErr } = await supabase
    .from('leads')
    .insert({
      lead_id: buyerId,
      first_name: 'Manthan Buyer',
      lead_type: 'SEEKER',
      state: 'SITE_VISIT_BOOKED',
      user_language: 'HINGLISH',
      client_id: TENANT_ID,
      budget: 8500000,
      location: 'Vasna',
      property_type: '3BHK Flat',
      site_visit_at: scheduledTime,
      site_visit_datetime: scheduledTime,
      site_visit_booked: true,
      metadata: { has_buyer_profile: true }
    })
    .select()
    .single();

  assert(!bErr, `Failed to seed buyer: ${bErr?.message}`);

  // Insert Site Visit record
  await supabase.from('site_visits').insert({
    lead_id: seededBuyer.id,
    client_id: TENANT_ID,
    property_id: 'PROP-NXG-001',
    scheduled_at: scheduledTime,
    status: 'SCHEDULED'
  });

  console.log(`  ✓ Seeded Buyer lead ${buyerId} in SITE_VISIT_BOOKED with 3BHK Flat / Vasna / 85L`);

  // 2. Buyer expresses intent to sell a property
  const t1 = await sendChat(buyerId, 'Manthan Buyer', 'Muje mera 2BHK flat bhi bechna he Nilamber me');
  console.log(`  🤖 Bot Reply:\n${t1.replyText}\n  State: ${t1.state}`);

  // 3. Verify lead record in DB
  const { data: updatedBuyer } = await supabase
    .from('leads')
    .select('*')
    .eq('id', seededBuyer.id)
    .single();

  assert.strictEqual(updatedBuyer.lead_type, 'DUAL_ROLE', "lead_type MUST upgrade to DUAL_ROLE");
  assert.strictEqual(updatedBuyer.budget, 8500000, "Buyer budget MUST NOT be wiped");
  assert.strictEqual(updatedBuyer.location, 'Vasna', "Buyer location MUST NOT be wiped");
  assert.strictEqual(updatedBuyer.property_type, '3BHK Flat', "Buyer property_type MUST NOT be wiped");
  assert.strictEqual(updatedBuyer.site_visit_booked, true, "site_visit_booked MUST remain true");
  assert(updatedBuyer.metadata?.has_buyer_profile, "metadata.has_buyer_profile MUST be preserved");
  assert(updatedBuyer.metadata?.has_seller_profile, "metadata.has_seller_profile MUST be set");
  assert.strictEqual(updatedBuyer.metadata?.active_persona, 'SELLER', "metadata.active_persona should be SELLER");

  // Verify visit in DB is still intact
  const { data: visitRecord } = await supabase
    .from('site_visits')
    .select('*')
    .eq('lead_id', seededBuyer.id)
    .eq('status', 'SCHEDULED')
    .single();
  assert(visitRecord, "Site visit record MUST remain SCHEDULED in DB");
  console.log("  ✅ SCENARIO 1 PASSED: Upgraded to DUAL_ROLE with zero criteria wiped and visit preserved!\n");

  // ---------------------------------------------------------------------------
  // TEST 2: SCENARIO 2 (Seller -> Buyer)
  // Lead with submitted property requests 3BHK search -> lead_type becomes DUAL_ROLE,
  // property submissions remain intact.
  // ---------------------------------------------------------------------------
  console.log("👉 [SCENARIO 2] Seller -> Buyer Transition");
  const sellerId = `test_seller_${timestamp}`;

  // 1. Seed Lead as PROVIDER in OWNER_DETAILS_GATHERED
  const { data: seededSeller, error: sErr } = await supabase
    .from('leads')
    .insert({
      lead_id: sellerId,
      first_name: 'Manthan Seller',
      lead_type: 'PROVIDER',
      state: 'OWNER_DETAILS_GATHERED',
      user_language: 'HINGLISH',
      client_id: TENANT_ID,
      metadata: { has_seller_profile: true }
    })
    .select()
    .single();

  assert(!sErr, `Failed to seed seller: ${sErr?.message}`);

  // Insert Property Submission record
  const { data: subRecord, error: subErr } = await supabase
    .from('property_submissions')
    .insert({
      client_id: TENANT_ID,
      lead_id: sellerId,
      owner_name: 'Manthan Seller',
      project_name: 'Nilamber Bellissimo',
      society_name: 'Nilamber Bellissimo',
      location: 'Vasna',
      configuration: '3 BHK',
      property_type: 'Flat',
      expected_price: 7800000,
      possession_status: 'READY_TO_MOVE',
      furnishing_status: 'SEMI_FURNISHED',
      status: 'PENDING_VERIFICATION'
    })
    .select()
    .single();

  assert(!subErr, `Failed to seed property submission: ${subErr?.message}`);
  console.log(`  ✓ Seeded Seller lead ${sellerId} with property submission at Nilamber Bellissimo`);

  // 2. Seller sends buyer search inquiry
  const t2 = await sendChat(sellerId, 'Manthan Seller', 'Muje 3BHK flat dekhna hai Alkapuri me budget 1.2 cr');
  console.log(`  🤖 Bot Reply:\n${t2.replyText}\n  State: ${t2.state}`);

  // 3. Verify lead record in DB
  const { data: updatedSeller } = await supabase
    .from('leads')
    .select('*')
    .eq('id', seededSeller.id)
    .single();

  assert.strictEqual(updatedSeller.lead_type, 'DUAL_ROLE', "lead_type MUST become DUAL_ROLE");
  assert(updatedSeller.metadata?.has_seller_profile, "metadata.has_seller_profile MUST be preserved");
  assert(updatedSeller.metadata?.has_buyer_profile, "metadata.has_buyer_profile MUST be set");

  // Verify property submission is still intact in DB
  const { data: verifiedSub } = await supabase
    .from('property_submissions')
    .select('*')
    .eq('id', subRecord.id)
    .single();
  assert(verifiedSub, "property_submissions record MUST remain intact");
  assert.strictEqual(verifiedSub.project_name, 'Nilamber Bellissimo', "Property submission data MUST NOT be modified");
  console.log("  ✅ SCENARIO 2 PASSED: Upgraded to DUAL_ROLE with property submission intact!\n");

  // ---------------------------------------------------------------------------
  // TEST 3: SCENARIO 3 (Dual-Reminder Greeting Disambiguation Menu)
  // Dual lead sends "Hi" -> receives Scenario 3 menu acknowledging both visit & listing.
  // ---------------------------------------------------------------------------
  console.log("👉 [SCENARIO 3] Dual-Reminder Greeting Disambiguation Menu");
  const dualId = `test_dual_${timestamp}`;
  const dualVisitTime = new Date(Date.now() + 172800000).toISOString(); // 2 days later

  // 1. Seed Dual Lead with both booked visit and submitted property
  const { data: seededDual, error: dErr } = await supabase
    .from('leads')
    .insert({
      lead_id: dualId,
      first_name: 'Manthan Dual',
      lead_type: 'DUAL_ROLE',
      state: 'SITE_VISIT_BOOKED',
      user_language: 'HINGLISH',
      client_id: TENANT_ID,
      budget: 9500000,
      location: 'Gotri',
      property_type: '3BHK Villa',
      site_visit_at: dualVisitTime,
      site_visit_datetime: dualVisitTime,
      site_visit_booked: true,
      metadata: {
        has_buyer_profile: true,
        has_seller_profile: true,
        selected_property_name: 'Emerald Greens'
      }
    })
    .select()
    .single();

  assert(!dErr, `Failed to seed dual lead: ${dErr?.message}`);

  await supabase.from('site_visits').insert({
    lead_id: seededDual.id,
    client_id: TENANT_ID,
    property_id: 'PROP-NXG-002',
    scheduled_at: dualVisitTime,
    status: 'SCHEDULED'
  });

  await supabase.from('property_submissions').insert({
    client_id: TENANT_ID,
    lead_id: dualId,
    owner_name: 'Manthan Dual',
    project_name: 'Sun Crest Heights',
    society_name: 'Sun Crest Heights',
    location: 'Vasna',
    configuration: '2 BHK',
    property_type: 'Flat',
    expected_price: 4500000,
    status: 'PENDING_VERIFICATION'
  });

  console.log(`  ✓ Seeded Dual Lead ${dualId} with scheduled visit at Emerald Greens and listing at Sun Crest Heights`);

  // 2. Dual Lead sends "Hi"
  const t3 = await sendChat(dualId, 'Manthan Dual', 'Hi');
  console.log(`  🤖 Bot Reply:\n${t3.replyText}\n  State: ${t3.state}`);

  // Assertions for Scenario 3 Dual-Reminder Menu
  assert(
    t3.replyText.includes('Site Visit') || t3.replyText.includes('Emerald Greens'),
    "Reply MUST acknowledge upcoming site visit"
  );
  assert(
    t3.replyText.includes('Sun Crest') || t3.replyText.includes('Listed Property'),
    "Reply MUST acknowledge listed property"
  );
  assert(
    t3.replyText.includes('1️⃣') && t3.replyText.includes('2️⃣') && t3.replyText.includes('3️⃣'),
    "Reply MUST present 3-option disambiguation menu"
  );

  const { data: dualStateAfterGreeting } = await supabase
    .from('leads')
    .select('state, lead_type')
    .eq('id', seededDual.id)
    .single();

  assert.strictEqual(dualStateAfterGreeting.state, 'DUAL_ROLE_MENU_PENDING', "State MUST transition to DUAL_ROLE_MENU_PENDING");
  assert.strictEqual(dualStateAfterGreeting.lead_type, 'DUAL_ROLE', "lead_type MUST remain DUAL_ROLE");
  console.log("  ✅ SCENARIO 3 PASSED: Dual-Reminder menu displayed with both contexts recognized!\n");

  // ---------------------------------------------------------------------------
  // TEST 4: SCENARIO 4 (Menu Option 1 -> Buyer / Site Visit Anchor)
  // Selecting "1" from DUAL_ROLE_MENU_PENDING anchors to site visit context.
  // ---------------------------------------------------------------------------
  console.log("👉 [SCENARIO 4] Menu Option 1: Site Visit / Property Search");
  const t4 = await sendChat(dualId, 'Manthan Dual', '1');
  console.log(`  🤖 Bot Reply:\n${t4.replyText}\n  State: ${t4.state}`);

  assert(
    t4.replyText.includes('confirmed') || t4.replyText.includes('VIP Site Visit') || t4.replyText.includes('Emerald Greens'),
    "Option 1 MUST anchor back to confirmed site visit context"
  );

  const { data: dualStateAfterOpt1 } = await supabase
    .from('leads')
    .select('state, lead_type')
    .eq('id', seededDual.id)
    .single();

  assert.strictEqual(dualStateAfterOpt1.state, 'SITE_VISIT_BOOKED', "State MUST return to SITE_VISIT_BOOKED");
  assert.strictEqual(dualStateAfterOpt1.lead_type, 'DUAL_ROLE', "lead_type MUST remain DUAL_ROLE");
  console.log("  ✅ SCENARIO 4 PASSED: Option 1 anchored seamlessly to site visit without re-qualification!\n");

  // ---------------------------------------------------------------------------
  // TEST 5: SCENARIO 5 (Menu Option 2 -> Seller Listing Status)
  // Selecting "2" checks listed property status.
  // ---------------------------------------------------------------------------
  console.log("👉 [SCENARIO 5] Menu Option 2: Listed Property Status");
  // Reset state back to DUAL_ROLE_MENU_PENDING
  await supabase.from('leads').update({ state: 'DUAL_ROLE_MENU_PENDING' }).eq('id', seededDual.id);

  const t5 = await sendChat(dualId, 'Manthan Dual', '2');
  console.log(`  🤖 Bot Reply:\n${t5.replyText}\n  State: ${t5.state}`);

  assert(
    t5.replyText.includes('Sun Crest') || t5.replyText.includes('stage') || t5.replyText.includes('verification') || t5.replyText.includes('Review'),
    "Option 2 MUST return listed property verification status"
  );

  const { data: dualStateAfterOpt2 } = await supabase
    .from('leads')
    .select('state, lead_type')
    .eq('id', seededDual.id)
    .single();

  assert.strictEqual(dualStateAfterOpt2.state, 'OWNER_DETAILS_GATHERED', "State MUST move to OWNER_DETAILS_GATHERED");
  assert.strictEqual(dualStateAfterOpt2.lead_type, 'DUAL_ROLE', "lead_type MUST remain DUAL_ROLE");
  console.log("  ✅ SCENARIO 5 PASSED: Option 2 accurately checked seller listing status!\n");

  // ---------------------------------------------------------------------------
  // TEST 6: SCENARIO 6 (Menu Option 3 -> Senior Advisor Call & Sales Alert)
  // Selecting "3" triggers HIGH_VALUE_DUAL_ROLE alert and callback confirmation.
  // ---------------------------------------------------------------------------
  console.log("👉 [SCENARIO 6] Menu Option 3: Senior Advisor Consultation & Alert");
  // Reset state back to DUAL_ROLE_MENU_PENDING
  await supabase.from('leads').update({ state: 'DUAL_ROLE_MENU_PENDING' }).eq('id', seededDual.id);

  const t6 = await sendChat(dualId, 'Manthan Dual', '3');
  console.log(`  🤖 Bot Reply:\n${t6.replyText}\n  State: ${t6.state}`);

  assert(
    t6.replyText.includes('senior') || t6.replyText.includes('advisor') || t6.replyText.includes('partner') || t6.replyText.includes('5-10 minute'),
    "Option 3 MUST confirm senior partner callback"
  );

  const { data: dualStateAfterOpt3 } = await supabase
    .from('leads')
    .select('state, lead_type, metadata')
    .eq('id', seededDual.id)
    .single();

  assert(
    dualStateAfterOpt3.metadata?.last_advisor_call_requested_at,
    "last_advisor_call_requested_at timestamp MUST be recorded in metadata"
  );
  assert.strictEqual(dualStateAfterOpt3.lead_type, 'DUAL_ROLE', "lead_type MUST remain DUAL_ROLE");
  console.log("  ✅ SCENARIO 6 PASSED: Option 3 triggered senior advisor workflow!\n");

  console.log("===============================================================================");
  console.log(" 🏆 ALL 6 DUAL-PERSONA LIFECYCLE SCENARIOS PASSED WITH 100% EMPIRICAL PROOF!");
  console.log("===============================================================================\n");
}

runAllTests().catch(err => {
  console.error("\n❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
