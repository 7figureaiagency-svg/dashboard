/**
 * src/lib/pitch-crafter.ts
 *
 * Autonomous Real Estate Property Pitch Crafter & Consultative Sales Engine.
 * Formats psychology-grounded, multi-lingual WhatsApp/Telegram pitches across
 * 4 buyer archetypes, 3 regional dialects, and 3 formats with 1-tap WhatsApp Web URLs.
 */

import { formatMoney, toNumber, toWhatsAppUrl, type Lead, type Property, type PropertySubmission } from "@/lib/crm";

export type PitchPersona =
  | "FAMILY_END_USER"
  | "INVESTOR_ROI"
  | "LUXURY_HNW"
  | "BUDGET_FIRST_TIME";

export type PitchLanguage = "HINGLISH" | "GUJLISH" | "ENGLISH";

export type PitchFormat = "WHATSAPP_QUICK" | "PORTFOLIO_DEEP_DIVE" | "URGENT_SCARCITY";

export interface PitchOptions {
  persona?: PitchPersona;
  language?: PitchLanguage;
  format?: PitchFormat;
  customNote?: string;
  executiveName?: string;
  agencyName?: string;
}

export interface PitchResult {
  headline: string;
  body: string;
  cta: string;
  fullMessage: string;
  waUrl: string | null;
  estimatedEmi: string | null;
  estimatedEmiNumber: number | null;
  pricePerSqFt: number | null;
  persona: PitchPersona;
  language: PitchLanguage;
  format: PitchFormat;
}

export const PERSONA_LABELS: Record<PitchPersona, { label: string; icon: string; description: string }> = {
  FAMILY_END_USER: {
    label: "End-User Family",
    icon: "👨‍👩‍👧",
    description: "Carpet area, Vastu, quiet neighborhood, schools & hospitals proximity",
  },
  INVESTOR_ROI: {
    label: "Investor / ROI",
    icon: "📈",
    description: "Rental yield, highway/metro corridor growth, high tenant demand & capital gain",
  },
  LUXURY_HNW: {
    label: "Luxury / High Net-Worth",
    icon: "💎",
    description: "Low-density exclusivity (2 flats/floor), privacy, Italian marble & clubhouse",
  },
  BUDGET_FIRST_TIME: {
    label: "Starter / Budget Buyer",
    icon: "🏷️",
    description: "Low monthly EMI, rent savings, PMAY subsidy & all-inclusive pricing",
  },
};

export const LANGUAGE_LABELS: Record<PitchLanguage, { label: string; flag: string }> = {
  HINGLISH: { label: "Hinglish", flag: "🇮🇳" },
  GUJLISH: { label: "Gujlish", flag: "🦁" },
  ENGLISH: { label: "English", flag: "🌐" },
};

export const FORMAT_LABELS: Record<PitchFormat, { label: string; icon: string; description: string }> = {
  WHATSAPP_QUICK: {
    label: "Quick Hook",
    icon: "⚡",
    description: "Punchy, 3 bullet points, fast read (<75 words)",
  },
  PORTFOLIO_DEEP_DIVE: {
    label: "Deep-Dive & EMI",
    icon: "📋",
    description: "Full specs, carpet area, estimated EMI & location pin (~150 words)",
  },
  URGENT_SCARCITY: {
    label: "Urgent Scarcity",
    icon: "🔥",
    description: "Limited units remaining, price advantage & slot reservation (~100 words)",
  },
};

/**
 * Calculates approximate monthly home loan EMI based on 80% LTV, 8.5% p.a., 20-year tenure.
 * Benchmark: ~₹8,678 per ₹10 Lakhs loan.
 */
export function calculateApproxMonthlyEmi(
  propertyPrice: number,
  loanToValuePct = 0.8,
  annualRatePct = 8.5,
  tenureYears = 20
): number {
  if (!propertyPrice || propertyPrice <= 0) return 0;
  const principal = propertyPrice * loanToValuePct;
  const monthlyRate = annualRatePct / (12 * 100);
  const n = tenureYears * 12;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  return Math.round(emi);
}

/**
 * Computes price per square foot from price and carpet area.
 */
export function calculatePricePerSqFt(price: number, sqft: number): number | null {
  if (!price || !sqft || price <= 0 || sqft <= 0) return null;
  return Math.round(price / sqft);
}

/**
 * Automatically infers the most effective buyer persona based on budget, requirement, or ticket size.
 */
