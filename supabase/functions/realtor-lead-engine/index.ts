// JSR import removed to prevent bundler 10s fetch timeout
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

function formatMapHyperlink(mapUrl: string | undefined | null, label = "View on Google Maps"): string {
  if (!mapUrl || !mapUrl.trim()) return "";
  return `📍 <a href="${mapUrl.trim()}">${label}</a>`;
}

function formatBrochureHyperlink(brochureUrl: string | undefined | null, label = "Download Official Brochure"): string {
  if (!brochureUrl || !brochureUrl.trim()) return "";
  return `📄 <a href="${brochureUrl.trim()}">${label}</a>`;
}

function formatPriceShort(priceNum: number): string {
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
    // 1. Role-Based Routing & Auto-Assignment Matrix
    let targetExecutive: any = null;

    // Rule A: NEW_OWNER_LISTING -> Route strictly to Admin (role = 'admin') for document verification & inventory approval
    if (alertType === "NEW_OWNER_LISTING") {
      const { data: adminExec } = await supabase
        .from("executives")
        .select("*")
        .eq("client_id", tenantId)
        .ilike("role", "admin")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      targetExecutive = adminExec;

      // Auto-assign owner lead directly to Admin in DB
      if (adminExec && lead?.id && lead.assigned_executive_id !== adminExec.id) {
        await supabase.from("leads").update({ assigned_executive_id: adminExec.id }).eq("id", lead.id);
        lead.assigned_executive_id = adminExec.id;
      }
    }
    // Rule B: NO_PROPERTY_MATCH or UNASSIGNED_LEAD -> Route strictly to Manager (role = 'manager') for off-market triage
    else if (alertType === "NO_PROPERTY_MATCH" || alertType === "UNASSIGNED_LEAD") {
      const { data: mgr } = await supabase
        .from("executives")
        .select("*")
        .eq("client_id", tenantId)
        .ilike("role", "manager")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      targetExecutive = mgr;

      // Assign to Manager for triage if unassigned
      if (mgr && lead?.id && !lead.assigned_executive_id) {
        await supabase.from("leads").update({ assigned_executive_id: mgr.id }).eq("id", lead.id);
        lead.assigned_executive_id = mgr.id;
      }
    }
    // Rule C: Specific buyer/tenant lead with assigned executive (e.g. Sales Specialist)
    else if (lead?.assigned_executive_id) {
      const { data: exec } = await supabase
        .from("executives")
        .select("*")
        .eq("id", lead.assigned_executive_id)
        .maybeSingle();
      targetExecutive = exec;
    }

    // Fallback 1: Route unassigned leads to Manager (role = 'manager')
    if (!targetExecutive) {
      const { data: mgr } = await supabase
        .from("executives")
        .select("*")
        .eq("client_id", tenantId)
        .ilike("role", "manager")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      targetExecutive = mgr;
      if (mgr && lead?.id && !lead.assigned_executive_id) {
        await supabase.from("leads").update({ assigned_executive_id: mgr.id }).eq("id", lead.id);
        lead.assigned_executive_id = mgr.id;
      }
    }

    // Fallback 2: Fallback to any active executive for this tenant
    if (!targetExecutive) {
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
      case "POST_VISIT_OBJECTION":
        badge = "⚡ POST-VISIT OBJECTION / CRITICAL FEEDBACK";
        pitchHint = extra.hint || "Customer ne visit ke baad specific concern share kiya (layout/approach/location). Do NOT restart qualification. Call customer within 10 mins: acknowledge concern with empathy, present alternative inventory matching criteria with better layout and approach road.";
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
      case "HIGH_VALUE_DUAL_ROLE":
        badge = "💎 HIGH-VALUE DUAL-ROLE CLIENT (BUYER + SELLER)";
        pitchHint = extra.hint || "High-value dual-intent client: Connect within 5 minutes. Prepare both listed property valuation/progress and exclusive high-ticket buyer inventory. Ideal for reinvestment / 1031 upgrade pitch.";
        break;
      case "NEW_PORTAL_LEAD":
        badge = "🔥 NEW PORTAL LEAD (WHATSAPP OUTREACH SENT)";
        pitchHint = extra.hint || "Portal inquiry converted to WhatsApp dialog. Lead is in SITE_VISIT_PROPOSED state. Keep sample keys ready.";
        break;
      case "UNASSIGNED_LEAD":
        badge = "⚠️ UNASSIGNED PORTAL INQUIRY (MISSING PHONE)";
        pitchHint = extra.hint || "Portal inquiry from portal received without mobile number. Check portal inbox or call/email client.";
        break;
    }

    // 3. Compose rich HTML alert for Sales / Acquisition Team
    const isOwnerAlert = alertType === "NEW_OWNER_LISTING";
    const isDualAlert = alertType === "HIGH_VALUE_DUAL_ROLE";
    const sub = extra.submission || {};
    const alertHtml = isDualAlert
      ? `
<b>${badge}</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Dual Client:</b> ${lead?.first_name || "Valued Client"}
📱 <b>Phone / ID:</b> <code>${lead?.phone || lead?.lead_id}</code>
🏡 <b>Buyer Preference:</b> ${lead?.property_type || "—"} | ${lead?.location || "Any Area"} | ₹${lead?.budget ? Number(lead.budget).toLocaleString("en-IN") : "—"}
${extra.scheduledAt ? `⏰ <b>Site Visit:</b> ${new Date(extra.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}\n` : ""}📋 <b>Seller Listing:</b> ${sub.configuration || ""} ${sub.property_type || "Property"} at ${sub.society_name || sub.project_name || "Society"} (Status: ${sub.status || "Under Review"})
💬 <b>User Request:</b> <i>"${extra.userText || "Requested Senior Advisor Call"}"</i>
━━━━━━━━━━━━━━━━━━━━
💡 <b>Executive Pitching Strategy:</b>
<i>${pitchHint}</i>
━━━━━━━━━━━━━━━━━━━━
👉 <i>Assigned to: ${targetExecutive?.name || "Senior Partner Desk"}</i>
`.trim()
      : isOwnerAlert
      ? `
<b>${badge}</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Owner:</b> ${lead?.first_name || sub.owner_name || "Property Owner"}
📱 <b>Phone / ID:</b> <code>${lead?.phone || lead?.lead_id}</code>
🏢 <b>Property:</b> ${sub.configuration || ""} ${sub.property_type || "Property"} in ${sub.society_name || sub.project_name || "Society"} (${sub.location || "Prime Location"})
📐 <b>Size:</b> ${sub.carpet_area_sqft ? `${sub.carpet_area_sqft} sq.ft Carpet` : "—"} | ${(sub.furnishing_status || "Standard").replace(/_/g, " ")}
💰 <b>Expected ${sub.transaction_type || "Price"}:</b> ${Number(sub.expected_price || sub.expected_rent || 0) > 0 ? `₹${Number(sub.expected_price || sub.expected_rent).toLocaleString("en-IN")}` : "Price on Request"}
🔑 <b>Possession:</b> ${(sub.possession_status || "Ready to Move").replace(/_/g, " ")}
💬 <b>User Message:</b> <i>"${extra.userText || "—"}"</i>
━━━━━━━━━━━━━━━━━━━━
💡 <b>Actionable Hint:</b>
<i>${pitchHint}</i>
━━━━━━━━━━━━━━━━━━━━
👉 <i>Assigned to: ${targetExecutive?.name || "Admin Desk"} (Role: ${targetExecutive?.role || "Admin"})</i>
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
👉 <i>Assigned to: ${targetExecutive?.name || "General Sales Desk"} (Role: ${targetExecutive?.role || "Executive"})</i>
`.trim();

    // 4. Resolve Telegram Chat ID (check numeric telegram_id only)
    let telegramChatId: string | null = null;
    const cleanTelId = (targetExecutive?.telegram_id || "").trim();

    if (/^-?\d+$/.test(cleanTelId)) {
      telegramChatId = cleanTelId;
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

// =========================================================================
// 3b. MULTI-PORTAL WEBHOOK INGESTION, NORMALIZER & AUTO-OUTREACH (Phase 7)
// =========================================================================
export interface NormalizedPortalLead {
  name: string;
  phone: string | null;
  email: string | null;
  source: string;
  projectName: string | null;
  propertyType: string | null;
  budget: number | null;
  location: string | null;
  userComments: string | null;
  rawPayload: any;
}

function sanitizePortalPhone(rawPhone: any): string | null {
  if (!rawPhone) return null;
  const str = String(rawPhone).trim();
  // Masked check: contains asterisks or 'x'
  if (str.includes("*") || /[a-wy-z]/i.test(str)) {
    return null;
  }
  let digits = str.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    // Check dummy repeats
    if (/^(\d)\1{9}$/.test(digits) || digits === "1234567890" || digits === "9876543210") return null;
    return digits;
  }
  if (digits.length > 10 && digits.length <= 13) {
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10) && !/^(\d)\1{9}$/.test(last10)) {
      return last10;
    }
  }
  return null;
}

function parsePortalBudget(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number" && !isNaN(val) && val > 0) return Math.round(val);
  const str = String(val).trim().toLowerCase();

  // Cr / Crore check
  const crMatch = str.match(/([\d.]+)\s*(?:cr|crore|crores)/i);
  if (crMatch) {
    const num = parseFloat(crMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 10000000);
  }
  // Lac / Lakh check
  const lacMatch = str.match(/([\d.]+)\s*(?:lakh|lakhs|lac|lacs|l)/i);
  if (lacMatch) {
    const num = parseFloat(lacMatch[1]);
    if (!isNaN(num) && num > 0) return Math.round(num * 100000);
  }
  // Plain number check with symbols stripped
  const cleaned = str.replace(/[^0-9.]/g, "");
  if (cleaned) {
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) return Math.round(num);
  }
  return null;
}

function parsePortalPropertyType(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s.includes("flat") || s.includes("apartment") || /\b\d\s*bhk\b/.test(s)) return "Flat";
  if (s.includes("villa") || s.includes("bungalow") || s.includes("row house") || s.includes("duplex")) return "Villa";
  if (s.includes("office") || s.includes("shop") || s.includes("commercial") || s.includes("showroom")) return "Commercial";
  if (s.includes("plot") || s.includes("land")) return "Plot";
  return String(raw).trim() || null;
}

function isPortalWebhook(url: URL, body: any): boolean {
  const sourceParam = (url.searchParams.get("source") || url.searchParams.get("provider") || "").toLowerCase().trim();
  const known = ["99acres", "housing", "magicbricks", "commonfloor", "facebook", "meta_leads", "olx", "custom", "portal"];
  if (sourceParam && known.some((k) => sourceParam.includes(k))) return true;

  // Protect Telegram & WhatsApp Cloud API user messages
  if (body?.update_id || body?.message?.chat?.id) return false;
  if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) return false;

  // Facebook Leadgen webhook
  if (body?.entry?.[0]?.changes?.[0]?.field === "leadgen" || body?.entry?.[0]?.changes?.[0]?.value?.leadgen_id || body?.leadgen_id) return true;

  // Portal signatures
  if (body?.LeadId || body?.leadDetails || (body?.ProjectName && (body?.Mobile || body?.custName))) return true;
  if (body?.customerName || body?.userComments || body?.mb_lead_id) return true;
  if (body?.lead_phone || (body?.lead_name && (body?.min_budget || body?.max_budget))) return true;
  if (body?.contact_number && (body?.budget_max || body?.project)) return true;
  if (body?.ad_id || (body?.buyer_name && body?.buyer_phone)) return true;
  if (body?.type === "portal_lead" || body?.action === "portal_lead" || body?.source) return true;

  return false;
}

function normalizePortalPayload(body: any, url: URL): NormalizedPortalLead {
  const sourceParam = (url.searchParams.get("source") || url.searchParams.get("provider") || "").toLowerCase().trim();

  // 1. 99acres
  if (sourceParam.includes("99acres") || body.LeadId || body.leadDetails || body.custName || (body.ProjectName && body.Mobile)) {
    const item = Array.isArray(body.leadDetails) && body.leadDetails.length > 0 ? body.leadDetails[0] : body;
    return {
      name: (item.custName || item.CustomerName || item.cust_name || item.name || body.custName || body.name || "Customer").trim(),
      phone: sanitizePortalPhone(item.Mobile || item.mobile || item.phone || item.Phone || body.Mobile || body.mobile),
      email: (item.email || item.Email || body.email || "").trim() || null,
      source: "99acres",
      projectName: (item.ProjectName || item.projectName || item.project_name || body.ProjectName || "").trim() || null,
      propertyType: parsePortalPropertyType(item.PropertyType || item.propType || body.PropertyType),
      budget: parsePortalBudget(item.budget || item.Budget || body.budget),
      location: (item.Location || item.city || item.Locality || body.Location || body.locality || "").trim() || null,
      userComments: (item.Query || item.userComments || item.Comments || body.Query || body.userComments || "").trim() || null,
      rawPayload: body,
    };
  }

  // 2. MagicBricks
  if (sourceParam.includes("magicbricks") || body.customerName || body.userComments || body.mb_lead_id) {
    return {
      name: (body.customerName || body.name || body.userName || "Customer").trim(),
      phone: sanitizePortalPhone(body.mobile || body.customerMobile || body.phone),
      email: (body.email || body.customerEmail || "").trim() || null,
      source: "MagicBricks",
      projectName: (body.projectName || body.project || body.society || "").trim() || null,
      propertyType: parsePortalPropertyType(body.propertyType || body.property_type),
      budget: parsePortalBudget(body.budget || body.price),
      location: (body.locality || body.location || body.city || "").trim() || null,
      userComments: (body.userComments || body.comments || body.requirement || "").trim() || null,
      rawPayload: body,
    };
  }

  // 3. Housing.com
  if (sourceParam.includes("housing") || body.lead_phone || (body.lead_name && (body.min_budget || body.max_budget))) {
    return {
      name: (body.lead_name || body.name || body.customer_name || "Customer").trim(),
      phone: sanitizePortalPhone(body.lead_phone || body.phone || body.mobile),
      email: (body.lead_email || body.email || "").trim() || null,
      source: "Housing.com",
      projectName: (body.project_name || body.projectName || body.project || "").trim() || null,
      propertyType: parsePortalPropertyType(body.property_type || body.propertyType),
      budget: parsePortalBudget(body.max_budget || body.budget || body.min_budget),
      location: (body.locality || body.location || body.city || "").trim() || null,
      userComments: (body.comments || body.message || body.lead_details || "").trim() || null,
      rawPayload: body,
    };
  }

  // 4. CommonFloor
  if (sourceParam.includes("commonfloor") || (body.contact_number && (body.budget_max || body.project))) {
    return {
      name: (body.name || body.contact_name || body.userName || "Customer").trim(),
      phone: sanitizePortalPhone(body.contact_number || body.phone || body.mobile),
      email: (body.email || body.contact_email || "").trim() || null,
      source: "CommonFloor",
      projectName: (body.project || body.project_name || body.listing_title || "").trim() || null,
      propertyType: parsePortalPropertyType(body.property_type || body.unit_type),
      budget: parsePortalBudget(body.budget_max || body.budget || body.budget_min),
      location: (body.city || body.locality || body.location || "").trim() || null,
      userComments: (body.comments || body.remarks || body.message || "").trim() || null,
      rawPayload: body,
    };
  }

  // 5. Facebook Lead Ads
  if (sourceParam.includes("facebook") || sourceParam.includes("meta_leads") || Array.isArray(body.field_data) || body.leadgen_id) {
    const fMap: Record<string, string> = {};
    if (Array.isArray(body.field_data)) {
      body.field_data.forEach((f: any) => {
        const k = (f.name || "").toLowerCase().trim();
        const v = Array.isArray(f.values) ? f.values[0] : f.value;
        if (k && v !== undefined && v !== null) fMap[k] = String(v);
      });
    }
    return {
      name: (fMap.full_name || fMap.name || fMap.first_name || body.name || "Customer").trim(),
      phone: sanitizePortalPhone(fMap.phone_number || fMap.phone || fMap.mobile_number || body.phone),
      email: (fMap.email || body.email || "").trim() || null,
      source: "Facebook",
      projectName: (fMap.project || fMap.project_name || fMap.property_name || body.project || body.projectName || "").trim() || null,
      propertyType: parsePortalPropertyType(fMap.property_type || fMap.type || body.propertyType),
      budget: parsePortalBudget(fMap.budget || fMap.price || body.budget),
      location: (fMap.city || fMap.location || body.location || "").trim() || null,
      userComments: (fMap.message || fMap.comments || body.message || "").trim() || null,
      rawPayload: body,
    };
  }

  // 6. OLX
  if (sourceParam.includes("olx") || body.ad_id || (body.buyer_name && body.buyer_phone)) {
    return {
      name: (body.buyer_name || body.name || "Customer").trim(),
      phone: sanitizePortalPhone(body.buyer_phone || body.phone),
      email: (body.buyer_email || body.email || "").trim() || null,
      source: "OLX",
      projectName: (body.ad_title || body.project || "").trim() || null,
      propertyType: parsePortalPropertyType(body.property_type),
      budget: parsePortalBudget(body.price || body.budget),
      location: (body.location || body.city || "").trim() || null,
      userComments: (body.message || body.comments || "").trim() || null,
      rawPayload: body,
    };
  }

  // 7. Custom / Fallback
  const detectedSource = sourceParam ? (sourceParam.charAt(0).toUpperCase() + sourceParam.slice(1)) : (body.source || "Custom");
  return {
    name: (body.name || body.fullName || body.lead_name || body.customer_name || "Customer").trim(),
    phone: sanitizePortalPhone(body.phone || body.mobile || body.contact || body.phone_number || body.contact_number),
    email: (body.email || body.mail || "").trim() || null,
    source: detectedSource,
    projectName: (body.project || body.projectName || body.project_name || body.property || "").trim() || null,
    propertyType: parsePortalPropertyType(body.propertyType || body.property_type || body.type),
    budget: parsePortalBudget(body.budget || body.price || body.max_budget),
    location: (body.location || body.locality || body.city || "").trim() || null,
    userComments: (body.message || body.comments || body.query || body.userComments || body.notes || "").trim() || null,
    rawPayload: body,
  };
}

// Auto-Matcher for Portal Leads (Task 2)
async function matchInventoryForPortalLead(
  tenantId: string,
  leadInquiry: NormalizedPortalLead
): Promise<any | null> {
  const { data: properties, error } = await supabase
    .from("inventory")
    .select("*")
    .eq("client_id", tenantId)
    .eq("status", "AVAILABLE");

  let propList = properties;
  if (error || !propList || propList.length === 0) {
    const { data: fallbackProps } = await supabase
      .from("inventory")
      .select("*")
      .eq("client_id", defaultTenantId)
      .eq("status", "AVAILABLE");
    if (!fallbackProps || fallbackProps.length === 0) return null;
    propList = fallbackProps;
  }

  // Match 1: Project Name (Fuzzy / Substring)
  if (leadInquiry.projectName && leadInquiry.projectName.trim()) {
    const qProject = leadInquiry.projectName.trim().toLowerCase();
    const projectMatch = propList.find((p: any) => {
      const pName = (p.project_name || "").toLowerCase();
      return pName.includes(qProject) || qProject.includes(pName);
    });
    if (projectMatch) return projectMatch;
  }

  // Match 2: Location + Configuration / Property Type
  if (leadInquiry.location || leadInquiry.propertyType) {
    const qLoc = (leadInquiry.location || "").toLowerCase().trim();
    const qType = (leadInquiry.propertyType || "").toLowerCase().trim();

    if (qLoc && qType) {
      const locAndType = propList.find((p: any) => {
        const pLoc = (p.location || "").toLowerCase();
        const pCity = (p.city || "").toLowerCase();
        const pCat = (p.property_category || "").toLowerCase();
        const pConf = (p.configuration || "").toLowerCase();
        const matchLoc = pLoc.includes(qLoc) || pCity.includes(qLoc) || qLoc.includes(pLoc);
        const matchType = pCat.includes(qType) || pConf.includes(qType) || qType.includes(pCat);
        return matchLoc && matchType;
      });
      if (locAndType) return locAndType;
    }

    if (qLoc) {
      const locMatch = propList.find((p: any) => {
        const pLoc = (p.location || "").toLowerCase();
        const pCity = (p.city || "").toLowerCase();
        return pLoc.includes(qLoc) || pCity.includes(qLoc) || qLoc.includes(pLoc);
      });
      if (locMatch) return locMatch;
    }

    if (qType) {
      const typeMatch = propList.find((p: any) => {
        const pCat = (p.property_category || "").toLowerCase();
        const pConf = (p.configuration || "").toLowerCase();
        return pCat.includes(qType) || pConf.includes(qType) || qType.includes(pCat);
      });
      if (typeMatch) return typeMatch;
    }
  }

  // Match 3: Budget Corridor (±30% of budget)
  if (leadInquiry.budget && leadInquiry.budget > 0) {
    const minB = leadInquiry.budget * 0.7;
    const maxB = leadInquiry.budget * 1.3;
    const budgetMatch = propList.find((p: any) => {
      const price = Number(p.price || 0);
      return price >= minB && price <= maxB;
    });
    if (budgetMatch) return budgetMatch;
  }

  // Match 4: Tenant Featured Default
  return propList[0] || null;
}

// Instant Consultative Hinglish WhatsApp Outreach (Task 2)
async function dispatchPortalWhatsAppOutreach(
  tenantId: string,
  lead: any,
  property: any,
  source: string
): Promise<{ success: boolean; res?: any; messageText: string; error?: string }> {
  if (!lead.phone) {
    return { success: false, error: "Missing phone number", messageText: "" };
  }

  const { data: clientRec } = await supabase
    .from("clients")
    .select("company_name, name, city, access_token, phone_number_id, whatsapp_phone_number_id")
    .eq("id", tenantId)
    .maybeSingle();

  const agencyName = clientRec?.company_name || clientRec?.name || "NextGen Realty";
  const phoneNumberId = clientRec?.phone_number_id || clientRec?.whatsapp_phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
  const accessToken = clientRec?.access_token || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";

  const rawDigits = String(lead.phone).replace(/\D/g, "");
  const formattedPhone = rawDigits.startsWith("91") && rawDigits.length === 12
    ? rawDigits
    : rawDigits.length === 10
    ? `91${rawDigits}`
    : rawDigits;

  const leadName = lead.first_name || lead.name || "Customer";
  const projectName = property?.project_name || lead.requirement || "Prime Luxury Project";
  const location = property?.location || clientRec?.city || "Prime Location";
  const configuration = property?.configuration || property?.property_category || "2 & 3 BHK Luxury Apartments";
  const price = property?.price ? formatPriceShort(Number(property.price)) : "Price on Request";

  let keyAmenities = "Clubhouse, Swimming Pool, 24/7 Security & Landscaped Gardens";
  if (Array.isArray(property?.amenities) && property.amenities.length > 0) {
    keyAmenities = property.amenities.slice(0, 4).join(", ");
  }

  const brochureBlock = property?.brochure_url
    ? `\n${formatBrochureHyperlink(property.brochure_url, "Project Brochure & Layouts")}\n`
    : "";
  const mapBlock = property?.map_url
    ? `\n${formatMapHyperlink(property.map_url, "View on Google Maps")}\n`
    : "";

  const messageText = `Namaste ${leadName} ji! 🙏

Humne ${source} par aapki inquiry dekhi regarding ${projectName}.

Main ${agencyName} se senior property advisor baat kar raha hu. Aapki requirement ke according hamara verified project:

🏡 *${projectName}*
📍 Location: ${location}
📐 Configuration: ${configuration}
💰 Price: ${price}
✨ Highlights: ${keyAmenities}
${brochureBlock}${mapBlock}
👉 Kya hum kal shaam 5 baje ya Sunday subah 11 baje aapki exclusive *VIP Site Visit 🚗* schedule karein?`;

  const sendResult = await sendWhatsAppMessage(phoneNumberId, accessToken, formattedPhone, messageText);
  return { success: !sendResult?.error, res: sendResult, messageText };
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
  const minute = ist.getUTCMinutes();
  if (endHour === 19) {
    return (hour >= startHour && hour < 18) || (hour === 18 && minute <= 30);
  }
  return hour >= startHour && hour < endHour;
}

// 5. Natural Language Slot Parser with 10 AM - 6 PM IST Validation
function parseVisitSlot(slotText = ""): { isoUtc: string; isValidTime: boolean; isPast: boolean } {
  const text = normalizeIndicDigits(slotText).toLowerCase().trim();
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
  } else if (/\b(parso|parsva|parsom|day\s+after)\b/i.test(text) || text.includes("પરમ")) {
    targetDay += 2;
  } else if (/\b(aje|aaje|aaj|today)\b/i.test(text) || text.includes("આજે")) {
    // Today (targetDay remains today)
  } else if (/\b(kale|kaale|kal|tomorrow)\b/i.test(text) || text.includes("કાલે")) {
    targetDay += 1;
  } else {
    targetDay += 1; // Default tomorrow
  }

  let hours = 17; // Default 5 PM IST
  let minutes = 0;
  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|vage|વાગે|બજે)?/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = timeMatch[3]?.toLowerCase();
    let isPm = period === "pm";
    let isAm = period === "am";
    if (text.includes("sham") || text.includes("shaam") || text.includes("evening") || text.includes("sanje") || text.includes("સાંજે") || text.includes("dopahar") || text.includes("bapori") || text.includes("બપોરે")) {
      isPm = true;
    } else if (text.includes("subah") || text.includes("savare") || text.includes("સવારે") || text.includes("morning")) {
      isAm = true;
    } else if (h === 10 || h === 11) {
      // 10 and 11 default to morning/AM in real estate visits unless evening/sham/sanje specified
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

interface ParsedArea {
  carpet_sqft: number | null;
  super_built_up_sqft: number | null;
  plot_area_sqft: number | null;
}

function parseAreaFromText(text: string): ParsedArea {
  const normalized = normalizeIndicDigits(text || "");
  const clean = normalized.replace(/,/g, "");
  const lower = clean.toLowerCase().trim();

  let carpet: number | null = null;
  let superBuilt: number | null = null;
  let plot: number | null = null;

  // 1. Explicit matches for carpet area (e.g., "carpet 900", "900 carpet", "carpet area 900 sqft")
  const carpetMatch1 = lower.match(/(?:carpet|carpat|karpet|carpet\s*area)\s*[:=-]?\s*(\d{2,6})/i);
  const carpetMatch2 = lower.match(/(\d{2,6})\s*(?:sq\.?\s*ft|sqft|feet|square\s*feet|foot)?\s*(?:carpet|carpat|karpet)/i);
  if (carpetMatch1) carpet = parseInt(carpetMatch1[1], 10);
  else if (carpetMatch2) carpet = parseInt(carpetMatch2[1], 10);

  // 2. Explicit matches for built-up / super built-up area (e.g., "built up 1250", "1250 built up", "flat 1200sqft", "super built 1500", "construction 1250", "sba 1250")
  const builtMatch1 = lower.match(/(?:built[\s-]*up|buildup|super[\s-]*built|super[\s-]*built[\s-]*up|sba|construction|bua)\s*(?:area)?\s*[:=-]?\s*(\d{2,6})/i);
  const builtMatch2 = lower.match(/(\d{2,6})\s*(?:sq\.?\s*ft|sqft|feet|square\s*feet|foot)?\s*(?:built[\s-]*up|buildup|super[\s-]*built|super[\s-]*built[\s-]*up|sba|construction|bua)/i);
  const flatAreaMatch = lower.match(/(?:flat|apartment|unit|bhk)\s*[:=-]?\s*(\d{2,6})\s*(?:sq\.?\s*ft|sqft|feet|square\s*feet|foot)/i) ||
                        lower.match(/(\d{2,6})\s*(?:sq\.?\s*ft|sqft|feet|square\s*feet|foot)\s*(?:flat|apartment|unit|bhk)/i);
  if (builtMatch1) superBuilt = parseInt(builtMatch1[1], 10);
  else if (builtMatch2) superBuilt = parseInt(builtMatch2[1], 10);
  else if (flatAreaMatch) superBuilt = parseInt(flatAreaMatch[1], 10);

  // 3. Explicit matches for plot / land area with Gujarat units (var, gaj, vigha)
  // In Gujarat: 1 Var (વાર) / Gaj / Sq Yard = 9 sq.ft. 1 Vigha = 17,424 sq.ft.
  const plotMatch1 = lower.match(/(?:plot|land|zameen|jamin|પ્લોટ|જમીન)\s*(?:area|size)?\s*[:=-]?\s*(\d{1,6}(?:\.\d+)?)\s*(var|vaar|gaj|vigha|bigha|sq\s*yard|yards?|વાર|ગજ|વીઘા|વિઘા|બીઘા|sq\.?\s*ft|sqft|feet|square\s*feet|foot)?/i);
  const plotMatch2 = lower.match(/(\d{1,6}(?:\.\d+)?)\s*(var|vaar|gaj|vigha|bigha|sq\s*yard|yards?|વાર|ગજ|વીઘા|વિઘા|બીઘા|sq\.?\s*ft|sqft|feet|square\s*feet|foot)?\s*(?:plot|land|zameen|jamin|પ્લોટ|જમીન)/i);
  const plotUnitMatch = lower.match(/(\d{1,6}(?:\.\d+)?)\s*(var|vaar|gaj|vigha|bigha|sq\s*yards?|yards?)(?:\b|$)/i) ||
                        lower.match(/(\d{1,6}(?:\.\d+)?)\s*(વાર|ગજ|વીઘા|વિઘા|બીઘા)(?:[^\u0A80-\u0AFF\w]|$)/i);

  const matchedPlot = plotMatch1 || plotMatch2 || plotUnitMatch;
  if (matchedPlot) {
    const rawVal = parseFloat(matchedPlot[1]);
    const unit = (matchedPlot[2] || "").toLowerCase().replace(/[\s.-]+/g, "");
    if (["var", "vaar", "gaj", "sqyard", "yard", "yards", "વાર", "ગજ"].includes(unit)) {
      plot = Math.round(rawVal * 9); // 1 Var / Gaj = 9 sq.ft
    } else if (["vigha", "bigha", "વીઘા", "વિઘા", "બીઘા"].includes(unit)) {
      plot = Math.round(rawVal * 17424); // 1 Gujarat Vigha = 17,424 sq.ft
    } else {
      plot = Math.round(rawVal);
    }
  }

  // 4. Matches with sqft units without keyword (e.g., "1250 sqft", "1250 sq.ft", "900 feet", "1250 square feet")
  if (!carpet && !superBuilt && !plot) {
    const unitMatch = lower.match(/(\d{2,6})\s*(?:sq\.?\s*ft|sqft|feet|square\s*feet|foot|sq\s*mtr|sqm)\b/i);
    if (unitMatch) {
      const val = parseInt(unitMatch[1], 10);
      if (val >= 50 && val <= 50000) {
        if (lower.includes("built") || lower.includes("super") || lower.includes("construction")) {
          superBuilt = val;
        } else if (lower.includes("plot") || lower.includes("land") || lower.includes("zameen")) {
          plot = val;
        } else {
          carpet = val;
        }
      }
    }
  }

  // 5. Bare number fallback when user is simply answering the area question (e.g., "900", "1250", "around 1200")
  if (!carpet && !superBuilt && !plot) {
    const bareMatch = lower.match(/^(?:around|approx|lagbhag|andaje|karib|size|area)?\s*(\d{2,5})\s*(?:sqft|sq\.?\s*ft|feet)?$/i);
    if (bareMatch) {
      const val = parseInt(bareMatch[1], 10);
      if (val >= 50 && val <= 50000) {
        if (lower.includes("built") || lower.includes("super")) {
          superBuilt = val;
        } else if (lower.includes("plot") || lower.includes("land")) {
          plot = val;
        } else {
          carpet = val;
        }
      }
    }
  }

  return { carpet_sqft: carpet, super_built_up_sqft: superBuilt, plot_area_sqft: plot };
}

function formatSocietyAndLocationLabel(society?: string | null, location?: string | null, city?: string | null): string {
  const soc = (society || "").trim();
  const loc = (location || "").trim();

  if (!soc && !loc) return city || "Prime Area";
  if (!soc) return loc;
  if (!loc) return soc;

  const socParts = soc.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  const locParts = loc.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  const allParts = [...socParts, ...locParts];

  const deduped: string[] = [];
  for (const part of allParts) {
    const pClean = part.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!pClean) continue;
    const isDup = deduped.some(d => {
      const dClean = d.toLowerCase().replace(/[^a-z0-9]/g, "");
      return dClean.includes(pClean) || pClean.includes(dClean) ||
        (dClean.length > 5 && pClean.length > 5 && (dClean.slice(0, 5) === pClean.slice(0, 5) || dClean.slice(-7) === pClean.slice(-7)));
    });
    if (!isDup) {
      deduped.push(part);
    }
  }

  return deduped.join(", ") || soc;
}

/**
 * Detects random keystroke mashes, consonant-only strings, repeated chars,
 * and unintelligible inputs (e.g. "gfnfgn", "asdfghj", "zzzzz", "?????")
 */
function isGibberishOrInvalidInput(text: string): boolean {
  if (!text || typeof text !== "string") return true;
  const clean = text.trim();
  if (clean.length === 0) return true;

  // If text contains Indic Unicode script (Gujarati, Hindi, Devanagari), do not treat as Latin gibberish
  if (/[\u0A80-\u0AFF\u0900-\u097F]/.test(clean)) {
    if (/(.)\1{4,}/u.test(clean)) return true;
    return false;
  }

  // Pure punctuation or symbols without alphanumeric characters
  if (!/[a-zA-Z0-9]/.test(clean)) return true;

  // Single or double character valid tokens (e.g. "1", "2", "3", "hi", "ha", "ok", "k")
  if (clean.length <= 2) return false;

  // Repeated same character 4 or more times (e.g. "aaaa", "zzzzz", "11111")
  if (/(.)\1{3,}/i.test(clean)) return true;

  // Check words for consonant-only keystroke mashes
  const words = clean.toLowerCase().split(/\s+/).filter(Boolean);
  const knownVowellessAcronyms = new Set([
    "bhk", "1bhk", "2bhk", "3bhk", "4bhk", "5bhk",
    "rk", "1rk", "2rk",
    "sqft", "sft", "sqyd", "sqm", "sq",
    "rtm", "bua", "sba", "cr", "k", "l", "lac", "lacs",
    "rd", "opp", "nr", "dr", "mr", "mrs"
  ]);

  for (const word of words) {
    const lettersOnly = word.replace(/[^a-z]/g, "");
    // If a word is 4+ letters long, has letters only, has NO vowels, and is not a known acronym
    if (lettersOnly.length >= 4 && !/[aeiou]/i.test(lettersOnly) && !knownVowellessAcronyms.has(lettersOnly)) {
      return true;
    }
    // High consonant cluster (5 or more consecutive consonants)
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(lettersOnly) && !knownVowellessAcronyms.has(lettersOnly)) {
      return true;
    }
  }

  return false;
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
    if (lower.includes("duplex") || lower.includes("ડુપ્લેક્સ")) {
      return `${bhkMatch[1]}BHK Duplex`;
    }
    if (
      lower.includes("penthouse") || lower.includes("પેન્ટહાઉસ")
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
  if (lower.includes("duplex") || lower.includes("ડુપ્લેક્સ")) return "Duplex";
  if (lower.includes("penthouse") || lower.includes("પેન્ટહાઉસ")) return "Penthouse";
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

const STOP_WORDS_SET = new Set([
  "muje", "mujhe", "mane", "mare", "mari", "maro", "maru", "mara", "meri", "mera", "mere",
  "taro", "tari", "taru", "tara", "tamaro", "tamari", "tamaru", "tamara", "amaro", "amari", "amaru", "amara",
  "potano", "potani", "potanu", "potana", "apni", "apna", "apne", "hamara", "hamari", "hamare",
  "i", "my", "we", "our", "me", "us", "humko", "hume", "hum", "main", "hu", "ame", "tame", "aap",
  "ek", "one", "1", "2", "3", "4", "5", "ye", "aa", "yeh", "this", "that",
  // Adjectives (Gujarati, Hindi, English)
  "juno", "juni", "junu", "juna", "navo", "navi", "navu", "nava",
  "purana", "purani", "purane", "purano", "naya", "nayi", "naye",
  "old", "new", "used", "resale", "re-sale", "secondhand", "second-hand", "fresh",
  // Verbs & Conjugations (Gujarati, Hindi, English)
  "vechvano", "vechvani", "vechvanu", "vechvana", "vechavo", "vechavi", "vechavu", "vechava", "vechvu", "vechva", "vechvo",
  "bechvano", "bechvani", "bechvanu", "bechvana", "bechne", "bechna", "bechni", "bechvu",
  "aapo", "aapva", "aapvu", "aapvani", "aapvano", "dena", "deni", "dene",
  "sell", "selling", "list", "listing", "karna", "karni", "karne", "karvu", "karva", "karo", "want", "wants", "wanted",
  // Auxiliary & Grammar
  "he", "hai", "h", "hain", "che", "chhe", "to", "chahiye", "joiye",
  "ka", "ki", "ke", "nu", "no", "ni", "na", "in", "at", "me", "ma", "par", "pe", "se", "thi", "as", "aur", "ane", "and", "is",
  // Unicode Indic Adjectives & Verbs
  "જૂનો", "જૂની", "જૂનું", "જૂના", "જુનો", "જુની", "જુનુ", "જુના", "નવો", "નવી", "નવું", "નવા",
  "વેચવાનો", "વેચવાની", "વેચવાનું", "વેચવાના", "વેચવું", "વેચવા",
  "पुराना", "पुरानी", "पुराने", "नया", "नयी", "नए", "बेचना", "बेचनी",
  // Property Types
  "sho", "shop", "office", "flat", "apartment", "duplex", "penthouse", "villa", "bungalow", "house", "ghar",
  "makan", "makaan", "plot", "land", "zamin", "showroom", "godown", "warehouse", "dukan", "dukaan",
  "commercial", "residential", "property", "project", "society", "name",
  "bhk", "rk", "1bhk", "2bhk", "3bhk", "4bhk", "5bhk", "1rk", "2rk",
  "bedroom", "bedrooms", "room", "rooms", "floor"
]);

function isLikelySocietyOrProjectName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  const cleaned = name.trim().replace(/['".,!?;:()]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2) return false;
  if (/^\d+$/.test(cleaned)) return false;

  // Strict Guard: Pure property configurations and unit types can NEVER be a society/project name!
  if (/^(?:[1-5]\s*bhk|[1-5]\s*rk|bhk|rk|flat|flats|apartment|villa|plot|land|shop|office|commercial|residential|house|bungalow|duplex|penthouse)$/i.test(cleaned)) {
    return false;
  }

  // Reject descriptive modifiers, adjectives, and seller verbs without a genuine entity name
  if (/^(?:juno|juni|junu|juna|purana|purani|purane|naya|nayi|naye|navo|navi|navu|nava|resale|old|new|used)\s*(?:flat|flats|villa|house|plot|shop|office|makan|ghar)?(?:\s*(?:vechvano|vechvani|vechvanu|vechvana|vechva|vechvu|bechna|bechni|bechne|bechvano|sell))?$/i.test(cleaned)) {
    return false;
  }

  const words = cleaned.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
  if (words.length === 0) return false;

  const nonStopWords = words.filter((w) => !STOP_WORDS_SET.has(w));
  return nonStopWords.length > 0;
}

function extractProjectOrSocietyFromText(text: string, parsedPropType?: string): string {
  if (!text) return "";
  const trimmed = text.trim();

  // 1. Quoted project name followed by project/society/ka name/nu name
  // e.g. 'Ananta astha' as project ka name
  const quotedBeforeProj = trimmed.match(/['"]([a-zA-Z0-9\s-]+?)['"]\s+(?:as\s+)?(?:project|society)(?:\s*(?:ka|nu|no)?\s*name)?/i);
  if (quotedBeforeProj && quotedBeforeProj[1].trim()) {
    const cand = quotedBeforeProj[1].trim();
    if (isLikelySocietyOrProjectName(cand)) return cand;
  }

  // 2. Project/society keyword followed by quoted string or name
  // e.g. project ka name 'Ananta Astha' or project name: 'Ananta Astha'
  const projAfterKeyword = trimmed.match(/(?:project|society)(?:\s*(?:ka|nu|no)?\s*name)?\s*[:=]?\s*['"]([a-zA-Z0-9\s-]+?)['"]/i);
  if (projAfterKeyword && projAfterKeyword[1].trim()) {
    const cand = projAfterKeyword[1].trim();
    if (isLikelySocietyOrProjectName(cand)) return cand;
  }

  // 3. Unquoted "X as project" or "X project ka name"
  // e.g. Ananta astha as project ka name
  const asProject = trimmed.match(/([a-zA-Z0-9\s-]+?)\s+(?:as\s+)(?:project|society)(?:\s*(?:ka|nu|no)?\s*name)?/i);
  if (asProject && asProject[1].trim()) {
    const candidate = asProject[1].trim();
    if (isLikelySocietyOrProjectName(candidate)) {
      return candidate;
    }
  }

  // 4. "project ka name X" without quotes up to and/aur/property/type/comma/end
  // e.g. project ka name Ananta Astha and property type
  const unquotedProj = trimmed.match(/(?:project|society)(?:\s*(?:ka|nu|no)?\s*name)\s*[:=]?\s*([a-zA-Z0-9\s-]+?)(?:\s+(?:and|ane|aur|property|type|hai|chhe|che|pe|par|\.)|$)/i);
  if (unquotedProj && unquotedProj[1].trim()) {
    const candidate = unquotedProj[1].trim();
    if (isLikelySocietyOrProjectName(candidate)) {
      return candidate;
    }
  }

  // 5. Strip parsedPropType, property subtype tokens and conversational filler words to see if a clean society name remains
  if (parsedPropType || /\b(?:[1-5]\s*bhk|flat|villa|shop|office|plot)\b/i.test(trimmed)) {
    const propTokens = [
      parsedPropType,
      "commercial", "residential", "flat", "apartment", "duplex", "penthouse",
      "villa", "bungalow", "house", "ghar", "makan", "makaan", "plot", "land", "zamin",
      "shop", "showroom", "office", "warehouse", "godown", "dukan", "dukaan",
      "[1-5]?\\s*bhk", "[1-5]?\\s*rk", "bhk", "rk"
    ].filter(Boolean).join("|");

    const stripped = trimmed
      .replace(/['"]/g, "")
      .replace(new RegExp(`\\b(?:${propTokens})\\b`, "gi"), "")
      .replace(/\b(?:property\s*type|project(?:\s*(?:ka|nu|no)?\s*name)?|society(?:\s*(?:ka|nu|no)?\s*name)?|type)\b/gi, "")
      .replace(/\b(?:muje|mujhe|mane|mare|mari|maro|maru|mara|meri|mera|mere|taro|tari|taru|tara|tamaro|tamari|tamaru|tamara|amaro|amari|amaru|amara|potano|potani|potanu|potana|apni|apna|apne|hamara|hamari|hamare|i|my|we|our|me|us|humko|hume|hum|main|hu|ame|tame|aap|ek|one|1|2|3|4|5|ye|aa|yeh|this)\b/gi, "")
      .replace(/\b(?:bechna|bechni|bechne|bechvu|bechvano|bechvani|bechvanu|bechvana|vechvu|vechva|vechvo|vechvano|vechvani|vechvanu|vechvana|vechavo|vechavi|vechavu|vechava|aapo|aapva|aapvu|aapvani|aapvano|dena|deni|dene|sell|selling|list|listing|karna|karni|karne|karvu|karva|karo|want|wants|wanted)\b/gi, "")
      .replace(/\b(?:juno|juni|junu|juna|purana|purani|purane|purano|navo|navi|navu|nava|naya|nayi|naye|resale|re-sale|secondhand|second-hand|fresh|old|new|used)\b/gi, "")
      .replace(/\b(?:he|hai|h|hain|che|chhe|to|chahiye|joiye|ka|ki|ke|nu|no|ni|na|in|at|me|ma|par|pe|se|thi|as|aur|ane|and|is)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (stripped.length >= 3 && isLikelySocietyOrProjectName(stripped)) {
      return stripped;
    }
  }

  return "";
}

function formatSocietyName(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/^['"]|['"]$/g, "").replace(/^(?:ye|meri|mera|maro|mari|muje|mujhe|mare|mane|in|at)\s+/i, "").trim();
  if (!isLikelySocietyOrProjectName(cleaned)) return "";
  return cleaned.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function parseRequirementFromText(text: string, lastQ?: string): string {
  const lower = (text || "").toLowerCase().trim();
  if (lastQ === "REQUIREMENT") {
    if (/^(?:1|1️⃣|option\s*1|first|1st)\b/i.test(lower)) return "BUY";
    if (/^(?:2|2️⃣|option\s*2|second|2nd)\b/i.test(lower)) return "RENT";
  }
  if (lower.includes("lease") || lower.includes("corporate lease") || lower.includes("long term lease") || lower.includes("લીઝ")) {
    return "LEASE";
  }
  // RENT must precede BUY so that "rent pe leni hai" or "rent par lena" classifies as RENT
  if (
    lower.includes("rent") || lower.includes("kiraya") || lower.includes("kiraye") ||
    lower.includes("bhadu") || lower.includes("bhaade") || lower.includes("bhade") ||
    lower.includes("bhada") || lower.includes("rental") || lower.includes("reva mate") ||
    lower.includes("ભાડે") || lower.includes("ભાડુ") || lower.includes("કિરાયા") ||
    lower.includes("किરાયા") || lower.includes("किराया") || lower.includes("किराये")
  ) {
    return "RENT";
  }
  if (
    lower.includes("sell") || lower.includes("bechna") || lower.includes("bechni") ||
    lower.includes("bechne") || lower.includes("vechvu") || lower.includes("vechva") ||
    lower.includes("vechvo") || lower.includes("bikri") ||
    /\b(?:deni|dena|dene)\s*(?:hai|he|h|chhe|che|chahte)?\b/i.test(lower) ||
    lower.includes("વેચવું") || lower.includes("વેચવા") || lower.includes("બેચના") ||
    lower.includes("बेचना") || lower.includes("बेचनी")
  ) {
    return "SELL";
  }
  if (
    lower.includes("buy") || lower.includes("purchase") ||
    lower.includes("kharid") || lower.includes("khareed") ||
    lower.includes("kharidvu") || lower.includes("kharidva") || lower.includes("kharidvo") ||
    lower.includes("khareedvu") || lower.includes("khareedva") || lower.includes("khareedvo") ||
    lower.includes("khareedna") || lower.includes("kharidna") ||
    lower.includes("levu") || lower.includes("leva") || lower.includes("levo") ||
    /\b(?:leni|lena|lene)\s*(?:hai|he|h|chhe|che|chahte)?\b/i.test(lower) ||
    lower.includes("ખરીદવું") || lower.includes("ખરીદવા") || lower.includes("ખરીદ") ||
    lower.includes("લેવું") || lower.includes("લેવા") || lower.includes("લેવો") ||
    lower.includes("खरीदना") || lower.includes("खरीद") || lower.includes("लेनी") || lower.includes("लेना")
  ) {
    return "BUY";
  }
  return "";
}

function parsePurposeFromText(text: string, lastQ?: string): string {
  const lower = (text || "").toLowerCase().trim();
  if (lastQ === "PURPOSE") {
    if (/^(?:1|1️⃣|option\s*1|first|1st)\b/i.test(lower)) return "SELF_USE";
    if (/^(?:2|2️⃣|option\s*2|second|2nd)\b/i.test(lower)) return "INVESTMENT";
  }
  if (
    lower.includes("invest") || lower.includes("roi") || lower.includes("rental yield") ||
    lower.includes("nivesh") || lower.includes("returns") || lower.includes("rent pe") ||
    lower.includes("rent par dena") || lower.includes("bhadu aave") ||
    lower.includes("રોકાણ") || lower.includes("ઇન્વેસ્ટમેન્ટ")
  ) {
    return "INVESTMENT";
  }
  if (
    lower.includes("self") || lower.includes("rehna") || lower.includes("rehne") || lower.includes("rehane") ||
    lower.includes("raheva") || lower.includes("own use") || lower.includes("family") || lower.includes("student") ||
    lower.includes("personal") || lower.includes("bachelor") || lower.includes("living") || lower.includes("ghar") ||
    lower.includes("makan") || lower.includes("khud") || lower.includes("રહેવા") || lower.includes("પોતાના માટે") ||
    lower.includes("પરિવાર") || lower.includes("ફેમિલી")
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

function parseTimelineFromText(text: string, lastQ?: string): string {
  const normalized = normalizeIndicDigits(text || "");
  const lower = normalized.toLowerCase().trim();
  if (lastQ === "TIMELINE") {
    if (/^(?:1|1️⃣|option\s*1|first|1st)\b/i.test(lower)) return "READY_TO_MOVE";
    if (/^(?:2|2️⃣|option\s*2|second|2nd)\b/i.test(lower)) return "UNDER_CONSTRUCTION";
  }
  if (
    lower.includes("chalega") || lower.includes("chalshe") || lower.includes("koi bhi") ||
    lower.includes("gamete") || lower.includes("both") || lower.includes("dono") ||
    lower.includes("any") || lower.includes("kuch bhi")
  ) {
    return "READY_TO_MOVE";
  }
  if (
    lower.includes("ready to move") ||
    lower.includes("ready-to-move") ||
    lower.includes("ready") ||
    lower.includes("rtm") ||
    lower.includes("turant shift") ||
    lower.includes("turant") ||
    lower.includes("immediate") ||
    lower.includes("jaldi") ||
    lower.includes("tarat") ||
    lower.includes("તરત")
  ) {
    return "READY_TO_MOVE";
  }
  if (
    lower.includes("under construction") ||
    lower.includes("under-construction") ||
    lower.includes("construction") ||
    lower.includes("uc") ||
    lower.includes("nava project") ||
    lower.includes("new project") ||
    lower.includes("3 month") ||
    lower.includes("6 month") ||
    lower.includes("saal") ||
    lower.includes("3 મહિના") ||
    lower.includes("6 મહિના")
  ) {
    return "UNDER_CONSTRUCTION";
  }
  if (lower.includes("1 month") || lower.includes("ek mahina") || lower.includes("30 days") || lower.includes("1 મહિનો") || lower.includes("1 મહિના")) {
    return "READY_TO_MOVE";
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

export interface BookVisitAction {
  intent: "BOOK_VISIT";
  target_property_index?: number | null;
  target_property_name?: string | null;
  preferred_date_raw?: string | null;
  preferred_time_raw?: string | null;
  slot_iso?: string | null;
}

export interface SelectOptionAction {
  intent: "SELECT_OPTION";
  option_index: number;
}

export interface ChangeRequirementAction {
  intent: "CHANGE_REQUIREMENT";
  property_type?: string | null;
  budget?: number | null;
  location?: string | null;
  requirement?: "BUY" | "RENT" | "LEASE" | null;
  is_flexible_location?: boolean;
}

export interface ConfirmCriteriaAction {
  intent: "CONFIRM_CRITERIA";
  confirm: boolean;
}

export interface AskFaqAction {
  intent: "ASK_FAQ";
  topic:
    | "AMENITIES"
    | "RERA"
    | "LOAN"
    | "POSSESSION"
    | "BROKERAGE"
    | "LANDMARKS"
    | "PRICING_DISCOUNT"
    | "OFFICE_ADDRESS"
    | "OFFICE_TIMINGS"
    | "AGENCY_INFO"
    | "CUSTOM_FAQ";
  specific_query?: string | null;
}

export interface SubmitListingAction {
  intent: "SUBMIT_LISTING";
  transaction_type?: "SELL" | "RENT_OUT" | null;
  property_type?: string | null;
  location?: string | null;
  project_or_society?: string | null;
  price_or_rent?: number | null;
  carpet_sqft?: number | null;
  super_built_up_sqft?: number | null;
  plot_area_sqft?: number | null;
  possession_status?: "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | null;
  furnishing_status?: "FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED" | null;
  contact_phone?: string | null;
}

export interface CancelVisitAction {
  intent: "CANCEL_VISIT";
  reason?: string | null;
}

export interface RescheduleVisitAction {
  intent: "RESCHEDULE_VISIT";
  new_slot_raw?: string | null;
}

export interface CannotAttendVisitAction {
  intent: "CANNOT_ATTEND_VISIT";
  reason?: string | null;
}

export interface ConfirmVisitAttendanceAction {
  intent: "CONFIRM_VISIT_ATTENDANCE";
  attended: boolean;
  feedback?: string | null;
}

export interface HumanCallAction {
  intent: "REQUEST_HUMAN_CALL";
  reason?: string | null;
}

export interface BrochureRequestAction {
  intent: "BROCHURE_REQUEST";
  project_name?: string | null;
}

export interface MapRequestAction {
  intent: "MAP_REQUEST";
  project_name?: string | null;
}

export interface MarketAdvisoryAction {
  intent: "MARKET_ADVISORY";
  query?: string | null;
}

export interface GreetingAction {
  intent: "GREETING";
  token?: string | null;
}

export interface OptOutAction {
  intent: "OPT_OUT";
}

export interface OffTopicAction {
  intent: "OFF_TOPIC";
}

export interface GeneralQueryAction {
  intent: "GENERAL_QUERY";
  query: string;
}

export type UserAction =
  | BookVisitAction
  | SelectOptionAction
  | ChangeRequirementAction
  | ConfirmCriteriaAction
  | AskFaqAction
  | SubmitListingAction
  | CancelVisitAction
  | RescheduleVisitAction
  | CannotAttendVisitAction
  | ConfirmVisitAttendanceAction
  | HumanCallAction
  | BrochureRequestAction
  | MapRequestAction
  | MarketAdvisoryAction
  | GreetingAction
  | OptOutAction
  | OffTopicAction
  | GeneralQueryAction;

export interface ClassifiedActionResult {
  action: UserAction;
  user_role: "SEEKER" | "OWNER" | "UNKNOWN";
  language: "HINGLISH" | "GUJLISH" | "ENGLISH" | "GUJARATI_SCRIPT";
  provider_used: "GEMINI" | "GROQ" | "DETERMINISTIC_FALLBACK";
  latency_ms: number;
  raw_intent_name: string;
  // Backward compatibility bridge fields for existing callers
  intent: string;
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
}

export type ClassifiedIntent = ClassifiedActionResult;

/**
 * Normalizes Indic Gujarati numeral script (૧, ૨, ૩...) to standard ASCII digits.
 */
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

/**
 * Guard against BHK configuration vs role Option 2 collision.
 * Inputs like "2 BHK", "2bhk", "2 bed", "3bhk flat" are seeker property configs, NEVER Option 2 (Owner).
 */
export function isBhkOrPropertyConfiguration(text: string): boolean {
  if (!text) return false;
  const normalized = normalizeGujaratiDigits(text);
  return /(?:^|\b)(?:[1-5]\s*bhk|[1-5]\s*rk|[1-5]\s*bed|flat|apartment|villa|bungalow|duplex|penthouse|office|shop|plot)\b/i.test(normalized);
}

/** Strict boundary-checked vernacular rental token tree */
export const VERNACULAR_RENTAL_REGEX = /(?:^|\b)(?:bhade|bhadu|bhada|bhaade|kiraya|kiraye|rent\s*par|bhada\s*par|bhade\s*thi|reva\s*mate)\b/i;

/** Strict boundary-checked vernacular sale token tree */
export const VERNACULAR_SALE_REGEX = /(?:^|\b)(?:vechva|vechvu|vechvo|bechna|bechni|kharidva\s*nathi|sale|bikri)\b/i;

/**
 * Extracts isolated single digit choice (1-5 or emoji digits) with boundary checking.
 */
export function parseSingleDigitChoice(text: string): number | null {
  if (!text) return null;
  const normalized = normalizeGujaratiDigits(text).trim();
  const match = normalized.match(/^(?:option\s*)?([1-5]|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣)(?:\s*(?:no|number|num|chhe|che|karo|bhai|ji|wala|vala))?$/i);
  if (match) {
    const raw = match[1];
    if (raw === "1" || raw === "1️⃣") return 1;
    if (raw === "2" || raw === "2️⃣") return 2;
    if (raw === "3" || raw === "3️⃣") return 3;
    if (raw === "4" || raw === "4️⃣") return 4;
    if (raw === "5" || raw === "5️⃣") return 5;
  }
  return null;
}

/**
 * Deterministically binds isolated single digits (1, 2, 3) to the active stage options
 * across all dialog states with zero cross-stage collision.
 */
export function disambiguateNumericChoice(
  digit: number,
  currentState: string,
  lead?: any,
  messageText: string = ""
): { action: UserAction; userRole: "OWNER" | "SEEKER" | "UNKNOWN" } | null {
  const isPostVisit =
    currentState === "SITE_VISIT_DONE" ||
    (currentState === "SITE_VISIT_BOOKED" &&
      (Boolean(lead?.post_visit_feedback_sent) || lead?.metadata?.last_bot_prompt?.question_type === "VISIT_ATTENDANCE"));

  if (isPostVisit) {
    if (digit === 1) {
      return {
        action: { intent: "CONFIRM_VISIT_ATTENDANCE", attended: true },
        userRole: "SEEKER",
      };
    }
    if (digit === 2) {
      return {
        action: { intent: "CANNOT_ATTEND_VISIT", reason: "did_not_attend" },
        userRole: "SEEKER",
      };
    }
  }

  if (currentState === "ROLE_SELECTION_PENDING" || currentState === "FRESH") {
    if (isBhkOrPropertyConfiguration(messageText)) {
      const propType = parsePropertyTypeFromText(messageText) || "2BHK";
      return {
        action: { intent: "CHANGE_REQUIREMENT", property_type: propType },
        userRole: "SEEKER",
      };
    }
    if (digit === 1) {
      return {
        action: { intent: "CHANGE_REQUIREMENT" },
        userRole: "SEEKER",
      };
    }
    if (digit === 2) {
      return {
        action: { intent: "SUBMIT_LISTING" },
        userRole: "OWNER",
      };
    }
    if (digit === 3) {
      return {
        action: { intent: "CHANGE_REQUIREMENT" },
        userRole: "UNKNOWN",
      };
    }
  }

  if (currentState === "OWNER_POSSESSION_PENDING") {
    if (digit === 1) {
      return {
        action: { intent: "SUBMIT_LISTING", possession_status: "READY_TO_MOVE" },
        userRole: "OWNER",
      };
    }
    if (digit === 2) {
      return {
        action: { intent: "SUBMIT_LISTING", possession_status: "UNDER_CONSTRUCTION" },
        userRole: "OWNER",
      };
    }
  }

  if (currentState === "OWNER_FURNISHING_PENDING") {
    if (digit === 1) {
      return {
        action: { intent: "SUBMIT_LISTING", furnishing_status: "UNFURNISHED" },
        userRole: "OWNER",
      };
    }
    if (digit === 2) {
      return {
        action: { intent: "SUBMIT_LISTING", furnishing_status: "SEMI_FURNISHED" },
        userRole: "OWNER",
      };
    }
    if (digit === 3) {
      return {
        action: { intent: "SUBMIT_LISTING", furnishing_status: "FURNISHED" },
        userRole: "OWNER",
      };
    }
  }

  if (currentState === "CRITERIA_CONFIRMATION_PENDING") {
    if (digit === 1) {
      return {
        action: { intent: "CONFIRM_CRITERIA", confirm: true },
        userRole: "SEEKER",
      };
    }
    if (digit === 2) {
      return {
        action: { intent: "CONFIRM_CRITERIA", confirm: false },
        userRole: "SEEKER",
      };
    }
  }

  if (currentState === "DUAL_ROLE_MENU_PENDING") {
    if (digit === 1) {
      return {
        action: { intent: "SUBMIT_LISTING" },
        userRole: "OWNER",
      };
    }
    if (digit === 2) {
      return {
        action: { intent: "CHANGE_REQUIREMENT" },
        userRole: "SEEKER",
      };
    }
    if (digit === 3) {
      return {
        action: { intent: "REQUEST_HUMAN_CALL" },
        userRole: "UNKNOWN",
      };
    }
  }

  if (currentState === "OPTIONS_SENT" || currentState === "VISIT_REQUESTED" || currentState === "SITE_VISIT_PROPOSED") {
    if (digit >= 1 && digit <= 3) {
      return {
        action: { intent: "SELECT_OPTION", option_index: digit - 1 },
        userRole: "SEEKER",
      };
    }
  }

  return null;
}

/**
 * Validates, normalizes, and sanitizes untrusted LLM JSON output into a
 * strictly typed UserAction discriminated union instance.
 */
export function validateUserAction(raw: any, leadOrState?: any, rawMessageText?: string): UserAction {
  if (!raw || typeof raw !== "object") {
    return { intent: "GENERAL_QUERY", query: rawMessageText || "" };
  }

  const leadState = typeof leadOrState === "string" ? leadOrState : leadOrState?.state;
  const lastPrompt = typeof leadOrState === "object" ? leadOrState?.metadata?.last_bot_prompt : null;
  const isPostVisitSurvey = leadState === "SITE_VISIT_DONE" || leadState === "SITE_VISIT_BOOKED" || lastPrompt?.question_type === "VISIT_ATTENDANCE" || Boolean(typeof leadOrState === "object" && leadOrState?.post_visit_feedback_sent);

  const src = (raw.action && typeof raw.action === "object") ? raw.action : raw;
  const rawIntent = String(src.intent || raw.intent || "").trim().toUpperCase();

  const cleanStr = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const s = String(val).trim();
    return s.length > 0 ? s : null;
  };

  const cleanInt = (val: any): number | null => {
    if (val === undefined || val === null) return null;
    if (typeof val === "number" && !isNaN(val)) return Math.round(val);
    const s = String(val).replace(/,/g, "").trim();
    const parsed = parseInt(s, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const parseBudgetVal = (val: any): number | null => {
    if (val === undefined || val === null) return null;
    if (typeof val === "number" && !isNaN(val) && val > 0) return Math.round(val);
    const s = String(val).trim();
    if (!s) return null;
    const parsed = parseBudgetFromText(s);
    return parsed > 0 ? parsed : null;
  };

  const cleanPhone = (val: any): string | null => {
    if (!val) return null;
    const digits = String(val).replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
      const ten = digits.slice(2);
      if (/^[6-9]\d{9}$/.test(ten)) return ten;
    }
    if (digits.length === 11 && digits.startsWith("0")) {
      const ten = digits.slice(1);
      if (/^[6-9]\d{9}$/.test(ten)) return ten;
    }
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      return digits;
    }
    return null;
  };

  const parseOptionIdx = (val: any): number => {
    if (typeof val === "number" && !isNaN(val)) {
      if (val === 0) return 0;
      if (val === 1 || val === 2) return val;
      if (val >= 3) return Math.min(val - 1, 2);
      return 0;
    }
    const s = String(val || "").trim().toLowerCase();
    if (/^(?:1|1️⃣|first|1st|option\s*1|pehla|pahla)$/i.test(s)) return 0;
    if (/^(?:2|2️⃣|second|2nd|option\s*2|dusra|doosra|biji)$/i.test(s)) return 1;
    if (/^(?:3|3️⃣|third|3rd|option\s*3|teesra|tisra)$/i.test(s)) return 2;
    const parsed = parseInt(s.replace(/\D/g, ""), 10);
    if (!isNaN(parsed) && parsed >= 1) return Math.max(0, Math.min(parsed - 1, 2));
    return 0;
  };

  switch (rawIntent) {
    case "BOOK_VISIT": {
      let targetIdx: number | null = null;
      if (src.target_property_index !== undefined && src.target_property_index !== null) {
        targetIdx = parseOptionIdx(src.target_property_index);
      } else if (src.selected_option_index !== undefined && src.selected_option_index !== null) {
        targetIdx = parseOptionIdx(src.selected_option_index);
      }

      return {
        intent: "BOOK_VISIT",
        target_property_index: targetIdx,
        target_property_name: cleanStr(src.target_property_name || src.project_or_society || src.property_type),
        preferred_date_raw: cleanStr(src.preferred_date_raw || src.date_raw || src.reschedule_slot),
        preferred_time_raw: cleanStr(src.preferred_time_raw || src.time_raw),
        slot_iso: cleanStr(src.slot_iso),
      };
    }

    case "SELECT_OPTION": {
      const idxRaw = src.option_index !== undefined ? src.option_index : (src.selected_option_index !== undefined ? src.selected_option_index : src.option);
      return {
        intent: "SELECT_OPTION",
        option_index: parseOptionIdx(idxRaw),
      };
    }

    case "CHANGE_REQUIREMENT":
    case "CHANGE_CRITERIA":
    case "SEEKER_QUALIFICATION":
    case "ASK_MORE_OPTIONS":
    case "QUALIFICATION_INFO": {
      let req: "BUY" | "RENT" | "LEASE" | null = null;
      const tx = cleanStr(src.requirement || src.transaction_type);
      if (tx) {
        const uTx = tx.toUpperCase();
        if (uTx === "RENT") req = "RENT";
        else if (uTx === "LEASE") req = "LEASE";
        else if (uTx === "BUY" || uTx === "PURCHASE") req = "BUY";
      }

      // Check for rental cues in raw fields and raw query text using boundary-checked token tree
      const rawMsg = String(src.query || raw.messageText || raw.text || raw.userText || "").toLowerCase();
      const rawCombined = `${src.property_type || ""} ${src.location || ""} ${src.notes || ""} ${rawMsg}`.toLowerCase();
      if (VERNACULAR_RENTAL_REGEX.test(rawCombined)) {
        req = "RENT";
      }

      const isFlex = Boolean(
        src.is_flexible_location ||
        (src.location && String(src.location).toUpperCase() === "FLEXIBLE")
      );

      const parsedBudget = parseBudgetVal(src.budget || src.price_or_budget || src.budget_str);

      // SANITY GUARD: If residential/flat with monthly budget < 50,000, it cannot be BUY. In Indian real estate, ₹1,000 - ₹50,000 is strictly RENT!
      if (parsedBudget && parsedBudget >= 1000 && parsedBudget < 50000 && req !== "LEASE") {
        req = "RENT";
      }

      return {
        intent: "CHANGE_REQUIREMENT",
        property_type: cleanStr(src.property_type),
        budget: parsedBudget,
        location: isFlex ? "FLEXIBLE" : cleanStr(src.location),
        requirement: req,
        is_flexible_location: isFlex,
      };
    }

    case "CONFIRM_CRITERIA":
    case "CONFIRM_SAME_CRITERIA": {
      const isConfirmed = src.confirm !== false && src.confirm !== "false" && src.confirm !== 0;
      return {
        intent: "CONFIRM_CRITERIA",
        confirm: isConfirmed,
      };
    }

    case "ASK_FAQ":
    case "FAQ":
    case "GENERAL_FAQ":
    case "PRICE_NEGOTIATION": {
      let topic: AskFaqAction["topic"] = "AMENITIES";
      const rawTopic = String(src.topic || src.faq_topic || (rawIntent === "PRICE_NEGOTIATION" ? "PRICING_DISCOUNT" : "")).toUpperCase();
      if (rawTopic.includes("ADDRESS") || rawTopic.includes("LOCATION") || rawTopic.includes("OFFICE_ADDR")) topic = "OFFICE_ADDRESS";
      else if (rawTopic.includes("TIMING") || rawTopic.includes("HOUR") || rawTopic.includes("OFFICE_TIME")) topic = "OFFICE_TIMINGS";
      else if (rawTopic.includes("AGENCY") || rawTopic.includes("COMPANY") || rawTopic.includes("WHO")) topic = "AGENCY_INFO";
      else if (rawTopic.includes("CUSTOM") || rawTopic.includes("DOC") || rawTopic.includes("POLICY")) topic = "CUSTOM_FAQ";
      else if (rawTopic.includes("RERA")) topic = "RERA";
      else if (rawTopic.includes("LOAN") || rawTopic.includes("BANK")) topic = "LOAN";
      else if (rawTopic.includes("POSSESSION")) topic = "POSSESSION";
      else if (rawTopic.includes("BROKERAGE") || rawTopic.includes("COMMISSION")) topic = "BROKERAGE";
      else if (rawTopic.includes("LANDMARK") || rawTopic.includes("DISTANCE")) topic = "LANDMARKS";
      else if (rawTopic.includes("DISCOUNT") || rawTopic.includes("PRICE") || rawTopic.includes("PRICING")) topic = "PRICING_DISCOUNT";
      else if (rawTopic.includes("AMENIT") || rawTopic.includes("LIFT") || rawTopic.includes("PARKING")) topic = "AMENITIES";

      return {
        intent: "ASK_FAQ",
        topic,
        specific_query: cleanStr(src.specific_query || src.query || src.message),
      };
    }

    case "SUBMIT_LISTING":
    case "OWNER_LISTING": {
      // BHK Configuration vs Role Option 2 Collision Guard:
      // If user is in ROLE_SELECTION_PENDING and text is a BHK/property config ("2 BHK", "2bhk"),
      // LLM may falsely classify as Option 2 SUBMIT_LISTING. Correct strictly to CHANGE_REQUIREMENT!
      if (leadState === "ROLE_SELECTION_PENDING" && isBhkOrPropertyConfiguration(rawMessageText || "")) {
        const propType = parsePropertyTypeFromText(rawMessageText || "") || "2BHK";
        return {
          intent: "CHANGE_REQUIREMENT",
          property_type: propType,
          requirement: VERNACULAR_RENTAL_REGEX.test(rawMessageText || "") ? "RENT" : "BUY",
        };
      }
      let txType: "SELL" | "RENT_OUT" | null = null;
      const rawTx = cleanStr(src.transaction_type);
      if (rawTx) {
        const uTx = rawTx.toUpperCase();
        if (uTx === "RENT" || uTx === "RENT_OUT" || uTx === "LEASE") txType = "RENT_OUT";
        else if (uTx === "SELL" || uTx === "SALE") txType = "SELL";
      }

      let possStatus: "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | null = null;
      const rawPoss = cleanStr(src.possession_status);
      if (rawPoss) {
        const uPoss = rawPoss.toUpperCase();
        if (uPoss.includes("READY") || uPoss === "RTM" || uPoss === "1") possStatus = "READY_TO_MOVE";
        else if (uPoss.includes("CONSTRUCTION") || uPoss === "UC" || uPoss === "2") possStatus = "UNDER_CONSTRUCTION";
      }

      let furnStatus: "FURNISHED" | "SEMI_FURNISHED" | "UNFURNISHED" | null = null;
      const rawFurn = cleanStr(src.furnishing_status);
      if (rawFurn) {
        const uFurn = rawFurn.toUpperCase();
        if (uFurn.includes("SEMI") || uFurn === "2") furnStatus = "SEMI_FURNISHED";
        else if (uFurn.includes("UNFURNISHED") || uFurn === "1") furnStatus = "UNFURNISHED";
        else if (uFurn.includes("FURNISHED") || uFurn === "3") furnStatus = "FURNISHED";
      }

      return {
        intent: "SUBMIT_LISTING",
        transaction_type: txType,
        property_type: cleanStr(src.property_type),
        location: cleanStr(src.location),
        project_or_society: cleanStr(src.project_or_society),
        price_or_rent: parseBudgetVal(src.price_or_rent || src.price_or_budget || src.expected_price || src.expected_rent),
        carpet_sqft: cleanInt(src.carpet_sqft),
        super_built_up_sqft: cleanInt(src.super_built_up_sqft),
        plot_area_sqft: cleanInt(src.plot_area_sqft),
        possession_status: possStatus,
        furnishing_status: furnStatus,
        contact_phone: cleanPhone(src.contact_phone || src.phone),
      };
    }

    case "CANCEL_VISIT": {
      return {
        intent: "CANCEL_VISIT",
        reason: cleanStr(src.reason),
      };
    }

    case "RESCHEDULE_VISIT": {
      return {
        intent: "RESCHEDULE_VISIT",
        new_slot_raw: cleanStr(src.new_slot_raw || src.reschedule_slot || src.preferred_date_raw),
      };
    }

    case "CANNOT_ATTEND_VISIT": {
      return {
        intent: "CANNOT_ATTEND_VISIT",
        reason: cleanStr(src.reason),
      };
    }

    case "CONFIRM_VISIT_ATTENDANCE":
    case "CONFIRM_VISIT": {
      const attended = src.attended !== false && src.attended !== "false" && src.attended !== 0;
      return {
        intent: "CONFIRM_VISIT_ATTENDANCE",
        attended,
        feedback: cleanStr(src.feedback || src.reason),
      };
    }

    case "REQUEST_HUMAN_CALL":
    case "HUMAN_CALL": {
      return {
        intent: "REQUEST_HUMAN_CALL",
        reason: cleanStr(src.reason || src.query),
      };
    }

    case "BROCHURE_REQUEST": {
      return {
        intent: "BROCHURE_REQUEST",
        project_name: cleanStr(src.project_name || src.project_or_society),
      };
    }

    case "MAP_REQUEST": {
      return {
        intent: "MAP_REQUEST",
        project_name: cleanStr(src.project_name || src.project_or_society || src.location),
      };
    }

    case "MARKET_ADVISORY": {
      return {
        intent: "MARKET_ADVISORY",
        query: cleanStr(src.query || src.specific_query),
      };
    }

    case "GREETING": {
      return {
        intent: "GREETING",
        token: cleanStr(src.token),
      };
    }

    case "OPT_OUT": {
      const lowerRaw = String(rawMessageText || raw.messageText || raw.text || raw.userText || src.query || "").trim().toLowerCase();
      const isExplicitOptOut = /(?:stop|unsubscribe|not\s*interested|nathi\s*joiye|message\s*mat\s*karo|band\s*karo|dont\s*message|call\s*mat\s*karo|msg\s*mat\s*karo|don't\s*text)/i.test(lowerRaw);

      // INVERTED ANTI-OPT_OUT GUARD: OPT_OUT is mathematically impossible unless isExplicitOptOut === true
      if (!isExplicitOptOut) {
        if (leadState === "CRITERIA_CONFIRMATION_PENDING" || lastPrompt?.question_type === "CRITERIA_CONFIRM") {
          return { intent: "CONFIRM_CRITERIA", confirm: false };
        }
        if (isPostVisitSurvey) {
          return { intent: "CANNOT_ATTEND_VISIT", reason: lowerRaw };
        }
        return {
          intent: "GENERAL_QUERY",
          query: lowerRaw || "nahi",
        };
      }
      return {
        intent: "OPT_OUT",
      };
    }

    case "OFF_TOPIC": {
      return {
        intent: "OFF_TOPIC",
      };
    }

    case "GENERAL_QUERY":
    default: {
      return {
        intent: "GENERAL_QUERY",
        query: cleanStr(src.query || src.message || raw.messageText || "") || "",
      };
    }
  }
}

/**
 * Builds a backward-compatible ClassifiedActionResult from a validated UserAction
 * and raw payload for legacy downstream callers.
 */
export function buildClassifiedActionResult(
  action: UserAction,
  user_role: "SEEKER" | "OWNER" | "UNKNOWN",
  language: "HINGLISH" | "GUJLISH" | "ENGLISH" | "GUJARATI_SCRIPT",
  provider_used: "GEMINI" | "GROQ" | "DETERMINISTIC_FALLBACK",
  latency_ms: number,
  rawPayload: any = {}
): ClassifiedActionResult {
  let legacyIntent = action.intent as string;
  if (action.intent === "SUBMIT_LISTING") legacyIntent = "OWNER_LISTING";
  else if (action.intent === "CHANGE_REQUIREMENT") legacyIntent = "CHANGE_CRITERIA";
  else if (action.intent === "CONFIRM_CRITERIA") legacyIntent = "CONFIRM_SAME_CRITERIA";
  else if (action.intent === "REQUEST_HUMAN_CALL") legacyIntent = "HUMAN_CALL";
  else if (action.intent === "CONFIRM_VISIT_ATTENDANCE") legacyIntent = "CONFIRM_VISIT";
  else if (action.intent === "ASK_FAQ") {
    legacyIntent = action.topic === "PRICING_DISCOUNT" ? "PRICE_NEGOTIATION" : "FAQ";
  }

  const src = (rawPayload?.action && typeof rawPayload.action === "object") ? rawPayload.action : rawPayload;

  return {
    action,
    user_role,
    language,
    provider_used,
    latency_ms,
    raw_intent_name: action.intent,
    intent: legacyIntent,
    transaction_type: (action.intent === "SUBMIT_LISTING" ? (action.transaction_type === "RENT_OUT" ? "RENT" : action.transaction_type) : (action.intent === "CHANGE_REQUIREMENT" ? action.requirement : null)) || src?.transaction_type || null,
    property_type: (action.intent === "SUBMIT_LISTING" ? action.property_type : (action.intent === "CHANGE_REQUIREMENT" ? action.property_type : null)) || src?.property_type || null,
    location: (action.intent === "SUBMIT_LISTING" ? action.location : (action.intent === "CHANGE_REQUIREMENT" ? action.location : null)) || src?.location || null,
    is_flexible_location: (action.intent === "CHANGE_REQUIREMENT" ? action.is_flexible_location : false) || Boolean(src?.is_flexible_location),
    project_or_society: (action.intent === "SUBMIT_LISTING" ? action.project_or_society : null) || src?.project_or_society || null,
    price_or_budget: (action.intent === "SUBMIT_LISTING" ? action.price_or_rent : (action.intent === "CHANGE_REQUIREMENT" ? action.budget : null)) || src?.price_or_budget || null,
    carpet_sqft: (action.intent === "SUBMIT_LISTING" ? action.carpet_sqft : null) || src?.carpet_sqft || null,
    super_built_up_sqft: (action.intent === "SUBMIT_LISTING" ? action.super_built_up_sqft : null) || src?.super_built_up_sqft || null,
    plot_area_sqft: (action.intent === "SUBMIT_LISTING" ? action.plot_area_sqft : null) || src?.plot_area_sqft || null,
    possession_status: (action.intent === "SUBMIT_LISTING" ? action.possession_status : null) || src?.possession_status || null,
    furnishing_status: (action.intent === "SUBMIT_LISTING" ? action.furnishing_status : null) || src?.furnishing_status || null,
    reschedule_slot: (action.intent === "RESCHEDULE_VISIT" ? action.new_slot_raw : (action.intent === "BOOK_VISIT" ? action.preferred_date_raw : null)) || src?.reschedule_slot || null,
    selected_option_index: (action.intent === "SELECT_OPTION" ? action.option_index : (action.intent === "BOOK_VISIT" ? action.target_property_index : null)) ?? src?.selected_option_index ?? null,
    contact_phone: (action.intent === "SUBMIT_LISTING" ? action.contact_phone : null) || src?.contact_phone || null,
    faq_topic: (action.intent === "ASK_FAQ" ? (action.topic === "PRICING_DISCOUNT" ? "DISCOUNT" : action.topic) : null) || src?.faq_topic || null,
  };
}

export const CORE_INTENT_SYSTEM_PROMPT = `You are an expert real estate lead intent classifier for multi-tenant WhatsApp/Telegram leads.
Generate ONLY a single JSON object satisfying IntentResult.

### TYPESCRIPT DEFINITION:
\`\`\`typescript
type UserAction =
  | { intent: "BOOK_VISIT"; target_property_index?: number; target_property_name?: string; preferred_date_raw?: string; preferred_time_raw?: string; }
  | { intent: "SELECT_OPTION"; option_index: number; }
  | { intent: "CHANGE_REQUIREMENT"; property_type?: string; budget?: number; location?: string; requirement?: "BUY"|"RENT"|"LEASE"; is_flexible_location?: boolean; }
  | { intent: "CONFIRM_CRITERIA"; confirm: boolean; }
  | { intent: "ASK_FAQ"; topic: "AMENITIES"|"RERA"|"LOAN"|"POSSESSION"|"BROKERAGE"|"LANDMARKS"|"PRICING_DISCOUNT"|"OFFICE_ADDRESS"|"OFFICE_TIMINGS"|"AGENCY_INFO"|"CUSTOM_FAQ"; specific_query?: string; }
  | { intent: "SUBMIT_LISTING"; transaction_type?: "SELL"|"RENT_OUT"; property_type?: string; location?: string; project_or_society?: string; price_or_rent?: number; carpet_sqft?: number; super_built_up_sqft?: number; plot_area_sqft?: number; possession_status?: "READY_TO_MOVE"|"UNDER_CONSTRUCTION"; furnishing_status?: "FURNISHED"|"SEMI_FURNISHED"|"UNFURNISHED"; contact_phone?: string; }
  | { intent: "CANCEL_VISIT"|"CANNOT_ATTEND_VISIT"|"REQUEST_HUMAN_CALL"; reason?: string; }
  | { intent: "RESCHEDULE_VISIT"; new_slot_raw?: string; }
  | { intent: "CONFIRM_VISIT_ATTENDANCE"; attended: boolean; feedback?: string; }
  | { intent: "BROCHURE_REQUEST"|"MAP_REQUEST"; project_name?: string; }
  | { intent: "MARKET_ADVISORY"; query?: string; }
  | { intent: "GREETING"; token?: string; }
  | { intent: "OPT_OUT"|"OFF_TOPIC"; }
  | { intent: "GENERAL_QUERY"; query: string; };

interface IntentResult {
  action: UserAction;
  user_role: "SEEKER" | "OWNER" | "UNKNOWN";
  language: "HINGLISH" | "GUJLISH" | "ENGLISH" | "GUJARATI_SCRIPT";
}
\`\`\`

### ROLES: "OWNER", "SEEKER", "UNKNOWN".

### TIER 1 GLOBAL PRECEDENCE (ALWAYS OVERRIDES INTAKE):
- OPT_OUT: Explicit unsubscription only ("stop", "unsubscribe", "not interested", "message mat karo"). Conversational "nahi" is NEVER OPT_OUT!
- REQUEST_HUMAN_CALL: User asks for call/human ("call me", "agent se baat", "phone pe baat").
- BROCHURE_REQUEST / MAP_REQUEST: Direct brochure or location map ask.
- ASK_FAQ: Office address, timings, RERA, brokerage, agency info, or loan questions.

### OUTPUT FORMAT:
Respond ONLY with valid JSON satisfying IntentResult: {"action": {...}, "user_role": "...", "language": "..."}.`;

export const INTENT_CLASSIFICATION_SYSTEM_PROMPT = CORE_INTENT_SYSTEM_PROMPT;

/**
 * Builds dynamic, stage-conditioned micro-prompt (~350-450 tokens) injecting
 * state-specific rules, active turn goals, and focused exemplars.
 */
export function buildStageMicroPrompt(lead: any, currentState?: string): string {
  const state = String(currentState || lead?.state || "FRESH").trim();
  const lastPrompt = lead?.metadata?.last_bot_prompt;
  const isPostVisit =
    state === "SITE_VISIT_DONE" ||
    (state === "SITE_VISIT_BOOKED" &&
      (Boolean(lead?.post_visit_feedback_sent) || lastPrompt?.question_type === "VISIT_ATTENDANCE"));

  if (isPostVisit) {
    return `### ACTIVE STAGE RULES: POST-VISIT ATTENDANCE & FEEDBACK SURVEY
- Bot asked: 1 Attended, 2 Not Attended.
- "1" / "haan" / "visit kiya" -> CONFIRM_VISIT_ATTENDANCE (attended: true).
- "2" / "nahi" / "missed" / "visit nahi ho payi" -> CANNOT_ATTEND_VISIT (attended: false). NEVER OPT_OUT!
- Property feedback or objections ("Layout accha nai laga", "canal pass me he") -> CONFIRM_VISIT_ATTENDANCE (attended: true, feedback: "...").
- Asking for other projects/options ("Option share karo", "dusre projects batao") -> GENERAL_QUERY (query: "request_alternative_options").

### STAGE EXEMPLARS:
1. "1" / "visit attend ki" -> {"action": {"intent": "CONFIRM_VISIT_ATTENDANCE", "attended": true}, "language": "HINGLISH", "user_role": "SEEKER"}
2. "2" / "nahi ja paya" -> {"action": {"intent": "CANNOT_ATTEND_VISIT", "reason": "could_not_attend"}, "language": "HINGLISH", "user_role": "SEEKER"}
3. "Layout accha nai laga" -> {"action": {"intent": "CONFIRM_VISIT_ATTENDANCE", "attended": true, "feedback": "Layout accha nai laga"}, "language": "HINGLISH", "user_role": "SEEKER"}
4. "Option share karo" -> {"action": {"intent": "GENERAL_QUERY", "query": "request_alternative_options"}, "language": "HINGLISH", "user_role": "SEEKER"}`;
  }

  if (state === "ROLE_SELECTION_PENDING" || state === "FRESH") {
    return `### ACTIVE STAGE RULES: ROLE SELECTION & INITIAL TRIAGE
- Bot asked: 1 Buy/Rent (SEEKER), 2 Sell/Lease (OWNER), 3 Both (DUAL).
- Isolated single "1" / "leni hai" / "buy" -> CHANGE_REQUIREMENT (user_role: "SEEKER").
- Isolated single "2" / "deni hai" / "sell" -> SUBMIT_LISTING (user_role: "OWNER").
- Property specifications ("2 BHK", "2bhk in Gotri", "commercial shop", "flat") are strictly SEEKER requirements (CHANGE_REQUIREMENT). "2 BHK" is NEVER Option 2 OWNER!
- Direct owner declarations ("shop bechni he", "maro flat vechvo che") -> SUBMIT_LISTING (user_role: "OWNER").

### STAGE EXEMPLARS:
1. "1" -> {"action": {"intent": "CHANGE_REQUIREMENT"}, "language": "HINGLISH", "user_role": "SEEKER"}
2. "2" -> {"action": {"intent": "SUBMIT_LISTING"}, "language": "HINGLISH", "user_role": "OWNER"}
3. "2 BHK" -> {"action": {"intent": "CHANGE_REQUIREMENT", "property_type": "2BHK Flat", "location": "Gotri"}, "language": "HINGLISH", "user_role": "SEEKER"}
4. "shop bechni he" -> {"action": {"intent": "SUBMIT_LISTING", "transaction_type": "SELL", "property_type": "Shop"}, "language": "HINGLISH", "user_role": "OWNER"}`;
  }

  if (state === "OWNER_POSSESSION_PENDING") {
    return `### ACTIVE STAGE RULES: OWNER POSSESSION STATUS
- Role: "OWNER", intent: SUBMIT_LISTING.
- "1" -> possession_status: "READY_TO_MOVE", "2" -> possession_status: "UNDER_CONSTRUCTION". Single digit reply is strictly possession_status!

### STAGE EXEMPLARS:
1. "1" / "ready" -> {"action": {"intent": "SUBMIT_LISTING", "possession_status": "READY_TO_MOVE"}, "language": "HINGLISH", "user_role": "OWNER"}
2. "2" / "under construction" -> {"action": {"intent": "SUBMIT_LISTING", "possession_status": "UNDER_CONSTRUCTION"}, "language": "HINGLISH", "user_role": "OWNER"}`;
  }

  if (state === "OWNER_FURNISHING_PENDING") {
    return `### ACTIVE STAGE RULES: OWNER FURNISHING STATUS
- Role: "OWNER", intent: SUBMIT_LISTING.
- "1" -> furnishing_status: "UNFURNISHED", "2" -> furnishing_status: "SEMI_FURNISHED", "3" -> furnishing_status: "FURNISHED". Single digit reply is strictly furnishing_status!

### STAGE EXEMPLARS:
1. "1" -> {"action": {"intent": "SUBMIT_LISTING", "furnishing_status": "UNFURNISHED"}, "language": "HINGLISH", "user_role": "OWNER"}
2. "2" -> {"action": {"intent": "SUBMIT_LISTING", "furnishing_status": "SEMI_FURNISHED"}, "language": "HINGLISH", "user_role": "OWNER"}
3. "3" -> {"action": {"intent": "SUBMIT_LISTING", "furnishing_status": "FURNISHED"}, "language": "HINGLISH", "user_role": "OWNER"}`;
  }

  if (state.startsWith("OWNER_") && state.endsWith("_PENDING")) {
    return `### ACTIVE STAGE RULES: IN-PROGRESS OWNER INTAKE (${state})
- Role: "OWNER", intent: SUBMIT_LISTING (unless user asks Tier 1 global intent like FAQ, call, brochure).
- In OWNER_PHONE_PENDING: extract 10-digit number into contact_phone. NEVER price or budget!
- Area units: 1 Var (વાર) / Gaj = 9 sqft (e.g. 500var = 4500 sqft). 1 Vigha = 17,424 sqft.
- If user provides both society/project name and property type, extract BOTH project_or_society and property_type.

### STAGE EXEMPLARS:
1. "Plot 500var flat 1200sqft" -> {"action": {"intent": "SUBMIT_LISTING", "plot_area_sqft": 4500, "super_built_up_sqft": 1200}, "language": "GUJLISH", "user_role": "OWNER"}
2. "'Ananta astha' 3bhk duplex" -> {"action": {"intent": "SUBMIT_LISTING", "project_or_society": "Ananta Astha", "property_type": "3BHK Duplex", "transaction_type": "SELL"}, "language": "HINGLISH", "user_role": "OWNER"}`;
  }

  if (state === "QUALIFYING") {
    return `### ACTIVE STAGE RULES: BUYER / TENANT QUALIFICATION
- Role: "SEEKER", intent: CHANGE_REQUIREMENT.
- Rental indicators ("bhade", "bhadu", "bhada par", "kiraya", "rent", "reva mate") -> requirement: "RENT" (NEVER "BUY").
- Commercial lease ("office lease par", "shop on lease") -> requirement: "LEASE".
- Purchase indicators ("kharidva mate", "kharidvu che", "buy", "lena hai") -> requirement: "BUY".
- Budget ₹1,000-₹50,000 without Lakh/Cr is monthly rent (e.g. 15000 -> budget: 15000, requirement: "RENT").
- Property types ("Flat", "Villa", "Office", "Shop", "Plot", "2 BHK") are property_type, NEVER OFF_TOPIC.

### STAGE EXEMPLARS:
1. "Bhade flat reva mate" -> {"action": {"intent": "CHANGE_REQUIREMENT", "property_type": "Flat", "requirement": "RENT"}, "language": "GUJLISH", "user_role": "SEEKER"}
2. "3BHK flat in Gotri 75 lakh" -> {"action": {"intent": "CHANGE_REQUIREMENT", "property_type": "3BHK Flat", "location": "Gotri", "budget": 7500000, "requirement": "BUY"}, "language": "HINGLISH", "user_role": "SEEKER"}
3. "commercial office lease par" -> {"action": {"intent": "CHANGE_REQUIREMENT", "property_type": "Commercial Office", "requirement": "LEASE"}, "language": "HINGLISH", "user_role": "SEEKER"}
4. "15000 budget" -> {"action": {"intent": "CHANGE_REQUIREMENT", "budget": 15000, "requirement": "RENT"}, "language": "HINGLISH", "user_role": "SEEKER"}`;
  }

  if (state === "OPTIONS_SENT" || state === "VISIT_REQUESTED" || state === "SITE_VISIT_PROPOSED") {
    return `### ACTIVE STAGE RULES: PROPERTY OPTIONS & SITE VISIT BOOKING
- Option selection: "1" / "pehla" -> SELECT_OPTION (option_index: 0), "2" / "dusra" -> SELECT_OPTION (option_index: 1), "3" -> SELECT_OPTION (option_index: 2).
- Slot booking: any date/time indication ("aaj 6 baje", "Sunday 11 AM", "kal shaam 5 baje", "kale sanje 5 vage") -> BOOK_VISIT.
- In SITE_VISIT_PROPOSED, affirmative replies ("haan", "yes", "sure", "chalse") -> BOOK_VISIT.

### STAGE EXEMPLARS:
1. "aaj 6 baje" -> {"action": {"intent": "BOOK_VISIT", "preferred_date_raw": "aaj", "preferred_time_raw": "6 baje"}, "language": "HINGLISH", "user_role": "SEEKER"}
2. "Sunday 11 AM" -> {"action": {"intent": "BOOK_VISIT", "preferred_date_raw": "Sunday", "preferred_time_raw": "11 AM"}, "language": "ENGLISH", "user_role": "SEEKER"}
3. "kale sanje 5 vage" -> {"action": {"intent": "BOOK_VISIT", "preferred_date_raw": "kale", "preferred_time_raw": "sanje 5 vage"}, "language": "GUJLISH", "user_role": "SEEKER"}
4. "pehla option saras chhe" -> {"action": {"intent": "SELECT_OPTION", "option_index": 0}, "language": "GUJLISH", "user_role": "SEEKER"}`;
  }

  if (state === "CRITERIA_CONFIRMATION_PENDING") {
    return `### ACTIVE STAGE RULES: CONFIRM SEARCH CRITERIA
- Bot asked user to confirm saved requirement criteria:
- "1" / "ha" / "yes" / "barobar" / "yahi" -> CONFIRM_CRITERIA (confirm: true).
- "2" / "nahi" / "no" / "badalna" / "naya" -> CONFIRM_CRITERIA (confirm: false). NEVER OPT_OUT!

### STAGE EXEMPLARS:
1. "1" / "barobar chhe" -> {"action": {"intent": "CONFIRM_CRITERIA", "confirm": true}, "language": "GUJLISH", "user_role": "SEEKER"}
2. "2" / "nahi badalna hai" -> {"action": {"intent": "CONFIRM_CRITERIA", "confirm": false}, "language": "HINGLISH", "user_role": "SEEKER"}`;
  }

  if (state === "OWNER_DETAILS_GATHERED") {
    return `### ACTIVE STAGE RULES: POST-OWNER INTAKE FOLLOWUP
- Bot asked if owner wants to list another property, or search Buy/Rent options.
- "nahi" / "nathi karvi" / "dusri nahi hai" / "no" -> GENERAL_QUERY (query: "nahi karni"). NEVER OPT_OUT!
- Listing 2nd property ("ek aur plot bechna hai") -> SUBMIT_LISTING (user_role: "OWNER").
- Switching to search ("ab flat kharidna hai") -> CHANGE_REQUIREMENT (user_role: "SEEKER").

### STAGE EXEMPLARS:
1. "nahi karni" -> {"action": {"intent": "GENERAL_QUERY", "query": "nahi karni"}, "language": "HINGLISH", "user_role": "OWNER"}
2. "ek aur flat bechna hai" -> {"action": {"intent": "SUBMIT_LISTING", "transaction_type": "SELL", "property_type": "Flat"}, "language": "HINGLISH", "user_role": "OWNER"}
3. "ab 2bhk kharidna hai" -> {"action": {"intent": "CHANGE_REQUIREMENT", "property_type": "2BHK", "requirement": "BUY"}, "language": "HINGLISH", "user_role": "SEEKER"}`;
  }

  if (state === "DUAL_ROLE_MENU_PENDING") {
    return `### ACTIVE STAGE RULES: DUAL ROLE MENU
- Returning client menu: 1 = Provider listing action, 2 = Seeker search action, 3 = Call request.
### STAGE EXEMPLARS:
1. "1" -> {"action": {"intent": "SUBMIT_LISTING"}, "language": "HINGLISH", "user_role": "OWNER"}
2. "2" -> {"action": {"intent": "CHANGE_REQUIREMENT"}, "language": "HINGLISH", "user_role": "SEEKER"}
3. "3" / "call me" -> {"action": {"intent": "REQUEST_HUMAN_CALL"}, "language": "HINGLISH", "user_role": "UNKNOWN"}`;
  }

  if (state === "VISIT_MISSED") {
    return `### ACTIVE STAGE RULES: RESCHEDULE MISSED VISIT
- User missed scheduled visit. Any slot/date/time is RESCHEDULE_VISIT.
### STAGE EXEMPLARS:
1. "kal shaam 5 baje" -> {"action": {"intent": "RESCHEDULE_VISIT", "new_slot_raw": "kal shaam 5 baje"}, "language": "HINGLISH", "user_role": "SEEKER"}
2. "Sunday morning 11" -> {"action": {"intent": "RESCHEDULE_VISIT", "new_slot_raw": "Sunday morning 11"}, "language": "ENGLISH", "user_role": "SEEKER"}`;
  }

  return `### ACTIVE STAGE RULES: GENERAL INQUIRY & DISCOVERY
- Identify greetings, property searches, FAQs, brochure/map requests, or explicit opt-out.
### STAGE EXEMPLARS:
1. "kem cho" / "hello" -> {"action": {"intent": "GREETING"}, "language": "GUJLISH", "user_role": "UNKNOWN"}
2. "brochure bhej do" -> {"action": {"intent": "BROCHURE_REQUEST"}, "language": "HINGLISH", "user_role": "SEEKER"}
3. "aapka office address kya hai?" -> {"action": {"intent": "ASK_FAQ", "topic": "OFFICE_ADDRESS"}, "language": "HINGLISH", "user_role": "SEEKER"}
4. "stop" / "unsubscribe" -> {"action": {"intent": "OPT_OUT"}, "language": "ENGLISH", "user_role": "UNKNOWN"}`;
}

export function deriveBotQuestionType(nextState: string, replyText: string, metadata?: any): string | null {
  if (!replyText || !replyText.trim()) return null;
  if (metadata?.last_bot_prompt?.question_type) return metadata.last_bot_prompt.question_type;
  if (nextState === "OWNER_DETAILS_GATHERED") return "SECOND_PROPERTY_LISTING";
  if (nextState === "SITE_VISIT_DONE" || (nextState === "SITE_VISIT_BOOKED" && /1️⃣|2️⃣|visit attend|attended/i.test(replyText))) return "VISIT_ATTENDANCE";
  if (nextState === "CRITERIA_CONFIRMATION_PENDING") return "CRITERIA_CONFIRM";
  if (nextState === "DUAL_ROLE_MENU_PENDING") return "DUAL_ROLE_SELECTION";
  if (nextState === "OPTIONS_SENT" || nextState === "VISIT_REQUESTED") return "VISIT_SLOT";
  if (typeof nextState === "string" && nextState.startsWith("OWNER_") && nextState.endsWith("_PENDING")) return "OWNER_FIELD";
  if (nextState === "QUALIFYING") return "QUALIFYING_FIELD";
  if (nextState === "VISIT_MISSED") return "RESCHEDULE_SLOT";
  if (replyText.includes("?") || /1️⃣|2️⃣|3️⃣/.test(replyText)) return "GENERAL_QUESTION";
  return null;
}

export function buildLeadContextForClassifier(lead: any, messageText: string): string {
  const isInProgressOwner = [
    "OWNER_CONFIG_PENDING",
    "OWNER_SOCIETY_PENDING",
    "OWNER_LOCATION_PENDING",
    "OWNER_AREA_PENDING",
    "OWNER_SIZE_PENDING",
    "OWNER_PRICE_PENDING",
    "OWNER_AMENITIES_PENDING",
    "OWNER_POSSESSION_PENDING",
    "OWNER_FURNISHING_PENDING",
    "OWNER_PHONE_PENDING",
  ].includes(lead?.state);

  const lockedTx = lead?.metadata?.owner_draft?.transaction_type || lead?.requirement || null;
  const knownPhone = lead?.phone || lead?.metadata?.owner_draft?.contact_phone || null;

  // Stale Prompt Decay (> 72 hours)
  const lastPrompt = lead?.metadata?.last_bot_prompt;
  let lastBotPromptText = "None";
  let isPromptStale = false;
  if (lastPrompt && lastPrompt.asked_at) {
    const promptAgeHours = (Date.now() - new Date(lastPrompt.asked_at).getTime()) / (1000 * 60 * 60);
    if (promptAgeHours > 72) {
      isPromptStale = true;
      lastBotPromptText = `${lastPrompt.question_type || "GENERAL"} - "${lastPrompt.text_preview || ""}" (STALE / > 72h ago)`;
    } else {
      lastBotPromptText = `${lastPrompt.question_type || "GENERAL"} - "${lastPrompt.text_preview || ""}"`;
    }
  }

  let currentPendingQuestion = "NONE";
  const state = lead?.state;

  if (state === "OWNER_DETAILS_GATHERED") {
    currentPendingQuestion = "SECOND_PROPERTY_LISTING_OR_BUYER_SEARCH (Bot asked if they want to list another property, or search Buy/Rent options. 'Nahi', 'nahi karni', or 'nathi karvi' means DECLINE_SECOND_LISTING, NEVER OPT_OUT!)";
  } else if (state === "SITE_VISIT_DONE" || (state === "SITE_VISIT_BOOKED" && (lead?.post_visit_feedback_sent || lastPrompt?.question_type === "VISIT_ATTENDANCE"))) {
    currentPendingQuestion = "POST_VISIT_ATTENDANCE (Bot asked: 1 Attended, 2 Not Attended. 'Nahi' / '2' / 'visit nahi ho paayi' is strictly CANNOT_ATTEND_VISIT, NEVER OPT_OUT!)";
  } else if (state === "CRITERIA_CONFIRMATION_PENDING" || lastPrompt?.question_type === "CRITERIA_CONFIRM") {
    currentPendingQuestion = "CONFIRM_CRITERIA (Bot asked to confirm requirement. 'Nahi' / '2' / 'badalna hai' is CONFIRM_CRITERIA with confirm: false)";
  } else if (state === "DUAL_ROLE_MENU_PENDING" || lastPrompt?.question_type === "DUAL_ROLE_SELECTION") {
    currentPendingQuestion = "DUAL_ROLE_SELECTION (1 Reschedule/Search, 2 Status, 3 Call)";
  } else if (state === "VISIT_MISSED" || lastPrompt?.question_type === "RESCHEDULE_SLOT") {
    currentPendingQuestion = "RESCHEDULE_SLOT (Bot asked for convenient day/time to reschedule missed visit)";
  } else if (state === "OPTIONS_SENT" || state === "VISIT_REQUESTED" || state === "SITE_VISIT_PROPOSED" || lastPrompt?.question_type === "VISIT_SLOT") {
    currentPendingQuestion = "VISIT_SLOT_OR_OPTION_SELECTION (Bot sent property cards or proposed a site visit. Any date, time, day, slot, or affirmative response is strictly BOOK_VISIT or SELECT_OPTION!)";
  } else if (state === "ROLE_SELECTION_PENDING") {
    currentPendingQuestion = "ROLE_SELECTION (Bot asked user: 1 or 'Leni hai' to Buy/Rent properties, 2 or 'Deni hai' to Sell/Rent Out their property. Replies indicating property types like 'Office', 'Residential', 'Commercial', 'Shop', 'Flat' are SEEKER requests, NEVER OFF_TOPIC!)";
  } else if (state === "OWNER_CONFIG_PENDING") {
    currentPendingQuestion = "PROPERTY_CONFIG (Bot asked for property type / configuration: Flat, Villa, Commercial Office, Shop, Plot. If user specifies project/society name too, extract BOTH project_or_society and property_type!)";
  } else if (state === "OWNER_SOCIETY_PENDING") {
    currentPendingQuestion = "SOCIETY_OR_ROAD (Bot asked for Commercial Complex, Business Hub, Society, or Road name)";
  } else if (state === "OWNER_LOCATION_PENDING") {
    currentPendingQuestion = "LOCATION_AREA (Bot asked for exact area / locality in the city)";
  } else if (state === "OWNER_AREA_PENDING" || state === "OWNER_SIZE_PENDING") {
    currentPendingQuestion = "CARPET_AREA_SQFT (Bot asked for Carpet / Plot / Built-up Area. Extract numbers into carpet_sqft, super_built_up_sqft, or plot_area_sqft)";
  } else if (state === "OWNER_PRICE_PENDING") {
    currentPendingQuestion = "PRICE_OR_RENT (Bot asked for expected selling price or monthly rent. If user specifies built-up or plot area, extract super_built_up_sqft / plot_area_sqft!)";
  } else if (state === "OWNER_AMENITIES_PENDING") {
    currentPendingQuestion = "PARKING_POSSESSION_PHONE (Bot asked for car parking availability, possession status, and direct contact phone)";
  } else if (state === "OWNER_POSSESSION_PENDING") {
    currentPendingQuestion = "POSSESSION_STATUS (Bot asked: 1 Ready to Move, 2 Under Construction. Single digit reply is strictly possession_status!)";
  } else if (state === "OWNER_FURNISHING_PENDING") {
    currentPendingQuestion = "FURNISHING_STATUS (Bot asked: 1 Unfurnished, 2 Semi-Furnished, 3 Fully Furnished. Single digit reply is strictly furnishing_status, DO NOT hallucinate transaction_type or price!)";
  } else if (state === "OWNER_PHONE_PENDING") {
    currentPendingQuestion = "CONTACT_PHONE (Bot asked for direct calling/WhatsApp number. Extract 10-digit number into contact_phone)";
  } else if (state === "QUALIFYING") {
    if (!lead?.property_type) currentPendingQuestion = "SEEKER_PROPERTY_TYPE (Bot asked what type of property: Residential, Commercial, Flat, Office, Villa, Shop. Replies with property types are strictly CHANGE_REQUIREMENT, NEVER OFF_TOPIC!)";
    else if (!lead?.requirement) currentPendingQuestion = "SEEKER_REQUIREMENT (Buy or Rent)";
    else if (!lead?.location) currentPendingQuestion = "SEEKER_LOCATION";
    else if (!lead?.budget) currentPendingQuestion = "SEEKER_BUDGET (A numeric reply is price_or_budget)";
    else if (!lead?.timeline) currentPendingQuestion = "SEEKER_TIMELINE";
    else currentPendingQuestion = "SEEKER_QUALIFYING_FIELD";
  } else if (state && state.startsWith("OWNER_") && state.endsWith("_PENDING")) {
    currentPendingQuestion = "OWNER_INTAKE_FIELD";
  }

  const stageMicroPrompt = buildStageMicroPrompt(lead, lead?.state);

  return `LEAD STATUS:
- Active Persona: ${lead?.lead_type || "UNKNOWN"}
- State: ${lead?.state || "FRESH"}
- Suspended Detour State: ${lead?.metadata?.suspended_state || "None"}
- In-Progress Owner Intake: ${isInProgressOwner ? "YES" : "NO"}
- Known Locked Transaction: ${lockedTx || "None"}
- Known User Phone: ${knownPhone || "None"}
- Bot Question Waiting For: ${currentPendingQuestion}
- LAST BOT PROMPT: "${lastBotPromptText}"${isPromptStale ? " (Note: This prompt is stale >72h and should not constrain unprompted queries)" : ""}
- Known Property Type: ${lead?.property_type || lead?.metadata?.owner_draft?.property_type || "None"}
- Known Location: ${lead?.location || lead?.metadata?.owner_draft?.location || "None"}
- Known Budget/Price: ${lead?.budget || lead?.metadata?.owner_draft?.expected_price || lead?.metadata?.owner_draft?.expected_rent || "None"}
- Known Carpet Area: ${lead?.metadata?.owner_draft?.carpet_area_sqft ? `${lead.metadata.owner_draft.carpet_area_sqft} sq.ft` : "None"}
- Known Built-up Area: ${lead?.metadata?.owner_draft?.super_built_up_sqft ? `${lead.metadata.owner_draft.super_built_up_sqft} sq.ft` : "None"}
- Has Active Site Visit: ${lead?.site_visit_booked ? "YES" : "NO"}

${stageMicroPrompt}

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

  const fullPrompt = `${CORE_INTENT_SYSTEM_PROMPT}\n\n${userContent}`;

  const candidates = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${cleanKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${cleanKey}`,
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
          if (parsed && (parsed.action || parsed.intent)) {
            parsed.messageText = messageText;
            const action = validateUserAction(parsed, lead, messageText);
            const userRole = parsed.user_role || (action.intent === "SUBMIT_LISTING" ? "OWNER" : "SEEKER");
            const lang = parsed.language || "HINGLISH";
            return buildClassifiedActionResult(action, userRole, lang, "GEMINI", 0, parsed);
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
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
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
            { role: "system", content: CORE_INTENT_SYSTEM_PROMPT },
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
              { role: "system", content: CORE_INTENT_SYSTEM_PROMPT },
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
          if (parsed && (parsed.action || parsed.intent)) {
            parsed.messageText = messageText;
            const action = validateUserAction(parsed, lead, messageText);
            const userRole = parsed.user_role || (action.intent === "SUBMIT_LISTING" ? "OWNER" : "SEEKER");
            const lang = parsed.language || "HINGLISH";
            return buildClassifiedActionResult(action, userRole, lang, "GROQ", 0, parsed);
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

  // 0. Deterministic Gibberish / Keystroke Mash Guard
  if (isGibberishOrInvalidInput(messageText)) {
    console.log(`[classifyLeadIntent] Intercepted gibberish input: "${messageText}" -> Returning OFF_TOPIC`);
    const action: UserAction = { intent: "OFF_TOPIC" };
    return buildClassifiedActionResult(
      action,
      "UNKNOWN",
      lead?.user_language || "HINGLISH",
      "DETERMINISTIC_FALLBACK",
      0,
      { action }
    );
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const groqKey = Deno.env.get("GROQ_API_KEY") || "";

  // 1. Primary: Groq Llama 3.3 (Sub-second latency ~600-700ms)
  if (groqKey) {
    try {
      const result = await classifyLeadIntentWithGroq(groqKey, messageText, lead);
      if (result && result.action) {
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
      if (result && result.action) {
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
  const normalizedMsg = normalizeGujaratiDigits(messageText);
  const lower = normalizedMsg.toLowerCase();
  let fallbackIntent: ClassifiedIntent["intent"] = "UNKNOWN";

  // Deterministic single-digit disambiguation across states
  const digitChoice = parseSingleDigitChoice(normalizedMsg);
  if (digitChoice !== null && lead?.state) {
    const disambiguated = disambiguateNumericChoice(digitChoice, lead.state, lead, normalizedMsg);
    if (disambiguated) {
      return buildClassifiedActionResult(
        disambiguated.action,
        disambiguated.userRole,
        detectLanguage(normalizedMsg, lead?.user_language),
        "DETERMINISTIC_FALLBACK",
        Date.now() - start,
        { action: disambiguated.action }
      );
    }
  }

  // BHK Configuration vs Role Option 2 Collision Guard in ROLE_SELECTION_PENDING
  if (lead?.state === "ROLE_SELECTION_PENDING" && isBhkOrPropertyConfiguration(normalizedMsg)) {
    const propType = parsePropertyTypeFromText(normalizedMsg) || "2BHK";
    const action: UserAction = {
      intent: "CHANGE_REQUIREMENT",
      property_type: propType,
      requirement: VERNACULAR_RENTAL_REGEX.test(lower) ? "RENT" : "BUY",
    };
    return buildClassifiedActionResult(
      action,
      "SEEKER",
      detectLanguage(normalizedMsg, lead?.user_language),
      "DETERMINISTIC_FALLBACK",
      Date.now() - start,
      { action }
    );
  }

  if (lower === "stop" || lower.includes("unsubscribe") || lower.includes("not interested")) {
    fallbackIntent = "OPT_OUT";
  } else if (lead?.post_visit_feedback_sent) {
    if (
      /(?:^|\b)(?:2|2️⃣|two|option\s*2)\b/i.test(lower) ||
      /(?:nahi|nhi|na|no|nope|nathi|miss|missed|couldn't|cancel)/i.test(lower) ||
      /(?:site\s*visit|visit).*?(?:nahi|nhi|nathi|not|nai)\s*(?:kar|kiya|ki|karyo|attend)?/i.test(lower)
    ) {
      fallbackIntent = "CANNOT_ATTEND_VISIT";
    } else if (
      /(?:^|\b)(?:1|1️⃣|one|option\s*1)\b/i.test(lower) ||
      /(?:ha|haan|ji\s*haan|yes|yep|yeah|attended|gaya|gaye|kari|kiya|karyo|thayo)/i.test(lower)
    ) {
      fallbackIntent = "CONFIRM_VISIT_ATTENDANCE";
    }
  } else if (lead?.state === "CRITERIA_CONFIRMATION_PENDING") {
    if (/^(1|1️⃣|first|1st|ha|haan|ha ji|yes|same|isi me|yahi|yahi criteria|dikhao|sure|chalo|done|ok|okay|sahi hai|barobar|saras)$/i.test(lower) || lower.includes("isi criteria") || lower.includes("same criteria") || lower.includes("yahi")) {
      fallbackIntent = "CONFIRM_CRITERIA";
    } else if (/^(2|2️⃣|second|2nd|nahi|no|change|badalna|dusra|naya|different|modify)$/i.test(lower) || lower.includes("change") || lower.includes("badal") || lower.includes("dusra")) {
      fallbackIntent = "CHANGE_REQUIREMENT";
    }
  } else if (
    /(?:^|\b)(?:ha\s+|haan\s+|ji\s+)?(?:me\s+|hum\s+|mai\s+|hu\s+|ame\s+)?(?:nai|nahi|nhi|na|nathi)\s*(?:aa\s*sakta|aa\s*sakti|aa\s*paunga|aa\s*paungi|aa\s*payenge|aa\s*paenge|aa\s*raha|aa\s*rahe|aana|aunga|aungi|ja\s*sakta|ja\s*paunga|pahunch\s*sakta|pahunch\s*paunga|ho\s*payega|hoga\s*aaj|possible\s*nahi|aavi\s*saku|aavi\s*shaku|aavi\s*sakyo|aavi\s*shakay|aavay|aavish|aa\s*saku)/i.test(lower) ||
    /(nahi\s*aa\s*paya|nahi\s*aa\s*paye|miss\s*ho\s*gaya|emergency|couldn't\s*come|cannot\s*make\s*it|won't\s*be\s*able\s*to\s*come)/i.test(lower) ||
    /(nathi\s*aavi\s*sakyo|nathi\s*aavi\s*saku|nai\s*aavi\s*saku|aaje\s*nahi\s*aavay|aaje\s*nai\s*aavay|aaje\s*nathi\s*aavay)/i.test(lower) ||
    /(?:mene|maine|hu|ame|hum|hamne)?\s*(?:site\s*visit|visit)\s*(?:nahi|nhi|nathi|nai)\s*(?:kiya|ki|kari|karyo|attend|gaya)/i.test(lower) ||
    (/(?:site\s*visit|visit).*?(?:nai|nahi|nathi|not|cannot|can't|miss)/i.test(lower) && !lower.includes("reschedule") && !lower.includes("cancel"))
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
  } else if (
    /(?:mera|meri|maro|mari|mere|mara|amaro|apna|own|paas)\s+(?:flat|makan|ghar|house|villa|plot|zameen|jamin|shop|dukan|office|showroom|shed|godown|warehouse|property)\s+(?:bechna|bechni|vechvu|vechvo|vechva|sell|bikri|rent\s*par|bhadu|bhaade|kiraya|kiraye|lease)/i.test(lower) ||
    /(?:dusri|biji|ek\s*aur|nayi|navi)\s*(?:property|flat|office|shop|plot)\s*(?:sell|bech|list|rent\s*par\s*den|bhade\s*pe|chadani)/i.test(lower) ||
    /(?:bechna|bechni|vechvu|vechva|bikri|sell\s+my|sell\s+property|want\s+to\s+sell|property\s+sell|rent\s+par\s+den|bhaade\s+aap|kiraye\s+par\s+den|lease\s+par\s+den|list\s+karvi|list\s+karna|owner\s+listing)/i.test(lower) ||
    /(?:property\s+deni\s+hai|shop\s+deni\s+hai|flat\s+dena\s+hai|office\s+dena\s+hai|office\s+deni\s+hai|ghar\s+bechna|bhade\s+pe\s+chadani|bhade\s+chadani)/i.test(lower)
  ) {
    fallbackIntent = "OWNER_LISTING";
  } else if (
    /(?:qur|aur|biji|more|other)\s*(?:property|flat|option|options)\b/i.test(lower) ||
    /(?:dusri\s*property|aur\s*option|aur\s*flat|kuch\s*aur|kuch\s*naya|biji\s*property|more\s*options|other\s*options|different\s*property)/i.test(lower) ||
    /(?:options?\s*(?:dikhao|dikhavo|batao|batavo|aapo))/i.test(lower)
  ) {
    fallbackIntent = "ASK_MORE_OPTIONS";
  } else if (
    /(nayi\s*requirement|navi\s*requirement|nayi\s*property|navi\s*property|naya\s*property|naya\s*search|nayi\s*search|navi\s*search|nava\s*criteria|naya\s*criteria|change\s*criteria|criteria\s*badal|fresh\s*search|fresh\s*requirement|start\s*fresh|reset\s*criteria|naya\s*dekhna|nayi\s*dekhni|kuch\s*naya\s*dekhna|nayi\s*chahiye|navi\s*joiye)/i.test(lower)
  ) {
    fallbackIntent = "CHANGE_CRITERIA";
  } else if (/\b(hi|hello|hey|kem cho|namaste)\b/i.test(lower)) {
    fallbackIntent = "GREETING";
  }

  // Robust Slot Detection for OPTIONS_SENT, VISIT_REQUESTED or SITE_VISIT_PROPOSED in deterministic fallback
  const slotRegex = /\b(aaj|kal|kale|kaale|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage))\b/i;
  if ((lead?.state === "OPTIONS_SENT" || lead?.state === "VISIT_REQUESTED" || lead?.state === "SITE_VISIT_PROPOSED") && slotRegex.test(lower)) {
    fallbackIntent = "BOOK_VISIT";
  } else if (lead?.state === "SITE_VISIT_PROPOSED" && /^(haan|ha|yes|yep|sure|done|theek hai|chalse|chalshe|ok|okay|ha ji|haanji)\b/i.test(lower)) {
    fallbackIntent = "BOOK_VISIT";
  }

  // Pure Property Type mention Guard (e.g. "2 BHK", "Villa", "Commercial Shop")
  // If user mentions a property type without explicit owner selling keywords, it is strictly SEEKER criteria!
  const hasDetectedPropType = Boolean(parsePropertyTypeFromText(messageText));
  const hasExplicitOwnerAction = /(?:bechna|bechni|bechne|vechvu|vechva|vechvo|sell|selling|bikri|deni|dena|dene|list|listing|chadani)/i.test(lower);

  // Handle explicit 1 vs 2 in ROLE_SELECTION_PENDING
  if (lead?.state === "ROLE_SELECTION_PENDING") {
    const isPureOption2 =
      /^(?:2|2️⃣|option\s*2|second|2nd)(?:\s*(?:no|number|num|chhe|che|karo|bhai|ji|vala|wala))?$/i.test(lower.trim()) ||
      /^(?:deni|dene|sell|bechna|vechvu|vechva|rent\s*out|rent\s*pe\s*deni|list|listing)\b/i.test(lower.trim());
    const isPureOption1 =
      /^(?:1|1️⃣|option\s*1|first|1st)(?:\s*(?:no|number|num|chhe|che|karo|bhai|ji|vala|wala))?$/i.test(lower.trim()) ||
      /^(?:leni|lena|lene|kharidna|kharidvu|buy|rent\s*pe\s*chahiye|search)\b/i.test(lower.trim());

    if (isPureOption2 && !isBhkOrPropertyConfiguration(normalizedMsg) && !hasDetectedPropType) {
      fallbackIntent = "OWNER_LISTING";
    } else if (isPureOption1 || hasDetectedPropType || isBhkOrPropertyConfiguration(normalizedMsg)) {
      fallbackIntent = "SEEKER_QUALIFICATION";
    }
  }

  // Handle returning completed owner choices in RETURNING_OWNER_MENU_PENDING
  if (lead?.state === "RETURNING_OWNER_MENU_PENDING") {
    if (/^(1|1️⃣|option\s*1|first|1st|leni|lene|kharidna|buy|rent\s*pe\s*chahiye|search|flat\s*chahiye)\b/i.test(lower.trim())) {
      fallbackIntent = "SEEKER_QUALIFICATION";
    } else if (/^(2|2️⃣|option\s*2|second|2nd|dusri|biji|deni|dene|sell|bechna|list)\b/i.test(lower.trim())) {
      fallbackIntent = "OWNER_LISTING";
    } else if (/^(3|3️⃣|option\s*3|third|3rd|status|update|check)\b/i.test(lower.trim())) {
      fallbackIntent = "UNKNOWN";
    }
  }

  // Handle previous visit cancellation confirmation in CANCEL_PREVIOUS_VISIT_CONFIRMATION_PENDING
  if (lead?.state === "CANCEL_PREVIOUS_VISIT_CONFIRMATION_PENDING") {
    if (/^(1|1️⃣|option\s*1|first|1st|ha|haan|yes|yep|sure|cancel)\b/i.test(lower.trim()) || lower.includes("cancel") || lower.includes("nayi book")) {
      fallbackIntent = "CONFIRM_VISIT";
    } else if (/^(2|2️⃣|option\s*2|second|2nd|nahi|no|nope|purani|continue|mat\s*karo)\b/i.test(lower.trim()) || lower.includes("mat karo") || lower.includes("purani")) {
      fallbackIntent = "CONFIRM_SAME_CRITERIA";
    }
  }

  const isInOwnerIntake = [
    "OWNER_CONFIG_PENDING",
    "OWNER_SOCIETY_PENDING",
    "OWNER_LOCATION_PENDING",
    "OWNER_AREA_PENDING",
    "OWNER_PRICE_PENDING",
    "OWNER_AMENITIES_PENDING",
    "OWNER_POSSESSION_PENDING",
    "OWNER_FURNISHING_PENDING",
    "OWNER_PHONE_PENDING",
  ].includes(lead?.state);

  if (isInOwnerIntake && fallbackIntent === "UNKNOWN") {
    fallbackIntent = "OWNER_LISTING";
  }

  // Dual-role seeker detection for completed providers
  const isCompletedOwner = lead?.state === "OWNER_DETAILS_GATHERED";
  const hasSeekerKeywords =
    fallbackIntent === "SEEKER_QUALIFICATION" ||
    fallbackIntent === "ASK_MORE_OPTIONS" ||
    /(?:chahiye|chahye|chahie|chaiye|joiye|joyiye|joie|buy|kharid|khareed|purchase|dekhna|dekhni|levu\s*chhe|dikhao|dikhavo|batavo|batao|options)/i.test(lower) ||
    (/\b([1-5]\s*bhk|flat|villa|office|shop|plot)\b/i.test(lower) && /\b(chahiye|joiye|buy|kharid|dekhna|budget|me|mein)\b/i.test(lower));

  if (isCompletedOwner && hasSeekerKeywords && fallbackIntent === "UNKNOWN") {
    fallbackIntent = "SEEKER_QUALIFICATION";
  }

  if (hasDetectedPropType && !hasExplicitOwnerAction && !isInOwnerIntake) {
    if (fallbackIntent === "UNKNOWN" || fallbackIntent === "OWNER_LISTING") {
      fallbackIntent = "CHANGE_CRITERIA";
    }
  }

  let isOwnerMsg = false;
  if (isInOwnerIntake) {
    isOwnerMsg = true;
  } else if (fallbackIntent === "OWNER_LISTING" && (!hasDetectedPropType || hasExplicitOwnerAction)) {
    isOwnerMsg = true;
  } else if (lead?.lead_type === "PROVIDER" && !isCompletedOwner && !hasDetectedPropType) {
    isOwnerMsg = true;
  } else if (isCompletedOwner && !hasSeekerKeywords && fallbackIntent !== "GREETING" && fallbackIntent !== "OPT_OUT") {
    // If completed owner without seeker keywords or greeting, preserve owner context
    isOwnerMsg = true;
  }

  const userRole: "OWNER" | "SEEKER" | "UNKNOWN" = isOwnerMsg
    ? "OWNER"
    : (fallbackIntent === "GREETING" || fallbackIntent === "OPT_OUT" ? "UNKNOWN" : "SEEKER");
  const parsedPrice = parseBudgetFromText(messageText);
  const parsedArea = parseAreaFromText(messageText);
  const isFlexLoc = /(?:^|\b)(?:koi\s*bhi|kahi\s*bhi|kahi\s*pan|koi\s*pan|gamete|any\s*location|any\s*area|anywhere|all\s*over|no\s*preference|flexible|kuch\s*bhi|koi\s*fix\s*nathi|koi\s*fix\s*nahi|chalegi|chalega|chalse)\b/i.test(lower);

  const fallbackPayload = {
    intent: fallbackIntent,
    user_role: userRole,
    language: detectLanguage(normalizedMsg, lead?.user_language),
    transaction_type: VERNACULAR_RENTAL_REGEX.test(lower) ? "RENT" : /(?:buy|kharid|purchase)/i.test(lower) ? "BUY" : VERNACULAR_SALE_REGEX.test(lower) ? "SELL" : null,
    property_type: parsePropertyTypeFromText(normalizedMsg) || null,
    location: isFlexLoc ? "FLEXIBLE" : null,
    is_flexible_location: isFlexLoc,
    price_or_budget: parsedPrice > 0 ? parsedPrice : null,
    carpet_sqft: parsedArea.carpet_sqft,
    super_built_up_sqft: parsedArea.super_built_up_sqft,
    plot_area_sqft: parsedArea.plot_area_sqft,
    preferred_date_raw: fallbackIntent === "BOOK_VISIT" ? normalizedMsg : null,
  };

  const action = validateUserAction(fallbackPayload, lead, normalizedMsg);
  return buildClassifiedActionResult(
    action,
    userRole,
    fallbackPayload.language,
    "DETERMINISTIC_FALLBACK",
    Date.now() - start,
    fallbackPayload
  );
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

function matchesListingType(leadReq?: string | null, propListingType?: string | null, propPrice?: number, isCommercial?: boolean): boolean {
  if (!leadReq) return true;
  const r = String(leadReq).toUpperCase().trim();
  const l = String(propListingType || "").toUpperCase().trim();
  const price = Number(propPrice || 0);

  if (r === "LEASE" || (isCommercial && (r === "RENT" || r === "LEASE"))) {
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
    : formatPriceShort(priceNum);

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
    if (p.map_url) links.push(`📍 <a href="${p.map_url}">View on Google Maps</a>`);
    if (p.brochure_url) links.push(`📄 <a href="${p.brochure_url}">Download Brochure</a>`);
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
  if (p.map_url) links.push(`📍 <a href="${p.map_url}">View on Google Maps</a>`);
  if (p.brochure_url) links.push(`📄 <a href="${p.brochure_url}">Download Brochure</a>`);
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

/**
 * Robustly resolve property project name and details for a lead across all sweep modules.
 * Fallback chain:
 * 1. l.selected_property_id -> query inventory
 * 2. l.site_visits (query latest site visit for this lead) -> query inventory using visit.property_id
 * 3. l.metadata?.selected_property_name
 * 4. l.last_option_ids?.[0] -> query inventory
 * 5. Tenant default available inventory
 * 6. Fallback string: "VIP Property" (Never bare lowercase "the property" or "the project")
 */
async function resolveLeadProjectName(
  l: any,
  supabase: any,
  tenantId?: string
): Promise<{ projectName: string; prop: any }> {
  let prop: any = null;
  const effectiveTenantId = l?.client_id || tenantId || defaultTenantId;
  const candidatePropId = l?.selected_property_id;

  // 1. Direct selected_property_id from leads table
  if (candidatePropId) {
    let q = supabase.from("inventory").select("*").eq("property_id", candidatePropId);
    if (effectiveTenantId) q = q.eq("client_id", effectiveTenantId);
    const { data: p } = await q.maybeSingle();
    if (p) prop = p;
  }

  // 2. Query site_visits table linked to this lead (for booked/completed/rescheduled visits)
  if (!prop && l?.id) {
    let vQuery = supabase.from("site_visits").select("property_id").eq("lead_id", l.id).not("status", "eq", "CANCELLED");
    if (effectiveTenantId) vQuery = vQuery.eq("client_id", effectiveTenantId);
    const { data: visits } = await vQuery
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (visits && visits.length > 0 && visits[0].property_id) {
      let q = supabase.from("inventory").select("*").eq("property_id", visits[0].property_id);
      if (effectiveTenantId) q = q.eq("client_id", effectiveTenantId);
      const { data: p } = await q.maybeSingle();
      if (p) prop = p;
    }
  }

  // 3. Fallback to last_option_ids?.[0]
  if (!prop && Array.isArray(l?.last_option_ids) && l.last_option_ids.length > 0) {
    let q = supabase.from("inventory").select("*").eq("property_id", l.last_option_ids[0]);
    if (effectiveTenantId) q = q.eq("client_id", effectiveTenantId);
    const { data: p } = await q.maybeSingle();
    if (p) prop = p;
  }

  // Determine cleanest project name from metadata if already recorded
  const rawMetaName =
    l?.metadata?.selected_property_name ||
    l?.metadata?.owner_draft?.project_name;

  // 4. Fallback to tenant default available inventory ONLY if neither prop nor rawMetaName is known
  if (!prop && !rawMetaName && effectiveTenantId) {
    const { data: p } = await supabase
      .from("inventory")
      .select("*")
      .eq("client_id", effectiveTenantId)
      .eq("status", "AVAILABLE")
      .limit(1)
      .maybeSingle();
    if (p) prop = p;
  }

  let projectName = prop?.project_name || rawMetaName;

  if (
    !projectName ||
    typeof projectName !== "string" ||
    projectName.trim() === "" ||
    projectName.toLowerCase() === "the property" ||
    projectName.toLowerCase() === "the project"
  ) {
    projectName = "VIP Property";
  }

  return { projectName: projectName.trim(), prop };
}

async function executeAutomatedCronSweep(options: SweepOptions = {}) {
  const sweepLog: any = {
    started_at: new Date().toISOString(),
    morning_briefings: [],
    pre_visit_reminders: [],
    post_visit_feedbacks: [],
    missed_visit_followups: [],
    daily_followups: [],
    post_visit_drips: [],
    errors: [],
  };

  const nowMs = Date.now();
  const runAll = !options.types || options.types.length === 0;
  const runPreVisit = runAll || options.types.includes("pre_visit");
  const runPostVisit = runAll || options.types.includes("post_visit");
  const runMissedVisit = runAll || options.types.includes("missed_visit") || options.types.includes("post_visit");
  const runDaily = runAll || options.types.includes("daily_followup");
  const runPostVisitDrip = runAll || options.types.includes("post_visit_drip");

  try {
    // Multi-tenant: Cache client bot tokens & WABA credentials
    const { data: clientRows } = await supabase
      .from("clients")
      .select("id, bot_token, whatsapp_phone_number_id, phone_number_id, access_token")
      .eq("is_active", true);

    const tenantBotTokens: Record<string, string> = {};
    const tenantWabaCreds: Record<string, { phoneId: string; accessToken: string }> = {};

    if (clientRows) {
      for (const c of clientRows) {
        if (c.id && c.bot_token) tenantBotTokens[c.id] = c.bot_token;
        const phoneId = c.whatsapp_phone_number_id || c.phone_number_id;
        if (c.id && phoneId && c.access_token) {
          tenantWabaCreds[c.id] = { phoneId, accessToken: c.access_token };
        }
      }
    }

    const getTenantBotToken = (tenantId?: string | null): string => {
      if (tenantId && tenantBotTokens[tenantId]) return tenantBotTokens[tenantId];
      return defaultBotToken;
    };

    const getTenantWaba = (tenantId?: string | null): { phoneId: string; accessToken: string } => {
      if (tenantId && tenantWabaCreds[tenantId]) return tenantWabaCreds[tenantId];
      return {
        phoneId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
        accessToken: Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "",
      };
    };

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

            const leadTenantId = l.client_id || defaultTenantId;
            const botToken = getTenantBotToken(l.client_id);
            const { projectName, prop } = await resolveLeadProjectName(l, supabase, leadTenantId);
            const propLoc = prop?.location || "the site";
            const mapUrl = prop?.map_url || "https://maps.google.com";
            const mapLink = formatMapHyperlink(mapUrl, "View on Google Maps");
            const formattedTime = visitDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
            const lang = l.user_language || "HINGLISH";
            const name = l.first_name || "Customer";

            let briefingMsg = "";
            if (lang === "GUJLISH") {
              briefingMsg = `Suprabhat <b>${name} bhai</b>! 🌅\n\nAaje tamari <b>${projectName}</b> (${propLoc}) mate VIP Site Visit <b>${formattedTime}</b> par scheduled chhe! 🚗\n\n${mapLink}\n\n🤝 <b>Site par maliye chhiye!</b> Amara senior sales executive time par direct site location par tamne malshe. Shu timing confirm samjie?`;
            } else if (lang === "ENGLISH") {
              briefingMsg = `Good morning <b>${name}</b>! 🌅\n\nA quick briefing that your VIP Site Visit for <b>${projectName}</b> (${propLoc}) is scheduled today at <b>${formattedTime}</b>! 🚗\n\n${mapLink}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the site location. Looking forward to meeting you!`;
            } else {
              briefingMsg = `Suprabhat <b>${name} ji</b>! 🌅\n\nAaj aapki <b>${projectName}</b> (${propLoc}) ke liye VIP Site Visit <b>${formattedTime}</b> par scheduled hai! 🚗\n\n${mapLink}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par direct site location par aapse milenge. Kya hum timing confirm samjhein?`;
            }

            await sleepJitter();

            const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
            let dispatchRes: any;
            if (isTelegram) {
              dispatchRes = await sendTelegramMessage(botToken, l.lead_id, briefingMsg);
            } else {
              const { phoneId: waPhoneId, accessToken: waToken } = getTenantWaba(l.client_id);
              dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, briefingMsg);
            }

            await supabase
              .from("leads")
              .update({
                metadata: {
                  ...metadata,
                  morning_briefing_sent: true,
                  morning_briefing_at: new Date().toISOString(),
                  last_bot_prompt: {
                    question_type: "VISIT_REMINDER",
                    text_preview: briefingMsg.slice(0, 150),
                    asked_at: new Date().toISOString(),
                  },
                },
              })
              .eq("id", l.id);

            await supabase.from("lead_events").insert({
              client_id: leadTenantId,
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

            const leadTenantId = l.client_id || defaultTenantId;
            const botToken = getTenantBotToken(l.client_id);

            // Property details
            const { projectName, prop } = await resolveLeadProjectName(l, supabase, leadTenantId);
            const propLoc = prop?.location || "the site";
            const mapUrl = prop?.map_url || "https://maps.google.com";
            const mapLink = formatMapHyperlink(mapUrl, "View on Google Maps");
            const formattedTime = new Date(visitTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
            const lang = l.user_language || "HINGLISH";
            const name = l.first_name || "Customer";

            let reminderMsg = "";
            if (lang === "GUJLISH") {
              reminderMsg = `Namaste <b>${name} bhai</b>! ⏰ Reminder: Tamari <b>${projectName}</b> (${propLoc}) mate VIP Site Visit <b>1 kalak ma (${formattedTime})</b> scheduled chhe! 🚗\n\n${mapLink}\n\n🤝 <b>Site par maliye chhiye!</b> Amara senior sales executive time par direct site location par tamne malshe. Jo time ma thodo ferfar hoy to janavjo!`;
            } else if (lang === "ENGLISH") {
              reminderMsg = `Hello <b>${name}</b>! ⏰ Reminder: Your VIP Site Visit for <b>${projectName}</b> (${propLoc}) is scheduled in <b>1 hour at ${formattedTime}</b>! 🚗\n\n${mapLink}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the site on time. Please let us know if you need any adjustments to your schedule!`;
            } else {
              reminderMsg = `Namaste <b>${name} ji</b>! ⏰ Reminder: Aapki <b>${projectName}</b> (${propLoc}) ke liye VIP Site Visit <b>1 ghante me (${formattedTime})</b> scheduled hai! 🚗\n\n${mapLink}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par direct site location par aapse milenge. Agar timing me thoda aage-piche ho to kripya bataiye!`;
            }

            await sleepJitter();

            const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
            let dispatchRes: any;
            if (isTelegram) {
              dispatchRes = await sendTelegramMessage(botToken, l.lead_id, reminderMsg);
            } else {
              const { phoneId: waPhoneId, accessToken: waToken } = getTenantWaba(l.client_id);
              dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, reminderMsg);
            }

            await supabase.from("leads").update({
              pre_visit_reminder_sent: true,
              metadata: {
                ...(l.metadata || {}),
                last_bot_prompt: {
                  question_type: "VISIT_TIMING_CHECK",
                  text_preview: reminderMsg.slice(0, 150),
                  asked_at: new Date().toISOString(),
                },
              },
            }).eq("id", l.id);
            await supabase.from("site_visits").update({ reminder_2h_sent: true }).eq("lead_id", l.id);
            await supabase.from("lead_events").insert({
              client_id: leadTenantId,
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

            const leadTenantId = l.client_id || defaultTenantId;
            const botToken = getTenantBotToken(l.client_id);
            const { projectName, prop } = await resolveLeadProjectName(l, supabase, leadTenantId);
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
              dispatchRes = await sendTelegramMessage(botToken, l.lead_id, feedbackMsg);
            } else {
              const { phoneId: waPhoneId, accessToken: waToken } = getTenantWaba(l.client_id);
              dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, feedbackMsg);
            }

            await supabase.from("leads").update({
              post_visit_feedback_sent: true,
              last_followup_at: new Date().toISOString(),
              last_active_at: new Date().toISOString(),
              metadata: {
                ...(l.metadata || {}),
                last_bot_prompt: {
                  question_type: "VISIT_ATTENDANCE",
                  text_preview: feedbackMsg.slice(0, 150),
                  asked_at: new Date().toISOString(),
                },
              },
            }).eq("id", l.id);

            // Note: Keep site_visits status as SCHEDULED until user confirms attendance!
            await supabase.from("site_visits").update({
              notes: "Post-visit attendance confirmation sent to customer"
            }).eq("lead_id", l.id).eq("status", "SCHEDULED");

            await supabase.from("lead_events").insert({
              client_id: leadTenantId,
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

              const leadTenantId = l.client_id || defaultTenantId;
              const botToken = getTenantBotToken(l.client_id);
              const { projectName, prop } = await resolveLeadProjectName(l, supabase, leadTenantId);
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
                await sendTelegramMessage(botToken, l.lead_id, nudgeMsg);
              } else {
                const { phoneId: waPhoneId, accessToken: waToken } = getTenantWaba(l.client_id);
                await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, nudgeMsg);
              }

              const updatedMeta = {
                ...meta,
                post_visit_nudge_sent: true,
                post_visit_nudge_at: new Date().toISOString(),
                last_bot_prompt: {
                  question_type: "VISIT_ATTENDANCE",
                  text_preview: nudgeMsg.slice(0, 150),
                  asked_at: new Date().toISOString(),
                },
              };

              await supabase.from("leads").update({
                metadata: updatedMeta,
                last_followup_at: new Date().toISOString(),
              }).eq("id", l.id);

              // If hoursSinceCheck >= 36 and alert not sent yet, alert sales team for courtesy call
              if (hoursSinceCheck >= 36 && !meta.unconfirmed_visit_alert_sent) {
                await dispatchSalesAlert(leadTenantId, "UNCONFIRMED_VISIT", l, { property: prop });
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
    // 2C. MODULE 2C: MISSED VISIT RESCHEDULE SWEEP (2-48 Hours After Missed Visit)
    // =========================================================================
    if (runMissedVisit) {
      const inBusinessHours = isWithinWorkingHours(11, 19);
      if (inBusinessHours || options.force) {
        let qMissed = supabase
          .from("leads")
          .select("*")
          .eq("state", "VISIT_MISSED")
          .or("bot_active.is.null,bot_active.eq.true");

        if (options.testLeadId) {
          qMissed = qMissed.eq("lead_id", options.testLeadId);
        }
        qMissed = qMissed.order("last_active_at", { ascending: true, nullsFirst: true }).limit(BATCH_LIMIT);

        const { data: missedLeads, error: mErr } = await qMissed;
        if (mErr) {
          sweepLog.errors.push({ module: "missed_visit_sweep", error: mErr.message });
        } else if (missedLeads) {
          for (const l of missedLeads) {
            try {
              const meta = (typeof l.metadata === "object" && l.metadata !== null) ? (l.metadata as Record<string, unknown>) : {};
              if (meta.missed_visit_reschedule_nudge_sent && !options.force) continue;

              const lastActive = l.last_active_at || l.updated_at || l.created_at;
              const hoursSinceLast = lastActive ? (nowMs - new Date(lastActive).getTime()) / (1000 * 3600) : 999;

              // Send reschedule invitation between 2 and 48 hours after visit was marked missed
              if (!options.force && (hoursSinceLast < 2 || hoursSinceLast > 48)) continue;

              const leadTenantId = l.client_id || defaultTenantId;
              const botToken = getTenantBotToken(l.client_id);
              const { projectName, prop } = await resolveLeadProjectName(l, supabase, leadTenantId);
              const lang = l.user_language || "HINGLISH";
              const name = l.first_name || "Customer";

              let rescheduleMsg = "";
              if (lang === "GUJLISH") {
                rescheduleMsg = `Namaste <b>${name} bhai</b>! 🙏\n\nTamari <b>${projectName}</b> mate VIP site visit miss thai hati. Shu ame aa athvadiye tamara anukool samay par navi visit plan kariye? 🚗📍\n\n👉 <b>Tame anukool divas ane samay (jem ke: 'Kaale 4 vage' ke 'Sunday 11 vage') lakhi ne mokli shako chho!</b>`;
              } else if (lang === "ENGLISH") {
                rescheduleMsg = `Hello <b>${name}</b>! 🙏\n\nWe noticed your VIP site visit for <b>${projectName}</b> was missed. Would you like to reschedule for a convenient day this week? 🚗📍\n\n👉 <b>Simply reply with your preferred day and time (e.g., 'Tomorrow 4 PM' or 'Saturday 11 AM')!</b>`;
              } else {
                rescheduleMsg = `Namaste <b>${name} ji</b>! 🙏\nAapki <b>${projectName}</b> ke liye VIP site visit miss ho gayi thi. Kya hum is week aapke liye ek fresh convenient timing par visit schedule karein? 🚗📍\n\n👉 <b>Aap apna convenient din aur samay (jaise: 'Kal 4 baje' ya 'Sunday subah 11 baje') likhkar bhej sakte hain!</b>`;
              }

              await sleepJitter();

              const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
              let dispatchRes: any;
              if (isTelegram) {
                dispatchRes = await sendTelegramMessage(botToken, l.lead_id, rescheduleMsg);
              } else {
                const { phoneId: waPhoneId, accessToken: waToken } = getTenantWaba(l.client_id);
                dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, rescheduleMsg);
              }

              const updatedMeta = {
                ...meta,
                missed_visit_reschedule_nudge_sent: true,
                missed_visit_reschedule_nudge_at: new Date().toISOString(),
                last_bot_prompt: {
                  question_type: "RESCHEDULE_SLOT",
                  text_preview: rescheduleMsg.slice(0, 150),
                  asked_at: new Date().toISOString(),
                },
              };

              await supabase.from("leads").update({
                metadata: updatedMeta,
                last_followup_at: new Date().toISOString(),
              }).eq("id", l.id);

              await supabase.from("lead_events").insert({
                client_id: leadTenantId,
                lead_id: l.lead_id,
                event_type: "MISSED_VISIT_RESCHEDULE_NUDGE_SENT",
                payload: { projectName, hoursSinceLast: Math.round(hoursSinceLast * 10) / 10, dispatchRes },
              });

              sweepLog.missed_visit_followups.push({ lead_id: l.lead_id, name, projectName, hoursSinceLast });
            } catch (itemErr: any) {
              sweepLog.errors.push({ module: "missed_visit_item", lead_id: l.lead_id, error: itemErr.message });
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
                const leadTenantId = l.client_id || defaultTenantId;
                const { projectName } = await resolveLeadProjectName(l, supabase, leadTenantId);
                const topProject = projectName && projectName !== "VIP Property" ? projectName : "selected property";

                if (lang === "GUJLISH") {
                  nudgeMsg = `Namaste <b>${name} bhai</b>! 👋 Ame je properties share kari hati (jaise <b>${topProject}</b>), shu tame check kari? Developer taraf thi limited units par <b>exclusive price sheet ane spot token booking benefits</b> chali rahya chhe. Jo tame direct inspection karva mangta ho, to ame <b>kaale sanje 5 vage</b> VIP Site Visit arrange kari shakie chhiye. 🚗`;
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

              const leadTenantId = l.client_id || defaultTenantId;
              const botToken = getTenantBotToken(l.client_id);
              const isTelegram = /^[0-9]+$/.test(l.lead_id) || !l.phone || l.phone.startsWith("tg_") || String(l.metadata?.platform).toUpperCase() === "TELEGRAM";
              let dispatchRes: any;
              if (isTelegram) {
                dispatchRes = await sendTelegramMessage(botToken, l.lead_id, nudgeMsg);
              } else {
                const { phoneId: waPhoneId, accessToken: waToken } = getTenantWaba(l.client_id);
                dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, nudgeMsg);
              }

              const newCount = (l.followup_count || 0) + 1;
              const dripStage = l.state === "OPTIONS_SENT" ? "OPTIONS_NUDGE" : "QUALIFYING_NUDGE";
              const dailyQType = l.state === "OPTIONS_SENT" ? "VISIT_SLOT" : (l.state === "QUALIFYING" ? "QUALIFYING_FIELD" : "GENERAL_QUESTION");

              await supabase.from("leads").update({
                last_followup_at: new Date().toISOString(),
                followup_count: newCount,
                drip_stage: dripStage,
                metadata: {
                  ...(l.metadata || {}),
                  last_bot_prompt: {
                    question_type: dailyQType,
                    text_preview: nudgeMsg.slice(0, 150),
                    asked_at: new Date().toISOString(),
                  },
                },
              }).eq("id", l.id);

              await supabase.from("lead_events").insert({
                client_id: leadTenantId,
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

              const leadTenantId = l.client_id || defaultTenantId;
              const botToken = getTenantBotToken(l.client_id);
              const { projectName, prop } = await resolveLeadProjectName(l, supabase, leadTenantId);
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
                dispatchRes = await sendTelegramMessage(botToken, l.lead_id, dripMsg);
              } else {
                const { phoneId: waPhoneId, accessToken: waToken } = getTenantWaba(l.client_id);
                dispatchRes = await sendWhatsAppMessage(waPhoneId, waToken, l.phone || l.lead_id, dripMsg);
              }

              await supabase.from("leads").update({
                last_followup_at: new Date().toISOString(),
                drip_stage: nextDripStage,
                metadata: {
                  ...(l.metadata || {}),
                  last_bot_prompt: {
                    question_type: "POST_VISIT_DRIP",
                    text_preview: dripMsg.slice(0, 150),
                    asked_at: new Date().toISOString(),
                  },
                },
              }).eq("id", l.id);

              await supabase.from("lead_events").insert({
                client_id: leadTenantId,
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
function parseFloorFromText(text: string): { floor_number: number | string | null; total_floors: number | null } {
  if (!text) return { floor_number: null, total_floors: null };
  const lower = text.toLowerCase().trim();

  let floorNum: number | string | null = null;
  let totalFloors: number | null = null;

  // 1. "Xth floor of Y" or "X/Y floor" or "X out of Y"
  const comboMatch = lower.match(/(?:(\d+)(?:st|nd|rd|th)?\s*(?:floor)?\s*(?:out\s*of|\/|of)\s*(\d+)(?:\s*floors?)?)/i) ||
                     lower.match(/(\d+)\s*\/\s*(\d+)\s*(?:floor)?/i);
  if (comboMatch) {
    floorNum = parseInt(comboMatch[1], 10);
    totalFloors = parseInt(comboMatch[2], 10);
    return { floor_number: floorNum, total_floors: totalFloors };
  }

  // 2. Ground floor / Basement / Top floor
  if (/\b(?:ground\s*floor|ground|gf)\b/i.test(lower)) {
    floorNum = 0;
  } else if (/\b(?:basement|lower\s*ground|lg)\b/i.test(lower)) {
    floorNum = -1;
  } else if (/\b(?:top\s*floor|highest\s*floor)\b/i.test(lower)) {
    floorNum = "Top";
  }

  // 3. Single floor: "4th floor", "floor 4", "4 floor", "4th", "3rd floor", "1st floor", "2nd floor", "5th floor"
  if (floorNum === null) {
    const singleMatch = lower.match(/(?:floor\s*[:=-]?\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*floor|(\d+)\s*floor)/i);
    if (singleMatch) {
      const val = parseInt(singleMatch[1] || singleMatch[2] || singleMatch[3], 10);
      if (val >= 0 && val <= 150) {
        floorNum = val;
      }
    }
  }

  // Total floors: "total 10 floors", "10 floors building"
  const totalMatch = lower.match(/(?:total\s*(\d+)\s*floors?|(\d+)\s*floors?\s*(?:building|tower|society|complex))/i);
  if (totalMatch) {
    totalFloors = parseInt(totalMatch[1] || totalMatch[2], 10);
  }

  return { floor_number: floorNum, total_floors: totalFloors };
}

function parseParkingFromText(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // Negative parking: "no parking", "none", "nahi", "nathi", "no", "0"
  if (/\b(?:no\s*parking|none|nathi|nahi|na|no|zero|0\s*parking)\b/i.test(lower)) {
    return "None";
  }

  // Explicit counts with covered / open: "1 covered", "2 covered", "1 open", "2 cars", "car parking 1"
  const countMatch = lower.match(/(\d+)\s*(?:covered|car|cars|open|parking|slot|slots|gadi)/i) ||
                     lower.match(/(?:covered|open)\s*(\d+)/i);
  if (countMatch) {
    const isCovered = lower.includes("covered") || !lower.includes("open");
    const count = countMatch[1] || "1";
    return `${count} ${isCovered ? "Covered" : "Open"}`;
  }

  if (lower.includes("covered")) return "1 Covered";
  if (lower.includes("open")) return "Open";
  if (/\b(?:parking|car\s*parking|gadi|yes|ha|haan|available|chhe|hai)\b/i.test(lower)) {
    return "Available";
  }

  return null;
}

function parseFurnishingFromText(text: string): "UNFURNISHED" | "SEMI_FURNISHED" | "FURNISHED" | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // Commercial bare / warm shell, or unfurnished
  if (/\b(?:bare\s*shell|warm\s*shell|raw|unfurnished|un-furnished|un\s*furnished)\b/i.test(lower) || lower === "1" || lower === "1️⃣") {
    return "UNFURNISHED";
  }

  // Semi-furnished
  if (/\b(?:semi\s*furnished|semi-furnished|semi)\b/i.test(lower) || lower === "2" || lower === "2️⃣") {
    return "SEMI_FURNISHED";
  }

  // Fully furnished / plug and play
  if (/\b(?:plug\s*(?:and|&)\s*play|fully\s*furnished|full\s*furnished|furnished|full)\b/i.test(lower) || lower === "3" || lower === "3️⃣") {
    return "FURNISHED";
  }

  return null;
}

function parsePossessionFromText(text: string): "READY_TO_MOVE" | "UNDER_CONSTRUCTION" | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  if (/\b(?:ready\s*to\s*move|rtm|ready|tayyar|possession\s*ready)\b/i.test(lower) || lower === "1" || lower === "1️⃣") {
    return "READY_TO_MOVE";
  }

  if (/\b(?:under\s*construction|construction|uc|progress|chalu|in\s*progress)\b/i.test(lower) || lower === "2" || lower === "2️⃣") {
    return "UNDER_CONSTRUCTION";
  }

  return null;
}

function parsePhoneFromText(text: string): string | null {
  if (!text) return null;
  const match = text.match(/(?:(?:\+?91[\s-]?)?[6-9]\d{9})\b/);
  if (match) {
    const digits = match[0].replace(/\D/g, "");
    return digits.slice(-10);
  }
  return null;
}

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
}): Promise<{ replyText: string; nextState: string; leadUpdates?: any }> {
  // 1. Initialize or load in-progress draft from metadata
  const existingMeta = lead.metadata || {};
  let draft = existingMeta.owner_draft || {};
  if (!draft.attributes) draft.attributes = {};

  // Unconditional multi-property check on existing draft (e.g. from ROLE_SELECTION_PENDING)
  if (draft.property_type && (!draft.queued_properties || draft.queued_properties.length === 0)) {
    const multiMatch = String(draft.property_type).match(/^(.+?)(?:,|\s+(?:and|ane|aur|\+)\s+)(.+)$/i) ||
                       messageText.match(/(?:(?:1|ek)\s*([0-9a-z\s]+?)\s*(?:ane|aur|and|,)\s*(?:1|ek)\s*([0-9a-z\s]+))/i);
    if (multiMatch) {
      const prop1 = multiMatch[1].trim();
      const prop2 = multiMatch[2].trim();
      draft.property_type = prop1;
      draft.configuration = prop1;
      draft.queued_properties = [{
        property_type: prop2,
        configuration: prop2,
        transaction_type: draft.transaction_type || "SELL",
        status: "QUEUED",
      }];
    }
  }

  const isDualLead = lead.lead_type === "DUAL_ROLE" || Boolean(existingMeta.has_buyer_profile || lead.budget || lead.property_type || lead.site_visit_at || lead.site_visit_booked);
  const effectiveOwnerLeadType = isDualLead ? "DUAL_ROLE" : "PROVIDER";

  const buildOwnerLeadUpdates = (targetState: string, customDraft = draft, extraMeta: Record<string, any> = {}) => ({
    lead_type: targetState === "QUALIFYING" ? "DUAL_ROLE" : effectiveOwnerLeadType,
    state: targetState,
    metadata: {
      ...(lead.metadata || {}),
      has_seller_profile: true,
      ...(isDualLead || targetState === "QUALIFYING" ? { has_buyer_profile: true, ...(targetState === "QUALIFYING" ? { active_persona: "BUYER" } : {}) } : {}),
      owner_draft: customDraft,
      ...(lead.metadata?.suspended_state ? { suspended_state: null } : {}),
      ...extraMeta,
    },
  });

  // Auto-assign owner leads to Admin executive immediately upon starting intake
  if (!lead.assigned_executive_id) {
    const { data: adminExec } = await supabase
      .from("executives")
      .select("id")
      .eq("client_id", tenantId)
      .ilike("role", "admin")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (adminExec?.id) {
      lead.assigned_executive_id = adminExec.id;
      await supabase.from("leads").update({ assigned_executive_id: adminExec.id }).eq("id", lead.id);
    }
  }

  // 1b. Direct accumulative AI entities merge (100% Zero-Regex Architecture):
  if (aiAnalysis) {
    // A. Transaction Type Immutability & Commercial Lease:
    // Once locked (SELL, RENT_OUT, LEASE_OUT), single digits or detail replies must NEVER overwrite it!
    const hasExplicitRoleReversal = /(?:bechna|bechni|sell|bikri|rent\s*out|bhadu|kiraye|rent\s*par|lease|pattay)/i.test(messageText);
    const hasLeaseKeyword = /(?:lease|pattay|long\s*term\s*lease|corporate\s*lease)/i.test(messageText);
    if (!draft.transaction_type || hasExplicitRoleReversal) {
      if (hasLeaseKeyword || aiAnalysis.transaction_type === "LEASE") {
        draft.transaction_type = "LEASE_OUT";
        if (!draft.property_category) draft.property_category = "COMMERCIAL";
      } else if (aiAnalysis.transaction_type === "RENT") {
        draft.transaction_type = "RENT_OUT";
      } else if (aiAnalysis.transaction_type === "SELL" || aiAnalysis.transaction_type === "SALE") {
        draft.transaction_type = "SELL";
      } else if (/(?:rent|bhade|bhadu|kiraya|kiraye)/i.test(messageText)) {
        draft.transaction_type = "RENT_OUT";
      } else if (/(?:bechna|bechni|sell|vechvu|vechva)/i.test(messageText)) {
        draft.transaction_type = "SELL";
      }
    }
    if (!draft.transaction_type) {
      draft.transaction_type = hasLeaseKeyword ? "LEASE_OUT" : "SELL";
    }

    // B. Property Category & Type:
    // Once established (e.g. Villa), subsequent turns mentioning "plot area" or "built-up" must NOT overwrite property_type!
    const hasPropCorrection = /(?:badalna|change|nhi|nahi|villa\s*nahi|flat\s*nahi)/i.test(messageText);
    if (aiAnalysis.property_type && (!draft.property_type || hasPropCorrection)) {
      let incomingProp = aiAnalysis.property_type;

      // Multi-property detection: e.g. "3BHK Flat, Plot", "1 3bhk ane 1 plot", "Flat and Plot", "Flat, Shop"
      const multiMatch = incomingProp.match(/^(.+?)(?:,|\s+(?:and|ane|aur|\+)\s+)(.+)$/i) ||
                         messageText.match(/(?:(?:1|ek)\s*([0-9a-z\s]+?)\s*(?:ane|aur|and|,)\s*(?:1|ek)\s*([0-9a-z\s]+))/i);
      if (multiMatch) {
        const prop1 = multiMatch[1].trim();
        const prop2 = multiMatch[2].trim();
        incomingProp = prop1;
        if (!draft.queued_properties || draft.queued_properties.length === 0) {
          draft.queued_properties = [{
            property_type: prop2,
            configuration: prop2,
            transaction_type: draft.transaction_type,
            status: "QUEUED"
          }];
        }
      }

      draft.property_type = incomingProp;
      draft.configuration = incomingProp;
    }
    if (aiAnalysis.property_category && (!draft.property_category || hasPropCorrection)) {
      draft.property_category = aiAnalysis.property_category;
    }

    // C. Project / Society Name:
    if (aiAnalysis.project_or_society) {
      const cleanSoc = aiAnalysis.project_or_society.replace(/^(?:ye|meri|mera|maro|mari|in|at)\s+/i, "").trim();
      if (isLikelySocietyOrProjectName(cleanSoc)) {
        draft.society_name = cleanSoc;
        draft.project_name = cleanSoc;
      }
    }

    // D. Location:
    if (aiAnalysis.location && aiAnalysis.location !== "FLEXIBLE") {
      const cleanLoc = aiAnalysis.location.trim();
      if (isLikelySocietyOrProjectName(cleanLoc)) {
        draft.location = cleanLoc;
      }
    }

    // E. Areas (Carpet, Super Built-up, Plot Area):
    const areaFallback = parseAreaFromText(messageText);
    const carpetVal = aiAnalysis.carpet_sqft || areaFallback.carpet_sqft;
    const superBuiltVal = aiAnalysis.super_built_up_sqft || areaFallback.super_built_up_sqft;
    const plotVal = aiAnalysis.plot_area_sqft || areaFallback.plot_area_sqft;

    if (carpetVal) {
      draft.carpet_area_sqft = carpetVal;
    }
    if (superBuiltVal) {
      draft.super_built_up_sqft = superBuiltVal;
      draft.attributes.built_up_area = superBuiltVal;
    }
    if (plotVal) {
      if (draft.queued_properties && draft.queued_properties.some((q: any) => /(?:plot|land|zameen)/i.test(q.property_type))) {
        const queuedPlot = draft.queued_properties.find((q: any) => /(?:plot|land|zameen)/i.test(q.property_type));
        if (queuedPlot) {
          queuedPlot.plot_area_sqft = plotVal;
        }
      } else if (/(?:plot|land|zameen)/i.test(draft.property_type || "")) {
        draft.plot_area_sqft = plotVal;
        draft.attributes.plot_area = plotVal;
        if (!draft.carpet_area_sqft) {
          draft.carpet_area_sqft = plotVal;
        }
      } else {
        draft.plot_area_sqft = plotVal;
        draft.attributes.plot_area = plotVal;
      }
    }

    // E2. Floor extraction (F-07 / Turn 4):
    const floorFallback = parseFloorFromText(messageText);
    if (floorFallback.floor_number !== null) {
      draft.attributes.floor_number = floorFallback.floor_number;
    }
    if (floorFallback.total_floors !== null) {
      draft.attributes.total_floors = floorFallback.total_floors;
    }

    // F. Expected Price / Demand / Monthly Rent:
    const isAnsweringPhone = lead.state === "OWNER_PHONE_PENDING" || !!aiAnalysis.contact_phone;
    const resolvedPrice = aiAnalysis.price_or_budget || (!isAnsweringPhone ? parseBudgetFromText(messageText) : null);
    if (resolvedPrice && !isAnsweringPhone) {
      const isRentTx = draft.transaction_type === "RENT_OUT" || draft.transaction_type === "LEASE_OUT";
      const hasValidPrice = (!isRentTx && (draft.expected_price || 0) >= 100000) || (isRentTx && (draft.expected_rent || 0) >= 3000);
      if (!hasValidPrice || lead.state === "OWNER_PRICE_PENDING") {
        if (isRentTx) {
          // Sanity check: In Indian real estate, residential rent rarely exceeds ₹15 Lakhs/month.
          // Amounts >= ₹15 Lakhs without explicit /month are selling prices or demands.
          if (resolvedPrice < 1500000) {
            draft.expected_rent = resolvedPrice;
          } else {
            draft.expected_price = resolvedPrice;
            draft.transaction_type = "SELL";
          }
        } else {
          draft.expected_price = resolvedPrice;
        }
      }
    }

    // G. Possession Status:
    const parsedPoss = parsePossessionFromText(messageText);
    if (parsedPoss) {
      draft.possession_status = parsedPoss;
    } else if (aiAnalysis?.possession_status) {
      draft.possession_status = aiAnalysis.possession_status;
    } else if (lead.state === "OWNER_POSSESSION_PENDING" || lead.state === "OWNER_AMENITIES_PENDING") {
      if (lower === "1" || lower === "1️⃣" || lower.includes("ready") || lower.includes("rtm")) {
        draft.possession_status = "READY_TO_MOVE";
      } else if (lower === "2" || lower === "2️⃣" || lower.includes("under construction") || lower.includes("uc")) {
        draft.possession_status = "UNDER_CONSTRUCTION";
      }
    }

    // H. Furnishing Status:
    const parsedFurn = parseFurnishingFromText(messageText);
    if (parsedFurn) {
      draft.furnishing_status = parsedFurn;
    } else if (aiAnalysis?.furnishing_status) {
      draft.furnishing_status = aiAnalysis.furnishing_status;
    } else if (lead.state === "OWNER_FURNISHING_PENDING" || lead.state === "OWNER_PRICE_PENDING") {
      if (lower === "1" || lower === "1️⃣" || lower.includes("unfurnished")) {
        draft.furnishing_status = "UNFURNISHED";
      } else if (lower === "2" || lower === "2️⃣" || lower.includes("semi")) {
        draft.furnishing_status = "SEMI_FURNISHED";
      } else if (lower === "3" || lower === "3️⃣" || lower.includes("full") || lower.includes("furnished")) {
        draft.furnishing_status = "FURNISHED";
      }
    }

    // H2. Parking:
    const parsedPark = parseParkingFromText(messageText);
    if (parsedPark) {
      draft.attributes.parking = parsedPark;
    }

    // I. Direct Calling / WhatsApp Phone (if provided):
    const parsedPh = parsePhoneFromText(messageText);
    if (parsedPh) {
      draft.contact_phone = parsedPh;
    } else if (aiAnalysis?.contact_phone) {
      const cleanPhone = aiAnalysis.contact_phone.replace(/\D/g, "");
      if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
        draft.contact_phone = cleanPhone.slice(-10);
      }
    } else if (lead.state === "OWNER_PHONE_PENDING" || lead.state === "OWNER_AMENITIES_PENDING") {
      const cleanPhone = messageText.replace(/\D/g, "");
      if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
        draft.contact_phone = cleanPhone.slice(-10);
      }
    }
  }

  // 1b2. Fallback property type extraction & simultaneous project/society extraction:
  if (!draft.property_type) {
    const parsedProp = parsePropertyTypeFromText(messageText);
    if (parsedProp) {
      draft.property_type = parsedProp;
      draft.configuration = parsedProp;
    }
  }

  if (!draft.society_name && !draft.project_name) {
    const extractedProj = extractProjectOrSocietyFromText(messageText, draft.property_type);
    if (extractedProj) {
      const cleanSoc = formatSocietyName(extractedProj);
      if (cleanSoc.length >= 2) {
        draft.society_name = cleanSoc;
        draft.project_name = cleanSoc;
      }
    }
  }

  // 1c. In-House Buyer Matching / Demand Status Inquiry ("Koi buyer mila?", "Inquiry aayi?")
  const isBuyerDemandInquiry =
    /(?:buyer|khareedne\s*wala|kharidne\s*wala|graahak|grahak|customer|inquiry|inquiries|koi\s*aaya|koi\s*aayi|koi\s*mila|ketla\s*malya|any\s*buyers|interested\s*buyers)/i.test(lower) &&
    !/(?:chahiye|joiye|kharidna\s*hai|buy\s*karna|looking\s*to\s*buy)/i.test(lower);

  if (isBuyerDemandInquiry) {
    const cleanPhone = (lead.phone || senderId || "").replace(/\D/g, "").slice(-10);
    let sub = null;
    const orFilters = [
      lead.id ? `lead_id.eq.${lead.id}` : null,
      lead.lead_id ? `lead_id.eq.${lead.lead_id}` : null,
      cleanPhone ? `owner_phone.ilike.%${cleanPhone}%` : null,
    ].filter(Boolean).join(",");

    let subs = null;
    if (orFilters.length > 0) {
      const { data } = await supabase
        .from("property_submissions")
        .select("*")
        .eq("client_id", tenantId)
        .or(orFilters)
        .order("created_at", { ascending: false })
        .limit(1);
      subs = data;
    }

    if (subs && subs.length > 0) {
      sub = subs[0];
    } else if (draft && (draft.society_name || draft.configuration)) {
      sub = draft;
    }

    if (!sub) {
      const replyText =
        lang === "GUJLISH"
          ? `Ji <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Tamari property haji amara portal par listed nathi. Kripya tamari property details (area, type, expected price) share karo jethi ame verified buyers connect kari shakiye! 🏡`
          : lang === "ENGLISH"
          ? `Hello <b>${senderName || "Friend"}</b>! We don't have an active property listing recorded for you yet. Please share your property details so we can match you with verified buyers! 🏡`
          : `Ji <b>${senderName ? `${senderName} ji` : "ji"}</b>! Aapki property abhi hamare portal par listed nahi hai. Kripya apni property details (area, type, expected price) share karein taaki hum verified buyers connect kar sakein! 🏡`;
      return { replyText, nextState: "OWNER_CONFIG_PENDING", leadUpdates: buildOwnerLeadUpdates("OWNER_CONFIG_PENDING") };
    }

    const subLoc = (sub.location || "").toLowerCase().trim();
    const subConfig = (sub.configuration || sub.property_type || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const subPrice = Number(sub.expected_price || sub.expected_rent || 0);

    // Query active buyer leads in same tenant
    const { data: buyerLeads } = await supabase
      .from("leads")
      .select("id, first_name, phone, location, property_type, requirement, budget, state, lead_type")
      .eq("client_id", tenantId)
      .neq("state", "DROPPED")
      .neq("state", "VISIT_CANCELLED")
      .neq("id", lead.id);

    const matchingBuyers = (buyerLeads || []).filter((b: any) => {
      if (b.lead_type === "PROVIDER") return false;
      if (cleanPhone && b.phone) {
        const bClean = b.phone.replace(/\D/g, "").slice(-10);
        if (bClean && bClean === cleanPhone) return false;
      }

      const bLoc = (b.location || "").toLowerCase().trim();
      let locMatch = false;
      if (!subLoc || !bLoc) locMatch = true;
      else if (bLoc.includes(subLoc) || subLoc.includes(bLoc)) locMatch = true;

      const bConfig = (b.property_type || b.requirement || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      let configMatch = false;
      if (!subConfig || !bConfig) configMatch = true;
      else if (bConfig.includes(subConfig) || subConfig.includes(bConfig)) configMatch = true;

      const bBudget = Number(b.budget || 0);
      let budgetMatch = true;
      if (subPrice > 0 && bBudget > 0) {
        budgetMatch = bBudget >= subPrice * 0.8;
      }

      return locMatch && configMatch && budgetMatch;
    });

    const matchCount = matchingBuyers.length;
    const propLabel = `${sub.configuration || "Property"} at ${sub.society_name || sub.project_name || sub.location || "prime location"}`;
    const budgets = matchingBuyers.map((b: any) => Number(b.budget || 0)).filter((b: number) => b > 0);
    let budgetRangeStr = "";
    if (budgets.length > 0) {
      const minB = Math.min(...budgets);
      const maxB = Math.max(...budgets);
      budgetRangeStr = minB === maxB ? `₹${(minB / 100000).toFixed(1)}L` : `₹${(minB / 100000).toFixed(1)}L - ₹${(maxB / 100000).toFixed(1)}L`;
    } else if (subPrice > 0) {
      budgetRangeStr = `₹${(subPrice / 100000).toFixed(1)}L`;
    }
    const budgetPhrase = budgetRangeStr ? ` (Budget: ${budgetRangeStr})` : "";

    const replyText = matchCount > 0
      ? (lang === "GUJLISH"
        ? `Ji <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Tamari listed property (<b>${propLabel}</b>) mate amara system ma <b>${matchCount} verified buyers</b> actively search kari rahya chhe${budgetPhrase}. 🤝\n\nAmari sales team temne tamari property actively pitch kari rahi chhe. Koi pan visit confirm thay etle ame tarat j tamne update karshe! 🙏`
        : lang === "ENGLISH"
        ? `Hello <b>${senderName || "Friend"}</b>! For your listed property (<b>${propLabel}</b>), we have <b>${matchCount} verified prospective buyers</b> actively looking in this range${budgetPhrase}. 🤝\n\nOur team is currently pitching your property to them. We will notify you immediately once a site visit is scheduled! 🙏`
        : `Ji <b>${senderName ? `${senderName} ji` : "ji"}</b>! Aapki listed property (<b>${propLabel}</b>) ke liye hamare system me <b>${matchCount} verified buyers</b> actively search kar rahe hain${budgetPhrase}. 🤝\n\nHamari sales team unhe aapka listing card aur brochure share kar rahi hai. Jaise hi koi buyer visit book karta hai, hum turant aapse connect karenge! 🙏`)
      : (lang === "GUJLISH"
        ? `Ji <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Tamari listed property (<b>${propLabel}</b>) amara active portal par live chhe. 📋 Amari marketing team actively prospective buyers sathe follow-up kari rahi chhe. Navi inquiry malta j ame tamne sampark karshe! 🙏`
        : lang === "ENGLISH"
        ? `Hello <b>${senderName || "Friend"}</b>! Your property (<b>${propLabel}</b>) is actively listed in our database. 📋 Our marketing team is running targeted campaigns for this locality. As soon as a matching buyer expresses interest, we will notify you right away! 🙏`
        : `Ji <b>${senderName ? `${senderName} ji` : "ji"}</b>! Aapki listed property (<b>${propLabel}</b>) hamare active portal par successfully live hai. 📋 Filhaal matching inquiries par hamari team targeted outreach chala rahi hai. Naya matching buyer aate hi hum aapse turant connect karenge! 🙏`);

    await supabase.from("lead_events").insert({
      client_id: tenantId,
      lead_id: lead.lead_id || lead.id,
      event_type: "OWNER_BUYER_DEMAND_INQUIRY",
      payload: {
        matching_buyers_count: matchCount,
        property_label: propLabel,
        user_message: messageText,
      },
    });

    return { replyText, nextState: "OWNER_DETAILS_GATHERED", leadUpdates: buildOwnerLeadUpdates("OWNER_DETAILS_GATHERED") };
  }

  // If already gathered, check if user is listing a SECOND property, inquiring status, or asking for buyer options
  if (lead.state === "OWNER_DETAILS_GATHERED") {
    const isDecliningSecondListing = /^(?:nahi|no|na|nathi|nhi|nope|nathi\s*karvi|nahi\s*karni|rehne\s*do|koi\s*nahi|ek\s*j\s*chhe|bas\s*itna\s*hi|kuch\s*nahi|nathi\s*aapvi)\b/i.test(lower.trim());

    if (isDecliningSecondListing) {
      if (existingMeta.declined_second_listing) {
        const replyText = lang === "GUJLISH"
          ? `Bilkul koi vaat nahi <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Amari team tamari property mate verified leads aavta j update karshe. Have a great day! 🙏`
          : lang === "ENGLISH"
          ? `Understood <b>${senderName || "Friend"}</b>! We will keep you posted as soon as verified inquiries arrive for your property. Have a great day! 🙏`
          : `Bilkul koi baat nahi <b>${senderName ? `${senderName} ji` : "ji"}</b>! Hamari team aapki property ke verified leads aate hi update karegi. Have a great day! 🙏`;
        return { replyText, nextState: "OWNER_DETAILS_GATHERED", leadUpdates: buildOwnerLeadUpdates("OWNER_DETAILS_GATHERED", draft, { declined_second_listing: true }) };
      }

      await supabase.from("leads").update({
        metadata: {
          ...existingMeta,
          declined_second_listing: true,
        }
      }).eq("id", lead.id);

      const { data: sub } = await supabase
        .from("property_submissions")
        .select("*")
        .eq("client_id", tenantId)
        .or(`lead_id.eq.${lead.lead_id},lead_id.eq.${lead.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const propLabel = sub ? `${sub.configuration || sub.property_type || "Property"} at ${sub.project_name || sub.society_name || sub.location || city || "Prime Location"}` : "Aapki property";

      const replyText = lang === "GUJLISH"
        ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Tamari listed property (<b>${propLabel}</b>) amara desk par active chhe. Verified inquiry aavta j ame tamaro sampark karshe. Shu tame koi property Buy ya Rent na options jova mango chho? 🏡`
        : lang === "ENGLISH"
        ? `Certainly <b>${senderName || "Friend"}</b>! Your listed property (<b>${propLabel}</b>) is actively registered with us. We will connect with you as soon as a verified buyer/tenant inquiries. Would you like to explore properties to Buy or Rent? 🏡`
        : `Ji bilkul <b>${senderName ? `${senderName} ji` : "ji"}</b>! Aapki listed property (<b>${propLabel}</b>) hamare desk par actively registered hai. Verified inquiry aate hi hum aapse connect karenge. Kya aap koi property Buy ya Rent karne ke options dekhna chahte hain? 🏡`;

      return { replyText, nextState: "OWNER_DETAILS_GATHERED", leadUpdates: buildOwnerLeadUpdates("OWNER_DETAILS_GATHERED", draft, { declined_second_listing: true }) };
    }

    if (existingMeta.declined_second_listing) {
      const isAffirmativeSeekerInterest =
        /^(?:haan|ha|ji\s*haan|yes|yep|sure|chalo|dikhao|batavo|batao|options|buy|rent|kharidna|bhade)\b/i.test(lower.trim()) ||
        /(?:options|dikhao|dikhavo|batavo|batao|properties|shortlist|buy|rent)/i.test(lower);

      if (isAffirmativeSeekerInterest) {
        await supabase.from("leads").update({
          lead_type: "DUAL_ROLE",
          state: "QUALIFYING",
          metadata: {
            ...existingMeta,
            has_seller_profile: true,
            has_buyer_profile: true,
            active_persona: "BUYER",
          },
        }).eq("id", lead.id);
        lead.lead_type = "DUAL_ROLE";
        lead.state = "QUALIFYING";

        const replyText = lang === "GUJLISH"
          ? `Bahuj saras <b>${senderName ? `${senderName} bhai` : "ji"}</b>! 🏡 Tame kaya type ni property joi rahya chho — Residential (Flat/Villa) ke Commercial (Office/Shop)?`
          : lang === "ENGLISH"
          ? `Wonderful <b>${senderName || "Friend"}</b>! 🏡 What type of property are you looking for — Residential (Flat/Villa) or Commercial (Office/Shop)?`
          : `Bahut badhiya <b>${senderName ? `${senderName} ji` : "ji"}</b>! 🏡 Aap kis type ki property search karna chahte hain — Residential (Flat/Villa) ya Commercial (Office/Shop)?`;
        return { replyText, nextState: "QUALIFYING", leadUpdates: buildOwnerLeadUpdates("QUALIFYING", draft, { active_persona: "BUYER" }) };
      }
    }

    const isSecondListing =
      /^(?:2|2️⃣|option\s*2|dusri|biji|haan|ha|ji\s*haan|yes|yep|sure|list\s*another|karni\s*hai|aur\s*bhi|ek\s*aur|bilkul)\b/i.test(lower.trim()) ||
      /(?:dusri|biji|ek\s*aur|nayi|navi|another|second|2nd)\s*(?:property|flat|house|ghar|makan|villa|office|shop|plot)\b/i.test(lower) ||
      /(?:dusri\s*property\s*sell|nayi\s*property\s*list|office\s*bhade|shop\s*rent|flat\s*bechna|ghar\s*bechna|biji\s*vechvi)/i.test(lower) ||
      ((/(?:bechna|bechni|vechvu|vechva|sell|list|bhade|bhaade|kiraya|kiraye|rent\s*par\s*den|chadani|lease)/i.test(lower)) &&
       (/\b(flat|house|ghar|makan|villa|office|shop|plot|godown|showroom|commercial)\b/i.test(lower))) ||
      aiAnalysis?.action?.intent === "SUBMIT_LISTING" ||
      (aiAnalysis?.action?.intent === "CONFIRM_CRITERIA" && (aiAnalysis?.action as any)?.confirm);

    const isBuyerDemandInquiry =
      /(?:buyer|khareedne\s*wala|kharidne\s*wala|graahak|grahak|customer|inquiry|inquiries|koi\s*aaya|koi\s*aayi|koi\s*mila|ketla\s*malya|any\s*buyers|interested\s*buyers)/i.test(lower) &&
      !/(?:chahiye|joiye|kharidna\s*hai|buy\s*karna|looking\s*to\s*buy)/i.test(lower);

    const isStatusInquiry = /(?:status|update|kya\s*hua|ketle\s*pahonchyu|check\s*status|listing\s*status|verification|approved)/i.test(lower);

    const isSeekerInquiry =
      /(?:chahiye|chahye|chahie|chaiye|joiye|joyiye|joie|buy|kharid|khareed|purchase|options|dikhao|dikhavo|batavo|batao|budget)/i.test(lower) ||
      (/\b([1-5]\s*bhk|flat|villa|office|shop|plot)\b/i.test(lower) && /\b(chahiye|joiye|buy|kharid|dekhna|budget|me|mein)\b/i.test(lower));

    if (isSecondListing) {
      console.log(`[MULTI-PROPERTY OWNER] Lead ${lead.id} is registering a second property: "${messageText}"`);
      const existingCompleted = Array.isArray(existingMeta.completed_submissions)
        ? [...existingMeta.completed_submissions]
        : [];
      const archived = Array.isArray(existingMeta.archived_submissions) ? [...existingMeta.archived_submissions] : [];
      if (existingMeta.owner_draft && Object.keys(existingMeta.owner_draft).length > 0) {
        archived.push({
          ...existingMeta.owner_draft,
          submission_id: existingMeta.submission_id || null,
          archived_at: new Date().toISOString(),
        });
      }

      // Reset to a clean new draft for the next property
      draft = { attributes: {} };

      const parsedType = parsePropertyTypeFromText(messageText);
      const isRent = /(?:rent|bhade|bhadu|kiraya|kiraye|chadani)/i.test(lower);
      const isLease = /(?:lease|pattay)/i.test(lower);
      draft.transaction_type = isLease ? "LEASE_OUT" : isRent ? "RENT_OUT" : "SELL";
      if (parsedType) {
        draft.property_type = parsedType;
        draft.configuration = parsedType;
        if (isLease || /(office|shop|showroom|commercial)/i.test(parsedType)) {
          draft.property_category = "COMMERCIAL";
        } else if (/(plot|land|zameen)/i.test(parsedType)) {
          draft.property_category = "PLOT";
        } else {
          draft.property_category = "RESIDENTIAL";
        }
      }

      const nextStateTarget = draft.property_type ? "OWNER_SOCIETY_PENDING" : "OWNER_CONFIG_PENDING";
      await supabase.from("leads").update({
        lead_type: effectiveOwnerLeadType,
        state: nextStateTarget,
        metadata: {
          ...existingMeta,
          has_seller_profile: true,
          ...(isDualLead ? { has_buyer_profile: true } : {}),
          owner_draft: draft,
          completed_submissions: existingCompleted,
          archived_submissions: archived,
          submission_id: null,
          declined_second_listing: false,
        },
      }).eq("id", lead.id);

      lead.state = nextStateTarget;
      lead.lead_type = effectiveOwnerLeadType;

      if (draft.property_type) {
        const isComm = draft.property_category === "COMMERCIAL";
        const propLabel = draft.configuration || draft.property_type;
        const replyText = isComm
          ? (lang === "GUJLISH"
            ? `Bahuj saras <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Nayi property <b>${propLabel}</b> (${isLease ? "Lease par aapva" : isRent ? "Rent par aapva" : "Vechva"}) note kari lidhi chhe. 👍\n\n👉 <b>Aa property kaya Commercial Complex, Business Hub ke Road par aaveli chhe? (e.g. Atlantis K-10, Sayaji Plaza ya Main Road)</b> 🏢`
            : lang === "ENGLISH"
            ? `Great <b>${senderName || "Friend"}</b>! Noted your new property <b>${propLabel}</b> (${isLease ? "for Lease" : isRent ? "for Rent" : "for Sale"}). 👍\n\n👉 <b>Which Commercial Complex, Business Hub, or Road is this located on? (e.g. Atlantis K-10, Sayaji Plaza, or Main Road)</b> 🏢`
            : `Bahut badhiya <b>${senderName ? `${senderName} ji` : "ji"}</b>! Nayi property <b>${propLabel}</b> (${isLease ? "Lease par dene" : isRent ? "Rent par chadhane" : "Sell karne"} ke liye) note kar li hai. 👍\n\n👉 <b>Ye property kis Commercial Complex, Business Hub ya Road par sthit hai? (e.g. Atlantis K-10, Sayaji Plaza ya Main Road)</b> 🏢`)
          : (lang === "GUJLISH"
            ? `Bahuj saras <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Nayi property <b>${propLabel}</b> note kari lidhi chhe. 👍\n\n👉 <b>Aa property kaya Project ke Society ma aaveli chhe? (e.g. Nilamber Bellissimo, Sun Crest)</b> 🏢`
            : lang === "ENGLISH"
            ? `Great <b>${senderName || "Friend"}</b>! Noted your new property <b>${propLabel}</b>. 👍\n\n👉 <b>Which Project or Society is your property located in? (e.g. Nilamber Bellissimo, Sun Crest)</b> 🏢`
            : `Bahut badhiya <b>${senderName ? `${senderName} ji` : "ji"}</b>! Nayi property <b>${propLabel}</b> note kar li hai. 👍\n\n👉 <b>Ye property kis Project ya Society me sthit hai? (e.g. Nilamber Bellissimo, Sun Crest)</b> 🏢`);

        return {
          replyText,
          nextState: "OWNER_SOCIETY_PENDING",
          leadUpdates: buildOwnerLeadUpdates("OWNER_SOCIETY_PENDING", draft, {
            completed_submissions: existingCompleted,
            archived_submissions: archived,
            submission_id: null,
            declined_second_listing: false,
          }),
        };
      } else {
        const replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Nayi property listing desk par swagat chhe. 🏡✨\n\n👉 <b>Tamari nayi property kaya type ni chhe — 2BHK / 3BHK Flat, Villa, ke Commercial Shop/Office?</b> 🏢`
            : lang === "ENGLISH"
            ? `Certainly <b>${senderName || "Friend"}</b>! Let's get your next property listed. 🏡✨\n\n👉 <b>What type of property is this — 2BHK / 3BHK Flat, Villa, or Commercial Shop/Office?</b> 🏢`
            : `Ji bilkul <b>${senderName ? `${senderName} ji` : "ji"}</b>! Nayi property listing desk par swagat hai. 🏡✨\n\n👉 <b>Aapki nayi property kis type ki hai — 2BHK / 3BHK Flat, Villa, ya Commercial Shop/Office?</b> 🏢`;

        return {
          replyText,
          nextState: "OWNER_CONFIG_PENDING",
          leadUpdates: buildOwnerLeadUpdates("OWNER_CONFIG_PENDING", draft, {
            completed_submissions: existingCompleted,
            archived_submissions: archived,
            submission_id: null,
            declined_second_listing: false,
          }),
        };
      }
    }

    if (isStatusInquiry) {
      const { data: sub } = await supabase
        .from("property_submissions")
        .select("*")
        .eq("client_id", tenantId)
        .eq("lead_id", lead.lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const propLabel = sub ? `${sub.configuration || sub.property_type || "Property"} at ${sub.project_name || sub.society_name || sub.location || city || "Prime Location"}` : "Aapki property";
      const isSubApprovedA =
        sub?.status === "CONVERTED_TO_INVENTORY" ||
        sub?.status === "APPROVED" ||
        sub?.status === "LISTED";
      const statusLabel = isSubApprovedA
        ? "Approved & Listed in Inventory 🏡✨"
        : sub?.status === "PENDING_VERIFICATION"
        ? "Physical Verification & Quality Inspection"
        : (sub?.status || "Under Review");

      const replyText = isSubApprovedA
        ? (lang === "GUJLISH"
          ? `Ji <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Tamari listed property (<b>${propLabel}</b>) approve thai ne successfully list thai chuki chhe! 🏡✨\n\nAmari sales team verified buyers ane tenants sathe aane actively match kari rahi chhe. Koi pan suitable inquiry aave etle ame tarat j tamaro sampark karshe! 🙏`
          : lang === "ENGLISH"
          ? `Hello <b>${senderName || "Friend"}</b>! Your listed property (<b>${propLabel}</b>) has been approved and successfully listed in our inventory! 🏡✨\n\nOur sales team is actively matching it with verified buyers and tenants. We will connect with you as soon as a suitable offer arrives! 🙏`
          : `Ji <b>${senderName ? `${senderName} ji` : "ji"}</b>! Aapki listed property (<b>${propLabel}</b>) approve hoke successfully list ho chuki hai! 🏡✨\n\nHamari sales team verified buyers & tenants ke saath ise actively match kar rahi hai. Koi bhi suitable inquiry aane par hum turant aapse connect karenge! 🙏`)
        : (lang === "GUJLISH"
          ? `Ji <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Tamari listed property (<b>${propLabel}</b>) hal ma <b>${statusLabel}</b> stage par chhe. 📋 Amari inspection team verification mate jald aapse call par connect karshe! 🙏`
          : lang === "ENGLISH"
          ? `Hello <b>${senderName || "Friend"}</b>! Your listed property (<b>${propLabel}</b>) is currently in the <b>${statusLabel}</b> stage. 📋 Our acquisition team will connect with you shortly for on-site inspection! 🙏`
          : `Ji <b>${senderName ? `${senderName} ji` : "ji"}</b>! Aapki listed property (<b>${propLabel}</b>) abhi <b>${statusLabel}</b> stage par hai. 📋 Hamari inspection team verification ke liye jald aapse call par connect karegi! 🙏`);

      return { replyText, nextState: "OWNER_DETAILS_GATHERED", leadUpdates: buildOwnerLeadUpdates("OWNER_DETAILS_GATHERED", draft) };
    }

    if (isSeekerInquiry) {
      await supabase.from("leads").update({
        lead_type: "DUAL_ROLE",
        state: "QUALIFYING",
        last_active_at: new Date().toISOString(),
        metadata: {
          ...existingMeta,
          has_seller_profile: true,
          has_buyer_profile: true,
          active_persona: "BUYER",
        },
      }).eq("id", lead.id);
      lead.lead_type = "DUAL_ROLE";
      lead.state = "QUALIFYING";

      const displayCityOwner = city || "prime locations";
      const replyText =
        lang === "GUJLISH"
          ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Amari pase ${displayCityOwner} ma verified properties available chhe. Kripya janavjo — tame kaya area ane budget ma property joi rahya chho? 🏡`
          : lang === "ENGLISH"
          ? `Certainly <b>${senderName || "Friend"}</b>! We have prime verified properties across ${displayCityOwner}. Please share your preferred locality and budget range! 🏡`
          : `Ji bilkul <b>${senderName ? `${senderName} ji` : "ji"}</b>! Hamare paas ${displayCityOwner} me verified properties available hain. Kripya batayein — aap kis area aur budget me property dekh rahe hain? 🏡`;

      return { replyText, nextState: "QUALIFYING", leadUpdates: buildOwnerLeadUpdates("QUALIFYING", draft, { active_persona: "BUYER" }) };
    }

    const agency = agencyName || "NextGen Realty";
    const isAcknowledgement = /^(thik|theek|thk|thek|ok|okay|k|sahi|achha|acha|saras|barobar|done|understood|samajh|dhanyawad|thanks|thank you|shukriya|aabhar)/i.test(lower.trim());
    const replyText = isAcknowledgement
      ? (lang === "GUJLISH"
        ? `Ji bilkul <b>${senderName ? `${senderName} bhai` : "ji"}</b>! Amari acquisition team verification mate jaldi tamaro sampark karshe! 🙏`
        : lang === "ENGLISH"
        ? `Certainly <b>${senderName || "Friend"}</b>! Our acquisition team will connect with you shortly for on-site inspection. Feel free to reach out if you need anything else! 🙏`
        : `Ji bilkul <b>${senderName ? `${senderName} ji` : "ji"}</b>! Hamari team inspection & verification ke liye jald aapse call par connect karegi. Koi bhi aur requirement ho to zaroor batayein! 🙏`)
      : (lang === "GUJLISH"
        ? `Ji bilkul <b>${senderName} bhai</b>! Tamari property details ${agency} listing desk par successfully registered chhe. 📋 Biji koi query hoy to zaroor janavjo! 🙏`
        : lang === "ENGLISH"
        ? `Sure <b>${senderName}</b>! Your property listing is registered on the ${agency} listing desk. 📋 Feel free to reach out if you have any questions! 🙏`
        : `Ji bilkul <b>${senderName} ji</b>! Aapki property details ${agency} listing desk par successfully registered hain. 📋 Koi bhi aur requirement ya query ho to zaroor batayein! 🙏`);
    return { replyText, nextState: "OWNER_DETAILS_GATHERED", leadUpdates: buildOwnerLeadUpdates("OWNER_DETAILS_GATHERED", draft) };
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 6-Turn Compound Owner Intake Cascade (F-03, F-07, F-08, F-11)
  // ---------------------------------------------------------------------------

  const agency = agencyName || "NextGen Realty";
  const nameStr = senderName ? (lang === "GUJLISH" ? `${senderName} bhai` : lang === "ENGLISH" ? senderName : `${senderName} ji`) : (lang === "GUJLISH" ? "bhai" : lang === "ENGLISH" ? "Friend" : "ji");
  const isComm = draft.property_category === "COMMERCIAL" || /(office|shop|showroom|warehouse|commercial)/i.test(String(draft.property_type || ""));
  const isPlotType = draft.property_category === "PLOT" || /(plot|land|zameen|jamin)/i.test(String(draft.property_type || ""));

  // Turn 1: Configuration & Transaction Type
  if (!draft.configuration && !draft.property_type) {
    const replyText =
      lang === "GUJLISH"
        ? `Ji bilkul <b>${nameStr}</b>! ${agency} par verified buyers ane tenants sathe deal kariye chhiye. 🏢✨\nProperty kaya type ni chhe — Flat, Villa ke Shop/Office? Ane Sell karvi chhe ke Rent/Lease par aapvi chhe?`
        : lang === "ENGLISH"
        ? `Certainly <b>${nameStr}</b>! ${agency} connects property owners directly with verified buyers & tenants. 🏢✨\nWhat type of property is this — Flat, Villa, or Shop/Office? And are you looking to Sell or Rent/Lease it out?`
        : `Ji bilkul <b>${nameStr}</b>! ${agency} par hum verified buyers aur tenants ke sath deal karte hain. 🏢✨\nProperty kis type ki hai — Flat, Villa ya Shop/Office? Aur Sell karni hai ya Rent/Lease par deni hai? 🏢`;

    await supabase.from("leads").update({
      lead_type: effectiveOwnerLeadType,
      state: "OWNER_CONFIG_PENDING",
      metadata: {
        ...existingMeta,
        has_seller_profile: true,
        ...(isDualLead ? { has_buyer_profile: true } : {}),
        owner_draft: draft,
      },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_CONFIG_PENDING", leadUpdates: buildOwnerLeadUpdates("OWNER_CONFIG_PENDING", draft) };
  }

  // Turn 2: Project / Complex Name
  if (lead.state === "OWNER_SOCIETY_PENDING" || (!draft.society_name && !draft.project_name)) {
    if (lead.state === "OWNER_SOCIETY_PENDING" && messageText.trim().length >= 2) {
      const extractedProj = extractProjectOrSocietyFromText(messageText, draft.property_type);
      const cleaned = formatSocietyName(extractedProj || messageText);
      draft.society_name = cleaned;
      draft.project_name = cleaned;
    } else {
      const propLabel = draft.configuration || draft.property_type || "property";
      const hasQueued = Array.isArray(draft.queued_properties) && draft.queued_properties.length > 0;
      const queuedDesc = hasQueued ? ` (${propLabel} ane ${draft.queued_properties[0].property_type})` : "";
      const prefixMulti = hasQueued
        ? (lang === "GUJLISH"
            ? `Bahuj saras <b>${nameStr}</b>! Tame banne properties${queuedDesc} list kari shako chho. 🤝✨ Pehla <b>${propLabel}</b> ni details note kariye. 👍\n`
            : lang === "ENGLISH"
            ? `Great <b>${nameStr}</b>! You can list both properties${queuedDesc}. 🤝✨ Let's start with your <b>${propLabel}</b>. 👍\n`
            : `Bahut badhiya <b>${nameStr}</b>! Aap dono properties${queuedDesc} list kar sakte hain. 🤝✨ Pehle <b>${propLabel}</b> ki details note karte hain. 👍\n`)
        : "";

      let replyText = "";
      if (isPlotType) {
        replyText =
          lang === "GUJLISH"
            ? `${prefixMulti ? prefixMulti : `Bahuj saras! <b>${propLabel}</b> note kari lidhu chhe. 👍\n`}Scheme / Township nu naam ke Survey number shu chhe? 📍`
            : lang === "ENGLISH"
            ? `${prefixMulti ? prefixMulti : `Great! Noted <b>${propLabel}</b>. 👍\n`}What is the Scheme / Township name or Survey number? 📍`
            : `${prefixMulti ? prefixMulti : `Bahut badhiya! <b>${propLabel}</b> note kar liya hai. 👍\n`}Scheme / Township ka naam ya Survey number kya hai? 📍`;
      } else if (isComm) {
        replyText =
          lang === "GUJLISH"
            ? `${prefixMulti ? prefixMulti : `Bahuj saras! <b>${propLabel}</b> note kari lidhu chhe. 👍\n`}Aa property kaya Commercial Complex, Business Hub ke Road par aaveli chhe? (e.g. Atlantis K-10, Sayaji Plaza) 🏢`
            : lang === "ENGLISH"
            ? `${prefixMulti ? prefixMulti : `Great! Noted <b>${propLabel}</b>. 👍\n`}Which Commercial Complex, Business Hub, or Road is this located on? (e.g. Atlantis K-10, Sayaji Plaza) 🏢`
            : `${prefixMulti ? prefixMulti : `Bahut badhiya! <b>${propLabel}</b> note kar liya hai. 👍\n`}Commercial Complex, Business Hub ya Road ka kya naam hai? (e.g. Atlantis K-10, Sayaji Plaza) 🏢`;
      } else {
        replyText =
          lang === "GUJLISH"
            ? `${prefixMulti ? prefixMulti : `Bahuj saras! <b>${propLabel}</b> note kari lidhu chhe. 👍\n`}Aa property kaya Project ke Society ma aaveli chhe? (e.g. Nilamber Bellissimo, Sun Crest) 🏢`
            : lang === "ENGLISH"
            ? `${prefixMulti ? prefixMulti : `Great! Noted <b>${propLabel}</b>. 👍\n`}Which Project or Society is this property located in? (e.g. Nilamber Bellissimo, Sun Crest) 🏢`
            : `${prefixMulti ? prefixMulti : `Bahut badhiya! <b>${propLabel}</b> note kar liya hai. 👍\n`}Project ya Society ka kya naam hai? (e.g. Nilamber Bellissimo, Sun Crest) 🏢`;
      }

      await supabase.from("leads").update({
        lead_type: effectiveOwnerLeadType,
        state: "OWNER_SOCIETY_PENDING",
        metadata: {
          ...existingMeta,
          has_seller_profile: true,
          ...(isDualLead ? { has_buyer_profile: true } : {}),
          owner_draft: draft,
        },
      }).eq("id", lead.id);

      return { replyText, nextState: "OWNER_SOCIETY_PENDING", leadUpdates: buildOwnerLeadUpdates("OWNER_SOCIETY_PENDING", draft) };
    }
  }

  // Turn 3: Exact Locality / Landmark
  if (!draft.location) {
    if (lead.state === "OWNER_LOCATION_PENDING" && messageText.trim().length >= 2) {
      draft.location = messageText.trim();
    } else {
      const socLabel = draft.society_name || draft.project_name || "Society";
      const replyText =
        lang === "GUJLISH"
          ? `Noted <b>${socLabel}</b>! 🏢\n👉 <b>Aa property kaya exact Area ke Landmark pase aave chhe?</b> 📍`
          : lang === "ENGLISH"
          ? `Noted <b>${socLabel}</b>! 🏢\n👉 <b>In which exact Area or near which Landmark is this located?</b> 📍`
          : `Noted <b>${socLabel}</b>! 🏢\n👉 <b>Ye kaunse exact Area ya Landmark ke paas hai?</b> 📍`;

      await supabase.from("leads").update({
        lead_type: effectiveOwnerLeadType,
        state: "OWNER_LOCATION_PENDING",
        metadata: {
          ...existingMeta,
          has_seller_profile: true,
          ...(isDualLead ? { has_buyer_profile: true } : {}),
          owner_draft: draft,
        },
      }).eq("id", lead.id);

      return { replyText, nextState: "OWNER_LOCATION_PENDING", leadUpdates: buildOwnerLeadUpdates("OWNER_LOCATION_PENDING", draft) };
    }
  }

  // Turn 4: Carpet Area + Floor Compound Question (F-03 Fix)
  if (lead.state === "OWNER_AREA_PENDING") {
    const parsedArea = parseAreaFromText(messageText);
    if (parsedArea.carpet_sqft || parsedArea.super_built_up_sqft || parsedArea.plot_area_sqft) {
      if (parsedArea.carpet_sqft) draft.carpet_area_sqft = parsedArea.carpet_sqft;
      if (parsedArea.super_built_up_sqft) {
        draft.super_built_up_sqft = parsedArea.super_built_up_sqft;
        draft.attributes.built_up_area = parsedArea.super_built_up_sqft;
      }
      if (parsedArea.plot_area_sqft) {
        draft.plot_area_sqft = parsedArea.plot_area_sqft;
        draft.attributes.plot_area = parsedArea.plot_area_sqft;
        if (!draft.carpet_area_sqft) draft.carpet_area_sqft = parsedArea.plot_area_sqft;
      }
    } else {
      const rawNum = messageText.match(/\b(\d{2,5})\b/);
      if (rawNum) {
        const val = parseInt(rawNum[1], 10);
        if (val >= 50 && val <= 50000) {
          if (lower.includes("built") || lower.includes("super")) {
            draft.super_built_up_sqft = val;
            draft.attributes.built_up_area = val;
          } else if (lower.includes("plot") || lower.includes("land") || lower.includes("zameen")) {
            draft.plot_area_sqft = val;
            draft.attributes.plot_area = val;
          } else {
            draft.carpet_area_sqft = val;
          }
        }
      }
    }

    // Secondary Floor extraction
    const floorInfo = parseFloorFromText(messageText);
    if (floorInfo.floor_number !== null) {
      draft.attributes.floor_number = floorInfo.floor_number;
    }
    if (floorInfo.total_floors !== null) {
      draft.attributes.total_floors = floorInfo.total_floors;
    }
  }

  // F-03 Deadlock Prevention: Area is Mandatory Primary Field. Floor is Secondary.
  const hasArea = Boolean(draft.carpet_area_sqft || draft.super_built_up_sqft || draft.plot_area_sqft);
  if (!hasArea) {
    const isFlatOrOffice = /(flat|apartment|office|shop|commercial)/i.test(String(draft.property_type || ""));
    let replyText = "";
    if (isFlatOrOffice) {
      replyText =
        lang === "GUJLISH"
          ? `Approximate Carpet Area ketlo chhe ane kaya Floor par chhe? (e.g. 1450 sq.ft, 4th floor) 📐`
          : lang === "ENGLISH"
          ? `What is the approximate Carpet Area and which Floor is it on? (e.g. 1450 sq.ft, 4th floor) 📐`
          : `Approximate Carpet Area kitna hai aur kaunse Floor par hai? (e.g. 1450 sq.ft, 4th floor) 📐`;
    } else {
      replyText =
        lang === "GUJLISH"
          ? `Approximate Plot ke Built-up Area ketlo sq.ft chhe? 📐`
          : lang === "ENGLISH"
          ? `What is the approximate Plot or Built-up Area in sq.ft? 📐`
          : `Approximate Plot ya Built-up Area kitna sq.ft hai? 📐`;
    }

    await supabase.from("leads").update({
      lead_type: effectiveOwnerLeadType,
      state: "OWNER_AREA_PENDING",
      metadata: {
        ...existingMeta,
        has_seller_profile: true,
        ...(isDualLead ? { has_buyer_profile: true } : {}),
        owner_draft: draft,
      },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_AREA_PENDING", leadUpdates: buildOwnerLeadUpdates("OWNER_AREA_PENDING", draft) };
  }

  // Turn 5: Price/Rent + Furnishing Compound Question (F-03 Fix)
  const isRent = draft.transaction_type === "RENT_OUT" || draft.transaction_type === "LEASE_OUT";

  if (lead.state === "OWNER_PRICE_PENDING") {
    const directPrice = parseBudgetFromText(messageText);
    if (directPrice > 0) {
      if (isRent) {
        if (directPrice < 1500000) {
          draft.expected_rent = directPrice;
        } else {
          draft.expected_price = directPrice;
          draft.transaction_type = "SELL";
        }
      } else {
        draft.expected_price = directPrice;
      }
    } else {
      const numMatch = lower.match(/^(\d+(?:\.\d+)?)\s*$/);
      if (numMatch) {
        const val = parseFloat(numMatch[1]);
        if (val >= 0.25 && val <= 50) {
          draft.expected_price = Math.round(val * 10000000);
        } else if (val > 50 && val <= 500) {
          draft.expected_price = Math.round(val * 100000);
        }
      }
    }

    // Secondary Furnishing extraction
    const parsedFurn = parseFurnishingFromText(messageText);
    if (parsedFurn) {
      draft.furnishing_status = parsedFurn;
    }
  }

  // F-03 Deadlock Prevention: Price/Rent is Mandatory Primary Field. Furnishing is Secondary.
  const hasValidPrice = (isRent && (draft.expected_rent || 0) >= 3000) || (!isRent && (draft.expected_price || 0) >= 100000);
  if (!hasValidPrice) {
    let replyText = "";
    if (draft.transaction_type === "LEASE_OUT" || draft.transaction_type === "LEASE") {
      replyText =
        lang === "GUJLISH"
          ? `Expected Monthly Lease ketlu chhe, ane Furnishing status shu chhe (Bare Shell ke Plug & Play)? 💰`
          : lang === "ENGLISH"
          ? `What is your expected Monthly Lease, and what is the Furnishing status (Bare Shell or Plug & Play)? 💰`
          : `Expected Monthly Lease kitna hai, aur Furnishing status kya hai (Bare Shell ya Plug & Play)? 💰`;
    } else if (isRent) {
      replyText =
        lang === "GUJLISH"
          ? `Expected Monthly Rent ketlu chhe, ane Furnishing status shu chhe? 💰`
          : lang === "ENGLISH"
          ? `What is your expected Monthly Rent, and what is the Furnishing status? 💰`
          : `Expected Monthly Rent kitna hai, aur Furnishing status kya hai? 💰`;
    } else {
      replyText =
        lang === "GUJLISH"
          ? `Expected Selling Price ketli chhe, ane property Furnished, Semi ke Unfurnished chhe? 💰`
          : lang === "ENGLISH"
          ? `What is your expected Selling Price, and is the property Furnished, Semi-Furnished, or Unfurnished? 💰`
          : `Expected Selling Price kitna hai, aur property Furnished, Semi ya Unfurnished hai? 💰`;
    }

    await supabase.from("leads").update({
      lead_type: effectiveOwnerLeadType,
      state: "OWNER_PRICE_PENDING",
      metadata: {
        ...existingMeta,
        has_seller_profile: true,
        ...(isDualLead ? { has_buyer_profile: true } : {}),
        owner_draft: draft,
      },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_PRICE_PENDING", leadUpdates: buildOwnerLeadUpdates("OWNER_PRICE_PENDING", draft) };
  }

  // Gracefully default secondary furnishing if not mentioned
  if (!draft.furnishing_status) {
    draft.furnishing_status = isPlotType ? "UNFURNISHED" : "SEMI_FURNISHED";
  }

  // Turn 6: Parking + Possession + Direct Calling Number
  const isTurn6State = [
    "OWNER_AMENITIES_PENDING",
    "OWNER_POSSESSION_PENDING",
    "OWNER_FURNISHING_PENDING",
    "OWNER_PHONE_PENDING",
  ].includes(lead.state);

  if (!isTurn6State && (!draft.attributes?.parking || !draft.possession_status)) {
    const replyText =
      lang === "GUJLISH"
        ? `Car parking available chhe? Ane property Ready to Move chhe ke Under Construction? (Sathe direct calling number confirm karjo) 🚗🔑`
        : lang === "ENGLISH"
        ? `Is car parking available? And is the property Ready to Move or Under Construction? (Please also confirm your direct calling number) 🚗🔑`
        : `Car parking available hai? Aur property Ready to Move hai ya Under Construction? (Sath me direct calling number confirm karein) 🚗🔑`;

    await supabase.from("leads").update({
      lead_type: effectiveOwnerLeadType,
      state: "OWNER_AMENITIES_PENDING",
      metadata: {
        ...existingMeta,
        has_seller_profile: true,
        ...(isDualLead ? { has_buyer_profile: true } : {}),
        owner_draft: draft,
      },
    }).eq("id", lead.id);

    return { replyText, nextState: "OWNER_AMENITIES_PENDING", leadUpdates: buildOwnerLeadUpdates("OWNER_AMENITIES_PENDING", draft) };
  }

  // Turn 6 input parsing
  if (isTurn6State) {
    const parsedPark = parseParkingFromText(messageText);
    if (parsedPark) {
      draft.attributes.parking = parsedPark;
    } else if (/(ha|haan|yes|available|chhe|hai|covered)/i.test(lower)) {
      draft.attributes.parking = "Covered";
    }

    const parsedPoss = parsePossessionFromText(messageText);
    if (parsedPoss) {
      draft.possession_status = parsedPoss;
    }

    const parsedPh = parsePhoneFromText(messageText);
    if (parsedPh) {
      draft.contact_phone = parsedPh;
    }
  }

  // Apply default possession if missing
  if (!draft.possession_status) {
    draft.possession_status = "READY_TO_MOVE";
  }

  // ---------------------------------------------------------------------------
  // Step 8: ALL DETAILS GATHERED! Persist to property_submissions (F-07, F-08, F-11)
  // ---------------------------------------------------------------------------
  let effectivePhone = draft.contact_phone || (lead.phone && !lead.phone.startsWith("tg_") ? lead.phone : null);
  if (!effectivePhone && (senderId.length >= 10 && !senderId.startsWith("-") && platform !== "TELEGRAM")) {
    effectivePhone = senderId;
  }

  const normalizedTxType =
    (draft.transaction_type === "SALE" || draft.transaction_type === "SELL") ? "SELL"
    : (draft.transaction_type === "LEASE_OUT" || draft.transaction_type === "LEASE") ? "LEASE"
    : (draft.transaction_type === "RENT_OUT" || draft.transaction_type === "RENT") ? "RENT"
    : "SELL";

  const resolvedCityVal = city || null;

  const submissionPayload = {
    client_id: tenantId,
    lead_id: lead.lead_id,
    owner_name: senderName || lead.first_name || "Property Owner",
    owner_phone: effectivePhone || null,
    property_category: draft.property_category || "RESIDENTIAL",
    property_type: draft.property_type || "Flat",
    transaction_type: normalizedTxType,
    project_name: draft.project_name || draft.society_name || "Private Property",
    society_name: draft.society_name || draft.project_name || "Society",
    location: draft.location || resolvedCityVal || "Prime Location",
    city: resolvedCityVal,
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
      floor_number: draft.attributes?.floor_number || null,
      total_floors: draft.attributes?.total_floors || null,
      parking: draft.attributes?.parking || null,
      built_up_area: draft.super_built_up_sqft || null,
      plot_area: draft.plot_area_sqft || null,
      contact_phone: effectivePhone || null,
    },
    notes: `Intake complete via ${platform}: ${draft.configuration || draft.property_type || "Property"} in ${draft.project_name || draft.society_name || draft.location || resolvedCityVal || "Prime Location"} (${normalizedTxType}, ${draft.expected_price ? formatPriceShort(Number(draft.expected_price)) : draft.expected_rent ? `₹${draft.expected_rent}/mo` : "Price on Request"})`
  };

  const { data: sub, error: subError } = await supabase
    .from("property_submissions")
    .insert(submissionPayload)
    .select()
    .single();

  if (subError) {
    console.error("[Property Submissions] Insert Error:", subError);
  }

  // Fetch Admin executive for this tenant to assign the owner listing (with fallbacks)
  let targetAdmin = (await supabase
    .from("executives")
    .select("id")
    .eq("client_id", tenantId)
    .ilike("role", "admin")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()).data;

  if (!targetAdmin) {
    // Fallback 1: Assign to active Manager
    targetAdmin = (await supabase
      .from("executives")
      .select("id")
      .eq("client_id", tenantId)
      .ilike("role", "manager")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()).data;
  }

  if (!targetAdmin) {
    // Fallback 2: Assign to any active executive for tenant
    targetAdmin = (await supabase
      .from("executives")
      .select("id")
      .eq("client_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()).data;
  }

  const assignedAdminId = targetAdmin?.id || lead.assigned_executive_id;

  const completedSnapshot = {
    submission_id: sub?.id || existingMeta.submission_id || null,
    completed_at: new Date().toISOString(),
    transaction_type: draft.transaction_type || (isRent ? "RENT_OUT" : "SELL"),
    property_type: draft.property_type || draft.configuration || null,
    project_or_society: draft.society_name || draft.project_or_society || null,
    location: draft.location || null,
    price_or_rent: draft.expected_price || draft.expected_rent || null,
    carpet_sqft: draft.carpet_area_sqft || null,
    super_built_up_sqft: draft.super_built_up_sqft || null,
    possession_status: draft.possession_status || null,
    furnishing_status: draft.furnishing_status || null,
    parking_status: draft.parking_status || null,
    contact_phone: effectivePhone || draft.contact_phone || null,
    status: "PENDING_VERIFICATION",
  };

  const existingCompleted = Array.isArray(existingMeta.completed_submissions)
    ? [...existingMeta.completed_submissions]
    : [];
  if (!existingCompleted.some((s: any) => s.submission_id === completedSnapshot.submission_id && s.submission_id)) {
    existingCompleted.push(completedSnapshot);
  }

  const existingArchived = Array.isArray(existingMeta.archived_submissions)
    ? [...existingMeta.archived_submissions]
    : [];
  if (!existingArchived.some((s: any) => s.submission_id === completedSnapshot.submission_id && s.submission_id)) {
    existingArchived.push({
      ...draft,
      submission_id: sub?.id || existingMeta.submission_id || null,
      archived_at: new Date().toISOString(),
    });
  }

  await supabase.from("leads").update({
    lead_type: effectiveOwnerLeadType,
    state: "OWNER_DETAILS_GATHERED",
    phone: effectivePhone || lead.phone,
    ...(assignedAdminId ? { assigned_executive_id: assignedAdminId } : {}),
    metadata: {
      ...existingMeta,
      owner_draft: draft,
      submission_id: sub?.id,
      completed_submissions: existingCompleted,
      archived_submissions: existingArchived,
      has_seller_profile: true,
      ...(isDualLead ? { has_buyer_profile: true } : {}),
    }
  }).eq("id", lead.id);
  lead.lead_type = effectiveOwnerLeadType;
  lead.state = "OWNER_DETAILS_GATHERED";
  if (assignedAdminId) lead.assigned_executive_id = assignedAdminId;

  // Dispatch High-Priority Alert to Admin / Acquisition Desk
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
      ? `Khub khub aabhar <b>${senderName ? `${senderName} bhai` : "ji"}</b>! 🎉\n\nTamari property listing details ${agency} desk par successfully register thai gai chhe:\n\n${summary}\n\n🤝 <b>Next Steps:</b> Amara senior property acquisition manager documents verification, physical inspection ane professional photography mate jaldi thi tamari sathe call par connect karshe.`
      : lang === "ENGLISH"
      ? `Thank you so much <b>${senderName || "Friend"}</b>! 🎉\n\nYour property listing has been successfully registered on the ${agency} desk:\n\n${summary}\n\n🤝 <b>Next Steps:</b> Our senior property acquisition manager will connect with you shortly over a call for document verification, on-site inspection, and professional photography.`
      : `Bahut bahut dhanyawad <b>${senderName ? `${senderName} ji` : "ji"}</b>! 🎉\n\nAapki property listing details ${agency} desk par successfully register ho gayi hain:\n\n${summary}\n\n🤝 <b>Next Steps:</b> Hamare senior property acquisition manager documents verification, physical inspection aur professional photography ke liye jald hi aapse call par connect karenge.`;

  const hasQueued = Array.isArray(draft.queued_properties) && draft.queued_properties.length > 0;
  if (hasQueued) {
    const nextProp = draft.queued_properties.shift();
    const nextType = nextProp.property_type || "";
    const isPlot = /(plot|land|zameen|jamin)/i.test(nextType);
    const isComm = /(office|shop|showroom|commercial|warehouse)/i.test(nextType);
    const newDraft: any = {
      property_type: nextProp.property_type,
      configuration: nextProp.configuration || nextProp.property_type,
      property_category: isPlot ? "PLOT" : isComm ? "COMMERCIAL" : "RESIDENTIAL",
      possession_status: isPlot ? "READY_TO_MOVE" : null,
      furnishing_status: isPlot ? "UNFURNISHED" : null,
      transaction_type: nextProp.transaction_type || draft.transaction_type,
      location: draft.location || null,
      city: draft.city || city || null,
      plot_area_sqft: nextProp.plot_area_sqft || null,
      super_built_up_sqft: nextProp.super_built_up_sqft || null,
      attributes: {
        ...(nextProp.plot_area_sqft ? { plot_area: nextProp.plot_area_sqft } : {}),
      },
      queued_properties: draft.queued_properties,
    };

    const archived = Array.isArray(existingMeta.archived_submissions) ? [...existingMeta.archived_submissions] : [];
    archived.push({
      ...draft,
      submission_id: sub?.id,
      archived_at: new Date().toISOString(),
    });

    await supabase.from("leads").update({
      state: "OWNER_SOCIETY_PENDING",
      metadata: {
        ...existingMeta,
        submission_id: sub?.id || existingMeta.submission_id,
        owner_draft: newDraft,
        archived_submissions: archived,
      },
    }).eq("id", lead.id);

    lead.state = "OWNER_SOCIETY_PENDING";

    const queuedPrompt =
      lang === "GUJLISH"
        ? `\n\n👉 <b>Have chalo tamara ${nextProp.property_type || "biji property"} ni details complete kariye!</b> Aa property kaya Project ke Society ma aaveli chhe?`
        : lang === "ENGLISH"
        ? `\n\n👉 <b>Now let's proceed with your ${nextProp.property_type || "second property"}!</b> Which Project or Society is this property located in?`
        : `\n\n👉 <b>Ab chaliye aapki ${nextProp.property_type || "doosri property"} ki details note karte hain!</b> Ye property kis Project ya Society me sthit hai?`;

    return {
      replyText: `${replyText}${queuedPrompt}`,
      nextState: "OWNER_SOCIETY_PENDING",
      leadUpdates: buildOwnerLeadUpdates("OWNER_SOCIETY_PENDING", newDraft, {
        submission_id: sub?.id || existingMeta.submission_id,
        archived_submissions: archived,
      }),
    };
  }

  return {
    replyText,
    nextState: "OWNER_DETAILS_GATHERED",
    leadUpdates: buildOwnerLeadUpdates("OWNER_DETAILS_GATHERED", draft, {
      submission_id: sub?.id || existingMeta.submission_id,
      completed_submissions: existingCompleted,
      archived_submissions: existingArchived,
    }),
  };
}

// =========================================================================
// 9c. DETERMINISTIC FINITE STATE MACHINE (FSM) ROUTER
// =========================================================================
export type DialogState =
  | "FRESH"
  | "ROLE_SELECTION_PENDING"
  | "DUAL_ROLE_MENU_PENDING"
  | "QUALIFYING"
  | "OPTIONS_SENT"
  | "CRITERIA_CONFIRMATION_PENDING"
  | "VISIT_REQUESTED"
  | "SITE_VISIT_PROPOSED"
  | "SITE_VISIT_BOOKED"
  | "VISIT_RESCHEDULED"
  | "VISIT_MISSED"
  | "SITE_VISIT_DONE"
  | "CANCEL_PREVIOUS_VISIT_CONFIRMATION_PENDING"
  | "RETURNING_OWNER_MENU_PENDING"
  | "OWNER_CONFIG_PENDING"
  | "OWNER_SOCIETY_PENDING"
  | "OWNER_LOCATION_PENDING"
  | "OWNER_AREA_PENDING"
  | "OWNER_PRICE_PENDING"
  | "OWNER_POSSESSION_PENDING"
  | "OWNER_FURNISHING_PENDING"
  | "OWNER_PHONE_PENDING"
  | "OWNER_DETAILS_GATHERED"
  | "DROPPED"
  | "VISIT_CANCELLED"
  | "RESCHEDULE_REQUESTED";

export interface DialogContext {
  messageText: string;
  normalizedMessage: string;
  lower: string;
  senderName: string;
  senderId: string;
  platform: "TELEGRAM" | "WHATSAPP" | "DIRECT";
  tenantId: string;
  agencyName: string;
  resolvedCity: string | null;
  displayCity: string;
  lang: "HINGLISH" | "GUJLISH" | "ENGLISH" | "GUJARATI_SCRIPT";
  availableInventory?: any[];
  botKnowledge?: Record<string, any>;
}

export interface DialogTransitionResult {
  replyText: string;
  nextState: DialogState;
  leadUpdates?: Record<string, any>;
  salesAlert?: { type: string; payload?: Record<string, any> };
  isSilent?: boolean;
}

export function getGreetingTriageReply(lang: string, nameStr: string, agencyName: string): string {
  if (lang === "GUJLISH") {
    return `Namaste <b>${nameStr}</b>! ${agencyName} ma swagat chhe. 🙏\n👉 1️⃣ <b>Property Buy ke Rent par levi chhe</b> 🏡  2️⃣ <b>Potani property Sell ke Rent par aapvi chhe</b> 📋  3️⃣ <b>Banne / Upgrade</b> 🔄\n<i>(1, 2 ya 3 reply karo, athva direct requirement lakho)</i>`;
  }
  if (lang === "ENGLISH") {
    return `Hello <b>${nameStr}</b>! Welcome to ${agencyName}. 🙏\n👉 1️⃣ <b>Looking to Buy / Rent</b> 🏡  2️⃣ <b>Looking to Sell / Lease</b> 📋  3️⃣ <b>Both / Upgrade</b> 🔄\n<i>(Reply with 1, 2, or 3, or share your requirement directly)</i>`;
  }
  return `Namaste <b>${nameStr}</b>! ${agencyName} me aapka swagat hai. 🙏\n👉 1️⃣ <b>Property Buy ya Rent karni hai</b> 🏡  2️⃣ <b>Apni property Sell ya Rent out karni hai</b> 📋  3️⃣ <b>Dono / Upgrade</b> 🔄\n<i>(1, 2 ya 3 reply karein, ya direct requirement likhein)</i>`;
}

export async function dispatchStateAction(
  lead: any,
  actionResult: ClassifiedActionResult,
  context: DialogContext
): Promise<DialogTransitionResult> {
  let action = actionResult.action;
  let intent = action.intent;
  const currentState: DialogState = (lead?.state as DialogState) || "FRESH";
  const lang = context.lang || "HINGLISH";
  const senderName = context.senderName || "Friend";
  const agencyName = context.agencyName || "Nextgen Realty";
  const resolvedCity = context.resolvedCity;
  const displayCity = context.displayCity || resolvedCity || "aapke shehar";
  const activeTenantId = context.tenantId || defaultTenantId;
  const lower = context.lower || context.messageText.toLowerCase().trim();
  const nameStr = senderName ? (lang === "GUJLISH" ? `${senderName} bhai` : `${senderName} ji`) : "ji";

  // ---------------------------------------------------------------------------
  // 1. GLOBAL CRITICAL INTERCEPTORS
  // ---------------------------------------------------------------------------
  if (intent === "OPT_OUT") {
    const lowerMsg = (context.messageText || "").trim().toLowerCase();
    const isExplicitOptOut = /(?:stop|unsubscribe|not\s*interested|nathi\s*joiye|message\s*mat\s*karo|band\s*karo|dont\s*message|call\s*mat\s*karo|msg\s*mat\s*karo|don't\s*text)/i.test(lowerMsg);

    // INVERTED ANTI-OPT_OUT GUARD: OPT_OUT is mathematically impossible unless isExplicitOptOut === true
    if (!isExplicitOptOut) {
      console.log(`[OPT_OUT GUARD] Intercepted non-explicit conversational negation "${context.messageText}" - reclassifying for state ${currentState}`);
      const lastPromptQ = lead?.metadata?.last_bot_prompt?.question_type;
      const isPostVisit = currentState === "SITE_VISIT_DONE" || currentState === "SITE_VISIT_BOOKED" || lastPromptQ === "VISIT_ATTENDANCE" || Boolean(lead?.post_visit_feedback_sent);

      if (currentState === "CRITERIA_CONFIRMATION_PENDING" || lastPromptQ === "CRITERIA_CONFIRM") {
        intent = "CONFIRM_CRITERIA";
        actionResult.action = { intent: "CONFIRM_CRITERIA", confirm: false };
      } else if (isPostVisit) {
        intent = "CANNOT_ATTEND_VISIT";
        actionResult.action = { intent: "CANNOT_ATTEND_VISIT", reason: context.messageText };
      } else {
        intent = "GENERAL_QUERY";
        actionResult.action = { intent: "GENERAL_QUERY", query: context.messageText };
      }
    } else {
      const replyText =
        lang === "GUJLISH"
          ? `Aabhar <b>${senderName} bhai</b>. Have tamne koi automated messages nahi aave. Bhawishyaman koi jarur hoy to tame amaro sampark kari shako chho. Tamaro divas shubh rahe! 🙏`
          : lang === "ENGLISH"
          ? `Thank you <b>${senderName}</b>. You have been opted out from automated messages. Feel free to contact us anytime if you need property assistance! 🙏`
          : `Dhanyawad <b>${senderName} ji</b>. Aapka number opt-out kar diya gaya hai. Aage se koi automated message nahi aayega. Have a great day! 🙏`;

      return {
        replyText,
        nextState: "DROPPED",
        leadUpdates: { state: "DROPPED", bot_active: false, drip_stage: "CANCELLED" },
      };
    }
  }

  // Anti-OFF_TOPIC Property Keyword Immunity Guard:
  // If user mentioned genuine real estate terms, NEVER reject as OFF_TOPIC!
  const isGibberish = isGibberishOrInvalidInput(context.messageText);
  const detectedPropType = isGibberish ? "" : parsePropertyTypeFromText(context.messageText);
  const isAgencyOfficeQuery =
    /(?:office\s*(?:address|location|kaha|kidhar|kya\s*hai|kya\s*he|kya\s*chhe|kya\s*che|no\s*address|nu\s*address|par\s*aavu|aavvu|milna|mil\s*sakte|timing|timings|hours|samay|opening|closing)|karyalay|tamari\s*office|aapki\s*office|aapka\s*office|where\s*is\s*(?:your\s*)?office)\b/i.test(context.messageText);

  const isRealEstateTerm =
    !isAgencyOfficeQuery &&
    (Boolean(detectedPropType) ||
      (!isGibberish &&
        /\b(shop|dukaan|dukan|showroom|flat|apartment|villa|bungalow|plot|land|commercial|residential|residence|bhk|buy|rent|sell|bechna|vechvu|kharidna|kharidvu)\b/i.test(context.messageText)) ||
      (!isAgencyOfficeQuery && /\b(?:commercial\s*office|office\s*space|office\s*for\s*(?:sale|rent|lease)|office\s*(?:kharidna|bechna|vechvu|levu))\b/i.test(context.messageText)));

  if (isAgencyOfficeQuery) {
    const isTiming = /(?:timing|hours|samay|opening|closing|ketla\s*vage|kab\s*khulta)/i.test(context.messageText);
    action = {
      intent: "ASK_FAQ",
      topic: isTiming ? "OFFICE_TIMINGS" : "OFFICE_ADDRESS",
    } as AskFaqAction;
    intent = "ASK_FAQ";
  } else if (intent === "OFF_TOPIC" && isRealEstateTerm) {
    console.log(`[dispatchStateAction] Overriding OFF_TOPIC false positive for message: "${context.messageText}"`);
    const propType = detectedPropType || (/\b(shop|dukaan|dukan|showroom|commercial)\b/i.test(context.messageText) ? "Commercial Office" : (/\b(flat|apartment|villa|bungalow|residential|residence)\b/i.test(context.messageText) ? "Residential" : null));
    if (propType) {
      intent = "CHANGE_REQUIREMENT";
      action = {
        intent: "CHANGE_REQUIREMENT",
        property_type: propType,
      } as any;
      actionResult.property_type = propType;
      (actionResult as any).action = action;
    }
  }

  const botKnowledge = context.botKnowledge || {};

  // 1. Office Address / Location Query Interceptor
  const isOfficeAddressQuery =
    /(?:office\s*(?:address|location|kaha|kidhar|kya\s*hai|kya\s*he|kya\s*chhe|kya\s*che|no\s*address|nu\s*address|par\s*aavu|aavvu|milna|mil\s*sakte)|karyalay|branch\s*address|where\s*is\s*your\s*office|office\s*pin|address\s*bhejo|address\s*aapo|office\s*par\s*milna)\b/i.test(lower);

  // 2. Office Timings / Working Hours Interceptor
  const isOfficeTimingQuery =
    /(?:timing|timings|visiting\s*hours|kab\s*khula|kab\s*open|khulva\s*no\s*samay|office\s*time|working\s*hours|business\s*hours|opening\s*time|closing\s*time)\b/i.test(lower);

  // 3. Agency / Company Identity Interceptor
  const isAgencyIdentityQuery =
    /(?:agency|company|firm|karyalay|tamari\s*company|tamaru\s*nam|aapki\s*agency|aapka\s*naam|aap\s*kaun|who\s*are\s*you|naam\s*kya|nam\s*su\s*che|nam\s*kya\s*he|nam\s*su|tamara\s*vishe|agency\s*name|company\s*name)\b/i.test(lower);

  if (isOfficeTimingQuery && !isRealEstateTerm) {
    action = { intent: "ASK_FAQ", topic: "OFFICE_TIMINGS" } as AskFaqAction;
    intent = "ASK_FAQ";
  } else if (isOfficeAddressQuery && !isRealEstateTerm) {
    action = { intent: "ASK_FAQ", topic: "OFFICE_ADDRESS" } as AskFaqAction;
    intent = "ASK_FAQ";
  } else if (isAgencyIdentityQuery && !isRealEstateTerm) {
    action = { intent: "ASK_FAQ", topic: "AGENCY_INFO" } as AskFaqAction;
    intent = "ASK_FAQ";
  } else if (Array.isArray(botKnowledge.custom_faqs) && botKnowledge.custom_faqs.length > 0 && !isRealEstateTerm) {
    for (const faq of botKnowledge.custom_faqs) {
      const qLower = (faq.question || "").toLowerCase();
      const qWords = qLower.split(/\s+/).filter((w) => w.length >= 4);
      const matches = qWords.filter((w) => lower.includes(w));
      if (matches.length >= 2 || (qWords.length === 1 && matches.length === 1)) {
        action = {
          intent: "ASK_FAQ",
          topic: "CUSTOM_FAQ",
          specific_query: faq.question,
        } as AskFaqAction;
        intent = "ASK_FAQ";
        break;
      }
    }
  }

  // Detour State Detection: Active intake workflows where side questions can occur
  const isDetourState =
    (currentState.startsWith("OWNER_") && currentState !== "OWNER_DETAILS_GATHERED") ||
    currentState === "QUALIFYING" ||
    currentState === "ROLE_SELECTION_PENDING" ||
    currentState === "OPTIONS_SENT" ||
    currentState === "VISIT_REQUESTED" ||
    currentState === "SITE_VISIT_PROPOSED";

  // Global FAQ Dispatcher: Answer agency/client FAQs immediately with dynamic bot_knowledge at any stage!
  if (intent === "ASK_FAQ") {
    if (isDetourState) {
      lead.metadata = {
        ...(lead.metadata || {}),
        suspended_state: {
          previous_state: currentState,
          suspended_at: new Date().toISOString(),
          intake_type: currentState.startsWith("OWNER_") ? "OWNER" : "SEEKER",
          pending_field: deriveBotQuestionType(currentState, ""),
        },
      };
    }
    const hasBookedVisit = currentState === "SITE_VISIT_BOOKED" || Boolean(lead?.site_visit_booked || lead?.visit_booked_at);
    return handleFaqResponse(lead, action as AskFaqAction, context, hasBookedVisit);
  }

  if (intent === "OFF_TOPIC" || isGibberish) {
    let replyText = "";
    if (isGibberish) {
      replyText =
        lang === "GUJLISH"
          ? `Mane barobar samajh na padi. 😊 Hu fakt property search, site visits ane real estate details ma j tamne madad kari shaku chhu. 🏢\n\nKripya janavjo, tame kaya type ni property joi rahya chho — <b>2BHK / 3BHK Flat, Villa ke Commercial Space?</b> 🏡`
          : lang === "ENGLISH"
          ? `I couldn't quite understand that. 😊 I can assist you with property search, site visits, and verified real estate options. 🏢\n\nPlease let us know what type of property you are looking for — <b>Flat, Villa, or Commercial Space?</b> 🏡`
          : `Main samajh nahi paaya. 😊 Main sirf property search, site visits aur real estate queries me hi aapki help kar sakta hu. 🏢\n\nKripya batayein, aap kis type ki property search kar rahe hain — <b>2BHK / 3BHK Flat, Villa ya Commercial Space?</b> 🏡`;
    } else {
      replyText =
        lang === "GUJLISH"
          ? `Hu ${agencyName} no AI property assistant chhu ane hu fakt property search, site visits ane real estate sambhandhit details ma j tamne help kari shaku chhu. 😊🏢\n\nKripya janavjo, tame kaya type ni property joi rahya chho — <b>Residential ke Commercial?</b> 🏡`
          : lang === "ENGLISH"
          ? `I am ${agencyName}'s AI property assistant, and I can only assist you with property search, site visits, and real estate details. 😊🏢\n\nPlease let me know what kind of residential or commercial property you are looking for! 🏡`
          : `Main ${agencyName} ka AI property assistant hu aur main sirf property search, site visits aur real estate queries me hi aapki help kar sakta hu. 😊🏢\n\nKripya batayein, aap kis type ki property search kar rahe hain — <b>Residential ya Commercial?</b> 🏡`;
    }

    return {
      replyText,
      nextState: currentState,
    };
  }

  if (intent === "REQUEST_HUMAN_CALL") {
    const replyText =
      lang === "GUJLISH"
        ? `Ji bilkul ${nameStr}! Amara senior property advisor agami <b>5-10 minute ma direct tamne call karshe</b>. 📞\n\nCall pehla kripya janavjo — tamaro preferred area ke budget ketlo chhe jethi teo best options ready rakhi shake?`
        : lang === "ENGLISH"
        ? `Certainly ${nameStr}! Our senior property advisor will <b>call you directly within 5-10 minutes</b>. 📞\n\nBefore they connect, could you share your preferred location or budget range so they have tailored options ready?`
        : `Ji bilkul ${nameStr}! Hamare senior property advisor aapko agle <b>5-10 minutes me direct call par connect kar rahe hain</b>. 📞\n\nCall se pehle bas bata dijiye — aapka preferred area ya budget kya hai taaki wo ready options open rakhein?`;

    return {
      replyText,
      nextState: currentState,
      salesAlert: {
        type: "CALL_REQUEST",
        payload: {
          userText: context.messageText,
          reason: (action as HumanCallAction).reason || "Lead requested immediate phone call with executive.",
        },
      },
    };
  }

  if (intent === "MARKET_ADVISORY") {
    const replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! Hal ma 2 & 3 BHK premium apartments ane gated villas ma sabse high demand chhe, jya pricing <b>₹45 Lakhs thi shuru</b> thay chhe. 🏡\n\nTame property <b>Buy (Kharidva) mate joiye chhe ke Bhade</b>?`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! Currently, 2 & 3 BHK premium apartments and villas are in highest demand, with verified options starting from <b>₹45 Lakhs</b>. 🏡\n\nAre you looking to <b>Buy</b> or <b>Rent</b>?`
        : `Ji ${nameStr}! Abhi market me 2 & 3 BHK premium apartments aur villas ki sabse high demand hai, jinki pricing <b>₹45 Lakhs se shuru</b> hoti hai. 🏡\n\nAap property <b>Buy (Kharidna)</b> chahte hain ya <b>Rent</b> par chahiye?`;

    return {
      replyText,
      nextState: currentState,
    };
  }

  // ---------------------------------------------------------------------------
  // 1b. SCENARIO 3 DUAL-REMINDER DISAMBIGUATION GREETING
  // ---------------------------------------------------------------------------
  const isInOwnerIntake = [
    "OWNER_CONFIG_PENDING",
    "OWNER_SOCIETY_PENDING",
    "OWNER_LOCATION_PENDING",
    "OWNER_AREA_PENDING",
    "OWNER_PRICE_PENDING",
    "OWNER_AMENITIES_PENDING",
    "OWNER_POSSESSION_PENDING",
    "OWNER_FURNISHING_PENDING",
    "OWNER_PHONE_PENDING",
  ].includes(currentState);

  if (!isInOwnerIntake && (intent === "GREETING" || /^(hi|hello|hey|namaste|kem cho|good morning|pranam)\b/i.test(lower))) {
    // 1. Query submitted property
    const { data: subs } = await supabase
      .from("property_submissions")
      .select("*")
      .eq("client_id", activeTenantId)
      .or(`lead_id.eq.${lead.lead_id},lead_id.eq.${lead.id}`)
      .order("created_at", { ascending: false })
      .limit(1);

    const latestSub = subs && subs.length > 0 ? subs[0] : null;

    // 2. Query latest site visit (scheduled, confirmed, rescheduled, or missed)
    let latestVisit: any = null;
    const { data: visits } = await supabase
      .from("site_visits")
      .select("*, inventory(*)")
      .eq("client_id", activeTenantId)
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (visits && visits.length > 0) {
      latestVisit = visits[0];
    }

    const scheduledTime = latestVisit?.scheduled_at || (lead.site_visit_booked ? (lead.site_visit_at || lead.site_visit_datetime) : null);
    const visitTimeMs = scheduledTime ? new Date(scheduledTime).getTime() : 0;
    const nowMs = Date.now();
    const isVisitInFuture = visitTimeMs > nowMs;

    const isUpcomingVisit = Boolean(
      latestVisit &&
      ["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(latestVisit.status) &&
      lead.site_visit_booked &&
      isVisitInFuture
    );

    const isPastUnconfirmed = Boolean(
      latestVisit &&
      ["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(latestVisit.status) &&
      !isVisitInFuture
    );

    const isMissedVisit = Boolean(
      lead.state === "VISIT_MISSED" ||
      latestVisit?.status === "MISSED"
    );

    const hasBuyerCriteria = Boolean(
      lead.budget ||
      lead.property_type ||
      lead.location ||
      lead.metadata?.has_buyer_profile ||
      isUpcomingVisit ||
      isPastUnconfirmed ||
      isMissedVisit
    );
    const hasSellerListing = Boolean(latestSub || lead.metadata?.submission_id || lead.metadata?.has_seller_profile);

    if (hasSellerListing && hasBuyerCriteria) {
      const formattedVisitTime = scheduledTime
        ? new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
        : "Scheduled Time";
      const visitProjectName = latestVisit?.inventory?.project_name || lead.metadata?.selected_property_name || (lead.property_type ? (lead.location ? `${lead.property_type} (${lead.location})` : lead.property_type) : "VIP Property");

      const listingSocietyName = latestSub?.project_name || latestSub?.society_name || lead.metadata?.owner_draft?.project_name || lead.metadata?.owner_draft?.society_name || "Listed Property";
      const listingStatusRaw = latestSub?.status || "PENDING_VERIFICATION";
      const isSubApproved =
        latestSub?.status === "CONVERTED_TO_INVENTORY" ||
        latestSub?.status === "APPROVED" ||
        latestSub?.status === "LISTED";
      const listingStatus = isSubApproved
        ? "Approved & Listed in Inventory 🏡✨"
        : listingStatusRaw === "PENDING_VERIFICATION"
        ? "Pending Verification / Under Review"
        : listingStatusRaw;

      // Dynamic Option 1 CTA and visit header
      let visitSnippetGujlish = "";
      let visitSnippetEnglish = "";
      let visitSnippetHinglish = "";
      let opt1LabelGujlish = "1️⃣ <b>Property Search Options 🏡</b>";
      let opt1LabelEnglish = "1️⃣ <b>Property Search Options 🏡</b>";
      let opt1LabelHinglish = "1️⃣ <b>Property Search Options 🏡</b>";

      if (isUpcomingVisit) {
        visitSnippetGujlish = `🚗 <b>Upcoming Site Visit:</b> <b>${visitProjectName}</b> scheduled chhe at <b>${formattedVisitTime}</b>.\n`;
        visitSnippetEnglish = `🚗 <b>Upcoming Site Visit:</b> Scheduled for <b>${visitProjectName}</b> on <b>${formattedVisitTime}</b>.\n`;
        visitSnippetHinglish = `🚗 <b>Upcoming Site Visit:</b> <b>${visitProjectName}</b> ke liye scheduled hai at <b>${formattedVisitTime}</b>.\n`;
        opt1LabelGujlish = "1️⃣ <b>Site Visit Details / Property Search 🏡</b>";
        opt1LabelEnglish = "1️⃣ <b>Site Visit Details / Property Search 🏡</b>";
        opt1LabelHinglish = "1️⃣ <b>Site Visit Details / Property Search 🏡</b>";
      } else if (isPastUnconfirmed) {
        visitSnippetGujlish = `🚗 <b>Site Visit Update:</b> <b>${visitProjectName}</b> (${formattedVisitTime}) no samay viti gayo chhe. Shu tame attend kari shakya hata? 🤝\n`;
        visitSnippetEnglish = `🚗 <b>Site Visit Update:</b> Your visit for <b>${visitProjectName}</b> (${formattedVisitTime}) has passed. Were you able to attend? 🤝\n`;
        visitSnippetHinglish = `🚗 <b>Site Visit Update:</b> <b>${visitProjectName}</b> (${formattedVisitTime}) ka samay ho chuka hai. Kya aap visit attend kar paaye the? 🤝\n`;
        opt1LabelGujlish = "1️⃣ <b>Visit Attendance / Reschedule 🚗</b>";
        opt1LabelEnglish = "1️⃣ <b>Visit Attendance / Reschedule 🚗</b>";
        opt1LabelHinglish = "1️⃣ <b>Visit Attendance / Reschedule 🚗</b>";
      } else if (isMissedVisit) {
        visitSnippetGujlish = `🚗 <b>Site Visit:</b> <b>${visitProjectName}</b> (${formattedVisitTime}) miss thai hati. Shu navo slot reschedule karvo chhe? 📅\n`;
        visitSnippetEnglish = `🚗 <b>Site Visit:</b> Your visit for <b>${visitProjectName}</b> (${formattedVisitTime}) was missed. Would you like to reschedule? 📅\n`;
        visitSnippetHinglish = `🚗 <b>Site Visit:</b> <b>${visitProjectName}</b> (${formattedVisitTime}) miss ho gayi thi. Kya naya slot reschedule karna hai? 📅\n`;
        opt1LabelGujlish = "1️⃣ <b>Visit Reschedule / Nayi Property Search 🏡</b>";
        opt1LabelEnglish = "1️⃣ <b>Visit Reschedule / Search Properties 🏡</b>";
        opt1LabelHinglish = "1️⃣ <b>Visit Reschedule / Nayi Property Search 🏡</b>";
      } else {
        const locSuffix = lead.location ? ` in ${lead.location}` : "";
        visitSnippetGujlish = `🏡 <b>Active Property Search:</b> ${lead.property_type || "Property"}${locSuffix}.\n`;
        visitSnippetEnglish = `🏡 <b>Active Property Search:</b> ${lead.property_type || "Property"}${locSuffix}.\n`;
        visitSnippetHinglish = `🏡 <b>Active Property Search:</b> ${lead.property_type || "Property"}${locSuffix}.\n`;
      }

      const replyText =
        lang === "GUJLISH"
          ? `Welcome back <b>${nameStr}</b>! ${agencyName} desk par tamaru swagat chhe. 🙏✨\n\n` +
            visitSnippetGujlish +
            `📋 <b>Listed Property:</b> <b>${listingSocietyName}</b> (Status: <b>${listingStatus}</b>).\n\n` +
            `Aaje tame kaya vishay ma aagal vadharva mango chho?\n\n` +
            `${opt1LabelGujlish}\n` +
            `2️⃣ <b>Meri Listed Property Status 📋</b>\n` +
            `3️⃣ <b>Senior Advisor se call chahiye 📞</b>\n\n` +
            `<i>(Tame 1, 2 ke 3 reply kari shako chho)</i>`
          : lang === "ENGLISH"
          ? `Welcome back <b>${nameStr}</b>! Welcome to ${agencyName}. 🙏✨\n\n` +
            visitSnippetEnglish +
            `📋 <b>Listed Property:</b> <b>${listingSocietyName}</b> (Status: <b>${listingStatus}</b>).\n\n` +
            `How would you like to proceed today?\n\n` +
            `${opt1LabelEnglish}\n` +
            `2️⃣ <b>Meri Listed Property Status 📋</b>\n` +
            `3️⃣ <b>Senior Advisor se call chahiye 📞</b>\n\n` +
            `<i>(You can reply with 1, 2, or 3)</i>`
          : `Welcome back <b>${nameStr}</b>! ${agencyName} desk par aapka swagat hai. 🙏✨\n\n` +
            visitSnippetHinglish +
            `📋 <b>Listed Property:</b> <b>${listingSocietyName}</b> (Status: <b>${listingStatus}</b>).\n\n` +
            `Aaj aap kis bare me aage badhna chahte hain?\n\n` +
            `${opt1LabelHinglish}\n` +
            `2️⃣ <b>Meri Listed Property Status 📋</b>\n` +
            `3️⃣ <b>Senior Advisor se call chahiye 📞</b>\n\n` +
            `<i>(Aap 1, 2 ya 3 likh kar reply kar sakte hain)</i>`;

      return {
        replyText,
        nextState: "DUAL_ROLE_MENU_PENDING",
        leadUpdates: {
          state: "DUAL_ROLE_MENU_PENDING",
          lead_type: "DUAL_ROLE",
          metadata: {
            ...(lead.metadata || {}),
            has_buyer_profile: true,
            has_seller_profile: true,
          },
        },
      };
    }

    // Returning lead with Active Site Visit (Buyer context)
    const hasActiveVisit = Boolean(
      isUpcomingVisit ||
      lead.site_visit_booked ||
      (latestVisit && ["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(latestVisit.status))
    );
    if (hasActiveVisit) {
      const formattedVisitTime = scheduledTime
        ? new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
        : "Scheduled Time";
      const visitProjectName = latestVisit?.inventory?.project_name || lead.metadata?.selected_property_name || (lead.property_type ? (lead.location ? `${lead.property_type} (${lead.location})` : lead.property_type) : "VIP Property");
      const mapUrl = latestVisit?.inventory?.map_url || lead.metadata?.selected_property_map_url || null;
      const mapSnippet = mapUrl ? `\n📍 ${formatMapHyperlink(mapUrl, "View on Google Maps")}` : "";

      const replyText =
        lang === "GUJLISH"
          ? `Namaste <b>${nameStr}</b>! 🙏\n🚗 <b>Scheduled Visit:</b> ${visitProjectName} (${formattedVisitTime})${mapSnippet}\n\n👉 1️⃣ Visit Details  2️⃣ Reschedule / Cancel  3️⃣ Biji Property Search  4️⃣ Property List`
          : lang === "ENGLISH"
          ? `Hello <b>${nameStr}</b>! 🙏\n🚗 <b>Scheduled Visit:</b> ${visitProjectName} (${formattedVisitTime})${mapSnippet}\n\n👉 1️⃣ Visit Details  2️⃣ Reschedule / Cancel  3️⃣ Search Other Properties  4️⃣ List Property`
          : `Namaste <b>${nameStr}</b>! 🙏\n🚗 <b>Scheduled Visit:</b> ${visitProjectName} (${formattedVisitTime})${mapSnippet}\n\n👉 1️⃣ Visit Details  2️⃣ Reschedule / Cancel  3️⃣ Dusri Property Search  4️⃣ Property List`;

      return {
        replyText,
        nextState: "SITE_VISIT_BOOKED",
      };
    }

    // Returning lead with Submitted Property (Seller context)
    if (hasSellerListing || currentState === "OWNER_DETAILS_GATHERED") {
      const listingSocietyName = latestSub?.project_name || latestSub?.society_name || lead.metadata?.owner_draft?.project_name || lead.metadata?.owner_draft?.society_name || "Listed Property";
      const listingStatusRaw = latestSub?.status || "PENDING_VERIFICATION";
      const isSubApproved =
        latestSub?.status === "CONVERTED_TO_INVENTORY" ||
        latestSub?.status === "APPROVED" ||
        latestSub?.status === "LISTED";
      const listingStatus = isSubApproved
        ? "Approved & Listed in Inventory 🏡✨"
        : listingStatusRaw === "PENDING_VERIFICATION"
        ? "Pending Verification / Under Review"
        : listingStatusRaw;

      const replyText =
        lang === "GUJLISH"
          ? `Namaste <b>${nameStr}</b>! 🙏\n📋 <b>Listed Property:</b> ${listingSocietyName} (${listingStatus})\n\n👉 1️⃣ Status Check  2️⃣ Ek aur property list karvi chhe ➕  3️⃣ Nayi property jovi chhe 🏡  4️⃣ Senior Manager Call 📞`
          : lang === "ENGLISH"
          ? `Hello <b>${nameStr}</b>! 🙏\n📋 <b>Listed Property:</b> ${listingSocietyName} (${listingStatus})\n\n👉 1️⃣ Status Check  2️⃣ List another property ➕  3️⃣ View new properties 🏡  4️⃣ Senior Manager Call 📞`
          : `Namaste <b>${nameStr}</b>! 🙏\n📋 <b>Listed Property:</b> ${listingSocietyName} (${listingStatus})\n\n👉 1️⃣ Status Check  2️⃣ Ek aur property list karni hai ➕  3️⃣ Nayi property dekhni hai 🏡  4️⃣ Senior Manager Call 📞`;

      return {
        replyText,
        nextState: "OWNER_DETAILS_GATHERED",
      };
    }

    // Returning lead with Completed Buyer Qualification (Site-Visit First Focus - Zero Call References)
    if (lead.property_type && (lead.budget || lead.location)) {
      const budgetOrLocStr = (lead.location && lead.location !== "FLEXIBLE" && lead.location !== "UNKNOWN")
        ? ` (${lead.location})`
        : (lead.budget && Number(lead.budget) > 0)
        ? ` (${formatPriceShort(lead.budget)})`
        : "";

      const replyText =
        lang === "GUJLISH"
          ? `Namaste <b>${nameStr}</b>! 🙏\nTamari <b>${lead.property_type}${budgetOrLocStr}</b> ni search chalu chhe. Kaho, aaje kai rite madad kari shaku?\n\n👉 1️⃣ <b>Top property options jovo 🏡</b>\n👉 2️⃣ <b>VIP Site Visit schedule karo 🚗</b>\n👉 3️⃣ <b>Budget ke requirement badalvi chhe ✏️</b>\n<i>(1, 2 ke 3 reply karo, athva direct lakho)</i>`
          : lang === "ENGLISH"
          ? `Hello <b>${nameStr}</b>! 🙏\nWe have your search for <b>${lead.property_type}${budgetOrLocStr}</b> noted. How can we assist you today?\n\n👉 1️⃣ <b>Explore top property options 🏡</b>\n👉 2️⃣ <b>Schedule a VIP Site Visit 🚗</b>\n👉 3️⃣ <b>Update budget or requirement ✏️</b>\n<i>(Reply with 1, 2, or 3, or type your query)</i>`
          : `Namaste <b>${nameStr}</b>! 🙏\nAapka <b>${lead.property_type}${budgetOrLocStr}</b> ka search note hai. Kahiye, aaj kaise madad karoon?\n\n👉 1️⃣ <b>Top property options dekhein 🏡</b>\n👉 2️⃣ <b>VIP Site Visit schedule karein 🚗</b>\n👉 3️⃣ <b>Budget ya requirement badalni hai ✏️</b>\n<i>(1, 2 ya 3 reply karein, ya direct likhein)</i>`;

      return {
        replyText,
        nextState: "OPTIONS_SENT",
        leadUpdates: {
          metadata: {
            ...(lead.metadata || {}),
            last_bot_prompt: {
              question_type: "RETURNING_BUYER_MENU",
              sent_at: new Date().toISOString(),
            },
          },
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 2. OWNER IN-PROGRESS STATES -> DIRECT TO handleOwnerFlow
  // ---------------------------------------------------------------------------

  const isBuyerDemandInquiryRouter =
    /(?:buyer|khareedne\s*wala|kharidne\s*wala|graahak|grahak|customer|inquiry|inquiries|koi\s*aaya|koi\s*aayi|koi\s*mila|ketla\s*malya|any\s*buyers|interested\s*buyers)/i.test(lower) &&
    !/(?:chahiye|joiye|kharidna\s*hai|buy\s*karna|looking\s*to\s*buy)/i.test(lower);

  const hasOwnerProfileRouter = lead.lead_type === "PROVIDER" || lead.lead_type === "DUAL_ROLE" || Boolean(lead.metadata?.has_seller_profile);

  if (isInOwnerIntake || currentState === "OWNER_DETAILS_GATHERED" || (hasOwnerProfileRouter && isBuyerDemandInquiryRouter)) {
    // ── Site-visit intent guard: DUAL_ROLE leads can be in OWNER_DETAILS_GATHERED
    //    while still having an active site visit. Catch visit intents here so they
    //    are never swallowed by the owner-flow handlers. ───────────────────────────
    const isUnableToAttendVisit =
      intent === "CANNOT_ATTEND_VISIT" ||
      (/(?:site\s*visit|visit).*?(?:nai|nahi|nathi|cannot|can't|not\s*possible|miss|late|aaje)/i.test(lower) && /(?:nai|nahi|nathi|cannot|can't|miss)/i.test(lower)) ||
      /(?:nai|nahi|nathi|na)\s*(?:aavi\s*saku|aavi\s*shaku|aavi\s*sakyo|aavay|aavish|aa\s*saku|aa\s*sakta|aa\s*paunga)/i.test(lower);

    const isRescheduleVisit =
      intent === "RESCHEDULE_VISIT" ||
      (/(?:site\s*visit|visit).*?(?:reschedule|change\s*time|badal|timing)/i.test(lower) && !isUnableToAttendVisit) ||
      /(?:reschedule|timing\s*change|time\s*badlo)/i.test(lower);

    const isCancelVisit =
      intent === "CANCEL_VISIT" ||
      (/(?:site\s*visit|visit).*?(?:cancel|cancel\s*kar)/i.test(lower) && !isUnableToAttendVisit) ||
      /^(?:cancel|visit\s*cancel)\b/i.test(lower);

    if (
      lead.site_visit_booked &&
      (isUnableToAttendVisit || isRescheduleVisit || isCancelVisit)
    ) {
      if (isUnableToAttendVisit) {
        await supabase
          .from("site_visits")
          .update({ status: "MISSED", feedback_notes: `Missed visit: ${context.messageText}` })
          .eq("lead_id", lead.id)
          .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

        const replyText =
          lang === "GUJLISH"
            ? `Arey koi vandho nahi <b>${nameStr}</b>! 🙏 Pehla thi janavva mate aabhar. Ame samji shakiye chhiye ke urgent kaam ya emergency lidhe tame aaje nathi aavi shakya. Chalo tame bija divase anukool hoy tyare reschedule kari daiye. Shu ame <b>kaale sanje 4:00 vage</b> ke <b>5:30 vage</b> navi VIP site visit plan kariye? 🚗📍`
            : lang === "ENGLISH"
            ? `No problem at all <b>${nameStr}</b>! 🙏 Thank you for letting us know in advance. We completely understand that an urgent commitment prevented you from making it today. Let's reschedule your visit for a convenient time. Would <b>tomorrow at 4:00 PM or 5:30 PM</b> work for you? 🚗📍`
            : `Koi baat nahi <b>${nameStr}</b>! 🙏 Batane ke liye shukriya. Hum samajh sakte hain ki aaj aap visit par nahi aa pa rahe hain. Chaliye aapke liye ek aur convenient timing par reschedule kar dete hain. Kya hum <b>kal shaam 4:00 baje ya 5:30 baje</b> aapki nayi VIP site visit plan karein? 🚗📍`;

        return {
          replyText,
          nextState: "VISIT_MISSED",
          leadUpdates: {
            state: "VISIT_MISSED",
            site_visit_booked: false,
            drip_stage: "MISSED_RESCHEDULE_PROMPTED",
          },
          salesAlert: { type: "VISIT_MISSED", payload: { userText: context.messageText, reason: (action as CannotAttendVisitAction).reason || context.messageText } },
        };
      }

      if (isRescheduleVisit) {
        const reschedAct = action as RescheduleVisitAction;
        const bookAct = action as BookVisitAction;
        const combinedSlot = [
          reschedAct.new_slot_raw || bookAct.preferred_date_raw,
          bookAct.preferred_time_raw
        ].filter(Boolean).join(" ");
        const slotRaw = combinedSlot || context.messageText;
        const slotResult = parseVisitSlot(slotRaw);

        if (slotResult.isValidTime && !slotResult.isPast) {
          const newSlot = slotResult.isoUtc;
          await supabase
            .from("site_visits")
            .update({ scheduled_at: newSlot, status: "RESCHEDULED" })
            .eq("lead_id", lead.id)
            .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED", "MISSED"]);

          const formatted = new Date(newSlot).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
          const replyText =
            lang === "GUJLISH"
              ? `Ji bilkul <b>${nameStr}</b>! Tamari site visit <b>${formatted}</b> mate reschedule thai gai chhe. Amara senior sales executive time par direct site location par tamne malshe. (Site par maliye chhiye)! 🤝📍`
              : lang === "ENGLISH"
              ? `Certainly <b>${nameStr}</b>! Your site visit has been rescheduled to <b>${formatted}</b>. Our senior sales executive will meet you directly at the site location on time! 🤝📍`
              : `Ji bilkul <b>${nameStr}</b>! Aapki site visit <b>${formatted}</b> ke liye reschedule kar di gayi hai. Hamare senior sales executive time par aapse direct site location par milenge! 🤝📍`;

          return {
            replyText,
            nextState: "VISIT_RESCHEDULED",
            leadUpdates: {
              site_visit_at: newSlot,
              site_visit_datetime: newSlot,
              state: "VISIT_RESCHEDULED",
            },
            salesAlert: { type: "RESCHEDULE_VISIT", payload: { scheduledAt: newSlot, userText: context.messageText } },
          };
        }

        // No parseable slot provided — ask for it
        const replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${nameStr}</b>! Tame kaya divase ane timing par visit reschedule karva mango chho? (e.g. <b>Kaale sanje 5 vage</b> ke <b>Sunday subah 11 baje</b>). 🙏`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Which day and time would you like to reschedule your visit to? (e.g. <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>). 🙏`
            : `Ji bilkul <b>${nameStr}</b>! Aap kis din aur timing par visit reschedule karna chahte hain? (e.g. <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>). 🙏`;

        return { replyText, nextState: "SITE_VISIT_BOOKED" };
      }

      if (isCancelVisit) {
        await supabase
          .from("site_visits")
          .update({ status: "CANCELLED" })
          .eq("lead_id", lead.id)
          .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

        const replyText =
          lang === "GUJLISH"
            ? `Samji gayo <b>${nameStr}</b>. Tamari site visit cancel kari didhi chhe. Jyare tame anukool hovo tyare navi visit book kari shako chho. 🙏`
            : lang === "ENGLISH"
            ? `Understood <b>${nameStr}</b>. Your scheduled site visit has been cancelled. Whenever you are ready, you can book a new slot anytime. 🙏`
            : `Samajh gaya <b>${nameStr}</b>. Aapki scheduled site visit cancel kar di gayi hai. Jab bhi aap comfortable hon, naya slot schedule kar sakte hain. 🙏`;

        return {
          replyText,
          nextState: "VISIT_CANCELLED",
          leadUpdates: { state: "VISIT_CANCELLED", site_visit_booked: false },
          salesAlert: { type: "CANCEL_VISIT", payload: { userText: context.messageText } },
        };
      }
    }
    // ── end site-visit intent guard ──────────────────────────────────────────────

    // If owner explicitly asks for buyer property search, route to qualification cascade
    const isExplicitBuyerSearch =
      (intent === "CHANGE_REQUIREMENT" || intent === "SEEKER_QUALIFICATION") &&
      /(?:chahiye|joiye|buy|kharid|purchase|options|dekhna)/i.test(lower);

    if (currentState === "OWNER_DETAILS_GATHERED" && isExplicitBuyerSearch) {
      return handleQualificationCascade(lead, actionResult, context);
    }

    const ownerRes = await handleOwnerFlow({
      lead,
      messageText: context.messageText,
      lower,
      lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
      senderName,
      senderId: context.senderId,
      platform: context.platform,
      tenantId: activeTenantId,
      supabase,
      aiAnalysis: actionResult,
      city: resolvedCity,
      agencyName,
    });
    return {
      replyText: ownerRes.replyText,
      nextState: ownerRes.nextState as DialogState,
      leadUpdates: ownerRes.leadUpdates,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. RETURNING OWNER MENU (State: RETURNING_OWNER_MENU_PENDING)
  // ---------------------------------------------------------------------------
  if (currentState === "RETURNING_OWNER_MENU_PENDING") {
    if ((intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 1) || intent === "SUBMIT_LISTING") {
      // Option 2: List another property
      const archived = Array.isArray(lead.metadata?.archived_submissions) ? [...lead.metadata.archived_submissions] : [];
      if (lead.metadata?.owner_draft && Object.keys(lead.metadata.owner_draft).length > 0) {
        archived.push({
          ...lead.metadata.owner_draft,
          submission_id: lead.metadata.submission_id || null,
          archived_at: new Date().toISOString(),
        });
      }
      const newDraft: any = { started_at: new Date().toISOString(), attributes: {} };
      const parsedType = parsePropertyTypeFromText(context.messageText);
      const isLease = /(?:lease|pattay)/i.test(lower);
      const isRent = /(?:rent|bhade|bhadu|kiraya|kiraye|chadani)/i.test(lower);
      newDraft.transaction_type = isLease ? "LEASE_OUT" : isRent ? "RENT_OUT" : "SELL";
      if (parsedType) {
        newDraft.property_type = parsedType;
        newDraft.configuration = parsedType;
        if (isLease || /(office|shop|showroom|commercial)/i.test(parsedType)) {
          newDraft.property_category = "COMMERCIAL";
        } else if (/(plot|land)/i.test(parsedType)) {
          newDraft.property_category = "PLOT";
        } else {
          newDraft.property_category = "RESIDENTIAL";
        }
      } else if (isLease) {
        newDraft.property_category = "COMMERCIAL";
      }
      const targetState: DialogState = newDraft.property_type ? "OWNER_SOCIETY_PENDING" : "OWNER_CONFIG_PENDING";
      const replyText =
        lang === "GUJLISH"
          ? `Ji bilkul <b>${nameStr}</b>! Nayi property listing desk par swagat chhe. 🏡✨\n\n👉 <b>Tamari nayi property kaya type ni chhe — 2BHK / 3BHK Flat, Villa, ke Commercial Shop/Office?</b> 🏢`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! Let's get your next property listed. 🏡✨\n\n👉 <b>What type of property is this — 2BHK / 3BHK Flat, Villa, or Commercial Shop/Office?</b> 🏢`
          : `Ji bilkul <b>${nameStr}</b>! Nayi property listing desk par swagat hai. 🏡✨\n\n👉 <b>Aapki nayi property kis type ki hai — 2BHK / 3BHK Flat, Villa, ya Commercial Shop/Office?</b> 🏢`;

      return {
        replyText,
        nextState: targetState,
        leadUpdates: {
          lead_type: "PROVIDER",
          state: targetState,
          metadata: {
            ...(lead.metadata || {}),
            owner_draft: newDraft,
            archived_submissions: archived,
            submission_id: null,
          },
        },
      };
    } else if (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 2) {
      // Option 3: Check status
      const { data: sub } = await supabase
        .from("property_submissions")
        .select("*")
        .eq("client_id", activeTenantId)
        .eq("lead_id", lead.lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const propLabel = sub ? `${sub.configuration || sub.property_type || "Property"} at ${sub.project_name || sub.society_name || sub.location || displayCity}` : "Aapki property";
      const isSubApprovedC =
        sub?.status === "CONVERTED_TO_INVENTORY" ||
        sub?.status === "APPROVED" ||
        sub?.status === "LISTED";
      const statusLabel = isSubApprovedC
        ? "Approved & Listed in Inventory 🏡✨"
        : sub?.status === "PENDING_VERIFICATION"
        ? "Physical Verification & Quality Inspection"
        : (sub?.status || "Under Review");

      const replyText = isSubApprovedC
        ? (lang === "GUJLISH"
          ? `Ji <b>${nameStr}</b>! Tamari listed property (<b>${propLabel}</b>) approve thai ne successfully list thai chuki chhe! 🏡✨\n\nAmari sales team verified buyers ane tenants sathe aane actively match kari rahi chhe. Koi pan suitable inquiry aave etle ame tarat j tamaro sampark karshe! 🙏`
          : lang === "ENGLISH"
          ? `Hello <b>${nameStr}</b>! Your listed property (<b>${propLabel}</b>) has been approved and successfully listed in our inventory! 🏡✨\n\nOur sales team is actively matching it with verified buyers and tenants. We will connect with you as soon as a suitable offer arrives! 🙏`
          : `Ji <b>${nameStr}</b>! Aapki listed property (<b>${propLabel}</b>) approve hoke successfully list ho chuki hai! 🏡✨\n\nHamari sales team verified buyers & tenants ke saath ise actively match kar rahi hai. Koi bhi suitable inquiry aane par hum turant aapse connect karenge! 🙏`)
        : (lang === "GUJLISH"
          ? `Ji <b>${nameStr}</b>! Tamari listed property (<b>${propLabel}</b>) hal ma <b>${statusLabel}</b> stage par chhe. 📋 Amari inspection team verification mate jald aapse call par connect karshe! 🙏`
          : lang === "ENGLISH"
          ? `Hello <b>${nameStr}</b>! Your listed property (<b>${propLabel}</b>) is currently in the <b>${statusLabel}</b> stage. 📋 Our acquisition team will connect with you shortly for on-site inspection! 🙏`
          : `Ji <b>${nameStr}</b>! Aapki listed property (<b>${propLabel}</b>) abhi <b>${statusLabel}</b> stage par hai. 📋 Hamari inspection team verification ke liye jald aapse call par connect karegi! 🙏`);


      return {
        replyText,
        nextState: "OWNER_DETAILS_GATHERED",
      };
    } else {
      // Option 1 (or default): Switch to SEEKER and start fresh search
      const givenPropType = parsePropertyTypeFromText(context.messageText);
      const givenBudget = parseBudgetFromText(context.messageText);
      const givenLocation = extractLocationFromText(context.messageText);

      const replyText = givenPropType
        ? (lang === "GUJLISH"
          ? `Khub saras! <b>${givenPropType}</b>. 👍\n\n👉 Aa property <b>Buy (Kharidva) mate joiye chhe ke Rent / Lease</b> par? 🔑`
          : lang === "ENGLISH"
          ? `Great choice! <b>${givenPropType}</b>. 👍\n\n👉 Are you looking to <b>Buy</b> or <b>Rent/Lease</b> this property? 🔑`
          : `Great choice! <b>${givenPropType}</b>. 👍\n\n👉 Aap ye property <b>Buy (Kharidna)</b> chahte hain ya <b>Rent / Lease</b> par chahiye? 🔑`)
        : (lang === "GUJLISH"
          ? `Bahuj saras <b>${nameStr}</b>! 🏡 Chalo navi property search shuru kariye.\n\n👉 <b>Tame kaya type ni property joi rahya chho — Residential (Flat / Villa) ke Commercial (Shop / Office / Plot)?</b>`
          : lang === "ENGLISH"
          ? `Wonderful <b>${nameStr}</b>! 🏡 Let's start a fresh property search.\n\n👉 <b>What type of property are you looking for — Residential (Flat / Villa) or Commercial (Shop / Office / Plot)?</b>`
          : `Bahut badhiya <b>${nameStr}</b>! 🏡 Chaliye nayi property search shuru karte hain.\n\n👉 <b>Aap kis type ki property search kar rahe hain — Residential (Flat / Villa) ya Commercial (Shop / Office / Plot)?</b>`);

      return {
        replyText,
        nextState: "QUALIFYING",
        leadUpdates: {
          lead_type: "DUAL_ROLE",
          state: "QUALIFYING",
          property_type: givenPropType || null,
          requirement: null,
          purpose: null,
          location: givenLocation || null,
          budget: givenBudget || null,
          timeline: null,
          selected_property_id: null,
          last_option_ids: null,
          metadata: {
            ...(lead.metadata || {}),
            has_seller_profile: true,
            has_buyer_profile: true,
            active_persona: "BUYER",
          },
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 3b. DUAL-ROLE MENU PENDING (State: DUAL_ROLE_MENU_PENDING)
  // ---------------------------------------------------------------------------
  if (currentState === "DUAL_ROLE_MENU_PENDING") {
    // -------------------------------------------------------------------------
    // F-01 FIX: Disambiguate Initial Onboarding (Both/Dual selected) vs Returning Client
    // -------------------------------------------------------------------------
    const isInitialDualOnboarding = Boolean(
      lead.metadata?.is_initial_dual_onboarding ||
      (!lead.metadata?.has_seller_profile && !lead.metadata?.submission_id && !lead.site_visit_booked)
    );

    if (isInitialDualOnboarding) {
      const isInitialSearchChoice =
        (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 0) ||
        /^(1|1️⃣|first|1st|option\s*1|search|buy|naye|kharidna|kharidvu|naye\s*options|pehle\s*naye)\b/i.test(lower.trim());

      const isInitialListChoice =
        (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 1) ||
        /^(2|2️⃣|second|2nd|option\s*2|list|listing|pehle\s*property\s*list|pehle\s*list|bechna|vechvu|apni)\b/i.test(lower.trim());

      const isDirectOwnerUtterance =
        actionResult.user_role === "OWNER" ||
        intent === "SUBMIT_LISTING" ||
        /(?:mera|meri|maro|mari|apna|apni|own)\s+(?:flat|makan|ghar|house|villa|plot|shop|office)\s+(?:bechna|vechvu|sell|bikri|rent)/i.test(lower) ||
        /(?:bechna|bechni|vechvu|vechva|sell\s*(?:karna|karni|karvu|karva|kar))/i.test(lower);

      const detectedTypeInMenu = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
      const hasBuyerCriteriaInMenu = Boolean(
        detectedTypeInMenu ||
        actionResult.location ||
        actionResult.price_or_budget ||
        intent === "CHANGE_REQUIREMENT" ||
        intent === "SEEKER_QUALIFICATION"
      );

      const updatedMeta = { ...(lead.metadata || {}) };
      delete updatedMeta.is_initial_dual_onboarding;

      // Fresh Option 1: List first (SELLER)
      if (isInitialListChoice || isDirectOwnerUtterance) {
        if (isDirectOwnerUtterance) {
          return handleOwnerFlow({
            lead: {
              ...lead,
              lead_type: "DUAL_ROLE",
              metadata: {
                ...updatedMeta,
                has_seller_profile: true,
                has_buyer_profile: true,
                active_persona: "SELLER",
              },
            },
            messageText: context.messageText,
            lower,
            lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
            senderName,
            senderId: context.senderId,
            platform: context.platform,
            tenantId: activeTenantId,
            supabase,
            aiAnalysis: actionResult,
            city: resolvedCity,
            agencyName,
          });
        }

        const replyText =
          lang === "GUJLISH"
            ? `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par tamari property list karva mate aabhar.\n\nTamari property kai chhe? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ke Plot</b>) ane tame <b>Rent par aapva mango chho ke Sell karva</b>?`
            : lang === "ENGLISH"
            ? `Thank you <b>${nameStr}</b>! 🙏 We would be delighted to assist you in listing your property with ${agencyName}.\n\nWhat type of property is it? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa or Plot</b>) and are you looking to <b>Rent it out or Sell</b>?`
            : `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par apni property list karne ke liye dhanyawad.\n\nAapki property kis type ki hai? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ya Plot</b>) aur aap ise <b>Rent par dena chahte hain ya Sell karna</b>?`;

        return {
          replyText,
          nextState: "OWNER_CONFIG_PENDING",
          leadUpdates: {
            lead_type: "DUAL_ROLE",
            state: "OWNER_CONFIG_PENDING",
            metadata: {
              ...updatedMeta,
              has_seller_profile: true,
              has_buyer_profile: true,
              active_persona: "SELLER",
              owner_draft: { started_at: new Date().toISOString() },
            },
          },
        };
      }

      // Fresh Option 2: Search first (BUYER)
      if (isInitialSearchChoice || hasBuyerCriteriaInMenu) {
        if (hasBuyerCriteriaInMenu) {
          return handleQualificationCascade(lead, actionResult, context);
        }

        const replyText =
          lang === "GUJLISH"
            ? `Zaroor <b>${nameStr}</b>! 🏡 ${agencyName} par tame kaya type ni property joi rahya chho — <b>2/3 BHK Flat</b>, <b>Villa</b>, ke <b>Commercial Shop/Office</b>?`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! 🏡 What type of property are you looking for — <b>2/3 BHK Flat</b>, <b>Villa</b>, or <b>Commercial Shop/Office</b>?`
            : `Zaroor <b>${nameStr}</b>! 🏡 ${agencyName} par aap kis type ki property dekh rahe hain — <b>2/3 BHK Flat</b>, <b>Villa</b>, ya <b>Commercial Shop/Office</b>?`;

        return {
          replyText,
          nextState: "QUALIFYING",
          leadUpdates: {
            lead_type: "DUAL_ROLE",
            state: "QUALIFYING",
            metadata: {
              ...updatedMeta,
              has_seller_profile: true,
              has_buyer_profile: true,
              active_persona: "BUYER",
            },
          },
        };
      }

      // Fallback in initial onboarding: Re-prompt
      const replyText =
        lang === "GUJLISH"
          ? `Tame pehla potani property list karva mango chho, ke pehla nava property options jova mango chho <b>${nameStr}</b>?\n👉 1️⃣ <b>Pehle property list karein 📋</b>  2️⃣ <b>Pehle naye options dekhein 🏡</b>`
          : lang === "ENGLISH"
          ? `Would you prefer to list your existing property first, or explore new property options first <b>${nameStr}</b>?\n👉 1️⃣ <b>List property first 📋</b>  2️⃣ <b>Search options first 🏡</b>`
          : `Aap pehle apni existing property list karna chahenge, ya pehle naye property options dekhna chahenge <b>${nameStr}</b>?\n👉 1️⃣ <b>Pehle property list karein 📋</b>  2️⃣ <b>Pehle naye options dekhein 🏡</b>`;

      return {
        replyText,
        nextState: "DUAL_ROLE_MENU_PENDING",
      };
    }
    const isOpt1 =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 0) ||
      /^(1|1️⃣|first|1st|option\s*1|site\s*visit|visit|search|buy|property\s*search)\b/i.test(lower);

    const isOpt2 =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 1) ||
      /^(2|2️⃣|second|2nd|option\s*2|meri\s*listed|listed|listing|status|property\s*status|update)\b/i.test(lower);

    const isOpt3 =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 2) ||
      intent === "REQUEST_HUMAN_CALL" ||
      /^(3|3️⃣|third|3rd|option\s*3|call|advisor|senior|senior\s*advisor|talk|phone|human)\b/i.test(lower);

    // If explicit property search or criteria change was typed (e.g. "3BHK flat dikhao"):
    const detectedTypeInMenu = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
    if (
      !isOpt1 && !isOpt2 && !isOpt3 &&
      (detectedTypeInMenu || actionResult.location || actionResult.price_or_budget || intent === "CHANGE_REQUIREMENT" || intent === "SEEKER_QUALIFICATION")
    ) {
      return handleQualificationCascade(lead, actionResult, context);
    }

    // Option 1: Route to Buyer context / anchor site visit
    if (isOpt1) {
      let latestVisit: any = null;
      const { data: visits } = await supabase
        .from("site_visits")
        .select("*, inventory(*)")
        .eq("client_id", activeTenantId)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (visits && visits.length > 0) latestVisit = visits[0];
      const scheduledTime = latestVisit?.scheduled_at || (lead.site_visit_booked ? (lead.site_visit_at || lead.site_visit_datetime) : null);
      const visitTimeMs = scheduledTime ? new Date(scheduledTime).getTime() : 0;
      const isVisitInFuture = visitTimeMs > Date.now();
      const isUpcoming = Boolean(latestVisit && ["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(latestVisit.status) && lead.site_visit_booked && isVisitInFuture);
      const isMissed = Boolean(lead.state === "VISIT_MISSED" || latestVisit?.status === "MISSED");
      const isPastUnconf = Boolean(latestVisit && !isVisitInFuture && ["SCHEDULED", "CONFIRMED", "RESCHEDULED"].includes(latestVisit.status));
      const propName = latestVisit?.inventory?.project_name || lead.metadata?.selected_property_name || (lead.property_type ? (lead.location ? `${lead.property_type} (${lead.location})` : lead.property_type) : "VIP Property");
      const visitTime = scheduledTime ? new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "Scheduled Time";
      const mapLink = latestVisit?.inventory?.map_url ? `\n${formatMapHyperlink(latestVisit.inventory.map_url, "View on Google Maps")}` : "";

      if (isUpcoming) {
        const replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${nameStr}</b>! Tamari VIP Site Visit <b>${propName}</b> mate <b>${visitTime}</b> par confirmed chhe. 🚗${mapLink}\n\nAape shu karvu chhe?\n1️⃣ <b>Visit Details & Location Map 📍</b>\n2️⃣ <b>Reschedule / Cancel Visit ⏰</b>\n3️⃣ <b>Nayi Property Search karvi chhe 🏡</b>\n\n<i>(Tame 1, 2 ke 3 reply kari shako chho)</i>`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Your VIP Site Visit for <b>${propName}</b> is confirmed for <b>${visitTime}</b>. 🚗${mapLink}\n\nWhat would you like to do?\n1️⃣ <b>Visit Details & Location Map 📍</b>\n2️⃣ <b>Reschedule / Cancel Visit ⏰</b>\n3️⃣ <b>Search for New Properties 🏡</b>\n\n<i>(You can reply with 1, 2, or 3)</i>`
            : `Ji bilkul <b>${nameStr}</b>! Aapki VIP Site Visit <b>${propName}</b> ke liye <b>${visitTime}</b> par confirmed hai. 🚗${mapLink}\n\nAap kya karna chahte hain?\n1️⃣ <b>Visit Details & Location Map 📍</b>\n2️⃣ <b>Reschedule / Cancel Visit ⏰</b>\n3️⃣ <b>Nayi Property Search karni hai 🏡</b>\n\n<i>(Aap 1, 2 ya 3 reply kar sakte hain)</i>`;

        return {
          replyText,
          nextState: "SITE_VISIT_BOOKED",
          leadUpdates: {
            state: "SITE_VISIT_BOOKED",
            lead_type: "DUAL_ROLE",
            metadata: {
              ...(lead.metadata || {}),
              active_persona: "BUYER",
            },
          },
        };
      } else if (isMissed) {
        const replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${nameStr}</b>! <b>${propName}</b> mate tamari site visit (${visitTime}) miss thai hati. Shu tame navo slot reschedule karva mango chho? 📅\n\n👉 <b>Kaale sanje 4:00 vage</b> ke <b>5:30 vage</b> navi visit plan kariye? Athva 'Search' lakhi navi property shodhvo. 🚗📍`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Your site visit for <b>${propName}</b> (${visitTime}) was missed. Would you like to reschedule for a fresh convenient time? 📅\n\n👉 Would <b>tomorrow at 4:00 PM or 5:30 PM</b> work for you? Or reply 'Search' to look for new properties. 🚗📍`
            : `Ji bilkul <b>${nameStr}</b>! <b>${propName}</b> ke liye aapki site visit (${visitTime}) miss ho gayi thi. Kya hum aapke liye ek convenient naye time par reschedule karein? 📅\n\n👉 Kya hum <b>kal shaam 4:00 baje ya 5:30 baje</b> aapki nayi VIP site visit plan karein? Ya 'Search' likhkar nayi property dekhein. 🚗📍`;

        return {
          replyText,
          nextState: "VISIT_MISSED",
          leadUpdates: {
            state: "VISIT_MISSED",
            lead_type: "DUAL_ROLE",
            metadata: {
              ...(lead.metadata || {}),
              active_persona: "BUYER",
            },
          },
        };
      } else if (isPastUnconf) {
        const replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${nameStr}</b>! <b>${propName}</b> mate tamari VIP site visit (${visitTime}) no samay viti gayo chhe. 🚗\n\nShu tame visit attend kari shakya hata?\n1️⃣ <b>Haan, visit attend kari hati 👍</b>\n2️⃣ <b>Nahi, reschedule karvi chhe ⏰</b>\n3️⃣ <b>Nayi property search karvi chhe 🏡</b>`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Your VIP site visit for <b>${propName}</b> (${visitTime}) has passed. 🚗\n\nWere you able to attend the visit?\n1️⃣ <b>Yes, attended the visit 👍</b>\n2️⃣ <b>No, need to reschedule ⏰</b>\n3️⃣ <b>Search for new properties 🏡</b>`
            : `Ji bilkul <b>${nameStr}</b>! <b>${propName}</b> ke liye aapki VIP site visit (${visitTime}) ka samay ho chuka hai. 🚗\n\nKya aap visit attend kar paaye the?\n1️⃣ <b>Haan, visit attend ki thi 👍</b>\n2️⃣ <b>Nahi, reschedule karni hai ⏰</b>\n3️⃣ <b>Nayi property search karni hai 🏡</b>`;

        return {
          replyText,
          nextState: "SITE_VISIT_BOOKED",
          leadUpdates: {
            state: "SITE_VISIT_BOOKED",
            lead_type: "DUAL_ROLE",
            metadata: {
              ...(lead.metadata || {}),
              active_persona: "BUYER",
            },
          },
        };
      } else {
        const targetState: DialogState = (lead.property_type && lead.budget) ? "OPTIONS_SENT" : "QUALIFYING";
        const replyText =
          lang === "GUJLISH"
            ? `Ji <b>${nameStr}</b>! Chalo tamara buyer property search par aagal vadhiye. Tame kaya type ni property joi rahya chho? 🏡`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Let's continue with your property search. What type of property are you looking for? 🏡`
            : `Ji <b>${nameStr}</b>! Chaliye aapke property search par aage badhte hain. Aap kis type ki property search karna chahte hain? 🏡`;

        return {
          replyText,
          nextState: targetState,
          leadUpdates: {
            state: targetState,
            lead_type: "DUAL_ROLE",
            metadata: {
              ...(lead.metadata || {}),
              active_persona: "BUYER",
            },
          },
        };
      }
    }

    // Option 2: Check Seller listing status
    if (isOpt2) {
      const { data: sub } = await supabase
        .from("property_submissions")
        .select("*")
        .eq("client_id", activeTenantId)
        .or(`lead_id.eq.${lead.lead_id},lead_id.eq.${lead.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const propLabel = sub
        ? `${sub.configuration || sub.property_type || "Property"} at ${sub.society_name || sub.project_name || sub.location || displayCity}`
        : "Aapki listed property";
      const isSubApprovedB =
        sub?.status === "CONVERTED_TO_INVENTORY" ||
        sub?.status === "APPROVED" ||
        sub?.status === "LISTED";
      const statusLabel =
        isSubApprovedB
          ? "Approved & Listed in Inventory 🏡✨"
          : sub?.status === "PENDING_VERIFICATION"
          ? "Physical Verification & Quality Inspection"
          : (sub?.status || "Under Review");

      const replyText = isSubApprovedB
        ? (lang === "GUJLISH"
          ? `Ji <b>${nameStr}</b>! Tamari listed property (<b>${propLabel}</b>) approve thai ne successfully list thai chuki chhe! 🏡✨\n\nAmari sales team verified buyers ane tenants sathe aane actively match kari rahi chhe. Koi pan direct inquiry aave etle ame tarat j tamaro sampark karshe! 🙏\n\n👉 <i>Shu tamne koi biji property pan list karvi chhe? (Tame 'Ha' ke 'List another' lakhi shako chho)</i>`
          : lang === "ENGLISH"
          ? `Hello <b>${nameStr}</b>! Your listed property (<b>${propLabel}</b>) has been approved and successfully listed in our inventory! 🏡✨\n\nOur sales team is actively matching it with verified buyers and tenants. We will connect with you as soon as a suitable offer arrives! 🙏\n\n👉 <i>Would you like to list another property for sale or rent? (You can reply 'Yes' or 'List another')</i>`
          : `Ji <b>${nameStr}</b>! Aapki listed property (<b>${propLabel}</b>) approve hoke successfully list ho chuki hai! 🏡✨\n\nHamari sales team verified buyers & tenants ke saath ise actively match kar rahi hai. Koi bhi suitable inquiry aane par hum turant aapse connect karenge! 🙏\n\n👉 <i>Kya aapko koi dusri property bhi list karni hai? (Aap 'Haan' ya 'List another' likh sakte hain)</i>`)
        : (lang === "GUJLISH"
          ? `Ji <b>${nameStr}</b>! Tamari listed property (<b>${propLabel}</b>) hal ma <b>${statusLabel}</b> stage par chhe. 📋\n\nAmari inspection team verification mate jald aapse call par connect karshe! 🙏\n\n👉 <i>Shu tamne koi biji property pan list karvi chhe? (Tame 'Ha' ke 'List another' lakhi shako chho)</i>`
          : lang === "ENGLISH"
          ? `Hello <b>${nameStr}</b>! Your listed property (<b>${propLabel}</b>) is currently in the <b>${statusLabel}</b> stage. 📋\n\nOur acquisition team will connect with you shortly for verification and on-site inspection! 🙏\n\n👉 <i>Would you like to list another property for sale or rent? (You can reply 'Yes' or 'List another')</i>`
          : `Ji <b>${nameStr}</b>! Aapki listed property (<b>${propLabel}</b>) abhi <b>${statusLabel}</b> stage par hai. 📋\n\nHamari inspection team verification ke liye jald aapse call par connect karegi! 🙏\n\n👉 <i>Kya aapko koi dusri property bhi list karni hai? (Aap 'Haan' ya 'List another' likh sakte hain)</i>`);


      return {
        replyText,
        nextState: "OWNER_DETAILS_GATHERED",
        leadUpdates: {
          state: "OWNER_DETAILS_GATHERED",
          lead_type: "DUAL_ROLE",
          metadata: {
            ...(lead.metadata || {}),
            active_persona: "SELLER",
          },
        },
      };
    }

    // Option 3: Senior Advisor call & HIGH_VALUE_DUAL_ROLE alert
    if (isOpt3) {
      const { data: sub } = await supabase
        .from("property_submissions")
        .select("*")
        .eq("client_id", activeTenantId)
        .or(`lead_id.eq.${lead.lead_id},lead_id.eq.${lead.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const replyText =
        lang === "GUJLISH"
          ? `Ji bilkul <b>${nameStr}</b>! Amara senior property partner ne high-priority VIP alert mokli didhu chhe. 📞🤝\n\nTeo tamari buying requirement ane listed property banne nu portfolio samji ne agami <b>5-10 minute ma direct tamari sathe call par connect karshe</b>.`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! A high-priority VIP alert has been dispatched to our senior property partner. 📞🤝\n\nThey will <b>call you directly within 5-10 minutes</b> to discuss both your buyer requirements and listed property portfolio.`
          : `Ji bilkul <b>${nameStr}</b>! Hamare senior property partner ko high-priority VIP alert bhej diya gaya hai. 📞🤝\n\nWo aapki buying requirement aur listed property dono ka portfolio lekar agle <b>5-10 minutes me direct call par connect karenge</b>.`;

      return {
        replyText,
        nextState: "DUAL_ROLE_MENU_PENDING",
        leadUpdates: {
          lead_type: "DUAL_ROLE",
          metadata: {
            ...(lead.metadata || {}),
            last_advisor_call_requested_at: new Date().toISOString(),
          },
        },
        salesAlert: {
          type: "HIGH_VALUE_DUAL_ROLE",
          payload: {
            userText: context.messageText,
            submission: sub || lead.metadata?.owner_draft,
            scheduledAt: lead.site_visit_at || lead.site_visit_datetime,
            hint: "High-value dual-intent client: Client requested Senior Partner consultation for combined Buyer & Seller portfolio. Prepare 1031 tax exchange / reinvestment upgrade pitch.",
          },
        },
      };
    }

    const defaultReply =
      lang === "GUJLISH"
        ? `Kripya 1, 2 athva 3 mathi option pasand karjo <b>${nameStr}</b>:\n1️⃣ Site Visit / Property Search 🏡\n2️⃣ Meri Listed Property Status 📋\n3️⃣ Senior Advisor Call 📞`
        : lang === "ENGLISH"
        ? `Please choose option 1, 2, or 3 <b>${nameStr}</b>:\n1️⃣ Site Visit / Property Search 🏡\n2️⃣ My Listed Property Status 📋\n3️⃣ Senior Advisor Call 📞`
        : `Kripya 1, 2 ya 3 me se option select karein <b>${nameStr}</b>:\n1️⃣ Site Visit / Property Search 🏡\n2️⃣ Meri Listed Property Status 📋\n3️⃣ Senior Advisor Call 📞`;

    return {
      replyText: defaultReply,
      nextState: "DUAL_ROLE_MENU_PENDING",
    };
  }

  // ---------------------------------------------------------------------------
  // 4. ROLE SELECTION PENDING (State: ROLE_SELECTION_PENDING)
  // ---------------------------------------------------------------------------
  if (currentState === "ROLE_SELECTION_PENDING") {
    // 1. F-02 Greeting Guard: Intercept greetings so saying "hi" never defaults to Seeker!
    const isGreetingInRole =
      intent === "GREETING" ||
      /^(hi|hello|hey|namaste|kem\s*cho|pranam|namaskar|good\s*morning|good\s*afternoon|good\s*evening)\b/i.test(lower.trim());

    if (isGreetingInRole) {
      return {
        replyText: getGreetingTriageReply(lang, nameStr, agencyName),
        nextState: "ROLE_SELECTION_PENDING",
      };
    }

    // 2. Option 3: Both / Dual Role (Upgrade / Sell + Buy)
    const isBothChoice =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 2) ||
      /^(3|3️⃣|option\s*3|third|3rd|both|banne|dono|upgrade)\b/i.test(lower.trim());

    if (isBothChoice) {
      const replyText =
        lang === "GUJLISH"
          ? `Bilkul <b>${nameStr}</b>! Banne ma guide karshe. 👍\nPehla tame nava property options jova mango chho ke potani property list karvi chhe?\n👉 1️⃣ <b>Nava options jovo 🏡</b>  2️⃣ <b>Pehla property list karo 📋</b>`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! We can assist with both. 👍\nWould you prefer to explore new property options first, or list your property?\n👉 1️⃣ <b>Explore new options 🏡</b>  2️⃣ <b>List property first 📋</b>`
          : `Bilkul <b>${nameStr}</b>! Dono me assist karenge. 👍\nPehle aapko naye property options dekhne hain ya apni property list karni hai?\n👉 1️⃣ <b>Naye options dekhein 🏡</b>  2️⃣ <b>Pehle property list karein 📋</b>`;

      return {
        replyText,
        nextState: "DUAL_ROLE_MENU_PENDING",
        leadUpdates: {
          lead_type: "DUAL_ROLE",
          state: "DUAL_ROLE_MENU_PENDING",
          metadata: {
            ...(lead.metadata || {}),
            is_initial_dual_onboarding: true,
            has_buyer_profile: true,
            has_seller_profile: true,
            last_bot_prompt: {
              question_type: "DUAL_ROLE_SELECTION",
              sent_at: new Date().toISOString(),
            },
          },
        },
      };
    }

    // 3. Option 2: Owner / Seller / Landlord
    const detectedBuyerPropType = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
    const hasExplicitOwnerAction = /(?:bechna|bechni|bechne|vechvu|vechva|vechvo|sell|selling|bikri|deni|dena|dene|list|listing|chadani)/i.test(lower);

    const isPureOption2 =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 1) ||
      /^(?:2|2️⃣|option\s*2|second|2nd)(?:\s*(?:no|number|num|chhe|che|karo|bhai|ji|vala|wala))?$/i.test(lower.trim()) ||
      /^(?:deni|dene|sell|bechna|vechvu|vechva|rent\s*out|rent\s*pe\s*deni|list|listing)\b/i.test(lower.trim()) ||
      /(?:mera|meri|maro|mari|apna|apni|own)\s+(?:flat|makan|ghar|house|villa|plot|shop|office)\s+(?:bechna|vechvu|sell|bikri|rent)/i.test(lower) ||
      /(?:bechna|bechni|vechvu|vechva|sell\s*(?:karna|karni|karvu|karva|kar))/i.test(lower);

    // CRITICAL GUARD: If user mentions a property type (e.g. "2 BHK", "Villa", "Shop") without explicit selling verbs,
    // it is strictly a buyer requirement and NEVER an owner choice!
    const isOwnerChoice = !hasExplicitOwnerAction && detectedBuyerPropType
      ? false
      : (isPureOption2 || ((intent === "SUBMIT_LISTING" || actionResult.user_role === "OWNER") && hasExplicitOwnerAction));

    if (isOwnerChoice) {
      // If user already specified property type (e.g. "muje meri shop bechni he"), directly forward to handleOwnerFlow!
      const detectedPropType = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
      if (detectedPropType) {
        const ownerRes = await handleOwnerFlow({
          lead: {
            ...lead,
            lead_type: "PROVIDER",
            metadata: {
              ...(lead.metadata || {}),
              owner_draft: {
                started_at: new Date().toISOString(),
                transaction_type: (actionResult.transaction_type === "RENT" || actionResult.transaction_type === "LEASE") ? "RENT_OUT" : "SELL",
                property_type: detectedPropType,
                configuration: detectedPropType,
                ...(actionResult.property_category ? { property_category: actionResult.property_category } : {}),
                ...(actionResult.location ? { location: actionResult.location } : {}),
              },
            },
          },
          messageText: context.messageText,
          lower,
          lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
          senderName,
          senderId: context.senderId,
          platform: context.platform,
          tenantId: activeTenantId,
          supabase,
          aiAnalysis: actionResult,
          city: resolvedCity,
          agencyName,
        });
        return {
          replyText: ownerRes.replyText,
          nextState: ownerRes.nextState as DialogState,
          leadUpdates: ownerRes.leadUpdates,
        };
      }

      // Transition to OWNER_CONFIG_PENDING
      const initialDraft: any = {
        started_at: new Date().toISOString(),
        ...(actionResult.transaction_type ? { transaction_type: (actionResult.transaction_type === "RENT" || actionResult.transaction_type === "LEASE") ? "RENT_OUT" : "SELL" } : {}),
        ...(actionResult.property_type ? { property_type: actionResult.property_type, configuration: actionResult.property_type } : {}),
        ...(actionResult.property_category ? { property_category: actionResult.property_category } : {}),
        ...(actionResult.location ? { location: actionResult.location } : {}),
      };

      const replyText =
        lang === "GUJLISH"
          ? `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par tamari property list karva mate aabhar.\n\nTamari property kai chhe? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ke Plot</b>) ane tame <b>Rent par aapva mango chho ke Sell karva</b>?`
          : lang === "ENGLISH"
          ? `Thank you <b>${nameStr}</b>! 🙏 We would be delighted to assist you in listing your property with ${agencyName}.\n\nWhat type of property is it? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa or Plot</b>) and are you looking to <b>Rent it out or Sell</b>?`
          : `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par apni property list karne ke liye dhanyawad.\n\nAapki property kis type ki hai? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ya Plot</b>) aur aap ise <b>Rent par dena chahte hain ya Sell karna</b>?`;

      return {
        replyText,
        nextState: "OWNER_CONFIG_PENDING",
        leadUpdates: {
          lead_type: "PROVIDER",
          state: "OWNER_CONFIG_PENDING",
          metadata: {
            ...(lead.metadata || {}),
            owner_draft: initialDraft,
          },
        },
      };
    }

    // 4. Direct buyer criteria auto-bypass & Option 1 handling:
    const pType = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
    const bVal = actionResult.price_or_budget || parseBudgetFromText(context.messageText);
    const locVal = actionResult.location || extractLocationFromText(context.messageText);
    const parsedReq = parseRequirementFromText(context.messageText);
    const hasBuyerDirectCriteria = Boolean(
      pType ||
      bVal ||
      locVal ||
      parsedReq === "BUY" ||
      parsedReq === "RENT" ||
      intent === "CHANGE_REQUIREMENT" ||
      intent === "SEEKER_QUALIFICATION"
    );

    const isSeekerChoice =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 0) ||
      /^(1|1️⃣|option\s*1|first|1st|leni|lena|kharidna|kharidvu|buy|rent)\b/i.test(lower.trim());

    if (isSeekerChoice || hasBuyerDirectCriteria) {
      if (hasBuyerDirectCriteria) {
        return handleQualificationCascade(lead, actionResult, context);
      }

      // Transition to QUALIFYING as SEEKER (Option 1 pure choice)
      const replyText =
        lang === "GUJLISH"
          ? `Zaroor <b>${nameStr}</b>! 🏡 ${agencyName} par tame kaya type ni property joi rahya chho — <b>2/3 BHK Flat</b>, <b>Villa</b>, ke <b>Commercial Shop/Office</b>?`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! 🏡 What type of property are you looking for — <b>2/3 BHK Flat</b>, <b>Villa</b>, or <b>Commercial Shop/Office</b>?`
          : `Zaroor <b>${nameStr}</b>! 🏡 ${agencyName} par aap kis type ki property dekh rahe hain — <b>2/3 BHK Flat</b>, <b>Villa</b>, ya <b>Commercial Shop/Office</b>?`;

      const isDualFromRoleSelection = lead?.lead_type === "PROVIDER" || lead?.lead_type === "DUAL_ROLE" || Boolean(lead?.metadata?.has_seller_profile);
      return {
        replyText,
        nextState: "QUALIFYING",
        leadUpdates: {
          lead_type: isDualFromRoleSelection ? "DUAL_ROLE" : "SEEKER",
          state: "QUALIFYING",
          ...(isDualFromRoleSelection ? {
            metadata: {
              ...(lead.metadata || {}),
              has_seller_profile: true,
              has_buyer_profile: true,
              active_persona: "BUYER",
            }
          } : {}),
        },
      };
    }

    // 5. Unrecognized input in ROLE_SELECTION_PENDING -> Re-prompt 3-choice menu without advancing state
    return {
      replyText: getGreetingTriageReply(lang, nameStr, agencyName),
      nextState: "ROLE_SELECTION_PENDING",
    };
  }

  // ---------------------------------------------------------------------------
  // 5. CANCEL PREVIOUS VISIT CONFIRMATION (State: CANCEL_PREVIOUS_VISIT_CONFIRMATION_PENDING)
  // ---------------------------------------------------------------------------
  if (currentState === "CANCEL_PREVIOUS_VISIT_CONFIRMATION_PENDING") {
    const isCancelYes =
      (intent === "CONFIRM_CRITERIA" && (action as ConfirmCriteriaAction).confirm) ||
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 0) ||
      /^(1|1️⃣|first|1st|option\s*1|ha|haan|yes|yep|sure|cancel|karo|nayi\s*book|ha\s*cancel)/i.test(lower);

    if (isCancelYes) {
      // Cancel previous visit in DB
      await supabase
        .from("site_visits")
        .update({
          status: "CANCELLED",
          notes: "Cancelled by seeker to schedule visit for new property",
          updated_at: new Date().toISOString(),
        })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

      const pendingPropId = lead.metadata?.pending_new_visit_property_id;
      let newProp: any = null;
      if (pendingPropId) {
        const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("property_id", pendingPropId).maybeSingle();
        newProp = p;
      }
      const updatedMeta = { ...(lead.metadata || {}) };
      delete updatedMeta.pending_new_visit_property_id;
      delete updatedMeta.pending_new_visit_property_name;

      const newPropName = newProp?.project_name || "Project";
      const newPropConfig = newProp?.configuration ? `${newProp.configuration}, ` : "";
      const newPropLoc = newProp?.location || "prime location";

      const replyText =
        lang === "GUJLISH"
          ? `Pichli visit cancel kari didhi chhe! 🚗 <b>${newPropName}</b> (${newPropConfig}${newPropLoc}) ni navi <b>VIP Site Visit</b> mate tamne kayo time anukool ganasho - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
          : lang === "ENGLISH"
          ? `Previous visit cancelled! 🚗 When would you like to schedule your new <b>VIP Site Visit</b> for <b>${newPropName}</b> (${newPropConfig}${newPropLoc}) - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
          : `Pichli visit cancel kar di gayi hai! 🚗 <b>${newPropName}</b> (${newPropConfig}${newPropLoc}) ki nayi <b>VIP Site Visit</b> ke liye aap kaunsa time prefer karenge - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`;

      return {
        replyText,
        nextState: "OPTIONS_SENT",
        leadUpdates: {
          state: "OPTIONS_SENT",
          selected_property_id: pendingPropId || lead.selected_property_id,
          site_visit_booked: false,
          site_visit_at: null,
          site_visit_datetime: null,
          metadata: updatedMeta,
        },
      };
    } else {
      // Keep old visit
      const updatedMeta = { ...(lead.metadata || {}) };
      delete updatedMeta.pending_new_visit_property_id;
      delete updatedMeta.pending_new_visit_property_name;

      const replyText =
        lang === "GUJLISH"
          ? `Samajh gaya <b>${nameStr}</b>! Aapki purani visit j confirm chhe. <b>Milte hain site par!</b> 🤝📍\n\nAmara senior sales executive samay par direct site location par tamari raah joshe. Koi pan query hoy to zaroor janavjo!`
          : lang === "ENGLISH"
          ? `Understood <b>${nameStr}</b>! Your existing VIP Site Visit remains confirmed. <b>Looking forward to seeing you there!</b> 🤝📍\n\nOur senior sales executive will meet you at the site location as scheduled.`
          : `Samajh gaya <b>${nameStr}</b>! Aapki purani visit hi confirm rakhi gayi hai. <b>Milte hain site par!</b> 🤝📍\n\nHamare senior sales executive time par direct site location par aapka intezar karenge. Koi badlav ya query ho to zaroor batayein!`;

      return {
        replyText,
        nextState: "SITE_VISIT_BOOKED",
        leadUpdates: {
          state: "SITE_VISIT_BOOKED",
          site_visit_booked: true,
          metadata: updatedMeta,
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 6. CRITERIA CONFIRMATION (State: CRITERIA_CONFIRMATION_PENDING)
  // ---------------------------------------------------------------------------
  if (currentState === "CRITERIA_CONFIRMATION_PENDING") {
    const isChange =
      (intent === "CONFIRM_CRITERIA" && !(action as ConfirmCriteriaAction).confirm) ||
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 1) ||
      intent === "CHANGE_REQUIREMENT" ||
      /^(2|2️⃣|second|2nd|option\s*2|nahi|no|change|badalna|naya|nayi|navi)\b/i.test(lower);

    if (isChange) {
      // Cleanly wipe prior criteria
      const newPropType = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
      const newBudget = actionResult.price_or_budget || parseBudgetFromText(context.messageText);
      const newLocation = actionResult.location || extractLocationFromText(context.messageText);
      const isFresh = !newPropType && !newBudget && !newLocation;
      const targetState: DialogState = isFresh ? "ROLE_SELECTION_PENDING" : "QUALIFYING";

      const replyText = isFresh
        ? getGreetingTriageReply(lang, nameStr, agencyName)
        : (lang === "GUJLISH"
          ? `Noted <b>${nameStr}</b>! 👍 Ame tamara nava criteria note kari lidha chhe. Kripya janavjo, tamne kaya nava area ma properties joiye chhe? 📍`
          : lang === "ENGLISH"
          ? `Noted <b>${nameStr}</b>! 👍 Updated your preferences. Which specific area or locality would you prefer? 📍`
          : `Noted <b>${nameStr}</b>! 👍 Humne aapki nayi requirement note kar li hai. Kripya apna preferred location ya area batayein. 📍`);

      return {
        replyText,
        nextState: targetState,
        leadUpdates: {
          state: targetState,
          property_type: newPropType || null,
          budget: newBudget || null,
          location: newLocation || null,
          requirement: null,
          purpose: null,
          selected_property_id: null,
          last_option_ids: null,
          site_visit_booked: false,
          site_visit_at: null,
          site_visit_datetime: null,
        },
      };
    } else {
      // Retain criteria: query unseen inventory
      const { data: allProps } = await supabase
        .from("inventory")
        .select("*")
        .eq("client_id", activeTenantId)
        .eq("status", "AVAILABLE");

      const available = allProps || [];
      const excludedIds = new Set<string>([
        ...(Array.isArray(lead.last_option_ids) ? lead.last_option_ids : []),
        lead.selected_property_id,
      ].filter(Boolean));

      const leadBudget = Number(lead.budget || 0);
      const maxBudget = leadBudget > 0 ? leadBudget * 1.15 : Infinity;

      const strictMatches = available.filter((p: any) => {
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
        const newIds = freshProperties.map((p) => p.property_id);
        const combinedIds = Array.from(new Set([...(lead.last_option_ids || []), ...newIds]));
        const optionsCards = freshProperties.map((p, idx) => formatN8nPropertyCard(p, idx, false)).join("\n\n---\n\n");
        const critSummary = formatLeadCriteriaSummary(lead, lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH", resolvedCity);

        const heading =
          lang === "GUJLISH"
            ? `🌟 <b>${critSummary} Mujab Nava Verified Options</b>\n\n${nameStr}, tamara criteria mujab aa fresh matching properties chhe:`
            : lang === "ENGLISH"
            ? `🌟 <b>Fresh Options Matching ${critSummary}</b>\n\n${nameStr}, here are more verified properties matching your criteria:`
            : `🌟 <b>${critSummary} Ke Mutabiq Naye Verified Options</b>\n\n${nameStr}, aapke criteria ke hisab se ye fresh options hain:`;

        const trailer =
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

        return {
          replyText: `${heading}\n\n${optionsCards}\n\n${trailer}`,
          nextState: "OPTIONS_SENT",
          leadUpdates: {
            state: "OPTIONS_SENT",
            last_option_ids: combinedIds,
            selected_property_id: freshProperties[0].property_id,
          },
        };
      } else {
        const critSummary = formatLeadCriteriaSummary(lead, lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH", resolvedCity);
        const replyText =
          lang === "GUJLISH"
            ? `Ji ${nameStr}, <b>${critSummary}</b> na criteria ma amari paas aa best verified inventory available hati. Amara senior sales manager tamara mate exclusive <b>off-market options</b> arrange kari rahya chhe ane direct <b>call par connect karshe</b>. 📞`
            : lang === "ENGLISH"
            ? `Sure ${nameStr}, these were our top verified options matching <b>${critSummary}</b>. Our senior sales executives are sourcing exclusive <b>off-market inventory</b> and will <b>connect with you directly over a call</b>. 📞`
            : `Ji ${nameStr}, <b>${critSummary}</b> ke criteria me hamare paas yehi top verified inventory available thi. Hamare senior sales executive aapke liye exclusive <b>off-market options</b> arrange kar rahe hain aur aapse direct <b>call par connect karenge</b>. 📞`;

        return {
          replyText,
          nextState: "OPTIONS_SENT",
          leadUpdates: { state: "OPTIONS_SENT" },
          salesAlert: { type: "NO_PROPERTY_MATCH", payload: { userText: context.messageText } },
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7. SITE VISIT BOOKED & RESCHEDULED (State: SITE_VISIT_BOOKED / VISIT_RESCHEDULED)
  // ---------------------------------------------------------------------------
  if (currentState === "SITE_VISIT_BOOKED" || currentState === "VISIT_RESCHEDULED") {
    // A. GREETING -> Never wipe criteria! Welcome back & anchor booked visit
    if (intent === "GREETING") {
      let propDetails: any = null;
      let scheduledTime = lead.site_visit_at || lead.site_visit_datetime;

      const { data: latestVisit } = await supabase
        .from("site_visits")
        .select("*, inventory(*)")
        .eq("client_id", activeTenantId)
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestVisit) {
        scheduledTime = latestVisit.scheduled_at || scheduledTime;
        propDetails = latestVisit.inventory;
      }
      if (!propDetails && lead.selected_property_id) {
        const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("property_id", lead.selected_property_id).maybeSingle();
        propDetails = p;
      }

      const visitTimeMs = scheduledTime ? new Date(scheduledTime).getTime() : 0;
      const isFuture = visitTimeMs > Date.now();

      const visitTime = scheduledTime
        ? new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
        : "Scheduled Time";
      const propInfo = propDetails ? `\n🏢 <b>Property:</b> ${propDetails.project_name} (${propDetails.location})` : "";
      const mapInfo = propDetails?.map_url ? `\n${formatMapHyperlink(propDetails.map_url, "View on Google Maps")}` : "";

      const replyText = isFuture
        ? (lang === "GUJLISH"
          ? `Welcome back <b>${nameStr}</b>! 🙏\n\nTamari VIP Site Visit already booked chhe:${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>Site par maliye chhiye!</b> Amara senior sales executive time par direct site location par tamne malshe. Shu tamne timing reschedule karvo chhe ke koi biji query chhe?`
          : lang === "ENGLISH"
          ? `Welcome back <b>${nameStr}</b>! 🙏\n\nYou already have a VIP Site Visit booked:${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the property location on time. Would you like to reschedule the time or do you have any questions?`
          : `Welcome back <b>${nameStr}</b>! 🙏\n\nAapki VIP Site Visit already booked hai:${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par aapse direct site location par milenge. Kya aapko timing reschedule karna hai ya koi aur query hai?`)
        : (lang === "GUJLISH"
          ? `Welcome back <b>${nameStr}</b>! 🙏\n\nTamari VIP Site Visit (${visitTime})${propInfo} no samay viti gayo chhe. 🚗\n\nShu tame visit attend kari shakya hata ke navo slot reschedule karvo chhe? ⏰`
          : lang === "ENGLISH"
          ? `Welcome back <b>${nameStr}</b>! 🙏\n\nYour VIP Site Visit (${visitTime})${propInfo} has passed. 🚗\n\nWere you able to attend the visit, or would you like to reschedule a fresh slot? ⏰`
          : `Welcome back <b>${nameStr}</b>! 🙏\n\nAapki VIP Site Visit (${visitTime})${propInfo} ka samay ho chuka hai. 🚗\n\nKya aap visit attend kar paaye the ya naya slot reschedule karna chahte hain? ⏰`);

      return {
        replyText,
        nextState: currentState,
      };
    }

    // =========================================================================
    // A1. POST-VISIT SURVEY RESPONSE & ATTENDANCE / MISSED CONFIRMATION
    // (Handles "mene site visit nahi kiya", option 1/2 from post-visit survey, etc.)
    // =========================================================================
    const isVisitAttended =
      (intent === "CONFIRM_VISIT_ATTENDANCE" && (action as ConfirmVisitAttendanceAction).attended !== false) ||
      intent === "CONFIRM_VISIT" ||
      (Boolean(lead.post_visit_feedback_sent) && /^(?:1|1️⃣|first|1st|option\s*1|ha|haan|yes|attended|gaya|gaye|kiya|kari)\b/i.test(lower.trim())) ||
      /(?:mene|maine|hu|ame|hum|hamne)?\s*(?:site\s*visit|visit)\s*(?:kr|kar|kari|karyo|complete|done|aavi\s*gayo|attend|gaya|gaye|dekh\s*li|dekh\s*aaya|gaya\s*tha|gaye\s*the|di\s*thi|didhi|li\s*thi)/i.test(lower) ||
      /(?:visit|site\s*visit|property)\s*(?:dekh\s*li|dekhne\s*gaye\s*the|gaya\s*tha|ho\s*gayi|complete\s*thai|kar\s*li|kari\s*chhe|patavi\s*didhi|kr\s*di\s*thi|kar\s*di\s*thi)/i.test(lower);

    const isVisitMissed =
      (intent === "CONFIRM_VISIT_ATTENDANCE" && (action as ConfirmVisitAttendanceAction).attended === false) ||
      intent === "CANNOT_ATTEND_VISIT" ||
      (Boolean(lead.post_visit_feedback_sent) && /^(?:2|2️⃣|second|2nd|option\s*2|nahi|nhi|na|no|nope|nathi|miss|missed|couldn't)\b/i.test(lower.trim())) ||
      /(?:mene|maine|hu|ame|hum|hamne)?\s*(?:site\s*visit|visit)\s*(?:nahi|nhi|nathi|nai)\s*(?:kiya|ki|kari|karyo|attend|gaya)/i.test(lower) ||
      (/(?:site\s*visit|visit).*?(?:nahi|nhi|nathi|miss)/i.test(lower) && !lower.includes("reschedule") && !lower.includes("cancel"));

    if (isVisitAttended) {
      await supabase
        .from("site_visits")
        .update({ status: "COMPLETED", feedback_notes: context.messageText })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

      const isNeg = /(discount|negotiat|bhav\s*ochho|rate\s*kam|price|offer|token)/i.test(lower);
      const isLoan = /(loan|bank|emi|interest|finance)/i.test(lower);

      const replyText = isNeg
        ? (lang === "GUJLISH"
          ? `Tamara feedback mate aabhar <b>${nameStr}</b>! 🙏 Developer sathe special pricing ane exclusive payment plan finalize karva mate amara senior sales director direct tamaro sampark karshe.`
          : lang === "ENGLISH"
          ? `Thank you for your feedback <b>${nameStr}</b>! 🙏 Our senior property director will personally connect with you to arrange an exclusive developer sitting and discuss the best negotiated price.`
          : `Aapke feedback ke liye dhanyawad <b>${nameStr}</b>! 🙏 Developer ke sath special pricing aur best payment scheme finalize karne ke liye hamare senior sales director direct aapse call par connect karenge.`)
        : isLoan
        ? (lang === "GUJLISH"
          ? `Tamara feedback mate aabhar <b>${nameStr}</b>! 🏦 Amari banking & loan expert team lowest interest rate ane easy EMI guidance mate tamne turant call karshe.`
          : lang === "ENGLISH"
          ? `Thank you for your feedback <b>${nameStr}</b>! 🏦 Our preferred banking partners will reach out shortly to guide you with the lowest home loan interest rates and flexible EMI structures.`
          : `Aapke feedback ke liye dhanyawad <b>${nameStr}</b>! 🏦 Hamari home loan & banking team lowest interest rate aur easy EMI structure guide karne ke liye aapse turant connect karegi.`)
        : (lang === "GUJLISH"
          ? `Khub saras <b>${nameStr}</b>! 🌟 Tamne property ane layout kevo lagyo? Jo project pasand aavyo hoy to shu ame developer sathe <b>special token pricing baithak</b> plan kariye?`
          : lang === "ENGLISH"
          ? `Wonderful <b>${nameStr}</b>! 🌟 How did you like the property and floor layout? If you liked it, shall we arrange a <b>developer sitting for exclusive negotiated pricing</b>?`
          : `Bohot badiya <b>${nameStr}</b>! 🌟 Aapko property aur layout kaisa laga? Agar pasand aaya ho to kya hum developer ke sath <b>best token pricing sitting</b> arrange karein?`);

      return {
        replyText,
        nextState: "SITE_VISIT_DONE",
        leadUpdates: {
          state: "SITE_VISIT_DONE",
          site_visit_booked: false,
          post_visit_feedback_sent: true,
        },
        salesAlert: { type: "FEEDBACK_RECEIVED", payload: { userText: context.messageText } },
      };
    }

    if (isVisitMissed) {
      await supabase
        .from("site_visits")
        .update({ status: "MISSED", feedback_notes: `Missed visit: ${context.messageText}` })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

      const replyText =
        lang === "GUJLISH"
          ? `Arey koi vandho nahi <b>${nameStr}</b>! 🙏 Janavva mate aabhar. Ame samji shakiye chhiye ke urgent kaam na lidhe tame scheduled visit par nathi aavi shakya. Chalo bija divase anukool hoy tyare visit reschedule kari daiye.\n\n👉 <b>Shu ame kaale sanje 5:00 vage ke Sunday savare 11:00 vage navi VIP Site Visit 🚗 schedule kariye?</b>`
          : lang === "ENGLISH"
          ? `No problem at all <b>${nameStr}</b>! 🙏 Thank you for letting us know. We completely understand that an urgent commitment prevented you from attending the scheduled visit. Let's reschedule your VIP visit for a convenient time.\n\n👉 <b>Would tomorrow at 5:00 PM or Sunday at 11:00 AM work best for your new VIP Site Visit 🚗?</b>`
          : `Koi baat nahi <b>${nameStr}</b>! 🙏 Batane ke liye shukriya. Hum samajh sakte hain ki achanak kisi zaroori kaam ki wajah se aap scheduled visit par nahi aa paaye. Chaliye aapke liye nayi timing par visit reschedule kar dete hain.\n\n👉 <b>Kya hum kal shaam 5:00 baje ya Sunday subah 11:00 baje aapki nayi VIP Site Visit 🚗 schedule karein?</b>`;

      return {
        replyText,
        nextState: "VISIT_MISSED",
        leadUpdates: {
          state: "VISIT_MISSED",
          site_visit_booked: false,
          drip_stage: "MISSED_RESCHEDULE_PROMPTED",
        },
        salesAlert: { type: "VISIT_MISSED", payload: { userText: context.messageText, reason: (action as CannotAttendVisitAction).reason || context.messageText } },
      };
    }

    // A2. SUB-CHOICES FROM DUAL-ROLE SITE VISIT CONFIRMATION (1, 2, or 3)
    const isSearchNewChoice =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 2) ||
      /^(?:3|3️⃣|third|3rd|option\s*3|search|nayi|naya|new\s*property|property\s*search)\b/i.test(lower);

    if (isSearchNewChoice) {
      const pType = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
      const replyText =
        lang === "GUJLISH"
          ? `Bahuj saras <b>${nameStr}</b>! 🏡 Chalo navi property search shuru kariye.\n\n👉 <b>Tame kaya type ni property joi rahya chho — Residential (Flat / Villa) ke Commercial (Shop / Office / Plot)?</b>`
          : lang === "ENGLISH"
          ? `Wonderful <b>${nameStr}</b>! 🏡 Let's start a fresh property search.\n\n👉 <b>What type of property are you looking for — Residential (Flat / Villa) or Commercial (Shop / Office / Plot)?</b>`
          : `Bahut badhiya <b>${nameStr}</b>! 🏡 Chaliye nayi property search shuru karte hain.\n\n👉 <b>Aap kis type ki property search kar rahe hain — Residential (Flat / Villa) ya Commercial (Shop / Office / Plot)?</b>`;

      return {
        replyText,
        nextState: "QUALIFYING",
        leadUpdates: {
          state: "QUALIFYING",
          lead_type: "DUAL_ROLE",
          property_type: pType || null,
          requirement: null,
          purpose: null,
          location: null,
          budget: null,
          timeline: null,
          selected_property_id: null,
          last_option_ids: null,
          metadata: {
            ...(lead.metadata || {}),
            active_persona: "BUYER",
          },
        },
      };
    }

    const isVisitDetailsChoice =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 0) ||
      /^(?:1|1️⃣|first|1st|option\s*1|details|map|location)\b/i.test(lower);

    if (isVisitDetailsChoice) {
      let propDetails: any = null;
      let scheduledTime = lead.site_visit_at || lead.site_visit_datetime;
      const { data: latestVisit } = await supabase
        .from("site_visits")
        .select("*, inventory(*)")
        .eq("client_id", activeTenantId)
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestVisit) {
        scheduledTime = latestVisit.scheduled_at || scheduledTime;
        propDetails = latestVisit.inventory;
      }
      if (!propDetails && lead.selected_property_id) {
        const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("property_id", lead.selected_property_id).maybeSingle();
        propDetails = p;
      }

      const visitTime = scheduledTime
        ? new Date(scheduledTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })
        : "Scheduled Time";
      const propInfo = propDetails ? `\n🏢 <b>Property:</b> ${propDetails.project_name} (${propDetails.location})` : "";
      const mapInfo = propDetails?.map_url ? `\n${formatMapHyperlink(propDetails.map_url, "View on Google Maps")}` : "";

      const replyText =
        lang === "GUJLISH"
          ? `Tamari VIP Site Visit Details: 🚗${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>Site par maliye chhiye!</b> Amara senior sales executive time par direct site location par tamne malshe. Jo timing reschedule karvo hoy to batavjo!`
          : lang === "ENGLISH"
          ? `Your VIP Site Visit Details: 🚗${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the location. Let us know if you need to reschedule!`
          : `Aapki VIP Site Visit Details: 🚗${propInfo}\n⏰ <b>Scheduled Time:</b> ${visitTime}${mapInfo}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par direct site location par milenge. Agar timing reschedule karni ho to batayein!`;

      return {
        replyText,
        nextState: "SITE_VISIT_BOOKED",
      };
    }

    const isReschedulePromptChoice =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 1) ||
      /^(?:2|2️⃣|second|2nd|option\s*2)\b/i.test(lower);

    if (isReschedulePromptChoice) {
      const replyText =
        lang === "GUJLISH"
          ? `Ji bilkul <b>${nameStr}</b>! Tame kaya divase ane timing par visit reschedule karva mango chho? (e.g. <b>Kaale sanje 5 vage</b> ke <b>Sunday subah 11 baje</b>). Jo cancel karvi hoy to 'Cancel' lakhi shako chho. 🙏`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! Which day and time would you like to reschedule your visit to? (e.g. <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>). If you wish to cancel, you can reply 'Cancel'. 🙏`
          : `Ji bilkul <b>${nameStr}</b>! Aap kis din aur timing par visit reschedule karna chahte hain? (e.g. <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>). Agar cancel karni ho to 'Cancel' likh sakte hain. 🙏`;

      return {
        replyText,
        nextState: "SITE_VISIT_BOOKED",
      };
    }

    const isSecondarySearchChoice =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 2) ||
      /^(?:3|3️⃣|third|3rd|option\s*3|biji\s*property|dusri\s*property|other\s*propert|nayi\s*property|aur\s*options|kuch\s*aur\s*options)\b/i.test(lower);

    if (isSecondarySearchChoice) {
      const replyText =
        lang === "GUJLISH"
          ? `Bilkul <b>${nameStr}</b>! Tamari scheduled visit safe chhe. Navi property kaya type ni joi rahya chho? 🏢`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! Your scheduled visit remains confirmed. What type of new property are you looking for? 🏢`
          : `Bilkul <b>${nameStr}</b>! Aapki scheduled visit safe hai. Nayi property kis type ki search kar rahe hain? 🏢`;

      return {
        replyText,
        nextState: "SITE_VISIT_BOOKED",
        leadUpdates: {
          site_visit_booked: true,
          metadata: {
            ...(lead.metadata || {}),
            secondary_search_in_progress: true,
          },
        },
      };
    }

    const isPropertyListChoice =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 3) ||
      /^(?:4|4️⃣|fourth|4th|option\s*4|property\s*list|list\s*property|vechvu|bechna)\b/i.test(lower);

    if (isPropertyListChoice) {
      const replyText =
        lang === "GUJLISH"
          ? `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par tamari property list karva mate aabhar.\n\nTamari property kai chhe? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ke Plot</b>) ane tame <b>Rent par aapva mango chho ke Sell karva</b>?`
          : lang === "ENGLISH"
          ? `Thank you <b>${nameStr}</b>! 🙏 We would be delighted to assist you in listing your property with ${agencyName}.\n\nWhat type of property is it? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa or Plot</b>) and are you looking to <b>Rent it out or Sell</b>?`
          : `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par apni property list karne ke liye dhanyawad.\n\nAapki property kis type ki hai? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ya Plot</b>) aur aap ise <b>Rent par dena chahte hain ya Sell karna</b>?`;

      return {
        replyText,
        nextState: "OWNER_CONFIG_PENDING",
        leadUpdates: {
          lead_type: "DUAL_ROLE",
          state: "OWNER_CONFIG_PENDING",
          metadata: {
            ...(lead.metadata || {}),
            has_seller_profile: true,
            has_buyer_profile: true,
            active_persona: "SELLER",
            owner_draft: { started_at: new Date().toISOString() },
          },
        },
      };
    }

    // B. RESCHEDULE_VISIT
    if (intent === "RESCHEDULE_VISIT" || (intent === "BOOK_VISIT" && (action as BookVisitAction).preferred_date_raw)) {
      const reschedAct = action as RescheduleVisitAction;
      const bookAct = action as BookVisitAction;
      const combinedSlot = [
        reschedAct.new_slot_raw || bookAct.preferred_date_raw,
        bookAct.preferred_time_raw
      ].filter(Boolean).join(" ");
      const slotRaw = combinedSlot || context.messageText;
      const slotResult = parseVisitSlot(slotRaw);

      if (!slotResult.isValidTime) {
        const replyText =
          lang === "GUJLISH"
            ? `Amara site visit timings saware <b>10:00 AM thi sanje 6:00 PM</b> sudhi na hoy chhe. Kripya aa samay vachhe no slot janavjo. 🙏`
            : lang === "ENGLISH"
            ? `Our property site visits are scheduled between <b>10:00 AM and 6:00 PM IST</b>. Kindly suggest a convenient slot within this window. 🙏`
            : `Hamare site visit timings subah <b>10:00 AM se shaam 6:00 PM</b> ke beech hote hain. Kripya is time window me apna convenient slot batayein. 🙏`;
        return { replyText, nextState: currentState };
      }

      if (slotResult.isPast) {
        const replyText =
          lang === "GUJLISH"
            ? `Aa time viti gayo chhe. Kripya aavnar divas athva timing janavjo. 🙏`
            : lang === "ENGLISH"
            ? `This time slot has already passed. Please suggest an upcoming date and time. 🙏`
            : `Ye time slot nikal chuka hai. Kripya aane wala day ya timing batayein. 🙏`;
        return { replyText, nextState: currentState };
      }

      const newSlot = slotResult.isoUtc;
      await supabase
        .from("site_visits")
        .update({ scheduled_at: newSlot, status: "RESCHEDULED" })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED", "MISSED"]);

      const formatted = new Date(newSlot).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
      const replyText =
        lang === "GUJLISH"
          ? `Ji bilkul <b>${nameStr}</b>! Tamari site visit <b>${formatted}</b> mate reschedule thai gai chhe. Amara senior sales executive time par direct site location par tamne malshe. (Site par maliye chhiye)! 🤝📍`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! Your site visit has been rescheduled to <b>${formatted}</b>. Our senior sales executive will meet you directly at the site location on time! 🤝📍`
          : `Ji bilkul <b>${nameStr}</b>! Aapki site visit <b>${formatted}</b> ke liye reschedule kar di gayi hai. Hamare senior sales executive time par aapse direct site location par milenge (Milte hain site par)! 🤝📍`;

      return {
        replyText,
        nextState: "VISIT_RESCHEDULED",
        leadUpdates: {
          site_visit_at: newSlot,
          site_visit_datetime: newSlot,
          site_visit_booked: true,
          state: "VISIT_RESCHEDULED",
          pre_visit_reminder_sent: false,
          post_visit_feedback_sent: false,
          metadata: {
            ...(lead.metadata || {}),
            morning_briefing_sent: false,
            morning_briefing_at: null,
            post_visit_nudge_sent: false,
            missed_visit_reschedule_nudge_sent: false,
          },
        },
        salesAlert: { type: "RESCHEDULE_VISIT", payload: { scheduledAt: newSlot, userText: context.messageText } },
      };
    }

    // C. CANNOT_ATTEND_VISIT
    if (intent === "CANNOT_ATTEND_VISIT") {
      await supabase
        .from("site_visits")
        .update({ status: "MISSED", feedback_notes: `Missed visit: ${context.messageText}` })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

      const replyText =
        lang === "GUJLISH"
          ? `Arey koi vandho nahi <b>${nameStr}</b>! 🙏 Pehla thi janavva mate aabhar. Ame samji shakiye chhiye ke urgent kaam ya emergency lidhe tame aaje nathi aavi shakya. Chalo tame bija divase anukool hoy tyare reschedule kari daiye. Shu ame <b>kaale sanje 4:00 vage</b> ke <b>5:30 vage</b> navi VIP site visit plan kariye? 🚗📍`
          : lang === "ENGLISH"
          ? `No problem at all <b>${nameStr}</b>! 🙏 Thank you for letting us know in advance. We completely understand that an urgent commitment prevented you from making it today. Let's reschedule your visit for a convenient time. Would <b>tomorrow at 4:00 PM or 5:30 PM</b> work for you? 🚗📍`
          : `Koi baat nahi <b>${nameStr}</b>! 🙏 Batane ke liye shukriya. Hum samajh sakte hain ki achanak kisi zaroori kaam ya emergency ki wajah se aap visit par nahi aa pa rahe hain. Chaliye aapke liye dusri convenient timing par reschedule kar dete hain. Kya hum <b>kal shaam 4:00 baje ya 5:30 baje</b> aapki nayi VIP site visit plan karein? 🚗📍`;

      return {
        replyText,
        nextState: "VISIT_MISSED",
        leadUpdates: {
          state: "VISIT_MISSED",
          site_visit_booked: false,
          drip_stage: "MISSED_RESCHEDULE_PROMPTED",
        },
        salesAlert: { type: "VISIT_MISSED", payload: { userText: context.messageText, reason: (action as CannotAttendVisitAction).reason || context.messageText } },
      };
    }

    // D. CANCEL_VISIT
    if (intent === "CANCEL_VISIT") {
      await supabase
        .from("site_visits")
        .update({ status: "CANCELLED" })
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);

      const replyText =
        lang === "GUJLISH"
          ? `Samji gayo <b>${nameStr}</b>. Tamari site visit cancel kari didhi chhe. Jyare tame anukool hovo tyare navi visit book kari shako chho. 🙏`
          : lang === "ENGLISH"
          ? `Understood <b>${nameStr}</b>. Your scheduled site visit has been cancelled. Whenever you are ready, you can book a new slot anytime. 🙏`
          : `Samajh gaya <b>${nameStr}</b>. Aapki scheduled site visit cancel kar di gayi hai. Jab bhi aap comfortable hon, naya slot schedule kar sakte hain. 🙏`;

      return {
        replyText,
        nextState: "VISIT_CANCELLED",
        leadUpdates: { state: "VISIT_CANCELLED", site_visit_booked: false },
        salesAlert: { type: "CANCEL_VISIT", payload: { userText: context.messageText } },
      };
    }

    // E. ASK_FAQ while visit booked
    if (intent === "ASK_FAQ") {
      return handleFaqResponse(lead, action as AskFaqAction, context, true);
    }

    // F. BROCHURE / MAP REQUEST while visit booked
    if (intent === "BROCHURE_REQUEST" || intent === "MAP_REQUEST") {
      return handleBrochureOrMapResponse(lead, intent, context, true);
    }

    // G. DUAL-ROLE: OWNER LISTING INTAKE FROM BOOKED VISIT
    if (
      intent === "SUBMIT_LISTING" ||
      actionResult.user_role === "OWNER" ||
      /(?:mera|meri|maro|mari|apna|apni|own)\s+(?:flat|makan|ghar|house|villa|plot|shop|office)\s+(?:bechna|vechvu|sell|bikri|rent)/i.test(lower)
    ) {
      const ownerRes = await handleOwnerFlow({
        lead,
        messageText: context.messageText,
        lower,
        lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
        senderName,
        senderId: context.senderId,
        platform: context.platform,
        tenantId: activeTenantId,
        supabase,
        aiAnalysis: actionResult,
        city: resolvedCity,
        agencyName,
      });
      return {
        replyText: ownerRes.replyText,
        nextState: ownerRes.nextState as DialogState,
        leadUpdates: ownerRes.leadUpdates,
      };
    }

    // H. NEW PROPERTY INQUIRY FROM BOOKED VISIT (F-09: Secondary Search Active Visit Preservation)
    const parsedTypeInBooked = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
    if (intent === "CHANGE_REQUIREMENT" || parsedTypeInBooked) {
      const existingSearches = Array.isArray(lead.metadata?.seeker_profile?.searches)
        ? [...lead.metadata.seeker_profile.searches]
        : [];
      if (lead.property_type) {
        const isAlreadyArchived = existingSearches.some(
          (s: any) => s.property_type === lead.property_type && s.requirement === lead.requirement && s.location === lead.location
        );
        if (!isAlreadyArchived) {
          existingSearches.push({
            searched_at: new Date().toISOString(),
            property_type: lead.property_type || null,
            requirement: lead.requirement || null,
            budget: lead.budget || null,
            location: lead.location || null,
            timeline: lead.timeline || null,
            purpose: lead.purpose || null,
            status: "VISIT_BOOKED",
          });
        }
      }

      const cascadeRes = await handleQualificationCascade(lead, actionResult, context);
      return {
        ...cascadeRes,
        nextState: cascadeRes.nextState === "OPTIONS_SENT" ? "OPTIONS_SENT" : "SITE_VISIT_BOOKED",
        leadUpdates: {
          ...(cascadeRes.leadUpdates || {}),
          site_visit_booked: true,
          site_visit_at: lead.site_visit_at || lead.site_visit_datetime,
          site_visit_datetime: lead.site_visit_datetime || lead.site_visit_at,
          state: cascadeRes.leadUpdates?.state === "OPTIONS_SENT" ? "OPTIONS_SENT" : "SITE_VISIT_BOOKED",
          metadata: {
            ...(lead.metadata || {}),
            ...(cascadeRes.leadUpdates?.metadata || {}),
            secondary_search_active: true,
            primary_visit_preserved: true,
            seeker_profile: {
              ...(lead.metadata?.seeker_profile || {}),
              ...(cascadeRes.leadUpdates?.metadata?.seeker_profile || {}),
              searches: existingSearches,
              has_active_booked_visit: true,
            },
          },
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 8. VISIT MISSED (State: VISIT_MISSED)
  // ---------------------------------------------------------------------------
  if (currentState === "VISIT_MISSED") {
    if (intent === "RESCHEDULE_VISIT" || intent === "BOOK_VISIT") {
      const reschedAct = action as RescheduleVisitAction;
      const bookAct = action as BookVisitAction;
      const combinedSlot = [
        reschedAct.new_slot_raw || bookAct.preferred_date_raw,
        bookAct.preferred_time_raw
      ].filter(Boolean).join(" ");
      const slotRaw = combinedSlot || context.messageText;
      const slotResult = parseVisitSlot(slotRaw);

      if (slotResult.isValidTime && !slotResult.isPast) {
        const newSlot = slotResult.isoUtc;
        await supabase
          .from("site_visits")
          .update({ scheduled_at: newSlot, status: "RESCHEDULED" })
          .eq("lead_id", lead.id)
          .in("status", ["MISSED", "SCHEDULED", "CONFIRMED"]);

        const formatted = new Date(newSlot).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
        const replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${nameStr}</b>! Tamari VIP site visit <b>${formatted}</b> mate reschedule thai gai chhe. Amara senior sales executive time par direct site location par tamne malshe. (Site par maliye chhiye)! 🤝📍`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Your VIP site visit has been rescheduled to <b>${formatted}</b>. Our senior sales executive will meet you directly at the site location on time! 🤝📍`
            : `Ji bilkul <b>${nameStr}</b>! Aapki VIP site visit <b>${formatted}</b> ke liye reschedule kar di gayi hai. Hamare senior sales executive time par aapse direct site location par milenge (Milte hain site par)! 🤝📍`;

        return {
          replyText,
          nextState: "SITE_VISIT_BOOKED",
          leadUpdates: {
            site_visit_at: newSlot,
            site_visit_datetime: newSlot,
            site_visit_booked: true,
            state: "SITE_VISIT_BOOKED",
            pre_visit_reminder_sent: false,
            post_visit_feedback_sent: false,
            metadata: {
              ...(lead.metadata || {}),
              morning_briefing_sent: false,
              morning_briefing_at: null,
              post_visit_nudge_sent: false,
              missed_visit_reschedule_nudge_sent: false,
            },
          },
          salesAlert: { type: "SITE_VISIT_BOOKED", payload: { scheduledAt: newSlot, userText: context.messageText } },
        };
      }
    }

    const replyText =
      lang === "GUJLISH"
        ? `Shu ame <b>kaale sanje 4:00 vage</b> ke <b>5:30 vage</b> navi VIP site visit plan kariye? 🚗📍`
        : lang === "ENGLISH"
        ? `Would <b>tomorrow at 4:00 PM or 5:30 PM</b> work for you to reschedule your visit? 🚗📍`
        : `Kya hum <b>kal shaam 4:00 baje ya 5:30 baje</b> aapki nayi VIP site visit plan karein? 🚗📍`;

    return { replyText, nextState: "VISIT_MISSED" };
  }

  // ---------------------------------------------------------------------------
  // 9. SITE VISIT DONE (State: SITE_VISIT_DONE)
  // ---------------------------------------------------------------------------
  if (currentState === "SITE_VISIT_DONE") {
    // 1. Negotiation / Token Sitting Request
    const isNeg = /(discount|negotiat|bhav\s*ochho|rate\s*kam|price|offer|token|sitting|baithak|deal)/i.test(lower);
    const isLoan = /(loan|bank|emi|interest|finance)/i.test(lower);

    // 2. Post-Visit Feedback & Objections (e.g. "Layout accha nai laga. Front gate oe kenal he", "Pasand nahi aaya")
    const hasDislike = /(?:accha\s*nai|acha\s*nahi|pasand\s*nahi|kharab|bekar|problem|issue|suit\s*nahi|jamyo\s*nahi|nathi\s*gamyu|not\s*good|dislike|negative|complain|concern|khot|kami)/i.test(lower);
    const hasLayoutIssue = /(layout|planning|design|room\s*size|chota|nano|small|carpet\s*area|floor\s*plan)/i.test(lower);
    const hasCanalIssue = /(kenal|canal|drain|naala|nadi|gutter|kachra|smell|odor)/i.test(lower);
    const hasRoadIssue = /(road|gate|approach|entry|traffic|noise|parking|location)/i.test(lower);
    const hasPriceIssue = /(bhav\s*vadhare|price\s*high|costly|expensive|budget\s*bahar|bohot\s*jyada)/i.test(lower);

    const isObjection = hasDislike || hasLayoutIssue || hasCanalIssue || hasRoadIssue || hasPriceIssue || Boolean((action as ConfirmVisitAttendanceAction)?.feedback);

    // Prior feedback checks to prevent amnesiac repetitions
    const hasPriorFeedback = Boolean(
      lead.metadata?.visit_objection_at ||
      lead.metadata?.visit_feedback ||
      lead.metadata?.last_objection
    );

    const hasOptionsAlreadySent = Boolean(lead.metadata?.alternative_options_sent);
    const lastOptionIds: string[] = Array.isArray(lead.last_option_ids)
      ? lead.last_option_ids
      : (Array.isArray(lead.metadata?.alternative_option_ids) ? lead.metadata.alternative_option_ids : []);

    // Selection of option 1 or 2 AFTER options cards were sent
    const isSelectingOpt1 =
      hasOptionsAlreadySent &&
      lastOptionIds.length > 0 &&
      /^(?:1|1️⃣|first|1st|option\s*1|pehla|pehli)\b/i.test(lower.trim());

    const isSelectingOpt2 =
      hasOptionsAlreadySent &&
      lastOptionIds.length > 1 &&
      /^(?:2|2️⃣|second|2nd|option\s*2|dusra|doosra|bijo)\b/i.test(lower.trim());

    // Answering choice 1 (alternative options) to post-visit objection question
    const isChoice1Alternative =
      hasPriorFeedback &&
      !hasOptionsAlreadySent &&
      (/^(?:1|1️⃣|first|1st|option\s*1)\b/i.test(lower.trim()) ||
       /^(?:haan|ha|yes|share\s*karo|karo|bhejo|sure|ok|chalo)\b/i.test(lower.trim()));

    // General or explicit request for alternative options (e.g. "Option share karo", "options share karo", "option bhejo", etc.)
    const hasAskedOptions =
      /(?:options?|alternative|projects?|properties?)\s*(?:share|dikhao|batao|bhejo|send|aapo|chahiye|kar\s*do|karo|moklo)/i.test(lower) ||
      /(?:share|bhejo|send|dikhao|batao|moklo)\s*(?:options?|alternative|projects?|properties?|list|details)/i.test(lower) ||
      /^(?:options?|alternative|bija\s*options?|dusre?\s*options?|nava\s*options?)\b/i.test(lower.trim()) ||
      /(?:option|options)\s*share/i.test(lower) ||
      /(?:dusra|doosra|bijo|bija|other|aur|nava|navi|new|alternative)\s*(?:option|options|property|project|flat|villa|dikhao|batao|share|bhejo)/i.test(lower) ||
      (intent === "GENERAL_QUERY" && (action as any)?.query === "request_alternative_options");

    const isAlternativeRequest = (hasAskedOptions || isChoice1Alternative) && !isSelectingOpt1 && !isSelectingOpt2;

    // Choice 2 (call) to post-visit objection question or human call request
    const isChoice2Call =
      hasPriorFeedback &&
      !hasOptionsAlreadySent &&
      /^(?:2|2️⃣|second|2nd|option\s*2)\b/i.test(lower.trim());

    const isAdvisorCallRequest =
      intent === "REQUEST_HUMAN_CALL" ||
      isChoice2Call ||
      /(?:call|phone|baat|consult|advisor|director|executive|manager)\s*(?:karo|karvao|karein|karvu|karvo|connect|chahiye|schedule|arrange)/i.test(lower);

    // Persist feedback notes in site_visits table
    await supabase
      .from("site_visits")
      .update({ status: "COMPLETED", feedback_notes: context.messageText })
      .eq("lead_id", lead.id)
      .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED", "COMPLETED"]);

    const currentMeta = (lead.metadata || {}) as Record<string, any>;
    const updatedMeta = {
      ...currentMeta,
      visit_feedback: isObjection ? context.messageText : (currentMeta.visit_feedback || context.messageText),
      last_objection: isObjection ? context.messageText : currentMeta.last_objection,
      visit_objection_at: isObjection ? new Date().toISOString() : currentMeta.visit_objection_at,
    };

    // Case A: Customer selects Alternative Option 1 or 2
    if (isSelectingOpt1 || isSelectingOpt2) {
      const selectedIndex = isSelectingOpt1 ? 0 : 1;
      const chosenPropId = lastOptionIds[selectedIndex];

      const { data: chosenProp } = await supabase
        .from("inventory")
        .select("property_id, project_name, configuration, property_category, location, price")
        .eq("client_id", activeTenantId)
        .eq("property_id", chosenPropId)
        .maybeSingle();

      const chosenName = chosenProp?.project_name || `Option ${selectedIndex + 1}`;
      const chosenLoc = chosenProp?.location ? ` in ${chosenProp.location}` : "";

      const replyText =
        lang === "GUJLISH"
          ? `Khub saras <b>${nameStr}</b>! 🌟 Tame <b>${chosenName}</b>${chosenLoc} pasand karyu chhe.\n\n👉 Shu ame <b>kaale sanje 5:00 vage</b> ke <b>Sunday savare 11:00 vage</b> tamari VIP Site Visit 🚗 schedule kariye?`
          : lang === "ENGLISH"
          ? `Excellent choice <b>${nameStr}</b>! 🌟 You have selected <b>${chosenName}</b>${chosenLoc}.\n\n👉 Shall we schedule your VIP Site Visit 🚗 for <b>Tomorrow at 5:00 PM</b> or <b>Sunday at 11:00 AM</b>?`
          : `Bahut badhiya <b>${nameStr}</b>! 🌟 Aapne <b>${chosenName}</b>${chosenLoc} pasand kiya hai.\n\n👉 Kya hum <b>kal shaam 5:00 baje</b> ya <b>Sunday subah 11:00 baje</b> aapki VIP Site Visit 🚗 plan karein?`;

      return {
        replyText,
        nextState: "SITE_VISIT_PROPOSED",
        leadUpdates: {
          state: "SITE_VISIT_PROPOSED",
          selected_property_id: chosenPropId,
          site_visit_booked: false,
          metadata: {
            ...updatedMeta,
            selected_from_options: true,
            selected_option_index: selectedIndex + 1,
            selected_property_id: chosenPropId,
          },
        },
        salesAlert: {
          type: "SITE_VISIT_PROPOSED",
          payload: {
            userText: context.messageText,
            selected_property: chosenName,
            hint: "Lead selected alternative property post-visit. Site visit proposal sent.",
          },
        },
      };
    }

    // Case B: Customer requests Senior Advisor / Director Call
    if (isAdvisorCallRequest) {
      const replyText =
        lang === "GUJLISH"
          ? `Bilkul <b>${nameStr}</b>! 🙏 Amara senior property director tamara feedback ane requirements par direct discuss karva mate 10 minutes ma amari side thi tamne call karshe.`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! 🙏 Our senior property director will personally call you within 10 minutes to discuss your feedback and present suitable alternatives.`
          : `Bilkul <b>${nameStr}</b>! 🙏 Hamare senior property director aapke feedback aur requirements ko detail me discuss karne ke liye agle 10 minute me aapse direct call par connect karenge.`;

      return {
        replyText,
        nextState: "SITE_VISIT_DONE",
        leadUpdates: {
          state: "SITE_VISIT_DONE",
          site_visit_booked: false,
          metadata: updatedMeta,
        },
        salesAlert: {
          type: "REQUEST_HUMAN_CALL",
          payload: { userText: context.messageText, hint: "Client requested senior advisor consultation post-visit." },
        },
      };
    }

    // Case C: Customer requests Alternative Options
    if (isAlternativeRequest) {
      const visitedPropId = lead.selected_property_id || "";
      let query = supabase
        .from("inventory")
        .select("property_id, project_name, configuration, property_category, price, location, carpet_area_sqft")
        .eq("client_id", activeTenantId)
        .eq("status", "AVAILABLE");

      if (visitedPropId) {
        query = query.neq("property_id", visitedPropId);
      }

      const { data: altProps } = await query.limit(2);

      if (altProps && altProps.length > 0) {
        const optionIds = altProps.map((p) => p.property_id);
        const altListText = altProps
          .map((p, i) => {
            const numEmoji = i === 0 ? "1️⃣" : "2️⃣";
            const configText = p.configuration || p.property_category || "Premium";
            const priceLakhs = (Number(p.price) / 100000).toFixed(1);
            return `\n\n${numEmoji} <b>${p.project_name}</b> (${configText})\n📍 <b>Location:</b> ${p.location || "Prime Location"}\n💰 <b>Price:</b> ₹${priceLakhs} Lakhs\n✨ <b>Highlights:</b> Clean approach road, open floor plan`;
          })
          .join("");

        const replyText =
          lang === "GUJLISH"
            ? `Samji gayo <b>${nameStr}</b>! 👍 Tamari pasand ane criteria mutabiq clean approach road ane better planning vala alternative verified options aa rahya:${altListText}\n\n👉 <b>Aa mathi kaya project ni VIP Site Visit 🚗 plan kariye? (Aap 1 ya 2 lakhi ne batavi shako chho)</b>`
            : lang === "ENGLISH"
            ? `Understood <b>${nameStr}</b>! 👍 Here are curated alternative verified projects with prime approach roads and spacious layouts matching your preferences:${altListText}\n\n👉 <b>Which of these projects would you like to schedule a VIP Site Visit 🚗 for? (You can reply 1 or 2)</b>`
            : `Samajh gaya <b>${nameStr}</b>! 👍 Aapki pasand aur criteria ke mutabiq clean approach road aur open floor plan wale curated verified options yeh rahe:${altListText}\n\n👉 <b>Inme se kis project ke liye hum VIP Site Visit 🚗 plan karein? (Aap 1 ya 2 likhkar bata sakte hain)</b>`;

        return {
          replyText,
          nextState: "SITE_VISIT_DONE",
          leadUpdates: {
            state: "SITE_VISIT_DONE",
            site_visit_booked: false,
            last_option_ids: optionIds,
            metadata: {
              ...updatedMeta,
              alternative_options_sent: true,
              alternative_options_at: new Date().toISOString(),
              alternative_option_ids: optionIds,
            },
          },
          salesAlert: {
            type: "POST_VISIT_OBJECTION",
            payload: {
              userText: context.messageText,
              hint: "Customer requested alternative projects post-visit. Recommended alternatives pitched.",
              offered_properties: altProps.map((p) => p.project_name),
            },
          },
        };
      } else {
        // Empty catalog fallback: Tenant has no other available properties
        const replyText =
          lang === "GUJLISH"
            ? `Ji <b>${nameStr}</b>! Tamari specific requirement ane criteria mujab amari portfolio team additional verified <b>off-market projects</b> shortlist kari rahi chhe. Amara senior property director ne alert mali gayo chhe ane teo direct aapse <b>call par connect karshe</b>! 👍`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Our portfolio team is curating exclusive <b>off-market verified projects</b> matching your specific requirements. Our senior property director has been notified and will <b>connect with you directly</b> to share tailored options! 👍`
            : `Ji <b>${nameStr}</b>! Aapke specific criteria ke mutabiq hamari portfolio team additional verified <b>off-market projects</b> shortlist kar rahi hai. Humne senior property director ko alert bhej diya hai — wo direct aapse <b>call par connect karke</b> exclusive options share karenge! 👍`;

        return {
          replyText,
          nextState: "SITE_VISIT_DONE",
          leadUpdates: {
            state: "SITE_VISIT_DONE",
            site_visit_booked: false,
            metadata: {
              ...updatedMeta,
              no_direct_inventory_match: true,
              empty_catalog_handled_at: new Date().toISOString(),
            },
          },
          salesAlert: {
            type: "NO_PROPERTY_MATCH",
            payload: {
              userText: context.messageText,
              lead_id: lead.id,
              client_id: activeTenantId,
              hint: "Tenant catalog has no additional alternative inventory post-visit. Senior director intervention required.",
            },
          },
        };
      }
    }

    // Case D: Customer shares an Objection or Dislike
    if (isObjection) {
      let specificReply = "";
      if (hasLayoutIssue && hasCanalIssue) {
        specificReply =
          lang === "GUJLISH"
            ? `Samji gayo <b>${nameStr}</b>! Layout tamne suitable na lagyo ane front gate pase canal/drain hovano concern bilkul genuine chhe. Tamara honest feedback mate aabhar. 🙏\n\nAme tamara criteria mujab clean approach road ane open floor plan vala bija verified projects shortlist kari rahya chhiye.\n\n👉 <b>Shu ame alternative matching projects share kariye (1), ke senior property advisor sathe 5-minute call schedule kariye (2)?</b>`
            : lang === "ENGLISH"
            ? `Understood completely <b>${nameStr}</b>! We appreciate your honest feedback — the layout not meeting your needs and the canal near the front gate are very valid concerns. 🙏\n\nWe are shortlisting alternative verified projects with clean approach roads and spacious, well-ventilated floor plans matching your criteria.\n\n👉 <b>Would you like us to share alternative matching projects (1), or schedule a quick 5-minute call with our senior property director (2)?</b>`
            : `Samajh gaya <b>${nameStr}</b>! Layout aapko suitable nahi laga aur front gate ke paas canal/drain hona bilkul genuine concern hai. Aapke honest feedback ke liye dil se shukriya. 🙏\n\nHum aapke budget aur criteria ke mutabiq doosre verified projects shortlist kar rahe hain jinka approach road clean ho aur spacious open floor plan ho.\n\n👉 <b>Kya hum aapko alternative matching projects share karein (1), ya hamare senior property director se 5-minute direct call arrange karein (2)?</b>`;
      } else if (hasLayoutIssue) {
        specificReply =
          lang === "GUJLISH"
            ? `Samji gayo <b>${nameStr}</b>! Property nu layout ane space planning tamari requirement sathe match nathi thai, e bilkul valid point chhe. 🙏\n\nAme larger carpet area ane open layout vala bija premium options arrange kariye chhiye.\n\n👉 <b>Shu ame better layout vala matching options share kariye (1), ke senior advisor sathe call plan kariye (2)?</b>`
            : lang === "ENGLISH"
            ? `Understood <b>${nameStr}</b>! The floor plan and room sizes not suiting your family's needs is a very valid point. 🙏\n\nWe can present alternative verified properties with larger carpet areas and open layouts.\n\n👉 <b>Would you like to see alternative options with better layouts (1), or consult with our senior advisor (2)?</b>`
            : `Samajh gaya <b>${nameStr}</b>! Layout aur room sizes aapki requirement par fit nahi baithe, yeh bilkul valid point hai. 🙏\n\nHum open floor plan aur better carpet area wale alternative verified projects suggest kar rahe hain.\n\n👉 <b>Kya hum better layout wale matching options share karein (1), ya senior advisor se call arrange karein (2)?</b>`;
      } else if (hasCanalIssue || hasRoadIssue) {
        specificReply =
          lang === "GUJLISH"
            ? `Samji gayo <b>${nameStr}</b>! Surrounding location ane approach road no concern bilkul genuine chhe, dream home mate clean surrounding sauthi jaruri hoy chhe. 🙏\n\nAme prime ane peaceful locality vala bija verified projects suggest kariye chhiye.\n\n👉 <b>Shu ame prime locality na options share kariye (1), ke senior advisor sathe call kariye (2)?</b>`
            : lang === "ENGLISH"
            ? `Understood <b>${nameStr}</b>! Your concern regarding the surrounding location and approach road is completely justified — a clean and peaceful neighborhood is paramount. 🙏\n\nWe can suggest alternative verified projects in prime, well-developed localities.\n\n👉 <b>Would you like us to share options in prime localities (1), or arrange a consultation with our property advisor (2)?</b>`
            : `Samajh gaya <b>${nameStr}</b>! Surrounding area aur approach road ka concern bilkul genuine hai, dream home ke liye clean surrounding sabse zaroori hoti hai. 🙏\n\nHum prime aur peaceful locality wale doosre verified projects suggest kar rahe hain.\n\n👉 <b>Kya hum prime locality ke options share karein (1), ya hamare senior advisor aapse direct call par connect karein (2)?</b>`;
      } else {
        specificReply =
          lang === "GUJLISH"
            ? `Tamara honest feedback mate shukriya <b>${nameStr}</b>! 🙏 Ame samji shakiye chhiye ke aa property tamara criteria par fit nathi bethi.\n\nAme tamari requirement mujab bija premium verified options shortlist kari rahya chhiye.\n\n👉 <b>Shu ame fresh matching options share kariye (1), ke senior director sathe direct call arrange kariye (2)?</b>`
            : lang === "ENGLISH"
            ? `Thank you for sharing your candid feedback <b>${nameStr}</b>! 🙏 We understand this property did not fully match your expectations.\n\nWe are curating alternative verified projects that align with your exact preferences.\n\n👉 <b>Would you like us to share fresh matching options (1), or arrange a direct call with our property director (2)?</b>`
            : `Aapke honest feedback ke liye shukriya <b>${nameStr}</b>! 🙏 Hum samajh sakte hain ki yeh property aapke criteria par puri tarah fit nahi baithi.\n\nHum aapke budget aur pasand ke mutabiq alternative premium verified options shortlist kar rahe hain.\n\n👉 <b>Kya hum aapko fresh options share karein (1), ya direct property director se call arrange karein (2)?</b>`;
      }

      return {
        replyText: specificReply,
        nextState: "SITE_VISIT_DONE",
        leadUpdates: {
          state: "SITE_VISIT_DONE",
          site_visit_booked: false,
          metadata: updatedMeta,
        },
        salesAlert: {
          type: "POST_VISIT_OBJECTION",
          payload: {
            userText: context.messageText,
            hint: hasCanalIssue || hasLayoutIssue
              ? "Client disliked layout/canal. Recommend pitching alternative project with clean approach road and open floor plan."
              : "Client shared post-visit feedback/concerns. Follow up with alternative inventory.",
          },
        },
      };
    }

    // Case E: Price Negotiation / Token Sitting Request
    if (isNeg) {
      const replyText =
        lang === "GUJLISH"
          ? `Tamara feedback mate aabhar <b>${nameStr}</b>! 🙏 Developer sathe special pricing ane exclusive payment plan finalize karva mate amara senior sales director direct tamaro sampark karshe.`
          : lang === "ENGLISH"
          ? `Thank you for your feedback <b>${nameStr}</b>! 🙏 Our senior property director will personally connect with you to arrange an exclusive developer sitting and discuss the best negotiated price.`
          : `Aapke feedback ke liye dhanyawad <b>${nameStr}</b>! 🙏 Developer ke sath special pricing aur best payment scheme finalize karne ke liye hamare senior sales director direct aapse call par connect karenge.`;

      return {
        replyText,
        nextState: "SITE_VISIT_DONE",
        leadUpdates: {
          state: "SITE_VISIT_DONE",
          site_visit_booked: false,
          metadata: updatedMeta,
        },
        salesAlert: { type: "FEEDBACK_RECEIVED", payload: { userText: context.messageText } },
      };
    }

    // Case F: Home Loan Assistance Request
    if (isLoan) {
      const replyText =
        lang === "GUJLISH"
          ? `Tamara feedback mate aabhar <b>${nameStr}</b>! 🏦 Amari banking & loan expert team lowest interest rate ane easy EMI guidance mate tamne turant call karshe.`
          : lang === "ENGLISH"
          ? `Thank you for your feedback <b>${nameStr}</b>! 🏦 Our preferred banking partners will reach out shortly to guide you with the lowest home loan interest rates and flexible EMI structures.`
          : `Aapke feedback ke liye dhanyawad <b>${nameStr}</b>! 🏦 Hamari home loan & banking team lowest interest rate aur easy EMI structure guide karne ke liye aapse turant connect karegi.`;

      return {
        replyText,
        nextState: "SITE_VISIT_DONE",
        leadUpdates: {
          state: "SITE_VISIT_DONE",
          site_visit_booked: false,
          metadata: updatedMeta,
        },
        salesAlert: { type: "FEEDBACK_RECEIVED", payload: { userText: context.messageText } },
      };
    }

    // Case G: Default Fallback in SITE_VISIT_DONE — Amnesiac Loop Guard
    // If visit feedback or objection is ALREADY present, NEVER repeat "Aapko property aur layout kaisa laga...?"
    if (hasPriorFeedback) {
      const replyText =
        lang === "GUJLISH"
          ? `Ji <b>${nameStr}</b>! Ame tamara feedback ane criteria mutabiq best options assist kari rahya chhiye.\n\n👉 <b>Shu ame matching alternative projects share kariye (1), ke senior property advisor sathe direct call arrange kariye (2)?</b>`
          : lang === "ENGLISH"
          ? `Yes <b>${nameStr}</b>! We are assisting you with the best options matching your criteria.\n\n👉 <b>Would you like us to share alternative matching projects (1), or arrange a direct call with our senior property advisor (2)?</b>`
          : `Ji <b>${nameStr}</b>! Hum aapke criteria ke mutabiq best options assist kar rahe hain.\n\n👉 <b>Kya hum matching alternative projects share karein (1), ya senior property advisor se direct call arrange karein (2)?</b>`;

      return {
        replyText,
        nextState: "SITE_VISIT_DONE",
        leadUpdates: {
          state: "SITE_VISIT_DONE",
          site_visit_booked: false,
          metadata: updatedMeta,
        },
        salesAlert: { type: "FEEDBACK_RECEIVED", payload: { userText: context.messageText } },
      };
    }

    // Default response for fresh SITE_VISIT_DONE without prior feedback
    const replyText =
      lang === "GUJLISH"
        ? `Khub saras <b>${nameStr}</b>! 🌟 Tamne property ane layout kevo lagyo? Jo project pasand aavyo hoy to shu ame developer sathe <b>special token pricing baithak</b> plan kariye, ke tamaro koi feedback chhe?`
        : lang === "ENGLISH"
        ? `Wonderful <b>${nameStr}</b>! 🌟 How did you like the property and floor layout? If you liked it, shall we arrange a <b>developer sitting for exclusive negotiated pricing</b>, or do you have any feedback?`
        : `Bohot badiya <b>${nameStr}</b>! 🌟 Aapko property aur layout kaisa laga? Agar pasand aaya ho to kya hum developer ke sath <b>best token pricing sitting</b> arrange karein, ya aapka koi feedback hai?`;

    return {
      replyText,
      nextState: "SITE_VISIT_DONE",
      leadUpdates: {
        state: "SITE_VISIT_DONE",
        site_visit_booked: false,
        metadata: updatedMeta,
      },
      salesAlert: { type: "FEEDBACK_RECEIVED", payload: { userText: context.messageText } },
    };
  }

  // ---------------------------------------------------------------------------
  // 9b. VISIT CANCELLED (State: VISIT_CANCELLED)
  // ---------------------------------------------------------------------------
  if (currentState === "VISIT_CANCELLED") {
    // 1. Owner Listing Intent (e.g. "Muje meri property sell krni he")
    if (
      intent === "SUBMIT_LISTING" ||
      actionResult.user_role === "OWNER" ||
      /(?:mera|meri|maro|mari|apna|apni|own)\s+(?:flat|makan|ghar|house|villa|plot|shop|office)\s+(?:bechna|vechvu|sell|bikri|rent)/i.test(lower)
    ) {
      const ownerRes = await handleOwnerFlow({
        lead,
        messageText: context.messageText,
        lower,
        lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
        senderName,
        senderId: context.senderId,
        platform: context.platform,
        tenantId: activeTenantId,
        supabase,
        aiAnalysis: actionResult,
        city: resolvedCity,
        agencyName,
      });
      return {
        replyText: ownerRes.replyText,
        nextState: ownerRes.nextState as DialogState,
        leadUpdates: ownerRes.leadUpdates,
      };
    }

    // 2. Re-booking or rescheduling request
    if (intent === "BOOK_VISIT" || intent === "RESCHEDULE_VISIT") {
      const reschedAct = action as RescheduleVisitAction;
      const bookAct = action as BookVisitAction;
      const combinedSlot = [
        reschedAct.new_slot_raw || bookAct.preferred_date_raw,
        bookAct.preferred_time_raw
      ].filter(Boolean).join(" ");
      const slotRaw = combinedSlot || context.messageText;
      const slotResult = parseVisitSlot(slotRaw);
      if (slotResult.isValidTime && !slotResult.isPast) {
        const newSlot = slotResult.isoUtc;
        await supabase
          .from("site_visits")
          .update({ scheduled_at: newSlot, status: "RESCHEDULED" })
          .eq("lead_id", lead.id)
          .in("status", ["CANCELLED", "MISSED", "SCHEDULED"]);

        const formatted = new Date(newSlot).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
        const replyText =
          lang === "GUJLISH"
            ? `Ji bilkul <b>${nameStr}</b>! Tamari VIP site visit <b>${formatted}</b> mate fari thi schedule kari didhi chhe. (Site par maliye chhiye)! 🤝📍`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Your VIP site visit has been rescheduled to <b>${formatted}</b>. See you at the site! 🤝📍`
            : `Ji bilkul <b>${nameStr}</b>! Aapki VIP site visit <b>${formatted}</b> ke liye dobara schedule kar di gayi hai (Milte hain site par)! 🤝📍`;

        return {
          replyText,
          nextState: "SITE_VISIT_BOOKED",
          leadUpdates: {
            site_visit_at: newSlot,
            site_visit_datetime: newSlot,
            site_visit_booked: true,
            state: "SITE_VISIT_BOOKED",
            pre_visit_reminder_sent: false,
            post_visit_feedback_sent: false,
            metadata: {
              ...(lead.metadata || {}),
              morning_briefing_sent: false,
              morning_briefing_at: null,
              post_visit_nudge_sent: false,
              missed_visit_reschedule_nudge_sent: false,
            },
          },
          salesAlert: { type: "SITE_VISIT_BOOKED", payload: { scheduledAt: newSlot, userText: context.messageText } },
        };
      }
    }

    // 3. Property search inquiry or property type provided (e.g. "Office", "Flat", "Commercial")
    const parsedTypeInCancelled = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
    if (intent === "CHANGE_REQUIREMENT" || intent === "SEEKER_QUALIFICATION" || parsedTypeInCancelled || actionResult.location || actionResult.price_or_budget) {
      return handleQualificationCascade(lead, actionResult, context);
    }

    // 4. Greeting ("Hi", "Hello", etc.)
    if (intent === "GREETING") {
      const replyText =
        lang === "GUJLISH"
          ? `Welcome back <b>${nameStr}</b>! ${agencyName} desk par tamaru swagat chhe. 🏢✨\n\nTame ${agencyName} sathe shu karva mango chho?\n\n1️⃣ <b>Nayi Property Shodhvi chhe</b> (Buy / Rent) 🏡\n2️⃣ <b>Property List Karvi chhe</b> (Sell / Rent Out) 📋\n\n<i>(Tame 1 ke 2 lakhi ne reply kari shako chho)</i>`
          : lang === "ENGLISH"
          ? `Welcome back <b>${nameStr}</b>! Welcome back to ${agencyName}. 🏢✨\n\nHow can we assist you today?\n\n1️⃣ <b>Search for a Property</b> (Buy / Rent) 🏡\n2️⃣ <b>List / Offer a Property</b> (Sell / Rent Out) 📋\n\n<i>(You can reply with 1 or 2)</i>`
          : `Welcome back <b>${nameStr}</b>! ${agencyName} desk par aapka swagat hai. 🏢✨\n\nAap ${agencyName} ke sath kya karna chahte hain?\n\n1️⃣ <b>Nayi Property Dekhni hai</b> (Buy / Rent) 🏡\n2️⃣ <b>Property List Karni hai</b> (Bechni / Rent Out) 📋\n\n<i>(Aap 1 ya 2 likh kar reply kar sakte hain)</i>`;

      return {
        replyText,
        nextState: "ROLE_SELECTION_PENDING",
        leadUpdates: {
          state: "ROLE_SELECTION_PENDING",
          site_visit_booked: false,
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 9c. DROPPED STATE RE-ENGAGEMENT (State: DROPPED)
  // ---------------------------------------------------------------------------
  if (currentState === "DROPPED") {
    const replyText =
      lang === "GUJLISH"
        ? `Welcome back <b>${nameStr}</b>! Tamara mate automated alerts fari activate kari didha chhe. Tame property Buy/Rent karva mango chho ke List karva mango chho? 🏢`
        : lang === "ENGLISH"
        ? `Welcome back <b>${nameStr}</b>! Automated notifications have been reactivated for you. Are you looking to Buy/Rent or List a property? 🏢`
        : `Welcome back <b>${nameStr}</b>! Aapke liye automated alerts dobara activate kar diye gaye hain. Aap property Buy/Rent karna chahte hain ya List karna chahte hain? 🏢`;

    return {
      replyText,
      nextState: "ROLE_SELECTION_PENDING",
      leadUpdates: { state: "ROLE_SELECTION_PENDING", bot_active: true },
    };
  }

  // ---------------------------------------------------------------------------
  // 10. OPTIONS SENT, VISIT REQUESTED or SITE VISIT PROPOSED (State: OPTIONS_SENT / VISIT_REQUESTED / SITE_VISIT_PROPOSED)
  // ---------------------------------------------------------------------------
  if (currentState === "OPTIONS_SENT" || currentState === "VISIT_REQUESTED" || currentState === "SITE_VISIT_PROPOSED") {
    // -------------------------------------------------------------------------
    // Returning Qualified Buyer Menu Dispatcher (Option 1, 2, 3)
    // -------------------------------------------------------------------------
    const isReturningBuyerMenuPending = lead?.metadata?.last_bot_prompt?.question_type === "RETURNING_BUYER_MENU";

    if (isReturningBuyerMenuPending) {
      const isChoice1 = /^(?:1|1️⃣|option\s*1|first|1st|options?|dikhao|dobara|fari|matching|top)\b/i.test(lower.trim());
      const isChoice2 = /^(?:2|2️⃣|option\s*2|second|2nd|site\s*visit|visit|book|schedule|gaadi|slot)\b/i.test(lower.trim());
      const isChoice3 = /^(?:3|3️⃣|option\s*3|third|3rd|change|badal|badlo|badalvi|nayi|navi|refine|criteria|budget)\b/i.test(lower.trim());

      if (isChoice1) {
        // Option 1: Top property options dekhein
        return handleQualificationCascade(lead, { ...actionResult, action: { intent: "SEEKER_QUALIFICATION", token: null } }, context);
      }

      if (isChoice2) {
        // Option 2: VIP Site Visit schedule karein (Direct 1-tap booking push)
        const replyText =
          lang === "GUJLISH"
            ? `Bilkul <b>${nameStr}</b>! 🚗 <b>VIP Site Visit</b> schedule karva mate tamne kayo slot anukool raheshe — <b>Kaale sanje 5:00 vage</b> ke <b>Sunday savare 11:00 vage</b>?\n\n<i>(Amara senior property expert tamne site par direct guide karshe)</i>`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! 🚗 Which slot suits you best for your <b>VIP Site Visit</b> — <b>Tomorrow 5:00 PM</b> or <b>Sunday 11:00 AM</b>?\n\n<i>(Our senior property advisor will meet you directly at the site location)</i>`
            : `Bilkul <b>${nameStr}</b>! 🚗 <b>VIP Site Visit</b> schedule karne ke liye kaunsa slot aapke liye best rahega — <b>Kal shaam 5:00 baje</b> ya <b>Sunday subah 11:00 baje</b>?\n\n<i>(Hamare senior property expert direct site par aapko guide karenge)</i>`;

        return {
          replyText,
          nextState: "OPTIONS_SENT",
          leadUpdates: {
            metadata: {
              ...(lead.metadata || {}),
              last_bot_prompt: {
                question_type: "SLOT_SELECTION",
                sent_at: new Date().toISOString(),
              },
            },
          },
        };
      }

      if (isChoice3) {
        // Option 3: Budget ya requirement badalni hai
        const replyText =
          lang === "GUJLISH"
            ? `Zaroor <b>${nameStr}</b>! Chalo requirement update kariye.\n\n👉 <b>Tame kaya type ni property joi rahya chho — 2BHK/3BHK Flat, Villa, ke Commercial Office/Shop?</b> 🏡`
            : lang === "ENGLISH"
            ? `Certainly <b>${nameStr}</b>! Let's update your requirement.\n\n👉 <b>What type of property are you looking for — 2BHK/3BHK Flat, Villa, or Commercial Office/Shop?</b> 🏡`
            : `Zaroor <b>${nameStr}</b>! Chaliye requirement update karte hain.\n\n👉 <b>Aap kis type ki property search kar rahe hain — 2BHK/3BHK Flat, Villa, ya Commercial Office/Shop?</b> 🏡`;

        return {
          replyText,
          nextState: "QUALIFYING",
          leadUpdates: {
            state: "QUALIFYING",
            property_type: null,
            budget: null,
            location: null,
            timeline: null,
            purpose: null,
            metadata: {
              ...(lead.metadata || {}),
              seeker_draft: {},
              last_bot_prompt: {
                question_type: "PROPERTY_TYPE",
                sent_at: new Date().toISOString(),
              },
            },
          },
        };
      }
    }
    const hasOptions = Array.isArray(lead?.last_option_ids) && lead.last_option_ids.length > 0;

    // CR-02 SAFEGUARD: If no options are available in last_option_ids and no property is selected,
    // do not allow SELECT_OPTION or slot booking to refer to phantom properties!
    if (!hasOptions && !lead.selected_property_id) {
      const hasSlotKeywords = /\b(aaj|aje|aaje|kal|kale|kaale|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|parsva|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage|વાગે|બજે))\b/i.test(lower) || /આજે|કાલે|પરમ/i.test(lower);
      if (intent === "SELECT_OPTION" || intent === "BOOK_VISIT" || hasSlotKeywords) {
        const critSummary = formatLeadCriteriaSummary(lead, lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH", resolvedCity);
        const replyText =
          lang === "GUJLISH"
            ? `Ji <b>${nameStr}</b>, tamari requirement (<b>${critSummary}</b>) mujab amari paas hal ma direct verified properties list ma nathi. Amara senior property advisor off-market options verify kari rahya chhe ane call par connect karshe. 📞 Shu tame budget ya location refine karva mango chho? 🏡`
            : lang === "ENGLISH"
            ? `Hello <b>${nameStr}</b>, currently we don't have matching verified properties listed for your criteria (<b>${critSummary}</b>). Our senior property advisor is curating off-market options and will connect with you shortly. 📞 Would you like to refine your budget or preferred location? 🏡`
            : `Ji <b>${nameStr}</b>, aapki requirement (<b>${critSummary}</b>) ke mutabiq filhal hamare paas direct verified properties available nahi hain. Hamare senior property advisor off-market options verify kar rahe hain aur jald call par connect karenge. 📞 Kya aap budget ya location update karna chahte hain? 🏡`;

        return {
          replyText,
          nextState: "OPTIONS_SENT",
        };
      }
    }

    // ZERO OPTION HIJACKING: Option selection picks property and asks slot!
    if (intent === "SELECT_OPTION") {
      const idx = (action as SelectOptionAction).option_index;
      let selectedPropId = lead.last_option_ids?.[idx] || lead.selected_property_id;
      let selectedProp: any = null;

      if (selectedPropId) {
        const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("property_id", selectedPropId).maybeSingle();
        selectedProp = p;
      }

      if (!selectedProp) {
        const critSummary = formatLeadCriteriaSummary(lead, lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH", resolvedCity);
        const replyText =
          lang === "GUJLISH"
            ? `Ji <b>${nameStr}</b>, pasand kareli property ni details confirm nathi thai saki. Shu tame tamari requirement (<b>${critSummary}</b>) refine karva mango chho? 🏡`
            : lang === "ENGLISH"
            ? `Hello <b>${nameStr}</b>, we couldn't retrieve details for that property. Would you like to refine your requirement (<b>${critSummary}</b>)? 🏡`
            : `Ji <b>${nameStr}</b>, chuni gayi property ki details confirm nahi ho saki. Kya aap apni requirement (<b>${critSummary}</b>) update karna chahte hain? 🏡`;

        return { replyText, nextState: "OPTIONS_SENT" };
      }

      // Check if lead already has active visit for a different property
      const { data: activeVisits } = await supabase
        .from("site_visits")
        .select("*, inventory(*)")
        .eq("client_id", activeTenantId)
        .eq("lead_id", lead.id)
        .in("status", ["SCHEDULED", "CONFIRMED", "RESCHEDULED"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (activeVisits && activeVisits.length > 0 && selectedProp && activeVisits[0].property_id !== selectedProp.property_id) {
        const oldName = activeVisits[0].inventory?.project_name || "Project";
        const replyText =
          lang === "GUJLISH"
            ? `Aapki already ek VIP Site Visit booked hai 🚗:\n🏢 <b>Property:</b> ${oldName}\n\n👉 <b>Shu tame aa pichli visit cancel kari ne ${selectedProp.project_name} mate navi VIP Site Visit book karva mango chho?</b>\n\n1️⃣ <b>Haan, pichli visit cancel kari ne navi book karo</b> 🚗\n2️⃣ <b>Nahi, purani visit j continue rakho</b> 🤝`
            : lang === "ENGLISH"
            ? `You already have a VIP Site Visit booked for <b>${oldName}</b> 🚗.\n\n👉 <b>Would you like to cancel this previous visit and schedule a new VIP Site Visit for ${selectedProp.project_name}?</b>\n\n1️⃣ <b>Yes, cancel previous visit & schedule new</b> 🚗\n2️⃣ <b>No, keep previous visit active</b> 🤝`
            : `Aapki already ek VIP Site Visit booked hai <b>${oldName}</b> ke liye 🚗.\n\n👉 <b>Kya aap is pichli visit ko cancel karke ${selectedProp.project_name} ke liye nayi VIP Site Visit book karna chahte hain?</b>\n\n1️⃣ <b>Haan, pichli visit cancel karke nayi book karein</b> 🚗\n2️⃣ <b>Nahi, purani visit hi continue rakhein</b> 🤝`;

        return {
          replyText,
          nextState: "CANCEL_PREVIOUS_VISIT_CONFIRMATION_PENDING",
          leadUpdates: {
            state: "CANCEL_PREVIOUS_VISIT_CONFIRMATION_PENDING",
            metadata: {
              ...(lead.metadata || {}),
              pending_new_visit_property_id: selectedProp.property_id,
              pending_new_visit_property_name: selectedProp.project_name,
            },
          },
        };
      }

      const propName = selectedProp?.project_name || "property";
      const replyText =
        lang === "GUJLISH"
          ? `Khub saras pasand <b>${nameStr}</b>! <b>${propName}</b> ekdam prime project chhe.\n\nTame aa project ni <b>VIP Site Visit 🚗</b> mate kayo time anukool ganasho - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
          : lang === "ENGLISH"
          ? `Excellent choice <b>${nameStr}</b>! <b>${propName}</b> is a premium project.\n\nWhen would you like to schedule a <b>VIP Site Visit 🚗</b> - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
          : `Bahut badhiya choice <b>${nameStr}</b>! <b>${propName}</b> kaafi premium project hai.\n\nAap iski <b>VIP Site Visit 🚗</b> ke liye kaunsa slot prefer karenge - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`;

      return {
        replyText,
        nextState: "OPTIONS_SENT",
        leadUpdates: {
          selected_property_id: selectedPropId,
          state: "OPTIONS_SENT",
        },
      };
    }

    // DUAL-ROLE: OWNER LISTING INTAKE FROM OPTIONS_SENT
    if (
      intent === "SUBMIT_LISTING" ||
      actionResult.user_role === "OWNER" ||
      /(?:mera|meri|maro|mari|apna|apni|own)\s+(?:flat|makan|ghar|house|villa|plot|shop|office)\s+(?:bechna|vechvu|sell|bikri|rent)/i.test(lower)
    ) {
      const ownerRes = await handleOwnerFlow({
        lead,
        messageText: context.messageText,
        lower,
        lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
        senderName,
        senderId: context.senderId,
        platform: context.platform,
        tenantId: activeTenantId,
        supabase,
        aiAnalysis: actionResult,
        city: resolvedCity,
        agencyName,
      });
      return {
        replyText: ownerRes.replyText,
        nextState: ownerRes.nextState as DialogState,
        leadUpdates: ownerRes.leadUpdates,
      };
    }

    // BOOK_VISIT (Explicit action or natural slot detected)
    const hasSlotKeywords = /\b(aaj|aje|aaje|kal|kale|kaale|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|parsva|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage|વાગે|બજે))\b/i.test(lower) || /આજે|કાલે|પરમ/i.test(lower);
    if (intent === "BOOK_VISIT" || hasSlotKeywords) {
      const bookAct = (intent === "BOOK_VISIT" ? action : { intent: "BOOK_VISIT" }) as BookVisitAction;
      let targetPropId = lead.selected_property_id;
      if (bookAct.target_property_index !== undefined && bookAct.target_property_index !== null && lead.last_option_ids?.[bookAct.target_property_index]) {
        targetPropId = lead.last_option_ids[bookAct.target_property_index];
      } else if (!targetPropId && Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 0) {
        targetPropId = lead.last_option_ids[0];
      }

      if (!targetPropId) {
        const hasOpts = Array.isArray(lead.last_option_ids) && lead.last_option_ids.length > 0;
        const replyText = hasOpts
          ? (lang === "GUJLISH"
              ? `Site visit plan karva mate, pehla kripya batavo tame <b>Option 1, 2 ke 3</b> mathi kayo project pehla jova mango chho? 🚗`
              : lang === "ENGLISH"
              ? `To schedule your site visit, please select which property you want to visit first - <b>Option 1, 2, or 3</b>? 🚗`
              : `Site visit schedule karne ke liye, kripya pehle batayein aap <b>Option 1, 2 ya 3</b> me se kis project ko pehle dekhna chahenge? 🚗`)
          : (lang === "GUJLISH"
              ? `Ji <b>${nameStr}</b>, hal ma koi property options select nathi thaya. Shu tame tamari requirement refine karva mango chho? 🏡`
              : lang === "ENGLISH"
              ? `Hello <b>${nameStr}</b>, no property options are currently selected. Would you like to refine your requirements? 🏡`
              : `Ji <b>${nameStr}</b>, filhal koi property options select nahi hue hain. Kya aap apni requirement update karna chahte hain? 🏡`);

        return { replyText, nextState: "OPTIONS_SENT" };
      }

      const combinedDate = [bookAct.preferred_date_raw, bookAct.preferred_time_raw].filter(Boolean).join(" ");
      const slotRaw = combinedDate || bookAct.slot_iso || context.messageText;
      const hasSlot = Boolean(combinedDate || bookAct.slot_iso) || /\b(aaj|aje|aaje|kal|kale|kaale|tomorrow|today|sunday|monday|tuesday|wednesday|thursday|friday|saturday|parso|parsva|\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|vage|વાગે|બજે))\b/i.test(lower) || /આજે|કાલે|પરમ/i.test(lower);

      if (!hasSlot) {
        const replyText =
          lang === "GUJLISH"
            ? `Bahuj saras <b>${nameStr}</b>! 👍 Site visit 🚗 mate tamne kayo time anukool raheshe - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
            : lang === "ENGLISH"
            ? `Great <b>${nameStr}</b>! 👍 Which slot suits you best for the site visit 🚗 - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
            : `Bahut badhiya <b>${nameStr}</b>! 👍 Site visit 🚗 confirm karne ke liye aapko kaunsa slot suit karega - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`;

        return {
          replyText,
          nextState: "VISIT_REQUESTED",
          leadUpdates: { state: "VISIT_REQUESTED", selected_property_id: targetPropId },
        };
      }

      const slotResult = parseVisitSlot(slotRaw);
      if (!slotResult.isValidTime) {
        const replyText =
          lang === "GUJLISH"
            ? `Amara site visit timings saware <b>10:00 AM thi sanje 6:00 PM</b> sudhi na hoy chhe. Kripya aa samay vachhe no slot janavjo. 🙏`
            : lang === "ENGLISH"
            ? `Our property site visits are scheduled between <b>10:00 AM and 6:00 PM IST</b>. Kindly suggest a convenient slot within this window. 🙏`
            : `Hamare site visit timings subah <b>10:00 AM se shaam 6:00 PM</b> ke beech hote hain. Kripya is time window me apna convenient slot batayein. 🙏`;
        return { replyText, nextState: "OPTIONS_SENT" };
      }

      if (slotResult.isPast) {
        const replyText =
          lang === "GUJLISH"
            ? `Aa time viti gayo chhe. Kripya aavnar divas athva timing janavjo. 🙏`
            : lang === "ENGLISH"
            ? `This time slot has already passed. Please suggest an upcoming date and time. 🙏`
            : `Ye time slot nikal chuka hai. Kripya aane wala day ya timing batayein. 🙏`;
        return { replyText, nextState: "OPTIONS_SENT" };
      }

      const scheduledAt = slotResult.isoUtc;
      let finalPropId = targetPropId;
      if (!finalPropId) {
        const { data: firstProp } = await supabase
          .from("inventory")
          .select("property_id")
          .eq("client_id", activeTenantId)
          .eq("status", "AVAILABLE")
          .limit(1)
          .maybeSingle();
        finalPropId = firstProp?.property_id || "PROP-001";
      }
      let propDetails: any = null;
      if (finalPropId) {
        const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("property_id", finalPropId).maybeSingle();
        propDetails = p;
      }

      await supabase.from("site_visits").insert({
        lead_id: lead.id,
        client_id: activeTenantId,
        property_id: finalPropId,
        scheduled_at: scheduledAt,
        status: "SCHEDULED",
      });

      const formatted = new Date(scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
      const mapLink = propDetails?.map_url ? `\n${formatMapHyperlink(propDetails.map_url, "View on Google Maps")}` : "";

      const replyText =
        lang === "GUJLISH"
          ? `Mubarak <b>${nameStr}</b>! 🎉\n\nTamari VIP Site Visit <b>${formatted}</b> par confirm thai gai chhe! 🚗${propDetails ? `\n🏢 <b>Project:</b> ${propDetails.project_name} (${propDetails.location})` : ""}${mapLink}\n\n🤝 <b>Site par maliye chhiye!</b> Amara senior property advisor time par direct site location par tamne malshe.`
          : lang === "ENGLISH"
          ? `Congratulations <b>${nameStr}</b>! 🎉\n\nYour VIP Site Visit is confirmed for <b>${formatted}</b>! 🚗${propDetails ? `\n🏢 <b>Project:</b> ${propDetails.project_name} (${propDetails.location})` : ""}${mapLink}\n\n🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the property location on time.`
          : `Badhai ho <b>${nameStr}</b>! 🎉\n\nAapki VIP Site Visit <b>${formatted}</b> ke liye confirm ho gayi hai! 🚗${propDetails ? `\n🏢 <b>Project:</b> ${propDetails.project_name} (${propDetails.location})` : ""}${mapLink}\n\n🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par aapse direct site location par milenge.`;

      return {
        replyText,
        nextState: "SITE_VISIT_BOOKED",
        leadUpdates: {
          site_visit_booked: true,
          site_visit_at: scheduledAt,
          site_visit_datetime: scheduledAt,
          selected_property_id: finalPropId,
          metadata: {
            ...(lead.metadata || {}),
            selected_property_name: propDetails?.project_name || "VIP Property",
          },
          state: "SITE_VISIT_BOOKED",
          pre_visit_reminder_sent: false,
          post_visit_feedback_sent: false,
        },
        salesAlert: {
          type: "SITE_VISIT_BOOKED",
          payload: { scheduledAt, property: propDetails, userText: context.messageText },
        },
      };
    }

    // CHANGE_REQUIREMENT
    if (intent === "CHANGE_REQUIREMENT") {
      const crAct = action as ChangeRequirementAction;
      const replyText =
        lang === "GUJLISH"
          ? `Noted <b>${nameStr}</b>! 👍 Ame tamara criteria update kari didha chhe. Kripya janavjo, tamne kaya nava area ma properties joiye chhe? 📍`
          : lang === "ENGLISH"
          ? `Noted <b>${nameStr}</b>! 👍 Updated your preferences. Which specific area or locality would you prefer? 📍`
          : `Noted <b>${nameStr}</b>! 👍 Humne aapki requirement note kar li hai. Kripya apna preferred location ya area batayein. 📍`;

      return {
        replyText,
        nextState: "QUALIFYING",
        leadUpdates: {
          state: "QUALIFYING",
          property_type: crAct.property_type || null,
          budget: crAct.budget || null,
          location: crAct.location || null,
          requirement: crAct.requirement || null,
          selected_property_id: null,
          last_option_ids: null,
        },
      };
    }

    // ASK_FAQ
    if (intent === "ASK_FAQ") {
      return handleFaqResponse(lead, action as AskFaqAction, context, false);
    }

    // BROCHURE / MAP REQUEST
    if (intent === "BROCHURE_REQUEST" || intent === "MAP_REQUEST") {
      return handleBrochureOrMapResponse(lead, intent, context, false);
    }

    // ANTI-RESET SAFEGUARD FOR OPTIONS_SENT / VISIT_REQUESTED / SITE_VISIT_PROPOSED:
    // If the message is not an explicit change of criteria or other recognized intent,
    // NEVER fall through to FRESH/ROLE_SELECTION_PENDING. Retain currentState and guide the user!
    const reminderReply =
      currentState === "SITE_VISIT_PROPOSED"
        ? (lang === "GUJLISH"
            ? `Shu ame tamari aa project ni <b>VIP Site Visit 🚗</b> schedule kariye - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
            : lang === "ENGLISH"
            ? `Shall we schedule your exclusive <b>VIP Site Visit 🚗</b> for this project - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
            : `Kya hum is project ke liye aapki <b>VIP Site Visit 🚗</b> schedule karein - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`)
        : hasOptions
        ? (lang === "GUJLISH"
            ? `Tame aamathi kayi property ni <b>VIP Site Visit 🚗</b> schedule karva mango chho, ane kayo time anukool raheshe (jem ke <b>'Kaale sanje 5 vage'</b>)?`
            : lang === "ENGLISH"
            ? `Which of these properties would you like to schedule a <b>VIP Site Visit 🚗</b> for, and what time works best for you (e.g. <b>'Tomorrow 5 PM'</b>)?`
            : `Aap inme se kis property ki <b>VIP Site Visit 🚗</b> schedule karna chahenge, aur kaunsa time aapke liye best rahega (jaise <b>'Kal shaam 5 baje'</b>)?`)
        : (lang === "GUJLISH"
            ? `Ji <b>${nameStr}</b>! Tamari requirement mujab amari team exclusive options verify kari rahi chhe ane jald thi call par connect karshe. 📞 Shu tame koi criteria update karva mango chho? 🏡`
            : lang === "ENGLISH"
            ? `Hello <b>${nameStr}</b>! Our team is curating verified options matching your requirements and will connect with you shortly. 📞 Would you like to refine your criteria in the meantime? 🏡`
            : `Ji <b>${nameStr}</b>! Aapki requirement ke mutabiq hamari team options arrange kar rahi hai aur jald aapse call par connect karegi. 📞 Kya aap koi criteria update karna chahte hain? 🏡`);

    return {
      replyText: reminderReply,
      nextState: currentState,
    };
  }

  // ---------------------------------------------------------------------------
  // 11. QUALIFYING (State: QUALIFYING)
  // ---------------------------------------------------------------------------
  if (currentState === "QUALIFYING") {
    return handleQualificationCascade(lead, actionResult, context);
  }

  // ---------------------------------------------------------------------------
  // 12. FRESH STATE (State: FRESH)
  // ---------------------------------------------------------------------------
  if (currentState === "FRESH") {
    // If user expressed owner/seller intent right away (e.g. "muje meri shop bechni he", "flat bechna hai"):
    const isFirstMessageOwner =
      actionResult.user_role === "OWNER" ||
      intent === "SUBMIT_LISTING" ||
      parseRequirementFromText(context.messageText) === "SELL" ||
      /(?:mera|meri|maro|mari|apna|apni|own)\s+(?:flat|makan|ghar|house|villa|plot|shop|office)\s+(?:bechna|vechvu|sell|bikri|rent)/i.test(lower) ||
      /(?:bechna|bechni|vechvu|vechva|sell\s*(?:karna|karni|karvu|karva|kar))/i.test(lower);

    if (isFirstMessageOwner) {
      const ownerRes = await handleOwnerFlow({
        lead: {
          ...lead,
          lead_type: "PROVIDER",
        },
        messageText: context.messageText,
        lower,
        lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
        senderName,
        senderId: context.senderId,
        platform: context.platform,
        tenantId: activeTenantId,
        supabase,
        aiAnalysis: actionResult,
        city: resolvedCity,
        agencyName,
      });
      return {
        replyText: ownerRes.replyText,
        nextState: ownerRes.nextState as DialogState,
        leadUpdates: ownerRes.leadUpdates,
      };
    }

    // Direct buyer criteria auto-bypass:
    const detectedFreshBuyerType = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
    const detectedFreshLoc = actionResult.location || extractLocationFromText(context.messageText);
    const detectedFreshBudget = actionResult.price_or_budget || parseBudgetFromText(context.messageText);
    const detectedFreshReq = parseRequirementFromText(context.messageText);

    if (
      detectedFreshBuyerType ||
      detectedFreshLoc ||
      detectedFreshBudget ||
      detectedFreshReq === "BUY" ||
      detectedFreshReq === "RENT" ||
      intent === "CHANGE_REQUIREMENT" ||
      intent === "SEEKER_QUALIFICATION"
    ) {
      return handleQualificationCascade(lead, actionResult, context);
    }

    // Option 1 directly chosen:
    const isFreshOption1 =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 0) ||
      /^(1|1️⃣|option\s*1|first|1st|leni|lena|kharidna|kharidvu)\b/i.test(lower.trim());
    if (isFreshOption1) {
      const replyText =
        lang === "GUJLISH"
          ? `Zaroor <b>${nameStr}</b>! 🏡 ${agencyName} par tame kaya type ni property joi rahya chho — <b>2/3 BHK Flat</b>, <b>Villa</b>, ke <b>Commercial Shop/Office</b>?`
          : lang === "ENGLISH"
          ? `Certainly <b>${nameStr}</b>! 🏡 What type of property are you looking for — <b>2/3 BHK Flat</b>, <b>Villa</b>, or <b>Commercial Shop/Office</b>?`
          : `Zaroor <b>${nameStr}</b>! 🏡 ${agencyName} par aap kis type ki property dekh rahe hain — <b>2/3 BHK Flat</b>, <b>Villa</b>, ya <b>Commercial Shop/Office</b>?`;

      return {
        replyText,
        nextState: "QUALIFYING",
        leadUpdates: {
          lead_type: "SEEKER",
          state: "QUALIFYING",
        },
      };
    }

    // Option 2 directly chosen:
    const isFreshOption2 =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 1) ||
      /^(2|2️⃣|option\s*2|second|2nd|deni|dene|sell|bechna|vechvu|rent\s*out|list|listing)\b/i.test(lower.trim());
    if (isFreshOption2) {
      const replyText =
        lang === "GUJLISH"
          ? `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par tamari property list karva mate aabhar.\n\nTamari property kai chhe? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ke Plot</b>) ane tame <b>Rent par aapva mango chho ke Sell karva</b>?`
          : lang === "ENGLISH"
          ? `Thank you <b>${nameStr}</b>! 🙏 We would be delighted to assist you in listing your property with ${agencyName}.\n\nWhat type of property is it? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa or Plot</b>) and are you looking to <b>Rent it out or Sell</b>?`
          : `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par apni property list karne ke liye dhanyawad.\n\nAapki property kis type ki hai? (e.g. <b>Commercial Office, Shop, 2BHK/3BHK Flat, Villa ya Plot</b>) aur aap ise <b>Rent par dena chahte hain ya Sell karna</b>?`;

      return {
        replyText,
        nextState: "OWNER_CONFIG_PENDING",
        leadUpdates: {
          lead_type: "PROVIDER",
          state: "OWNER_CONFIG_PENDING",
          metadata: {
            ...(lead.metadata || {}),
            owner_draft: { started_at: new Date().toISOString() },
          },
        },
      };
    }

    // Option 3 directly chosen:
    const isFreshOption3 =
      (intent === "SELECT_OPTION" && (action as SelectOptionAction).option_index === 2) ||
      /^(3|3️⃣|option\s*3|third|3rd|both|banne|dono|upgrade)\b/i.test(lower.trim());
    if (isFreshOption3) {
      const replyText =
        lang === "GUJLISH"
          ? `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par tame banne service access kari shako chho.\n\nTame pehla potani property list karva mango chho, ke pehla nava property options jova mango chho?\n👉 1️⃣ <b>Pehle property list karein 📋</b>  2️⃣ <b>Pehle naye options dekhein 🏡</b>`
          : lang === "ENGLISH"
          ? `Welcome <b>${nameStr}</b>! 🙏 You can access both services at ${agencyName}.\n\nWould you prefer to list your existing property first, or explore new property options first?\n👉 1️⃣ <b>List property first 📋</b>  2️⃣ <b>Search options first 🏡</b>`
          : `Namaste <b>${nameStr}</b>! 🙏 ${agencyName} par aap dono services access kar sakte hain.\n\nAap pehle apni existing property list karna chahenge, ya pehle naye property options dekhna chahenge?\n👉 1️⃣ <b>Pehle property list karein 📋</b>  2️⃣ <b>Pehle naye options dekhein 🏡</b>`;

      return {
        replyText,
        nextState: "DUAL_ROLE_MENU_PENDING",
        leadUpdates: {
          lead_type: "DUAL_ROLE",
          state: "DUAL_ROLE_MENU_PENDING",
          metadata: {
            ...(lead.metadata || {}),
            is_initial_dual_onboarding: true,
            has_buyer_profile: true,
            has_seller_profile: true,
          },
        },
      };
    }

    // Otherwise show dual-role greeting:
    const replyText = getGreetingTriageReply(lang, nameStr, agencyName);

    return {
      replyText,
      nextState: "ROLE_SELECTION_PENDING",
      leadUpdates: {
        state: "ROLE_SELECTION_PENDING",
        property_type: null,
        requirement: null,
        purpose: null,
        location: null,
        budget: null,
        timeline: null,
        selected_property_id: null,
        site_visit_booked: false,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // ZERO SILENT DROPS INVARIANT (Final Catch-All)
  // ---------------------------------------------------------------------------
  // SMART ROUTING: If user provided a property type, location, or budget, NEVER repeat the generic question!
  // Instead, forward directly to handleQualificationCascade() so it absorbs the input and asks for the next missing field!
  const detectedTypeInCatchAll = actionResult.property_type || parsePropertyTypeFromText(context.messageText);
  if (detectedTypeInCatchAll || actionResult.location || actionResult.price_or_budget || actionResult.transaction_type) {
    return handleQualificationCascade(lead, actionResult, context);
  }

  // If user expressed owner/seller intent:
  if (
    actionResult.user_role === "OWNER" ||
    intent === "SUBMIT_LISTING" ||
    /(?:mera|meri|maro|mari|apna|apni|own)\s+(?:flat|makan|ghar|house|villa|plot|shop|office)\s+(?:bechna|vechvu|sell|bikri|rent)/i.test(lower)
  ) {
    const ownerRes = await handleOwnerFlow({
      lead,
      messageText: context.messageText,
      lower,
      lang: lang === "ENGLISH" ? "ENGLISH" : lang === "GUJLISH" ? "GUJLISH" : "HINGLISH",
      senderName,
      senderId: context.senderId,
      platform: context.platform,
      tenantId: activeTenantId,
      supabase,
      aiAnalysis: actionResult,
      city: resolvedCity,
      agencyName,
    });
    return {
      replyText: ownerRes.replyText,
      nextState: ownerRes.nextState as DialogState,
      leadUpdates: ownerRes.leadUpdates,
    };
  }

  const defaultReply = getGreetingTriageReply(lang, nameStr, agencyName);

  return {
    replyText: defaultReply,
    nextState: "ROLE_SELECTION_PENDING",
  };
}

export function buildDetourResumptionPrompt(
  targetState: string,
  lead: any,
  lang: string
): string {
  const isGuj = lang === "GUJLISH";
  const isEng = lang === "ENGLISH";

  if (targetState === "OWNER_CONFIG_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — tamari property kaya type ni chhe (Flat, Villa, Shop, Office)? 🏢`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — what type of property do you have (Flat, Villa, Shop, Office)? 🏢`
      : `\n\n👉 <b>Ab aage badhte hain</b> — aapki property kis type ki hai (Flat, Villa, Shop, Office)? 🏢`;
  }
  if (targetState === "OWNER_SOCIETY_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — tamari property kaya Society, Project ya Road par sthit hai? 📍`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — which Society, Project, or Road is your property located on? 📍`
      : `\n\n👉 <b>Ab aage badhte hain</b> — aapki property kis Society, Project ya Road par sthit hai? 📍`;
  }
  if (targetState === "OWNER_LOCATION_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — tamari property kaya Area ya Locality me aati hai? 📍`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — which Area or Locality does your property belong to? 📍`
      : `\n\n👉 <b>Ab aage badhte hain</b> — aapki property kis Area ya Locality me aati hai? 📍`;
  }
  if (targetState === "OWNER_AREA_PENDING" || targetState === "OWNER_SIZE_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — property nu Carpet ke Built-up Area ketlu chhe? 📏`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — what is the Carpet or Built-up Area of your property? 📏`
      : `\n\n👉 <b>Ab aage badhte hain</b> — property ka Carpet ya Built-up Area kitna hai? 📏`;
  }
  if (targetState === "OWNER_PRICE_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — tamaro expected Selling Price ya Monthly Rent kitna hai? 💰`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — what is your expected Selling Price or Monthly Rent? 💰`
      : `\n\n👉 <b>Ab aage badhte hain</b> — aapka expected Selling Price ya Monthly Rent kitna hai? 💰`;
  }
  if (targetState === "OWNER_POSSESSION_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — Possession status shu chhe (1 Ready to Move, 2 Under Construction)? 🔑`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — what is the Possession status (1 Ready to Move, 2 Under Construction)? 🔑`
      : `\n\n👉 <b>Ab aage badhte hain</b> — Possession status kya hai (1 Ready to Move, 2 Under Construction)? 🔑`;
  }
  if (targetState === "OWNER_FURNISHING_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — Furnishing status shu chhe (1 Unfurnished, 2 Semi-Furnished, 3 Fully Furnished)? 🛋️`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — what is the Furnishing status (1 Unfurnished, 2 Semi-Furnished, 3 Fully Furnished)? 🛋️`
      : `\n\n👉 <b>Ab aage badhte hain</b> — Furnishing status kya hai (1 Unfurnished, 2 Semi-Furnished, 3 Fully Furnished)? 🛋️`;
  }
  if (targetState === "OWNER_PHONE_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — direct verification ane buyer updates mate tamaro contact number share karsho? 📞`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — please share your contact number for direct buyer inquiries and verification? 📞`
      : `\n\n👉 <b>Ab aage badhte hain</b> — direct verification aur buyer updates ke liye apna contact number share karenge? 📞`;
  }
  if (targetState === "QUALIFYING") {
    const hasProp = Boolean(lead?.property_type || lead?.metadata?.seeker_draft?.property_type);
    const hasReq = Boolean(lead?.requirement || lead?.metadata?.seeker_draft?.requirement);
    const hasLoc = Boolean(lead?.location || lead?.metadata?.seeker_draft?.location);
    const hasBud = Boolean(lead?.budget || lead?.metadata?.seeker_draft?.budget);

    if (!hasProp || !hasReq) {
      return isGuj
        ? `\n\n👉 <b>Ab aage badhte hain</b> — tame kaya type ni property joi rahya chho (Flat, Villa, Shop/Office) ane Buy karvi chhe ke Rent? 🏡`
        : isEng
        ? `\n\n👉 <b>Moving forward</b> — what type of property are you looking for (Flat, Villa, Shop/Office), and looking to Buy or Rent? 🏡`
        : `\n\n👉 <b>Ab aage badhte hain</b> — aap kis type ki property dekh rahe hain (Flat, Villa, Shop/Office) aur Buy karna hai ya Rent? 🏡`;
    }
    if (!hasLoc || !hasBud) {
      return isGuj
        ? `\n\n👉 <b>Ab aage badhte hain</b> — kaya preferred Area ma joi rahya chho ane tamaro andaje Budget range ketlo chhe? 📍💰`
        : isEng
        ? `\n\n👉 <b>Moving forward</b> — which preferred Area are you looking in, and what is your approximate Budget range? 📍💰`
        : `\n\n👉 <b>Ab aage badhte hain</b> — kaunse preferred Area me dekh rahe hain aur aapka approximate Budget range kitna hai? 📍💰`;
    }
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — tamne Ready to Move joiye chhe ke Under Construction? Ane Self-use mate chhe ke Investment? 🔑`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — are you looking for Ready to Move or Under Construction? And is it for Self-use or Investment? 🔑`
      : `\n\n👉 <b>Ab aage badhte hain</b> — aapko Ready to Move chahiye ya Under Construction? Aur Self-use ke liye hai ya Investment? 🔑`;
  }
  if (targetState === "ROLE_SELECTION_PENDING") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — tame property Buy/Rent karva mango chho (1), Sell/Lease karva mango chho (2), ke Banne (3)? 🔄`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — are you looking to Buy/Rent (1), Sell/Lease (2), or Both (3)? 🔄`
      : `\n\n👉 <b>Ab aage badhte hain</b> — aap property Buy/Rent karna chahte hain (1), Sell/Lease karna chahte hain (2), ya Dono (3)? 🔄`;
  }
  if (targetState === "OPTIONS_SENT" || targetState === "VISIT_REQUESTED" || targetState === "SITE_VISIT_PROPOSED") {
    return isGuj
      ? `\n\n👉 <b>Ab aage badhte hain</b> — tame kaya date ya time par VIP Site Visit plan karva mangsho? 🚗`
      : isEng
      ? `\n\n👉 <b>Moving forward</b> — which date or time would you prefer to schedule your VIP Site Visit? 🚗`
      : `\n\n👉 <b>Ab aage badhte hain</b> — aap kis date ya time par VIP Site Visit plan karna chahenge? 🚗`;
  }

  return "";
}

export async function handleFaqResponse(
  lead: any,
  faqAct: AskFaqAction,
  context: DialogContext,
  hasBookedVisit: boolean
): Promise<DialogTransitionResult> {
  const lang = context.lang || "HINGLISH";
  const senderName = context.senderName || "Friend";
  const nameStr = senderName ? (lang === "GUJLISH" ? `<b>${senderName} bhai</b>` : `<b>${senderName} ji</b>`) : "ji";
  const agencyName = context.agencyName || "Nextgen Realty";
  const resolvedCity = context.resolvedCity;
  const activeTenantId = context.tenantId || defaultTenantId;

  const currentState: DialogState = (lead?.state as DialogState) || "FRESH";
  const suspendedState = lead?.metadata?.suspended_state;
  const targetState: DialogState = (suspendedState?.previous_state as DialogState) || currentState;
  const isDetourIntake =
    Boolean(suspendedState) ||
    (targetState.startsWith("OWNER_") && targetState !== "OWNER_DETAILS_GATHERED") ||
    targetState === "QUALIFYING" ||
    targetState === "ROLE_SELECTION_PENDING" ||
    targetState === "OPTIONS_SENT" ||
    targetState === "VISIT_REQUESTED" ||
    targetState === "SITE_VISIT_PROPOSED";

  const { data: allProps } = await supabase
    .from("inventory")
    .select("*")
    .eq("client_id", activeTenantId)
    .eq("status", "AVAILABLE");
  const availableProps = allProps || [];

  let prop: any = null;
  if (lead?.selected_property_id) {
    prop = availableProps.find((p: any) => p.property_id === lead.selected_property_id);
  }
  if (!prop && Array.isArray(lead?.last_option_ids) && lead.last_option_ids.length > 0) {
    prop = availableProps.find((p: any) => p.property_id === lead.last_option_ids[0]);
  }
  if (!prop && availableProps.length > 0) {
    prop = availableProps[0];
  }

  const projName = prop?.project_name || "Project";
  const projLoc = prop?.location || resolvedCity || "Prime Location";

  let bridgeCta = "";
  if (isDetourIntake) {
    bridgeCta = ""; // Suppress site visit CTA during in-flight intake detours
  } else if (hasBookedVisit) {
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

  const topic = faqAct.topic;
  let replyText = "";

  if (topic === "OFFICE_ADDRESS") {
    const defaultAddr = resolvedCity ? `Prime Commercial Hub, ${resolvedCity}` : "Prime Commercial Hub";
    const addr = context.botKnowledge?.office_address || defaultAddr;
    const hours = context.botKnowledge?.operating_hours || "10:00 AM - 7:30 PM (Mon-Sat)";
    const phone = context.botKnowledge?.contact_phone || "";
    const phoneSnippet = phone ? `\n• 📞 <b>Direct Support:</b> <code>${phone}</code>` : "";

    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! <b>${agencyName}</b> nu office address aa mujab chhe: 🏢\n\n• 📍 <b>Address:</b> ${addr}\n• ⏰ <b>Timings:</b> ${hours}${phoneSnippet}\n\nTame office par avi ne pan amara expert real estate advisor sathe consultation kari shako chho!${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! Here is the office address of <b>${agencyName}</b>: 🏢\n\n• 📍 <b>Address:</b> ${addr}\n• ⏰ <b>Timings:</b> ${hours}${phoneSnippet}\n\nYou are welcome to visit our office for an in-person consultation with our property advisors!${bridgeCta}`
        : `Ji ${nameStr}! <b>${agencyName}</b> ka office address yeh hai: 🏢\n\n• 📍 <b>Address:</b> ${addr}\n• ⏰ <b>Timings:</b> ${hours}${phoneSnippet}\n\nAap hamare office aakar bhi hamare property experts ke saath consultation kar sakte hain!${bridgeCta}`;
  } else if (topic === "OFFICE_TIMINGS") {
    const hours = context.botKnowledge?.operating_hours || "10:00 AM - 7:30 PM (Mon-Sat)";
    const defaultAddr = resolvedCity ? `Prime Commercial Hub, ${resolvedCity}` : "Prime Commercial Hub";
    const addr = context.botKnowledge?.office_address || defaultAddr;

    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! <b>${agencyName}</b> na working hours aa mujab chhe: ⏰\n\n• 🕒 <b>Office Timings:</b> ${hours}\n• 🏢 <b>Location:</b> ${addr}\n\nTame aa samay darmiyan game tyare amara office visit kari shako chho!${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! The operating hours for <b>${agencyName}</b> are: ⏰\n\n• 🕒 <b>Office Timings:</b> ${hours}\n• 🏢 <b>Location:</b> ${addr}\n\nFeel free to visit us during these hours!${bridgeCta}`
        : `Ji ${nameStr}! <b>${agencyName}</b> ke working hours yeh hain: ⏰\n\n• 🕒 <b>Office Timings:</b> ${hours}\n• 🏢 <b>Location:</b> ${addr}\n\nAap is samay ke dauraan hamare office visit kar sakte hain!${bridgeCta}`;
  } else if (topic === "AGENCY_INFO") {
    const cityDisplay = context.displayCity || resolvedCity || "tamara shehar";
    const cityDisplayEn = context.displayCity || resolvedCity || "your city";
    const cityDisplayHi = context.displayCity || resolvedCity || "aapke shehar";
    replyText =
      lang === "GUJLISH"
        ? `Amari agency nu naam <b>${agencyName}</b> chhe! 🙏 Ame ${cityDisplay} ma verified residential (Flats, Villas) ane commercial properties ma deal kariye chhiye. Amari team tamne direct developer pricing ane transparent paperwork sathe best deal aape chhe!${bridgeCta}`
        : lang === "ENGLISH"
        ? `We are <b>${agencyName}</b>! 🙏 We specialize in verified residential (Flats, Villas) and commercial properties across ${cityDisplayEn} with direct developer rates and end-to-end guidance!${bridgeCta}`
        : `Hamari agency ka naam <b>${agencyName}</b> hai! 🙏 Hum ${cityDisplayHi} me verified residential (Flats, Villas) aur commercial properties me deal karte hain. Hamari team aapko direct developer pricing aur 100% verified paperwork provide karti hai!${bridgeCta}`;
  } else if (topic === "CUSTOM_FAQ") {
    let customAns = "";
    const customFaqs = context.botKnowledge?.custom_faqs;
    if (Array.isArray(customFaqs) && customFaqs.length > 0) {
      const qText = (faqAct.specific_query || context.messageText || "").toLowerCase();
      const qWords = qText.split(/\s+/).filter((w) => w.length >= 3);
      let bestMatch = null;
      let maxMatches = 0;
      for (const faq of customFaqs) {
        const qTarget = (faq.question || "").toLowerCase();
        const matches = qWords.filter((w) => qTarget.includes(w)).length;
        if (matches > maxMatches) {
          maxMatches = matches;
          bestMatch = faq;
        }
      }
      if (bestMatch) {
        customAns = bestMatch.answer;
      } else {
        customAns = customFaqs[0].answer;
      }
    }
    if (!customAns) {
      customAns = "Hamare representative aapko required details aur policies jald provide karenge.";
    }

    replyText =
      lang === "GUJLISH"
        ? `${customAns}${bridgeCta}`
        : lang === "ENGLISH"
        ? `${customAns}${bridgeCta}`
        : `${customAns}${bridgeCta}`;
  } else if (topic === "PRICING_DISCOUNT") {
    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! <b>${projName}</b> nu pricing direct developer approved pricing chhe. Serious buyers mate developer taraf thi <b>exclusive token booking discount ane flexible payment plan</b> direct face-to-face site meeting ma finalize thai shake chhe. 💰${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! The pricing for <b>${projName}</b> reflects direct builder rates. For serious buyers, exclusive <b>token spot discounts and customized payment schedules</b> are finalized face-to-face directly with the developer during the site visit. 💰${bridgeCta}`
        : `Ji ${nameStr}! <b>${projName}</b> ki pricing direct developer approved base rate hai. Serious buyers ke liye developer side se <b>exclusive spot token discount aur flexible payment slabs</b> direct face-to-face site visit par finalize ho sakte hain. 💰${bridgeCta}`;
  } else if (topic === "BROKERAGE") {
    const brokerPolicy = context.botKnowledge?.brokerage_policy || "0% Brokerage (Zero Commission)";
    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! ${agencyName} ni brokerage policy: <b>${brokerPolicy}</b>! 🎉\nTame direct builder pricing ane 100% transparent paperwork access karo chho. Tamara thi koi pan extra brokerage charge levama aavshe nahi.${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! ${agencyName}'s brokerage policy: <b>${brokerPolicy}</b>! 🎉\nYou get direct developer pricing and verified paperwork with absolutely zero advisory charges.${bridgeCta}`
        : `Ji ${nameStr}! ${agencyName} ki brokerage policy: <b>${brokerPolicy}</b>! 🎉\nAapko direct builder pricing aur 100% verified transparent paperwork milta hai bina kisi hidden ya extra brokerage charges ke.${bridgeCta}`;
  } else if (topic === "LOAN") {
    const banks = context.botKnowledge?.bank_partners || "SBI, HDFC, ICICI, Bank of Baroda";
    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! <b>${projName}</b> 100% approved project chhe ane <b>${banks}</b> jevi top nationalized ane private banks thi pre-approved chhe! 🏦\n\n• 💰 <b>Starting Rate:</b> 8.4% p.a.\n• 📑 <b>Eligibility:</b> Up to 80%-90% funding support\n• 🤝 <b>Doorstep Assistance:</b> Amari in-house banking team tamara mate loan documentation manage karshe.${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! <b>${projName}</b> is pre-approved by leading banks including <b>${banks}</b>! 🏦\n\n• 💰 <b>Starting Interest Rate:</b> 8.4% p.a.\n• 📑 <b>Loan Quantum:</b> Up to 80%-90% funding assistance\n• 🤝 <b>Doorstep Documentation:</b> Our dedicated banking associates coordinate paperwork end-to-end.${bridgeCta}`
        : `Ji ${nameStr}! <b>${projName}</b> leading banks (jaise <b>${banks}</b>) se pre-approved project hai! 🏦\n\n• 💰 <b>Starting Interest Rate:</b> 8.4% p.a.\n• 📑 <b>Funding:</b> 80% se 90% tak loan approval assistance\n• 🤝 <b>Doorstep Support:</b> Hamari banking team aapke liye loan process aur documentation coordinate karegi.${bridgeCta}`;
  } else if (topic === "RERA") {
    const reraNo = prop?.rera_number || context.botKnowledge?.rera_number || "Verified RERA Registered Project";
    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! <b>${projName}</b> 100% RERA Registered ane Clear Title project chhe! 📜✅\n\n• 🏛️ <b>RERA Registration:</b> <code>${reraNo}</code>\n• ⚖️ <b>Clear Title:</b> All legal approvals, NA permissions ane sanctioned plans complete chhe.${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! <b>${projName}</b> is a 100% RERA-registered and clear title property! 📜✅\n\n• 🏛️ <b>RERA Registration:</b> <code>${reraNo}</code>\n• ⚖️ <b>Clear Title:</b> Fully sanctioned layout, NA permissions, and verified legal clearances.${bridgeCta}`
        : `Ji ${nameStr}! <b>${projName}</b> 100% RERA Registered aur Clear Title project hai! 📜✅\n\n• 🏛️ <b>RERA Registration:</b> <code>${reraNo}</code>\n• ⚖️ <b>Clear Title:</b> Sabhi legal approvals, NA permissions aur sanctioned plans verified hain.${bridgeCta}`;
  } else if (topic === "POSSESSION") {
    const possStatus = prop?.possession_status === "READY_TO_MOVE" ? "Ready to Move (Immediate Handover)" : (prop?.possession_status || "Ready to Move");
    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! <b>${projName}</b> (${projLoc}) ni current status <b>${possStatus}</b> chhe. 🔑\nTame token booking ane registration pachhi direct possession lai shako chho.${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! <b>${projName}</b> in ${projLoc} is currently <b>${possStatus}</b>. 🔑\nYou can take immediate possession upon registration and token allotment.${bridgeCta}`
        : `Ji ${nameStr}! <b>${projName}</b> (${projLoc}) ka current status <b>${possStatus}</b> hai. 🔑\nAap token booking aur registration formalities ke baad direct possession le sakte hain.${bridgeCta}`;
  } else if (topic === "LANDMARKS") {
    const landmarksStr = Array.isArray(prop?.landmarks) && prop.landmarks.length > 0 ? prop.landmarks.join(", ") : "Prime connectivity hub";
    const mapUrl = prop?.map_url || "https://maps.google.com";
    const mapLink = formatMapHyperlink(mapUrl, "View on Google Maps");
    replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}! <b>${projName}</b> ${projLoc} na ekdam prime location par aavelo chhe! 📍\n\n• 🚗 <b>Key Landmarks:</b> ${landmarksStr}\n• ${mapLink}${bridgeCta}`
        : lang === "ENGLISH"
        ? `Hello ${nameStr}! <b>${projName}</b> is situated at a prime location in ${projLoc}! 📍\n\n• 🚗 <b>Nearby Landmarks:</b> ${landmarksStr}\n• ${mapLink}${bridgeCta}`
        : `Ji ${nameStr}! <b>${projName}</b> ${projLoc} ki ekdam prime location par sthit hai! 📍\n\n• 🚗 <b>Key Landmarks:</b> ${landmarksStr}\n• ${mapLink}${bridgeCta}`;
  } else {
    // AMENITIES
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

  let resumptionPrompt = "";
  if (isDetourIntake) {
    resumptionPrompt = buildDetourResumptionPrompt(targetState, lead, lang);
  }
  if (resumptionPrompt) {
    replyText += resumptionPrompt;
  }

  const suspendedObj = suspendedState || (isDetourIntake ? {
    previous_state: targetState,
    suspended_at: new Date().toISOString(),
    intake_type: targetState.startsWith("OWNER_") ? "OWNER" : "SEEKER",
    pending_field: deriveBotQuestionType(targetState, ""),
  } : null);

  const nextStateResult: DialogState = isDetourIntake ? targetState : (lead?.state || "ROLE_SELECTION_PENDING");

  const leadUpdates: Record<string, any> = {
    state: nextStateResult,
    lead_type: lead?.lead_type || (nextStateResult.startsWith("OWNER_") ? "PROVIDER" : "SEEKER"),
    metadata: {
      ...(lead?.metadata || {}),
      ...(suspendedObj ? { suspended_state: suspendedObj } : {}),
      ...(lead?.metadata?.owner_draft ? { owner_draft: lead.metadata.owner_draft } : {}),
      ...(lead?.metadata?.seeker_draft ? { seeker_draft: lead.metadata.seeker_draft } : {}),
    },
  };

  return {
    replyText,
    nextState: nextStateResult,
    leadUpdates,
  };
}

async function handleBrochureOrMapResponse(
  lead: any,
  intent: "BROCHURE_REQUEST" | "MAP_REQUEST",
  context: DialogContext,
  hasBookedVisit: boolean
): Promise<DialogTransitionResult> {
  const lang = context.lang || "HINGLISH";
  const senderName = context.senderName || "Friend";
  const activeTenantId = context.tenantId || defaultTenantId;
  const isMapReq = intent === "MAP_REQUEST";

  let prop: any = null;
  if (lead?.selected_property_id) {
    const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("property_id", lead.selected_property_id).maybeSingle();
    prop = p;
  }
  if (!prop && Array.isArray(lead?.last_option_ids) && lead.last_option_ids.length > 0) {
    const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("property_id", lead.last_option_ids[0]).maybeSingle();
    prop = p;
  }
  if (!prop) {
    const { data: p } = await supabase.from("inventory").select("*").eq("client_id", activeTenantId).eq("status", "AVAILABLE").limit(1).maybeSingle();
    prop = p;
  }

  const link = isMapReq
    ? (prop?.map_url || "https://maps.google.com")
    : (prop?.brochure_url || prop?.map_url || "https://maps.google.com");

  const formattedLink = isMapReq
    ? formatMapHyperlink(link, "View on Google Maps")
    : formatBrochureHyperlink(link, "Download Official Brochure");

  const replyText = hasBookedVisit
    ? (lang === "GUJLISH"
      ? `Aa rahyu ${senderName ? `<b>${senderName} bhai</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> nu official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${formattedLink}\n\nTamari VIP Site Visit 🚗 already confirm chhe. 🤝 <b>Site par maliye chhiye!</b> Amara senior sales executive time par direct site location par tamne malshe.`
      : lang === "ENGLISH"
      ? `Here is the official ${isMapReq ? "Location Map 📍" : "Brochure 📄"} for <b>${prop?.project_name || "Project"}</b>, <b>${senderName}</b>:\n${formattedLink}\n\nYour VIP Site Visit 🚗 is already confirmed. 🤝 <b>See you at the site!</b> Our senior sales advisor will meet you directly at the property location on time.`
      : `Yeh lijiye ${senderName ? `<b>${senderName} ji</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> ka official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${formattedLink}\n\nAapki VIP Site Visit 🚗 already confirm hai. 🤝 <b>Milte hain site par!</b> Hamare senior sales executive time par aapse direct site location par milenge.`)
    : (lang === "GUJLISH"
      ? `Aa rahyu ${senderName ? `<b>${senderName} bhai</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> nu official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${formattedLink}\n\nAa check kari ne janavjo, VIP Site Visit 🚗 mate kayo time anukool raheshe - <b>Kaale sanje 5 vage</b> ke <b>Sunday savare 11 vage</b>?`
      : lang === "ENGLISH"
      ? `Here is the official ${isMapReq ? "Location Map 📍" : "Brochure 📄"} for <b>${prop?.project_name || "Project"}</b>, <b>${senderName}</b>:\n${formattedLink}\n\nWhen would you like to schedule a VIP Site Visit 🚗 once you review this - <b>Tomorrow 5 PM</b> or <b>Sunday 11 AM</b>?`
      : `Yeh lijiye ${senderName ? `<b>${senderName} ji</b>, ` : ""}<b>${prop?.project_name || "Project"}</b> ka official ${isMapReq ? "Location Map 📍" : "Brochure 📄"}:\n${formattedLink}\n\nIse dekh kar bataiye, VIP Site Visit 🚗 ke liye kaunsa slot prefer karenge - <b>Kal shaam 5 baje</b> ya <b>Sunday subah 11 baje</b>?`);

  return {
    replyText,
    nextState: lead?.state || "OPTIONS_SENT",
    salesAlert: { type: isMapReq ? "MAP_REQUEST" : "BROCHURE_REQUEST", payload: { property: prop, userText: context.messageText } },
  };
}

// -------------------------------------------------------------------------
// LEAD SCORING ENGINE (Deterministic 0-100 Score & Temperature Classification)
// -------------------------------------------------------------------------
function computeEngineLeadScore(
  leadData: any,
  targetState?: string,
  updates?: any
) {
  const mergedMeta = {
    ...(leadData?.metadata || {}),
    ...(updates?.metadata || {}),
  };

  const effectiveState = String(targetState || updates?.state || leadData?.state || "").toUpperCase();

  // Inactive / Terminal Visit States Guard: Never award active visit points if visit was cancelled, missed, or dropped
  const isVisitExplicitlyInactive =
    effectiveState === "VISIT_CANCELLED" ||
    effectiveState === "VISIT_MISSED" ||
    effectiveState === "DROPPED" ||
    effectiveState === "NOT_INTERESTED" ||
    effectiveState === "OPT_OUT" ||
    effectiveState === "COLD_UNQUALIFIED" ||
    effectiveState === "COLD";

  const isConfirmedBooked = updates?.site_visit_booked !== undefined
    ? Boolean(updates.site_visit_booked)
    : Boolean(leadData?.site_visit_booked);

  const hasVisitDate = Boolean(
    updates?.site_visit_datetime ||
    leadData?.site_visit_datetime ||
    updates?.site_visit_at ||
    leadData?.site_visit_at
  );

  const hasActiveSiteVisit =
    !isVisitExplicitlyInactive &&
    (isConfirmedBooked || (hasVisitDate && updates?.site_visit_booked !== false && leadData?.site_visit_booked !== false));

  let stageScore = 0;
  let budgetScore = 0;
  let engagementScore = 0;
  let penalties = 0;
  const reasons: string[] = [];

  // 1. Stage & Commitment Signals (Max 45 Pts)
  const hasFullQual = Boolean(
    (updates?.property_type || leadData?.property_type) &&
    (updates?.requirement || leadData?.requirement) &&
    (updates?.location || leadData?.location) &&
    (updates?.budget || leadData?.budget) &&
    (updates?.timeline || leadData?.timeline) &&
    (updates?.purpose || leadData?.purpose)
  );

  if (effectiveState === "SITE_VISIT_DONE" || effectiveState === "VISIT_DONE" || mergedMeta.visit_feedback) {
    stageScore += 45;
    reasons.push("Site visit completed (+45)");
  } else if (effectiveState === "SITE_VISIT_BOOKED" || hasActiveSiteVisit) {
    stageScore += 35;
    reasons.push("Site visit locked & scheduled (+35)");
  } else if (effectiveState === "SITE_VISIT_PROPOSED") {
    stageScore += 25;
    reasons.push("Visit slot actively selected (+25)");
  } else if (hasFullQual) {
    stageScore += 35;
    reasons.push("Full 6-field qualification completed (+35)");
  } else if (
    effectiveState === "OPTIONS_SENT" ||
    mergedMeta.alternative_options_sent ||
    (Array.isArray(leadData?.last_option_ids) && leadData.last_option_ids.length > 0)
  ) {
    stageScore += 18;
    reasons.push("Alternative options requested (+18)");
  } else if (
    effectiveState === "QUALIFIED" ||
    ((updates?.budget || leadData?.budget) && (updates?.location || leadData?.location))
  ) {
    stageScore += 12;
    reasons.push("Requirements qualified (+12)");
  } else {
    stageScore += 5;
    reasons.push("Initial inquiry (+5)");
  }

  // Dual-role bonus (High Lifetime Value)
  if (mergedMeta.has_buyer_profile && mergedMeta.has_seller_profile) {
    stageScore += 10;
    reasons.push("Dual-role buyer & seller (+10)");
  }

  // 2. Financial Viability & Ticket Size (Max 25 Pts)
  const budgetNum = Number(updates?.budget ?? leadData?.budget ?? 0);
  if (budgetNum >= 15000000) {
    budgetScore += 25;
    reasons.push("Ultra-luxury budget >= ₹1.5 Cr (+25)");
  } else if (budgetNum >= 7500000) {
    budgetScore += 20;
    reasons.push("Premium budget ₹75L - ₹1.5 Cr (+20)");
  } else if (budgetNum >= 4000000) {
    budgetScore += 15;
    reasons.push("Mid-segment budget ₹40L - ₹75L (+15)");
  } else if (budgetNum > 0) {
    budgetScore += 10;
    reasons.push("Starter budget < ₹40L (+10)");
  }

  // 3. Conversational Velocity & Engagement (Max 20 Pts)
  if (mergedMeta.last_objection || mergedMeta.visit_feedback) {
    engagementScore += 10;
    reasons.push("Detailed property feedback provided (+10)");
  }

  const followupCount = Number(updates?.followup_count ?? leadData?.followup_count ?? 0);
  if (followupCount >= 3) {
    engagementScore += 10;
    reasons.push("High interaction volume (+10)");
  } else if (followupCount >= 1) {
    engagementScore += 5;
  }

  const slaMinutes = Number(leadData?.sla_response_minutes || 0);
  if (slaMinutes > 0 && slaMinutes <= 10) {
    engagementScore += 10;
    reasons.push("Immediate responder (< 10 min) (+10)");
  }

  // 4. Negative & Churn Penalties (-10 to -35 Pts)
  if (
    effectiveState === "DROPPED" ||
    effectiveState === "NOT_INTERESTED" ||
    effectiveState === "OPT_OUT" ||
    updates?.rejection_reason ||
    leadData?.rejection_reason
  ) {
    penalties += 35;
    reasons.push("Marked dropped or rejected (-35)");
  }

  if (effectiveState === "VISIT_CANCELLED") {
    penalties += 20;
    reasons.push("Cancelled visit (-20)");
  }

  if (effectiveState === "VISIT_MISSED") {
    penalties += 20;
    reasons.push("Missed scheduled site visit (-20)");
  }

  // Missing phone penalty (must be a valid 10-digit number)
  const effectivePhone = updates?.phone ?? leadData?.phone;
  const cleanPhone = String(effectivePhone || "").replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    penalties += 10;
    reasons.push("Missing 10-digit mobile number (-10)");
  }

  // Clamped Total (0 - 100)
  const rawTotal = stageScore + budgetScore + engagementScore - penalties;
  const score = Math.max(0, Math.min(100, Math.round(rawTotal)));

  let temperature: "HOT" | "WARM" | "COLD" = "COLD";
  if (score >= 70) {
    temperature = "HOT";
  } else if (score >= 40) {
    temperature = "WARM";
  } else {
    temperature = "COLD";
  }

  return {
    score,
    temperature,
    breakdown: {
      stage: Math.min(45, stageScore),
      budget: Math.min(25, budgetScore),
      engagement: Math.min(20, engagementScore),
      penalties,
    },
    reasons,
  };
}

async function handleQualificationCascade(
  lead: any,
  actionResult: ClassifiedActionResult,
  context: DialogContext
): Promise<DialogTransitionResult> {
  const lang = context.lang || "HINGLISH";
  const senderName = context.senderName || "Friend";
  const nameStr = senderName ? (lang === "GUJLISH" ? `${senderName} bhai` : `${senderName} ji`) : "ji";
  const activeTenantId = context.tenantId || defaultTenantId;
  const resolvedCity = context.resolvedCity;

  const lastBotPrompt = lead?.metadata?.last_bot_prompt;
  const lastPromptQ = lastBotPrompt?.question_type;

  // Extract what was JUST provided in this user turn vs cumulative values
  const justPropType = parsePropertyTypeFromText(context.messageText);
  const justReq = parseRequirementFromText(context.messageText, lastPromptQ);
  const justPurpose = parsePurposeFromText(context.messageText, lastPromptQ);
  const justTimeline = parseTimelineFromText(context.messageText, lastPromptQ);
  const justBudget = parseBudgetFromText(context.messageText);

  const { data: allTenantInventory } = await supabase
    .from("inventory")
    .select("location, landmarks, project_name")
    .eq("client_id", activeTenantId)
    .eq("status", "AVAILABLE");

  const matchedLocs = extractLocationsFromText(context.messageText, allTenantInventory || []);
  const extractedLoc = matchedLocs.length > 0 ? matchedLocs.join(", ") : extractLocationFromText(context.messageText, allTenantInventory || []);
  const isMsgFlex = /(?:^|\b)(?:koi\s*bhi|kahi\s*bhi|any\s*location|flexible|gamete)\b/i.test(context.lower);
  const justLoc = (actionResult.is_flexible_location || isMsgFlex) ? "FLEXIBLE" : extractedLoc;

  // Cumulative values from this message or previous lead/draft state
  let propType = actionResult.property_type || justPropType || lead?.property_type || lead?.metadata?.seeker_draft?.property_type;
  let requirement = actionResult.transaction_type || justReq || lead?.requirement || lead?.metadata?.seeker_draft?.requirement;
  let purpose = justPurpose || lead?.purpose || lead?.metadata?.seeker_draft?.purpose;
  let budget = actionResult.price_or_budget || justBudget || (lead?.budget ? Number(lead.budget) : 0) || (lead?.metadata?.seeker_draft?.budget ? Number(lead.metadata.seeker_draft.budget) : 0);
  let timeline = actionResult.timeline || justTimeline || lead?.timeline || lead?.metadata?.seeker_draft?.timeline;
  let location = actionResult.location || (justLoc ? justLoc : (lead?.location || lead?.metadata?.seeker_draft?.location));

  // F-05: Commercial Lease Seeker Disambiguation & Sub-50k Budget Protection
  const lowerMsg = (context.messageText || "").toLowerCase();
  const isCommercialInquiry = /(?:commercial|office|shop|showroom|godown|warehouse|retail|co-working)/i.test(propType || context.messageText);
  const hasRentalCue = /(?:bhade|bhadu|bhada|bhaade|kiraya|kiraye|rent\s*par|bhada\s*par|bhade\s*thi|reva\s*mate|pattay|lease)/i.test(lowerMsg);
  const isSub50kMonthlyBudget = budget && Number(budget) >= 1000 && Number(budget) < 50000 && !/(?:lakh|lac|cr|crore)/i.test(lowerMsg);

  if (isCommercialInquiry && (hasRentalCue || isSub50kMonthlyBudget || /(?:lease|pattay)/i.test(lowerMsg))) {
    requirement = "LEASE";
    if (!purpose) purpose = "BUSINESS";
  } else if (hasRentalCue || isSub50kMonthlyBudget) {
    if (requirement !== "LEASE") {
      requirement = "RENT";
    }
  }

  // PURPOSE-FIRST INVESTMENT FAST-PATH:
  // If purpose is INVESTMENT, location is automatically set to "FLEXIBLE" (investor cares about yield/ROI across city)
  if (purpose === "INVESTMENT") {
    if (!location || location === "UNKNOWN") {
      location = "FLEXIBLE";
    }
  }

  if (!location && (actionResult.is_flexible_location || isMsgFlex)) {
    location = "FLEXIBLE";
  }

  const rawPropType = String(propType || "").trim();
  const isGenericCommercial = rawPropType.toLowerCase() === "commercial" || rawPropType === "કોમર્શિયલ";
  const isGenericResidential = rawPropType.toLowerCase() === "residential" || rawPropType === "રેસિડેન્શિયલ";

  // Check stage presence
  const hasPropType = Boolean(propType && !isGenericCommercial && !isGenericResidential);
  const hasRequirement = Boolean(requirement);
  const hasPurpose = Boolean(purpose);
  const hasLocation = Boolean(location);
  const hasBudget = Boolean(budget && Number(budget) > 0);
  const hasTimeline = Boolean(timeline);

  // Determine Missing Stage (Purpose-First Order)
  let missingStage: string | null = null;
  if (!hasPropType && !hasRequirement) {
    missingStage = "TURN_1_COMPOUND";
  } else if (!hasPropType) {
    if (isGenericCommercial) {
      missingStage = "COMMERCIAL_SUBTYPE";
    } else if (isGenericResidential) {
      missingStage = "RESIDENTIAL_SUBTYPE";
    } else {
      missingStage = "PROPERTY_TYPE";
    }
  } else if (!hasRequirement) {
    missingStage = "REQUIREMENT";
  } else if (!hasPurpose) {
    missingStage = "PURPOSE";
  } else if (!hasLocation) {
    missingStage = "LOCATION";
  } else if (!hasBudget) {
    missingStage = "BUDGET";
  } else if (!hasTimeline) {
    missingStage = "TIMELINE";
  }

  const isDual = lead?.lead_type === "DUAL_ROLE" || Boolean(lead?.metadata?.has_seller_profile) || lead?.lead_type === "PROVIDER";
  const hasActiveBookedVisit = Boolean(lead?.site_visit_booked);

  // Multi-search preservation: If lead already has previous search criteria and is starting or refining a new search
  const isNewSecondarySearch = (hasActiveBookedVisit || lead?.state === "OPTIONS_SENT" || lead?.state === "SITE_VISIT_BOOKED") &&
    (actionResult.raw_intent_name === "CHANGE_REQUIREMENT" || Boolean(actionResult.property_type && actionResult.property_type !== lead?.property_type));

  const existingSearches = Array.isArray(lead?.metadata?.seeker_profile?.searches)
    ? [...lead.metadata.seeker_profile.searches]
    : [];

  if (isNewSecondarySearch && lead?.property_type) {
    const isAlreadyArchived = existingSearches.some((s: any) =>
      s.property_type === lead.property_type &&
      s.requirement === lead.requirement &&
      s.location === lead.location
    );
    if (!isAlreadyArchived) {
      existingSearches.push({
        searched_at: new Date().toISOString(),
        property_type: lead.property_type || null,
        requirement: lead.requirement || null,
        budget: lead.budget || null,
        location: lead.location || null,
        timeline: lead.timeline || null,
        purpose: lead.purpose || null,
        status: hasActiveBookedVisit ? "VISIT_BOOKED" : "COMPLETED",
      });
    }
  }

  const seekerDraft = {
    ...(lead?.metadata?.seeker_draft || {}),
    ...(propType ? { property_type: propType } : {}),
    ...(requirement ? { requirement } : {}),
    ...(location ? { location } : {}),
    ...(budget ? { budget } : {}),
    ...(purpose ? { purpose } : {}),
    ...(timeline ? { timeline } : {}),
  };

  const isResidential = /(flat|villa|bhk|bungalow|penthouse|apartment|studio)/i.test(propType || "");
  const isComm = /(commercial|shop|office|showroom|warehouse|godown)/i.test(propType || "");
  const isRentOrLease = String(requirement || "").toLowerCase().includes("rent") || String(requirement || "").toLowerCase().includes("lease");

  const leadUpdates: Record<string, any> = {
    state: missingStage ? (hasActiveBookedVisit ? (lead.state || "SITE_VISIT_BOOKED") : "QUALIFYING") : "OPTIONS_SENT",
    lead_type: isDual ? "DUAL_ROLE" : "SEEKER",
    property_type: propType || null,
    property_category: isCommercialInquiry ? "COMMERCIAL" : (isResidential ? "RESIDENTIAL" : (lead?.property_category || null)),
    requirement: requirement || null,
    purpose: purpose || null,
    location: location || null,
    budget: budget || null,
    timeline: timeline || null,
    metadata: {
      ...(lead?.metadata || {}),
      seeker_draft: seekerDraft,
      seeker_profile: {
        ...(lead?.metadata?.seeker_profile || {}),
        searches: existingSearches,
        has_active_booked_visit: hasActiveBookedVisit,
        current_search: seekerDraft,
      },
      last_bot_prompt: missingStage ? {
        question_type: missingStage,
        sent_at: new Date().toISOString(),
      } : (lead?.metadata?.last_bot_prompt || null),
      ...(isDual ? {
        has_seller_profile: true,
        has_buyer_profile: true,
        active_persona: "BUYER",
      } : {}),
    },
    ...(hasActiveBookedVisit ? {
      site_visit_booked: true,
      site_visit_at: lead.site_visit_at || lead.site_visit_datetime,
      site_visit_datetime: lead.site_visit_datetime || lead.site_visit_at,
    } : {}),
  };

  if (missingStage !== null) {
    // ---------------------------------------------------------------------------
    // Contextual Acknowledgment vs Typo Clarification
    // ---------------------------------------------------------------------------
    const hasAnyEntityInThisTurn = Boolean(
      justPropType || justReq || justPurpose || justLoc || justBudget || justTimeline
    );

    // If user's message didn't provide any recognized entity and bot was expecting something specific, trigger polite clarification
    const isTypoOrUnrecognized = !hasAnyEntityInThisTurn && Boolean(lastPromptQ);

    let ack = "";
    if (justReq) {
      if (justReq === "BUY") {
        ack = lang === "GUJLISH"
          ? `Samji gayo, <b>Buy</b> karva mate! 👍`
          : lang === "ENGLISH"
          ? `Got it, for <b>Purchase</b>! 👍`
          : `Got it, <b>Buy</b> karne ke liye! 👍`;
      } else if (justReq === "RENT") {
        ack = lang === "GUJLISH"
          ? `Samji gayo, <b>Rent</b> par! 👍`
          : lang === "ENGLISH"
          ? `Got it, for <b>Rent</b>! 👍`
          : `Samajh gaya, <b>Rent</b> par! 👍`;
      } else if (justReq === "LEASE") {
        ack = lang === "GUJLISH"
          ? `Samji gayo, <b>Commercial Lease</b> mate! 👍`
          : lang === "ENGLISH"
          ? `Got it, for <b>Commercial Lease</b>! 👍`
          : `Got it, <b>Commercial Lease</b> ke liye! 👍`;
      }
    } else if (justPropType) {
      ack = lang === "GUJLISH"
        ? `Khub saras! <b>${propType}</b>. 👍`
        : lang === "ENGLISH"
        ? `Great choice! <b>${propType}</b>. 👍`
        : `Great choice! <b>${propType}</b>. 👍`;
    } else if (justPurpose) {
      if (justPurpose === "INVESTMENT") {
        ack = lang === "GUJLISH"
          ? `Saras, investment mate aakhi city ma best ROI ane appreciation vada options joi laishu. 📈`
          : lang === "ENGLISH"
          ? `Excellent, for investment we will look at options with the best ROI and appreciation across the city. 📈`
          : `Sahi hai, investment ke liye pure city me best ROI aur appreciation wale options dekh lenge. 📈`;
      } else {
        ack = lang === "GUJLISH"
          ? `Khub saras, family na raheva mate! 🏡`
          : lang === "ENGLISH"
          ? `Great, for family living! 🏡`
          : `Bahut badhiya, family ke rehne ke liye! 🏡`;
      }
    } else if (justLoc) {
      if (justLoc === "FLEXIBLE") {
        ack = lang === "GUJLISH"
          ? `Theek chhe, location no koi issue nathi — aakhi city ma saras options joi laishu. 👍`
          : lang === "ENGLISH"
          ? `Understood, flexible location — we will explore the best options across the area. 👍`
          : `Theek hai, location ka koi issue nahi hai — pure area me acche options dekh lenge. 👍`;
      } else {
        ack = lang === "GUJLISH"
          ? `Khub saras, <b>${location}</b> vistar! 📍`
          : lang === "ENGLISH"
          ? `Great, <b>${location}</b> area! 📍`
          : `Bahut badhiya, <b>${location}</b> area! 📍`;
      }
    } else if (justBudget) {
      ack = lang === "GUJLISH"
        ? `Budget note kari lidho — <b>₹${formatPriceShort(budget)}</b>! 💰`
        : lang === "ENGLISH"
        ? `Budget noted — <b>₹${formatPriceShort(budget)}</b>! 💰`
        : `Budget note kar liya — <b>₹${formatPriceShort(budget)}</b>! 💰`;
    } else if (justTimeline) {
      ack = lang === "GUJLISH"
        ? `Timeline note kari lidhi! 👍`
        : lang === "ENGLISH"
        ? `Timeline noted! 👍`
        : `Noted timeline! 👍`;
    }

    let cleanQuestion = "";
    if (missingStage === "TURN_1_COMPOUND") {
      cleanQuestion =
        lang === "GUJLISH"
          ? `Tame kaya type ni property joi rahya chho — <b>2/3 BHK Flat</b>, <b>Villa</b> ke <b>Commercial Shop/Office</b>? Ane <b>Buy</b> karvi chhe ke <b>Rent</b> par? 🏡`
          : lang === "ENGLISH"
          ? `What type of property are you looking for — <b>2/3 BHK Flat</b>, <b>Villa</b>, or <b>Commercial Shop/Office</b>? And looking to <b>Buy</b> or <b>Rent</b>? 🏡`
          : `Aap kis type ki property dekh rahe hain — <b>2/3 BHK Flat</b>, <b>Villa</b> ya <b>Commercial Shop/Office</b>? Aur <b>Buy</b> karna hai ya <b>Rent</b> par? 🏡`;
    } else if (missingStage === "PROPERTY_TYPE") {
      cleanQuestion =
        lang === "GUJLISH"
          ? `👉 Tame kaya type ni property joi rahya chho — <b>2/3 BHK Flat</b>, <b>Villa</b> ke <b>Commercial Shop/Office</b>? 🏡`
          : lang === "ENGLISH"
          ? `👉 What type of property are you looking for — <b>2/3 BHK Flat</b>, <b>Villa</b>, or <b>Commercial Shop/Office</b>? 🏡`
          : `👉 Aap kis type ki property dekh rahe hain — <b>2/3 BHK Flat</b>, <b>Villa</b> ya <b>Commercial Shop/Office</b>? 🏡`;
    } else if (missingStage === "COMMERCIAL_SUBTYPE") {
      cleanQuestion =
        lang === "GUJLISH"
          ? `👉 Commercial space ma tame kaya type ni property joi rahya chho — <b>Shop</b>, <b>Office</b> ke <b>Showroom</b>? 🏢`
          : lang === "ENGLISH"
          ? `👉 What type of commercial space are you looking for — <b>Shop</b>, <b>Office</b>, or <b>Showroom</b>? 🏢`
          : `👉 Commercial space me aap kis type ki property dekh rahe hain — <b>Shop</b>, <b>Office</b> ya <b>Showroom</b>? 🏢`;
    } else if (missingStage === "RESIDENTIAL_SUBTYPE") {
      cleanQuestion =
        lang === "GUJLISH"
          ? `👉 Residential ma tame kaya type ni property joi rahya chho — <b>2BHK</b>, <b>3BHK Flat</b> ke <b>Villa</b>? 🏡`
          : lang === "ENGLISH"
          ? `👉 What type of residential property are you looking for — <b>2BHK</b>, <b>3BHK Flat</b>, or <b>Villa</b>? 🏡`
          : `👉 Residential me aap kis type ki property search kar rahe hain — <b>2BHK</b>, <b>3BHK Flat</b> ya <b>Villa</b>? 🏡`;
    } else if (missingStage === "REQUIREMENT") {
      cleanQuestion = isComm
        ? (lang === "GUJLISH"
          ? `👉 Commercial space <b>Buy</b> 💼 karvo chhe ke <b>Rent / Lease</b> 🔑 par joiye chhe?`
          : lang === "ENGLISH"
          ? `👉 Are you looking to <b>Buy</b> 💼 or <b>Rent/Lease</b> 🔑 commercial space?`
          : `👉 Commercial space <b>Buy</b> 💼 karna chahte hain ya <b>Rent / Lease</b> 🔑 par chahiye?`)
        : (lang === "GUJLISH"
          ? `👉 Aa property <b>Buy (Kharidva)</b> 🏠 mate joiye chhe ke <b>Rent</b> 🔑 par joiye chhe?`
          : lang === "ENGLISH"
          ? `👉 Are you looking to <b>Buy</b> 🏠 or <b>Rent</b> 🔑 this property?`
          : `👉 Aap ye property <b>Buy (Kharidna)</b> 🏠 chahte hain ya <b>Rent</b> 🔑 par chahiye?`);
    } else if (missingStage === "PURPOSE") {
      cleanQuestion =
        lang === "GUJLISH"
          ? `👉 Aa property tame <b>Family raheva (Self-Use)</b> mate joi rahya chho ke <b>Investment</b> purpose thi? 🔑`
          : lang === "ENGLISH"
          ? `👉 Are you looking for <b>Family living (Self-Use)</b> or for <b>Investment</b>? 🔑`
          : `👉 Yeh property aap <b>Family rehne (Self-Use)</b> ke liye dekh rahe hain ya <b>Investment</b> purpose se? 🔑`;
    } else if (missingStage === "LOCATION") {
      cleanQuestion =
        lang === "GUJLISH"
          ? `👉 Tame kaya preferred <b>Area ke Landmark</b> pase joi rahya chho? 📍`
          : lang === "ENGLISH"
          ? `👉 Which preferred <b>Area or Landmark</b> are you looking around? 📍`
          : `👉 Aap kaunse preferred <b>Area ya Landmark</b> ke paas dekh rahe hain? 📍`;
    } else if (missingStage === "BUDGET") {
      if (requirement === "BUY") {
        cleanQuestion =
          lang === "GUJLISH"
            ? `👉 Tamaro andaje <b>Budget range</b> ketlo raheshe? 💰 (e.g. 50 Lakhs, 85 Lakhs ke 1.5 Cr)`
            : lang === "ENGLISH"
            ? `👉 What is your approximate <b>Budget range</b>? 💰 (e.g. 50 Lakhs, 85 Lakhs, or 1.5 Cr)`
            : `👉 Aapka approximate <b>Budget range</b> kitna rahega? 💰 (e.g. 50 Lakhs, 85 Lakhs ya 1.5 Cr)`;
      } else if (requirement === "RENT") {
        cleanQuestion =
          lang === "GUJLISH"
            ? `👉 Tamaro andaje <b>Monthly rent budget</b> ketlo raheshe? 💰 (e.g. 15,000, 25,000 ke 40,000/month)`
            : lang === "ENGLISH"
            ? `👉 What is your approximate <b>Monthly rent budget</b>? 💰 (e.g. 15,000, 25,000, or 40,000/month)`
            : `👉 Aapka approximate <b>Monthly rent budget</b> kitna rahega? 💰 (e.g. 15,000, 25,000 ya 40,000/month)`;
      } else {
        cleanQuestion =
          lang === "GUJLISH"
            ? `👉 Tamaro andaje <b>Commercial Lease budget</b> ketlo raheshe? 💰 (e.g. 35,000, 60,000 ke 1 Lakh/month)`
            : lang === "ENGLISH"
            ? `👉 What is your approximate <b>Commercial Lease budget</b>? 💰 (e.g. 35,000, 60,000, or 1 Lakh/month)`
            : `👉 Aapka approximate <b>Commercial Lease budget</b> kitna rahega? 💰 (e.g. 35,000, 60,000 ya 1 Lakh/month)`;
      }
    } else if (missingStage === "TIMELINE") {
      cleanQuestion =
        lang === "GUJLISH"
          ? `👉 Tamne <b>Ready to Move</b> joiye chhe ke <b>Under Construction</b> chalshe? 🔑`
          : lang === "ENGLISH"
          ? `👉 Do you need <b>Ready to Move</b> or is <b>Under Construction</b> fine? 🔑`
          : `👉 Aapko <b>Ready to Move</b> property chahiye ya <b>Under Construction</b> chalega? 🔑`;
    }

    let replyText = "";
    if (isTypoOrUnrecognized) {
      const clarifyPrefix =
        lang === "GUJLISH"
          ? `Kshama karsho, hu samji na shakyo. 🙏\n`
          : lang === "ENGLISH"
          ? `Sorry, I did not quite catch that. 🙏\n`
          : `Maaf kijiye, main samajh nahi paya. 🙏\n`;
      replyText = `${clarifyPrefix}${cleanQuestion}`;
    } else {
      replyText = ack ? `${ack}\n\n${cleanQuestion}` : cleanQuestion;
    }

    return {
      replyText,
      nextState: "QUALIFYING",
      leadUpdates,
    };
  }

  // All 6 qualified! Query matching inventory
  const { data: allProps } = await supabase
    .from("inventory")
    .select("*")
    .eq("client_id", activeTenantId)
    .eq("status", "AVAILABLE");

  const available = allProps || [];
  const leadBudget = Number(budget || 0);
  const maxBudget = leadBudget > 0 ? leadBudget * 1.15 : Infinity;
  const isLeadFlex = location === "FLEXIBLE";
  const isCommSearch = /(commercial|shop|office|showroom|warehouse|godown|retail)/i.test(propType || "");

  const strictMatches = available.filter((p: any) => {
    const price = Number(p.price || 0);
    if (leadBudget > 0 && price > maxBudget) return false;
    if (!matchesListingType(requirement, p.listing_type, price, isCommSearch)) return false;
    if (!matchesPropertyType(propType, p.property_category, p.configuration, p.project_name)) return false;
    if (!isLeadFlex && !matchesLocation(location, p.location, p.landmarks)) return false;
    return true;
  });

  strictMatches.sort((a: any, b: any) => {
    if (leadBudget > 0) {
      return Math.abs(Number(a.price || 0) - leadBudget) - Math.abs(Number(b.price || 0) - leadBudget);
    }
    return 0;
  });

  const properties = strictMatches.slice(0, 3);

  // F-12 AI Lead Scoring Handshake: Full qualification completed -> elevate to HOT (80+)
  const qualScoreResult = computeEngineLeadScore(lead, "OPTIONS_SENT", leadUpdates);
  const elevatedScore = Math.max(qualScoreResult.score, 82);
  leadUpdates.metadata = {
    ...(lead?.metadata || {}),
    ...(leadUpdates.metadata || {}),
    lead_score: elevatedScore,
    lead_temperature: "HOT",
    score_breakdown: {
      ...qualScoreResult.breakdown,
      stage: Math.max(qualScoreResult.breakdown.stage, 35),
    },
    score_reasons: [
      ...qualScoreResult.reasons.filter((r: string) => !r.includes("Initial inquiry")),
      "Full 6-field buyer qualification completed (+HOT)",
    ],
    score_updated_at: new Date().toISOString(),
  };

  if (properties.length > 0) {
    const optionIds = properties.map((p) => p.property_id);
    leadUpdates.last_option_ids = optionIds;
    leadUpdates.selected_property_id = properties.length === 1 ? properties[0].property_id : null;
    leadUpdates.state = "OPTIONS_SENT";

    const optionsCards = properties.map((p, idx) => formatN8nPropertyCard(p, idx, false)).join("\n\n---\n\n");
    const trailer =
      properties.length === 1
        ? (lang === "GUJLISH"
          ? `👉 <i>Tame <b>${properties[0].project_name}</b> ni <b>VIP Site Visit 🚗</b> mate kayo time anukool ganasho — <b>Kaale sanje 5:00 vage</b> ke <b>Sunday savare 11:00 vage</b>?</i>`
          : lang === "ENGLISH"
          ? `👉 <i>When would you like to schedule a <b>VIP Site Visit 🚗</b> for <b>${properties[0].project_name}</b> — <b>Tomorrow 5:00 PM</b> or <b>Sunday 11:00 AM</b>?</i>`
          : `👉 <i>Aap <b>${properties[0].project_name}</b> ki <b>VIP Site Visit 🚗</b> ke liye kaunsa slot prefer karenge — <b>Kal shaam 5:00 baje</b> ya <b>Sunday subah 11:00 baje</b>?</i>`)
        : (lang === "GUJLISH"
          ? `👉 <b>Kayi property ni VIP Site Visit 🚗 schedule kariye — Option 1 ke Option 2?</b> (Kaale sanje 5:00 vage ke Sunday savare 11:00 vage?)`
          : lang === "ENGLISH"
          ? `👉 <b>Which property would you like to schedule a VIP Site Visit 🚗 for — Option 1 or Option 2?</b> (Tomorrow 5:00 PM or Sunday 11:00 AM?)`
          : `👉 <b>Kis property ki VIP Site Visit 🚗 schedule karein — Option 1 ya Option 2?</b> (Kal shaam 5:00 baje ya Sunday subah 11:00 baje?)`);

    const budgetStr = leadBudget > 0 ? `₹${formatPriceShort(leadBudget)} budget` : "aapke budget";
    const heading =
      lang === "GUJLISH"
        ? `🌟 <b>Tamari Requirement Mujab Top Options</b>\n\n${nameStr}, tamara <b>${budgetStr}</b> ane <b>${propType} requirement</b> mujab aa best options chhe:`
        : lang === "ENGLISH"
        ? `🌟 <b>Top Options Matching Your Requirement</b>\n\n${nameStr}, based on your budget of <b>${budgetStr}</b> and <b>${propType} requirement</b>, here are the best options:`
        : `🌟 <b>Aapke Requirement Ke Top Options</b>\n\n${nameStr}, aapke <b>${budgetStr}</b> aur <b>${propType} requirement</b> ke hisab se ye best options hain:`;

    return {
      replyText: `${heading}\n\n${optionsCards}\n\n${trailer}`,
      nextState: "OPTIONS_SENT",
      leadUpdates,
    };
  } else {
    leadUpdates.state = "OPTIONS_SENT";
    leadUpdates.last_option_ids = [];
    const replyText =
      lang === "GUJLISH"
        ? `Ji ${nameStr}, tamari requirement (<b>${propType}</b> in <b>${location || "tamara shehar"}</b>) mujab amara senior sales executive specialized <b>off-market options</b> arrange kari rahya chhe ane direct <b>call par connect karshe</b>. 📞`
        : lang === "ENGLISH"
        ? `Sure ${nameStr}, our senior sales executives are sourcing specialized <b>off-market options</b> matching your requirement (<b>${propType}</b> in <b>${location || "your city"}</b>) and will <b>connect with you directly over a call</b>. 📞`
        : `Ji ${nameStr}, aapki requirement (<b>${propType}</b> in <b>${location || "aapke shehar"}</b>) ke mutabiq hamare senior sales executive specialized <b>off-market options</b> arrange kar rahe hain aur aapse direct <b>call par connect karenge</b>. 📞`;

    return {
      replyText,
      nextState: "OPTIONS_SENT",
      leadUpdates,
      salesAlert: { type: "NO_PROPERTY_MATCH", payload: { userText: context.messageText } },
    };
  }
}

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
        version: "v81-site-visit-first-intake",
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
          "universal-conversational-intake",
          "smart-compound-flows",
          "commercial-lease-lifecycle",
          "city-agnostic-templates",
          "dual-role-lifecycle-engine",
          "scenario-3-disambiguation-menu",
          "high-value-dual-role-sales-alert",
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
          "short-bifurcated-buyer-rental-flows",
          "schema-guided-zero-regex-engine",
          "deterministic-fsm-state-router"
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
    return new Response("Realtor Lead Engine v81 Ready (Site Visit First Intake & Zero Direct Call Traps)", { status: 200 });
  }

  try {
    let body: any = {};
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        body = {};
        for (const [key, value] of formData.entries()) {
          body[key] = value;
        }
      }
    } else {
      body = await req.json().catch(async () => {
        const text = await req.text().catch(() => "");
        try {
          return JSON.parse(text);
        } catch (_) {
          const p = new URLSearchParams(text);
          const obj: any = {};
          for (const [k, v] of p.entries()) {
            obj[k] = v;
          }
          return Object.keys(obj).length > 0 ? obj : {};
        }
      });
    }

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

    // =========================================================================
    // Multi-Portal Lead Webhook Handling (99acres, MagicBricks, Housing, CommonFloor, Facebook, OLX, Custom)
    // =========================================================================
    if (isPortalWebhook(url, body)) {
      console.log(`[PortalWebhook] Ingesting portal lead payload from: ${url.search || "(direct POST)"}`);
      const normalized = normalizePortalPayload(body, url);
      console.log(`[PortalWebhook] Normalized portal lead:`, JSON.stringify(normalized));

      // Resolve tenant
      let activeTenantId = (
        url.searchParams.get("client_id") ||
        url.searchParams.get("tenant_id") ||
        body.client_id ||
        body.tenant_id ||
        ""
      ).trim();

      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!activeTenantId || !UUID_REGEX.test(activeTenantId)) {
        activeTenantId = defaultTenantId;
      }

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      let existingLead: any = null;

      // 24-Hour Lead Deduplication
      if (normalized.phone) {
        const { data: matchedLeads } = await supabase
          .from("leads")
          .select("*")
          .eq("client_id", activeTenantId)
          .or(`phone.eq.${normalized.phone},phone.eq.91${normalized.phone},lead_id.eq.${normalized.phone}`)
          .gte("last_interaction_at", twentyFourHoursAgo)
          .order("last_interaction_at", { ascending: false })
          .limit(1);

        if (matchedLeads && matchedLeads.length > 0) {
          existingLead = matchedLeads[0];
        } else {
          const { data: matchedByCreated } = await supabase
            .from("leads")
            .select("*")
            .eq("client_id", activeTenantId)
            .or(`phone.eq.${normalized.phone},phone.eq.91${normalized.phone},lead_id.eq.${normalized.phone}`)
            .gte("created_at", twentyFourHoursAgo)
            .order("created_at", { ascending: false })
            .limit(1);
          if (matchedByCreated && matchedByCreated.length > 0) {
            existingLead = matchedByCreated[0];
          }
        }
      } else if (normalized.email) {
        const { data: matchedByEmail } = await supabase
          .from("leads")
          .select("*")
          .eq("client_id", activeTenantId)
          .gte("created_at", twentyFourHoursAgo)
          .order("created_at", { ascending: false });

        if (matchedByEmail) {
          existingLead = matchedByEmail.find((l: any) => {
            const email = l.metadata?.email || l.metadata?.original_payload?.email;
            return email && email.toLowerCase() === normalized.email!.toLowerCase();
          }) || null;
        }
      }

      let targetLead: any = null;

      if (existingLead) {
        console.log(`[PortalWebhook] Duplicate lead found within 24h: ${existingLead.id} (${existingLead.lead_id}). Merging.`);
        const existingInquiries = Array.isArray(existingLead.metadata?.portal_inquiries)
          ? existingLead.metadata.portal_inquiries
          : [];

        const updatedInquiries = [
          ...existingInquiries,
          {
            source: normalized.source,
            received_at: new Date().toISOString(),
            project_name: normalized.projectName,
            user_comments: normalized.userComments,
            raw: normalized.rawPayload,
          },
        ];

        const { data: updated, error: updateErr } = await supabase
          .from("leads")
          .update({
            last_interaction_at: new Date().toISOString(),
            metadata: {
              ...(existingLead.metadata || {}),
              portal_inquiries: updatedInquiries,
              last_portal_source: normalized.source,
            },
          })
          .eq("id", existingLead.id)
          .select()
          .single();

        targetLead = updated || existingLead;

        await supabase.from("lead_events").insert({
          client_id: activeTenantId,
          lead_id: existingLead.lead_id,
          event_type: "PORTAL_INQUIRY_MERGED",
          payload: {
            source: normalized.source,
            existing_state: existingLead.state,
            project_name: normalized.projectName,
            comments: normalized.userComments,
          },
        });
      } else {
        const newLeadId = normalized.phone ? normalized.phone : `portal_${crypto.randomUUID().slice(0, 8)}`;
        const { data: inserted, error: insertErr } = await supabase
          .from("leads")
          .insert({
            lead_id: newLeadId,
            client_id: activeTenantId,
            first_name: normalized.name,
            name: normalized.name,
            phone: normalized.phone,
            source: normalized.source,
            property_type: normalized.propertyType,
            budget: normalized.budget,
            location: normalized.location,
            state: "FRESH",
            bot_active: Boolean(normalized.phone),
            last_interaction_at: new Date().toISOString(),
            metadata: {
              portal_source: normalized.source,
              original_payload: normalized.rawPayload,
              user_comments: normalized.userComments,
              phone_missing: !normalized.phone,
              email: normalized.email,
              portal_inquiries: [
                {
                  source: normalized.source,
                  received_at: new Date().toISOString(),
                  project_name: normalized.projectName,
                  user_comments: normalized.userComments,
                  raw: normalized.rawPayload,
                },
              ],
            },
          })
          .select()
          .single();

        if (insertErr) {
          console.error("[PortalWebhook] Error inserting portal lead:", insertErr.message);
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        targetLead = inserted;

        await supabase.from("lead_events").insert({
          client_id: activeTenantId,
          lead_id: targetLead.lead_id,
          event_type: "PORTAL_LEAD_INGESTED",
          payload: {
            source: normalized.source,
            name: normalized.name,
            phone: normalized.phone,
            project_name: normalized.projectName,
            has_phone: Boolean(normalized.phone),
          },
        });
      }

      // If phone is missing or masked: Flag for manager triage
      if (!normalized.phone) {
        console.log(`[PortalWebhook] Missing/masked phone for portal inquiry. Dispatching alert to Manager.`);
        await dispatchSalesAlert(
          activeTenantId,
          "UNASSIGNED_LEAD",
          targetLead,
          {
            hint: `Portal inquiry from ${normalized.source} received without mobile number. Check portal inbox or call/email client.`,
            userText: `Portal Inquiry from ${normalized.source}: ${normalized.userComments || normalized.projectName || "No details provided"} (Email: ${normalized.email || "N/A"})`,
          }
        );

        return new Response(
          JSON.stringify({
            success: true,
            lead_id: targetLead.lead_id,
            status: "phone_missing_flagged",
            source: normalized.source,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If duplicate lead is already in active conversation / booked visit, retain state and avoid double outreach
      if (
        existingLead &&
        ["SITE_VISIT_BOOKED", "VISIT_RESCHEDULED", "SITE_VISIT_DONE", "QUALIFIED"].includes(existingLead.state)
      ) {
        console.log(`[PortalWebhook] Duplicate lead ${existingLead.lead_id} is in state ${existingLead.state}. Skipping auto-outreach.`);
        return new Response(
          JSON.stringify({
            success: true,
            lead_id: targetLead.lead_id,
            status: "merged_existing_lead",
            state: existingLead.state,
            source: normalized.source,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Task 2: Inventory Auto-Matcher & Instant Consultative WhatsApp Outreach
      const matchedProperty = await matchInventoryForPortalLead(activeTenantId, normalized);
      console.log(`[PortalWebhook] Matched property for lead:`, matchedProperty?.project_name);

      // WABA Safety Invariant: Protect account reputation by sending active marketing WhatsApp outreach only between 9:00 AM and 9:00 PM IST
      const withinHours = isWithinWorkingHours(9, 21);
      let outreachResult = {
        success: false,
        messageText: "",
        error: "Deferred: Outside working hours (9:00 AM - 9:00 PM IST)",
      };

      if (withinHours) {
        outreachResult = await dispatchPortalWhatsAppOutreach(
          activeTenantId,
          targetLead,
          matchedProperty,
          normalized.source
        );
      } else {
        console.log(`[PortalWebhook] Inquiry received outside business hours (9 AM - 9 PM IST). Outreach deferred to prevent WABA bans.`);
      }

      // Transition Lead State to SITE_VISIT_PROPOSED for natural TypeChat FSM handoff
      await supabase
        .from("leads")
        .update({
          selected_property_id: matchedProperty?.property_id || null,
          state: "SITE_VISIT_PROPOSED",
          last_interaction_at: new Date().toISOString(),
          metadata: {
            ...(targetLead.metadata || {}),
            selected_property_name: matchedProperty?.project_name,
            portal_outreach_sent: withinHours && outreachResult.success,
            portal_outreach_at: withinHours && outreachResult.success ? new Date().toISOString() : null,
            portal_outreach_deferred: !withinHours,
          },
        })
        .eq("id", targetLead.id);

      // Log lead_events
      await supabase.from("lead_events").insert({
        client_id: activeTenantId,
        lead_id: targetLead.lead_id,
        event_type: withinHours ? "PORTAL_OUTREACH_SENT" : "PORTAL_OUTREACH_DEFERRED",
        payload: {
          source: normalized.source,
          property_id: matchedProperty?.property_id,
          project_name: matchedProperty?.project_name,
          phone: targetLead.phone,
          outreach_dispatched: withinHours && outreachResult.success,
          outreach_error: outreachResult.error || null,
          deferred_reason: withinHours ? null : "Outside 9 AM - 9 PM IST window",
        },
      });

      // Dispatch Sales Alert: NEW_PORTAL_LEAD
      await dispatchSalesAlert(
        activeTenantId,
        "NEW_PORTAL_LEAD",
        { ...targetLead, state: "SITE_VISIT_PROPOSED" },
        {
          property: matchedProperty,
          hint: withinHours
            ? "Portal inquiry converted to WhatsApp dialog. Lead is in SITE_VISIT_PROPOSED state. Keep sample keys ready."
            : "Portal inquiry received after hours. Automated WhatsApp outreach deferred to 9:00 AM morning window to protect WABA quality rating.",
          userText: `Portal Inquiry from ${normalized.source} for ${matchedProperty?.project_name || normalized.projectName || "Property"}: ${normalized.userComments || (withinHours ? "Outreach sent over WhatsApp" : "After-hours receipt (deferred)")}`,
        }
      );

      return new Response(
        JSON.stringify({
          success: true,
          lead_id: targetLead.lead_id,
          status: withinHours ? "outreach_dispatched" : "outreach_deferred_after_hours",
          source: normalized.source,
          matched_property: matchedProperty?.project_name || null,
          state: "SITE_VISIT_PROPOSED",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const queryClientId = (url.searchParams.get("client_id") || url.searchParams.get("tenant_id") || "").trim();
    const queryBotToken = (url.searchParams.get("bot_token") || "").trim();

    let senderId = "";
    let senderName = "Customer";
    let messageText = "";
    let platform: "TELEGRAM" | "WHATSAPP" | "DIRECT" = "DIRECT";
    let botToken = queryBotToken || defaultBotToken;
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
    let activeTenantId = queryClientId || (body.client_id || body.tenant_id || "").trim();
    if (!activeTenantId && phoneNumberId) {
      const { data: c } = await supabase
        .from("clients")
        .select("id, bot_token")
        .eq("whatsapp_phone_number_id", phoneNumberId)
        .maybeSingle();
      if (c?.id) {
        activeTenantId = c.id;
        if (!queryBotToken && c.bot_token) botToken = c.bot_token;
      }
    }
    if (!activeTenantId && botToken && botToken !== defaultBotToken) {
      const { data: c } = await supabase
        .from("clients")
        .select("id, bot_token")
        .eq("bot_token", botToken)
        .maybeSingle();
      if (c?.id) activeTenantId = c.id;
    }
    if (!activeTenantId) {
      activeTenantId = defaultTenantId;
    }

    // Dynamic botToken resolution for resolved tenant if still on default
    if (botToken === defaultBotToken && activeTenantId !== defaultTenantId) {
      const { data: c } = await supabase
        .from("clients")
        .select("bot_token")
        .eq("id", activeTenantId)
        .maybeSingle();
      if (c?.bot_token) {
        botToken = c.bot_token;
      }
    }

    // Resolve Tenant Branding & Operating City
    const { data: tenantClient } = await supabase
      .from("clients")
      .select("id, name, city, office_address, notification_channel, bot_knowledge, access_token")
      .eq("id", activeTenantId)
      .maybeSingle();

    const botKnowledge = (tenantClient?.bot_knowledge as Record<string, any>) || {};
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
            ? `Ji bilkul <b>${senderName} bhai</b>! Tamari property verification process ma chhe. Amari acquisition team verification mate jaldi tamaro sampark karshe! 🙏`
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



    // -------------------------------------------------------------------------
    // DETERMINISTIC FSM STATE ROUTING (Zero Regex Cascades)
    // -------------------------------------------------------------------------
    const dialogCtx: DialogContext = {
      messageText,
      normalizedMessage,
      lower,
      senderName,
      senderId,
      platform,
      tenantId: activeTenantId,
      agencyName,
      resolvedCity,
      displayCity,
      lang: (lang === "GUJLISH" || lang === "HINGLISH" || lang === "ENGLISH" || lang === "GUJARATI_SCRIPT") ? lang : "HINGLISH",
      botKnowledge,
    };

    // Dispatch turn through Deterministic Finite State Machine (FSM) Router
    const transitionResult = await dispatchStateAction(lead, aiAnalysis, dialogCtx);
    replyText = transitionResult.replyText;
    nextState = transitionResult.nextState;
    if (transitionResult.isSilent) {
      isSilent = true;
    }

    // Centralized post-detour suspended state cleanup:
    if (lead?.metadata?.suspended_state && aiAnalysis?.action?.intent !== "ASK_FAQ") {
      transitionResult.leadUpdates = {
        ...(transitionResult.leadUpdates || {}),
        metadata: {
          ...(lead?.metadata || {}),
          ...(transitionResult.leadUpdates?.metadata || {}),
          suspended_state: null,
        },
      };
    }

    // Compute updated AI lead score and persist in metadata
    const leadScoreResult = computeEngineLeadScore(lead, nextState, transitionResult.leadUpdates);
    const existingLeadMeta = (lead?.metadata || {}) as Record<string, any>;
    const updateLeadMeta = (transitionResult.leadUpdates?.metadata || {}) as Record<string, any>;
    const enrichedLeadMetadata = {
      ...existingLeadMeta,
      ...updateLeadMeta,
      lead_score: leadScoreResult.score,
      lead_temperature: leadScoreResult.temperature,
      score_breakdown: leadScoreResult.breakdown,
      score_reasons: leadScoreResult.reasons,
      score_updated_at: new Date().toISOString(),
    };
    if (updateLeadMeta.owner_draft) {
      enrichedLeadMetadata.owner_draft = updateLeadMeta.owner_draft;
    }

    // Centralized last_bot_prompt tracking across interactive turns
    if (!isSilent && replyText && replyText.trim()) {
      const derivedQType = deriveBotQuestionType(nextState, replyText, updateLeadMeta);
      if (derivedQType) {
        enrichedLeadMetadata.last_bot_prompt = {
          question_type: derivedQType,
          text_preview: replyText.slice(0, 150),
          asked_at: new Date().toISOString(),
        };
      }
    }

    // Persist lead state and updates to Supabase PostgreSQL (schema-safe: leads has 'state', not 'status')
    if (transitionResult.leadUpdates && Object.keys(transitionResult.leadUpdates).length > 0) {
      const sanitizedUpdates = { ...transitionResult.leadUpdates };
      delete (sanitizedUpdates as any).status;
      const { error: updateErr } = await supabase
        .from("leads")
        .update({
          ...sanitizedUpdates,
          state: nextState,
          last_active_at: new Date().toISOString(),
          metadata: enrichedLeadMetadata,
        })
        .eq("id", lead.id);

      if (updateErr) {
        console.error(`[CRITICAL] Lead update failed for id ${lead.id}:`, updateErr.message, updateErr.details);
      }
    } else {
      const { error: updateErr } = await supabase
        .from("leads")
        .update({
          state: nextState,
          last_active_at: new Date().toISOString(),
          metadata: enrichedLeadMetadata,
        })
        .eq("id", lead.id);

      if (updateErr) {
        console.error(`[CRITICAL] Lead state update failed for id ${lead.id}:`, updateErr.message, updateErr.details);
      }
    }

    // Dispatch real-time sales alert if triggered
    if (transitionResult.salesAlert) {
      await dispatchSalesAlert(
        activeTenantId,
        transitionResult.salesAlert.type,
        lead,
        transitionResult.salesAlert.payload || {}
      );
    }

    // =========================================================================
    // 11. OUTBOUND DISPATCH (Only if not silent!)
    // =========================================================================
    if (!isSilent && (!replyText || !replyText.trim())) {
      const leadName = senderName ? (lang === "GUJLISH" ? `<b>${senderName} bhai</b>` : `<b>${senderName} ji</b>`) : "ji";
      replyText =
        lang === "GUJLISH"
          ? `Ji ${leadName}! Kripya janavjo tamne kaya type ni property ma interest chhe — Flat, Villa, ke Commercial Office/Shop? 🏡`
          : lang === "ENGLISH"
          ? `Hello <b>${senderName || "Friend"}</b>! How may we assist you with your property search — are you looking for a Flat, Villa, or Commercial space? 🏡`
          : `Ji ${leadName}! Kripya batayein aap kis type ki property search kar rahe hain — Flat, Villa, ya Commercial Office/Shop? 🏡`;
    }

    if (!isSilent && replyText) {
      if (platform === "TELEGRAM") {
        await sendTelegramMessage(botToken, senderId, replyText);
      } else if (platform === "WHATSAPP" && phoneNumberId) {
        const waAccessToken = tenantClient?.access_token || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
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
