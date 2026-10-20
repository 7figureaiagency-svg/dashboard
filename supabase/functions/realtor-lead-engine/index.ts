import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 1. Supabase Initialization
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://yeiygfysijptjdepctnx.supabase.co";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const defaultBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "8510179672:AAFBvqPI2ei_ZVp4CGMG81HYt25Hn6JKdX8";
const defaultTenantId = "8699dca1-2b97-4367-85b8-8a0db2fd51f5"; // Nextgen Realty

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 2. Outbound Dispatchers
async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  if (!botToken || botToken.startsWith("bot_token_")) return { simulated: true };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.error("Telegram send error:", err.message);
    return { error: err.message };
  }
}

function formatForWhatsApp(text: string): string {
  if (!text) return "";
  let out = text;
  // Convert HTML anchor links: <a href="URL">TEXT</a> -> TEXT: URL
  out = out.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "$2: $1");
  // Convert bold: <b>...</b>, <strong>...</strong> -> *...*
  out = out.replace(/<\/?(?:b|strong)>/gi, "*");
  // Convert italic: <i>...</i>, <em>...</em> -> _..._
  out = out.replace(/<\/?(?:i|em)>/gi, "_");
  // Convert code: <code>...</code> -> `...`
  out = out.replace(/<\/?code>/gi, "`");
  // Strip any other HTML tags
  out = out.replace(/<[^>]+>/g, "");
  // Clean double asterisks
  out = out.replace(/\*{2,}/g, "*");
  return out.trim();
}

function formatPriceShort(priceNum: number): string {
  if (priceNum >= 10000000) {
    return `₹${(priceNum / 10000000).toFixed(2)} Cr`;
  } else if (priceNum >= 100000) {
    return `₹${(priceNum / 100000).toFixed(0)} Lakhs`;
  } else if (priceNum > 0) {
    return `₹${priceNum.toLocaleString("en-IN")}`;
  }
  return "N/A";
}

async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, toPhone: string, text: string) {
  if (!phoneNumberId || !accessToken) return { simulated: true };
  try {
    const cleanText = formatForWhatsApp(text);
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: cleanText },
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.error("WhatsApp send error:", err.message);
    return { error: err.message };
  }
}

// 3. Sales Alert Dispatcher (Workflow 2: WmhDkALbtmTVgsYQ)
async function dispatchSalesAlert(
  tenantId: string,
  alertType: string,
  lead: any,
  extra: { scheduledAt?: string; property?: any; userText?: string; submission?: any; hint?: string } = {}
) {
  try {
    // 1. Fetch assigned executive, tenant manager, or any active executive
    let targetExecutive: any = null;
    if (lead?.assigned_executive_id && alertType !== "NO_PROPERTY_MATCH") {
      const { data: exec } = await supabase
        .from("executives")
        .select("*")
        .eq("id", lead.assigned_executive_id)
        .maybeSingle();
      targetExecutive = exec;
    }

    if (!targetExecutive) {
      // Route to Manager (role = 'manager')
      const { data: mgr } = await supabase
        .from("executives")
        .select("*")
        .eq("client_id", tenantId)
        .eq("role", "manager")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      targetExecutive = mgr;
    }

    if (!targetExecutive) {
      // Fallback: any active executive for this tenant who has telegram_id or phone configured
      const { data: anyExec } = await supabase
        .from("executives")
        .select("*")
        .eq("client_id", tenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      targetExecutive = anyExec;
    }

    // 2. Category badge & pitch hint matrix
    let badge = "🚨 HIGH-INTENT LEAD UPDATE";
    let pitchHint = "Immediate follow-up required.";

    switch (alertType) {
      case "SITE_VISIT_BOOKED":
        badge = "🔥 NEW SITE VISIT BOOKED";
        pitchHint = "Customer expects senior executive on site. Keep sample flat/office keys ready, coordinate on-site presence 15 mins prior, and confirm route & parking space.";
        break;
      case "NEGOTIATION_REQUEST":
        badge = "💰 DISCOUNT / PRICE NEGOTIATION";
        pitchHint = "Customer discount discuss kar raha hai. Call within 5 mins: 'Sir, developer token spot discount aur customized payment schedule site visit par baith kar direct finalize ho jayega. Aaj ya kal milte hain.'";
        break;
      case "COMPLEX_FAQ":
        badge = "❓ PROJECT / SPECIFIC FAQ";
        pitchHint = "Technical/RERA/Possession query hai. Direct call par exact details samjha kar immediate VIP Site Visit pitch karein.";
        break;
      case "NO_PROPERTY_MATCH":
        badge = "⚠️ NO MATCHING PROPERTY (OFF-MARKET SOURCING)";
        pitchHint = extra.hint || "Inventory me exact criteria nahi mila. Customer se call par criteria relax karwayen ya off-market broker network options source karein.";
        break;
      case "RESCHEDULE_VISIT":
        badge = "📅 SITE VISIT RESCHEDULE";
        pitchHint = "Customer visit reschedule karna chahta hai. Immediate call karke convenient time confirm karein.";
        break;
      case "CANCEL_VISIT":
        badge = "⚠️ SITE VISIT CANCELLATION";
        pitchHint = "Customer visit cancel kar raha hai. Reason poochein aur alternate date ya fresh options offer karein.";
        break;
      case "BROCHURE_REQUEST":
        badge = "📄 BROCHURE / DETAILS REQUESTED";
        pitchHint = "Complete document share karke 5 mins baad call par key highlights discuss karein.";
        break;
      case "MAP_REQUEST":
        badge = "📍 LOCATION / MAP LINK REQUESTED";
        pitchHint = "Google Map link send karke direct site route assist karein.";
        break;
      case "FEEDBACK_RECEIVED":
        badge = "💬 POST-VISIT FEEDBACK RECEIVED";
        pitchHint = "Customer ne site visit ke baad feedback share kiya hai. Review karke discount, loan ya builder sitting finalize karein.";
        break;
      case "VISIT_MISSED":
        badge = "⚠️ SITE VISIT MISSED (HIGH RE-ENGAGEMENT PRIORITY)";
        pitchHint = "Customer site visit attend nahi kar paya. Call with empathy: 'Sir koi problem aa gayi thi kya? Main kal shaam ya weekend ka slot book karwa deta hu.'";
        break;
      case "UNCONFIRMED_VISIT":
        badge = "⏳ SITE VISIT ATTENDANCE UNCONFIRMED";
        pitchHint = "Customer ne site visit attendance message ka reply nahi diya. 1-minute courtesy call karke visit attendance verify karein aur fresh visit plan karein.";
        break;
      case "NEW_OWNER_LISTING":
        badge = "🏡 NEW OWNER PROPERTY LISTING";
        pitchHint = extra.hint || "Call owner within 15 mins: verify ownership paperwork, confirm asking price flexibility, and schedule on-site inspection & photography.";
        break;
    }

    // 3. Compose rich HTML alert for Sales / Acquisition Team
    const isOwnerAlert = alertType === "NEW_OWNER_LISTING";
    const sub = extra.submission || {};
    const alertHtml = isOwnerAlert
      ? `
<b>${badge}</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Owner:</b> ${lead?.first_name || sub.owner_name || "Property Owner"}
📱 <b>Phone / ID:</b> <code>${lead?.phone || lead?.lead_id}</code>
🏢 <b>Property:</b> ${sub.configuration || ""} ${sub.property_type || "Property"} in ${sub.society_name || sub.project_name || "Society"} (${sub.location || "Prime Location"})
📐 <b>Size:</b> ${sub.carpet_area_sqft ? `${sub.carpet_area_sqft} sq.ft Carpet` : "—"} | ${sub.furnishing_status || "Standard"}
💰 <b>Expected ${sub.transaction_type || "Price"}:</b> ₹${Number(sub.expected_price || sub.expected_rent || 0).toLocaleString("en-IN")}
🔑 <b>Possession:</b> ${sub.possession_status || "Ready to Move"}
💬 <b>User Message:</b> <i>"${extra.userText || "—"}"</i>
━━━━━━━━━━━━━━━━━━━━
💡 <b>Actionable Hint:</b>
<i>${pitchHint}</i>
━━━━━━━━━━━━━━━━━━━━
👉 <i>Assigned to: ${targetExecutive?.name || "Acquisition / Listing Desk"}</i>
`.trim()
      : `
<b>${badge}</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Customer:</b> ${lead?.first_name || "Prospective Buyer"}
📱 <b>Phone / ID:</b> <code>${lead?.phone || lead?.lead_id}</code>
💬 <b>User Message:</b> <i>"${extra.userText || "—"}"</i>
📊 <b>Status / State:</b> <code>${lead?.state || "QUALIFYING"}</code>
🎯 <b>Criteria:</b> ${lead?.property_type || "—"} | ${lead?.location || "Any Area"} | ₹${lead?.budget ? Number(lead.budget).toLocaleString("en-IN") : "—"}
${extra.scheduledAt ? `⏰ <b>Scheduled Slot:</b> ${new Date(extra.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}\n` : ""}${extra.property ? `🏢 <b>Project:</b> ${extra.property.project_name} (${extra.property.location})\n` : ""}
💡 <b>Pitching Hint:</b>
<i>${pitchHint}</i>
━━━━━━━━━━━━━━━━━━━━
👉 <i>Assigned to: ${targetExecutive?.name || "General Sales Desk"}</i>
`.trim();

    // 4. Resolve Telegram Chat ID (check telegram_id first, then fallback to phone if numeric ID)
    let telegramChatId: string | null = null;
    const cleanTelId = (targetExecutive?.telegram_id || "").trim();
    const cleanPhone = (targetExecutive?.phone || "").replace(/\D/g, "");

    if (/^-?\d+$/.test(cleanTelId)) {
      telegramChatId = cleanTelId;
    } else if (cleanPhone.length >= 8 && cleanPhone.length <= 15) {
      telegramChatId = cleanPhone;
    }

    if (telegramChatId) {
      console.log(`[SalesAlert] Dispatching Telegram alert to ${targetExecutive?.name || "Desk"} (Chat ID: ${telegramChatId})`);
      const tgRes = await sendTelegramMessage(defaultBotToken, telegramChatId, alertHtml);
      if (tgRes?.ok === false) {
        console.warn(`[SalesAlert] Telegram dispatch failed for chat_id ${telegramChatId}:`, tgRes?.description);
      }
    } else {
      console.warn(`[SalesAlert] No valid Telegram Chat ID found for executive ${targetExecutive?.name || "None"}. Set numeric telegram_id or phone.`);
    }

    // 5. WhatsApp Sales Alert (Production Mode)
    // If client has active WhatsApp Business API and executive has a mobile phone number
    try {
      const { data: clientRec } = await supabase
        .from("clients")
        .select("access_token, phone_number_id")
        .eq("id", tenantId)
        .maybeSingle();

      if (clientRec?.access_token && clientRec?.phone_number_id && targetExecutive?.phone) {
        const waPhone = targetExecutive.phone.replace(/\D/g, "");
        if (waPhone.length >= 10 && waPhone.length <= 13) {
          const formattedWaPhone = waPhone.startsWith("91") && waPhone.length === 12
            ? waPhone
            : waPhone.length === 10
            ? `91${waPhone}`
            : waPhone;
          const plainAlertText = alertHtml
            .replace(/<b>(.*?)<\/b>/g, "*$1*")
            .replace(/<i>(.*?)<\/i>/g, "_$1_")
            .replace(/<code>(.*?)<\/code>/g, "`$1`")
            .replace(/<[^>]*>/g, "");
          console.log(`[SalesAlert] Dispatching WhatsApp alert to ${targetExecutive.name} (${formattedWaPhone})`);
          await sendWhatsAppMessage(clientRec.phone_number_id, clientRec.access_token, formattedWaPhone, plainAlertText);
        }
      }
    } catch (waErr: any) {
      console.warn("[SalesAlert] WhatsApp executive alert error:", waErr.message);
    }

    // 6. Log sales alert event in database
    await supabase.from("lead_events").insert({
      client_id: tenantId,
      lead_id: lead?.lead_id,
      event_type: alertType,
      payload: {
        assigned_to: targetExecutive?.name,
        telegram_chat_id: telegramChatId,
        badge,
        pitchHint,
        extra,
      },
    });

    // Update alert_sent_at on lead
    if (lead?.id) {
      await supabase
        .from("leads")
        .update({ alert_sent_at: new Date().toISOString() })
        .eq("id", lead.id);
    }
  } catch (err: any) {
    console.error("Sales alert dispatch error:", err.message);
  }
}

// 4. Working Hours Check (IST: UTC + 5:30)
function getIstTime() {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffsetMs);
}

function isWithinWorkingHours(startHour = 10, endHour = 19): boolean {
  const ist = getIstTime();
  const hour = ist.getUTCHours();
  return hour >= startHour && hour < endHour;
}

// 5. Natural Language Slot Parser with 10 AM - 6 PM IST Validation
function parseVisitSlot(slotText = ""): { isoUtc: string; isValidTime: boolean; isPast: boolean } {
  const text = slotText.toLowerCase().trim();
  const ist = getIstTime();

  let targetYear = ist.getUTCFullYear();
  let targetMonth = ist.getUTCMonth();
  let targetDay = ist.getUTCDate();
  const currentDayOfWeek = ist.getUTCDay();

  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayIndex = days.findIndex((d) => text.includes(d));

  if (dayIndex !== -1) {
    let daysAhead = (dayIndex - currentDayOfWeek + 7) % 7;
    if (daysAhead === 0) daysAhead = 7;
    targetDay += daysAhead;
  } else if (text.includes("aaj") || text.includes("today")) {
    // Today
  } else if (text.includes("kal") || text.includes("tomorrow")) {
    targetDay += 1;
  } else if (text.includes("parso") || text.includes("day after")) {
    targetDay += 2;
  } else {
    targetDay += 1; // Default tomorrow
  }

  let hours = 17; // Default 5 PM IST
  let minutes = 0;
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|vage)?/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = timeMatch[3]?.toLowerCase();
    let isPm = period === "pm";
    let isAm = period === "am";
    if (text.includes("sham") || text.includes("shaam") || text.includes("evening") || text.includes("sanje") || text.includes("dopahar") || text.includes("bapori")) {
      isPm = true;
    } else if (text.includes("subah") || text.includes("savare") || text.includes("morning")) {
      isAm = true;
    } else if (h <= 7) {
      isPm = true; // 1-7 in real estate visits default to PM
    }
    if (isPm && h < 12) h += 12;
    if (isAm && h === 12) h = 0;
    hours = h;
    minutes = m;
  }

  // Working hours validation: Strictly 10 AM (10:00) to 6 PM (18:00) IST
  const isValidTime = hours >= 10 && (hours < 18 || (hours === 18 && minutes === 0));

  const istAsUtcEpoch = Date.UTC(targetYear, targetMonth, targetDay, hours, minutes, 0, 0);
  const realUtcEpoch = istAsUtcEpoch - 5.5 * 60 * 60 * 1000;
  const isPast = realUtcEpoch < Date.now();

  return {
    isoUtc: new Date(realUtcEpoch).toISOString(),
    isValidTime,
    isPast,
  };
}

// 6. Indic Digit Normalization & Multi-Lingual Location Mapping
function normalizeIndicDigits(text: string): string {
  const indicDigits: Record<string, string> = {
    "૦": "0", "૧": "1", "૨": "2", "૩": "3", "૪": "4",
    "૫": "5", "૬": "6", "૭": "7", "૮": "8", "૯": "9",
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
  };
  const str = typeof text === "string" ? text : (text?.text || text?.body || (text != null ? String(text) : ""));
  return str.replace(/[૦-૯०-९]/g, (d: string) => indicDigits[d] || d);
}

const GUJARATI_HINDI_LOCATION_MAP: Record<string, string> = {
  // Alkapuri
  "અલકાપુરી": "Alkapuri",
  "अलकापुरी": "Alkapuri",
  "alkapuri": "Alkapuri",

  // Gotri
  "ગોત્રી": "Gotri",
  "गोत्री": "Gotri",
  "ગોત્રી રોડ": "Gotri Road",
  "गोत्री रोड": "Gotri Road",
  "gotri": "Gotri",
  "gotri road": "Gotri Road",

  // Vasna - Bhayli
  "વાસણા": "Vasna-Bhayli Road",
  "વાસણા ભાયલી": "Vasna-Bhayli Road",
  "વાસણા-ભાયલી": "Vasna-Bhayli Road",
  "વાસણા ભાયલી રોડ": "Vasna-Bhayli Road",
  "વાસણા રોડ": "Vasna-Bhayli Road",
  "ભાયલી": "Vasna-Bhayli Road",
  "vasna": "Vasna-Bhayli Road",
  "bhayli": "Vasna-Bhayli Road",
  "vasna bhayli": "Vasna-Bhayli Road",
  "vasna bhayli road": "Vasna-Bhayli Road",
  "vasna-bhayli road": "Vasna-Bhayli Road",
  "भायली": "Vasna-Bhayli Road",
  "वासना": "Vasna-Bhayli Road",

  // Sayajigunj
  "સયાજીગંજ": "Sayajigunj",
  "सयाजीगंज": "Sayajigunj",
  "sayajigunj": "Sayajigunj",
  "sayaji ganj": "Sayajigunj",

  // Waghodia Road
  "વાઘોડિયા": "Waghodia Road",
  "વાઘોડીયા": "Waghodia Road",
  "વાઘોડિયા રોડ": "Waghodia Road",
  "વાઘોડીયા રોડ": "Waghodia Road",
  "वाघोडिया": "Waghodia Road",
  "वाघोडिया रोड": "Waghodia Road",
  "waghodia": "Waghodia Road",
  "waghodia road": "Waghodia Road",

  // Manjalpur
  "માંજલપુર": "Manjalpur",
  "માન્જલપુર": "Manjalpur",
  "मांजलपुर": "Manjalpur",
  "manjalpur": "Manjalpur",

  // Karelibaug
  "કારેલીબાગ": "Karelibaug",
  "કારેલી બાગ": "Karelibaug",
  "करेलीबाग": "Karelibaug",
  "karelibaug": "Karelibaug",

  // Makarpura
  "મકરપુરા": "Makarpura",
  "મકર પુરા": "Makarpura",
  "मकरपुरा": "Makarpura",
  "makarpura": "Makarpura",

  // Akota
  "અકોટા": "Akota",
  "अकोटा": "Akota",
  "akota": "Akota",

  // Kalali
  "કલાલી": "Kalali",
  "कलाली": "Kalali",
  "kalali": "Kalali",

  // Sevasi
  "સેવાસી": "Sevasi",
  "સેવાસી રોડ": "Sevasi",
  "सेवासा": "Sevasi",
  "sevasi": "Sevasi",

  // Other Vadodara localities
  "નિઝામપુરા": "Nizampura",
  "निजामपुरा": "Nizampura",
  "nizampura": "Nizampura",
  "ગોરવા": "Gorwa",
  "gorwa": "Gorwa",
  "હરણી": "Harni",
  "harni": "Harni",
  "સુભાનપુરા": "Subhanpura",
  "subhanpura": "Subhanpura",
  "તરસાલી": "Tarsali",
  "tarsali": "Tarsali",
  "અટલાદરા": "Atladra",
  "atladra": "Atladra",
  "ઓપી રોડ": "Old Padra Road",
  "ઓલ્ડ પાદરા રોડ": "Old Padra Road",
  "old padra road": "Old Padra Road",
  "ફતેગંજ": "Fatehgunj",
  "fatehgunj": "Fatehgunj",
  "રાવપુરા": "Raopura",
  "છાણી": "Chhani",
  "સમા": "Sama",
};

function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length < s2.length ? s1 : s2;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
}

function normalizePhoneticLocation(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[,\-_.\/]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(?:road|rd|area|near|cross|circle|chokdi|rasta|highway|expressway)\b/gi, "")
    .replace(/w/g, "v")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/sh/g, "s")
    .replace(/gh/g, "g")
    .replace(/dh/g, "d")
    .replace(/bh/g, "b")
    .trim();
}

const NON_LOCATION_BLACKLIST = /(?:^|\b)(?:kuch\s*bhi|koi\s*bhi|aap\s*batao|tame\s*kaho|nahi\s*pata|khabar\s*nathi|nathi\s*khabar|any|anywhere|kahi\s*bhi|best|sasta|achha|koi\s*pan|gamete|all|any\s*area|no\s*preference|flexible|badhiya|theek)\b/i;

function extractLocationFromText(text: string, inventory: any[] = []): string {
  if (!text) return "";
  const raw = text.toLowerCase().trim();

  // Guard: Blacklist check (never extract generic unhelpful phrases as a location)
  if (NON_LOCATION_BLACKLIST.test(raw)) {
    return "";
  }

  // 1. Check direct multi-lingual dictionary (handles Gujarati and Hindi Unicode!)
  for (const [key, mappedLoc] of Object.entries(GUJARATI_HINDI_LOCATION_MAP)) {
    if (raw.includes(key.toLowerCase())) {
      const matchInInv = inventory.find((item: any) =>
        matchesLocation(mappedLoc, item.location, item.landmarks)
      );
      return matchInInv ? matchInInv.location : mappedLoc;
    }
  }

  // 2. Check directly against active inventory locations and landmarks
  if (Array.isArray(inventory) && inventory.length > 0) {
    const cleanLower = raw.replace(/[-_]/g, " ");

    // 2a. Exact or Substring match in active inventory
    for (const item of inventory) {
      const invLoc = (item.location || "").toLowerCase().replace(/[-_]/g, " ");
      const invWords = invLoc.split(/\s+/).filter((w: string) => w.length >= 4 && !["road", "area", "near", "highway"].includes(w));
      if (invLoc && (invLoc.includes(cleanLower) || cleanLower.includes(invLoc) || invWords.some((w: string) => cleanLower.includes(w)))) {
        return item.location;
      }
      if (Array.isArray(item.landmarks)) {
        for (const lm of item.landmarks) {
          const lmL = lm.toLowerCase().replace(/[-_]/g, " ");
          const lmWords = lmL.split(/\s+/).filter((w: string) => w.length >= 4 && !["near", "opp", "road", "complex", "mall"].includes(w));
          if (lmL && (lmL.includes(cleanLower) || cleanLower.includes(lmL) || lmWords.some((w: string) => cleanLower.includes(w)))) {
            return item.location;
          }
        }
      }
    }

    // 2b. Fuzzy & Phonetic match against inventory locations (typo tolerance)
    const rawPhonetic = normalizePhoneticLocation(cleanLower);
    const inputWords = cleanLower.split(/\s+/).filter((w: string) => w.length >= 4 && !["chahiye", "joiye", "me", "ma", "near", "road", "flat", "plot", "villa"].includes(w));

    let bestMatch: { location: string; score: number } | null = null;

    for (const item of inventory) {
      if (!item.location) continue;
      const invPhonetic = normalizePhoneticLocation(item.location);

      // Full phonetic comparison
      const fullSim = stringSimilarity(rawPhonetic, invPhonetic);
      if (fullSim >= 0.80 && (!bestMatch || fullSim > bestMatch.score)) {
        bestMatch = { location: item.location, score: fullSim };
      }

      // Word-by-word comparison
      const invWords = (item.location || "").toLowerCase().replace(/[-_]/g, " ").split(/\s+/).filter((w: string) => w.length >= 4 && !["road", "area", "near"].includes(w));
      for (const iw of invWords) {
        for (const inw of inputWords) {
          const sim = stringSimilarity(inw, iw);
          if (sim >= 0.78 && (!bestMatch || sim > bestMatch.score)) {
            bestMatch = { location: item.location, score: sim };
          }
        }
      }
    }

    if (bestMatch && bestMatch.score >= 0.78) {
      return bestMatch.location;
    }
  }

  return "";
}

function extractLocationsFromText(text: string, inventory: any[] = []): string[] {
  if (!text) return [];
  const raw = text.toLowerCase().trim();
  if (NON_LOCATION_BLACKLIST.test(raw)) return [];

  const chunks = raw
    .split(/\b(?:ya|or|aur|ane|and)\b|[,/]/i)
    .map((c: string) => c.trim())
    .filter((c: string) => c.length >= 3);

  const matched: string[] = [];
  for (const chunk of chunks) {
    const loc = extractLocationFromText(chunk, inventory);
    if (loc && !matched.includes(loc)) {
      matched.push(loc);
    }
  }

  if (matched.length === 0) {
    const single = extractLocationFromText(text, inventory);
    if (single) matched.push(single);
  }

  return matched;
}

// 7. Parsers (Budget, Property Type, Requirement, Purpose, Timeline)
function parseBudgetFromText(text: string): number {
  const normalized = normalizeIndicDigits(text || "");
  const clean = normalized.replace(/,/g, "");
  const lower = clean.toLowerCase().trim();

  // Range: "50-60 lakh", "50 to 60 lakhs" -> take higher end
  const rangeMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:-|to|se|\/)\s*(\d+(?:\.\d+)?)\s*(?:cr|crs|crore|crores|karod|karods|કરોડ|કરૉડ|करोड़|lakh|lakhs|lac|lacs|lak|laks|l|લાખ|लाख|k|હજાર|हज़ार)?(?:(?=[^\w])|$)/i);
  if (rangeMatch && (lower.includes("lakh") || lower.includes("lac") || lower.includes("lak") || lower.includes("cr") || lower.includes("crore") || lower.includes("કરોડ") || lower.includes("કરૉડ") || lower.includes("લાખ") || lower.includes("करोड़") || lower.includes("लाख") || /l\b/i.test(lower))) {
    const highVal = parseFloat(rangeMatch[2]);
    if (lower.includes("cr") || lower.includes("crore") || lower.includes("કરોડ") || lower.includes("કરૉડ") || lower.includes("करोड़")) return highVal * 10000000;
    return highVal * 100000;
  }

  const crMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:cr|crs|crore|crores|karod|karods|કરોડ|કરૉડ|करोड़)(?:(?=[^\w])|$)/i);
  if (crMatch) return parseFloat(crMatch[1]) * 10000000;

  const lakhMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|lak|laks|l|લાખ|लाख)(?:(?=[^\w])|$)/i);
  if (lakhMatch) return parseFloat(lakhMatch[1]) * 100000;

  const kMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:k|hazar|hazaar|thousand|હજાર|हज़ार)(?:(?=[^\w])|$)/i);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;

  const numMatch = lower.match(/\b(\d{4,8})\b/);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    const hasPriceContext = /(?:rent|kiraya|bhadu|budget|rs\.?|₹|inr|per\s*month|\/month|mahina|price|cost|demand)/i.test(lower);
    if (val >= 3000 || hasPriceContext) {
      return val;
    }
  }

  const shortNumMatch = lower.match(/^(?:around|approx|budget|lagbhag|andaje|max|under)?\s*(\d{2,3})\s*$/i);
  if (shortNumMatch) {
    const val = parseInt(shortNumMatch[1], 10);
    if (val >= 15 && val <= 500) return val * 100000;
  }
  return 0;
}

function parsePropertyTypeFromText(text: string): string {
  const normalized = normalizeIndicDigits(text || "");
  const lower = normalized.toLowerCase();

  // 1. Exact BHK Matches
  const bhkMatch = lower.match(/([1-5])\s*(?:bhk|bedroom|bed|room|બીએચકે|बीएचके)/i);
  if (bhkMatch) {
    if (
      lower.includes("villa") || lower.includes("bungalow") || lower.includes("banglow") ||
      lower.includes("row house") || lower.includes("tenament") || lower.includes("tenement") ||
      lower.includes("વિલા") || lower.includes("બંગલો") || lower.includes("રો હાઉસ") || lower.includes("ટેનામેન્ટ")
    ) {
      return `${bhkMatch[1]}BHK Villa`;
    }
    if (
      lower.includes("penthouse") || lower.includes("duplex") ||
      lower.includes("પેન્ટહાઉસ") || lower.includes("ડુપ્લેક્સ")
    ) {
      return `${bhkMatch[1]}BHK Penthouse`;
    }
    return `${bhkMatch[1]}BHK Flat`;
  }

  // 2. Plots & Land
  if (lower.includes("commercial plot") || lower.includes("કોમર્શિયલ પ્લોટ")) return "Commercial Plot";
  if (lower.includes("industrial land") || lower.includes("gidc plot") || lower.includes("industrial plot") || lower.includes("ઇન્ડસ્ટ્રિયલ જમીન")) return "Industrial Land";
  if (lower.includes("agricultural land") || lower.includes("kheti") || lower.includes("farm land") || lower.includes("kheti ni jamin") || lower.includes("ખેતી") || lower.includes("ખેતીની જમીન") || lower.includes("ફાર્મ લેન્ડ")) return "Agricultural Land";
  if (lower.includes("residential plot") || lower.includes("na plot") || lower.includes("રેસિડેન્શિયલ પ્લોટ") || lower.includes("એનએ પ્લોટ")) return "Residential Plot";
  if (lower.includes("plot") || lower.includes("land") || lower.includes("jamin") || lower.includes("zameen") || lower.includes("vasta") || lower.includes("પ્લોટ") || lower.includes("જમીન") || lower.includes("વાડો")) return "Plot";

  // 3. Specific Residential Subtypes
  if (lower.includes("studio") || lower.includes("1rk") || lower.includes("સ્ટુડિયો") || lower.includes("૧rk")) return "Studio Apartment";
  if (lower.includes("penthouse") || lower.includes("duplex") || lower.includes("પેન્ટહાઉસ") || lower.includes("ડુપ્લેક્સ")) return "Penthouse";
  if (lower.includes("farmhouse") || lower.includes("farm house") || lower.includes("ફાર્મહાઉસ") || lower.includes("ફાર્મ હાઉસ")) return "Farmhouse";
  if (lower.includes("row house") || lower.includes("rowhouse") || lower.includes("tenament") || lower.includes("tenement") || lower.includes("રો હાઉસ") || lower.includes("ટેનામેન્ટ")) return "Row House";
  if (
    lower.includes("villa") || lower.includes("bungalow") || lower.includes("banglow") ||
    lower.includes("makan") || lower.includes("ghar") || lower.includes("વિલા") ||
    lower.includes("બંગલો") || lower.includes("મકાન") || lower.includes("ઘર")
  ) {
    return "Villa";
  }
  if (lower.includes("flat") || lower.includes("apartment") || lower.includes("ફ્લેટ") || lower.includes("ઍપાર્ટમેન્ટ") || lower.includes("એપાર્ટમેન્ટ")) return "Flat";

  // 4. Commercial Subtypes
  if (lower.includes("co-working") || lower.includes("coworking") || lower.includes("shared office") || lower.includes("managed office") || lower.includes("કો વર્કિંગ") || lower.includes("શેર્ડ ઓફિસ")) return "Commercial Co-Working";
  if (lower.includes("showroom") || lower.includes("શોરૂમ")) return "Commercial Showroom";
  if (lower.includes("shop") || lower.includes("dukaan") || lower.includes("dukan") || lower.includes("retail") || lower.includes("દુકાન") || lower.includes("સ્ટોર")) return "Commercial Shop";
  if (lower.includes("office") || lower.includes("corporate") || lower.includes("ઓફિસ") || lower.includes("ઑફિસ") || lower.includes("કોર્પોરેટ")) return "Commercial Office";
  if (lower.includes("warehouse") || lower.includes("godown") || lower.includes("logistics") || lower.includes("ગોડાઉન") || lower.includes("વેરહાઉસ")) return "Commercial Warehouse";
  if (lower.includes("industrial shed") || lower.includes("factory") || /\bshed\b/i.test(lower) || lower.includes("workshop") || lower.includes("ફેક્ટરી") || lower.includes("શેડ")) return "Commercial Industrial Shed";
  if (lower.includes("pre-leased") || lower.includes("preleased") || lower.includes("પ્રી લીઝ્ડ") || lower.includes("પ્રીલીઝ્ડ")) return "Commercial Pre-Leased";
  if (lower.includes("restaurant") || lower.includes("cloud kitchen") || lower.includes("cafe") || lower.includes("food court") || lower.includes("રેસ્ટોરન્ટ") || lower.includes("કાફે")) return "Commercial Restaurant";
  if (lower.includes("hotel") || lower.includes("guest house") || lower.includes("guesthouse") || lower.includes("resort") || lower.includes("હોટેલ") || lower.includes("રિસોર્ટ")) return "Commercial Hotel";
  if (lower.includes("commercial") || lower.includes("કોમર્શિયલ")) return "Commercial";

  return "";
}

function parseRequirementFromText(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("lease") || lower.includes("corporate lease") || lower.includes("long term lease") || lower.includes("લીઝ")) {
    return "LEASE";
  }
  if (lower.includes("rent") || lower.includes("kiraya") || lower.includes("bhadu") || lower.includes("bhaade") || lower.includes("rental") || lower.includes("ભાડે") || lower.includes("ભાડુ") || lower.includes("કિરાયા") || lower.includes("किराया")) {
    return "RENT";
  }
  if (lower.includes("sell") || lower.includes("bechna") || lower.includes("vechvu") || lower.includes("bikri") || lower.includes("વેચવું") || lower.includes("વેચવા") || lower.includes("બેચના") || lower.includes("बेचना")) {
    return "SELL";
  }
  if (lower.includes("buy") || lower.includes("kharid") || lower.includes("purchase") || lower.includes("khareed") || lower.includes("levu") || lower.includes("khareedna") || lower.includes("ખરીદવું") || lower.includes("ખરીદવા") || lower.includes("ખરીદ") || lower.includes("લેવું") || lower.includes("લેવા") || lower.includes("લેવો") || lower.includes("खरीदना") || lower.includes("खरीद")) {
    return "BUY";
  }
  return "";
}

function parsePurposeFromText(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("invest") || lower.includes("roi") || lower.includes("rental yield") || lower.includes("nivesh") || lower.includes("returns") || lower.includes("રોકાણ") || lower.includes("ઇન્વેસ્ટમેન્ટ")) {
    return "INVESTMENT";
  }
  if (
    lower.includes("self") || lower.includes("rehna") || lower.includes("rehne") || lower.includes("raheva") ||
    lower.includes("own use") || lower.includes("family") || lower.includes("student") || lower.includes("personal") ||
    lower.includes("bachelor") || lower.includes("living") || lower.includes("construction") || lower.includes("bungalow") ||
    lower.includes("ghar") || lower.includes("makan") || lower.includes("khud") || lower.includes("રહેવા") ||
    lower.includes("પોતાના માટે") || lower.includes("પરિવાર") || lower.includes("ફેમિલી")
  ) {
    return "SELF_USE";
  }
  if (
    lower.includes("business") || lower.includes("dhandho") || lower.includes("kaam") || lower.includes("commercial use") ||
    lower.includes("startup") || lower.includes("corporate") || lower.includes("branch") || lower.includes("brand") ||
    lower.includes("company") || lower.includes("firm") || lower.includes("agency") || lower.includes("retail") ||
    lower.includes("storage") || lower.includes("logistics") || lower.includes("godown") || lower.includes("warehouse") ||
    lower.includes("showroom") || lower.includes("office") || lower.includes("seats") || lower.includes("work") ||
    lower.includes("shop") || lower.includes("store") || lower.includes("grocery") || lower.includes("clinic") ||
    lower.includes("restaurant") || lower.includes("hotel") || lower.includes("ધંધા") || lower.includes("વ્યાપાર")
  ) {
    return "BUSINESS";
  }
  return "";
}

function parseTimelineFromText(text: string): string {
  const normalized = normalizeIndicDigits(text || "");
  const lower = normalized.toLowerCase();
  if (lower.includes("immediate") || lower.includes("ready to move") || lower.includes("rtm") || lower.includes("turant") || lower.includes("jaldi") || lower.includes("tarat") || lower.includes("તરત")) {
    return "IMMEDIATE";
  }
  if (lower.includes("1 month") || lower.includes("ek mahina") || lower.includes("30 days") || lower.includes("1 મહિનો") || lower.includes("1 મહિના")) {
    return "1_MONTH";
  }
  if (lower.includes("3 month") || lower.includes("under construction") || lower.includes("6 month") || lower.includes("saal") || lower.includes("3 મહિના") || lower.includes("6 મહિના")) {
    return "3_TO_6_MONTHS";
  }
  return "";
}

// 7. Passive Acknowledgment Token Classifier
const PASSIVE_ACK_REGEX = /^(ok|okay|okk|k|thik|thik he|thik hai|theek|theek hai|theek he|achha|acha|accha|saras|barobar|sahi hai|done|noted|cool|got it|great|super|badiya|badhiya|all right|alright|👍|👌|🙏|thank you|thanks|dhanyawad|shukriya|ha thik he|chalo thik he)$/i;