export function inferBestPersona(
  lead?: Partial<Lead> | null,
  propertyPrice?: number
): PitchPersona {
  const price =
    propertyPrice !== undefined && propertyPrice !== null && !isNaN(propertyPrice)
      ? propertyPrice
      : toNumber(lead?.budget) ?? 0;

  if (price >= 12500000) {
    return "LUXURY_HNW";
  }

  const reqText = `${lead?.requirement || ""} ${lead?.property_type || ""} ${(lead as any)?.notes || ""}`.toLowerCase();
  if (
    reqText.includes("invest") ||
    reqText.includes("roi") ||
    reqText.includes("rental") ||
    reqText.includes("commercial") ||
    reqText.includes("shop") ||
    reqText.includes("office") ||
    reqText.includes("plot") ||
    reqText.includes("land")
  ) {
    return "INVESTOR_ROI";
  }

  if (price > 0 && price <= 4500000) {
    return "BUDGET_FIRST_TIME";
  }

  return "FAMILY_END_USER";
}

/**
 * Normalizes property fields across Developer Live Inventory (`Property`) and Owner Submissions (`PropertySubmission`).
 */
function normalizePropertySpecs(property: Property | PropertySubmission | Record<string, any>) {
  const p = property as Record<string, any>;
  const projectName = p.project_name || p.society_name || p.title || "Prime Residence";
  const configuration = p.configuration || p.property_type || "3BHK Flat";
  const location = p.location || "Vadodara";
  const price = toNumber(p.price || p.expected_price || p.expected_rent) ?? 0;
  const isRent =
    p.transaction_type === "RENT" ||
    p.transaction_type === "RENT_OUT" ||
    p.listing_type === "RENT" ||
    p.listing_type === "for rent";
  const carpetArea = toNumber(p.carpet_area_sqft || p.area_sqft || p.built_up_area) ?? 0;
  const furnishing = p.furnishing_status || p.furnishing || "Semi-Furnished";
  const possession = p.possession_status || (p.status === "CONVERTED_TO_INVENTORY" ? "Ready to Move" : "Immediate");
  const ownerName = p.owner_name || null;
  const ownerPhone = p.owner_phone || null;

  return {
    projectName,
    configuration,
    location,
    price,
    isRent,
    carpetArea,
    furnishing,
    possession,
    ownerName,
    ownerPhone,
  };
}

/**
 * Crafts a tailored, psychology-grounded WhatsApp pitch for any property and prospective client.
 */
