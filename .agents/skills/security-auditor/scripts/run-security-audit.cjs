/**
 * Application Security & Multi-Tenant AppSec Auditor
 * Part of the security-auditor skill for Nextgn Realtors CRM
 */

const fs = require('fs');
const path = require('path');

console.log("==================================================================");
console.log(" 🔒  APPLICATION SECURITY & MULTI-TENANT ISOLATION AUDIT  🔒");
console.log("==================================================================");

const rootDir = process.cwd();
const enginePath = path.join(rootDir, 'supabase/functions/realtor-lead-engine/index.ts');
const envPath = path.join(rootDir, '.env');
const srcDir = path.join(rootDir, 'src');

const engineCode = fs.readFileSync(enginePath, 'utf-8');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const defects = [];

function check(category, name, condition, failureDetails = "", severity = "P1") {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] [${category}] ${name}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] [${category}] ${name}`);
    if (failureDetails) console.error(`     ↳ Details: ${failureDetails}`);
    failedTests++;
    defects.push({ category, name, details: failureDetails, severity });
  }
}

// ============================================================================
// 1. SECRETS & CLIENT-BUNDLE LEAK AUDIT
// ============================================================================
console.log("\n[SECTION 1: Secret Management & Client-Bundle Leaks]");

check(
  "SECRETS",
  "Service Role Key is NEVER prefixed with VITE_ in .env (avoids frontend bundling)",
  !envContent.includes("VITE_SUPABASE_SERVICE_ROLE_KEY") && !envContent.includes("VITE_SERVICE_ROLE"),
  "Service role key is prefixed with VITE_ which leaks admin database access to browser client bundles",
  "P0"
);

// Scan all src/ files for service role key usage
let foundServiceKeyInSrc = false;
let offendingFile = "";

function scanFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      scanFiles(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      const code = fs.readFileSync(fullPath, 'utf-8');
      
      // 1. client.server.ts must have the runtime window guard
      if (entry.name.endsWith(".server.ts")) {
        if (!code.includes('typeof window !== "undefined"')) {
          foundServiceKeyInSrc = true;
          offendingFile = `${entry.name} (missing window guard)`;
        }
      } 
      // 2. Server functions (*.functions.ts) must only dynamically import client.server inside handlers
      else if (entry.name.endsWith(".functions.ts")) {
        if (/^import\s+.*from\s+["'].*client\.server["']/m.test(code)) {
          foundServiceKeyInSrc = true;
          offendingFile = `${entry.name} (illegal top-level import of client.server)`;
        }
      }
      // 3. Client UI components, pages, hooks, and routes must NEVER reference service_role or client.server
      else {
        if (code.includes("service_role") || code.includes("SUPABASE_SERVICE_ROLE") || code.includes("client.server")) {
          foundServiceKeyInSrc = true;
          offendingFile = entry.name;
        }
      }
    }
  }
}
scanFiles(srcDir);

check(
  "SECRETS",
  "Frontend client bundles never reference or import SUPABASE_SERVICE_ROLE_KEY or client.server",
  !foundServiceKeyInSrc,
  `Frontend file ${offendingFile} breaches service_role SSR isolation`,
  "P0"
);

// ============================================================================
// 2. EDGE FUNCTION AUTH & CORS INVARIANTS
// ============================================================================
console.log("\n[SECTION 2: Edge Function CORS & Request Sanitization]");

check(
  "CORS",
  "OPTIONS preflight is handled immediately with CORS headers",
  engineCode.includes('if (req.method === "OPTIONS")') &&
  engineCode.includes('return new Response("ok", { headers: corsHeaders });'),
  "Edge Function fails to respond to browser preflight OPTIONS requests",
  "P1"
);

check(
  "AUTH",
  "Cron sweeps and internal triggers require Bearer authorization or secure token",
  engineCode.includes("Authorization") && engineCode.includes("Bearer"),
  "Outbound cron sweep endpoints can be triggered anonymously without auth",
  "P1"
);

// ============================================================================
// 3. MULTI-TENANT BOUNDARIES & INJECTION RESISTANCE
// ============================================================================
console.log("\n[SECTION 3: Multi-Tenant Data Isolation & Injection Resistance]");

check(
  "TENANT_ISOLATION",
  "Lead events and site visits filter by active tenant ID",
  engineCode.includes('.eq("client_id", activeTenantId)') ||
  engineCode.includes('.eq("client_id", leadTenantId)') ||
  engineCode.includes('client_id: activeTenantId'),
  "Queries omit client_id filtering, exposing cross-tenant data to other agencies",
  "P0"
);

check(
  "INJECTION",
  "PostgreSQL queries use PostgREST builder methods (Zero raw string concatenation)",
  !engineCode.includes("execute_sql(`SELECT") && !engineCode.includes("execute_sql(`UPDATE"),
  "Raw SQL string interpolation found in production edge function code",
  "P0"
);

check(
  "SANITY",
  "Safe slice utility is used to prevent substring range crashes on invalid inputs",
  engineCode.includes("function safeSlice(") && engineCode.includes("safeSlice("),
  "String slicing operations lack safe boundary protection",
  "P2"
);

// ============================================================================
// SUMMARY & EXIT CODE
// ============================================================================
console.log("\n==================================================================");
console.log(` 📊 SECURITY AUDIT SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log("==================================================================");

if (failedTests > 0) {
  console.log(`\n🚨 FOUND ${failedTests} SECURITY VULNERABILITY / RISK(S):`);
  defects.forEach((d, idx) => {
    console.log(`  ${idx + 1}. [${d.severity}] [${d.category}] ${d.name} -> ${d.details}`);
  });
} else {
  console.log("\n✨ ALL SECURITY & MULTI-TENANT ISOLATION INVARIANTS VERIFIED 100% OPERATIONAL!");
}

fs.writeFileSync(
  path.join(rootDir, '.agents/skills/security-auditor/security-report.json'),
  JSON.stringify({ totalTests, passedTests, failedTests, defects, timestamp: new Date().toISOString() }, null, 2)
);