// 8. Word-Boundary Context-Aware Language Detector (Strict Language Mirroring)
function detectLanguage(text: string, previousLang?: string | null): "GUJLISH" | "HINGLISH" | "ENGLISH" {
  const raw = text || "";
  const lower = raw.toLowerCase().trim();

  // 1. Script checks (Gujarati Unicode)
  if (/[\u0A80-\u0AFF]/.test(raw)) return "GUJLISH";

  // 2. Explicit English preference commands
  if (lower.includes("in english") || lower.includes("speak english") || lower.includes("english please") || lower === "english") {
    return "ENGLISH";
  }

  // 3. Gujarati / Gujlish lexical patterns (with strict word boundaries)
  const gujRegex = /\b(kem|cho|chho|chhe|che|nathi|joiye|joyiye|joie|mane|aapjo|aapo|batavo|shu|malyo|aavi|aavshe|aavse|aavvu|sakish|sakie|shaku|shakie|ketla|ketli|ketlo|kyare|tamaro|tamari|tamara|tamne|tame|amara|amari|amaro|saras|aavjo|karshe|karse|karvu|karvi|karvo|karjo|karine|karyu|thashe|thase|thay|thai|jashe|jase|bapori|sanje|savare|kone|vechvu|levu|joye|gayu|ma|kaale|kale|vage|badli|badlo|badlavi|badlavo|mate|malshe|malse|maliye|chiye|chhiye|chhu|chhie|kripya|aabhar|bhai|ben|tarat|shodhva|shodhi|shodho|shodhvo|khub|nava|navi|navo|biji|bijo|biju|jovi|jova|jovu|dekhvi|dekhvo|moklo|mokljo|moko|ne|pan|pn|kai|kain|ane|sathe|saathe|bhav|ochho|ochhi|ochhu|vadhare|haji|haju|kasu)\b/i;

  // 4. Hinglish lexical patterns (with strict word boundaries)
  const hinRegex = /\b(hai|hain|nahi|nhi|nai|na|ha|haan|mat|chahiye|chahye|chahie|chaiye|chaahiye|mangta|karna|karni|karne|karo|kare|karein|kar|dekhna|dekhni|dekhne|dekho|dekh|dekhu|dikhao|dikhaye|dikhana|dikhani|batao|bataye|batayein|bataiye|bhejo|bhej|bhejiye|bhejna|kitna|kitne|kitni|kaunsa|kaunsi|kaunse|kahan|kidhar|idhar|udhar|yahan|wahan|hoga|hogi|hoge|honge|milega|milegi|milenge|parso|shaam|subah|dopahar|baje|pehle|pehla|pehli|dusra|dusri|dusre|doosra|doosri|doosre|teesra|teesri|teesre|ji|hum|hume|humko|mujhe|muje|mjhe|muze|mera|meri|mere|tera|teri|tere|apna|apni|apne|koi|kisi|kuch|kuchh|aur|anya|thoda|thodi|samajh|samjha|samjhi|samjhe|gaya|gayi|gaye|acha|theek|thik|sahi|badhiya|badiya|chale|chaloge|chalte|chalna|bhi|kya|kyu|kyun|kaise|kaisa|kaisi|najdik|pass|paas|sirf|khali|pasand|pasnd|zaroorat|jarurat|bol|bolo|boliye|lena|leni|lene|lo|liya|dena|deni|dene|do|diya|aana|aani|aane|aao|aaye|aa|jaana|jaani|jaane|jao|jaaye|ja|wala|wali|wale|sakta|sakti|sakte|paunga|paungi|payenge|paenge|aunga|aungi|jaunga|jaungi|raha|rahe|rahi|sakun|sakoon|arrey|arey|yaar|aaj)\b/i;

  const hasGuj = gujRegex.test(lower);
  const hasHin = hinRegex.test(lower);

  // 5. Greeting tokens: Default strictly to HINGLISH unless Gujlish markers present
  const isGreeting = /^(?:hi|hello|hey|namaste|kem cho|pranam|namaskar|good\s*(?:morning|evening|afternoon)|start|restart|jai shree krishna|jsk|radhe radhe)$/i.test(lower);
  if (isGreeting) {
    if (hasGuj || lower.includes("kem cho")) return "GUJLISH";
    if (previousLang === "GUJLISH") return "GUJLISH";
    return "HINGLISH";
  }

  if (previousLang === "GUJLISH" && hasGuj) return "GUJLISH";
  if (hasHin && !hasGuj) return "HINGLISH";
  if (hasGuj && !hasHin) return "GUJLISH";
  if (hasHin && hasGuj) {
    const hinCount = (lower.match(new RegExp(hinRegex, "gi")) || []).length;
    const gujCount = (lower.match(new RegExp(gujRegex, "gi")) || []).length;
    return hinCount > gujCount ? "HINGLISH" : "GUJLISH";
  }

  // 6. English grammatical clause detector (requires genuine full-sentence syntax)
  const hasEnglishGrammar = /\b(can you|could you|would you|please send|please show|please share|i am looking|i want to|i need to|we are looking|we want to|what is the|what are the|tell me about|could we|how much is|where is it|show me some|looking for|interested in|share with me)\b/i.test(lower);

  // INDIC CONTINUITY INVARIANT:
  // If the lead already has an established Indic language (GUJLISH or HINGLISH):
  // NEVER flip to English on short loanwords or real-estate phrases (e.g. "ready to move", "under construction", "semi furnished")
  // Only flip to English if they use a complete English grammatical clause or explicitly ask for English!
  if (previousLang === "GUJLISH" || previousLang === "HINGLISH") {
    if (hasEnglishGrammar) {
      return "ENGLISH";
    }
    return previousLang;
  }

  // 7. For fresh leads without established language:
  if (hasEnglishGrammar || (lower.split(/\s+/).length >= 4 && !hasHin && !hasGuj && /\b(looking|want|need|flat|flats|apartment|villa|office|shop|plot|buy|rent|sell|budget|schedule|visit)\b/i.test(lower))) {
    return "ENGLISH";
  }

  // 8. Default fallback for initial/short/neutral inputs:
  if (previousLang === "ENGLISH") return "ENGLISH";
  return "HINGLISH";
}


// 8b. Humanized Existing Criteria Formatter for Re-Search & Mind-Change Confirmation
function formatLeadCriteriaSummary(lead: any, lang: "GUJLISH" | "HINGLISH" | "ENGLISH" = "HINGLISH", city?: string | null): string {
  const pType = lead?.property_type || "Property";
  const loc = lead?.location || "";
  const b = lead?.budget ? Number(lead.budget) : 0;

  let budgetStr = "";
  if (b >= 10000000) {
    const cr = (b / 10000000).toFixed(2).replace(/\.00$/, "");
    budgetStr = `~₹${cr} Cr`;
  } else if (b >= 100000) {
    const l = (b / 100000).toFixed(1).replace(/\.0$/, "");
    budgetStr = `~₹${l} Lakh`;
  }

  const isFlex = !loc || loc === "FLEXIBLE" || loc.toLowerCase() === "flexible";
  const defaultCity = city || "aapke shehar";
  const displayLoc = isFlex ? defaultCity : loc;

  if (lang === "GUJLISH") {
    const locPart = isFlex ? (city ? `${city} ma` : "tamara shehar ma") : `${displayLoc} ma`;
    const bPart = budgetStr ? `${budgetStr} na budget ma` : "";
    return [locPart, bPart, pType].filter(Boolean).join(" ");
  } else if (lang === "ENGLISH") {
    const locPart = isFlex ? (city ? `in ${city}` : "in your city") : `in ${displayLoc}`;
    const bPart = budgetStr ? `with a budget of ${budgetStr}` : "";
    return [pType, locPart, bPart].filter(Boolean).join(" ");
  } else {
    const locPart = isFlex ? (city ? `${city} me` : "aapke shehar me") : `${displayLoc} par`;
    const bPart = budgetStr ? `${budgetStr} ke budget me` : "";
    return [locPart, bPart, pType].filter(Boolean).join(" ");
  }
}

// =========================================================================
// 8c. HYBRID MICRO-LLM INTENT CLASSIFIER (Gemini 2.0 Flash Primary + Groq Llama 3.3 Fallback + Circuit Breaker)
// Ultra-fast (<300ms), Token-Efficient (<150 tokens), 100% Deterministic State Machine Synchronization
// =========================================================================

interface ClassifiedIntent {
  user_role?: "OWNER" | "SEEKER" | "UNKNOWN";
  intent:
    | "CANNOT_ATTEND_VISIT"
    | "RESCHEDULE_VISIT"
    | "CANCEL_VISIT"
    | "CONFIRM_VISIT"
    | "PRICE_NEGOTIATION"
    | "QUALIFICATION_INFO"
    | "SEEKER_QUALIFICATION"
    | "ASK_MORE_OPTIONS"
    | "CONFIRM_SAME_CRITERIA"
    | "CHANGE_CRITERIA"
    | "GENERAL_FAQ"
    | "FAQ"
    | "GREETING"
    | "OPT_OUT"
    | "OWNER_LISTING"
    | "BROCHURE_REQUEST"
    | "MAP_REQUEST"
    | "HUMAN_CALL"
    | "MARKET_ADVISORY"
    | "OFF_TOPIC"
    | "PASSIVE_ACK"
    | "UNKNOWN";
  language?: "HINGLISH" | "GUJLISH" | "ENGLISH" | "GUJARATI_SCRIPT";
  transaction_type?: "RENT" | "SELL" | "BUY" | "LEASE" | null;
  property_category?: "COMMERCIAL" | "RESIDENTIAL" | "PLOT" | null;
  property_type?: string | null;
  location?: string | null;
  is_flexible_location?: boolean;
  project_or_society?: string | null;
  price_or_budget?: number | null;
  carpet_sqft?: number | null;
  super_built_up_sqft?: number | null;
  plot_area_sqft?: number | null;
  possession_status?: "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | "TENANTED" | null;
  furnishing_status?: "FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED" | null;
  timeline?: "IMMEDIATE" | "1_MONTH" | "3_TO_6_MONTHS" | null;
  reschedule_slot?: string | null;
  selected_option_index?: number | null;
  contact_phone?: string | null;
  faq_topic?: "AMENITIES" | "RERA" | "LOAN" | "POSSESSION" | "BROKERAGE" | "LANDMARKS" | "DISCOUNT" | null;
  budget_str?: string | null;
  provider_used: "GEMINI" | "GROQ" | "DETERMINISTIC_FALLBACK";
  latency_ms: number;
}

const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `You are Nextgen Realty's lead intent & entity extractor for WhatsApp/Telegram real estate leads.
Analyze user message with current CRM lead status. Extract all entities accurately without using brittle regex.

ROLES:
- "OWNER": User wants to sell, rent out, lease out, or list their own property, OR is currently answering questions in the owner intake flow.
- "SEEKER": User wants to buy, rent, or lease a property for themselves, or search properties.
- "UNKNOWN": General greeting, FAQ, or off-topic without clear role.

INTENTS:
1. OWNER_LISTING: User offering property to sell/rent out OR answering owner property intake questions (type, society, location, size, price, possession, furnishing).
2. SEEKER_QUALIFICATION: User looking to buy/rent property and providing search criteria (BHK, property type, location, budget, timeline).
3. CHANGE_CRITERIA: Seeker wants to search different properties, start fresh, or change location/budget/type.
4. CONFIRM_SAME_CRITERIA: User selects option 1 or confirms to continue with previous search.
5. ASK_MORE_OPTIONS: Seeker asks for more options / different properties.
6. BOOK_VISIT: User wants to schedule/book a site visit for a property (e.g. "kal 5 baje", "Sunday 11 AM", "option 1 kal dekhna hai").
7. RESCHEDULE_VISIT: User wants to change timing of an existing booked visit.
8. CANNOT_ATTEND_VISIT: User cannot attend scheduled visit (e.g. "nahi aa paunga", "aaj nahi ho payega", "emergency aa gayi").
9. CONFIRM_VISIT: User confirms attending scheduled visit (e.g. "ha aa raha hu", "on the way").
10. CANCEL_VISIT: User cancels visit completely.
11. PRICE_NEGOTIATION: User asks for discount, rate negotiation, cheaper deal.
12. BROCHURE_REQUEST: User specifically asks for brochure / PDF / catalog.
13. MAP_REQUEST: User specifically asks for Google Map link / location pin / directions.
14. HUMAN_CALL: User asks for immediate phone call / talk to human / sales executive.
15. MARKET_ADVISORY: User asks "kya sasta hai", "suggest karo", market trends.
16. OFF_TOPIC: Dating, lunch, movies, non-real-estate banter.
17. FAQ: Questions about amenities (lift, parking), RERA, home loans, possession, brokerage.
18. GREETING: Casual hi, hello, namaste, kem cho.
19. PASSIVE_ACK: Casual acknowledgment (ok, thik hai, noted, thanks, 👍).
20. OPT_OUT: Stop, unsubscribe, not interested.
21. UNKNOWN: Anything else.

IMPORTANT OWNER vs SEEKER RULES:
- If LEAD STATUS indicates Lead Type is PROVIDER/OWNER or In-Progress Owner Intake is YES:
  The user is an OWNER answering property intake questions.
  user_role MUST BE "OWNER" and intent MUST BE "OWNER_LISTING".
  NEVER classify the user as SEEKER or intent as SEEKER_QUALIFICATION or CHANGE_CRITERIA during owner intake!
  Even when the user mentions location, society names ("Manjalpur area Tribhuvandham Society near Eva Mall"), or numbers, they are registering their property.
  Extract location into location, society into project_or_society.
  DO NOT change or extract property_type if already known; specifically, "900 plot area" or "2000 built up" is plot_area_sqft or super_built_up_sqft, NEVER set property_type to "Plot" if property is already a Villa or Flat!
- "bhade pe chadhana", "rent par dena", "bhaade aalvu", "kiraye pe dena", "rent out" = OWNER with transaction_type: "RENT".
- "chahiye", "joiye", "kharidna", "rent pe chahiye", "buy" = SEEKER with transaction_type: "RENT" or "BUY".

STRICT ANTI-HALLUCINATION & MULTI-CHOICE RULES:
- When "Known Transaction Type" is already SELL or RENT:
  NEVER change or flip transaction_type unless user explicitly uses contradiction words ("nahi bechna nahi hai rent par dena hai").
- When "Bot Question Waiting For" is POSSESSION_STATUS (state OWNER_POSSESSION_PENDING):
  - "1", "1️⃣", "Ready to move", "rtm", "ready" -> possession_status: "READY_TO_MOVE".
  - "2", "2️⃣", "Under construction", "uc" -> possession_status: "UNDER_CONSTRUCTION".
  - transaction_type and price_or_budget MUST BE null!
- When "Bot Question Waiting For" is FURNISHING_STATUS (state OWNER_FURNISHING_PENDING):
  - "1", "1️⃣", "Unfurnished" -> furnishing_status: "UNFURNISHED".
  - "2", "2️⃣", "Semi-Furnished" -> furnishing_status: "SEMI_FURNISHED".
  - "3", "3️⃣", "Fully Furnished", "Furnished" -> furnishing_status: "FURNISHED".
  - transaction_type and price_or_budget MUST BE null! NEVER flip transaction_type to RENT or SELL on single digits!
- When user provides built-up area (e.g. "Build up 2000 square feet", "2000 built up", "super built 1800"):
  Extract super_built_up_sqft: <number pure integer e.g. 2000>. price_or_budget MUST BE null!
- When user provides plot area (e.g. "900 plot area", "plot 1200"):
  Extract plot_area_sqft: <number pure integer e.g. 900>.
- When user provides a 10-digit calling or WhatsApp phone number (e.g. "9825012345", "+91 98250 12345", or when state is OWNER_PHONE_PENDING):
  Extract contact_phone: <clean 10-digit phone string e.g. "9825012345">.
  price_or_budget, carpet_sqft, super_built_up_sqft, plot_area_sqft MUST BE null! NEVER extract phone digits or parts of a phone number as price_or_budget!
- When user selects an option from a numbered property options list:
  - "1", "1️⃣", "first", "pehla", "option 1" -> selected_option_index: 0
  - "2", "2️⃣", "second", "dusra", "option 2" -> selected_option_index: 1
  - "3", "3️⃣", "third", "teesra", "option 3" -> selected_option_index: 2
- When "Bot Question Waiting For" is ROLE_SELECTION (state ROLE_SELECTION_PENDING):
  - "1", "1️⃣", "option 1", "first", "leni", "lene", "kharidna", "buy", "rent chahiye", "search" -> user_role: "SEEKER", intent: "SEEKER_QUALIFICATION".
  - "2", "2️⃣", "option 2", "second", "deni", "dene", "sell", "bechna", "rent out", "rent pe deni", "listing" -> user_role: "OWNER", intent: "OWNER_LISTING".

LANGUAGE RULES:
- "GUJARATI_SCRIPT": if written in Gujarati script.
- "GUJLISH": if Gujarati phonetic/romanized words (kem cho, joiye, mane, batavo, nathi, etc.).
- "HINGLISH": Hindi/Hinglish (chahiye, dekhna, kya, etc.) OR casual greetings like "Hi", "Hello", "Hey" without full English sentences.
- "ENGLISH": ONLY if user writes a full formal English sentence.

Return ONLY a single valid JSON object:
{
  "user_role": "OWNER" | "SEEKER" | "UNKNOWN",
  "intent": "<ONE_OF_THE_INTENTS>",
  "language": "HINGLISH" | "GUJLISH" | "ENGLISH" | "GUJARATI_SCRIPT",
  "transaction_type": "RENT" | "SELL" | "BUY" | "LEASE" | null,
  "property_category": "COMMERCIAL" | "RESIDENTIAL" | "PLOT" | null,
  "property_type": "<e.g. Commercial Office, Commercial Shop, 2BHK Flat, 3BHK Flat, Villa, Plot, or null>",
  "location": "<locality name e.g. Alkapuri, Gotri, Vasna, or 'FLEXIBLE' if user says koi bhi chalegi, or null>",
  "is_flexible_location": <boolean true if user is flexible on location, else false>,
  "project_or_society": "<project / society / commercial complex name if mentioned, or null>",
  "price_or_budget": <number pure integer e.g. 30000 or 7500000, or null>,
  "carpet_sqft": <number pure integer e.g. 520, or null>,
  "super_built_up_sqft": <number pure integer e.g. 2000, or null>,
  "plot_area_sqft": <number pure integer e.g. 900, or null>,
  "possession_status": "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | "TENANTED" | null,
  "furnishing_status": "FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED" | null,
  "timeline": "IMMEDIATE" | "1_MONTH" | "3_TO_6_MONTHS" | null,
  "reschedule_slot": "<extracted date/time string or null>",
  "selected_option_index": <0 | 1 | 2 | null>,
  "contact_phone": "<10-digit phone string or null>",
  "faq_topic": "AMENITIES" | "RERA" | "LOAN" | "POSSESSION" | "BROKERAGE" | "LANDMARKS" | "DISCOUNT" | null
}
`;

function buildLeadContextForClassifier(lead: any, messageText: string): string {
  const isInProgressOwner = [
    "OWNER_CONFIG_PENDING",
    "OWNER_SOCIETY_PENDING",
    "OWNER_LOCATION_PENDING",
    "OWNER_AREA_PENDING",
    "OWNER_SIZE_PENDING",
    "OWNER_PRICE_PENDING",
    "OWNER_POSSESSION_PENDING",
    "OWNER_FURNISHING_PENDING",
    "OWNER_PHONE_PENDING",
  ].includes(lead?.state);

  const lockedTx = lead?.metadata?.owner_draft?.transaction_type || lead?.requirement || null;
  const knownPhone = lead?.phone || lead?.metadata?.owner_draft?.contact_phone || null;

  let currentPendingQuestion = "NONE";
  if (lead?.state === "ROLE_SELECTION_PENDING") {
    currentPendingQuestion = "ROLE_SELECTION (Bot asked user: 1 or 'Leni hai' to Buy/Rent properties, 2 or 'Deni hai' to Sell/Rent Out their property)";
  } else if (lead?.state === "OWNER_CONFIG_PENDING") {
    currentPendingQuestion = "PROPERTY_CONFIG (Bot asked for property type / configuration: Flat, Villa, Commercial Office, Shop, Plot)";
  } else if (lead?.state === "OWNER_SOCIETY_PENDING") {
    currentPendingQuestion = "SOCIETY_OR_ROAD (Bot asked for Commercial Complex, Business Hub, Society, or Road name)";
  } else if (lead?.state === "OWNER_LOCATION_PENDING") {
    currentPendingQuestion = "LOCATION_AREA (Bot asked for exact area / locality in the city)";
  } else if (lead?.state === "OWNER_AREA_PENDING" || lead?.state === "OWNER_SIZE_PENDING") {
    currentPendingQuestion = "CARPET_AREA_SQFT (Bot asked for Carpet / Plot / Built-up Area. Extract numbers into carpet_sqft, super_built_up_sqft, or plot_area_sqft)";
  } else if (lead?.state === "OWNER_PRICE_PENDING") {
    currentPendingQuestion = "PRICE_OR_RENT (Bot asked for expected selling price or monthly rent. If user specifies built-up or plot area, extract super_built_up_sqft / plot_area_sqft!)";
  } else if (lead?.state === "OWNER_POSSESSION_PENDING") {
    currentPendingQuestion = "POSSESSION_STATUS (Bot asked: 1 Ready to Move, 2 Under Construction. Single digit reply is strictly possession_status!)";
  } else if (lead?.state === "OWNER_FURNISHING_PENDING") {
    currentPendingQuestion = "FURNISHING_STATUS (Bot asked: 1 Unfurnished, 2 Semi-Furnished, 3 Fully Furnished. Single digit reply is strictly furnishing_status, DO NOT hallucinate transaction_type or price!)";
  } else if (lead?.state === "OWNER_PHONE_PENDING") {
    currentPendingQuestion = "CONTACT_PHONE (Bot asked for direct calling/WhatsApp number. Extract 10-digit number into contact_phone)";
  } else if (lead?.state === "QUALIFYING") {
    if (!lead?.property_type) currentPendingQuestion = "SEEKER_PROPERTY_TYPE";
    else if (!lead?.requirement) currentPendingQuestion = "SEEKER_REQUIREMENT (Buy or Rent)";
    else if (!lead?.location) currentPendingQuestion = "SEEKER_LOCATION";
    else if (!lead?.budget) currentPendingQuestion = "SEEKER_BUDGET (A numeric reply is price_or_budget)";
    else if (!lead?.timeline) currentPendingQuestion = "SEEKER_TIMELINE";
  }

  return `LEAD STATUS:
- Lead Type: ${lead?.lead_type || "UNKNOWN"}
- State: ${lead?.state || "FRESH"}
- In-Progress Owner Intake: ${isInProgressOwner ? "YES" : "NO"}
- Known Locked Transaction: ${lockedTx || "None"}
- Known User Phone: ${knownPhone || "None"}
- Bot Question Waiting For: ${currentPendingQuestion}
- Known Property Type: ${lead?.property_type || lead?.metadata?.owner_draft?.property_type || "None"}
- Known Location: ${lead?.location || lead?.metadata?.owner_draft?.location || "None"}
- Known Budget/Price: ${lead?.budget || lead?.metadata?.owner_draft?.expected_price || lead?.metadata?.owner_draft?.expected_rent || "None"}
- Known Carpet Area: ${lead?.metadata?.owner_draft?.carpet_area_sqft ? `${lead.metadata.owner_draft.carpet_area_sqft} sq.ft` : "None"}
- Known Built-up Area: ${lead?.metadata?.owner_draft?.super_built_up_sqft ? `${lead.metadata.owner_draft.super_built_up_sqft} sq.ft` : "None"}
- Has Active Site Visit: ${lead?.site_visit_booked ? "YES" : "NO"}

USER MESSAGE: "${messageText}"`;
}

function parseJsonSafely(str: string): any {
  if (!str) return null;
  const clean = str.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (_) {
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
      } catch (_) {}
    }
  }
  return null;
}

async function classifyLeadIntentWithGemini(
  apiKey: string,
  messageText: string,
  lead: any
): Promise<ClassifiedIntent | null> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
  const userContent = buildLeadContextForClassifier(lead, messageText);

  const fullPrompt = `${INTENT_CLASSIFICATION_SYSTEM_PROMPT}\n\n${userContent}`;

  const candidates = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${cleanKey}`,
  ];

  const candidateErrors: string[] = [];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 250,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(1800),
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = parseJsonSafely(rawText);
          if (parsed && parsed.intent) {
            return {
              ...parsed,
              provider_used: "GEMINI",
              latency_ms: 0,
            };
          }
        }
      } else {
        const errText = await res.text().catch(() => "");
        candidateErrors.push(`${url.split("/models/")[1]?.split("?")[0]} [${res.status}]: ${errText.slice(0, 150)}`);
      }
    } catch (e: any) {
      candidateErrors.push(`${url.split("/models/")[1]?.split("?")[0]} [fetch]: ${e.message}`);
    }
  }

  throw new Error(`All Gemini candidates failed: ${candidateErrors.join(" | ")}`);
}

async function classifyLeadIntentWithGroq(
  apiKey: string,
  messageText: string,
  lead: any
): Promise<ClassifiedIntent | null> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
  const userContent = buildLeadContextForClassifier(lead, messageText);

  const models = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
  ];

  const groqErrors: string[] = [];
  for (const model of models) {
    try {
      // First try with json_object response format
      let res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: INTENT_CLASSIFICATION_SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
          max_tokens: 250,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(3500),
      });

      // If model does not support response_format json_object, fallback to standard completion
      if (!res.ok && res.status === 400) {
        res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: INTENT_CLASSIFICATION_SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            temperature: 0.1,
            max_tokens: 250,
          }),
          signal: AbortSignal.timeout(3500),
        });
      }

      if (res.ok) {
        const data = await res.json();
        const rawText = data.choices?.[0]?.message?.content;
        if (rawText) {
          const parsed = parseJsonSafely(rawText);
          if (parsed && parsed.intent) {
            return {
              ...parsed,
              provider_used: "GROQ",
              latency_ms: 0,
            };
          }
        }
      } else {
        const errBody = await res.text().catch(() => "");
        groqErrors.push(`${model} [${res.status}]: ${errBody.slice(0, 150)}`);
      }
    } catch (e: any) {
      groqErrors.push(`${model} [fetch]: ${e.message}`);
    }
  }

  throw new Error(`All Groq models failed: ${groqErrors.join(" | ")}`);
}

async function findAdjacentLocalityWithAI(
  requestedLoc: string,
  city: string | null,
  availableLocs: string[]
): Promise<{ adjacent_location: string; distance_context: string } | null> {
  if (!requestedLoc || !availableLocs || availableLocs.length === 0) return null;
  const geminiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!geminiKey) return null;

  const prompt = `You are an expert real estate geographical routing system.
Context:
- Target City: "${city || "India"}"
- Buyer Requested Locality: "${requestedLoc}"
- Available Localities in Realtor's Inventory: ${JSON.stringify(availableLocs)}

Task:
Identify if ANY of the available localities is geographically adjacent, part of the same micro-market / corridor, or within a ~5-10 minute drive to "${requestedLoc}" in ${city || "this city"}.
If yes, choose the single closest matching locality and describe the distance context in brief Hinglish (e.g. "sirf 5-7 minute ki distance par" or "adjacent corridor par").
If none are reasonably close or you are unsure, return null for both fields.

Respond ONLY with valid JSON:
{"adjacent_location": "ExactNameFromList" | null, "distance_context": "distance string" | null}`;

  const candidates = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 120,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(2200),
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = parseJsonSafely(rawText);
          if (parsed?.adjacent_location) {
            const matchedName = availableLocs.find(
              (l) => l.toLowerCase() === String(parsed.adjacent_location).toLowerCase().trim()
            );
            if (matchedName) {
              return {
                adjacent_location: matchedName,
                distance_context: parsed.distance_context || "paas ke area me",
              };
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[AI Proximity] Candidate ${url.split("/models/")[1]?.split("?")[0]} failed:`, e.message);
    }
  }

  return null;
}

async function classifyLeadIntent(
  messageText: string,
  lead: any
): Promise<ClassifiedIntent> {
  const start = Date.now();
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const groqKey = Deno.env.get("GROQ_API_KEY") || "";

  // 1. Primary: Groq Llama 3.3 (Sub-second latency ~600-700ms)
  if (groqKey) {
    try {
      const result = await classifyLeadIntentWithGroq(groqKey, messageText, lead);
      if (result && result.intent) {
        return {
          ...result,
          latency_ms: Date.now() - start,
          provider_used: "GROQ",
        };
      }
    } catch (err: any) {
      console.warn("Groq intent classifier warning (falling back to Gemini):", err.message);
    }
  }

  // 2. Secondary Fallback: Google Gemini
  if (geminiKey) {
    try {
      const result = await classifyLeadIntentWithGemini(geminiKey, messageText, lead);
      if (result && result.intent) {
        return {
          ...result,
          latency_ms: Date.now() - start,
          provider_used: "GEMINI",
        };
      }
    } catch (err: any) {
      console.warn("Gemini intent classifier warning (falling back to deterministic):", err.message);
    }
  }

  // 3. Tier 3: Deterministic Fallback Circuit Breaker
  const lower = messageText.toLowerCase();
  let fallbackIntent: ClassifiedIntent["intent"] = "UNKNOWN";

  if (lower === "stop" || lower.includes("unsubscribe") || lower.includes("not interested")) {
    fallbackIntent = "OPT_OUT";
  } else if (lead?.post_visit_feedback_sent) {
    if (/(?:^|\b)(?:2|2️⃣|two|option\s*2)\b/i.test(lower) || /^(?:nahi|nhi|na|no|nope|nathi|missed|couldn't|cancel)/i.test(lower.trim())) {
      fallbackIntent = "CANNOT_ATTEND_VISIT";
    } else if (/(?:^|\b)(?:1|1️⃣|one|option\s*1)\b/i.test(lower) || /^(?:ha|haan|ji\s*haan|yes|yep|yeah|attended)/i.test(lower.trim())) {
      fallbackIntent = "CONFIRM_VISIT";
    }
  } else if (lead?.state === "CRITERIA_CONFIRMATION_PENDING") {
    if (/^(1|1️⃣|first|1st|ha|haan|ha ji|yes|same|isi me|yahi|yahi criteria|dikhao|sure|chalo|done|ok|okay|sahi hai|barobar|saras)$/i.test(lower) || lower.includes("isi criteria") || lower.includes("same criteria") || lower.includes("yahi")) {
      fallbackIntent = "CONFIRM_SAME_CRITERIA";
    } else if (/^(2|2️⃣|second|2nd|nahi|no|change|badalna|dusra|naya|different|modify)$/i.test(lower) || lower.includes("change") || lower.includes("badal") || lower.includes("dusra")) {
      fallbackIntent = "CHANGE_CRITERIA";
    }
  } else if (
    /(?:^|\b)(?:ha\s+|haan\s+|ji\s+)?(?:me\s+|hum\s+|mai\s+)?(?:nai|nahi|nhi|na)\s*(?:aa\s*sakta|aa\s*sakti|aa\s*paunga|aa\s*paungi|aa\s*payenge|aa\s*paenge|aa\s*raha|aa\s*rahe|aana|aunga|aungi|ja\s*sakta|ja\s*paunga|pahunch\s*sakta|pahunch\s*paunga|ho\s*payega|hoga\s*aaj|possible\s*nahi)/i.test(lower) ||
    /(nahi\s*aa\s*paya|nahi\s*aa\s*paye|miss\s*ho\s*gaya|emergency|couldn't\s*come|cannot\s*make\s*it|won't\s*be\s*able\s*to\s*come)/i.test(lower) ||
    /(nathi\s*aavi\s*sakyo|aaje\s*nahi\s*aavay|aaje\s*nai\s*aavay)/i.test(lower)
  ) {
    fallbackIntent = "CANNOT_ATTEND_VISIT";
  } else if (/(kuch\s*kam\s*hoga|discount|bhav\s*ochho|rate\s*kam|final\s*price|negotiat)/i.test(lower)) {
    fallbackIntent = "PRICE_NEGOTIATION";
  } else if (lower.includes("reschedule") || lower.includes("change time") || lower.includes("badalna") || lower.includes("badlo") || (lead?.state === "VISIT_MISSED" && /\b(kal|kale|tomorrow|sunday|monday|today|aaj|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage))\b/i.test(lower))) {
    fallbackIntent = "RESCHEDULE_VISIT";
  } else if (lower.includes("cancel")) {
    fallbackIntent = "CANCEL_VISIT";
  } else if (
    /(nayi\s*requirement|navi\s*requirement|nayi\s*property|navi\s*property|naya\s*property|naya\s*search|nayi\s*search|navi\s*search|nava\s*criteria|naya\s*criteria|change\s*criteria|criteria\s*badal|fresh\s*search|fresh\s*requirement|start\s*fresh|reset\s*criteria|naya\s*dekhna|nayi\s*dekhni|kuch\s*naya\s*dekhna|nayi\s*chahiye|navi\s*joiye)/i.test(lower)
  ) {
    fallbackIntent = "CHANGE_CRITERIA";
  } else if (/(dusri\s*property|aur\s*option|aur\s*flat|kuch\s*aur|kuch\s*naya|biji\s*property|more\s*options|other\s*options|different\s*property)/i.test(lower)) {
    fallbackIntent = "ASK_MORE_OPTIONS";
  } else if (
    /(?:mera|meri|maro|mari|mere|mara|amaro|apna|own|paas)\s+(?:flat|makan|ghar|house|villa|plot|zameen|jamin|shop|dukan|office|showroom|shed|godown|warehouse|property)\s+(?:bechna|bechni|vechvu|vechvo|vechva|sell|bikri|rent\s+par|bhadu|bhaade|kiraya|kiraye|lease)/i.test(lower) ||
    /(?:bechna|bechni|vechvu|vechva|bikri|sell\s+my|sell\s+property|want\s+to\s+sell|property\s+sell|rent\s+par\s+den|bhaade\s+aap|kiraye\s+par\s+den|lease\s+par\s+den|list\s+karvi|list\s+karna|owner\s+listing)/i.test(lower) ||
    /(?:property\s+deni\s+hai|shop\s+deni\s+hai|flat\s+dena\s+hai|office\s+dena\s+hai|office\s+deni\s+hai|ghar\s+bechna)/i.test(lower)
  ) {
    fallbackIntent = "OWNER_LISTING";
  } else if (/\b(hi|hello|hey|kem cho|namaste)\b/i.test(lower)) {
    fallbackIntent = "GREETING";
  }

  // Handle explicit 1 vs 2 in ROLE_SELECTION_PENDING
  if (lead?.state === "ROLE_SELECTION_PENDING") {
    if (/^(2|2️⃣|option\s*2|second|2nd|deni|dene|sell|bechna|rent\s*out|rent\s*pe\s*deni|list|listing)\b/i.test(lower.trim())) {
      fallbackIntent = "OWNER_LISTING";
    } else if (/^(1|1️⃣|option\s*1|first|1st|leni|lene|kharidna|buy|rent\s*pe\s*chahiye|search)\b/i.test(lower.trim())) {
      fallbackIntent = "SEEKER_QUALIFICATION";
    }
  }

  const isOwnerMsg = fallbackIntent === "OWNER_LISTING" || lead?.lead_type === "PROVIDER";
  const userRole: "OWNER" | "SEEKER" | "UNKNOWN" = isOwnerMsg ? "OWNER" : (fallbackIntent === "GREETING" || fallbackIntent === "OPT_OUT" ? "UNKNOWN" : "SEEKER");
  const parsedPrice = parseBudgetFromText(messageText);
  const isFlexLoc = /(?:^|\b)(?:koi\s*bhi|kahi\s*bhi|kahi\s*pan|koi\s*pan|gamete|any\s*location|any\s*area|anywhere|all\s*over|no\s*preference|flexible|kuch\s*bhi|koi\s*fix\s*nathi|koi\s*fix\s*nahi|chalegi|chalega|chalse)\b/i.test(lower);

  return {
    user_role: userRole,
    intent: fallbackIntent,
    language: detectLanguage(messageText, lead?.user_language),
    transaction_type: /(?:rent|bhadu|bhaade|bhade|kiraya)/i.test(lower) ? "RENT" : /(?:buy|kharid|purchase)/i.test(lower) ? "BUY" : /(?:bechna|sell|vech)/i.test(lower) ? "SELL" : null,
    property_type: parsePropertyTypeFromText(messageText) || null,
    location: isFlexLoc ? "FLEXIBLE" : null,
    is_flexible_location: isFlexLoc,
    price_or_budget: parsedPrice > 0 ? parsedPrice : null,
    provider_used: "DETERMINISTIC_FALLBACK",
    latency_ms: Date.now() - start,
  };
}

// 8b. Robust Inventory Matchers (Location, Listing Type, Category)
function matchesLocation(leadLoc?: string | null, propLoc?: string | null, landmarks: string[] = []): boolean {
  if (!leadLoc || !propLoc || leadLoc === "FLEXIBLE" || leadLoc.toLowerCase() === "flexible") return true;
  const l1 = String(leadLoc).toLowerCase().trim();
  const l2 = String(propLoc).toLowerCase().trim();
  
  if (l1 === l2 || l1.includes(l2) || l2.includes(l1)) return true;

  if (landmarks && Array.isArray(landmarks)) {
    if (landmarks.some((lm) => {
      const lmL = String(lm).toLowerCase().trim();
      return lmL && (lmL.includes(l1) || l1.includes(lmL));
    })) {
      return true;
    }
  }

  // Phonetic & Fuzzy check
  const p1 = normalizePhoneticLocation(l1);
  const p2 = normalizePhoneticLocation(l2);
  if (p1 === p2 || (p1.length >= 3 && p2.length >= 3 && (p1.includes(p2) || p2.includes(p1)))) {
    return true;
  }

  // Levenshtein similarity on primary words
  const words1 = l1.replace(/[-_]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !["road", "area", "near"].includes(w));
  const words2 = l2.replace(/[-_]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !["road", "area", "near"].includes(w));
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (stringSimilarity(w1, w2) >= 0.78) {
        return true;
      }
    }
  }

  return false;
}

function matchesListingType(leadReq?: string | null, propListingType?: string | null, propPrice?: number): boolean {
  if (!leadReq) return true;
  const r = String(leadReq).toUpperCase().trim();
  const l = String(propListingType || "").toUpperCase().trim();
  const price = Number(propPrice || 0);

  if (r === "LEASE") {
    if (l === "LEASE" || l === "RENT" || l === "RENTAL") return true;
    if (!l && price > 0 && price <= 500000) return true;
    return false;
  }

  if (r === "RENT") {
    if (l === "RENT" || l === "LEASE" || l === "RENTAL") return true;
    if (!l && price > 0 && price <= 200000) return true;
    return false;
  }

  if (r === "BUY") {
    if (l === "BUY" || l === "SALE" || l === "RESALE" || l === "NEW_BOOKING") return true;
    if (!l && price >= 500000) return true;
    return false;
  }

  if (r === "SELL") {
    return true; // Seller lead
  }

  return true;
}