export function craftPropertyPitch(
  property: Property | PropertySubmission | Record<string, any>,
  lead?: Partial<Lead> | null,
  options: PitchOptions = {}
): PitchResult {
  const specs = normalizePropertySpecs(property);
  const persona: PitchPersona = options.persona || inferBestPersona(lead, specs.price);
  const language: PitchLanguage = options.language || "HINGLISH";
  const format: PitchFormat = options.format || "WHATSAPP_QUICK";
  const agencyName = options.agencyName || "Nextgen Realty";

  const targetPhone = lead?.phone || specs.ownerPhone || null;
  const rawClientName = lead?.name || lead?.first_name || "";
  const clientNameStr = rawClientName
    ? rawClientName.trim()
    : language === "GUJLISH"
    ? "Mitra"
    : language === "ENGLISH"
    ? "Friend"
    : "ji";

  const priceFormatted = specs.isRent
    ? `₹${specs.price.toLocaleString("en-IN")}/month`
    : formatMoney(specs.price);

  const emiVal = !specs.isRent && specs.price > 0 ? calculateApproxMonthlyEmi(specs.price) : 0;
  const emiStr = emiVal > 0 ? `₹${emiVal.toLocaleString("en-IN")}/month` : null;
  const pricePerSqftVal = specs.carpetArea > 0 ? calculatePricePerSqFt(specs.price, specs.carpetArea) : null;
  const rateStr = pricePerSqftVal ? `₹${pricePerSqftVal.toLocaleString("en-IN")}/sq.ft` : null;

  let headline = "";
  let body = "";
  let cta = "";

  // ---------------------------------------------------------------------------
  // 1. FAMILY_END_USER
  // ---------------------------------------------------------------------------
  if (persona === "FAMILY_END_USER") {
    if (language === "GUJLISH") {
      headline = `🏡 *Family mate Best Prime Property in ${specs.location}!*`;
      if (format === "WHATSAPP_QUICK") {
        body =
          `Namaste *${clientNameStr} bhai*! Tamari family requirement mujab *${specs.projectName}* ma ekdam prime *${specs.configuration}* ready option malyo chhe:\n\n` +
          `✨ *Carpet Space:* ${specs.carpetArea ? `${specs.carpetArea} sq.ft` : "Spacious layout"} (Motu hall + balcony sathe)\n` +
          `📍 *Location:* ${specs.location} — Shanti valu vatavaran, schools ane hospitals najik\n` +
          `💰 *Price:* ${priceFormatted}${emiStr ? ` (Est. EMI: ~${emiStr})` : ""}\n` +
          `🛋️ *Condition:* ${specs.possession} · ${specs.furnishing}`;
        cta = `Family sathe rehva mate saras option chhe. Shu ame aa weekend par tamari *VIP Site Visit 🚗* plan kariye?`;
      } else if (format === "PORTFOLIO_DEEP_DIVE") {
        body =
          `Namaste *${clientNameStr} bhai*! ${agencyName} taraf thi verified family residence details share kari rahya chhiye:\n\n` +
          `🏢 *Project:* *${specs.projectName}*, ${specs.location}\n` +
          `📐 *Config & Area:* ${specs.configuration} (${specs.carpetArea ? `${specs.carpetArea} sq.ft carpet` : "well ventilated"})\n` +
          `💰 *Financials:* ${priceFormatted}${rateStr ? ` (${rateStr})` : ""}\n` +
          `💳 *Estimated Monthly EMI:* ${emiStr ? `Approx ${emiStr} (80% loan at 8.5%)` : "Flexible payment plans"}\n` +
          `🌳 *Amenities:* Gated campus, 24x7 security, kids play area, senior citizen park, lift & power backup.\n` +
          `📍 *Locality Advantage:* 5 mins from top English medium schools, grocery markets & hospitals.`;
        cta = `Tame tamari family sathe live layout review karva mango to ame *Saturday sanje 5:00 vage* ke *Sunday savare 11:00 vage* visit arrange kari shakiye. Janavjo! 🙏`;
      } else {
        // URGENT_SCARCITY
        body =
          `Namaste *${clientNameStr} bhai*! *${specs.projectName}* ma aa specific *${specs.configuration}* unit high demand ma chhe ane limited options baki chhe.\n\n` +
          `💰 *Special Value Price:* ${priceFormatted} (Ready to move)\n` +
          `📍 *Prime Tower:* ${specs.location} campus`;
        cta = `Navi price revision pehla visit confirm karva mate call athva reply karo. Weekend VIP slot book kari daie? 🚗`;
      }
    } else if (language === "ENGLISH") {
      headline = `🏡 *Premium Family Residence at ${specs.projectName}, ${specs.location}*`;
      if (format === "WHATSAPP_QUICK") {
        body =
          `Hello *${clientNameStr}*! Curated specifically for family comfort, here is a verified *${specs.configuration}* residence now available in *${specs.location}*:\n\n` +
          `✨ *Carpet Area:* ${specs.carpetArea ? `${specs.carpetArea} sq.ft` : "Generous layout"} of well-ventilated living space\n` +
          `📍 *Prime Address:* ${specs.projectName}, ${specs.location} — peaceful neighborhood close to top schools\n` +
          `💰 *Asking Price:* ${priceFormatted}${emiStr ? ` (Est. EMI: ~${emiStr})` : ""}\n` +
          `🛋️ *Possession:* ${specs.possession} · ${specs.furnishing}`;
        cta = `Would you be open to an exclusive *VIP Site Visit 🚗* this weekend — *Saturday 4:30 PM or Sunday 11:00 AM*?`;
      } else if (format === "PORTFOLIO_DEEP_DIVE") {
        body =
          `Hello *${clientNameStr}*! Detailed specifications for the family-centric residence at *${specs.projectName}*:\n\n` +
          `🏢 *Development:* ${specs.projectName}, ${specs.location}\n` +
          `📐 *Specifications:* ${specs.configuration} (${specs.carpetArea ? `${specs.carpetArea} sq.ft carpet` : "spacious floorplan"})\n` +
          `💰 *Investment Value:* ${priceFormatted}${rateStr ? ` (${rateStr})` : ""}\n` +
          `💳 *Mortgage Estimate:* ${emiStr ? `Approx ${emiStr} (assuming 80% loan at 8.5%)` : "Tailored financing available"}\n` +
          `🛡️ *Campus Highlights:* 24/7 CCTV gated perimeter, landscaped gardens, children play park, covered parking\n` +
          `📍 *Neighborhood Connectivity:* 5 minutes to leading schools, multi-specialty healthcare, and lifestyle shopping.`;
        cta = `Let us coordinate a private guided walkthrough at your convenience. Please reply with your preferred day/time! 🙏`;
      } else {
        body =
          `Hello *${clientNameStr}*! Priority alert: This coveted *${specs.configuration}* at *${specs.projectName}* has just opened up in ${specs.location}.\n\n` +
          `💰 *Opportunity Value:* ${priceFormatted}\n` +
          `✨ *Key USP:* Unobstructed garden-facing layout with immediate possession.`;
        cta = `We recommend viewing before public listing this Sunday. Can we lock in your *VIP Site Visit 🚗* tomorrow?`;
      }
    } else {
      // HINGLISH (Default)
      headline = `🏡 *Exclusive Family Home in ${specs.location}!*`;
      if (format === "WHATSAPP_QUICK") {
        body =
          `Namaste *${clientNameStr} ji*! Aapki family requirement ke mutabiq *${specs.projectName}* me ek prime *${specs.configuration}* unit unlock hua hai:\n\n` +
          `✨ *Carpet Area:* ${specs.carpetArea ? `${specs.carpetArea} sq.ft` : "Spacious layout"} (Open balcony + natural ventilation)\n` +
          `📍 *Location:* ${specs.location} — Peaceful green campus, reputed schools & hospitals 5 mins away\n` +
          `💰 *Demand:* ${priceFormatted}${emiStr ? ` (Est. EMI: ~${emiStr})` : ""}\n` +
          `🛋️ *Status:* ${specs.possession} · ${specs.furnishing}`;
        cta = `Bacchon ke playground aur family comfort ke liye ideal choice hai. Kya hum is weekend iska *VIP Site Visit 🚗* schedule karein — *Saturday 4:30 PM ya Sunday 11:00 AM*?`;
      } else if (format === "PORTFOLIO_DEEP_DIVE") {
        body =
          `Namaste *${clientNameStr} ji*! ${agencyName} ki verified family property details pesh hain:\n\n` +
          `🏢 *Project:* *${specs.projectName}*, ${specs.location}\n` +
          `📐 *Config & Carpet:* ${specs.configuration} (${specs.carpetArea ? `${specs.carpetArea} sq.ft carpet` : "spacious floorplan"})\n` +
          `💰 *Demand Price:* ${priceFormatted}${rateStr ? ` (${rateStr})` : ""}\n` +
          `💳 *Home Loan EMI:* ${emiStr ? `Approx ${emiStr} (80% loan @ 8.5% p.a.)` : "All leading bank loan partners available"}\n` +
          `🌳 *Campus Amenities:* Gated security, dedicated covered parking, landscaped garden, clubhouse & kids area.\n` +
          `📍 *Location Advantage:* Daily essentials, metro/expressway corridor aur reputed schools 5-10 minutes distance par.`;
        cta = `Aap apni family ke sath comfortable time par layout inspect kar sakein, iske liye hum *VIP Site Visit 🚗* kab plan karein — *Kal sham 5:00 PM ya Sunday morning*?`;
      } else {
        // URGENT_SCARCITY
        body =
          `Namaste *${clientNameStr} ji*! *${specs.projectName}* me is layout ka yeh aakhri verified unit bacha hai.\n\n` +
          `💰 *Direct Owner Value:* ${priceFormatted} (Ready to Move)\n` +
          `📍 *Location:* ${specs.location} prime sector\n` +
          `✨ *USP:* Vastu-compliant East facing balcony with open sunlight.`;
        cta = `Is weekend inventory close hone se pehle site visit inspect karne ke liye call ya WhatsApp par confirm karein! 🚗`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. INVESTOR_ROI
  // ---------------------------------------------------------------------------
  else if (persona === "INVESTOR_ROI") {
    const estRent = specs.isRent ? specs.price : Math.round(specs.price * 0.045 / 12);
    const estRentFormatted = `₹${estRent.toLocaleString("en-IN")}/mo`;

    if (language === "GUJLISH") {
      headline = `📈 *High Rental Yield & Capital Appreciation Opportunity!*`;
      body =
        `Namaste *${clientNameStr} bhai*! Real estate investment portfolio mate *${specs.projectName}*, ${specs.location} ma ekdam perfect *${specs.configuration}* listing aavyu chhe:\n\n` +
        `📊 *Rental Potential:* Approx *${estRentFormatted}* consistent rental demand\n` +
        `📍 *Growth Corridor:* ${specs.location} — High growth corridor with booming infrastructure\n` +
        `💰 *Entry Price:* ${priceFormatted}${rateStr ? ` (${rateStr})` : ""}\n` +
        `📋 *Security:* 100% Clear Title · High liquidity zone`;
      cta = `Capital appreciation ane rental return mate best opportunity chhe. Layout ane ROI details share karva mate call arrange kariye? 📞`;
    } else if (language === "ENGLISH") {
      headline = `📈 *High-Yield Investment Opportunity: ${specs.projectName}, ${specs.location}*`;
      body =
        `Hello *${clientNameStr}*! Strategically shortlisted for capital growth and steady passive income:\n\n` +
        `📊 *Rental Forecast:* Est. *${estRentFormatted}* with high tenant occupancy\n` +
        `📍 *Infrastructure Catalyst:* ${specs.location} growth corridor\n` +
        `💰 *Acquisition Cost:* ${priceFormatted}${rateStr ? ` (${rateStr})` : ""}\n` +
        `📋 *Title & Compliance:* RERA certified development · 100% verified legal title`;
      cta = `Ideal for portfolio diversification. When would be a good time for a brief 5-minute briefing call today? 📞`;
    } else {
      // HINGLISH
      headline = `📈 *High-Yield Real Estate Investment Opportunity in ${specs.location}*`;
      body =
        `Namaste *${clientNameStr} ji*! Smart investors ke portfolio ke liye *${specs.projectName}* me ek high-demand *${specs.configuration}* unit shortlist kiya hai:\n\n` +
        `📊 *Rental Potential:* Approx *${estRentFormatted}* continuous tenant demand\n` +
        `📍 *Growth Corridor:* ${specs.location} — upcoming commercial hub aur highway connectivity\n` +
        `💰 *Entry Price:* ${priceFormatted}${rateStr ? ` (${rateStr})` : ""}\n` +
        `📋 *Title Status:* 100% RERA Approved · Clear legal title · High resale liquidity`;
      cta = `Capital appreciation aur secure monthly rental ke liye solid deal hai. Details discuss karne ke liye kya hum *aaj sham 5:30 PM* ek brief call plan karein? 📞`;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. LUXURY_HNW
  // ---------------------------------------------------------------------------
  else if (persona === "LUXURY_HNW") {
    if (language === "GUJLISH") {
      headline = `💎 *Ultra-Exclusive Luxury Living at ${specs.projectName}*`;
      body =
        `Namaste *${clientNameStr} bhai*! Vadodara na elite class lifestyle mate *${specs.projectName}*, ${specs.location} ma exclusive *${specs.configuration}* residence unlock thayu chhe:\n\n` +
        `👑 *Low Density Living:* Exclusive private foyer with dedicated elevators\n` +
        `✨ *Grand Space:* ${specs.carpetArea ? `${specs.carpetArea} sq.ft carpet` : "Expansive floorplan"} with panoramic deck views\n` +
        `📍 *Prestigious Address:* ${specs.location} landmark address\n` +
        `💰 *Investment Value:* ${priceFormatted}`;
      cta = `Limited edition luxury residence chhe. Shu ame aa Friday sanje 5:00 vage tamari *Private Executive Tour 🚗* arrange kariye?`;
    } else if (language === "ENGLISH") {
      headline = `💎 *Signature Luxury Residence at ${specs.projectName}, ${specs.location}*`;
      body =
        `Hello *${clientNameStr}*! Presenting an ultra-luxury *${specs.configuration}* residence crafted for privacy and stature:\n\n` +
        `👑 *Bespoke Exclusivity:* Low-density floor layout with private elevator access\n` +
        `✨ *Expansive Carpet:* ${specs.carpetArea ? `${specs.carpetArea} sq.ft` : "Grand scale"} with double-height viewing deck\n` +
        `📍 *Landmark Address:* ${specs.location} premier neighborhood\n` +
        `💰 *Valuation:* ${priceFormatted}`;
      cta = `This is confidential limited inventory. Would you prefer a *Private VIP Walkthrough 🚗* this Friday or Saturday?`;
    } else {
      // HINGLISH
      headline = `💎 *Ultra-Exclusive Signature Residence at ${specs.projectName}*`;
      body =
        `Namaste *${clientNameStr} ji*! Lifestyle, privacy aur prestige ke highest standard ke liye, pesh hai *${specs.projectName}*, ${specs.location} me ek signature *${specs.configuration}*:\n\n` +
        `👑 *Low-Density Living:* Limited residences per floor with private entry foyer\n` +
        `✨ *Grand Carpet:* ${specs.carpetArea ? `${specs.carpetArea} sq.ft` : "Spacious luxury scale"} with panoramic viewing deck\n` +
        `🚗 *Parking & Club:* Dedicated covered parking bays & luxury lifestyle clubhouse\n` +
        `📍 *Prestigious Address:* ${specs.location} landmark architecture\n` +
        `💰 *Investment Value:* ${priceFormatted}`;
      cta = `Ye exclusive limited inventory hai. Kya hum *Friday sham 5:00 PM ya Saturday subah 11:00 AM* aapki *Private Executive Tour 🚗* plan karein?`;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. BUDGET_FIRST_TIME
  // ---------------------------------------------------------------------------
  else {
    if (language === "GUJLISH") {
      headline = `🏷️ *Bhadu (Rent) Aapvanu Bandh Karo — Potanu Ghar Own Karo!*`;
      body =
        `Namaste *${clientNameStr} bhai*! Have dar mahine bhadu bhari ne paise barbad na karo, jyare tame aasaani thi *${specs.projectName}* ma potanu ghar kharidi shako chho:\n\n` +
        `🏢 *Project:* *${specs.projectName}*, ${specs.location}\n` +
        `💰 *All-Inclusive Price:* ${priceFormatted}\n` +
        `💳 *Estimated Monthly EMI:* Fakt ~${emiStr || "aasan EMI"} (Govt PMAY Subsidy labh sathe)\n` +
        `📍 *Location:* ${specs.location} — Transportation ane markets pagathiya par\n` +
        `🏡 *Possession:* ${specs.possession} (Pehla divas thi bhada no kharcho bachi jashe)`;
      cta = `Bank home loan eligibility ane special booking discount check karva mate shu ame aa weekend site visit plan kariye? 🚗`;
    } else if (language === "ENGLISH") {
      headline = `🏷️ *Stop Paying Rent — Step Into Homeownership in ${specs.location}!*`;
      body =
        `Hello *${clientNameStr}*! Why continue paying escalating rents when you can own your dream *${specs.configuration}* at *${specs.projectName}* for similar monthly outflow:\n\n` +
        `🏢 *Project:* *${specs.projectName}*, ${specs.location}\n` +
        `💰 *All-Inclusive Value:* ${priceFormatted}\n` +
        `💳 *Estimated Monthly EMI:* Just ~${emiStr || "affordable EMI"} (80% loan eligibility)\n` +
        `📍 *Location Advantage:* ${specs.location} — seamlessly connected to major business transit\n` +
        `🏡 *Possession:* ${specs.possession} (Zero waiting period, immediate rent savings)`;
      cta = `Pre-approved banking partners ready for instant processing. Shall we schedule your *VIP Site Visit 🚗* this weekend?`;
    } else {
      // HINGLISH
      headline = `🏷️ *Stop Paying Rent — Own Your ${specs.configuration} in ${specs.location}!*`;
      body =
        `Namaste *${clientNameStr} ji*! Kyu har mahine rent me paise barbad karein jab aap utne hi outflow me *${specs.projectName}* me apna ghar own kar sakte hain:\n\n` +
        `🏢 *Project:* *${specs.projectName}*, ${specs.location}\n` +
        `💰 *All-Inclusive Price:* ${priceFormatted}\n` +
        `💳 *Estimated Monthly EMI:* Just ~${emiStr || "aasan EMI"} (PMAY Subsidy aur leading bank offers available)\n` +
        `📍 *Location:* ${specs.location} — prime connectivity, schools aur transport bilkul paas\n` +
        `🏡 *Possession:* ${specs.possession} (Pehle din se rent ka double burden khatam)`;
      cta = `Bank home loan eligibility aur best festive interest rate offers check karne ke liye humne documents ready rakhe hain. Kya hum site location visit plan karein? 🚗`;
    }
  }

  // Append custom note if provided
  if (options.customNote && options.customNote.trim()) {
    body += `\n\n📝 *Special Note:* ${options.customNote.trim()}`;
  }

  const fullMessage = `${headline}\n\n${body}\n\n${cta}`;
  const waUrl = toWhatsAppUrl(targetPhone, fullMessage);

  return {
    headline,
    body,
    cta,
    fullMessage,
    waUrl,
    estimatedEmi: emiStr,
    estimatedEmiNumber: emiVal,
    pricePerSqFt: pricePerSqftVal,
    persona,
    language,
    format,
  };
}