function getPropertyCategoryGroup(propType?: string | null): "COMMERCIAL" | "RESIDENTIAL" | "PLOT" | "UNKNOWN" {
  if (!propType) return "UNKNOWN";
  const lt = String(propType).toLowerCase();
  if (/(commercial|shop|office|showroom|warehouse|godown|co-working|coworking|co_working|industrial|shed|restaurant|hotel|retail)/i.test(lt)) return "COMMERCIAL";
  if (/(flat|villa|bhk|bungalow|penthouse|apartment|studio|row\s*house)/i.test(lt)) return "RESIDENTIAL";
  if (/(plot|land|jamin|zameen|kheti)/i.test(lt)) return "PLOT";
  return "UNKNOWN";
}

function matchesPropertyType(leadType?: string | null, propCategory?: string | null, propConfig?: string | null, propProjectName?: string | null): boolean {
  if (!leadType) return true;
  const lt = String(leadType).toLowerCase().trim();
  const cat = String(propCategory || "").toLowerCase().trim();
  const cfg = String(propConfig || "").toLowerCase().trim();
  const proj = String(propProjectName || "").toLowerCase().trim();
  const combined = `${cat} ${cfg} ${proj}`.trim();

  // 1. Commercial Subtypes
  const isLeadComm = /(commercial|shop|office|showroom|warehouse|godown|co-working|coworking|shed|industrial|restaurant|hotel|pre-leased)/i.test(lt);
  const isPropComm = /(commercial|shop|office|showroom|warehouse|godown|co_working|shed|industrial|restaurant|hotel|pre_leased)/i.test(combined);

  if (isLeadComm) {
    if (!isPropComm) return false;
    if (lt.includes("shop") && !combined.includes("shop")) return false;
    if (lt.includes("office") && !combined.includes("office") && !combined.includes("co_working")) return false;
    if (lt.includes("showroom") && !combined.includes("showroom")) return false;
    if ((lt.includes("co-working") || lt.includes("coworking")) && !combined.includes("co_working") && !combined.includes("office")) return false;
    if ((lt.includes("warehouse") || lt.includes("godown") || lt.includes("shed")) && !combined.includes("warehouse") && !combined.includes("industrial")) return false;
    return true;
  }

  // 2. Plots & Land Subtypes
  const isLeadPlot = /(plot|land|kheti|jamin|zameen)/i.test(lt);
  const isPropPlot = /(plot|land)/i.test(combined);
  if (isLeadPlot) return isPropPlot || cat === "plot";

  // 3. Villa / House Subtypes
  const isLeadVilla = /(villa|bungalow|row house|farmhouse|duplex)/i.test(lt);
  const isPropVilla = /(villa|bungalow|row_house|farm_house)/i.test(combined);
  if (isLeadVilla) {
    if (lt.includes("flat") && (combined.includes("flat") || cat === "flat")) {
      // User allows flat or sky villa
    } else if (!isPropVilla && cat !== "villa") {
      return false;
    }
    const bhkMatch = lt.match(/(\d+)\s*bhk/i);
    if (bhkMatch) {
      const bhk = bhkMatch[1] + "bhk";
      const propBhk = combined.replace(/[\s_-]+/g, "").toLowerCase();
      if (!propBhk.includes(bhk)) return false;
    }
    return true;
  }

  // 4. Exact BHK Matches
  const bhkMatch = lt.match(/(\d+)\s*bhk/i);
  if (bhkMatch) {
    const bhk = bhkMatch[1] + "bhk";
    const propBhk = combined.replace(/[\s_-]+/g, "").toLowerCase();
    if (!propBhk.includes(bhk)) return false;
  }

  // 5. Penthouse
  if (lt.includes("penthouse")) {
    return combined.includes("penthouse") || combined.includes("5bhk") || combined.includes("4bhk");
  }

  // 6. Studio
  if (lt.includes("studio") || lt.includes("1rk")) {
    return combined.includes("studio") || combined.includes("1bhk");
  }

  return /(flat|apartment)/i.test(combined) || cat === "flat";
}

// 8c. Exact n8n Property Card Formatter (from Prepare Property Options Node)
function formatN8nPropertyCard(p: any, index: number, isBestDeal: boolean = false): string {
  const safeName = p.project_name || p.property_name || "Property";
  const safeLoc = p.location || "";
  const config = String(p.configuration || "").trim();
  const cat = String(p.property_category || p.property_type || "").trim();
  const safeType = `${config} ${cat}`.trim().toUpperCase();

  const priceNum = Number(p.price || 0);
  const isRental = p.listing_type === "RENT" || p.listing_type === "LEASE" || (priceNum > 0 && priceNum <= 200000);
  const formattedPrice = isRental
    ? `₹${priceNum.toLocaleString("en-IN")}/month`
    : priceNum >= 10000000
    ? `₹${(priceNum / 10000000).toFixed(2)} Cr`
    : priceNum >= 100000
    ? `₹${(priceNum / 100000).toFixed(0)} Lakhs`
    : priceNum > 0
    ? `₹${priceNum.toLocaleString("en-IN")}`
    : "N/A";

  const isCommercial =
    cat.toUpperCase() === "COMMERCIAL" ||
    p.property_category === "COMMERCIAL" ||
    config.toUpperCase().includes("OFFICE") ||
    config.toUpperCase().includes("SHOP") ||
    config.toUpperCase().includes("SHOWROOM") ||
    config.toUpperCase().includes("WAREHOUSE") ||
    config.toUpperCase().includes("GODOWN");

  if (isCommercial) {
    const commLines: string[] = [];
    const carpet = p.carpet_area_sqft ? `${p.carpet_area_sqft} sq.ft` : (p.area_sqft ? `${p.area_sqft} sq.ft` : null);
    if (carpet) commLines.push(`• 📏 <b>Carpet Area:</b> ${carpet}`);
    if (p.super_built_up_area_sqft) commLines.push(`• 📐 <b>Super Built-up:</b> ${p.super_built_up_area_sqft} sq.ft`);

    const parkingInfo = p.attributes?.parking || (p.parking_count ? `${p.parking_count} Dedicated Spots` : null);
    if (parkingInfo) commLines.push(`• 🚗 <b>Parking:</b> ${parkingInfo}`);

    const frontage = p.attributes?.road_frontage || p.attributes?.frontage;
    if (frontage) commLines.push(`• 🛣️ <b>Road Frontage:</b> ${frontage}`);

    const roi = p.attributes?.expected_roi || p.attributes?.rental_yield || p.attributes?.roi;
    if (roi) commLines.push(`• 📈 <b>Expected ROI/Yield:</b> ${roi}`);

    if (p.possession_status) commLines.push(`• 🔑 <b>Possession:</b> ${p.possession_status}`);
    if (p.furnished_status) commLines.push(`• 🏢 <b>Furnishing:</b> ${p.furnished_status}`);
    if (Array.isArray(p.landmarks) && p.landmarks.length > 0) {
      commLines.push(`• 📍 <b>Landmarks:</b> ${p.landmarks.slice(0, 2).join(", ")}`);
    }

    const commDetailsBlock = commLines.length ? `\n${commLines.join("\n")}` : "";
    const links: string[] = [];
    if (p.brochure_url) links.push(`📄 <a href="${p.brochure_url}">Brochure</a>`);
    if (p.map_url) links.push(`📍 <a href="${p.map_url}">Map</a>`);
    if (p.image_url) links.push(`🖼️ <a href="${p.image_url}">Photos</a>`);
    const linksText = links.length ? `\n• ${links.join(" | ")}` : "";

    const header = index === 0
      ? `🌟 <b>TOP COMMERCIAL PICK:</b>\n<b>1. ${safeName}</b>`
      : `🔹 <b>COMMERCIAL OPTION ${index + 1}:</b>\n<b>${index + 1}. ${safeName}</b>`;

    return `${header}\n• 📍 <b>Loc:</b> ${safeLoc}\n• 💼 <b>Type:</b> ${safeType}\n• 💰 <b>${isRental ? "Rent" : "Price"}:</b> ${formattedPrice}${commDetailsBlock}${linksText}`;
  }

  const extraLines: string[] = [];

  // 1. Area details (Carpet, Super Built-up, Area sqft)
  const areas: string[] = [];
  if (p.carpet_area_sqft) areas.push(`<b>Carpet:</b> ${p.carpet_area_sqft} sq.ft`);
  if (p.super_built_up_area_sqft) areas.push(`<b>Super Built-up:</b> ${p.super_built_up_area_sqft} sq.ft`);
  else if (p.area_sqft) areas.push(`<b>Area:</b> ${p.area_sqft} sq.ft`);
  if (areas.length > 0) {
    extraLines.push(`• 📏 <b>Area:</b> ${areas.join(" | ")}`);
  }

  // 2. Possession & Furnishing Status
  const statusPart: string[] = [];
  if (p.possession_status) statusPart.push(`<b>Possession:</b> ${p.possession_status}`);
  if (p.furnished_status) statusPart.push(`<b>Furnishing:</b> ${p.furnished_status}`);
  if (statusPart.length > 0) {
    extraLines.push(`• 🔑 ${statusPart.join(" | ")}`);
  }

  // 3. Landmarks
  if (Array.isArray(p.landmarks) && p.landmarks.length > 0) {
    extraLines.push(`• 📍 <b>Landmarks:</b> ${p.landmarks.slice(0, 2).join(", ")}`);
  }

  const detailsBlock = extraLines.length ? `\n${extraLines.join("\n")}` : "";

  // Links
  const links: string[] = [];
  if (p.brochure_url) links.push(`📄 <a href="${p.brochure_url}">Brochure</a>`);
  if (p.map_url) links.push(`📍 <a href="${p.map_url}">Map</a>`);
  if (p.image_url) links.push(`🖼️ <a href="${p.image_url}">Photos</a>`);
  const linksText = links.length ? `\n• ${links.join(" | ")}` : "";

  if (index === 0) {
    return `🌟 <b>BEST OPTION:</b>\n<b>1. ${safeName}</b>\n• 📍 <b>Loc:</b> ${safeLoc}\n• 📐 <b>Type:</b> ${safeType}\n• 💰 <b>Price:</b> ${formattedPrice}${isBestDeal ? " <b>(Best Deal)</b>" : ""}${detailsBlock}${linksText}`;
  } else {
    return `🔹 <b>OPTION ${index + 1}:</b>\n<b>${index + 1}. ${safeName}</b>\n• 📍 <b>Loc:</b> ${safeLoc}\n• 📐 <b>Type:</b> ${safeType}\n• 💰 <b>Price:</b> ${formattedPrice}${detailsBlock}${linksText}`;
  }
}

// 9. Automated Follow-Up, Pre-Visit Reminder & Post-Visit Feedback Sweep Engine
interface SweepOptions {
  force?: boolean;
  testLeadId?: string;
  types?: string[];
}

const BATCH_LIMIT = 20;

// Anti-ban random jitter delay (350ms - 550ms) between outbound messages
const sleepJitter = (minMs = 350, maxMs = 550) =>
  new Promise((resolve) => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)));

async function executeAutomatedCronSweep(options: SweepOptions = {}) {
  const sweepLog: any = {
    started_at: new Date().toISOString(),
    morning_briefings: [],
    pre_visit_reminders: [],
    post_visit_feedbacks: [],
    daily_followups: [],
    post_visit_drips: [],
    errors: [],
  };

  const nowMs = Date.now();
  const runAll = !options.types || options.types.length === 0;
  const runPreVisit = runAll || options.types.includes("pre_visit");
  const runPostVisit = runAll || options.types.includes("post_visit");
  const runDaily = runAll || options.types.includes("daily_followup");
  const runPostVisitDrip = runAll || options.types.includes("post_visit_drip");

  try {
    // =========================================================================
    // 1A. MODULE 1A: MORNING-OF-VISIT BRIEFING (Sent 9:00 AM - 11:30 AM IST for TODAY's visits)
    // =========================================================================
    const ist = getIstTime();
    const currentIstHour = ist.getUTCHours();
    const isMorningBriefingWindow = options.force || (currentIstHour >= 9 && currentIstHour <= 11);

    if (runPreVisit && isMorningBriefingWindow) {
      const todayDateStr = ist.toISOString().slice(0, 10);
      let qmb = supabase
        .from("leads")
        .select("*")
        .eq("site_visit_booked", true)
        .or("bot_active.is.null,bot_active.eq.true");

      if (options.testLeadId) {
        qmb = qmb.eq("lead_id", options.testLeadId);
      }
      qmb = qmb.order("site_visit_datetime", { ascending: true, nullsFirst: false }).limit(BATCH_LIMIT);

      const { data: mbLeads } = await qmb;
      if (mbLeads) {
        for (const l of mbLeads) {
          try {
            const scheduledIso = l.site_visit_at || l.site_visit_datetime;
            if (!scheduledIso) continue;
            const visitDate = new Date(scheduledIso);
            const visitIstEpoch = visitDate.getTime() + 5.5 * 3600 * 1000;
            const visitIstDateStr = new Date(visitIstEpoch).toISOString().slice(0, 10);

            if (visitIstDateStr !== todayDateStr && !options.force) continue;

            const metadata = l.metadata || {};
            if (metadata.morning_briefing_sent && !options.force) continue;

            let prop: any = null;
            const propId = l.selected_property_id || l.last_option_ids?.[0];
            if (propId) {
              const { data: p } = await supabase.from("inventory").select("*").eq("property_id", propId).maybeSingle();
              if (p) prop = p;
            }
            if (!prop) {
              const { data: p } = await supabase.from("inventory").select("*").eq("client_id", defaultTenantId).eq("status", "AVAILABLE").limit(1).maybeSingle();
              if (p) prop = p;
            }

            const projectName = prop?.project_name || "the project";
            const propLoc = prop?.location || "the site";
            const mapUrl = prop?.map_url || "https://maps.google.com";
            const formattedTime = visitDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
            const lang = l.user_language || "HINGLISH";
            const name = l.first_name || "Customer";

            let briefingMsg = "";
            if (lang === "GUJLISH") {
              briefingMsg = `Suprabhat <b>${name} bhai</b>! 🌅\n\nAaje tamari <b>${projectName}</b> (${propLoc}) mate VIP Site Visit <b>${formattedTime}</b> par scheduled chhe! 🚗\n\n📍 <b>Site Location Map:</b> ${mapUrl}\n\n🤝 <b>Site par maliye chiye!</b> Amara senior sales executive time par direct site location par tamne malshe. Shu timing confirm samjie?`;
            } else if (lang === "ENGLISH") {
              briefingMsg = `Good morning <b>${name}</b>! 🌅\n\nA quick briefing that your VIP Site Visit for <b>${projectName}</b> (${propLoc}) is scheduled today at <b>${formattedTime}</b>! 🚗\n\n📍 <b>Location Map:</b> ${mapUrl}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the site location. Looking forward to meeting you!`;
            } else {
              briefingMsg = `Suprabhat <b>${name} ji</b>! 🌅\n\nAaj aapki <b>${projectName}</b> (${propLoc}) ke liye VIP Site Visit <b>${formattedTime}</b> par scheduled hai! 🚗\n\n📍 <b>Site Location Map:</b> ${mapUrl}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par direct site location par aapse milenge. Kya hum timing confirm samjhein?`;
            }

            await sleepJitter();

            const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
            let dispatchRes: any;
            if (isTelegram) {
              dispatchRes = await sendTelegramMessage(defaultBotToken, l.lead_id, briefingMsg);
            } else {
              const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
              const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
              dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, briefingMsg);
            }

            await supabase
              .from("leads")
              .update({
                metadata: { ...metadata, morning_briefing_sent: true, morning_briefing_at: new Date().toISOString() },
              })
              .eq("id", l.id);

            await supabase.from("lead_events").insert({
              client_id: defaultTenantId,
              lead_id: l.lead_id,
              event_type: "MORNING_BRIEFING_SENT",
              payload: { scheduled_at: scheduledIso, projectName, timeFormatted: formattedTime, dispatchRes }
            });

            sweepLog.morning_briefings.push({ lead_id: l.lead_id, name, scheduledAt: scheduledIso });
          } catch (itemErr: any) {
            sweepLog.errors.push({ module: "morning_briefing_item", lead_id: l.lead_id, error: itemErr.message });
          }
        }
      }
    }

    // =========================================================================
    // 1. MODULE 1: PRE-VISIT REMINDERS (1 Hour Before Scheduled Visit)
    // =========================================================================
    if (runPreVisit) {
      let q = supabase
        .from("leads")
        .select("*")
        .eq("site_visit_booked", true)
        .or("bot_active.is.null,bot_active.eq.true");

      if (!options.force) {
        q = q.or("pre_visit_reminder_sent.is.null,pre_visit_reminder_sent.eq.false");
      }
      if (options.testLeadId) {
        q = q.eq("lead_id", options.testLeadId);
      }
      q = q.order("site_visit_datetime", { ascending: true, nullsFirst: false }).limit(BATCH_LIMIT);

      const { data: leadsForReminder, error: rErr } = await q;
      if (rErr) {
        sweepLog.errors.push({ module: "pre_visit", error: rErr.message });
      } else if (leadsForReminder) {
        for (const l of leadsForReminder) {
          try {
            const scheduledIso = l.site_visit_at || l.site_visit_datetime;
            if (!scheduledIso) continue;
            const visitTime = new Date(scheduledIso).getTime();
            const diffMinutes = Math.round((visitTime - nowMs) / (60 * 1000));

            // Window: 35 to 85 minutes before visit (centered at 60 mins). Force allows any upcoming visit.
            const inWindow = options.force ? true : (diffMinutes >= 35 && diffMinutes <= 85);
            if (!inWindow) continue;

            // Property details
            let prop: any = null;
            const propId = l.selected_property_id || l.last_option_ids?.[0];
            if (propId) {
              const { data: p } = await supabase.from("inventory").select("*").eq("property_id", propId).maybeSingle();
              if (p) prop = p;
            }
            if (!prop) {
              const { data: p } = await supabase.from("inventory").select("*").eq("client_id", defaultTenantId).eq("status", "AVAILABLE").limit(1).maybeSingle();
              if (p) prop = p;
            }

            const projectName = prop?.project_name || "the project";
            const propLoc = prop?.location || "the site";
            const mapUrl = prop?.map_url || "https://maps.google.com";
            const formattedTime = new Date(visitTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
            const lang = l.user_language || "HINGLISH";
            const name = l.first_name || "Customer";

            let reminderMsg = "";
            if (lang === "GUJLISH") {
              reminderMsg = `Namaste <b>${name} bhai</b>! ⏰ Reminder: Tamari <b>${projectName}</b> (${propLoc}) mate VIP Site Visit <b>1 kalak ma (${formattedTime})</b> scheduled chhe! 🚗\n\n📍 <b>Site Location Map:</b> ${mapUrl}\n\n🤝 <b>Site par maliye chiye!</b> Amara senior sales executive time par direct site location par tamne malshe. Jo time ma thodo ferfar hoy to janavjo!`;
            } else if (lang === "ENGLISH") {
              reminderMsg = `Hello <b>${name}</b>! ⏰ Reminder: Your VIP Site Visit for <b>${projectName}</b> (${propLoc}) is scheduled in <b>1 hour at ${formattedTime}</b>! 🚗\n\n📍 <b>Location Map:</b> ${mapUrl}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the site on time. Please let us know if you need any adjustments to your schedule!`;
            } else {
              reminderMsg = `Namaste <b>${name} ji</b>! ⏰ Reminder: Aapki <b>${projectName}</b> (${propLoc}) ke liye VIP Site Visit <b>1 ghante me (${formattedTime})</b> scheduled hai! 🚗\n\n📍 <b>Site Location Map:</b> ${mapUrl}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par direct site location par aapse milenge. Agar timing me thoda aage-piche ho to kripya bataiye!`;
            }

            await sleepJitter();

            const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
            let dispatchRes: any;
            if (isTelegram) {
              dispatchRes = await sendTelegramMessage(defaultBotToken, l.lead_id, reminderMsg);
            } else {
              const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
              const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
              dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, reminderMsg);
            }

            await supabase.from("leads").update({ pre_visit_reminder_sent: true }).eq("id", l.id);
            await supabase.from("site_visits").update({ reminder_2h_sent: true }).eq("lead_id", l.id);
            await supabase.from("lead_events").insert({
              client_id: defaultTenantId,
              lead_id: l.lead_id,
              event_type: "PRE_VISIT_REMINDER_SENT",
              payload: { scheduled_at: new Date(visitTime).toISOString(), projectName, timeFormatted: formattedTime, dispatchRes }
            });

            sweepLog.pre_visit_reminders.push({ lead_id: l.lead_id, name, scheduledAt: scheduledIso, diffMinutes });
          } catch (itemErr: any) {
            sweepLog.errors.push({ module: "pre_visit_item", lead_id: l.lead_id, error: itemErr.message });
          }
        }
      }
    }

    // =========================================================================
    // 2. MODULE 2: POST-VISIT FEEDBACK (1 Hour After Visit Time Passed)
    // =========================================================================
    if (runPostVisit) {
      let q = supabase
        .from("leads")
        .select("*")
        .eq("site_visit_booked", true)
        .or("bot_active.is.null,bot_active.eq.true");

      if (!options.force) {
        q = q.or("post_visit_feedback_sent.is.null,post_visit_feedback_sent.eq.false");
      }
      if (options.testLeadId) {
        q = q.eq("lead_id", options.testLeadId);
      }
      q = q.order("site_visit_datetime", { ascending: false, nullsFirst: false }).limit(BATCH_LIMIT);

      const { data: leadsForFeedback, error: fErr } = await q;
      if (fErr) {
        sweepLog.errors.push({ module: "post_visit", error: fErr.message });
      } else if (leadsForFeedback) {
        for (const l of leadsForFeedback) {
          try {
            const scheduledIso = l.site_visit_at || l.site_visit_datetime;
            if (!scheduledIso) continue;
            const visitTime = new Date(scheduledIso).getTime();
            const diffMinutesPast = Math.round((nowMs - visitTime) / (60 * 1000));

            // Window: Visit passed 45 mins to 24 hours ago. Force allows any past visit.
            const inWindow = options.force ? (diffMinutesPast >= 0) : (diffMinutesPast >= 45 && diffMinutesPast <= 1440);
            if (!inWindow) continue;

            let prop: any = null;
            const propId = l.selected_property_id || l.last_option_ids?.[0];
            if (propId) {
              const { data: p } = await supabase.from("inventory").select("*").eq("property_id", propId).maybeSingle();
              if (p) prop = p;
            }
            const projectName = prop?.project_name || "the property";
            const lang = l.user_language || "HINGLISH";
            const name = l.first_name || "Customer";

            let feedbackMsg = "";
            if (lang === "GUJLISH") {
              feedbackMsg = `Namaste <b>${name} bhai</b>! 🙏\nAaje <b>${projectName}</b> par tamari VIP site visit scheduled hati.\n\nShu tame visit par pahonchi shakya hata? 🚗\n\n1️⃣ <b>Haan, visit attend kari</b>\n2️⃣ <b>Nahi, visit nathi thai saki</b>\n\n<i>(Tame 1 ke 2 lakhi ne pan reply kari shako chho)</i>`;
            } else if (lang === "ENGLISH") {
              feedbackMsg = `Hello <b>${name}</b>! 🙏\nYou had a VIP site visit scheduled today for <b>${projectName}</b>.\n\nWere you able to attend the visit? 🚗\n\n1️⃣ <b>Yes, attended the visit</b>\n2️⃣ <b>No, couldn't make it</b>\n\n<i>(You can reply with 1 or 2)</i>`;
            } else {
              feedbackMsg = `Namaste <b>${name} ji</b>! 🙏\nAaj <b>${projectName}</b> par aapki VIP site visit scheduled thi.\n\nKya aap visit par pahunch paaye the? 🚗\n\n1️⃣ <b>Haan, visit attend ki</b>\n2️⃣ <b>Nahi, visit nahi ho paayi</b>\n\n<i>(Aap 1 ya 2 likhkar bhi reply kar sakte hain)</i>`;
            }

            await sleepJitter();

            const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
            let dispatchRes: any;
            if (isTelegram) {
              dispatchRes = await sendTelegramMessage(defaultBotToken, l.lead_id, feedbackMsg);
            } else {
              const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
              const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
              dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, feedbackMsg);
            }

            await supabase.from("leads").update({
              post_visit_feedback_sent: true,
              last_followup_at: new Date().toISOString(),
              last_active_at: new Date().toISOString(),
            }).eq("id", l.id);

            // Note: Keep site_visits status as SCHEDULED until user confirms attendance!
            await supabase.from("site_visits").update({
              notes: "Post-visit attendance confirmation sent to customer"
            }).eq("lead_id", l.id).eq("status", "SCHEDULED");

            await supabase.from("lead_events").insert({
              client_id: defaultTenantId,
              lead_id: l.lead_id,
              event_type: "POST_VISIT_FEEDBACK_SENT",
              payload: { visitTime: new Date(visitTime).toISOString(), projectName, diffMinutesPast, dispatchRes }
            });

            sweepLog.post_visit_feedbacks.push({ lead_id: l.lead_id, name, scheduledAt: scheduledIso, diffMinutesPast });
          } catch (itemErr: any) {
            sweepLog.errors.push({ module: "post_visit_item", lead_id: l.lead_id, error: itemErr.message });
          }
        }
      }
    }

    // =========================================================================
    // 2b. MODULE 2B: UNCONFIRMED VISIT ATTENDANCE NUDGE (20-48 Hours After Post-Visit Check)
    // =========================================================================
    if (runPostVisit) {
      const inBusinessHours = isWithinWorkingHours(11, 19);
      if (inBusinessHours || options.force) {
        let qNudge = supabase
          .from("leads")
          .select("*")
          .eq("site_visit_booked", true)
          .eq("post_visit_feedback_sent", true)
          .not("state", "in", '("SITE_VISIT_DONE","VISIT_DONE","VISIT_MISSED","DROPPED")')
          .or("bot_active.is.null,bot_active.eq.true");

        if (options.testLeadId) {
          qNudge = qNudge.eq("lead_id", options.testLeadId);
        }
        qNudge = qNudge.order("last_followup_at", { ascending: true, nullsFirst: true }).limit(BATCH_LIMIT);

        const { data: unconfirmedLeads } = await qNudge;
        if (unconfirmedLeads) {
          for (const l of unconfirmedLeads) {
            try {
              const meta = (typeof l.metadata === "object" && l.metadata !== null) ? (l.metadata as Record<string, unknown>) : {};
              if (meta.post_visit_nudge_sent && !options.force) continue;

              const lastFollowup = l.last_followup_at || l.updated_at || l.created_at;
              const hoursSinceCheck = lastFollowup ? (nowMs - new Date(lastFollowup).getTime()) / (1000 * 3600) : 999;

              // Send soft nudge between 20 and 48 hours after the post-visit check
              if (!options.force && (hoursSinceCheck < 20 || hoursSinceCheck > 72)) continue;

              let prop: any = null;
              const propId = l.selected_property_id || l.last_option_ids?.[0];
              if (propId) {
                const { data: p } = await supabase.from("inventory").select("*").eq("property_id", propId).maybeSingle();
                if (p) prop = p;
              }
              const projectName = prop?.project_name || "the property";
              const lang = l.user_language || "HINGLISH";
              const name = l.first_name || "Customer";

              let nudgeMsg = "";
              if (lang === "GUJLISH") {
                nudgeMsg = `Hi <b>${name} bhai</b>! 🙏 Kaale tamari <b>${projectName}</b> visit babate check karvano hato — shu kaale javani thayu hatu, ke aa aavta weekend par navi visit plan kariye? 🚗`;
              } else if (lang === "ENGLISH") {
                nudgeMsg = `Hi <b>${name}</b>! 🙏 Just following up regarding your <b>${projectName}</b> site visit yesterday — were you able to make it, or should we arrange a fresh visit this upcoming weekend? 🚗`;
              } else {
                nudgeMsg = `Hi <b>${name} ji</b>! 🙏 Kal aapki <b>${projectName}</b> visit ke baare me follow-up kar raha tha — kya kal aapka visit par jana ho paaya tha, ya hum is aane wale weekend par nayi visit arrange karein? 🚗`;
              }

              await sleepJitter();

              const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
              if (isTelegram) {
                await sendTelegramMessage(defaultBotToken, l.lead_id, nudgeMsg);
              } else {
                const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
                const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
                await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, nudgeMsg);
              }

              const updatedMeta = {
                ...meta,
                post_visit_nudge_sent: true,
                post_visit_nudge_at: new Date().toISOString(),
              };

              await supabase.from("leads").update({
                metadata: updatedMeta,
                last_followup_at: new Date().toISOString(),
              }).eq("id", l.id);

              // If hoursSinceCheck >= 36 and alert not sent yet, alert sales team for courtesy call
              if (hoursSinceCheck >= 36 && !meta.unconfirmed_visit_alert_sent) {
                await dispatchSalesAlert(defaultTenantId, "UNCONFIRMED_VISIT", l, { property: prop });
                updatedMeta.unconfirmed_visit_alert_sent = true;
                await supabase.from("leads").update({ metadata: updatedMeta }).eq("id", l.id);
              }

              sweepLog.post_visit_feedbacks.push({ lead_id: l.lead_id, name, type: "UNCONFIRMED_ATTENDANCE_NUDGE" });
            } catch (nudgeErr: any) {
              sweepLog.errors.push({ module: "post_visit_nudge_item", lead_id: l.lead_id, error: nudgeErr.message });
            }
          }
        }
      }
    }

    // =========================================================================
    // 3. MODULE 3: DAILY INCOMPLETE LEAD FOLLOW-UP (Din Me Ek Baar)
    // =========================================================================
    if (runDaily) {
      const inBusinessHours = isWithinWorkingHours(11, 19);
      if (!inBusinessHours && !options.force) {
        sweepLog.daily_followup_status = "SKIPPED_OUTSIDE_BUSINESS_HOURS (Active 11 AM - 6:30 PM IST)";
      } else {
        let q = supabase
          .from("leads")
          .select("*")
          .or("site_visit_booked.is.null,site_visit_booked.eq.false")
          .or("bot_active.is.null,bot_active.eq.true")
          .in("state", ["QUALIFYING", "OPTIONS_SENT", "FRESH", "VISIT_REQUESTED"])
          .is("rejection_reason", null);

        if (options.testLeadId) {
          q = q.eq("lead_id", options.testLeadId);
        }
        q = q.order("last_active_at", { ascending: true, nullsFirst: true }).limit(BATCH_LIMIT);

        const { data: eligibleLeads, error: dErr } = await q;
        if (dErr) {
          sweepLog.errors.push({ module: "daily_followup", error: dErr.message });
        } else if (eligibleLeads) {
          for (const l of eligibleLeads) {
            try {
              // Anti-spam Rule 1: Frequency cap - Max 1 message per day (20 hours gap)
              if (l.last_followup_at && !options.force) {
                const hoursSinceFollowup = (nowMs - new Date(l.last_followup_at).getTime()) / (1000 * 3600);
                if (hoursSinceFollowup < 20) continue;
              }

              // Anti-spam Rule 2: Inactivity gap - At least 4 hours of inactivity since last user action
              const lastActive = l.last_active_at || l.updated_at || l.created_at;
              if (lastActive && !options.force) {
                const hoursSinceActive = (nowMs - new Date(lastActive).getTime()) / (1000 * 3600);
                if (hoursSinceActive < 4) continue;
              }

              // Anti-spam Rule 3: Max 3 total follow-ups
              if ((l.followup_count || 0) >= 3 && !options.force) continue;

              const lang = l.user_language || "HINGLISH";
              const name = l.first_name || "Customer";
              let nudgeMsg = "";

              if (l.state === "OPTIONS_SENT") {
                let topProject = "selected property";
                const topPropId = l.last_option_ids?.[0] || l.selected_property_id;
                if (topPropId) {
                  const { data: p } = await supabase.from("inventory").select("project_name").eq("property_id", topPropId).maybeSingle();
                  if (p?.project_name) topProject = p.project_name;
                }

                if (lang === "GUJLISH") {
                  nudgeMsg = `Namaste <b>${name} bhai</b>! 👋 Ame je properties share kari hati (jaise <b>${topProject}</b>), shu tame check kari? Developer taraf thi limited units par <b>exclusive price sheet ane spot token booking benefits</b> chali rahya chhe. Jo tame direct inspection karva mangta ho, to ame <b>kaale sanje 5 vage</b> VIP Site Visit arrange kari shakie chiye. 🚗`;
                } else if (lang === "ENGLISH") {
                  nudgeMsg = `Hello <b>${name}</b>! 👋 Did you get a chance to review the shortlisted properties (such as <b>${topProject}</b>)? The developer is currently offering <b>exclusive price sheet & spot token booking benefits</b> on select units. Shall we schedule a VIP Site Visit <b>tomorrow at 5:00 PM</b>? 🚗`;
                } else {
                  nudgeMsg = `Namaste <b>${name} ji</b>! 👋 Jo properties humne share ki thin (jaise <b>${topProject}</b>), kya aapne review keen? Developer ki taraf se limited units par <b>exclusive price sheet aur spot token booking benefits</b> chal rahe hain. Kya hum <b>kal shaam 5 baje</b> VIP Site Visit plan karein? 🚗`;
                }
              } else if (l.state === "VISIT_REQUESTED") {
                if (lang === "GUJLISH") {
                  nudgeMsg = `Namaste <b>${name} bhai</b>! 👋 Tamari VIP Site Visit schedule karva mate, <b>kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b> mathi kayo slot confirm karie? 🚗`;
                } else if (lang === "ENGLISH") {
                  nudgeMsg = `Hello <b>${name}</b>! 👋 To confirm your VIP Site Visit, would you prefer <b>tomorrow at 5 PM</b> or <b>Sunday at 11 AM</b>? 🚗`;
                } else {
                  nudgeMsg = `Namaste <b>${name} ji</b>! 👋 Aapki VIP Site Visit schedule karne ke liye, <b>kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b> me se kaunsa slot confirm karein? 🚗`;
                }
              } else {
                // Incomplete Qualification (QUALIFYING or FRESH)
                if (!l.budget || l.budget <= 0) {
                  if (lang === "GUJLISH") {
                    nudgeMsg = `Namaste <b>${name} bhai</b>! 👋 Ame tamara mate best properties shortlist kari rahya hata. Fakt tamaro <b>budget range</b> janavi do, jethi ame direct matching options share kari shakie!`;
                  } else if (lang === "ENGLISH") {
                    nudgeMsg = `Hello <b>${name}</b>! 👋 We are shortlisting the best properties for you. Could you please share your <b>budget range</b> so we can send the top matching options right away?`;
                  } else {
                    nudgeMsg = `Namaste <b>${name} ji</b>! 👋 Hum aapke liye best properties shortlist kar rahe the. Bas aapka <b>budget range</b> bata dijiye, taaki hum direct matching options share kar sakein!`;
                  }
                } else if (!l.location) {
                  if (lang === "GUJLISH") {
                    nudgeMsg = `Namaste <b>${name} bhai</b>! 👋 Tamari pasandida <b>location / area</b> kayo chhe, jethi ame tyan ni verified properties tamne mokli shakie?`;
                  } else if (lang === "ENGLISH") {
                    nudgeMsg = `Hello <b>${name}</b>! 👋 Which <b>location or area</b> do you prefer so we can share verified properties right there?`;
                  } else {
                    nudgeMsg = `Namaste <b>${name} ji</b>! 👋 Aapki preferred <b>location ya area</b> kaunsi hai, taaki hum wahan ki verified properties aapko bhej sakein?`;
                  }
                } else if (!l.property_type) {
                  if (lang === "GUJLISH") {
                    nudgeMsg = `Namaste <b>${name} bhai</b>! 👋 Tamne keva type ni property joiye chhe (jaise <b>2 BHK / 3 BHK Flat, Villa, ke Commercial Office / Shop</b>)?`;
                  } else if (lang === "ENGLISH") {
                    nudgeMsg = `Hello <b>${name}</b>! 👋 What type of property are you looking for (such as <b>2 BHK / 3 BHK Flat, Villa, or Commercial Office / Shop</b>)?`;
                  } else {
                    nudgeMsg = `Namaste <b>${name} ji</b>! 👋 Aapko kis type ki property dekhni hai (jaise <b>2 BHK / 3 BHK Flat, Villa, ya Commercial Office / Shop</b>)?`;
                  }
                } else {
                  if (lang === "GUJLISH") {
                    nudgeMsg = `Namaste <b>${name} bhai</b>! 👋 Shu ame tamari property shodh ma aagad madad kari shakie? Tamari requirement janavjo to ame direct top deals share karie.`;
                  } else if (lang === "ENGLISH") {
                    nudgeMsg = `Hello <b>${name}</b>! 👋 Can we assist you further with your property search? Please let us know your requirements so we can share the best available options.`;
                  } else {
                    nudgeMsg = `Namaste <b>${name} ji</b>! 👋 Kya hum aapki property search me aage madad karein? Aapki requirement batayenge to hum direct top deals share karenge.`;
                  }
                }
              }

              await sleepJitter();

              const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
              let dispatchRes: any;
              if (isTelegram) {
                dispatchRes = await sendTelegramMessage(defaultBotToken, l.lead_id, nudgeMsg);
              } else {
                const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
                const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
                dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, nudgeMsg);
              }

              const newCount = (l.followup_count || 0) + 1;
              const dripStage = l.state === "OPTIONS_SENT" ? "OPTIONS_NUDGE" : "QUALIFYING_NUDGE";

              await supabase.from("leads").update({
                last_followup_at: new Date().toISOString(),
                followup_count: newCount,
                drip_stage: dripStage,
              }).eq("id", l.id);

              await supabase.from("lead_events").insert({
                client_id: defaultTenantId,
                lead_id: l.lead_id,
                event_type: "DAILY_FOLLOWUP_SENT",
                payload: { state: l.state, followup_count: newCount, dripStage, message: nudgeMsg.slice(0, 300), dispatchRes }
              });

              sweepLog.daily_followups.push({ lead_id: l.lead_id, name, state: l.state, followup_count: newCount });
            } catch (itemErr: any) {
              sweepLog.errors.push({ module: "daily_followup_item", lead_id: l.lead_id, error: itemErr.message });
            }
          }
        }
      }
    }

    // =========================================================================
    // 4. MODULE 4: POST-VISIT DAY-WISE DRIP CADENCE (For SITE_VISIT_DONE Leads)
    // =========================================================================
    if (runPostVisitDrip) {
      const inBusinessHours = isWithinWorkingHours(11, 19);
      if (!inBusinessHours && !options.force) {
        sweepLog.post_visit_drip_status = "SKIPPED_OUTSIDE_BUSINESS_HOURS (Active 11 AM - 6:30 PM IST)";
      } else {
        let q = supabase
          .from("leads")
          .select("*")
          .in("state", ["SITE_VISIT_DONE", "VISIT_DONE"])
          .or("bot_active.is.null,bot_active.eq.true")
          .is("rejection_reason", null)
          .in("drip_stage", ["POST_VISIT_DAY_1", "POST_VISIT_DAY_3", "POST_VISIT_DAY_7"]);

        if (options.testLeadId) {
          q = q.eq("lead_id", options.testLeadId);
        }
        q = q.order("last_followup_at", { ascending: true, nullsFirst: true }).limit(BATCH_LIMIT);

        const { data: dripLeads, error: dripErr } = await q;
        if (dripErr) {
          sweepLog.errors.push({ module: "post_visit_drip", error: dripErr.message });
        } else if (dripLeads) {
          for (const l of dripLeads) {
            try {
              const stage = l.drip_stage || "POST_VISIT_DAY_1";
              const lastFollowup = l.last_followup_at || l.updated_at || l.created_at;
              const hoursSinceLast = lastFollowup ? (nowMs - new Date(lastFollowup).getTime()) / (1000 * 3600) : 999;

              // Day intervals:
              // POST_VISIT_DAY_1: At least 20 hours after visit completion (or force)
              // POST_VISIT_DAY_3: At least 44 hours after Day 1 message (or force)
              // POST_VISIT_DAY_7: At least 90 hours after Day 3 message (or force)
              if (!options.force) {
                if (stage === "POST_VISIT_DAY_1" && hoursSinceLast < 20) continue;
                if (stage === "POST_VISIT_DAY_3" && hoursSinceLast < 44) continue;
                if (stage === "POST_VISIT_DAY_7" && hoursSinceLast < 90) continue;
              }

              let prop: any = null;
              const propId = l.selected_property_id || l.last_option_ids?.[0];
              if (propId) {
                const { data: p } = await supabase.from("inventory").select("*").eq("property_id", propId).maybeSingle();
                if (p) prop = p;
              }
              const projectName = prop?.project_name || "the property";
              const lang = l.user_language || "HINGLISH";
              const name = l.first_name || "Customer";

              let dripMsg = "";
              let nextDripStage = "POST_VISIT_DAY_3";

              if (stage === "POST_VISIT_DAY_1") {
                nextDripStage = "POST_VISIT_DAY_3";
                if (lang === "GUJLISH") {
                  dripMsg = `Namaste <b>${name} bhai</b>! 🌟 Tamari <b>${projectName}</b> ni site visit pachhi, shu tame koi preferred unit ya floor select karyo chhe? Developer taraf thi limited units par token booking offer ane priority allotment chali rahyu chhe. Shu ame booking form share kariye?`;
                } else if (lang === "ENGLISH") {
                  dripMsg = `Hello <b>${name}</b>! 🌟 Following your site visit to <b>${projectName}</b>, have you selected your preferred unit or floor? The developer is currently offering priority allotment and exclusive token booking terms on select inventory. Shall we share the booking process details?`;
                } else {
                  dripMsg = `Namaste <b>${name} ji</b>! 🌟 Aapki <b>${projectName}</b> ki site visit ke baad, kya aapne koi preferred unit ya floor finalize kiya? Developer ki taraf se limited units par token booking offer aur priority allotment chal raha hai. Kya hum booking process share karein?`;
                }
              } else if (stage === "POST_VISIT_DAY_3") {
                nextDripStage = "POST_VISIT_DAY_7";
                if (lang === "GUJLISH") {
                  dripMsg = `Namaste <b>${name} bhai</b>! 🏦 <b>${projectName}</b> mate amari banking partners taraf thi lowest home loan rates (8.4% starting) ane flexible construction-linked payment schemes upalabdha chhe. Shu ame EMI calculation ane pre-approval ma madad kariye?`;
                } else if (lang === "ENGLISH") {
                  dripMsg = `Hello <b>${name}</b>! 🏦 For <b>${projectName}</b>, our banking partners are offering lowest home loan interest rates (starting at 8.4%) along with flexible payment schedules. Would you like us to assist you with customized EMI calculation and fast-track pre-approval?`;
                } else {
                  dripMsg = `Namaste <b>${name} ji</b>! 🏦 <b>${projectName}</b> ke liye hamare banking partners lowest home loan rates (8.4% starting) aur flexible payment plans provide kar rahe hain. Kya hum aapki EMI calculation aur pre-approval assist karein?`;
                }
              } else if (stage === "POST_VISIT_DAY_7") {
                nextDripStage = "POST_VISIT_COMPLETED";
                if (lang === "GUJLISH") {
                  dripMsg = `Namaste <b>${name} bhai</b>! 🏢 <b>${projectName}</b> babate tamaro aaghad no vichar kevo chhe? Jo tame aa project final karva magta ho to developer sathe final meeting arrange kari shakie, athva tamare aa j budget ma bija matching projects jova hoy to janavjo!`;
                } else if (lang === "ENGLISH") {
                  dripMsg = `Hello <b>${name}</b>! 🏢 Following up on <b>${projectName}</b> — what are your thoughts on taking this forward? If you'd like to finalize, we can arrange the final developer meeting, or if you wish to explore alternative matching options in the same budget, please let us know!`;
                } else {
                  dripMsg = `Namaste <b>${name} ji</b>! 🏢 <b>${projectName}</b> ke baare me aapka aage ka kya plan hai? Agar aap is deal ko close karna chahte hain to hum developer ke sath final meeting arrange kar sakte hain, ya agar aap isi budget me doosri matching properties dekhna chahte hain to zaroor batayein!`;
                }
              }

              await sleepJitter();

              const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
              let dispatchRes: any;
              if (isTelegram) {
                dispatchRes = await sendTelegramMessage(defaultBotToken, l.lead_id, dripMsg);
              } else {
                const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
                const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
                dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, dripMsg);
              }

              await supabase.from("leads").update({
                last_followup_at: new Date().toISOString(),
                drip_stage: nextDripStage,
              }).eq("id", l.id);

              await supabase.from("lead_events").insert({
                client_id: defaultTenantId,
                lead_id: l.lead_id,
                event_type: "POST_VISIT_DRIP_SENT",
                payload: { stage, nextDripStage, projectName, message: dripMsg.slice(0, 300), dispatchRes }
              });

              sweepLog.post_visit_drips.push({ lead_id: l.lead_id, name, stage, nextDripStage });
            } catch (itemErr: any) {
              sweepLog.errors.push({ module: "post_visit_drip_item", lead_id: l.lead_id, error: itemErr.message });
            }
          }
        }
      }
    }
  } catch (err: any) {
    sweepLog.errors.push({ module: "root", error: err.message });
  }

  sweepLog.completed_at = new Date().toISOString();
  sweepLog.success = sweepLog.errors.length === 0;
  return sweepLog;
}

// =========================================================================
// 9b. OWNER & PROVIDER ENGINE (Selling / Renting Out / Leasing Out)
// =========================================================================
// 8. OWNER INTAKE ENGINE (100% Zero-Regex AI Extraction)
// =========================================================================

async function handleOwnerFlow({
  lead,
  messageText,
  lower,
  lang,
  senderName,
  senderId,
  platform,
  tenantId,
  supabase,
  aiAnalysis,
  city,
  agencyName,
}: {
  lead: any;
  messageText: string;
  lower: string;
  lang: "HINGLISH" | "GUJLISH" | "ENGLISH";
  senderName: string;
  senderId: string;
  platform: string;
  tenantId: string;
  supabase: any;
  aiAnalysis?: ClassifiedIntent;
  city?: string | null;
  agencyName?: string;
}): Promise<{ replyText: string; nextState: string }> {
  // 1. Initialize or load in-progress draft from metadata
  const existingMeta = lead.metadata || {};
  let draft = existingMeta.owner_draft || {};
  if (!draft.attributes) draft.attributes = {};

  // 1b. Direct accumulative AI entities merge (100% Zero-Regex Architecture):
  if (aiAnalysis) {
    // A. Transaction Type Immutability:
    // Once locked (SELL or RENT_OUT), single digits ("1", "2", "3") or furnishing/possession replies
    // must NEVER overwrite transaction_type! Only explicit reversal keywords may update it.
    const hasExplicitRoleReversal = /(?:bechna|bechni|sell|bikri|rent\s*out|bhadu|kiraye|rent\s*par|lease)/i.test(messageText);
    if (!draft.transaction_type || hasExplicitRoleReversal) {
      if (aiAnalysis.transaction_type) {
        draft.transaction_type = (aiAnalysis.transaction_type === "RENT" || aiAnalysis.transaction_type === "LEASE") ? "RENT_OUT" : "SELL";
      }
    }
    if (!draft.transaction_type) {
      draft.transaction_type = "SELL";
    }

    // B. Property Category & Type:
    // Once established (e.g. Villa), subsequent turns mentioning "plot area" or "built-up" must NOT overwrite property_type!
    const hasPropCorrection = /(?:badalna|change|nhi|nahi|villa\s*nahi|flat\s*nahi)/i.test(messageText);
    if (aiAnalysis.property_type && (!draft.property_type || hasPropCorrection)) {
      draft.property_type = aiAnalysis.property_type;
      draft.configuration = aiAnalysis.property_type;
    }
    if (aiAnalysis.property_category && (!draft.property_category || hasPropCorrection)) {
      draft.property_category = aiAnalysis.property_category;
    }

    // C. Project / Society Name:
    if (aiAnalysis.project_or_society) {
      const cleanSoc = aiAnalysis.project_or_society.replace(/^(?:ye|meri|mera|maro|mari|in|at)\s+/i, "").trim();
      draft.society_name = cleanSoc;
      draft.project_name = cleanSoc;
    }

    // D. Location:
    if (aiAnalysis.location && aiAnalysis.location !== "FLEXIBLE") {
      draft.location = aiAnalysis.location;
    }

    // E. Areas (Carpet, Super Built-up, Plot Area):
    if (aiAnalysis.carpet_sqft) {
      draft.carpet_area_sqft = aiAnalysis.carpet_sqft;
    }
    if (aiAnalysis.super_built_up_sqft) {
      draft.super_built_up_sqft = aiAnalysis.super_built_up_sqft;
      draft.attributes.built_up_area = aiAnalysis.super_built_up_sqft;
    }
    if (aiAnalysis.plot_area_sqft) {
      draft.plot_area_sqft = aiAnalysis.plot_area_sqft;
      draft.attributes.plot_area = aiAnalysis.plot_area_sqft;
      if (!draft.carpet_area_sqft) {
        draft.carpet_area_sqft = aiAnalysis.plot_area_sqft;
      }
    }

    // F. Expected Price / Demand / Monthly Rent:
    const isAnsweringPhone = lead.state === "OWNER_PHONE_PENDING" || !!aiAnalysis.contact_phone;
    if (aiAnalysis.price_or_budget && !isAnsweringPhone) {
      const isRentTx = draft.transaction_type === "RENT_OUT" || draft.transaction_type === "LEASE_OUT";
      const hasValidPrice = (!isRentTx && (draft.expected_price || 0) >= 100000) || (isRentTx && (draft.expected_rent || 0) >= 3000);
      if (!hasValidPrice || lead.state === "OWNER_PRICE_PENDING") {
        if (isRentTx) {
          // Sanity check: In Indian real estate, residential rent rarely exceeds ₹15 Lakhs/month.
          // Amounts >= ₹15 Lakhs without explicit /month are selling prices or demands.
          if (aiAnalysis.price_or_budget < 1500000) {
            draft.expected_rent = aiAnalysis.price_or_budget;
          } else {
            draft.expected_price = aiAnalysis.price_or_budget;
            draft.transaction_type = "SELL";
          }
        } else {
          draft.expected_price = aiAnalysis.price_or_budget;
        }
      }
    }

    // G. Possession Status:
    if (aiAnalysis?.possession_status) {
      draft.possession_status = aiAnalysis.possession_status;
    } else if (lead.state === "OWNER_POSSESSION_PENDING") {
      if (lower === "1" || lower === "1️⃣" || lower.includes("ready") || lower.includes("rtm")) {
        draft.possession_status = "READY_TO_MOVE";
      } else if (lower === "2" || lower === "2️⃣" || lower.includes("under construction") || lower.includes("uc")) {
        draft.possession_status = "UNDER_CONSTRUCTION";
      }
    }

    // H. Furnishing Status:
    if (aiAnalysis?.furnishing_status) {
      draft.furnishing_status = aiAnalysis.furnishing_status;
    } else if (lead.state === "OWNER_FURNISHING_PENDING") {
      if (lower === "1" || lower === "1️⃣" || lower.includes("unfurnished")) {
        draft.furnishing_status = "UNFURNISHED";
      } else if (lower === "2" || lower === "2️⃣" || lower.includes("semi")) {
        draft.furnishing_status = "SEMI_FURNISHED";
      } else if (lower === "3" || lower === "3️⃣" || lower.includes("full") || lower.includes("furnished")) {
        draft.furnishing_status = "FURNISHED";
      }
    }

    // I. Direct Calling / WhatsApp Phone (if provided):
    if (aiAnalysis?.contact_phone) {
      const cleanPhone = aiAnalysis.contact_phone.replace(/\D/g, "");
      if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
        draft.contact_phone = cleanPhone.slice(-10);
      }
    } else if (lead.state === "OWNER_PHONE_PENDING") {
      const cleanPhone = messageText.replace(/\D/g, "");
      if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
        draft.contact_phone = cleanPhone.slice(-10);
      }
    }
  }

  // If already gathered and user is just saying thanks or checking status
  if (lead.state === "OWNER_DETAILS_GATHERED") {
    const isAcknowledgement = /^(thik|theek|thk|thek|ok|okay|k|sahi|achha|acha|saras|barobar|done|understood|samajh|dhanyawad|thanks|thank you|shukriya|aabhar)/i.test(lower.trim());
    const replyText = isAcknowledgement
      ? (lang === "GUJLISH"
        ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! Amari team physical inspection ane verification mate jaldi sampark karshe. Kripya dhyan rakhjo! 🙏`
        : lang === "ENGLISH"
        ? `Certainly <b>${senderName || "Friend"}</b>! Our acquisition team will connect with you shortly for on-site inspection. Feel free to reach out if you need anything else! 🙏`
        : `Ji bilkul <b>${senderName ? `${senderName} ji` : "ji"}</b>! Hamari team inspection & verification ke liye jald aapse call par connect karegi. Koi bhi aur requirement ho to zaroor batayein! 🙏`)
      : (lang === "GUJLISH"
        ? `Ji bilkul <b>${senderName} bhai</b>! Tamari property details Nextgen Realty listing desk par successfully verified ane saved chhe. 📋 Amari acquisition team jaldi direct call par tamaro sampark karshe. Kripya dhyan rakhjo! 🙏`
        : lang === "ENGLISH"
        ? `Sure <b>${senderName}</b>! Your property listing is under active review on the Nextgen Realty listing desk. 📋 Our acquisition team will connect with you shortly for verification and on-site photography! 🙏`
        : `Ji bilkul <b>${senderName} ji</b>! Aapki property details Nextgen Realty listing desk par successfully registered hain. 📋 Hamari acquisition team verification & inspection ke liye jald aapse call par connect karegi! 🙏`);
    return { replyText, nextState: "OWNER_DETAILS_GATHERED" };
  }

  // ---------------------------------------------------------------------------
  // Strict Single-Question Cascade (At a time EK HI detail pucho)
  // ---------------------------------------------------------------------------

  // Step 1: Configuration & Category
  if (!draft.configuration && !draft.property_type) {
    const agency = agencyName || "NextGen Realty";
    const replyText =
      lang === "GUJLISH"
        ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! ${agency} par ame verified buyers ane tenants sathe deal kariye chiye. 🏡✨\n\n👉 <b>Tamari property kaya type ni chhe — 2BHK / 3BHK Flat, Villa, ke Commercial Shop/Office?</b> 🏢`
        : lang === "ENGLISH"
        ? `Certainly <b>${senderName || "Friend"}</b>! ${agency} connects property owners directly with verified buyers and tenants. 🏡✨\n\n👉 <b>What type of property is this — 2BHK / 3BHK Flat, Villa, or Commercial Shop/Office?</b> 🏢`
        : `Ji bilkul <b>${senderName ? `${senderName} ji` : "ji"}</b>! ${agency} par hum verified buyers aur tenants ke sath deal karte hain. 🏡✨\n\n👉 <b>Aapki property kis type ki hai — 2BHK / 3BHK Flat, Villa, ya Commercial Shop/Office?</b> 🏢`;

    await supabase.from("leads").update({
      lead_type: "PROVIDER",
      state: "OWNER_CONFIG_PENDING",
      metadata: { ...existingMeta, owner_draft: draft },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_CONFIG_PENDING" };
  }

  // Step 2: Project / Society Name (Smart Commercial vs Residential)
  const isComm = draft.property_category === "COMMERCIAL" || /(office|shop|showroom|warehouse)/i.test(String(draft.property_type || ""));
  if (!draft.society_name && !draft.project_name && !draft.location) {
    if (lead.state === "OWNER_SOCIETY_PENDING" && messageText.trim().length >= 2) {
      const cleaned = messageText.replace(/^(?:ye|meri|mera|maro|mari|in|at)\s+/i, "").trim();
      draft.society_name = cleaned;
      draft.project_name = cleaned;
    } else {
      const propLabel = draft.configuration || draft.property_type || "property";
      const replyText = isComm
        ? (lang === "GUJLISH"
          ? `Bahuj saras! <b>${propLabel}</b> note kari lidhu chhe. 👍\n\n👉 <b>Aa property kaya Commercial Complex, Business Hub ke Road par sthit chhe? (e.g. Atlantis K-10, Sayaji Plaza ya Main Road)</b> 🏢`
          : lang === "ENGLISH"
          ? `Great! Noted <b>${propLabel}</b>. 👍\n\n👉 <b>Which Commercial Complex, Business Hub, or Road is this located on? (e.g. Atlantis K-10, Sayaji Plaza, or Main Road)</b> 🏢`
          : `Bahut badhiya! <b>${propLabel}</b> note kar liya hai. 👍\n\n👉 <b>Ye property kis Commercial Complex, Business Hub ya Road par sthit hai? (e.g. Atlantis K-10, Sayaji Plaza ya Main Road)</b> 🏢`)
        : (lang === "GUJLISH"
          ? `Bahuj saras! <b>${propLabel}</b> note kari lidhu chhe. 👍\n\n👉 <b>Aa property kaya Project ke Society ma sthit chhe? (e.g. Nilamber Bellissimo, Sun Crest)</b> 🏢`
          : lang === "ENGLISH"
          ? `Great! Noted <b>${propLabel}</b>. 👍\n\n👉 <b>Which Project or Society is your property located in? (e.g. Nilamber Bellissimo, Sun Crest)</b> 🏢`
          : `Bahut badhiya! <b>${propLabel}</b> note kar liya hai. 👍\n\n👉 <b>Ye property kis Project ya Society me sthit hai? (e.g. Nilamber Bellissimo, Sun Crest)</b> 🏢`);

      await supabase.from("leads").update({
        lead_type: "PROVIDER",
        state: "OWNER_SOCIETY_PENDING",
        metadata: { ...existingMeta, owner_draft: draft },
      }).eq("id", lead.id);

      return { replyText, nextState: "OWNER_SOCIETY_PENDING" };
    }
  }

  // Step 3: Exact Locality / Area
  if (!draft.location) {
    if (lead.state === "OWNER_LOCATION_PENDING" && messageText.trim().length >= 2) {
      draft.location = messageText.trim();
    } else {
      const socLabel = draft.society_name || draft.project_name || "Society";
      const replyText =
        lang === "GUJLISH"
          ? `Noted <b>${socLabel}</b>! 🏢\n\n👉 <b>Aa property ${city ? `${city} na ` : ""}kaya exact Area ke Landmark pase sthit chhe?</b> 📍`
          : lang === "ENGLISH"
          ? `Noted <b>${socLabel}</b>! 🏢\n\n👉 <b>In which exact Area or near which Landmark${city ? ` in ${city}` : ""} is this located?</b> 📍`
          : `Noted <b>${socLabel}</b>! 🏢\n\n👉 <b>Ye property ${city ? `${city} ke ` : ""}kaunse exact Area ya Landmark ke paas sthit hai?</b> 📍`;

      await supabase.from("leads").update({
        lead_type: "PROVIDER",
        state: "OWNER_LOCATION_PENDING",
        metadata: { ...existingMeta, owner_draft: draft },
      }).eq("id", lead.id);

      return { replyText, nextState: "OWNER_LOCATION_PENDING" };
    }
  }

  // Step 4: Carpet Area / Plot Area / Built-up Area
  if (!draft.carpet_area_sqft && !draft.super_built_up_sqft && !draft.plot_area_sqft) {
    const locLabel = `${draft.society_name || ""}, ${draft.location || ""}`.replace(/^,\s*|,\s*$/g, "").trim() || (city || "Prime Area");
    const replyText =
      lang === "GUJLISH"
        ? `Noted <b>${locLabel}</b>. 👍\n\n👉 <b>Property no approximate Carpet ya Built-up Area ketlo sq.ft chhe?</b> 📐`
        : lang === "ENGLISH"
        ? `Noted <b>${locLabel}</b>. 👍\n\n👉 <b>What is the approximate Carpet or Built-up Area of the property in sq.ft?</b> 📐`
        : `Noted <b>${locLabel}</b>. 👍\n\n👉 <b>Property ka approximate Carpet ya Built-up Area kitna sq.ft hai?</b> 📐`;

    await supabase.from("leads").update({
      lead_type: "PROVIDER",
      state: "OWNER_AREA_PENDING",
      metadata: { ...existingMeta, owner_draft: draft },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_AREA_PENDING" };
  }

  // Step 5: Expected Price / Demand / Monthly Rent
  const isRent = draft.transaction_type === "RENT_OUT" || draft.transaction_type === "LEASE_OUT";
  if ((isRent && (!draft.expected_rent || draft.expected_rent < 3000)) || (!isRent && (!draft.expected_price || draft.expected_price < 100000))) {
    const areaDesc = draft.super_built_up_sqft
      ? `${draft.super_built_up_sqft} sq.ft Built-up`
      : draft.carpet_area_sqft
      ? `${draft.carpet_area_sqft} sq.ft`
      : "";
    const targetProp = `${draft.configuration || draft.property_type || "Property"}${areaDesc ? ` (${areaDesc})` : ""}`;
    const replyText =
      lang === "GUJLISH"
        ? `Noted — <b>${targetProp}</b>! 📐\n\n👉 <b>Aa property mate tamaro expected ${isRent ? "Monthly Rent 💰 (e.g. ₹25,000/month)" : "Selling Price / Demand 💰 (e.g. 75 Lakhs, 1.25 Cr)"} ketlo raheshe?</b>`
        : lang === "ENGLISH"
        ? `Noted — <b>${targetProp}</b>! 📐\n\n👉 <b>What is your expected ${isRent ? "monthly rent 💰 (e.g. ₹25,000/month)" : "asking price / demand 💰 (e.g. 75 Lakhs, 1.25 Cr)"} for this property?</b>`
        : `Noted — <b>${targetProp}</b>! 📐\n\n👉 <b>Is property ke liye aapka expected ${isRent ? "Monthly Rent 💰 (e.g. ₹25,000/month)" : "Selling Price / Demand 💰 (e.g. 75 Lakhs, 1.25 Cr)"} kitna rahega?</b>`;

    await supabase.from("leads").update({
      lead_type: "PROVIDER",
      state: "OWNER_PRICE_PENDING",
      metadata: { ...existingMeta, owner_draft: draft },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_PRICE_PENDING" };
  }

  // Step 6: Possession Status
  if (!draft.possession_status) {
    const priceStr = isRent
      ? `₹${Number(draft.expected_rent || 0).toLocaleString("en-IN")}/month`
      : `₹${Number(draft.expected_price || 0).toLocaleString("en-IN")}`;
    const replyText =
      lang === "GUJLISH"
        ? `Noted — <b>${priceStr} Demand</b>. 💰\n\n👉 <b>Property no Possession status shu chhe — Ready to Move chhe ke Under Construction? (1 ya 2)</b> 🔑\n\n1️⃣ <b>Ready to Move</b>\n2️⃣ <b>Under Construction</b>`
        : lang === "ENGLISH"
        ? `Noted — <b>${priceStr} Demand</b>. 💰\n\n👉 <b>What is the possession status — Ready to Move or Under Construction? (Reply 1 or 2)</b> 🔑\n\n1️⃣ <b>Ready to Move</b>\n2️⃣ <b>Under Construction</b>`
        : `Noted — <b>${priceStr} Demand</b>. 💰\n\n👉 <b>Property ka Possession status kya hai — Ready to Move hai ya Under Construction? (Aap 1 ya 2 likh sakte hain)</b> 🔑\n\n1️⃣ <b>Ready to Move</b>\n2️⃣ <b>Under Construction</b>`;

    await supabase.from("leads").update({
      lead_type: "PROVIDER",
      state: "OWNER_POSSESSION_PENDING",
      metadata: { ...existingMeta, owner_draft: draft },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_POSSESSION_PENDING" };
  }

  // Step 7: Furnishing Status
  if (!draft.furnishing_status) {
    const possLabel = draft.possession_status === "READY_TO_MOVE" ? "Ready to Move" : "Under Construction";
    const replyText =
      lang === "GUJLISH"
        ? `Noted — <b>${possLabel}</b>! 🔑\n\n👉 <b>Property nu Furnishing status shu chhe — Unfurnished, Semi-Furnished ke Fully Furnished? (1, 2 ya 3)</b> 🛋️\n\n1️⃣ <b>Unfurnished</b>\n2️⃣ <b>Semi-Furnished</b>\n3️⃣ <b>Fully Furnished</b>`
        : lang === "ENGLISH"
        ? `Noted — <b>${possLabel}</b>! 🔑\n\n👉 <b>What is the furnishing status — Unfurnished, Semi-Furnished, or Fully Furnished? (Reply 1, 2 or 3)</b> 🛋️\n\n1️⃣ <b>Unfurnished</b>\n2️⃣ <b>Semi-Furnished</b>\n3️⃣ <b>Fully Furnished</b>`
        : `Noted — <b>${possLabel}</b>! 🔑\n\n👉 <b>Property ka Furnishing status kya hai — Unfurnished, Semi-Furnished ya Fully Furnished? (Aap 1, 2 ya 3 likh sakte hain)</b> 🛋️\n\n1️⃣ <b>Unfurnished</b>\n2️⃣ <b>Semi-Furnished</b>\n3️⃣ <b>Fully Furnished</b>`;

    await supabase.from("leads").update({
      lead_type: "PROVIDER",
      state: "OWNER_FURNISHING_PENDING",
      metadata: { ...existingMeta, owner_draft: draft },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_FURNISHING_PENDING" };
  }

  // Step 7b: Telegram / Web Direct Calling Number Capture (if phone is missing)
  let effectivePhone = draft.contact_phone || (lead.phone && !lead.phone.startsWith("tg_") ? lead.phone : null);
  if (!effectivePhone && (lead.state === "OWNER_PHONE_PENDING" || aiAnalysis?.contact_phone)) {
    const rawDigits = (aiAnalysis?.contact_phone || messageText).replace(/\D/g, "");
    if (rawDigits.length >= 10 && rawDigits.length <= 13) {
      draft.contact_phone = rawDigits.slice(-10);
      effectivePhone = draft.contact_phone;
    }
  }

  if (!effectivePhone && platform.toUpperCase() === "TELEGRAM") {
    const replyText =
      lang === "GUJLISH"
        ? `Bahuj saras! Listing submit karva ane physical inspection mate, kripya tamaro **direct calling / WhatsApp number** share karo 📞`
        : lang === "ENGLISH"
        ? `Thank you! To schedule document verification and on-site inspection, please share your **direct calling or WhatsApp number** 📞`
        : `Bahut badhiya! Document verification aur physical inspection schedule karne ke liye kripya aapka **direct calling ya WhatsApp number** share kar dijiye 📞`;

    await supabase.from("leads").update({
      lead_type: "PROVIDER",
      state: "OWNER_PHONE_PENDING",
      metadata: { ...existingMeta, owner_draft: draft },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_PHONE_PENDING" };
  }

  // ---------------------------------------------------------------------------
  // Step 8: ALL DETAILS GATHERED! Persist to property_submissions
  // ---------------------------------------------------------------------------
  draft.possession_status = draft.possession_status || "READY_TO_MOVE";
  draft.furnishing_status = draft.furnishing_status || "SEMI_FURNISHED";

  const submissionPayload = {
    client_id: tenantId,
    lead_id: lead.lead_id,
    owner_name: senderName || lead.first_name || "Property Owner",
    owner_phone: effectivePhone || (senderId.length >= 10 && !senderId.startsWith("-") && platform !== "TELEGRAM" ? senderId : null),
    property_category: draft.property_category || "RESIDENTIAL",
    property_type: draft.property_type || "Flat",
    transaction_type: draft.transaction_type === "SELL" ? "SALE" : (draft.transaction_type || "SALE"),
    project_name: draft.project_name || draft.society_name || "Private Property",
    society_name: draft.society_name || draft.project_name || "Society",
    location: draft.location || city || "Prime Location",
    city: city || "Vadodara",
    configuration: draft.configuration || (draft.property_type === "Flat" ? "2 BHK" : draft.property_type),
    carpet_area_sqft: draft.carpet_area_sqft || null,
    super_built_up_sqft: draft.super_built_up_sqft || null,
    expected_price: draft.expected_price || null,
    expected_rent: draft.expected_rent || null,
    furnishing_status: draft.furnishing_status || "SEMI_FURNISHED",
    possession_status: draft.possession_status || "READY_TO_MOVE",
    status: "PENDING_VERIFICATION",
    attributes: {
      ...(draft.attributes || {}),
      built_up_area: draft.super_built_up_sqft || null,
      plot_area: draft.plot_area_sqft || null,
      contact_phone: effectivePhone || null,
    },
    notes: `Intake complete via ${platform}: "${messageText}"`
  };

  const { data: sub, error: subError } = await supabase
    .from("property_submissions")
    .insert(submissionPayload)
    .select()
    .single();

  if (subError) {
    console.error("[Property Submissions] Insert Error:", subError);
  }

  await supabase.from("leads").update({
    lead_type: "PROVIDER",
    state: "OWNER_DETAILS_GATHERED",
    phone: effectivePhone || lead.phone,
    metadata: { ...existingMeta, owner_draft: draft, submission_id: sub?.id }
  }).eq("id", lead.id);

  // Dispatch High-Priority Alert to Acquisition / Listing Desk
  await dispatchSalesAlert(tenantId, "NEW_OWNER_LISTING", lead, {
    submission: sub || draft,
    userText: messageText,
  });

  const areaSummary = draft.super_built_up_sqft
    ? `${Number(draft.super_built_up_sqft).toLocaleString("en-IN")} sq.ft Built-up${draft.carpet_area_sqft ? ` (${Number(draft.carpet_area_sqft).toLocaleString("en-IN")} sq.ft Carpet)` : ""}`
    : draft.carpet_area_sqft
    ? `${Number(draft.carpet_area_sqft).toLocaleString("en-IN")} sq.ft Carpet`
    : "Standard";

  const priceFormatted = isRent
    ? `₹${Number(draft.expected_rent || 0).toLocaleString("en-IN")}/month`
    : `₹${Number(draft.expected_price || 0).toLocaleString("en-IN")}`;

  const summary = `• 🏢 <b>Property:</b> ${draft.configuration || draft.property_type} in ${draft.society_name || draft.location}\n• 📏 <b>Area:</b> ${areaSummary}\n• 💰 <b>Expected ${isRent ? "Rent" : "Demand"}:</b> ${priceFormatted}\n• 🔑 <b>Status:</b> ${draft.possession_status?.replace(/_/g, " ")} | ${draft.furnishing_status?.replace(/_/g, " ")}`;

  const replyText =
    lang === "GUJLISH"
      ? `Khub khub aabhar <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 🎉\n\nTamari property listing details Nextgen Realty desk par successfully register thai gai chhe:\n\n${summary}\n\n🤝 <b>Next Steps:</b> Amara senior property acquisition manager documents verification, physical inspection ane professional photography mate jaldi thi tamari sathe call par connect karshe.`
      : lang === "ENGLISH"
      ? `Thank you so much <b>${senderName || "Friend"}</b>! 🎉\n\nYour property listing has been successfully registered on the Nextgen Realty desk:\n\n${summary}\n\n🤝 <b>Next Steps:</b> Our senior property acquisition manager will connect with you shortly over a call for document verification, on-site inspection, and professional photography.`
      : `Bahut bahut dhanyawad <b>${senderName ? `${senderName} ji` : "ji"}</b>! 🎉\n\nAapki property listing details Nextgen Realty desk par successfully register ho gayi hain:\n\n${summary}\n\n🤝 <b>Next Steps:</b> Hamare senior property acquisition manager documents verification, physical inspection aur professional photography ke liye jald hi aapse call par connect karenge.`;

  return { replyText, nextState: "OWNER_DETAILS_GATHERED" };
}

// 10. Main Edge Function Request Handler
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Diagnostic Test AI Endpoint (?test_ai=1)
  if (url.searchParams.get("test_ai") === "1") {
    const geminiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
    const groqKey = (Deno.env.get("GROQ_API_KEY") || "").trim().replace(/^["']|["']$/g, "");

    if (url.searchParams.get("list_models") === "1") {
      const gRes = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${groqKey}` }
      });
      const gData = await gRes.json();
      return new Response(JSON.stringify(gData, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const testMsg = url.searchParams.get("q") || "Ha me nai aa sakta";
    const testState = url.searchParams.get("state") || "SITE_VISIT_BOOKED";
    const isOwnerState = testState.startsWith("OWNER_");

    const sampleLead = {
      state: testState,
      lead_type: isOwnerState ? "PROVIDER" : "SEEKER",
      site_visit_booked: testState === "SITE_VISIT_BOOKED",
      pre_visit_reminder_sent: testState === "SITE_VISIT_BOOKED",
      post_visit_feedback_sent: false,
      user_language: "HINGLISH",
      metadata: isOwnerState ? { owner_draft: { property_type: "Villa", transaction_type: "SELL" } } : {},
    };

    let geminiDirect: any = null;
    let geminiError: string | null = null;
    const gStart = Date.now();
    try {
      geminiDirect = await classifyLeadIntentWithGemini(geminiKey, testMsg, sampleLead);
    } catch (e: any) {
      geminiError = e.message;
    }
    const geminiDuration = Date.now() - gStart;

    let groqDirect: any = null;
    let groqError: string | null = null;
    const grStart = Date.now();
    try {
      groqDirect = await classifyLeadIntentWithGroq(groqKey, testMsg, sampleLead);
    } catch (e: any) {
      groqError = e.message;
    }
    const groqDuration = Date.now() - grStart;

    const fullStart = Date.now();
    const orchestrated = await classifyLeadIntent(testMsg, sampleLead);
    const fullDuration = Date.now() - fullStart;

    return new Response(
      JSON.stringify(
        {
          test_message: testMsg,
          gemini: { result: geminiDirect, error: geminiError, duration_ms: geminiDuration },
          groq: { result: groqDirect, error: groqError, duration_ms: groqDuration },
          orchestrated: { ...orchestrated, total_duration_ms: fullDuration },
        },
        null,
        2
      ),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Health check endpoint
  if (url.pathname.endsWith("/health") || url.searchParams.get("health")) {
    return new Response(
      JSON.stringify({
        status: "ONLINE",
        version: "v52-zero-regex-ai-engine",
        runtime: "Supabase Edge Serverless (Deno)",
        uptime_sla: "99.99%",
        zero_downtime: true,
        database: "Supabase PostgreSQL 17",
        ai_diagnostic: {
          has_gemini_key: Boolean(Deno.env.get("GEMINI_API_KEY")),
          gemini_prefix: (Deno.env.get("GEMINI_API_KEY") || "").slice(0, 4) + "...",
          gemini_len: (Deno.env.get("GEMINI_API_KEY") || "").length,
          has_groq_key: Boolean(Deno.env.get("GROQ_API_KEY")),
          groq_prefix: (Deno.env.get("GROQ_API_KEY") || "").slice(0, 4) + "...",
          groq_len: (Deno.env.get("GROQ_API_KEY") || "").length,
        },
        features: [
          "city-agnostic-multi-tenant-architecture",
          "ai-locality-proximity-finder",
          "data-driven-price-reality-floor",
          "multi-corridor-flexible-curation",
          "dynamic-agency-and-city-branding",
          "post-visit-attendance-confirmation",
          "silent-user-unconfirmed-visit-nudge",
          "attendance-option-1-and-2-support",
          "single-question-owner-cascade",
          "indic-continuity-language-lock",
          "full-fidelity-inventory-capture",
          "6-field strict qualification",
          "passive acknowledgment silence engine",
          "singular vs multiple card framing",
          "price negotiation converter",
          "smart reschedule clean DB",
          "night-owl out-of-hours manager",
          "landmarks and multi-city agnostic search",
          "sales notification badges and pitch hints",
          "property-visit-consistency-anchor",
          "booked-visit-greeting-alert",
          "milte-hain-site-par-context",
          "strict-dynamic-language-mirror",
          "off-topic-professional-boundary",
          "authentic-gujarati-syntax",
          "searched-property-return-greeting",
          "inventory-retrieval-audit",
          "1-hour-pre-visit-reminder",
          "1-hour-post-visit-feedback",
          "missed-visit-auto-reschedule",
          "waba-safe-anti-ban-drip",
          "gujarati-indic-script-location-parser",
          "daily-incomplete-lead-followup",
          "post-visit-feedback-handler",
          "cron-sweep-engine",
          "missed-visit-empathy-reschedule",
          "site-visit-done-status-sync",
          "post-visit-day-wise-drip-cadence",
          "waba-anti-ban-batch-protection",
          "pre-visit-reminder-inability-intent",
          "active-visit-qualification-circuit-breaker",
          "hybrid-ai-intent-classifier",
          "gemini-2.0-flash-primary",
          "groq-llama-3.3-fallback",
          "deterministic-circuit-breaker",
          "criteria-confirmation-engine-qualified-leads",
          "unseen-inventory-deduplication",
          "booked-visit-criteria-safeguard",
          "inventory-aware-smart-pitch",
          "category-switch-stale-filter-reset",
          "commercial-proactive-site-visit-pitch",
          "strict-default-hinglish-greeting-policy",
          "autonomous-real-estate-faq-engine",
          "amenities-rera-loan-possession-brokerage-handlers",
          "vip-site-visit-conversion-bridge",
          "morning-of-visit-map-pin-briefing",
          "high-converting-price-sheet-options-nudge",
          "actionable-sales-alert-pitch-hints",
          "dual-engine-intent-bifurcation",
          "owner-listing-intake-state-machine",
          "property-submissions-table-sync",
          "acquisition-team-real-time-alert",
          "fuzzy-typo-tolerant-location-matcher",
          "conversational-anti-derailment-steer",
          "short-bifurcated-buyer-rental-flows"
        ],
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Automated Cron Sweep Endpoint (/cron-sweep or ?action=cron-sweep)
  if (
    url.pathname.endsWith("/cron-sweep") ||
    url.searchParams.get("action") === "cron-sweep" ||
    url.searchParams.get("cron") === "sweep"
  ) {
    const isPostOrGet = req.method === "POST" || req.method === "GET";
    if (isPostOrGet) {
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      const sweepResult = await executeAutomatedCronSweep({
        force: body.force === true || url.searchParams.get("force") === "true",
        testLeadId: body.test_lead_id || body.testLeadId || url.searchParams.get("test_lead_id") || url.searchParams.get("testLeadId") || undefined,
        types: body.types || undefined,
      });
      return new Response(JSON.stringify(sweepResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Webhook verification GET
  if (req.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge");
    if (challenge) return new Response(challenge, { status: 200 });
    return new Response("Realtor Lead Engine v51 Ready", { status: 200 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "cron-sweep" || body.sweep === true) {
      const sweepResult = await executeAutomatedCronSweep({
        force: body.force === true,
        testLeadId: body.test_lead_id || undefined,
        types: body.types || undefined,
      });
      return new Response(JSON.stringify(sweepResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let senderId = "";
    let senderName = "Customer";
    let messageText = "";
    let platform: "TELEGRAM" | "WHATSAPP" | "DIRECT" = "DIRECT";
    let botToken = defaultBotToken;
    let phoneNumberId = "";

    // 1. Telegram
    if ((body.update_id || body.message?.chat?.id) && (body.message || body.edited_message || body.callback_query)) {
      platform = "TELEGRAM";
      const msg = body.message || body.edited_message || body.callback_query?.message;
      senderId = String(msg.chat?.id || msg.from?.id);
      senderName = msg.from?.first_name || "Customer";
      messageText = msg.text || "";
    }
    // 2. WhatsApp
    else if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      platform = "WHATSAPP";
      const value = body.entry[0].changes[0].value;
      const msg = value.messages[0];
      senderId = msg.from;
      senderName = value.contacts?.[0]?.profile?.name || "Customer";
      messageText = msg.text?.body || "";
      phoneNumberId = value.metadata?.phone_number_id || "";
    }
    // 3. Direct JSON
    else {
      platform = "DIRECT";
      senderId = body.lead_id || "web_user_1";
      senderName = body.name || "Customer";
      messageText = typeof body.message === "string" ? body.message : (body.message?.text || body.text || "");
      if (body.bot_token) botToken = body.bot_token;
    }

    if (!messageText) {
      return new Response(JSON.stringify({ status: "ignored", reason: "empty message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedMessage = normalizeIndicDigits(messageText);
    const lower = normalizedMessage.toLowerCase().trim();

    // Resolve Tenant Scope dynamically
    let activeTenantId = (body.client_id || body.tenant_id || "").trim();
    if (!activeTenantId && phoneNumberId) {
      const { data: c } = await supabase
        .from("clients")
        .select("id")
        .eq("whatsapp_phone_number_id", phoneNumberId)
        .maybeSingle();
      if (c?.id) activeTenantId = c.id;
    }
    if (!activeTenantId && botToken && botToken !== defaultBotToken) {
      const { data: c } = await supabase
        .from("clients")
        .select("id")
        .eq("bot_token", botToken)
        .maybeSingle();
      if (c?.id) activeTenantId = c.id;
    }
    if (!activeTenantId) {
      activeTenantId = defaultTenantId;
    }

    // Resolve Tenant Branding & Operating City
    const { data: tenantClient } = await supabase
      .from("clients")
      .select("id, name, city, office_address, notification_channel")
      .eq("id", activeTenantId)
      .maybeSingle();

    const agencyName = tenantClient?.name?.trim() || "NextGen Realty";
    let resolvedCity = tenantClient?.city?.trim() || null;
    if (!resolvedCity) {
      const { data: sampleProp } = await supabase
        .from("inventory")
        .select("city")
        .eq("client_id", activeTenantId)
        .not("city", "is", null)
        .limit(1)
        .maybeSingle();
      resolvedCity = sampleProp?.city?.trim() || null;
    }
    const displayCity = resolvedCity || "aapke shehar";

    // Fetch or create lead record in Supabase
    let { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("lead_id", senderId)
      .eq("client_id", activeTenantId)
      .maybeSingle();

    // Strict language mirroring with lead context memory
    let lang = detectLanguage(messageText, lead?.user_language);

    if (!lead) {
      const { data: newLead } = await supabase
        .from("leads")
        .insert({
          lead_id: senderId,
          client_id: activeTenantId,
          first_name: senderName,
          state: "FRESH",
          user_language: lang,
          bot_active: true,
          last_active_at: new Date().toISOString(),
        })
        .select()
        .single();
      lead = newLead;
    } else {
      const updates: any = { last_active_at: new Date().toISOString() };
      if (lead.user_language !== lang) {
        updates.user_language = lang;
        lead.user_language = lang;
      }
      await supabase
        .from("leads")
        .update(updates)
        .eq("id", lead.id);
    }

    let replyText = "";
    let nextState = lead?.state || "FRESH";
    let isSilent = false;

    // =========================================================================
    // 1. PASSIVE ACKNOWLEDGMENT & SILENT STATE ENGINE
    // =========================================================================
    if (PASSIVE_ACK_REGEX.test(lower)) {
      const terminalStates = [
        "SITE_VISIT_BOOKED",
        "VISIT_BOOKED",
        "VISIT_RESCHEDULED",
        "VISIT_CANCELLED",
        "DROPPED",
        "OPT_OUT",
        "HUMAN_HANDOVER"
      ];

      if ((terminalStates.includes(lead.state) || lead.site_visit_booked) && lead.state !== "CRITERIA_CONFIRMATION_PENDING") {
        // SILENT: Do not send any outbound message!
        isSilent = true;
        await supabase.from("lead_events").insert({
          client_id: activeTenantId,
          lead_id: senderId,
          event_type: "PASSIVE_ACK_SILENCED",
          payload: { userText: messageText, state: lead.state },
        });

        return new Response(
          JSON.stringify({
            success: true,
            status: "ignored",
            reason: "passive_ack_silent_terminal_state",
            silent: true,
            reply_sent: null,
            state: lead.state,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else if (lead.state === "OPTIONS_SENT") {
        replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${senderName} bhai</b>! In options ma thi tamne kai property sauthi vadhu pasand aavi? Shu ame aani <b>VIP Site Visit 🚗</b> mate <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b> no slot plan kariye?`
            : lang === "ENGLISH"
            ? `Sure <b>${senderName}</b>! Which of these options suits you best? Would you like to schedule a <b>VIP Site Visit 🚗</b> for <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
            : `Ji bilkul <b>${senderName} ji</b>! In options me se aapko kaunsi property sabse pasand aayi? Kya hum iski <b>VIP Site Visit 🚗</b> ke liye <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b> ka slot plan karein?`;
      } else if (lead.state === "QUALIFYING") {
        // Gentle re-prompt for missing field
        replyText =
          lang === "GUJLISH"
            ? `Ji <b>${senderName} bhai</b>! Tamara criteria mujab best properties shodhi sakie ae mate kripya details janavjo.`
            : lang === "ENGLISH"
            ? `Sure <b>${senderName}</b>! To help find the best options for your criteria, please share your preferences.`
            : `Ji <b>${senderName} ji</b>! Aapke criteria ke mutabiq best properties filter karne ke liye kripya details batayein.`;
      } else if (lead.state === "OWNER_DETAILS_GATHERED" || (typeof lead.state === "string" && lead.state.startsWith("OWNER_"))) {
        replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${senderName} bhai</b>! Tamari property verification process ma chhe. Amari listing team jaldi direct call par tamaro sampark karshe. Kripya dhyan rakhjo! 🙏`
            : lang === "ENGLISH"
            ? `Sure <b>${senderName}</b>! Your property listing is under active review. Our acquisition team will connect with you directly. Let us know if you need to update any details! 🙏`
            : `Ji bilkul <b>${senderName} ji</b>! Aapki property submission active review me hai. Hamari acquisition team documents verify karke aapse jald hi direct call par connect karegi! 🙏`;
      }
    }

    // Call Hybrid Micro-LLM Intent Classifier (Gemini Primary + Groq Fallback) for all substantive turns
    const aiAnalysis = await classifyLeadIntent(normalizedMessage, lead);
    console.log(`[AI INTENT] Classified: "${aiAnalysis.intent}" via ${aiAnalysis.provider_used} in ${aiAnalysis.latency_ms}ms`);

    // Override language if AI semantic classifier detected high-confidence user dialect
    // STRICT GUARD: Do not allow greetings ("Hi", "Hello", "Hey", "Namaste") or short tokens to flip language to English!
    const isGreetingOrShortToken =
      /^(?:hi|hello|hey|namaste|kem cho|pranam|namaskar|start|restart|fresh|naya|ok|okay|k|1|2|3|done|yes|ha|haan|theek|saras)$/i.test(lower) ||
      lower.split(/\s+/).length <= 2;

    if (aiAnalysis.language && aiAnalysis.provider_used !== "DETERMINISTIC_FALLBACK") {
      if (aiAnalysis.language === "GUJARATI_SCRIPT" || aiAnalysis.language === "GUJLISH") {
        lang = "GUJLISH";
      } else if (aiAnalysis.language === "HINGLISH") {
        lang = "HINGLISH";
      } else if (aiAnalysis.language === "ENGLISH") {
        const hasGujScript = /[\u0A80-\u0AFF]/.test(normalizedMessage);
        const hasGujLex = /\b(kem|cho|chho|chhe|che|nathi|joiye|joyiye|joie|mane|aapjo|aapo|batavo|shu|bhai|ben)\b/i.test(lower);
        const hasHinLex = /\b(hai|hain|nahi|nhi|nai|na|ha|haan|mat|chahiye|chahye|chahie|chaiye|chaahiye|mangta|karna|karni|karne|karo|kare|karein|kar|dekhna|dekhni|dekhne|dekho|dekh|dikhao|batao|bhejo|kitna|kitne|kaunsa|kahan|kidhar|milega|ji|hum|mujhe|mera|apna|bhi|kya|kyu)\b/i.test(lower);
        const hasExplicitEnglish = lower.includes("in english") || lower.includes("speak english") || lower.includes("english please") || lower === "english";
        const hasEnglishGrammar = /\b(can you|could you|would you|please send|please show|please share|i am looking|i want to|i need to|we are looking|we want to|what is the|what are the|tell me about|could we|how much is|where is it|show me some|looking for|interested in|share with me)\b/i.test(lower);

        // INDIC CONTINUITY INVARIANT:
        // If the lead already has an established Indic language (HINGLISH or GUJLISH):
        // NEVER flip to English on short loanwords or real-estate phrases (e.g. "ready to move", "under construction", "semi furnished")!
        // Only flip to English if the user explicitly asks for English or writes a complete English grammatical sentence!
        if (lead?.user_language === "HINGLISH" || lead?.user_language === "GUJLISH") {
          if (hasExplicitEnglish || hasEnglishGrammar) {
            lang = "ENGLISH";
          } else {
            lang = lead.user_language;
          }
        } else {
          // First turn / No prior language set: only set ENGLISH if genuinely English sentence, else default to HINGLISH
          if (!isGreetingOrShortToken && !hasGujScript && !hasGujLex && !hasHinLex && (hasExplicitEnglish || hasEnglishGrammar || lower.split(/\s+/).length >= 5)) {
            lang = "ENGLISH";
          } else if (!hasGujScript && !hasGujLex) {
            lang = "HINGLISH";
          }
        }
      }
    }

    if (lead && lead.user_language !== lang) {
      await supabase.from("leads").update({ user_language: lang }).eq("id", lead.id);
      lead.user_language = lang;
    }

    const isMissedVisitRegex =
      Boolean(lead.post_visit_feedback_sent || lead.pre_visit_reminder_sent || lead.site_visit_booked || ["SITE_VISIT_BOOKED", "VISIT_BOOKED", "SITE_VISIT_DONE", "VISIT_DONE", "RESCHEDULE_REQUESTED", "VISIT_MISSED"].includes(lead.state)) &&
      (
        /(?:^|\b)(?:ha\s+|haan\s+|ji\s+)?(?:me\s+|hum\s+|mai\s+)?(?:nai|nahi|nhi|na)\s*(?:aa\s*sakta|aa\s*sakti|aa\s*paunga|aa\s*paungi|aa\s*payenge|aa\s*paenge|aa\s*raha|aa\s*rahe|aana|aunga|aungi|ja\s*sakta|ja\s*paunga|pahunch\s*sakta|pahunch\s*paunga|ho\s*payega|hoga\s*aaj|possible\s*nahi)/i.test(lower) ||
        /(nahi\s*aa\s*paya|nahi\s*aa\s*paye|nahi\s*ja\s*saka|nahi\s*ja\s*paye|nahi\s*aa\s*saka|nahi\s*pahunch\s*paya|nahi\s*pahunch\s*paye|nahi\s*pahucha|nahi\s*aaya|miss\s*ho\s*gaya|miss\s*ho\s*gayi|traffic\s*me\s*fas\s*gaya|traffic\s*tha|emergency\s*aa\s*gayi|emergency\s*thi|busy\s*tha|busy\s*ho\s*gaya|cancel\s*ho\s*gaya|tabiyat\s*kharab|tabiyat\s*nathi|bimar|kaam\s*aa\s*gaya|kaam\s*par\s*tha|could\s*not\s*make\s*it|could\s*not\s*attend|couldn't\s*come|couldn't\s*make\s*it|missed\s*the\s*visit|missed\s*it|was\s*stuck|got\s*stuck|emergency|aaj\s*nahi\s*ho\s*payega)/i.test(lower) ||
        /(?:^|\b)(?:ha\s+|haan\s+|ji\s+)?(?:hu\s+|ame\s+)?(?:nathi|nai|nahi)\s*(?:aavi\s*shakto|aavi\s*shakish|aavi\s*shaku|aavavu|aavay|aavvanu|aavi\s*sakvano|pahonchi\s*shaku|possible\s*nathi|thay\s*em\s*nathi)/i.test(lower) ||
        /(nathi\s*aavi\s*sakyo|nathi\s*gayo|aavi\s*na\s*sakyo|nathi\s*pahonchi\s*sakyo|busy\s*hato|kam\s*ma\s*fasaai\s*gayo|miss\s*thai\s*gai|miss\s*thai\s*gayo|aaje\s*nathi\s*aavyo|nathi\s*aavayem|aaje\s*nahi\s*aavay|aaje\s*nai\s*aavay)/i.test(lower) ||
        /(નથી\s*આવી\s*શકાય|નહી\s*આવાય|નહીં\s*આવી\s*શકાય|શક્ય\s*નથી|આવી\s*શકું\s*તેમ\s*નથી)/i.test(lower) ||
        /(?:cannot|can't|cant|won't|wont|will\s*not|wouldn't|would\s*not|unable\s*to|not\s*able\s*to)(?:\s+be\s*able\s*to)?\s*(?:come|attend|make\s*it|reach|visit|be\s*there)/i.test(lower) ||
        // Option 2 or direct negative replies to post-visit attendance confirmation
        (Boolean(lead.post_visit_feedback_sent) && (
          /(?:^|\b)(?:2|2️⃣|two|option\s*2)\b/i.test(lower) ||
          /^(?:2|2️⃣|two|option\s*2|nahi|nhi|na|no|nope|nathi|nathi\s*thai|nathi\s*gayo|nathi\s*aavi\s*sakyo|nahi\s*ho\s*payi|nahi\s*ho\s*paayi|nahi\s*gaya|nahi\s*gaye|nahi\s*gayi|missed|not\s*yet|couldn't|attend\s*nahi\s*ki|attend\s*nathi\s*kari|reschedule|cancel)/i.test(lower.trim())
        )) ||
        /(not\s*possible\s*today|not\s*possible\s*for\s*me|cannot\s*make\s*it|could\s*not\s*make\s*it|missed\s*the\s*visit|won't\s*make\s*it|wont\s*make\s*it)/i.test(lower)
      );

    const isMissedVisit = aiAnalysis.intent === "CANNOT_ATTEND_VISIT" || isMissedVisitRegex;

    // -------------------------------------------------------------------------
    // DUAL-ROLE INTENT DETECTION (Seeker vs Provider)
    // -------------------------------------------------------------------------
    const isInProgressOwnerIntake =
      lead?.lead_type === "PROVIDER" &&
      [
        "OWNER_CONFIG_PENDING",
        "OWNER_SOCIETY_PENDING",
        "OWNER_LOCATION_PENDING",
        "OWNER_AREA_PENDING",
        "OWNER_PRICE_PENDING",
        "OWNER_POSSESSION_PENDING",
        "OWNER_FURNISHING_PENDING",
        "OWNER_PHONE_PENDING",
      ].includes(lead?.state);

    const isExplicitOwnerMessage =
      lead?.state !== "ROLE_SELECTION_PENDING" && (
        aiAnalysis.user_role === "OWNER" ||
        aiAnalysis.intent === "OWNER_LISTING" ||
        isInProgressOwnerIntake ||
        /(?:mera|meri|maro|mari|mere|mara|amaro|apna|own|paas)\s+(?:flat|makan|ghar|house|villa|plot|zameen|jamin|shop|dukan|office|showroom|shed|godown|warehouse|property)\s+(?:bechna|bechni|vechvu|vechvo|vechva|sell|bikri|rent\s+par|bhadu|bhaade|kiraya|kiraye|lease)/i.test(lower) ||
        /(?:bechna|bechni|vechvu|vechva|bikri|sell\s+my|sell\s+property|want\s+to\s+sell|property\s+sell|rent\s+par\s+den|bhaade\s+aap|kiraye\s+par\s+den|lease\s+par\s+den|list\s+karvi|list\s+karna|owner\s+listing)/i.test(lower) ||
        /(?:property\s+deni\s+hai|shop\s+deni\s+hai|flat\s+dena\s+hai|office\s+dena\s+hai|office\s+deni\s+hai|ghar\s+bechna)/i.test(lower)
      );

    // CRITICAL: An in-progress owner answering location, area, or rent/price must NEVER be treated as an explicit buyer!
    const isExplicitBuyerMessage =
      lead?.state !== "ROLE_SELECTION_PENDING" &&
      !isInProgressOwnerIntake && (
        aiAnalysis.user_role === "SEEKER" && (
          aiAnalysis.intent === "SEEKER_QUALIFICATION" ||
          /(?:chahiye|chahye|chahie|chaiye|chaahiye|joiye|joyiye|joie|mangta|dekhna\s+hai|dekhni\s+hai|dekhna\s+chahta|buy|purchase|khareedna|kharidna|levu\s+chhe|rent\s+par\s+chahiye|kiraye\s+par\s+chahiye|lease\s+par\s+chahiye|looking\s+for|want\s+to\s+buy|options|options\s+dikhao)/i.test(lower)
        ) ||
        aiAnalysis.intent === "ASK_MORE_OPTIONS" ||
        aiAnalysis.intent === "CONFIRM_SAME_CRITERIA" ||
        (/\b([1-5]\s*bhk|flat|villa|office|shop|plot)\b/i.test(lower) && /\b(chahiye|joiye|dekhna|buy|purchase|rent\s+par\s+chahiye|kharid)\b/i.test(lower))
      );

    // If an existing PROVIDER (who has already completed listing) sends an explicit BUYER inquiry, dynamically switch their role to SEEKER
    if (isExplicitBuyerMessage && !isExplicitOwnerMessage && !isInProgressOwnerIntake && (lead?.lead_type === "PROVIDER" || lead?.state === "OWNER_DETAILS_GATHERED")) {
      console.log(`[DUAL ROLE SWITCH] Switching lead ${lead.id} from PROVIDER/OWNER to SEEKER due to buyer intent "${aiAnalysis.intent}"`);
      await supabase.from("leads").update({
        lead_type: "SEEKER",
        state: "QUALIFYING",
        last_active_at: new Date().toISOString(),
      }).eq("id", lead.id);
      lead.lead_type = "SEEKER";
      lead.state = "QUALIFYING";
    }

    // =========================================================================
    // 1b. OFF-TOPIC / SOCIAL BOUNDARY INTERCEPTOR ("Dinner par chale")
    // =========================================================================
    if (
      (/(dinner|lunch|coffee|chai|tea|date|movie|cinema|ghoomne|hangout|hang\s*out|friendship|dosti|girlfriend|boyfriend|shaadi|marriage)\b/i.test(lower) &&
       /(chale|chaloge|chalo|chalte|chalna|jaoge|jasho|jaye|chalish|kare|karte|karoge|karna|with\s*me|together|free|par|pe|mate|for)/i.test(lower)) ||
      /(single\s*ho|free\s*ho|dinner\s*par|dinner\s*pe|coffee\s*pe|coffee\s*par|date\s*par|date\s*pe|movie\s*chale|ghoomne\s*chale)/i.test(lower)
    ) {
      replyText =
        lang === "GUJLISH"
          ? `Hu Nextgen Realty no AI property assistant chhu ane hu fakt property search, site visits ane real estate sambhandhit details ma j tamne help kari shaku chhu. 😊🏢\n\nKripya janavjo, tame kaya type ni property shodhva mango chho - Residential ke Commercial?`
          : lang === "ENGLISH"
          ? `I am Nextgen Realty's AI property assistant, and I can only assist you with property search, site visits, and real estate details. 😊🏢\n\nPlease let me know what kind of residential or commercial property you are looking for!`
          : `Main Nextgen Realty ka AI property assistant hu aur main sirf property search, site visits aur real estate queries me hi aapki help kar sakta hu. 😊🏢\n\nKripya batayein, aap kis type ki property search kar rahe hain - Residential ya Commercial?`;
    }

    // =========================================================================
    // 1c. DIRECT HUMAN CALL REQUEST INTERCEPTOR ("Call me", "Call karo", "Phone karo")
    // =========================================================================
    else if (
      /(?:call\s*karo|call\s*kariye|call\s*karjo|call\s*me|phone\s*karo|phone\s*kariye|phone\s*karjo|baat\s*karni|baat\s*karvi|speak\s*to|connect\s*call|number\s*do|contact\s*me|call\s*please|executive\s*se\s*baat)\b/i.test(lower) &&
      !/(site\s*visit|schedule\s*visit)/i.test(lower)
    ) {
      await dispatchSalesAlert(activeTenantId, "CALL_REQUEST", lead, {
        userText: messageText,
        reason: "Lead explicitly requested immediate phone call with executive.",
      });

      const nameStr = senderName ? (lang === "GUJLISH" ? `<b>${senderName} bhai</b>` : `<b>${senderName} ji</b>`) : (lang === "GUJLISH" ? "Mitra" : "ji");

      replyText =
        lang === "GUJLISH"
          ? `Ji bilkul ${nameStr}! Amara senior property advisor agami <b>5-10 minute ma direct tamne call karshe</b>. 📞\n\nCall pehla kripya janavjo — tamaro preferred area ke budget ketlo chhe jethi teo best options ready rakhi shake?`
          : lang === "ENGLISH"
          ? `Certainly ${nameStr}! Our senior property advisor will <b>call you directly within 5-10 minutes</b>. 📞\n\nBefore they connect, could you share your preferred location or budget range so they have tailored options ready?`
          : `Ji bilkul ${nameStr}! Hamare senior property advisor aapko agle <b>5-10 minutes me direct call par connect kar rahe hain</b>. 📞\n\nCall se pehle bas bata dijiye — aapka preferred area ya budget kya hai taaki wo ready options open rakhein?`;
    }

    // =========================================================================
    // 1d. MARKET ADVISORY & TRENDING INTERCEPTOR ("Tum batao kya sasta hai", "Kya rates hain")
    // =========================================================================
    else if (
      /(?:tum\s*batao|tame\s*kaho|aap\s*batao|kya\s*sasta\s*hai|kya\s*acha\s*hai|rates\s*kya\s*hai|bhav\s*shu\s*chhe|market\s*rate|suggest\s*karo|kuch\s*batao|recommend\s*karo)\b/i.test(lower) &&
      !/(flat|villa|bhk|shop|office|plot)/i.test(lower)
    ) {
      const nameStr = senderName ? (lang === "GUJLISH" ? `<b>${senderName} bhai</b>` : `<b>${senderName} ji</b>`) : "";

      replyText =
        lang === "GUJLISH"
          ? `Ji ${nameStr}! Hal ma 2 & 3 BHK premium apartments ane gated villas ma sabse high demand chhe, jya pricing <b>₹45 Lakhs thi shuru</b> thay chhe. 🏡\n\nTame property <b>Buy (Kharidva)</b> mango chho ke <b>Rent</b> par joiye chhe?`
          : lang === "ENGLISH"
          ? `Hello ${nameStr}! Currently, 2 & 3 BHK premium apartments and villas are in highest demand, with verified options starting from <b>₹45 Lakhs</b>. 🏡\n\nAre you looking to <b>Buy</b> or <b>Rent</b>?`
          : `Ji ${nameStr}! Abhi market me 2 & 3 BHK premium apartments aur villas ki sabse high demand hai, jinki pricing <b>₹45 Lakhs se shuru</b> hoti hai. 🏡\n\nAap property <b>Buy (Kharidna)</b> chahte hain ya <b>Rent</b> par chahiye?`;
    }

    // =========================================================================
    // 2. OPT-OUT / DND COMPLIANCE
    // =========================================================================
    else if (aiAnalysis.intent === "OPT_OUT" || lower === "stop" || lower.includes("nahi chahiye") || lower.includes("nathi joiye") || lower.includes("not interested") || lower.includes("unsubscribe")) {
      nextState = "DROPPED";
      await supabase
        .from("leads")
        .update({ state: "DROPPED", bot_active: false, drip_stage: "CANCELLED" })
        .eq("id", lead.id);

      replyText =
        lang === "GUJLISH"
          ? `Aabhar <b>${senderName} bhai</b>. Have tamne koi automated messages nahi aave. Bhawishyaman koi jarur hoy to tame amaro sampark kari shako chho. Tamaro divas shubh rahe! 🙏`
          : lang === "ENGLISH"
          ? `Thank you <b>${senderName}</b>. You have been opted out from automated messages. Feel free to contact us anytime if you need property assistance! 🙏`
          : `Dhanyawad <b>${senderName} ji</b>. Aapka number opt-out kar diya gaya hai. Aage se koi automated message nahi aayega. Have a great day! 🙏`;
    }

    // =========================================================================
    // 2b. MISSED VISIT / INABILITY TO ATTEND
    // =========================================================================
    else if (
      aiAnalysis.intent === "CANNOT_ATTEND_VISIT" ||
      isMissedVisit
    ) {
      nextState = "VISIT_MISSED";
      await supabase
        .from("leads")
        .update({
          state: "VISIT_MISSED",
          site_visit_booked: false,
          drip_stage: "MISSED_RESCHEDULE_PROMPTED",
          last_active_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      await supabase
        .from("site_visits")
        .update({
          status: "MISSED",
          feedback_notes: `Missed visit: ${messageText}`,
        })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

      await dispatchSalesAlert(activeTenantId, "VISIT_MISSED", lead, {
        userText: messageText,
        reason: messageText,
      });

      const isAdvanceNotice = Boolean(lead.pre_visit_reminder_sent || lead.site_visit_booked);

      replyText =
        lang === "GUJLISH"
          ? isAdvanceNotice
            ? `Arey koi vandho nahi <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 🙏 Pehla thi janavva mate aabhar. Ame samji shakiye chhiye ke urgent kaam ya emergency lidhe tame aaje nathi aavi shakya. Chalo tame bija divase anukool hoy tyare reschedule kari daiye. Shu ame <b>kaale sanje 4:00 vage</b> ke <b>5:30 vage</b> navi VIP site visit plan kariye? 🚗📍`
            : `Arey koi vandho nahi <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 🙏 Ame samji shakiye chhiye ke urgent kaam ke traffic lidhe tame aaje nathi aavi sakya. Chalo tame bija divase anukool hoy tyare reschedule kari daiye. Shu ame <b>kaale sanje 4:00 vage</b> ke <b>5:30 vage</b> navi VIP site visit plan kariye? 🚗📍`
          : lang === "ENGLISH"
          ? isAdvanceNotice
            ? `No problem at all <b>${senderName}</b>! 🙏 Thank you for letting us know in advance. We completely understand that an urgent commitment prevented you from making it today. Let's reschedule your visit for a convenient time. Would <b>tomorrow at 4:00 PM or 5:30 PM</b> work for you? 🚗📍`
            : `No problem at all <b>${senderName}</b>! 🙏 We completely understand that an urgent commitment or traffic prevented you from making it today. Let's reschedule your visit for a convenient time. Would <b>tomorrow at 4:00 PM or 5:30 PM</b> work for you? 🚗📍`
          : isAdvanceNotice
          ? `Koi baat nahi <b>${senderName ? `${senderName} ji` : "Friend"}</b>! 🙏 Batane ke liye shukriya. Hum samajh sakte hain ki achanak kisi zaroori kaam ya emergency ki wajah se aap visit par nahi aa pa rahe hain. Chaliye aapke liye dusri convenient timing par reschedule kar dete hain. Kya hum <b>kal shaam 4:00 baje ya 5:30 baje</b> aapki nayi VIP site visit plan karein? 🚗📍`
          : `Koi baat nahi <b>${senderName ? `${senderName} ji` : "Friend"}</b>! 🙏 Hum samajh sakte hain ki achanak kisi zaroori kaam ya traffic ki wajah se aap visit par nahi aa paaye. Chaliye aapke liye dusri convenient timing par reschedule kar dete hain. Kya hum <b>kal shaam 4:00 baje ya 5:30 baje</b> aapki nayi VIP site visit plan karein? 🚗📍`;
    }

    // =========================================================================
    // 2d. OWNER & PROVIDER ENGINE ("Mera flat bechna hai", "Shop rent par deni hai")
    // =========================================================================
    else if (
      isExplicitOwnerMessage ||
      (isInProgressOwnerIntake && !isExplicitBuyerMessage) ||
      (lead?.state === "OWNER_DETAILS_GATHERED" && !isExplicitBuyerMessage && !/^(hi|hello|hey|namaste|kem cho)$/i.test(lower.trim()))
    ) {
      const ownerRes = await handleOwnerFlow({
        lead,
        messageText,
        lower,
        lang,
        senderName,
        senderId,
        platform,
        tenantId: activeTenantId,
        supabase,
        aiAnalysis,
        city: resolvedCity,
        agencyName,
      });
      replyText = ownerRes.replyText;
      nextState = ownerRes.nextState;
    }

    // =========================================================================
    // 2c. POST-VISIT FEEDBACK (Only for attended / completed visits)
    // =========================================================================
    else if (
      (lead.post_visit_feedback_sent || ["SITE_VISIT_BOOKED", "VISIT_BOOKED", "SITE_VISIT_DONE", "VISIT_DONE"].includes(lead.state)) &&
      (
        /(?:^|\b)(?:1|1️⃣|one|option\s*1)\b/i.test(lower) ||
        /^(?:ha|haan|ji\s*haan|yes|yep|yeah|attended|visit\s*attend\s*ki|visit\s*attend\s*kari|attend\s*kari|gaya\s*tha|gaye\s*the|gayo\s*hato|visit\s*ho\s*gayi|visit\s*thai\s*gai|dekh\s*liya|joee\s*lidhi)/i.test(lower.trim()) ||
        /(acha|achha|saras|badiya|good|nice|liked|pasand|mast|average|theek|bhav|price|budget|discount|negotiat|loan|bank|emi|interest|builder|developer|sitting|baithak|owner|meeting|offer|process|token|kharab|bekar|nathi\s*gamyu|gamyu|pasand\s*nathi|bahut\s*acha|visit\s*ho\s*gayi|visit\s*done|gaya\s*tha|dekh\s*liya|joee\s*lidhi|gayo\s*hato|visit\s*thai\s*gai|completed|attended|dekh\s*aaye|dekh\s*kar\s*aaye|dekhne\s*gaye)/i.test(lower) ||
        /(kaisa|kaisi|lagyo|lagi|kem|rate|kharch|cost|query|sawal|prashna)/i.test(lower)
      )
    ) {
        await supabase
          .from("leads")
          .update({
            state: "SITE_VISIT_DONE",
            drip_stage: "POST_VISIT_DAY_1",
            last_followup_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          })
          .eq("id", lead.id);

        await supabase
          .from("site_visits")
          .update({
            status: "COMPLETED",
            feedback_collected: true,
            feedback_notes: messageText,
          })
          .eq("lead_id", lead.id)
          .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

        let bookedProp: any = null;
        if (lead.selected_property_id) {
          const { data: p } = await supabase.from("inventory").select("*").eq("property_id", lead.selected_property_id).maybeSingle();
          if (p) bookedProp = p;
        }

        await dispatchSalesAlert(activeTenantId, "FEEDBACK_RECEIVED", lead, {
          property: bookedProp,
          userText: messageText,
        });

        const isLoan = /(loan|bank|emi|interest|finance)/i.test(lower);
        const isSimpleAttendanceOnly =
          /(?:^|\b)(?:1|1️⃣|one|option\s*1)\b/i.test(lower) ||
          /^(?:ha|haan|ji\s*haan|yes|yep|yeah|attended|visit\s*attend\s*ki|visit\s*attend\s*kari|attend\s*kari|gaya\s*tha|gaye\s*the|gayo\s*hato|visit\s*ho\s*gayi|visit\s*thai\s*gai|dekh\s*liya|joee\s*lidhi)/i.test(lower.trim());

        if (isNegotiation) {
          replyText =
            lang === "GUJLISH"
              ? `Tamara feedback mate aabhar <b>${senderName} bhai</b>! 🙏 Ame samjiye chiye. Developer sathe special pricing ane exclusive payment plan finalize karva mate amara senior sales director direct tamaro sampark karshe.`
              : lang === "ENGLISH"
              ? `Thank you for your feedback <b>${senderName}</b>! 🙏 Our senior property director will personally connect with you to arrange an exclusive developer sitting and discuss the best negotiated price.`
              : `Aapke feedback ke liye dhanyawad <b>${senderName} ji</b>! 🙏 Developer ke sath special pricing aur best payment scheme finalize karne ke liye hamare senior sales director direct aapse call par connect karenge.`;
        } else if (isLoan) {
          replyText =
            lang === "GUJLISH"
              ? `Tamara feedback mate aabhar <b>${senderName} bhai</b>! 🏦 Amari banking & loan expert team lowest interest rate ane easy EMI guidance mate tamne turant call karshe.`
              : lang === "ENGLISH"
              ? `Thank you for your feedback <b>${senderName}</b>! 🏦 Our preferred banking partners will reach out shortly to guide you with the lowest home loan interest rates and flexible EMI structures.`
              : `Aapke feedback ke liye dhanyawad <b>${senderName} ji</b>! 🏦 Hamari home loan & banking team lowest interest rate aur easy EMI structure guide karne ke liye aapse turant connect karegi.`;
        } else if (isSimpleAttendanceOnly) {
          replyText =
            lang === "GUJLISH"
              ? `Khub saras <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 🌟\n\nTamne property ane layout kevo lagyo? Jo project pasand aavyo hoy to shu ame developer sathe <b>special token pricing baithak</b> plan kariye, ke aa budget ma <b>bija options</b> jova mango chho?`
              : lang === "ENGLISH"
              ? `Wonderful <b>${senderName || "there"}</b>! 🌟\n\nHow did you like the property and floor layout? If you liked it, shall we arrange a <b>developer sitting for exclusive negotiated pricing</b>, or would you like to explore <b>more options</b> in this budget?`
              : `Bohot badiya <b>${senderName ? `${senderName} ji` : "Friend"}</b>! 🌟\n\nAapko property aur layout kaisa laga? Agar pasand aaya ho to kya hum developer ke sath <b>best token pricing sitting</b> arrange karein, ya aap is budget me <b>kuch aur options</b> dekhna chahenge?`;
        } else {
          replyText =
            lang === "GUJLISH"
              ? `Tamara mulyavan feedback mate khub khub aabhar <b>${senderName} bhai</b>! 🌟 Project booking process ane next steps mate amara senior executive direct tamne call par guide karshe.`
              : lang === "ENGLISH"
              ? `Thank you so much for your valuable feedback <b>${senderName}</b>! 🌟 Our senior executive will guide you through the next steps and booking process shortly.`
              : `Aapke valuable feedback ke liye bohot shukriya <b>${senderName} ji</b>! 🌟 Project booking process aur next steps ke liye hamare senior executive aapse turant call par connect karenge.`;
        }
      }

    // =========================================================================
    // 3. POINT 3: PRICE NEGOTIATION -> SITE VISIT CONVERTER
    // =========================================================================
    else if (
      aiAnalysis.intent === "PRICE_NEGOTIATION" ||
      /(kuch\s*kam\s*hoga|discount\s*milega|bhav\s*ochho\s*thashe|rate\s*kam\s*karo|final\s*price|final\s*rate|negotiat|kam\s*nahi\s*hoga|price\s*kam)/i.test(lower)
    ) {
      await dispatchSalesAlert(activeTenantId, "NEGOTIATION_REQUEST", lead, { userText: messageText });

      replyText =
        lang === "GUJLISH"
          ? `Listed price developer ni base pricing chhe <b>${senderName} bhai</b>. Pan serious buyers mate <b>Face-to-Face Site Visit par special token discount ane flexible payment schemes</b> arrange thai shake chhe! 🚗\n\nShu ame kaale ke weekend par tamari VIP Site Visit plan kariye?`
          : lang === "ENGLISH"
          ? `The listed price is the developer's base price, <b>${senderName}</b>. However, for serious buyers, <b>special token discounts and flexible payment schemes</b> can be negotiated face-to-face during a site visit! 🚗\n\nShall we schedule your VIP Site Visit for tomorrow or this weekend?`
          : `Listed price developer ki base pricing hai <b>${senderName} ji</b>. Lekin serious buyers ke liye <b>Face-to-Face Site Visit par special token discount aur flexible payment schemes</b> arrange ho sakti hain! 🚗\n\nKya hum kal ya weekend par aapki VIP Site Visit plan karein?`;
    }

    // =========================================================================
    // 4. POINT 4: SMART RESCHEDULE VS DUPLICATE VISITS
    // =========================================================================
    else if (
      aiAnalysis.intent === "RESCHEDULE_VISIT" ||
      ((lower.includes("reschedule") || lower.includes("change time") || lower.includes("change") || lower.includes("badalna") || lower.includes("badlo") || lower.includes("badli") || lower.includes("badal") || lower.includes("badlavi") || lower.includes("badlavo") || lower.includes("aaj nahi") || lower.includes("aaje nahi") || lower.includes("kale karjo") || lower.includes("kaale karjo") || lower.includes("pachhi") || lower.includes("farithi") || lower.includes("fari thi")) &&
       (lead.site_visit_booked || lead.state === "VISIT_BOOKED" || lead.state === "SITE_VISIT_BOOKED" || lead.state === "RESCHEDULE_REQUESTED" || lead.state === "VISIT_MISSED")) ||
      ((lead.state === "RESCHEDULE_REQUESTED" || lead.state === "VISIT_MISSED") && /\b(kal|kale|kaale|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|today|aaj|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage))\b/i.test(lower))
    ) {
      const hasSpecificSlot = Boolean(aiAnalysis.reschedule_slot) || /\b(kal|kale|kaale|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|today|aaj|morning|evening|shaam|sanje|dopahar|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage))\b/i.test(lower);

      if (!hasSpecificSlot) {
        nextState = "RESCHEDULE_REQUESTED";
        await supabase
          .from("leads")
          .update({ state: "RESCHEDULE_REQUESTED" })
          .eq("id", lead.id);

        replyText =
          lang === "GUJLISH"
            ? `Ha bilkul thai jashe <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 👍 Tamne kayo navo divas ane time slot anukool raheshe — <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>? (Office timings: Saware 10:00 AM thi Sanje 6:00 PM)`
            : lang === "ENGLISH"
            ? `Yes, certainly <b>${senderName}</b>! 👍 Which new date and time slot would you prefer — <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>? (Working hours: 10:00 AM to 6:00 PM)`
            : `Ji bilkul ho jayega <b>${senderName ? `${senderName} ji` : "Friend"}</b>! 👍 Aapko kaunsa naya date aur time slot suit karega — <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>? (Timings: Subah 10:00 AM se Shaam 6:00 PM)`;
      } else {
        const slotResult = parseVisitSlot(aiAnalysis.reschedule_slot || messageText);

        if (!slotResult.isValidTime) {
          replyText =
            lang === "GUJLISH"
              ? `Amara site visit timings saware <b>10:00 AM thi sanje 6:00 PM</b> sudhi na hoy chhe. Kripya aa samay vachhe no slot janavjo. 🙏`
              : lang === "ENGLISH"
              ? `Our property site visits are scheduled between <b>10:00 AM and 6:00 PM IST</b>. Kindly suggest a convenient slot within this window. 🙏`
              : `Hamare site visit timings subah <b>10:00 AM se shaam 6:00 PM</b> ke beech hote hain. Kripya is time window me apna convenient slot batayein. 🙏`;
        } else if (slotResult.isPast) {
          replyText =
            lang === "GUJLISH"
              ? `Aa time viti gayo chhe. Kripya aavnar divas athva timing janavjo. 🙏`
              : lang === "ENGLISH"
              ? `This time slot has already passed. Please suggest an upcoming date and time. 🙏`
              : `Ye time slot nikal chuka hai. Kripya aane wala day ya timing batayein. 🙏`;
        } else {
          const newSlot = slotResult.isoUtc;
          const isInitialBooking = !lead.site_visit_booked && lead.state !== "VISIT_BOOKED" && lead.state !== "SITE_VISIT_BOOKED" && lead.state !== "VISIT_RESCHEDULED";

          // Clean DB: Update EXISTING active visit record or insert new one!
          const { data: existingVisits } = await supabase
            .from("site_visits")
            .select("id, property_id")
            .eq("lead_id", lead.id)
            .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED", "MISSED"])
            .order("created_at", { ascending: false })
            .limit(1);

          const finalPropId = existingVisits?.[0]?.property_id || lead.selected_property_id || "PROP-NXG-001";
          let resolvedPropName = "the property";
          if (finalPropId) {
            const { data: p } = await supabase
              .from("inventory")
              .select("project_name")
              .eq("property_id", finalPropId)
              .maybeSingle();
            if (p?.project_name) resolvedPropName = p.project_name;
          }

          // Update lead with complete property synchronization
          nextState = isInitialBooking ? "SITE_VISIT_BOOKED" : "VISIT_RESCHEDULED";
          await supabase
            .from("leads")
            .update({
              site_visit_at: newSlot,
              site_visit_datetime: newSlot,
              site_visit_booked: true,
              selected_property_id: finalPropId,
              metadata: {
                ...(lead.metadata || {}),
                selected_property_name: resolvedPropName,
              },
              pre_visit_reminder_sent: false,
              post_visit_feedback_sent: false,
              state: nextState,
            })
            .eq("id", lead.id);

          if (existingVisits && existingVisits.length > 0) {
            await supabase
              .from("site_visits")
              .update({ scheduled_at: newSlot, status: isInitialBooking ? "SCHEDULED" : "RESCHEDULED" })
              .eq("id", existingVisits[0].id);
          } else {
            await supabase.from("site_visits").insert({
              lead_id: lead.id,
              client_id: activeTenantId,
              property_id: finalPropId,
              scheduled_at: newSlot,
              status: isInitialBooking ? "SCHEDULED" : "RESCHEDULED",
            });
          }

          await dispatchSalesAlert(activeTenantId, isInitialBooking ? "SITE_VISIT_BOOKED" : "RESCHEDULE_VISIT", lead, { scheduledAt: newSlot, userText: messageText });

          const formatted = new Date(newSlot).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

          if (isInitialBooking) {
            replyText =
              lang === "GUJLISH"
                ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! Tamari VIP site visit <b>${formatted}</b> mate confirm thai gai chhe. Amara senior sales executive time par direct site location par tamne malshe. (Site par maliye chiye)! 🤝📍`
                : lang === "ENGLISH"
                ? `Certainly <b>${senderName}</b>! Your VIP site visit has been scheduled for <b>${formatted}</b>. Our senior sales executive will meet you directly at the site location on time! 🤝📍`
                : `Ji bilkul <b>${senderName ? `${senderName} ji` : "Friend"}</b>! Aapki VIP site visit <b>${formatted}</b> ke liye confirm kar di gayi hai. Hamare senior sales executive time par aapse direct site location par milenge (Milte hain site par)! 🤝📍`;
          } else {
            replyText =
              lang === "GUJLISH"
                ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! Tamari site visit <b>${formatted}</b> mate reschedule thai gai chhe. Amara senior sales executive time par direct site location par tamne malshe. (Site par maliye chiye)! 🤝📍`
                : lang === "ENGLISH"
                ? `Certainly <b>${senderName}</b>! Your site visit has been rescheduled to <b>${formatted}</b>. Our senior sales executive will meet you directly at the site location on time! 🤝📍`
                : `Ji bilkul <b>${senderName ? `${senderName} ji` : "Friend"}</b>! Aapki site visit <b>${formatted}</b> ke liye reschedule kar di gayi hai. Hamare senior sales executive time par aapse direct site location par milenge (Milte hain site par)! 🤝📍`;
          }
        }
      }
    }

    // =========================================================================
    // 5. SITE VISIT CANCELLATION
    // =========================================================================
    else if (aiAnalysis.intent === "CANCEL_VISIT" || lower.includes("cancel") || lower.includes("cancel visit") || lower.includes("nahi aana") || lower.includes("nahi aavish")) {
      nextState = "VISIT_CANCELLED";
      await supabase
        .from("leads")
        .update({ state: "VISIT_CANCELLED", site_visit_booked: false })
        .eq("id", lead.id);

      await supabase
        .from("site_visits")
        .update({ status: "CANCELLED" })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

      await dispatchSalesAlert(activeTenantId, "CANCEL_VISIT", lead, { userText: messageText });

      replyText =
        lang === "GUJLISH"
          ? `Samji gayo <b>${senderName} bhai</b>. Tamari site visit cancel kari didhi chhe. Jyare tame anukool hovo tyare navi visit book kari shako chho. 🙏`
          : lang === "ENGLISH"
          ? `Understood <b>${senderName}</b>. Your scheduled site visit has been cancelled. Whenever you are ready, you can book a new slot anytime. 🙏`
          : `Samajh gaya <b>${senderName} ji</b>. Aapki scheduled site visit cancel kar di gayi hai. Jab bhi aap comfortable hon, naya slot schedule kar sakte hain. 🙏`;
    }

    // =========================================================================
    // 6. GREETINGS & RE-ENGAGEMENT CONTEXT ANCHOR
    // =========================================================================
    else if (
      aiAnalysis.intent === "GREETING" ||
      (
        [
          "hi", "hello", "hey", "kem cho", "namaste", "pranam", "start", "restart", "fresh", "naya",
          "jay shree krishna", "jsk", "jai shree krishna", "radhe radhe", "ram ram", "jai jinendra",
          "har har mahadev", "namaskar", "good morning", "good evening", "good afternoon"
        ].some((g) => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g)) &&
        !/(flat|bhk|villa|plot|shop|office|showroom|commercial|godown|warehouse|buy|rent|lease|budget|crore|lakh|hazar|thousand|joiye|chahiye)/i.test(lower)
      )
    ) {
      if ((lead.site_visit_booked || lead.state === "SITE_VISIT_BOOKED" || lead.state === "VISIT_BOOKED") && !lower.includes("start") && !lower.includes("restart")) {
        // Fetch booked property and visit details
        let propDetails: any = null;
        let scheduledTime = lead.site_visit_at || lead.site_visit_datetime;

        const { data: latestVisit } = await supabase
          .from("site_visits")
          .select("*, inventory(*)")
          .eq("lead_id", lead.id)
          .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestVisit) {
          scheduledTime = latestVisit.scheduled_at || scheduledTime;
          if (latestVisit.inventory) {
            propDetails = latestVisit.inventory;
          } else if (latestVisit.property_id) {
            const { data: p } = await supabase
              .from("inventory")
              .select("*")
              .eq("property_id", latestVisit.property_id)
              .maybeSingle();
            propDetails = p;
          }
        }

        if (!propDetails && lead.selected_property_id) {
          const { data: p } = await supabase
            .from("inventory")
            .select("*")
            .eq("property_id", lead.selected_property_id)
            .maybeSingle();
          propDetails = p;
        }

        const visitTime = scheduledTime
          ? new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
          : "Scheduled Time";

        const propInfo = propDetails
          ? `\n🏢 <b>Property:</b> ${propDetails.project_name} (${propDetails.location})`
          : "";
        const mapInfo = propDetails?.map_url
          ? `\n📍 <b>Google Map Location:</b> ${propDetails.map_url}`
          : "";

        replyText =
          lang === "GUJLISH"
            ? `Welcome back <b>${senderName} bhai</b>! 🙏\n\nTamari VIP Site Visit already booked chhe:${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>Site par maliye chiye!</b> Amara senior sales executive time par direct site location par tamne malshe. Shu tamne timing reschedule karvo chhe ke koi biji query chhe?`
            : lang === "ENGLISH"
            ? `Welcome back <b>${senderName}</b>! 🙏\n\nYou already have a VIP Site Visit booked:${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the property location on time. Would you like to reschedule the time or do you have any questions?`
            : `Welcome back <b>${senderName} ji</b>! 🙏\n\nAapki VIP Site Visit already booked hai:${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par aapse direct site location par milenge. Kya aapko timing reschedule karna hai ya koi aur query hai?`;
      } else {
        // Check if existing property or search criteria known
        let searchedProp: any = null;
        const targetPropId = lead.selected_property_id || (Array.isArray(lead.last_option_ids) ? lead.last_option_ids[0] : null);
        if (targetPropId) {
          const { data: prop } = await supabase
            .from("inventory")
            .select("*")
            .eq("property_id", targetPropId)
            .maybeSingle();
          searchedProp = prop;
        }

        const knownFacts = [lead.property_type, lead.location, lead.budget ? `₹${Number(lead.budget) / 100000}L` : null].filter(Boolean).join(" in ");

        if (searchedProp && !lower.includes("start") && !lower.includes("fresh") && !lower.includes("naya")) {
          const leadName = senderName ? `${senderName} ji` : "Friend";
          const formattedPrice = searchedProp.price ? `₹${Number(searchedProp.price).toLocaleString("en-IN")}` : "Price on Request";

          nextState = "CRITERIA_CONFIRMATION_PENDING";
          await supabase
            .from("leads")
            .update({ state: "CRITERIA_CONFIRMATION_PENDING" })
            .eq("id", lead.id);

          replyText =
            lang === "GUJLISH"
              ? `Welcome back <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 👋\n\nChheli vaar ame tamara mate <b>${searchedProp.project_name}</b> search karyu hatu:\n🏢 <b>Project:</b> ${searchedProp.project_name} (${searchedProp.configuration}, ${searchedProp.location})\n💰 <b>Price:</b> ${formattedPrice}\n\nShu tame aani <b>VIP Site Visit 🚗</b> plan karva mango chho ke navi requirement search karvi chhe?\n\n1️⃣ <b>Site Visit plan karvi chhe</b>\n2️⃣ <b>Navi requirement search karvi chhe</b>`
              : lang === "ENGLISH"
              ? `Welcome back <b>${leadName}</b>! 👋\n\nLast time we searched <b>${searchedProp.project_name}</b> for you:\n🏢 <b>Project:</b> ${searchedProp.project_name} (${searchedProp.configuration}, ${searchedProp.location})\n💰 <b>Price:</b> ${formattedPrice}\n\nWould you like to schedule a <b>VIP Site Visit 🚗</b> or search for a new requirement?\n\n1️⃣ <b>Schedule VIP Site Visit</b>\n2️⃣ <b>Search new requirement</b>`
              : `Welcome back <b>${leadName}</b>! 👋\n\nPichli baar humne aapke liye <b>${searchedProp.project_name}</b> search kiya tha:\n🏢 <b>Project:</b> ${searchedProp.project_name} (${searchedProp.configuration}, ${searchedProp.location})\n💰 <b>Price:</b> ${formattedPrice}\n\nKya aap iski <b>VIP Site Visit 🚗</b> plan karna chahenge ya nayi requirement search karni hai?\n\n1️⃣ <b>Site Visit plan karni hai</b>\n2️⃣ <b>Nayi requirement search karni hai</b>`;
        } else if (knownFacts && !lower.includes("start") && !lower.includes("fresh") && !lower.includes("naya")) {
          const leadName = senderName ? `${senderName} ji` : "Friend";
          nextState = "CRITERIA_CONFIRMATION_PENDING";
          await supabase
            .from("leads")
            .update({ state: "CRITERIA_CONFIRMATION_PENDING" })
            .eq("id", lead.id);

          replyText =
            lang === "GUJLISH"
              ? `Welcome back <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 👋 Chheli vaar ame <b>${knownFacts}</b> search kari rahya hata. 🏡\n\nShu tame aa search aagal vadharva mango chho ke navi requirement chhe?\n\n1️⃣ <b>Aa j search aagal vadharvo chhe</b>\n2️⃣ <b>Navi requirement search karvi chhe</b>`
              : lang === "ENGLISH"
              ? `Welcome back <b>${leadName}</b>! 👋 Last time we were searching for <b>${knownFacts}</b>. 🏡\n\nWould you like to continue this search or start fresh?\n\n1️⃣ <b>Continue this search</b>\n2️⃣ <b>Start fresh requirement</b>`
              : `Welcome back <b>${leadName}</b>! 👋 Pichli baar hum <b>${knownFacts}</b> search kar rahe the. 🏡\n\nKya aap isi search ko aage badhana chahte hain ya naya requirement dekhna hai?\n\n1️⃣ <b>Isi search ko aage badhana hai</b>\n2️⃣ <b>Nayi requirement search karni hai</b>`;
        } else if (lead.metadata?.submission_id || lead.state === "OWNER_DETAILS_GATHERED") {
          nextState = "QUALIFYING";
          const leadName = senderName ? (lang === "GUJLISH" ? `${senderName} bhai` : `${senderName} ji`) : "ji";
          replyText =
            lang === "GUJLISH"
              ? `Namaste <b>${leadName}</b>! 👋 Tamari listed property verification desk par review ma chhe. Shu ame tamari potana mate navi property (Flat, Villa, Office) shodhva ma madad kariye? 🏡`
              : lang === "ENGLISH"
              ? `Hello <b>${senderName || "Friend"}</b>! 👋 Your property listing is under active review on our desk. Can we assist you with finding any new property to buy or rent (Flat, Villa, Office)? 🏡`
              : `Namaste <b>${leadName}</b>! 👋 Aapki listed property verification desk par active review me hai. Kya hum aapke liye koi nayi property (Flat, Villa, Office) search karne me madad karein? 🏡`;
        } else {
          // Dual-Role Greeting Fork for Fresh Leads
          await supabase
            .from("leads")
            .update({
              state: "ROLE_SELECTION_PENDING",
              property_type: null,
              requirement: null,
              purpose: null,
              location: null,
              budget: null,
              timeline: null,
              selected_property_id: null,
              site_visit_booked: false,
              site_visit_at: null,
              pre_visit_reminder_sent: false,
              post_visit_feedback_sent: false,
            })
            .eq("id", lead.id);

          nextState = "ROLE_SELECTION_PENDING";
          const leadName = senderName || (lang === "GUJLISH" ? "Mitra" : "Friend");
          replyText =
            lang === "GUJLISH"
              ? `Namaste <b>${leadName}</b>! ${agencyName} ma aapnu swagat chhe. 🏢✨\n\nTame ${agencyName} sathe shu karva mango chho?\n\n1️⃣ <b>Property Leni chhe</b> (Kharidva / Rent par joiye chhe) 🏡\n2️⃣ <b>Property Deni chhe</b> (Vechva / Rent par aapvi chhe) 📋\n\n<i>(Tame 1 ke 2 lakhi ne reply kari shako chho)</i>`
              : lang === "ENGLISH"
              ? `Hello <b>${leadName}</b>! Welcome to ${agencyName}. 🏢✨\n\nHow can we assist you today?\n\n1️⃣ <b>Looking for a Property</b> (Buy / Rent) 🏡\n2️⃣ <b>List / Offer a Property</b> (Sell / Rent Out) 📋\n\n<i>(You can reply with 1 or 2)</i>`
              : `Namaste <b>${leadName}</b>! ${agencyName} me aapka swagat hai. 🏢✨\n\nAap ${agencyName} ke sath kya karna chahte hain?\n\n1️⃣ <b>Property Leni hai</b> (Buy / Rent par chahiye) 🏡\n2️⃣ <b>Property Deni hai</b> (Bechni / Rent par deni hai) 📋\n\n<i>(Aap 1 ya 2 likh kar reply kar sakte hain)</i>`;
        }
      }
    }

    // =========================================================================
    // 6a: DUAL-ROLE GREETING FORK HANDLER
    // Triggers when lead.state === "ROLE_SELECTION_PENDING"
    // =========================================================================
    else if (lead.state === "ROLE_SELECTION_PENDING") {
      const hasExplicit2 = /^(2|2️⃣|option\s*2|second|2nd|deni|dene|sell|bechna|rent\s*out|rent\s*pe\s*deni|list|listing|property\s*deni|bhade\s*pe)\b/i.test(lower.trim());
      const hasExplicit1 = /^(1|1️⃣|option\s*1|first|1st|leni|lene|kharidna|buy|rent\s*pe\s*chahiye|search|flat\s*chahiye|ghar\s*chahiye)\b/i.test(lower.trim());

      const isOption2Owner =
        hasExplicit2 ||
        aiAnalysis.user_role === "OWNER" ||
        aiAnalysis.intent === "OWNER_LISTING" ||
        lower.includes("deni") || lower.includes("bechn") || lower.includes("rent pe deni") || lower.includes("bhaade aalvu") || lower.includes("bhade pe");

      const isOption1Seeker =
        !hasExplicit2 && (
          hasExplicit1 ||
          aiAnalysis.user_role === "SEEKER" ||
          aiAnalysis.intent === "SEEKER_QUALIFICATION" ||
          lower.includes("leni") || lower.includes("kharid") || lower.includes("rent chahiye") || lower.includes("chahiye")
        );

      if (hasExplicit2 || (isOption2Owner && !isOption1Seeker)) {
        // Option 2: Lead is an OWNER / PROVIDER
        nextState = "OWNER_CONFIG_PENDING";
        const initialDraft: any = {
          started_at: new Date().toISOString(),
          ...(aiAnalysis.transaction_type ? { transaction_type: (aiAnalysis.transaction_type === "RENT" || aiAnalysis.transaction_type === "LEASE") ? "RENT_OUT" : "SELL" } : {}),
          ...(aiAnalysis.property_type ? { property_type: aiAnalysis.property_type, configuration: aiAnalysis.property_type } : {}),
          ...(aiAnalysis.property_category ? { property_category: aiAnalysis.property_category } : {}),
          ...(aiAnalysis.location ? { location: aiAnalysis.location } : {}),
        };

        await supabase
          .from("leads")
          .update({
            lead_type: "PROVIDER",
            state: "OWNER_CONFIG_PENDING",
            metadata: {
              ...(lead.metadata || {}),
              owner_draft: initialDraft,
            },
          })
          .eq("id", lead.id);

        const leadName = senderName || (lang === "GUJLISH" ? "Mitra" : "ji");
        replyText =
          lang === "GUJLISH"
            ? `Namaste <b>${leadName}</b>! 🙏 NextGen Realty par tamari property list karva mate aabhar.\n\nTamari property kai chhe? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ke Plot</b>) ane tame <b>Rent par aapva mango chho ke Sell karva</b>?`
            : lang === "ENGLISH"
            ? `Thank you <b>${leadName}</b>! 🙏 We would be delighted to assist you in listing your property with NextGen Realty.\n\nWhat type of property is it? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa or Plot</b>) and are you looking to <b>Rent it out or Sell</b>?`
            : `Namaste <b>${leadName}</b>! 🙏 NextGen Realty par apni property list karne ke liye dhanyawad.\n\nAapki property kis type ki hai? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ya Plot</b>) aur aap ise <b>Rent par dena chahte hain ya Sell karna</b>?`;
      } else {
        // Option 1 (or Default): Lead is a SEEKER / BUYER
        nextState = "QUALIFYING";
        await supabase
          .from("leads")
          .update({
            lead_type: "SEEKER",
            state: "QUALIFYING",
          })
          .eq("id", lead.id);

        const leadName = senderName || "Friend";
        replyText =
          lang === "GUJLISH"
            ? `Namaste <b>${leadName}</b>! 🏡 Tame ${resolvedCity ? `${resolvedCity} ma ` : ""}property <b>Buy (Kharidva)</b> mango chho ke <b>Rent</b> par joiye chhe? Ane kai type ni property joiye chhe (e.g. <b>2BHK/3BHK Flat, Villa, ya Commercial Office</b>)?`
            : lang === "ENGLISH"
            ? `Great <b>${leadName}</b>! 🏡 Are you looking to <b>Buy</b> or <b>Rent</b> a property${resolvedCity ? ` in ${resolvedCity}` : ""}? And what type of property are you interested in (e.g. <b>2BHK/3BHK Flat, Villa, or Commercial Office</b>)?`
            : `Zaroor <b>${leadName}</b>! 🏡 Aap ${resolvedCity ? `${resolvedCity} me ` : ""}property <b>Buy (Kharidna)</b> chahte hain ya <b>Rent</b> par chahiye? Aur kis type ki property dekh rahe hain (e.g. <b>2BHK/3BHK Flat, Villa, ya Commercial Office</b>)?`;
      }
    }

    // =========================================================================
    // 6b.1: CRITERIA CONFIRMATION RESPONSE & FRESH REQUIREMENT HANDLER
    // Triggers when:
    // - Lead is in CRITERIA_CONFIRMATION_PENDING
    // - AI detects CHANGE_CRITERIA
    // - User types "nayi requirement", "fresh search", "change criteria", etc.
    // =========================================================================
    else if (
      !isInProgressOwnerIntake &&
      lead.lead_type !== "PROVIDER" &&
      (
        lead.state === "CRITERIA_CONFIRMATION_PENDING" ||
        aiAnalysis.intent === "CHANGE_CRITERIA" ||
        /(nayi\s*requirement|navi\s*requirement|nayi\s*property|navi\s*property|naya\s*property|naya\s*search|nayi\s*search|navi\s*search|nava\s*criteria|naya\s*criteria|change\s*criteria|criteria\s*badal|fresh\s*search|fresh\s*requirement|start\s*fresh|reset\s*criteria|naya\s*dekhna|nayi\s*dekhni|nayi\s*chahiye|navi\s*joiye)/i.test(lower)
      )
    ) {
      const isConfirmSame =
        aiAnalysis.intent === "CONFIRM_SAME_CRITERIA" ||
        /^(1|1️⃣|first|1st|ha|haan|ha ji|yes|same|isi me|yahi|yahi criteria|dikhao|sure|chalo|done|ok|okay|sahi hai|barobar|saras)$/i.test(lower) ||
        lower.includes("isi criteria") || lower.includes("same criteria") || lower.includes("yahi") ||
        lower.includes("isi me") || lower.includes("site visit") || lower.includes("visit plan");

      const isChangeCriteria =
        aiAnalysis.intent === "CHANGE_CRITERIA" ||
        /^(2|2️⃣|second|2nd|nahi|no|change|badalna|dusra|naya|nayi|navi|different|modify)$/i.test(lower) ||
        /(nayi\s*requirement|navi\s*requirement|nayi\s*property|navi\s*property|naya\s*property|naya\s*search|nayi\s*search|navi\s*search|nava\s*criteria|naya\s*criteria|change\s*criteria|criteria\s*badal|fresh\s*search|fresh\s*requirement|start\s*fresh|reset\s*criteria|naya\s*dekhna|nayi\s*dekhni|nayi\s*chahiye|navi\s*joiye)/i.test(lower) ||
        lower.includes("change") || lower.includes("badalna") || lower.includes("naya") || lower.includes("nayi") || lower.includes("navi") ||
        Boolean(parsePropertyTypeFromText(messageText)) ||
        Boolean(parseBudgetFromText(messageText));

      if (isChangeCriteria) {
        // User wants to change criteria or start fresh!
        const newPropType = parsePropertyTypeFromText(messageText);
        const newBudget = parseBudgetFromText(messageText);
        let newLocation = extractLocationFromText(messageText);
        let newReq = parseRequirementFromText(messageText);

        // UNCONDITIONALLY WIPE ALL STALE CRITERIA FROM PREVIOUS PROPERTIES:
        const leadUpdates: any = {
          state: "QUALIFYING",
          property_type: newPropType || null,
          budget: newBudget || null,
          location: newLocation || null,
          requirement: newReq || null,
          purpose: null,
          timeline: null,
          selected_property_id: null,
          last_option_ids: null,
          site_visit_booked: false,
          site_visit_at: null,
          site_visit_datetime: null,
          pre_visit_reminder_sent: false,
          post_visit_feedback_sent: false,
        };

        await supabase.from("leads").update(leadUpdates).eq("id", lead.id);
        nextState = "QUALIFYING";

        const leadName = senderName ? (lang === "GUJLISH" ? `${senderName} bhai` : `${senderName} ji`) : (lang === "GUJLISH" ? "Mitra" : "ji");

        if (newPropType || newBudget || newLocation) {
          const acknowledged = [newPropType, newLocation, newBudget ? `₹${newBudget}` : null].filter(Boolean).join(", ");
          replyText =
            lang === "GUJLISH"
              ? `Noted <b>${leadName}</b>! 👍 Ame tamari navi requirement note kari lidhi chhe: <b>${acknowledged}</b>. Kripya janavjo, tamne kaya nava area, budget ke timeline ma properties joiye chhe?`
              : lang === "ENGLISH"
              ? `Noted <b>${senderName || "Friend"}</b>! 👍 We have updated your preference to <b>${acknowledged}</b>. Please share any other specific details about your new budget, location or timeline.`
              : `Noted <b>${leadName}</b>! 👍 Humne aapki nayi requirement note kar li hai: <b>${acknowledged}</b>. Kripya apne naye location, budget ya timeline ki details batayein.`;
        } else {
          replyText =
            lang === "GUJLISH"
              ? `Ji bilkul <b>${leadName}</b>! Tame kaya type ni property shodhva mango chho — <b>2/3 BHK Flat</b>, <b>Villa</b> ke <b>Commercial</b>? 🏡`
              : lang === "ENGLISH"
              ? `Certainly <b>${senderName || "Friend"}</b>! What type of property are you looking for — <b>2/3 BHK Flat</b>, <b>Villa</b>, or <b>Commercial</b>? 🏡`
              : `Ji bilkul <b>${leadName}</b>! Aap kis type ki property dekhna chahte hain — <b>2/3 BHK Flat</b>, <b>Villa</b> ya <b>Commercial</b>? 🏡`;
        }
      } else if (isConfirmSame) {
        // If lead already had a specific selected property anchored (from greeting re-engagement):
        let targetProp: any = null;
        if (lead.selected_property_id) {
          const { data: p } = await supabase
            .from("inventory")
            .select("*")
            .eq("property_id", lead.selected_property_id)
            .maybeSingle();
          targetProp = p;
        }

        // If user wants to schedule site visit for this anchored property:
        if (targetProp && (lower.includes("visit") || lower.includes("site") || lower === "1" || lower === "1️⃣" || lower === "ha" || lower === "yes")) {
          nextState = "OPTIONS_SENT";
          replyText =
            lang === "GUJLISH"
              ? `Khub saras pasand <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! <b>${targetProp.project_name}</b> (${targetProp.configuration}, ${targetProp.location}) ni <b>VIP Site Visit 🚗</b> mate kayo time anukool ganasho - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
              : lang === "ENGLISH"
              ? `Excellent choice <b>${senderName || "Friend"}</b>! When would you like to schedule a <b>VIP Site Visit 🚗</b> for <b>${targetProp.project_name}</b> (${targetProp.configuration}, ${targetProp.location}) - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
              : `Bahut badhiya choice <b>${senderName ? `${senderName} ji` : "ji"}</b>! <b>${targetProp.project_name}</b> (${targetProp.configuration}, ${targetProp.location}) ki <b>VIP Site Visit 🚗</b> ke liye kaunsa slot prefer karenge - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`;
        } else {
          // Query next unseen properties matching the existing criteria!
          const { data: allProps } = await supabase
            .from("inventory")
            .select("*")
            .eq("client_id", activeTenantId)
            .eq("status", "AVAILABLE");

          const availableInventory = allProps || [];
          const leadBudget = Number(lead.budget || 0);
          const maxBudget = leadBudget > 0 ? leadBudget * 1.15 : Infinity;

          // Exclude properties already shown to this lead
          const excludedIds = new Set<string>([
            ...(Array.isArray(lead.last_option_ids) ? lead.last_option_ids : []),
            lead.selected_property_id
          ].filter(Boolean));

          const strictMatches = availableInventory.filter((p: any) => {
            if (excludedIds.has(p.property_id)) return false;
            const price = Number(p.price || 0);
            if (leadBudget > 0 && price > maxBudget) return false;
            if (!matchesListingType(lead.requirement, p.listing_type, price)) return false;
            if (!matchesPropertyType(lead.property_type, p.property_category, p.configuration, p.project_name)) return false;
            if (!matchesLocation(lead.location, p.location, p.landmarks)) return false;
            return true;
          });

          const freshProperties = strictMatches.slice(0, 3);

          if (freshProperties.length > 0) {
            const newOptionIds = freshProperties.map((p) => p.property_id);
            const combinedOptionIds = Array.from(new Set([...(lead.last_option_ids || []), ...newOptionIds]));

            nextState = "OPTIONS_SENT";
            await supabase
              .from("leads")
              .update({
                state: "OPTIONS_SENT",
                last_option_ids: combinedOptionIds,
                selected_property_id: freshProperties[0].property_id,
              })
              .eq("id", lead.id);

            const optionsCards = freshProperties.map((p, idx) => formatN8nPropertyCard(p, idx, false)).join("\n\n---\n\n");
            const critSummary = formatLeadCriteriaSummary(lead, lang, resolvedCity);

            const heading =
              lang === "GUJLISH"
                ? `🌟 <b>${critSummary} Mujab Nava Verified Options</b>\n\n${senderName ? `<b>${senderName} bhai</b>, ` : ""}tamara criteria mujab aa fresh matching properties chhe:`
                : lang === "ENGLISH"
                ? `🌟 <b>Fresh Options Matching ${critSummary}</b>\n\n${senderName ? `<b>${senderName}</b>, ` : ""}here are more verified properties matching your criteria:`
                : `🌟 <b>${critSummary} Ke Mutabiq Naye Verified Options</b>\n\n${senderName ? `<b>${senderName} ji</b>, ` : ""}aapke criteria ke hisab se ye fresh options hain:`;

            const trailerQuestion =
              freshProperties.length === 1
                ? (lang === "GUJLISH"
                    ? `👉 <i>Tame <b>${freshProperties[0].project_name}</b> ni <b>VIP Site Visit 🚗</b> mate kayo time anukool ganasho — <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?</i>`
                    : lang === "ENGLISH"
                    ? `👉 <i>When would you like to schedule a <b>VIP Site Visit 🚗</b> for <b>${freshProperties[0].project_name}</b> — <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?</i>`
                    : `👉 <i>Aap <b>${freshProperties[0].project_name}</b> ki <b>VIP Site Visit 🚗</b> ke liye kaunsa slot prefer karenge — <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?</i>`)
                : (lang === "GUJLISH"
                    ? `👉 <i>Tame aamathi kayi property ni <b>VIP Site Visit 🚗</b> schedule karva mango chho — <b>Option 1</b>, <b>Option 2</b> ke <b>Option 3</b>?</i>`
                    : lang === "ENGLISH"
                    ? `👉 <i>Which of these properties would you like to schedule a <b>VIP Site Visit 🚗</b> for — <b>Option 1</b>, <b>Option 2</b>, or <b>Option 3</b>?</i>`
                    : `👉 <i>Aap inme se kis property ki <b>VIP Site Visit 🚗</b> schedule karna chahenge — <b>Option 1</b>, <b>Option 2</b> ya <b>Option 3</b>?</i>`);

            replyText = `${heading}\n\n${optionsCards}\n\n${trailerQuestion}`;
          } else {
            // No more unseen inventory matching exact criteria
            nextState = "OPTIONS_SENT";
            await supabase.from("leads").update({ state: "OPTIONS_SENT" }).eq("id", lead.id);
            await dispatchSalesAlert(activeTenantId, "NO_PROPERTY_MATCH", lead, { userText: messageText });

            const critSummary = formatLeadCriteriaSummary(lead, lang, resolvedCity);
            replyText =
              lang === "GUJLISH"
                ? `Ji <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>, <b>${critSummary}</b> na criteria ma amari paas aa best verified inventory available hati. Amara senior sales manager tamara mate exclusive <b>off-market options</b> arrange kari rahya chhe ane direct <b>call par connect karshe</b>. 📞\n\nAgar tame aas-paas na areas ke budget ma thodo badlaav karva mango to janavjo!`
                : lang === "ENGLISH"
                ? `Sure <b>${senderName}</b>, these were our top verified options matching <b>${critSummary}</b>. Our senior sales executives are sourcing exclusive <b>off-market inventory</b> and will <b>connect with you directly over a call</b>. 📞\n\nIf you would like to explore nearby localities or adjust your budget range, please let me know!`
                : `Ji <b>${senderName ? `${senderName} ji` : "ji"}</b>, <b>${critSummary}</b> ke criteria me hamare paas yehi top verified inventory available thi. Hamare senior sales executive aapke liye exclusive <b>off-market options</b> arrange kar rahe hain aur aapse direct <b>call par connect karenge</b>. 📞\n\nAgar aap aas-paas ke areas ya budget me thoda change karna chahein to batayein!`;
          }
        }
      }
    }

    // =========================================================================
    // 6b.2: RE-SEARCH & ALTERNATE PROPERTY REQUEST (When Qualified or Booked Lead asks for properties)
    // =========================================================================
    else if (
      (aiAnalysis.intent === "ASK_MORE_OPTIONS" ||
      /(koi\s*dusri|dusri\s*property|dusra\s*option|koi\s*aur\s*property|koi\s*aur\s*option|aur\s*options|aur\s*property|dusre\s*options|biji\s*property|bijo\s*option|biji\s*options|other\s*propert|different\s*propert|more\s*options|other\s*options|koi\s*biji|aur\s*flat|aur\s*dekhna|aur\s*dikhao|kuch\s*aur|kuch\s*naya|property\s*dekhni|flat\s*dekhna|flat\s*dekhne|options\s*dikhao|options\s*batavo)/i.test(lower)) &&
      (!parseBudgetFromText(messageText) && !parseRequirementFromText(messageText) && !parsePropertyTypeFromText(messageText))
    ) {
      const hasExistingCriteria = Boolean((lead.property_type && (lead.location || lead.budget)) || lead.site_visit_booked || ["QUALIFIED", "OPTIONS_SENT", "SITE_VISIT_BOOKED", "VISIT_BOOKED", "VISIT_RESCHEDULED"].includes(lead.state));

      // 1. If lead is already Qualified or Booked, show Existing Criteria Confirmation!
      if (hasExistingCriteria) {
        nextState = "CRITERIA_CONFIRMATION_PENDING";
        await supabase.from("leads").update({ state: "CRITERIA_CONFIRMATION_PENDING" }).eq("id", lead.id);

        const criteriaStr = formatLeadCriteriaSummary(lead, lang);
        const nameStr = senderName ? (lang === "GUJLISH" ? `<b>${senderName} bhai</b>` : `<b>${senderName} ji</b>`) : (lang === "GUJLISH" ? "Mitra" : "ji");

        if (lead.site_visit_booked || ["SITE_VISIT_BOOKED", "VISIT_BOOKED", "VISIT_RESCHEDULED"].includes(lead.state)) {
          // Scenario A: Active Booked Visit Safeguard
          let bookedPropName = "Project";
          const targetPropId = lead.selected_property_id || (Array.isArray(lead.last_option_ids) ? lead.last_option_ids[0] : null);
          if (targetPropId) {
            const { data: bp } = await supabase.from("inventory").select("project_name").eq("property_id", targetPropId).maybeSingle();
            if (bp?.project_name) bookedPropName = bp.project_name;
          }

          replyText =
            lang === "GUJLISH"
              ? `Welcome back ${nameStr}! Tamari <b>${bookedPropName}</b> par VIP Site Visit already booked chhe 🚗📍.\n\nTame pehla <b>${criteriaStr}</b> search karyu hatu 🏡.\n\nShu tame <b>aa j criteria sathe</b> nava alternate options explore karva mango chho, ke criteria (location, budget ke BHK) badalvu chhe?\n\n1️⃣ <b>Aa j criteria ma nava options batavo</b>\n2️⃣ <b>Criteria badalvu chhe</b>`
              : lang === "ENGLISH"
              ? `Welcome back <b>${senderName || "Friend"}</b>! You already have a VIP Site Visit booked for <b>${bookedPropName}</b> 🚗📍.\n\nEarlier, you searched for <b>${criteriaStr}</b> 🏡.\n\nWould you like to explore more options with <b>this same criteria</b>, or would you like to update your location, budget, or BHK?\n\n1️⃣ <b>Show more options with same criteria</b>\n2️⃣ <b>Change my criteria</b>`
              : `Welcome back ${nameStr}! Aapki <b>${bookedPropName}</b> par VIP Site Visit already booked hai 🚗📍.\n\nAapne pehle <b>${criteriaStr}</b> search kiya tha 🏡.\n\nKya aap <b>isi criteria ke sath</b> aur naye options explore karna chahenge, ya criteria (location, budget ya BHK) change karna chahte hain?\n\n1️⃣ <b>Isi criteria me aur options dikhao</b>\n2️⃣ <b>Criteria change karna hai</b>`;
        } else {
          // Scenario B: Qualified / Options Sent (No Active Visit)
          replyText =
            lang === "GUJLISH"
              ? `Ji ${nameStr}! Pichli vaar ame tamara mate <b>${criteriaStr}</b> ma options filter karya hata 🏡.\n\nShu tame <b>aa j criteria sathe</b> nava verified options jova mango chho, ke criteria (location, budget ke BHK) badalvu chhe?\n\n1️⃣ <b>Aa j criteria ma nava options batavo</b>\n2️⃣ <b>Criteria badalvu chhe</b>`
              : lang === "ENGLISH"
              ? `Sure <b>${senderName || "Friend"}</b>! Last time we filtered properties for you with <b>${criteriaStr}</b> 🏡.\n\nWould you like to view more verified options with <b>this same criteria</b>, or would you like to update your location, budget, or BHK?\n\n1️⃣ <b>Show more options with same criteria</b>\n2️⃣ <b>Change my criteria</b>`
              : `Ji ${nameStr}! Pichli baar humne aapke liye <b>${criteriaStr}</b> me properties filter ki thi 🏡.\n\nKya aap <b>isi criteria ke sath</b> naye verified options dekhna chahenge, ya criteria (location, budget ya BHK) change karna chahte hain?\n\n1️⃣ <b>Isi criteria me aur options dikhao</b>\n2️⃣ <b>Criteria change karna hai</b>`;
        }
      } else {
        // Fresh Lead without existing criteria: ask for property type
        replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! Tame kaya type ni property jova mango chho — 🏡 <b>Residential</b> (Flat / Villa) ke 🏢 <b>Commercial</b> (Shop / Office / Plot)?`
            : lang === "ENGLISH"
            ? `Certainly <b>${senderName}</b>! What type of property would you like to explore — 🏡 <b>Residential</b> (Flat / Villa) or 🏢 <b>Commercial</b> (Shop / Office / Plot)?`
            : `Ji bilkul <b>${senderName ? `${senderName} ji` : "ji"}</b>! Aap kis type ki property dekhna chahte hain — 🏡 <b>Residential</b> (Flat / Villa) ya 🏢 <b>Commercial</b> (Shop / Office / Plot)?`;
      }
    }

    // =========================================================================
    // 7. PROPERTY SELECTION (Option 1, 2, 3 or Name)
    // =========================================================================
    else if (
      (lead.state === "OPTIONS_SENT" || lead.state === "VISIT_REQUESTED") &&
      !aiAnalysis.reschedule_slot &&
      !aiAnalysis.property_type &&
      (aiAnalysis.selected_option_index !== null && aiAnalysis.selected_option_index !== undefined ||
       /(?:^|\b)(?:1|1️⃣|first|1st|option\s*1|2|2️⃣|second|2nd|option\s*2|3|3️⃣|third|3rd|option\s*3)\b/i.test(lower))
    ) {
      let index = aiAnalysis.selected_option_index ?? (/(?:2|2️⃣|second|dusra)/i.test(lower) ? 1 : /(?:3|3️⃣|third|teesra)/i.test(lower) ? 2 : 0);

      // Fetch matching options from last options
      let selected: any = null;
      if (Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > index) {
        const { data: prop } = await supabase
          .from("inventory")
          .select("*")
          .eq("property_id", lead.last_option_ids[index])
          .maybeSingle();
        selected = prop;
      }

      if (!selected) {
        replyText =
          lang === "GUJLISH"
            ? `Ji <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>, tamara exact criteria (<b>${lead.property_type || "Property"}</b> in <b>${lead.location || resolvedCity || "tamara shehar"}</b>) mate aa amaru best verified option hatu. Amara senior sales executive tamara mate exclusive <b>off-market options</b> arrange kari rahya chhe ane direct <b>call par connect karshe</b>. 📞\n\nAgar tame location ke budget badalva mango chho, to kripya janavjo!`
            : lang === "ENGLISH"
            ? `Sure <b>${senderName}</b>, this was our top verified option for your criteria (<b>${lead.property_type || "Property"}</b> in <b>${lead.location || resolvedCity || "your city"}</b>). Our senior sales executives are arranging exclusive <b>off-market options</b> and will <b>connect with you directly over a call</b>. 📞\n\nIf you would like to explore nearby areas or adjust your budget, please let me know!`
            : `Ji <b>${senderName ? `${senderName} ji` : "ji"}</b>, aapke exact criteria (<b>${lead.property_type || "Property"}</b> in <b>${lead.location || resolvedCity || "aapke shehar"}</b>) ke liye ye hamara top verified option tha. Hamare senior sales executive aapke liye exclusive <b>off-market & alternate options</b> arrange kar rahe hain aur aapse direct <b>call par connect karenge</b>. 📞\n\nAgar aap location ya budget relax karna chahein, to kripya batayein!`;
      }

      if (selected) {
        await supabase
          .from("leads")
          .update({ selected_property_id: selected.property_id, state: "OPTIONS_SENT" })
          .eq("id", lead.id);

        replyText =
          lang === "GUJLISH"
            ? `Khub saras pasand <b>${senderName} bhai</b>! <b>${selected.project_name}</b> (${selected.configuration}, ${selected.location}) ekdam prime project chhe.\n\n📄 Brochure: ${selected.brochure_url || "Available"}\n\nTame aa project ni <b>VIP Site Visit 🚗</b> mate kayo time anukool ganasho - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
            : lang === "ENGLISH"
            ? `Excellent choice <b>${senderName}</b>! <b>${selected.project_name}</b> (${selected.configuration}, ${selected.location}) is a premium project.\n\n📄 Brochure: ${selected.brochure_url || "Available"}\n\nWhen would you like to schedule a <b>VIP Site Visit 🚗</b> - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
            : `Bahut badhiya choice <b>${senderName} ji</b>! <b>${selected.project_name}</b> (${selected.configuration}, ${selected.location}) kaafi premium project hai.\n\n📄 Brochure: ${selected.brochure_url || "Available"}\n\nAap iski <b>VIP Site Visit 🚗</b> ke liye kaunsa slot prefer karenge - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`;
      }
    }

    // =========================================================================
    // 8. SITE VISIT BOOKING WITH 10 AM - 6 PM IST VALIDATION
    // =========================================================================
    else if (
      !/(commercial|office|shop|flat|bhk|villa|budget|lakh|crore|hazar|rent|buy|chahiye|sodhu|dekhna)/i.test(lower) &&
      (/(site visit|visit book|book visit|visit schedule|meeting schedule|visit karvi|visit aavvu|visit karni)/i.test(lower) ||
       (/\b(kal|kale|kaale|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|today|aaj)\b/i.test(lower) && /\b\d{1,2}(?::\d{2})?\s*(am|pm|baje|vage)?\b/i.test(lower)) ||
       (/\b(kal|kale|kaale|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(lower)) ||
       (lead.state === "OPTIONS_SENT" && /\b(ha|haan|yes|yep|sure|chalo|done)\b/i.test(lower)))
    ) {
      // Resolve property to book:
      let propToBookId = lead.selected_property_id;

      // 1. Check if user mentioned option number in visit message (Zero-Regex AI option index with fallback)
      if (Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 0) {
        if (aiAnalysis.selected_option_index !== null && aiAnalysis.selected_option_index !== undefined && lead.last_option_ids[aiAnalysis.selected_option_index]) {
          propToBookId = lead.last_option_ids[aiAnalysis.selected_option_index];
        } else if (/(option\s*1|first|1st|pehla|pehli)/i.test(lower) && lead.last_option_ids[0]) {
          propToBookId = lead.last_option_ids[0];
        } else if (/(option\s*2|second|2nd|dusra|dusri)/i.test(lower) && lead.last_option_ids[1]) {
          propToBookId = lead.last_option_ids[1];
        } else if (/(option\s*3|third|3rd|teesra|teesri)/i.test(lower) && lead.last_option_ids[2]) {
          propToBookId = lead.last_option_ids[2];
        }
      }

      // 2. If only 1 option was sent previously, anchor to that option!
      if (!propToBookId && Array.isArray(lead.last_option_ids) && lead.last_option_ids.length === 1) {
        propToBookId = lead.last_option_ids[0];
      }

      // 3. Check if user typed project name from options
      if (Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 0) {
        const { data: optProps } = await supabase
          .from("inventory")
          .select("property_id, project_name")
          .in("property_id", lead.last_option_ids);

        if (optProps) {
          for (const p of optProps) {
            if (lower.includes(p.project_name.toLowerCase())) {
              propToBookId = p.property_id;
              break;
            }
          }
        }
      }

      // 4. If lead has multiple options and user hasn't selected one
      if (!propToBookId && Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 1) {
        replyText =
          lang === "GUJLISH"
            ? `Site visit plan karva mate, pehla kripya batavo tame <b>Option 1, 2 ke 3</b> mathi kayo project pehla jova mango chho? 🚗`
            : lang === "ENGLISH"
            ? `To schedule your site visit, please select which property you want to visit first - <b>Option 1, 2, or 3</b>? 🚗`
            : `Site visit schedule karne ke liye, kripya pehle batayein aap <b>Option 1, 2 ya 3</b> me se kis project ko pehle dekhna chahenge? 🚗`;
      } else {
        const hasSpecificSlot = /\b(kal|kale|kaale|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|today|aaj|morning|evening|shaam|sanje|dopahar|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage))\b/i.test(lower);

        if (!hasSpecificSlot) {
          nextState = "VISIT_REQUESTED";
          await supabase.from("leads").update({ state: "VISIT_REQUESTED" }).eq("id", lead.id);
          replyText =
            lang === "GUJLISH"
              ? `Bahuj saras <b>${senderName} bhai</b>! 👍 Site visit 🚗 mate tamne kayo time anukool raheshe - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>? (Office timings: Saware 10 thi Sanje 6)`
              : lang === "ENGLISH"
              ? `Great <b>${senderName}</b>! 👍 Which slot suits you best for the site visit 🚗 - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>? (Working hours: 10 AM to 6 PM)`
              : `Bahut badhiya <b>${senderName} ji</b>! 👍 Site visit 🚗 confirm karne ke liye aapko kaunsa slot suit karega - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>? (Working hours: 10 AM to 6 PM)`;
        } else {
          const slotResult = parseVisitSlot(messageText);

          // Working hours guardrail: 10 AM to 6 PM IST
          if (!slotResult.isValidTime) {
            replyText =
              lang === "GUJLISH"
                ? `Amara site visit timings saware <b>10:00 AM thi sanje 6:00 PM</b> sudhi na hoy chhe. Kripya aa samay vachhe no slot janavjo. 🙏`
                : lang === "ENGLISH"
                ? `Our property site visits are scheduled between <b>10:00 AM and 6:00 PM IST</b>. Kindly suggest a convenient slot within this window. 🙏`
                : `Hamare site visit timings subah <b>10:00 AM se shaam 6:00 PM</b> ke beech hote hain. Kripya is time window me apna convenient slot batayein. 🙏`;
          } else if (slotResult.isPast) {
            replyText =
              lang === "GUJLISH"
                ? `Aa time viti gayo chhe. Kripya aavnar divas athva timing janavjo. 🙏`
                : lang === "ENGLISH"
                ? `This time slot has already passed. Please suggest an upcoming date and time. 🙏`
                : `Ye time slot nikal chuka hai. Kripya aane wala day ya timing batayein. 🙏`;
          } else {
            const scheduledAt = slotResult.isoUtc;
            nextState = "SITE_VISIT_BOOKED";

            // Fetch property details for site visit
            let propDetails: any = null;
            const finalPropId = propToBookId || lead.selected_property_id || "PROP-NXG-001";
            if (finalPropId) {
              const { data: prop } = await supabase
                .from("inventory")
                .select("*")
                .eq("property_id", finalPropId)
                .maybeSingle();
              propDetails = prop;
            }

            await supabase
              .from("leads")
              .update({
                site_visit_booked: true,
                site_visit_at: scheduledAt,
                site_visit_datetime: scheduledAt,
                selected_property_id: finalPropId,
                metadata: {
                  ...(lead.metadata || {}),
                  selected_property_name: propDetails?.project_name || "the property",
                },
                state: "SITE_VISIT_BOOKED",
                pre_visit_reminder_sent: false,
                post_visit_feedback_sent: false,
              })
              .eq("id", lead.id);

            // Insert into site_visits
            await supabase.from("site_visits").insert({
              lead_id: lead.id,
              client_id: activeTenantId,
              property_id: finalPropId,
              scheduled_at: scheduledAt,
              status: "SCHEDULED",
            });

            // Dispatch Sales Alert to assigned executive or manager
            await dispatchSalesAlert(activeTenantId, "SITE_VISIT_BOOKED", lead, {
              scheduledAt,
              property: propDetails,
              userText: messageText,
            });

            const formatted = new Date(scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
            const mapLink = propDetails?.map_url ? `\n📍 <b>Google Map Location:</b> ${propDetails.map_url}` : "";

            // Point 6: Night-Owl / Out-of-Hours Expectation Note
            const offHoursNote = !isWithinWorkingHours(10, 19)
              ? (lang === "GUJLISH"
                  ? "\n\n<i>(Amara sales advisor saware 10:00 AM e tamaro direct contact karshe.)</i>"
                  : lang === "ENGLISH"
                  ? "\n\n<i>(Our sales advisor will connect with you directly at 10:00 AM tomorrow.)</i>"
                  : "\n\n<i>(Hamare sales advisor subah 10:00 AM par aapse directly connect karenge.)</i>")
              : "";

            replyText =
              lang === "GUJLISH"
                ? `Mubarak <b>${senderName} bhai</b>! 🎉\n\nTamari VIP Site Visit <b>${formatted}</b> par confirm thai gai chhe! 🚗${propDetails ? `\n🏢 <b>Project:</b> ${propDetails.project_name} (${propDetails.location})` : ""}${mapLink}\n\n🤝 <b>Site par maliye chiye!</b> Amara senior property advisor time par direct site location par tamne malshe.${offHoursNote}`
                : lang === "ENGLISH"
                ? `Congratulations <b>${senderName}</b>! 🎉\n\nYour VIP Site Visit is confirmed for <b>${formatted}</b>! 🚗${propDetails ? `\n🏢 <b>Project:</b> ${propDetails.project_name} (${propDetails.location})` : ""}${mapLink}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the property location on time.${offHoursNote}`
                : `Badhai ho <b>${senderName} ji</b>! 🎉\n\nAapki VIP Site Visit <b>${formatted}</b> ke liye confirm ho gayi hai! 🚗${propDetails ? `\n🏢 <b>Project:</b> ${propDetails.project_name} (${propDetails.location})` : ""}${mapLink}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par aapse direct site location par milenge.${offHoursNote}`;
          }
        }
      }
    }

    // =========================================================================
    // 9. BROCHURE & MAP REQUEST
    // =========================================================================
    else if (
      !/(budget|lakh|crore|hazar|thousand|rent|buy|\d+k|chalegi|chalega|chalse|gamete|bhadu|bhade|kharid|flat|bhk|villa|shop|office|commercial|residential|plot)/i.test(lower) &&
      (
        /\b(brochure|brocher|brochar|broshur|brochur|pamphlet|pdf|catalog|catalogue|deck)\b/i.test(lower) ||
        /\b(naksho|google\s*map|location\s*pin|location\s*map|map\s*link)\b/i.test(lower) ||
        (/\bmap\b/i.test(lower) && !/(roadmap|map\s*karo)/i.test(lower)) ||
        ((lower.includes("bhejo") || lower.includes("bhej") || lower.includes("moklo") || lower.includes("mokli") || lower.includes("send") || lower.includes("share")) &&
         (lower.includes("detail") || lower.includes("info") || lower.includes("mahiti") || lower.includes("link") || lower.includes("location pin") || lower.includes("location link") || lower.includes("broch") || lower.includes("brocher")))
      )
    ) {
      let prop: any = null;
      let hasBookedVisit = Boolean((lead.site_visit_booked || lead.state === "SITE_VISIT_BOOKED" || lead.state === "VISIT_BOOKED") && lead.state !== "QUALIFYING");

      // 1. If lead has an active booked visit, fetch the exact booked property from site_visits
      if (hasBookedVisit) {
        const { data: latestVisit } = await supabase
          .from("site_visits")
          .select("property_id")
          .eq("lead_id", lead.id)
          .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestVisit?.property_id) {
          const { data: p } = await supabase.from("inventory").select("*").eq("property_id", latestVisit.property_id).maybeSingle();
          if (p) {
            prop = p;
          }
        }
      }

      // 2. If not from visit, check selected_property_id
      if (!prop && lead.selected_property_id) {
        const { data: p } = await supabase.from("inventory").select("*").eq("property_id", lead.selected_property_id).maybeSingle();
        if (p) prop = p;
      }

      // 3. If not, check last_option_ids
      if (!prop && Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 0) {
        const { data: p } = await supabase.from("inventory").select("*").eq("property_id", lead.last_option_ids[0]).maybeSingle();
        if (p) prop = p;
      }

      // 4. Fallback to active inventory
      if (!prop) {
        const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("status", "AVAILABLE").limit(1).maybeSingle();
        if (p) prop = p;
      }

      const isMapReq = lower.includes("map") || lower.includes("location") || lower.includes("naksho");
      await dispatchSalesAlert(activeTenantId, isMapReq ? "MAP_REQUEST" : "BROCHURE_REQUEST", lead, { property: prop, userText: messageText });

      const link = isMapReq
        ? (prop?.map_url || "https://maps.google.com")
        : (prop?.brochure_url || prop?.map_url || "https://maps.google.com");

      if (hasBookedVisit) {
        nextState = lead.state; // Retain current site visit booked state!
        replyText =
          lang === "GUJLISH"
            ? `Aa rahyu ${senderName ? `<b>${senderName} bhai</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> nu official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${link}\n\nTamari VIP Site Visit 🚗 already confirm chhe. 🤝 <b>Site par maliye chiye!</b> Amara senior sales executive time par direct site location par tamne malshe.`
            : lang === "ENGLISH"
            ? `Here is the official ${isMapReq ? "Location Map 📍" : "Brochure 📄"} for <b>${prop?.project_name || "the project"}</b>, <b>${senderName}</b>:\n${link}\n\nYour VIP Site Visit 🚗 is already confirmed. 🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the property location on time.`
            : `Yeh lijiye ${senderName ? `<b>${senderName} ji</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> ka official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${link}\n\nAapki VIP Site Visit 🚗 already confirm hai. 🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par aapse direct site location par milenge.`;
      } else {
        replyText =
          lang === "GUJLISH"
            ? `Aa rahyu ${senderName ? `<b>${senderName} bhai</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> nu official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${link}\n\nAa check kari ne janavjo, VIP Site Visit 🚗 mate kayo time anukool raheshe - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
            : lang === "ENGLISH"
            ? `Here is the official ${isMapReq ? "Location Map 📍" : "Brochure 📄"} for <b>${prop?.project_name || "the project"}</b>, <b>${senderName}</b>:\n${link}\n\nWhen would you like to schedule a VIP Site Visit 🚗 once you review this - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
            : `Yeh lijiye ${senderName ? `<b>${senderName} ji</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> ka official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${link}\n\nIse dekh kar bataiye, VIP Site Visit 🚗 ke liye kaunsa slot prefer karenge - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`;
      }
    }

    // =========================================================================
    // 9b. AUTONOMOUS REAL-ESTATE FAQ & OBJECTION ENGINE (7 Core Real-Estate Categories)
    // Intercepts queries about Amenities, RERA, Home Loan, Possession, Landmarks,
    // Pricing/Discounts, and Brokerage, answers with DB specs, and bridges to VIP Site Visit!
    // =========================================================================
    else if (
      aiAnalysis.intent === "GENERAL_FAQ" ||
      aiAnalysis.intent === "PRICE_NEGOTIATION" ||
      Boolean(aiAnalysis.faq_topic) ||
      /\b(lift|parking|rera|loan|possession|brokerage|discount)\b/i.test(lower)
    ) {
      // 1. Resolve Target Property Context from DB
      const { data: allProps } = await supabase
        .from("inventory")
        .select("*")
        .eq("client_id", activeTenantId)
        .eq("status", "AVAILABLE");
      const availableProps = allProps || [];

      let prop: any = null;

      // Check if user named a project in message
      if (availableProps.length > 0) {
        for (const p of availableProps) {
          const pName = (p.project_name || "").toLowerCase();
          const firstWord = pName.split(/\s+/)[0];
          if (pName && (lower.includes(pName) || (firstWord.length >= 4 && lower.includes(firstWord)))) {
            prop = p;
            break;
          }
        }
      }

      // Check lead's selected property
      if (!prop && lead.selected_property_id) {
        prop = availableProps.find((p: any) => p.property_id === lead.selected_property_id);
      }

      // Check lead's last_option_ids[0]
      if (!prop && Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 0) {
        prop = availableProps.find((p: any) => p.property_id === lead.last_option_ids[0]);
      }

      // Check booked visit property
      if (!prop && lead.site_visit_booked) {
        const { data: latestVisit } = await supabase
          .from("site_visits")
          .select("property_id")
          .eq("lead_id", lead.id)
          .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestVisit?.property_id) {
          prop = availableProps.find((p: any) => p.property_id === latestVisit.property_id);
        }
      }

      // Check matching location
      if (!prop && lead.location) {
        prop = availableProps.find((p: any) => matchesLocation(lead.location, p.location, p.landmarks));
      }

      // Fallback to top available property
      if (!prop && availableProps.length > 0) {
        prop = availableProps[0];
      }

      const projName = prop?.project_name || "Project";
      const projLoc = prop?.location || resolvedCity || "Prime Location";
      const hasBookedVisit = Boolean(lead.site_visit_booked || ["SITE_VISIT_BOOKED", "VISIT_BOOKED", "SITE_VISIT_DONE", "VISIT_DONE"].includes(lead.state));

      // Build Conversion CTA Bridge
      let bridgeCta = "";
      if (hasBookedVisit) {
        bridgeCta =
          lang === "GUJLISH"
            ? `\n\n🤝 <b>Tamari VIP Site Visit already booked chhe!</b> Amara senior sales executive direct site location par tamne malshe ane aa badhi details personally samjavshe.`
            : lang === "ENGLISH"
            ? `\n\n🤝 <b>Your VIP Site Visit is already confirmed!</b> Our senior sales advisor will meet you directly at the site location to verify all details in person.`
            : `\n\n🤝 <b>Aapki VIP Site Visit already confirm hai!</b> Hamare senior sales executive direct site location par aapse milenge aur saari details personally physically verify karwayenge.`;
      } else {
        bridgeCta =
          lang === "GUJLISH"
            ? `\n\n👉 <b>Actual space, layout ane quality live jova mate</b>, shu ame <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b> tamari <b>VIP Site Visit 🚗</b> schedule karie?`
            : lang === "ENGLISH"
            ? `\n\n👉 <b>To experience the actual space, layout, and finish in person</b>, would you like to schedule a <b>VIP Site Visit 🚗</b> for <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
            : `\n\n👉 <b>Actual space, layout aur quality physically dekhne ke liye</b>, kya hum <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b> aapki <b>VIP Site Visit 🚗</b> schedule karein?`;
      }

      // Check Category Flags (Zero-Regex AI Topic Mapping with Fallback)
      const topic = aiAnalysis.faq_topic;
      const isAmenities = topic === "AMENITIES" || /\b(lift|elevator|parking|carpet|amenit|suvidha)\b/i.test(lower);
      const isRera = topic === "RERA" || /\b(rera|clear\s*title|approval|vmc|vuda)\b/i.test(lower);
      const isLoan = topic === "LOAN" || /\b(loan|emi|sbi|hdfc|icici|interest)\b/i.test(lower);
      const isPossession = topic === "POSSESSION" || /\b(possession|ready\s*to\s*move|under\s*construction)\b/i.test(lower);
      const isLocation = topic === "LANDMARKS" || /\b(station|highway|airport|hospital|school|mall|distance)\b/i.test(lower);
      const isDiscount = topic === "DISCOUNT" || aiAnalysis.intent === "PRICE_NEGOTIATION" || /\b(discount|negotiat|kam\s*hoga|best\s*price)\b/i.test(lower);
      const isBrokerage = topic === "BROKERAGE" || /\b(brokerage|commission|dalali|zero\s*brokerage)\b/i.test(lower);

      const nameStr = senderName ? (lang === "GUJLISH" ? `<b>${senderName} bhai</b>` : `<b>${senderName} ji</b>`) : (lang === "GUJLISH" ? "Mitra" : "ji");

      if (isDiscount) {
        // Price Negotiation: Alert sales executive & offer token spot discount
        await dispatchSalesAlert(activeTenantId, "NEGOTIATION_REQUEST", lead, {
          property: prop,
          userText: messageText,
        });

        replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}! <b>${projName}</b> nu pricing direct developer approved pricing chhe. Serious buyers mate developer taraf thi <b>exclusive token booking discount ane flexible payment plan</b> direct face-to-face site meeting ma finalize thai shake chhe. 💰${bridgeCta}`
            : lang === "ENGLISH"
            ? `Hello ${nameStr}! The pricing for <b>${projName}</b> reflects direct builder rates. For serious buyers, exclusive <b>token spot discounts and customized payment schedules</b> are finalized face-to-face directly with the developer during the site visit. 💰${bridgeCta}`
            : `Ji ${nameStr}! <b>${projName}</b> ki pricing direct developer approved base rate hai. Serious buyers ke liye developer side se <b>exclusive spot token discount aur flexible payment slabs</b> direct face-to-face site visit par finalize ho sakte hain. 💰${bridgeCta}`;
      } else if (isBrokerage) {
        // Brokerage Inquiry: 0% Brokerage reassurance
        replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}! ${agencyName} par <b>0% Brokerage (Zero Commission)</b> chhe! 🎉\nTame direct builder pricing ane 100% transparent paperwork access karo chho. Tamara thi koi pan extra brokerage charge levama aavshe nahi.${bridgeCta}`
            : lang === "ENGLISH"
            ? `Hello ${nameStr}! ${agencyName} offers <b>0% Brokerage (Zero Commission)</b> on all direct builder bookings! 🎉\nYou get direct developer pricing and verified paperwork with absolutely zero advisory charges.${bridgeCta}`
            : `Ji ${nameStr}! ${agencyName} par <b>0% Brokerage (Zero Commission)</b> hai! 🎉\nAapko direct builder pricing aur 100% verified transparent paperwork milta hai bina kisi hidden ya extra brokerage charges ke.${bridgeCta}`;
      } else if (isLoan) {
        // Bank Loan Inquiry: Pre-approved banks & rates
        replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}! <b>${projName}</b> 100% approved project chhe ane <b>SBI, HDFC, ICICI, Bank of Baroda</b> jevi top nationalized ane private banks thi pre-approved chhe! 🏦\n\n• 💰 <b>Starting Rate:</b> 8.4% p.a.\n• 📑 <b>Eligibility:</b> Up to 80%-90% funding support\n• 🤝 <b>Doorstep Assistance:</b> Amari in-house banking team tamara mate loan documentation manage karshe.${bridgeCta}`
            : lang === "ENGLISH"
            ? `Hello ${nameStr}! <b>${projName}</b> is pre-approved by all leading banks including <b>SBI, HDFC, ICICI, and Bank of Baroda</b>! 🏦\n\n• 💰 <b>Starting Interest Rate:</b> 8.4% p.a.\n• 📑 <b>Loan Quantum:</b> Up to 80%-90% funding assistance\n• 🤝 <b>Doorstep Documentation:</b> Our dedicated banking associates coordinate paperwork end-to-end.${bridgeCta}`
            : `Ji ${nameStr}! <b>${projName}</b> sabhi leading banks (jaise <b>SBI, HDFC, ICICI, Bank of Baroda</b>) se pre-approved project hai! 🏦\n\n• 💰 <b>Starting Interest Rate:</b> 8.4% p.a.\n• 📑 <b>Funding:</b> 80% se 90% tak loan approval assistance\n• 🤝 <b>Doorstep Support:</b> Hamari banking team aapke liye loan process aur documentation coordinate karegi.${bridgeCta}`;
      } else if (isRera) {
        // RERA & Legality: RERA number & clear title
        const reraNo = prop?.rera_number || "Verified RERA Registered Project";
        replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}! <b>${projName}</b> 100% RERA Registered ane Clear Title project chhe! 📜✅\n\n• 🏛️ <b>RERA Registration:</b> <code>${reraNo}</code>\n• ⚖️ <b>Clear Title:</b> All legal approvals, NA permissions ane sanctioned plans complete chhe.${bridgeCta}`
            : lang === "ENGLISH"
            ? `Hello ${nameStr}! <b>${projName}</b> is a 100% RERA-registered and clear title property! 📜✅\n\n• 🏛️ <b>RERA Registration:</b> <code>${reraNo}</code>\n• ⚖️ <b>Clear Title:</b> Fully sanctioned layout, NA permissions, and verified legal clearances.${bridgeCta}`
            : `Ji ${nameStr}! <b>${projName}</b> 100% RERA Registered aur Clear Title project hai! 📜✅\n\n• 🏛️ <b>RERA Registration:</b> <code>${reraNo}</code>\n• ⚖️ <b>Clear Title:</b> Sabhi legal approvals, NA permissions aur sanctioned plans verified hain.${bridgeCta}`;
      } else if (isPossession) {
        // Possession & Timeline
        const possStatus = prop?.possession_status === "READY_TO_MOVE" ? "Ready to Move (Immediate Handover)" : (prop?.possession_status || "Ready to Move");
        replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}! <b>${projName}</b> (${projLoc}) ni current status <b>${possStatus}</b> chhe. 🔑\nTame token booking ane registration pachhi direct possession lai shako chho.${bridgeCta}`
            : lang === "ENGLISH"
            ? `Hello ${nameStr}! <b>${projName}</b> in ${projLoc} is currently <b>${possStatus}</b>. 🔑\nYou can take immediate possession upon registration and token allotment.${bridgeCta}`
            : `Ji ${nameStr}! <b>${projName}</b> (${projLoc}) ka current status <b>${possStatus}</b> hai. 🔑\nAap token booking aur registration formalities ke baad direct possession le sakte hain.${bridgeCta}`;
      } else if (isLocation) {
        // Location & Connectivity
        const landmarksStr = Array.isArray(prop?.landmarks) && prop.landmarks.length > 0 ? prop.landmarks.join(", ") : "Prime connectivity hub";
        const mapUrl = prop?.map_url || "https://maps.google.com";
        replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}! <b>${projName}</b> ${projLoc} na ekdam prime location par sthit chhe! 📍\n\n• 🚗 <b>Key Landmarks:</b> ${landmarksStr}\n• 🗺️ <b>Location Map:</b> <a href="${mapUrl}">Google Maps Link</a>${bridgeCta}`
            : lang === "ENGLISH"
            ? `Hello ${nameStr}! <b>${projName}</b> is situated at a prime location in ${projLoc}! 📍\n\n• 🚗 <b>Nearby Landmarks:</b> ${landmarksStr}\n• 🗺️ <b>Location Map:</b> <a href="${mapUrl}">Google Maps Link</a>${bridgeCta}`
            : `Ji ${nameStr}! <b>${projName}</b> ${projLoc} ki ekdam prime location par sthit hai! 📍\n\n• 🚗 <b>Key Landmarks:</b> ${landmarksStr}\n• 🗺️ <b>Location Map:</b> <a href="${mapUrl}">Google Maps Link</a>${bridgeCta}`;
      } else {
        // Amenities & Specs (Default)
        const hasLift = Array.isArray(prop?.amenities) ? prop.amenities.some((a: string) => /lift/i.test(a)) : true;
        const hasParking = Array.isArray(prop?.amenities) ? prop.amenities.some((a: string) => /parking/i.test(a)) : true;
        const carpet = prop?.carpet_area_sqft ? `${prop.carpet_area_sqft} sq.ft` : "Spacious carpet layout";
        const furn = prop?.furnished_status || "Premium specifications";
        const liftText = hasLift ? "High-Speed Elevators / Lifts available 🛗" : "Elevator facility in tower";
        const parkText = hasParking ? "Reserved Car & Two-Wheeler Parking 🚗" : "Dedicated parking space";

        replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}! <b>${projName}</b> (${projLoc}) ni key specifications aa mujab chhe:\n\n• 🛗 <b>Lift:</b> ${liftText}\n• 🚗 <b>Parking:</b> ${parkText}\n• 📏 <b>Carpet Area:</b> ${carpet}\n• 🛋️ <b>Furnishing:</b> ${furn}${bridgeCta}`
            : lang === "ENGLISH"
            ? `Hello ${nameStr}! Here are the verified specifications for <b>${projName}</b> (${projLoc}):\n\n• 🛗 <b>Lift:</b> ${liftText}\n• 🚗 <b>Parking:</b> ${parkText}\n• 📏 <b>Carpet Area:</b> ${carpet}\n• 🛋️ <b>Furnishing:</b> ${furn}${bridgeCta}`
            : `Ji ${nameStr}! <b>${projName}</b> (${projLoc}) ki verified specifications ye hain:\n\n• 🛗 <b>Lift:</b> ${liftText}\n• 🚗 <b>Parking:</b> ${parkText}\n• 📏 <b>Carpet Area:</b> ${carpet}\n• 🛋️ <b>Furnishing:</b> ${furn}${bridgeCta}`;
      }
    }

    // =========================================================================
    // 10. SEQUENTIAL 6-FIELD QUALIFICATION CASCADE (Workflow 1: iRqYxBAeMGIduXRM)
    // =========================================================================
    else {
      // 1. Extract values from current message (with AI analysis fallback)
      let propType = parsePropertyTypeFromText(messageText);
      if (!propType && aiAnalysis?.property_type) {
        propType = String(aiAnalysis.property_type);
      }
      let requirement = parseRequirementFromText(messageText);
      if (!requirement && (aiAnalysis?.transaction_type || aiAnalysis?.requirement)) {
        requirement = String(aiAnalysis.transaction_type || aiAnalysis.requirement);
      }
      let purpose = parsePurposeFromText(messageText);
      if (!purpose && aiAnalysis?.purpose) {
        purpose = String(aiAnalysis.purpose);
      }
      let budget = parseBudgetFromText(messageText);
      if (!budget && aiAnalysis?.price_or_budget) {
        budget = Number(aiAnalysis.price_or_budget) || parseBudgetFromText(String(aiAnalysis.price_or_budget));
      } else if (!budget && aiAnalysis?.budget_str) {
        budget = parseBudgetFromText(aiAnalysis.budget_str);
      }
      let timeline = parseTimelineFromText(messageText);
      if (!timeline && aiAnalysis?.timeline) {
        timeline = String(aiAnalysis.timeline);
      }

      // If budget is >= 15 Lakhs and requirement was not explicitly mentioned, infer BUY
      if (!requirement && budget >= 1500000) {
        requirement = "BUY";
      }

      // Location extraction: check against multi-lingual dictionary, inventory locations, landmarks
      const { data: allTenantInventory } = await supabase
        .from("inventory")
        .select("location, landmarks, project_name")
        .eq("client_id", activeTenantId)
        .eq("status", "AVAILABLE");

      const matchedLocs = extractLocationsFromText(messageText, allTenantInventory || []);
      let location = matchedLocs.length > 0 ? matchedLocs.join(", ") : extractLocationFromText(messageText, allTenantInventory || []);
      if (!location && aiAnalysis?.location) {
        location = String(aiAnalysis.location);
      }

      // Flexible location detection (e.g. "koi bhi", "location koi bhi chalegi", "kahi bhi chalega", "any location", "gamete location")
      const isFlexibleLoc =
        Boolean(aiAnalysis?.is_flexible_location) ||
        /(?:^|\b)(?:koi\s*bhi|kahi\s*bhi|kahi\s*pan|koi\s*pan|gamete|any\s*location|any\s*area|anywhere|all\s*over|no\s*preference|flexible|kuch\s*bhi|koi\s*fix\s*nathi|koi\s*fix\s*nahi|chalegi|chalega|chalse)\b/i.test(lower);

      if (!location && isFlexibleLoc) {
        location = "FLEXIBLE";
      }

      // If user is specifically answering location step and gave a valid locality name (guarded against false selection)
      if (
        !location &&
        !NON_LOCATION_BLACKLIST.test(messageText) &&
        lead?.property_type &&
        !lead?.location &&
        !budget &&
        !propType &&
        !requirement &&
        messageText.trim().length <= 35 &&
        !/(hi|hello|hey|namaste|kem cho|kya|kyu|kaise|rates|bhav|discount|call|phone|baat)/i.test(messageText)
      ) {
        location = messageText.trim();
      }

      // If this is a residential property and purpose was not specified, reset any stale commercial "BUSINESS" purpose to "SELF_USE"
      const activeType = propType || lead?.property_type || "";
      const isResidential = /(flat|villa|bhk|bungalow|penthouse|apartment|studio)/i.test(activeType);
      if (isResidential && (!purpose && lead?.purpose === "BUSINESS")) {
        purpose = "SELF_USE";
      }

      // Commercial renting or leasing is inherently for business purposes
      const combinedType = (propType || lead?.property_type || "").toLowerCase();
      const combinedReq = (requirement || lead?.requirement || "").toUpperCase();
      if (!purpose && !lead?.purpose && (combinedReq === "RENT" || combinedReq === "LEASE") &&
          /(commercial|office|shop|showroom|warehouse|godown|co-working|coworking|industrial)/i.test(combinedType)) {
        purpose = "BUSINESS";
      }

      // Detect if user has changed their core property search criteria (new property type, new location, or new budget)
      const oldCat = getPropertyCategoryGroup(lead?.property_type);
      const newCat = getPropertyCategoryGroup(propType);
      const isCategoryChanged = Boolean(propType && oldCat !== "UNKNOWN" && newCat !== "UNKNOWN" && oldCat !== newCat);
      const isNewPropTypeGiven = Boolean(propType && propType !== lead?.property_type);
      const isNewLocationGiven = Boolean(location && location !== lead?.location);

      const hasNewSearchIntent = isNewPropTypeGiven ||
                                 isNewLocationGiven ||
                                 Boolean(budget && Math.abs(budget - Number(lead?.budget || 0)) > 1000) ||
                                 isCategoryChanged ||
                                 aiAnalysis.intent === "CHANGE_CRITERIA" ||
                                 /(nayi\s*requirement|navi\s*requirement|nayi\s*property|navi\s*property|naya\s*property|naya\s*search|nayi\s*search|navi\s*search|nava\s*criteria|naya\s*criteria|change\s*criteria|criteria\s*badal|fresh\s*search|fresh\s*requirement|start\s*fresh|reset\s*criteria|naya\s*dekhna|nayi\s*dekhni|nayi\s*chahiye|navi\s*joiye)/i.test(lower);

      // Active Booked Visit Safeguard Circuit Breaker:
      // If the lead already has an active booked site visit and did not explicitly initiate a new property search,
      // do NOT wipe or fall through to qualifying/options sending! Anchor back to their existing booked visit.
      if ((lead.site_visit_booked || lead.state === "SITE_VISIT_BOOKED" || lead.state === "VISIT_BOOKED") && !hasNewSearchIntent) {
        let bookedPropName = "Project";
        let bookedLocation = "";
        const targetPropId = lead.selected_property_id || (Array.isArray(lead.last_option_ids) ? lead.last_option_ids[0] : null);
        if (targetPropId) {
          const { data: bp } = await supabase.from("inventory").select("project_name, location").eq("property_id", targetPropId).maybeSingle();
          if (bp?.project_name) {
            bookedPropName = bp.project_name;
            bookedLocation = bp.location ? ` (${bp.location})` : "";
          }
        }
        const scheduledTime = lead.site_visit_at || lead.site_visit_datetime;
        const formattedTime = scheduledTime
          ? new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
          : "Scheduled Time";

        replyText =
          lang === "GUJLISH"
            ? `Tamari VIP Site Visit already booked chhe <b>${senderName ? `${senderName} bhai` : "Mitra"}</b>! 🚗\n🏢 <b>Project:</b> ${bookedPropName}${bookedLocation}\n⏰ <b>Time:</b> ${formattedTime}\n\n🤝 <b>Site par maliye chiye!</b> Shu tamne timing reschedule karvo chhe ke koi biji property jova mango chho?`
            : lang === "ENGLISH"
            ? `Your VIP Site Visit is already confirmed, <b>${senderName}</b>! 🚗\n🏢 <b>Project:</b> ${bookedPropName}${bookedLocation}\n⏰ <b>Time:</b> ${formattedTime}\n\n🤝 <b>See you at the site!</b> Would you like to reschedule the timing or explore a different property?`
            : `Aapki VIP Site Visit already booked hai <b>${senderName ? `${senderName} ji` : "ji"}</b>! 🚗\n🏢 <b>Project:</b> ${bookedPropName}${bookedLocation}\n⏰ <b>Time:</b> ${formattedTime}\n\n🤝 <b>Milte hain site par!</b> Kya aapko timing reschedule karna hai ya koi aur property dekhna chahte hain?`;

        nextState = lead.state;
      } else {
        // 2. Persist newly extracted fields into leads table
        const leadUpdates: any = { state: "QUALIFYING" };
        if (propType) leadUpdates.property_type = propType;
        if (requirement) leadUpdates.requirement = requirement;
        if (purpose) leadUpdates.purpose = purpose;
        if (location) leadUpdates.location = location;
        if (budget) leadUpdates.budget = budget;
        if (timeline) leadUpdates.timeline = timeline;

        if (hasNewSearchIntent || isCategoryChanged || isNewPropTypeGiven || isNewLocationGiven) {
          leadUpdates.selected_property_id = null;
          leadUpdates.last_option_ids = null;
          leadUpdates.site_visit_booked = false;
          leadUpdates.site_visit_datetime = null;
          leadUpdates.site_visit_at = null;

          // If category changed or user switched property type without giving new budget/requirement,
          // clear stale residual values!
          if (isCategoryChanged || isNewPropTypeGiven) {
            if (!requirement) leadUpdates.requirement = null;
            if (!budget) leadUpdates.budget = null;
            if (!timeline) leadUpdates.timeline = null;
            if (!purpose) {
              leadUpdates.purpose = (newCat === "COMMERCIAL" || propType?.toLowerCase().includes("office") || propType?.toLowerCase().includes("shop")) ? "BUSINESS" : "SELF_USE";
            }
          }
        }

        // If user mentions a property type or location but didn't specify requirement/budget in this message,
        // treat requirement and budget as unconfirmed so residual values don't block inventory matching!
        if (propType && !requirement && (isCategoryChanged || isNewPropTypeGiven || (lead?.state === "OPTIONS_SENT" && !lead?.selected_property_id))) {
          leadUpdates.requirement = null;
        }
        if (propType && !budget && (isCategoryChanged || isNewPropTypeGiven || (lead?.state === "OPTIONS_SENT" && !lead?.selected_property_id))) {
          leadUpdates.budget = null;
        }

        // If user did NOT supply a budget in this message, but switched requirement between BUY and RENT,
        // clear the prior stale budget if it was incompatible:
        if (!budget) {
          if (requirement === "BUY" && Number(lead?.budget || 0) > 0 && Number(lead?.budget || 0) < 500000) {
            leadUpdates.budget = null;
            leadUpdates.selected_property_id = null;
            leadUpdates.last_option_ids = null;
          }
          if ((requirement === "RENT" || requirement === "LEASE") && Number(lead?.budget || 0) >= 500000) {
            leadUpdates.budget = null;
            leadUpdates.selected_property_id = null;
            leadUpdates.last_option_ids = null;
          }
        }

        await supabase.from("leads").update(leadUpdates).eq("id", lead.id);

        // 3. Fetch latest refreshed state of lead
        const { data: currentLead } = await supabase.from("leads").select("*").eq("id", lead.id).single();

        // =========================================================================
        // 4. Strict 6-Field Missing Cascade in Sequential Order:
        // 1. property_type -> 2. requirement -> 3. purpose -> 4. location -> 5. budget -> 6. timeline
        // If any essential qualification field is missing, ask exactly ONE crisp question.
        // Never show inventory before budget is qualified!
        // =========================================================================
        let missingField: string | null = null;
        if (!currentLead?.property_type) {
          missingField = "PROPERTY_TYPE";
        } else if (!currentLead?.requirement) {
          missingField = "REQUIREMENT";
        } else if (!currentLead?.purpose) {
          // Auto-default purpose for residential and commercial to reduce friction!
          const isRes = /(flat|villa|bhk|bungalow|penthouse|apartment|studio)/i.test(String(currentLead.property_type || ""));
          const defPurpose = isRes ? "SELF_USE" : "BUSINESS";
          await supabase.from("leads").update({ purpose: defPurpose }).eq("id", lead.id);
          currentLead.purpose = defPurpose;
        }

        if (!missingField) {
          if (!currentLead?.location && currentLead?.purpose !== "INVESTMENT") {
            missingField = "LOCATION";
          } else if (!currentLead?.budget || Number(currentLead.budget) === 0) {
            missingField = "BUDGET";
          }
        }

          // IF ANY ESSENTIAL FIELD IS MISSING, ASK AT A TIME EXACTLY ONE CRISP QUESTION (2 lines max!)
          if (missingField !== null) {
            nextState = "QUALIFYING";

            const propTypeStr = String(currentLead.property_type || "").toLowerCase();
            const leadReqStr = String(currentLead.requirement || "").toLowerCase();
            const isComm = /(commercial|shop|office|showroom|warehouse|godown|industrial|shed|space)/i.test(propTypeStr);
            const isRentOrLease = leadReqStr.includes("rent") || leadReqStr.includes("lease");

            if (missingField === "PROPERTY_TYPE") {
              replyText =
                lang === "GUJLISH"
                  ? `Tame kaya type ni property shodhva mango chho — <b>2/3 BHK Flat</b>, <b>Villa</b> ke <b>Commercial Shop/Office</b>? 🏡`
                  : lang === "ENGLISH"
                  ? `What type of property are you looking for — <b>2/3 BHK Flat</b>, <b>Villa</b>, or <b>Commercial Shop/Office</b>? 🏡`
                  : `Aap kis type ki property dekh rahe hain — <b>2/3 BHK Flat</b>, <b>Villa</b> ya <b>Commercial Shop/Office</b>? 🏡`;
            } else if (missingField === "REQUIREMENT") {
              if (isComm) {
                replyText =
                  lang === "GUJLISH"
                    ? `Commercial space <b>Buy</b> 💼 karvo chhe ke <b>Rent / Lease</b> 🔑 par joiye chhe?`
                    : lang === "ENGLISH"
                    ? `Are you looking to <b>Buy</b> 💼 or <b>Rent/Lease</b> 🔑 commercial space?`
                    : `Commercial space <b>Buy</b> 💼 karna chahte hain ya <b>Rent / Lease</b> 🔑 par chahiye?`;
              } else {
                replyText =
                  lang === "GUJLISH"
                    ? `Tame property <b>Buy (Kharidva)</b> 🏠 mango chho ke <b>Rent</b> 🔑 par joiye chhe?`
                    : lang === "ENGLISH"
                    ? `Are you looking to <b>Buy</b> 🏠 or <b>Rent</b> 🔑 a property?`
                    : `Aap property <b>Buy (Kharidna)</b> 🏠 chahte hain ya <b>Rent</b> 🔑 par chahiye?`;
              }
            } else if (missingField === "LOCATION") {
              // Dynamic location suggestions from tenant's active inventory (City-Agnostic!)
              const { data: invLocs } = await supabase
                .from("inventory")
                .select("location, city")
                .eq("client_id", activeTenantId)
                .eq("status", "AVAILABLE")
                .limit(10);

              const uniqueLocs = Array.from(new Set((invLocs || []).map((i) => i.location).filter(Boolean))).slice(0, 3);
              const targetCity = invLocs?.[0]?.city || resolvedCity;
              const availStr = uniqueLocs.length > 0 ? ` (e.g. <b>${uniqueLocs.join(", ")}</b>)` : "";

              if (targetCity) {
                replyText =
                  lang === "GUJLISH"
                    ? `${targetCity} ma tamari preferred <b>location</b> kayi chhe 📍${availStr}?`
                    : lang === "ENGLISH"
                    ? `Which preferred <b>location</b> in ${targetCity} are you looking for 📍${availStr}?`
                    : `${targetCity} me aapki preferred <b>location</b> konsi hai 📍${availStr}?`;
              } else {
                replyText =
                  lang === "GUJLISH"
                    ? `Tamari preferred <b>location</b> kayi chhe 📍${availStr}?`
                    : lang === "ENGLISH"
                    ? `Which preferred <b>location</b> are you looking for 📍${availStr}?`
                    : `Aapki preferred <b>location</b> konsi hai 📍${availStr}?`;
              }
            } else if (missingField === "BUDGET") {
              if (isRentOrLease) {
                replyText =
                  lang === "GUJLISH"
                    ? `Tamari monthly rent budget range ketli raheshe 💰 (e.g. <b>₹15,000</b>, <b>₹25,000/mo</b>)?`
                    : lang === "ENGLISH"
                    ? `What is your monthly rent budget range 💰 (e.g. <b>₹15,000</b>, <b>₹25,000/mo</b>)?`
                    : `Monthly rent budget range kya rahegi 💰 (e.g. <b>₹15,000</b>, <b>₹25,000/mo</b>)?`;
              } else {
                replyText =
                  lang === "GUJLISH"
                    ? `Best options filter karva mate tamaro budget ketlo raheshe 💰 (e.g. <b>50 Lakhs</b>, <b>1 Cr</b>)?`
                    : lang === "ENGLISH"
                    ? `To filter the best options, what is your comfortable budget range 💰 (e.g. <b>50 Lakhs</b>, <b>1 Cr</b>)?`
                    : `Best options filter karne ke liye aapka comfortable budget range kya rahega 💰 (e.g. <b>50 Lakhs</b>, <b>1 Cr</b>)?`;
              }
            }
          } else {
        // =========================================================================
        // ALL 6 FIELDS QUALIFIED! Query Inventory with City-Agnostic Matching & Framing
        // =========================================================================
        nextState = "OPTIONS_SENT";
        await supabase.from("leads").update({ state: "OPTIONS_SENT" }).eq("id", lead.id);

        // Fetch all available inventory for this tenant
        const { data: allProps } = await supabase
          .from("inventory")
          .select("*")
          .eq("client_id", activeTenantId)
          .eq("status", "AVAILABLE");

        const availableInventory = allProps || [];
        const leadBudget = Number(currentLead.budget || 0);
        const maxBudget = leadBudget > 0 ? leadBudget * 1.15 : Infinity;

        const isLeadFlex = currentLead.location === "FLEXIBLE" || isFlexibleLoc;
        const requestedLocs = (currentLead.location || "")
          .split(/[,/]|(?:\s+ya\s+|\s+or\s+|\s+aur\s+|\s+ane\s+)/i)
          .map((s: string) => s.trim())
          .filter(Boolean);

        const displayLoc = isLeadFlex
          ? (resolvedCity || "aapke shehar")
          : (currentLead.location || resolvedCity || "aapke shehar");

        let properties: any[] = [];
        let proximityNote = "";

        if (isLeadFlex) {
          // Scenario 5: Flexible / City-Wide Search -> Multi-Corridor Variety (1 per distinct location, max 3)
          const flexMatches = availableInventory.filter((p: any) => {
            const price = Number(p.price || 0);
            if (leadBudget > 0 && price > maxBudget) return false;
            if (!matchesListingType(currentLead.requirement, p.listing_type, price)) return false;
            if (!matchesPropertyType(currentLead.property_type, p.property_category, p.configuration, p.project_name)) return false;
            return true;
          });

          // Sort by closeness to budget
          flexMatches.sort((a: any, b: any) => {
            if (leadBudget > 0) {
              return Math.abs(Number(a.price || 0) - leadBudget) - Math.abs(Number(b.price || 0) - leadBudget);
            }
            return 0;
          });

          const seenLocations = new Set<string>();
          for (const p of flexMatches) {
            const locKey = (p.location || "").toLowerCase().trim();
            if (locKey && !seenLocations.has(locKey)) {
              seenLocations.add(locKey);
              properties.push(p);
              if (properties.length >= 3) break;
            }
          }

          // If fewer than 3 corridors found, fill remaining with other best matches
          if (properties.length < 3) {
            for (const p of flexMatches) {
              if (!properties.some((prop) => prop.property_id === p.property_id)) {
                properties.push(p);
                if (properties.length >= 3) break;
              }
            }
          }
        } else {
          // 1. Strict Filter: Category/Type + Listing Type + Budget + Location
          const strictMatches = availableInventory.filter((p: any) => {
            const price = Number(p.price || 0);
            if (leadBudget > 0 && price > maxBudget) return false;
            if (!matchesListingType(currentLead.requirement, p.listing_type, price)) return false;
            if (!matchesPropertyType(currentLead.property_type, p.property_category, p.configuration, p.project_name)) return false;

            // Check if matches any requested locality
            if (requestedLocs.length > 0) {
              const matchesAny = requestedLocs.some((reqLoc) => matchesLocation(reqLoc, p.location, p.landmarks));
              if (!matchesAny) return false;
            } else if (!matchesLocation(currentLead.location, p.location, p.landmarks)) {
              return false;
            }
            return true;
          });

          // Sort matches by proximity to user's budget
          strictMatches.sort((a: any, b: any) => {
            if (leadBudget > 0) {
              return Math.abs(Number(a.price || 0) - leadBudget) - Math.abs(Number(b.price || 0) - leadBudget);
            }
            return 0;
          });

          properties = strictMatches.slice(0, 3);
        }

        // =========================================================================
        // FALLBACK HIERARCHY (When properties.length === 0)
        // =========================================================================
        if (properties.length === 0) {
          const nameStr = senderName ? (lang === "GUJLISH" ? `<b>${senderName} bhai</b>, ` : `<b>${senderName} ji</b>, `) : "";

          // Check if properties exist in this location for this type with alternate listing type (e.g. RENT available when BUY asked)
          const alternateListings = availableInventory.filter((p: any) => {
            if (!isLeadFlex && !matchesLocation(currentLead.location, p.location, p.landmarks)) return false;
            if (!matchesPropertyType(currentLead.property_type, p.property_category, p.configuration, p.project_name)) return false;
            return true;
          });

          // Scenario 6: Price Reality Check (Location has same type, but budget is below starting price)
          const locSameTypeProps = availableInventory.filter((p: any) => {
            if (isLeadFlex) return false;
            if (!matchesLocation(currentLead.location, p.location, p.landmarks)) return false;
            if (!matchesPropertyType(currentLead.property_type, p.property_category, p.configuration, p.project_name)) return false;
            if (!matchesListingType(currentLead.requirement, p.listing_type, Number(p.price || 0))) return false;
            return true;
          });

          const minLocPrice = locSameTypeProps.length > 0 ? Math.min(...locSameTypeProps.map((p: any) => Number(p.price || 0))) : 0;
          const isLowBudgetReality = leadBudget > 0 && minLocPrice > 0 && leadBudget < minLocPrice * 0.85;

          if (isLowBudgetReality) {
            // Find where else in this tenant's inventory user's budget CAN afford this property type
            const affordableElsewhere = availableInventory.filter((p: any) => {
              if (matchesLocation(currentLead.location, p.location, p.landmarks)) return false;
              if (!matchesPropertyType(currentLead.property_type, p.property_category, p.configuration, p.project_name)) return false;
              if (!matchesListingType(currentLead.requirement, p.listing_type, Number(p.price || 0))) return false;
              if (leadBudget > 0 && Number(p.price || 0) > maxBudget) return false;
              return true;
            });

            const altLocs = Array.from(new Set(affordableElsewhere.map((p: any) => p.location).filter(Boolean))).slice(0, 3);

            await dispatchSalesAlert(activeTenantId, "NO_PROPERTY_MATCH", currentLead, {
              userText: messageText,
              hint: `Customer budget ₹${formatPriceShort(leadBudget)} is below ${displayLoc} starting rate of ₹${formatPriceShort(minLocPrice)}. Alternative affordable corridors: ${altLocs.join(', ') || 'None in DB'}.`
            });

            if (altLocs.length > 0) {
              replyText =
                lang === "GUJLISH"
                  ? `${nameStr}<b>${displayLoc}</b> ma <b>${currentLead.property_type}</b> usually <b>₹${formatPriceShort(minLocPrice)}+</b> thi start thay chhe. Lekin tamara <b>₹${formatPriceShort(leadBudget)} budget</b> ma <b>${altLocs.join(", ")}</b> ma best verified options available chhe! 🏡\n\nShu tame <b>${altLocs[0]}</b> na options jova mango chho?`
                  : lang === "ENGLISH"
                  ? `${nameStr}in <b>${displayLoc}</b>, <b>${currentLead.property_type}</b> options typically start from <b>₹${formatPriceShort(minLocPrice)}+</b>. However, within your comfortable budget of <b>₹${formatPriceShort(leadBudget)}</b>, excellent verified options are available in <b>${altLocs.join(", ")}</b>! 🏡\n\nWould you like to explore options in <b>${altLocs[0]}</b>?`
                  : `${nameStr}<b>${displayLoc}</b> me <b>${currentLead.property_type}</b> usually <b>₹${formatPriceShort(minLocPrice)}+</b> se start hoti hain. Lekin aapke <b>₹${formatPriceShort(leadBudget)} budget</b> me <b>${altLocs.join(", ")}</b> me best verified options available hain! 🏡\n\nKya aap <b>${altLocs[0]}</b> ke options dekhna chahenge?`;
            } else {
              replyText =
                lang === "GUJLISH"
                  ? `${nameStr}<b>${displayLoc}</b> ma <b>${currentLead.property_type}</b> usually <b>₹${formatPriceShort(minLocPrice)}+</b> thi start thay chhe. Amara senior sales executive tamara budget (₹${formatPriceShort(leadBudget)}) mujab specialized options arrange kari rahya chhe ane jaldi thi direct <b>call par connect karshe</b>. 📞`
                  : lang === "ENGLISH"
                  ? `${nameStr}in <b>${displayLoc}</b>, <b>${currentLead.property_type}</b> properties typically start from <b>₹${formatPriceShort(minLocPrice)}+</b>. Our senior sales executive is sourcing tailored options matching your budget (₹${formatPriceShort(leadBudget)}) and will <b>call you directly</b> shortly. 📞`
                  : `${nameStr}<b>${displayLoc}</b> me <b>${currentLead.property_type}</b> usually <b>₹${formatPriceShort(minLocPrice)}+</b> se start hoti hain. Hamare senior sales executive aapke budget (₹${formatPriceShort(leadBudget)}) ke mutabiq specialized options arrange kar rahe hain aur jaldi hi aapse direct <b>call par connect karenge</b>. 📞`;
            }
          } else if (!isLeadFlex && currentLead.location) {
            // Scenario 7: Locality Proximity Search (AI-driven nearest corridor)
            const distinctAvailableLocs = Array.from(new Set(
              availableInventory
                .filter((p: any) =>
                  matchesPropertyType(currentLead.property_type, p.property_category, p.configuration, p.project_name) &&
                  matchesListingType(currentLead.requirement, p.listing_type, Number(p.price || 0)) &&
                  (leadBudget <= 0 || Number(p.price || 0) <= maxBudget)
                )
                .map((p: any) => p.location)
                .filter(Boolean)
            ));

            let adjacentLoc: string | null = null;
            if (distinctAvailableLocs.length > 0) {
              adjacentLoc = await findAdjacentLocalityWithAI(currentLead.location, resolvedCity, distinctAvailableLocs);
            }

            if (adjacentLoc) {
              const adjMatches = availableInventory.filter((p: any) =>
                matchesLocation(adjacentLoc, p.location, p.landmarks) &&
                matchesPropertyType(currentLead.property_type, p.property_category, p.configuration, p.project_name) &&
                matchesListingType(currentLead.requirement, p.listing_type, Number(p.price || 0)) &&
                (leadBudget <= 0 || Number(p.price || 0) <= maxBudget)
              );

              if (adjMatches.length > 0) {
                properties = adjMatches.slice(0, 3);
                proximityNote =
                  lang === "GUJLISH"
                    ? `Tamara requested area <b>${currentLead.location}</b> ma filhal direct unit available nathi, pan 5-10 minute ni proximity ma <b>${adjacentLoc}</b> ma aa verified options available chhe:\n\n`
                    : lang === "ENGLISH"
                    ? `Currently, verified units in <b>${currentLead.location}</b> are occupied, but within 5-10 mins proximity in <b>${adjacentLoc}</b>, here are the best available options:\n\n`
                    : `Aapke requested area <b>${currentLead.location}</b> me abhi direct unit occupied hai, lekin pass hi 5-10 minute ki doori par <b>${adjacentLoc}</b> me ye best options available hain:\n\n`;
              }
            }
          }

          // If still no properties found after proximity check, check Cross-Listing (BUY vs RENT)
          if (properties.length === 0 && !isLowBudgetReality) {
            if (alternateListings.length > 0 && currentLead.requirement === "BUY") {
              const alt = alternateListings[0];
              const altPrice = `₹${Number(alt.price || 0).toLocaleString("en-IN")}/mo`;

              await dispatchSalesAlert(activeTenantId, "NO_PROPERTY_MATCH", currentLead, {
                userText: messageText,
                hint: `Customer wants to BUY ${currentLead.property_type} in ${displayLoc}. Only Rental available (${alt.project_name} at ${altPrice}). Source off-market sale or convert to rental.`
              });

              const altTypeDesc = alt.configuration ? `${alt.configuration} (${altPrice})` : `Rental Space (${altPrice})`;
              replyText =
                lang === "GUJLISH"
                  ? `${nameStr}<b>${displayLoc}</b> ma filhal <b>${alt.project_name}</b> ma verified <b>${altTypeDesc}</b> available chhe. Amara senior sales executive tamara mate exclusive <b>Purchase (Buy) options</b> arrange kari rahya chhe ane jaldi direct <b>call par connect karshe</b>. 📞`
                  : lang === "ENGLISH"
                  ? `${nameStr}in <b>${displayLoc}</b>, we currently have verified <b>${altTypeDesc}</b> at <b>${alt.project_name}</b>. Our senior sales team is sourcing exclusive <b>Purchase (Sale) options</b> for you and will <b>connect with you directly over a call</b>. 📞`
                  : `${nameStr}<b>${displayLoc}</b> me filhal <b>${alt.project_name}</b> me verified <b>${altTypeDesc}</b> available hai. Hamare senior sales executive aapke liye exclusive <b>Purchase (Buy) options</b> arrange kar rahe hain aur jaldi direct <b>call par connect karenge</b>. 📞`;
            } else if (alternateListings.length > 0 && (currentLead.requirement === "RENT" || currentLead.requirement === "LEASE")) {
              const alt = alternateListings[0];
              const altPrice = `₹${formatPriceShort(Number(alt.price || 0))}`;

              await dispatchSalesAlert(activeTenantId, "NO_PROPERTY_MATCH", currentLead, {
                userText: messageText,
                hint: `Customer wants to RENT in ${displayLoc}. Only Sale units available (${alt.project_name} at ${altPrice}). Source off-market rental.`
              });

              replyText =
                lang === "GUJLISH"
                  ? `${nameStr}<b>${displayLoc}</b> ma filhal <b>${alt.project_name}</b> ma sale options available chhe. Amara senior team rental options source kari rahi chhe ane jaldi thi direct <b>call par connect karshe</b>. 📞`
                  : lang === "ENGLISH"
                  ? `${nameStr}in <b>${displayLoc}</b>, we currently have sale options at <b>${alt.project_name}</b>. Our team is actively sourcing rental properties and will <b>connect with you directly over a call</b>. 📞`
                  : `${nameStr}<b>${displayLoc}</b> me filhal <b>${alt.project_name}</b> me sale units available hain. Hamari team rental options source kar rahi hai aur jaldi direct <b>call par connect karegi</b>. 📞`;
            } else {
              // Scenario 14: Hard Out of Stock
              await dispatchSalesAlert(activeTenantId, "NO_PROPERTY_MATCH", currentLead, {
                userText: messageText,
                hint: `No inventory in ${displayLoc} for ${currentLead.property_type || 'property'} (Budget: ₹${formatPriceShort(leadBudget)}). Source off-market.`
              });
              const pType = currentLead.property_type || "property";

              replyText =
                lang === "GUJLISH"
                  ? `${nameStr}tamari requirement (<b>${pType}</b> in <b>${displayLoc}</b>) mujab matching property mate amara senior sales executive specialized options arrange kari rahya chhe ane jaldi thi tamari sathe direct <b>call par connect karshe</b>. 📞`
                  : lang === "ENGLISH"
                  ? `${nameStr}our senior sales executives are sourcing specialized options matching your requirement (<b>${pType}</b> in <b>${displayLoc}</b>) and will <b>connect with you directly over a call</b> shortly. 📞`
                  : `${nameStr}aapki requirement (<b>${pType}</b> in <b>${displayLoc}</b>) ke mutabiq matching property ke liye hamare senior sales executive specialized options arrange kar rahe hain aur jaldi hi aapse direct <b>call par connect karenge</b>. 📞`;
            }
          }
        }

        if (properties.length > 0) {
          // Store option IDs on lead
          const optionIds = properties.map((p) => p.property_id);
          await supabase
            .from("leads")
            .update({
              last_option_ids: optionIds,
              selected_property_id: properties[0].property_id,
            })
            .eq("id", lead.id);

          // EXACT N8N WORKFLOW PROPERTY CARDS & QUESTION TEMPLATE
          const optionsCards = properties.map((p, idx) => formatN8nPropertyCard(p, idx, false)).join("\n\n---\n\n");

          // Trailer question (n8n Response Context - Properties genericQuestion)
          const trailerQuestion =
            properties.length === 1
              ? (lang === "GUJLISH"
                  ? `👉 <i>Tame <b>${properties[0].project_name}</b> ni <b>VIP Site Visit 🚗</b> mate kayo time anukool ganasho — <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?</i>`
                  : lang === "ENGLISH"
                  ? `👉 <i>When would you like to schedule a <b>VIP Site Visit 🚗</b> for <b>${properties[0].project_name}</b> — <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?</i>`
                  : `👉 <i>Aap <b>${properties[0].project_name}</b> ki <b>VIP Site Visit 🚗</b> ke liye kaunsa slot prefer karenge — <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?</i>`)
              : (lang === "GUJLISH"
                  ? `👉 <i>Tame aamathi kayi property ni <b>VIP Site Visit 🚗</b> schedule karva mango chho — <b>Option 1</b>, <b>Option 2</b> ke <b>Option 3</b>?</i>`
                  : lang === "ENGLISH"
                  ? `👉 <i>Which of these properties would you like to schedule a <b>VIP Site Visit 🚗</b> for — <b>Option 1</b>, <b>Option 2</b>, or <b>Option 3</b>?</i>`
                  : `👉 <i>Aap inme se kis property ki <b>VIP Site Visit 🚗</b> schedule karna chahenge — <b>Option 1</b>, <b>Option 2</b> ya <b>Option 3</b>?</i>`);

          const budgetStr = leadBudget > 0 ? `₹${formatPriceShort(leadBudget)} budget` : "aapke budget";
          const heading =
            lang === "GUJLISH"
              ? `🌟 <b>Tamari Requirement Mujab Top Options</b>\n\n${senderName ? `<b>${senderName} bhai</b>, ` : ""}${proximityNote}tamara <b>${budgetStr}</b> ane <b>${currentLead.property_type || "property"} requirement</b> mujab aa best options chhe:`
              : lang === "ENGLISH"
              ? `🌟 <b>Top Options Matching Your Requirement</b>\n\n${senderName ? `<b>${senderName}</b>, ` : ""}${proximityNote}based on your budget of <b>${budgetStr}</b> and <b>${currentLead.property_type || "property"} requirement</b>, here are the best options:`
              : `🌟 <b>Aapke Requirement Ke Top Options</b>\n\n${senderName ? `<b>${senderName} ji</b>, ` : ""}${proximityNote}aapke <b>${budgetStr}</b> aur <b>${currentLead.property_type || "property"} requirement</b> ke hisab se ye best options hain:`;

          replyText = `${heading}\n\n${optionsCards}\n\n${trailerQuestion}`;
        }
      }
      }
    }

    // =========================================================================
    // 11. OUTBOUND DISPATCH (Only if not silent!)
    // =========================================================================
    if (!isSilent && replyText) {
      if (platform === "TELEGRAM") {
        await sendTelegramMessage(botToken, senderId, replyText);
      } else if (platform === "WHATSAPP" && phoneNumberId) {
        const waAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
        await sendWhatsAppMessage(phoneNumberId, waAccessToken, senderId, replyText);
      }
    }

    // Audit log
    await supabase.from("lead_events").insert({
      client_id: activeTenantId,
      lead_id: senderId,
      event_type: "MESSAGE_PROCESSED",
      payload: {
        platform,
        userText: messageText,
        replySent: isSilent ? "[SILENT - 0 MSG DISPATCHED]" : replyText.slice(0, 500),
        state: nextState,
        ai_analysis: aiAnalysis,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        platform,
        lead_id: senderId,
        language: lang,
        state: nextState,
        silent: isSilent,
        reply_sent: isSilent ? null : replyText,
        ai_analysis: aiAnalysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Edge Function Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
