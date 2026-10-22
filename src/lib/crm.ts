import { createElement, Fragment, type ReactNode } from "react";
import type { Database } from "@/integrations/supabase/types";

export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["inventory"]["Row"];
export type Activity = Database["public"]["Tables"]["lead_activity"]["Row"];
export type ActivityInsert = Database["public"]["Tables"]["lead_activity"]["Insert"];
export type Executive = Database["public"]["Tables"]["executives"]["Row"];
export type ExecutiveInsert = Database["public"]["Tables"]["executives"]["Insert"];
export type ClientIntegration = Database["public"]["Tables"]["client_integrations"]["Row"];
export type ClientIntegrationInsert = Database["public"]["Tables"]["client_integrations"]["Insert"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type PropertySubmission = Database["public"]["Tables"]["property_submissions"]["Row"];
export type PropertySubmissionInsert = Database["public"]["Tables"]["property_submissions"]["Insert"];
export type PropertySubmissionUpdate = Database["public"]["Tables"]["property_submissions"]["Update"];

export type ExecutiveLite = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  telegram_id?: string | null;
};

/**
 * `leads` and `inventory` support both flat columns (e.g. `first_name`, `state`,
 * `site_visit_at` from the live DB) and hydrated fields used by UI components.
 */
export type Lead = LeadRow & {
  name?: string | null;
  first_name?: string | null;
  status?: string | null;
  state?: string | null;
  site_visit_datetime?: string | null;
  site_visit_at?: string | null;
  source?: string | null;
  property_state?: string | null;
  requirement?: string | null;
  purpose?: string | null;
  timeline?: string | null;
  followup_count?: number | null;
  pre_visit_reminder_sent?: boolean | null;
  post_visit_feedback_sent?: boolean | null;
  sla_response_minutes?: number | null;
  alert_sent_at?: string | null;
  first_human_contact_at?: string | null;
  last_interaction_at?: string | null;
  assigned_executive_name: string | null;
  assigned_executive_email: string | null;
  assigned_executive_phone: string | null;
  assigned_executive_telegram_id: string | null;
  summary: string | null;
  last_message: string | null;
  followup_type: string | null;
  followup_message: string | null;
  selected_property_name: string | null;
  selected_property_price: number | null;
  selected_property_map_url: string | null;
  selected_property_brochure_url: string | null;
  portal_property_id: string | null;
  lead_type?: string | null;
};

export type Property = PropertyRow & {
  assigned_executive_name: string | null;
  assigned_executive_email: string | null;
  assigned_executive_phone: string | null;
  assigned_executive_telegram_id: string | null;
  area_sqft?: number | null;
  stock_type?: string | null;
  listing_type?: string | null;
  furnished_status?: string | null;
  possession_status?: string | null;
  attributes?: Record<string, unknown> | null;
  rera_number?: string | null;
  carpet_area_sqft?: number | null;
  super_built_up_area_sqft?: number | null;
  property_age_years?: number | null;
  transaction_type?: string | null;
  facing?: string | null;
  ownership_type?: string | null;
  price_negotiable?: boolean;
  maintenance_charges?: number | null;
  amenities?: string[];
  image_urls?: string[];
  landmarks?: string[];
  city?: string | null;
};

export type Tone =
  "gray" | "blue" | "purple" | "yellow" | "green" | "red" | "orange" | "indigo" | "teal";

export const PROPERTY_STATE_MAP: Record<string, { label: string; tone: Tone; pulse?: boolean }> = {
  NO_PROPERTY_SEARCHED: { label: "Requirements Pending", tone: "gray" },
  PROPERTY_OPTIONS_SENT: { label: "Options Shared", tone: "blue" },
  PROPERTY_SELECTED: { label: "Property Selected", tone: "purple" },
  SITE_VISIT_INTENT: { label: "Visit Requested", tone: "yellow" },
  SITE_VISIT_BOOKED: { label: "Site Visit Scheduled", tone: "green" },
  HUMAN_HANDOVER: { label: "Action Required", tone: "red", pulse: true },
  NO_MATCHING_PROPERTY: { label: "No Match Found", tone: "orange" },
  DUAL_ROLE_ACTIVE: { label: "Dual Role Active 🌟", tone: "purple" },
  DUAL_ROLE_MENU_PENDING: { label: "Dual Role Menu", tone: "purple" },
};

export const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "Fresh Lead", tone: "gray" },
  FRESH: { label: "Fresh Lead", tone: "gray" },
  QUALIFYING: { label: "In Conversation", tone: "blue" },
  OPTIONS_SENT: { label: "Options Shared", tone: "blue" },
  QUALIFIED: { label: "Qualified Prospect", tone: "indigo" },
  SITE_VISIT_BOOKED: { label: "Site Visit Booked", tone: "green" },
  VISIT_BOOKED: { label: "Site Visit Booked", tone: "green" },
  VISIT_RESCHEDULED: { label: "Visit Rescheduled", tone: "yellow" },
  VISIT_CANCELLED: { label: "Visit Cancelled", tone: "red" },
  VISIT_DONE: { label: "Visit Completed", tone: "teal" },
  VISIT_COMPLETED: { label: "Visit Completed", tone: "teal" },
  SITE_VISIT_DONE: { label: "Visit Completed", tone: "teal" },
  VISIT_MISSED: { label: "Visit Missed", tone: "orange" },
  SITE_VISIT_MISSED: { label: "Visit Missed", tone: "orange" },
  SITE_VISIT_RESCHEDULED: { label: "Visit Rescheduled", tone: "yellow" },
  DEAL_WON: { label: "Deal Won", tone: "teal" },
  COLD: { label: "Gone Cold", tone: "gray" },
  COLD_UNQUALIFIED: { label: "Gone Cold", tone: "gray" },
  NOT_INTERESTED: { label: "Closed/Dropped", tone: "gray" },
  DUAL_ROLE: { label: "Dual: Buyer + Seller 🌟", tone: "purple" },
  DUAL_ROLE_MENU_PENDING: { label: "Dual Role Menu", tone: "purple" },
};

export function isDualRoleLead(lead?: Lead | null): boolean {
  if (!lead) return false;
  if (lead.lead_type === "DUAL_ROLE") return true;
  if (lead.status === "DUAL_ROLE" || lead.status === "DUAL_ROLE_MENU_PENDING") return true;
  if (lead.state === "DUAL_ROLE_MENU_PENDING" || lead.state === "DUAL_ROLE") return true;
  const meta = (lead.metadata as Record<string, unknown> | null) ?? {};
  if (meta.lead_type === "DUAL_ROLE") return true;
  if (meta.has_seller_profile && (meta.has_buyer_profile || lead.property_type || lead.budget)) return true;
  return false;
}

export const PROPERTY_SUBMISSION_STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  PENDING_VERIFICATION: { label: "Pending Verification", tone: "yellow" },
  VERIFIED: { label: "Verified", tone: "blue" },
  CONVERTED_TO_INVENTORY: { label: "Added to Inventory", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
};

export const LEAD_STATUSES = Object.keys(STATUS_MAP);
export const PROPERTY_STATES = Object.keys(PROPERTY_STATE_MAP);

// SHOP/OFFICE/PLOT are configurations, not top-level categories — a
// Property categories and configurations — a property's configuration options
// depend on which category is picked (see CONFIGURATIONS_BY_CATEGORY below).
export const PROPERTY_CATEGORIES = ["FLAT", "VILLA", "COMMERCIAL", "PLOT", "LAND"];
export const CONFIGURATIONS = [
  "1RK",
  "STUDIO_APARTMENT",
  "1BHK",
  "2BHK",
  "3BHK",
  "4BHK",
  "5BHK",
  "PENTHOUSE",
  "DUPLEX",
  "SKY_VILLA",
  "BUNGALOW",
  "ROW_HOUSE",
  "FARM_HOUSE",
  "DUPLEX_VILLA",
  "TRIPLEX",
  "SHOP",
  "SHOWROOM",
  "OFFICE",
  "CO_WORKING_SPACE",
  "STUDIO_OFFICE",
  "RESTAURANT",
  "HOTEL",
  "GUEST_HOUSE",
  "WAREHOUSE",
  "GODOWN",
  "INDUSTRIAL_SHED",
  "FACTORY",
  "PRE_LEASED_PROPERTY",
  "COMMERCIAL_BUILDING",
  "RETAIL_SPACE",
  "RESIDENTIAL_PLOT",
  "COMMERCIAL_PLOT",
  "INDUSTRIAL_PLOT",
  "AGRICULTURAL_LAND",
  "NA_PLOT",
  "FARM_HOUSE_PLOT",
  "PLOT",
];

export const CONFIGURATIONS_BY_CATEGORY: Record<string, string[]> = {
  FLAT: [
    "1RK",
    "STUDIO_APARTMENT",
    "1BHK",
    "2BHK",
    "3BHK",
    "4BHK",
    "5BHK",
    "PENTHOUSE",
    "DUPLEX",
    "SKY_VILLA",
  ],
  VILLA: [
    "2BHK",
    "3BHK",
    "4BHK",
    "5BHK",
    "BUNGALOW",
    "ROW_HOUSE",
    "FARM_HOUSE",
    "DUPLEX_VILLA",
    "TRIPLEX",
  ],
  COMMERCIAL: [
    "SHOP",
    "SHOWROOM",
    "OFFICE",
    "CO_WORKING_SPACE",
    "STUDIO_OFFICE",
    "RESTAURANT",
    "HOTEL",
    "GUEST_HOUSE",
    "WAREHOUSE",
    "GODOWN",
    "INDUSTRIAL_SHED",
    "FACTORY",
    "PRE_LEASED_PROPERTY",
    "COMMERCIAL_BUILDING",
    "RETAIL_SPACE",
  ],
  PLOT: [
    "RESIDENTIAL_PLOT",
    "COMMERCIAL_PLOT",
    "INDUSTRIAL_PLOT",
    "AGRICULTURAL_LAND",
    "NA_PLOT",
    "FARM_HOUSE_PLOT",
    "PLOT",
  ],
  LAND: [
    "AGRICULTURAL_LAND",
    "COMMERCIAL_LAND",
    "INDUSTRIAL_LAND",
    "RESIDENTIAL_LAND",
    "FARM_LAND",
  ],
};

/**
 * Commercial subtypes where furnished_status is not applicable
 * (industrial/storage/raw-space units).
 */
export const COMMERCIAL_NO_FURNISHED = new Set([
  "WAREHOUSE",
  "GODOWN",
  "INDUSTRIAL_SHED",
  "FACTORY",
]);

/**
 * Commercial subtypes where physical dimensions and power supply are
 * relevant (storage/industrial/production spaces).
 */
export const COMMERCIAL_HAS_DIMENSIONS = new Set([
  "SHOP",
  "SHOWROOM",
  "WAREHOUSE",
  "GODOWN",
  "INDUSTRIAL_SHED",
  "FACTORY",
  "RESTAURANT",
  "PRE_LEASED_PROPERTY",
  "RETAIL_SPACE",
  "COMMERCIAL_BUILDING",
]);

export function configurationsForCategory(category: string): string[] {
  return CONFIGURATIONS_BY_CATEGORY[category] ?? CONFIGURATIONS;
}

export const INVENTORY_STATUSES = ["AVAILABLE", "SOLD", "HOLD"];
export const STOCK_TYPES = ["REGULAR", "PREMIUM", "DISTRESS", "BANK_AUCTION", "CLEARANCE"];
export const LISTING_TYPES = ["SALE", "RENT", "LEASE", "PG"];
export const FURNISHED_STATUSES = [
  "UNFURNISHED",
  "SEMI_FURNISHED",
  "FURNISHED",
  "FULLY_FURNISHED",
  "BARE_SHELL",
  "WARM_SHELL",
];
export const TRANSACTION_TYPES = ["NEW_BOOKING", "RESALE", "UNDER_CONSTRUCTION"];
export const POSSESSION_STATUSES = [
  "READY_TO_MOVE",
  "WITHIN_3_MONTHS",
  "WITHIN_6_MONTHS",
  "WITHIN_12_MONTHS",
  "WITHIN_24_MONTHS",
  "UNDER_CONSTRUCTION",
];
export const FACING_OPTIONS = [
  "NORTH",
  "SOUTH",
  "EAST",
  "WEST",
  "NORTH_EAST",
  "NORTH_WEST",
  "SOUTH_EAST",
  "SOUTH_WEST",
];
export const OWNERSHIP_TYPES = [
  "FREEHOLD",
  "LEASEHOLD",
  "COOPERATIVE_SOCIETY",
  "POWER_OF_ATTORNEY",
];
export const AMENITY_OPTIONS = [
  "PARKING",
  "RESERVED_PARKING",
  "VISITOR_PARKING",
  "LIFT",
  "POWER_BACKUP",
  "SECURITY",
  "CCTV",
  "FIRE_SAFETY",
  "GYM",
  "CLUBHOUSE",
  "SWIMMING_POOL",
  "GARDEN",
  "CHILDRENS_PLAY_AREA",
  "GATED_COMMUNITY",
  "GAS_PIPELINE",
  "EV_CHARGING",
  "WATER_STORAGE",
];

/**
 * Commercial units (shops/offices) need a few physical/utility parameters
 * that don't have their own dedicated `inventory` column — they're stored
 * in the free-form `attributes` jsonb column instead. Each entry maps a
 * form field key to the jsonb key it reads/writes and a display label.
 */
export const COMMERCIAL_ATTRIBUTE_FIELDS = [
  { key: "length_ft", label: "Length (ft)" },
  { key: "width_ft", label: "Width (ft)" },
  { key: "height_ft", label: "Height (ft)" },
  { key: "power_supply_kw", label: "Power supply (KW)" },
] as const;

/** Common lead-source portals a client can wire a webhook up for. */
export const INTEGRATION_PROVIDERS = [
  { key: "99acres", label: "99acres" },
  { key: "housing", label: "Housing.com" },
  { key: "magicbricks", label: "MagicBricks" },
  { key: "olx", label: "OLX" },
  { key: "meta", label: "WhatsApp (Meta Cloud API)" },
  { key: "custom", label: "Custom / other" },
] as const;

/** Strip currency symbols and separators, returning a plain number. */
export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(
  value: number | null | undefined,
  opts?: { isRent?: boolean }
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  if (num <= 0) return "₹0";

  const suffix = opts?.isRent ? " /mo" : "";

  if (num >= 10000000) {
    const cr = (num / 10000000).toFixed(2).replace(/\.?0+$/, "");
    return `₹${cr} Cr${suffix}`;
  }
  if (num >= 100000) {
    const l = (num / 100000).toFixed(2).replace(/\.?0+$/, "");
    return `₹${l} L${suffix}`;
  }
  return `₹${num.toLocaleString("en-IN")}${suffix}`;
}

/** Auto-calculates and formats rate per sq.ft (e.g. ₹4,250/sq.ft) */
export function formatRatePerSqft(
  price: number | null | undefined,
  areaSqft: number | null | undefined
): string | null {
  const p = Number(price);
  const a = Number(areaSqft);
  if (!p || !a || p <= 0 || a <= 0) return null;
  const rate = Math.round(p / a);
  return `₹${rate.toLocaleString("en-IN")}/sq.ft`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(d);
}

export const FSM_STATE_EXPLANATIONS: Record<string, string> = {
  // Fresh & Role Selection
  NEW: "Fresh inquiry abhi CRM desk par aayi hai; AI initial qualification greeting send karne ke process mein hai.",
  FRESH: "Fresh inquiry start hui hai; AI ne greeting bhej kar Buyer vs Seller role preference poocha hai.",
  ROLE_SELECTION_PENDING: "Customer se role confirmation ka wait hai — property leni hai (Buy/Rent) ya list karni hai (Sell/Rent Out).",
  DUAL_ROLE_MENU_PENDING: "Dual-Role customer ko VIP menu (Site Visit update, Listed Property status, Nayi search) bhej kar response ka wait kiya ja raha hai.",

  // Buyer Qualification & Options
  QUALIFYING: "Requirement gathering in progress. Property configuration, budget, ya location details gather kiye ja rahe hain.",
  OPTIONS_SENT: "Top matching verified inventory cards customer ko share kar di gayi hain. Customer se option select karne ya VIP Site Visit date/time ka wait hai.",
  CRITERIA_CONFIRMATION_PENDING: "Lead ne re-engage kiya hai; AI purana search criteria confirm karke fresh matching options unlock karne ka wait kar raha hai.",
  VISIT_REQUESTED: "Customer ne VIP Site Visit attend karne mein interest express kiya hai; date/time slot confirmation pending hai.",

  // Site Visits
  SITE_VISIT_BOOKED: "VIP Site Visit confirm ho chuki hai. Location map pin send kiya gaya hai aur site advisor coordination active hai.",
  VISIT_BOOKED: "VIP Site Visit confirm ho chuki hai. Pre-visit reminder aur briefing cycle active hai.",
  VISIT_RESCHEDULED: "Site visit nayi date aur time par reschedule ki gayi hai. Customer ko updated briefing send ho chuki hai.",
  SITE_VISIT_RESCHEDULED: "Site visit successfully reschedule ho chuki hai. Fresh calendar invite coordinate ho raha hai.",
  VISIT_CANCELLED: "Customer ne visit cancel ki hai. Alternate convenient dates ya fresh matching options pitch kiye ja rahe hain.",
  SITE_VISIT_DONE: "Customer ne VIP Site Visit attend kar li hai! AI post-visit feedback, spot token booking offers, aur home loan drips chala raha hai.",
  VISIT_DONE: "Site visit successfully attend ho chuki hai. Lead high-intent post-visit closing cadence mein hai.",
  VISIT_COMPLETED: "Site visit successfully complete ho chuki hai.",
  VISIT_MISSED: "Customer scheduled timing par visit attend nahi kar paaya. AI empathetic reschedule loop bhej raha hai; senior rep callback required.",
  SITE_VISIT_MISSED: "Site visit miss ho gayi hai. Priority reschedule follow-up active hai.",

  // Owner Intake State Machine (All 9 steps)
  OWNER_CONFIG_PENDING: "Property Listing shuru hui hai — configuration (Flat, Villa, Commercial Office, Shop, Plot) specify karne ka wait hai.",
  OWNER_SOCIETY_PENDING: "Configuration mil gayi hai — Society, Project, Commercial Hub ya Road name receive hona baaki hai.",
  OWNER_LOCATION_PENDING: "Society name mil chuka hai — locality / prime area confirm karne ka step chal raha hai.",
  OWNER_AREA_PENDING: "Area details (Carpet sq.ft ya Built-up area) enter karne ka wait hai.",
  OWNER_SIZE_PENDING: "Property size / plot area sq.ft enter karne ka wait hai.",
  OWNER_PRICE_PENDING: "Owner se expected selling price (demand) ya monthly rent quote gather kiya ja raha hai.",
  OWNER_POSSESSION_PENDING: "Possession status (Ready to Move ya Under Construction) confirm hona baaki hai.",
  OWNER_FURNISHING_PENDING: "Furnishing status (Fully Furnished, Semi-Furnished, Unfurnished) select karne ka wait hai.",
  OWNER_PHONE_PENDING: "Direct calling number verify kiya ja raha hai taaki acquisition team connect kar sake.",
  OWNER_DETAILS_GATHERED: "Owner listing 100% complete ho chuki hai! Sabhi documents & property details Admin desk par verification ke liye submit hain.",
  OWNER_COMPLETED: "Property submission verified queue mein submit ho chuki hai.",

  // Closing & Drop States
  NEGOTIATING: "Price sheet aur developer token discount negotiation chal rahi hai. Senior rep closing intervention required.",
  DEAL_WON: "Deal successfully close ho chuki hai! 🎉 Token booking / agreement paperwork stage active hai.",
  NOT_INTERESTED: "Lead ne filhaal continue karne se mana kiya hai; bot automation pause kar diya gaya hai.",
  DROPPED: "Lead drop/close ho chuka hai. Re-engagement drip schedule ke liye archived hai.",
  COLD: "Inactivity ki wajah se lead cold stage par hai; periodic re-activation drips active hain.",
};

/**
 * Builds a multi-persona Hinglish AI conversation summary as structured JSX from lead data,
 * metadata drafts, and property submissions.
 * Accurately represents Owners/Sellers, Buyers, and Dual-Role clients with an exhaustive FSM state matrix.
 */
export function buildLeadSummary(lead: Lead, submissions?: PropertySubmission[]): ReactNode {
  const div = (className: string, ...children: (ReactNode | string | null | undefined | false)[]) =>
    createElement("div", { className }, ...children.filter((c) => c !== false && c !== null && c !== undefined));
  const p = (className: string, ...children: (ReactNode | string | null | undefined | false)[]) =>
    createElement("p", { className }, ...children.filter((c) => c !== false && c !== null && c !== undefined));
  const span = (className: string, ...children: (ReactNode | string | null | undefined | false)[]) =>
    createElement("span", { className }, ...children.filter((c) => c !== false && c !== null && c !== undefined));
  const b = (text: ReactNode) => createElement("strong", { className: "font-semibold text-foreground" }, text);

  const firstName = lead.first_name || lead.name?.trim().split(" ")[0] || "Client";
  const meta = (lead.metadata as Record<string, any> | null) ?? {};
  const ownerDraft = (meta.owner_draft as Record<string, any> | null) ?? null;
  const primarySub = submissions && submissions.length > 0 ? submissions[0] : null;

  // Resolve listed property attributes
  const listedPropType = primarySub?.configuration || primarySub?.property_type || ownerDraft?.configuration || ownerDraft?.property_type || null;
  const listedProject = primarySub?.society_name || primarySub?.project_name || ownerDraft?.society_name || ownerDraft?.project_name || null;
  const listedLoc = primarySub?.location || ownerDraft?.location || null;
  const listedArea = Number(primarySub?.carpet_area_sqft || primarySub?.super_built_up_sqft || ownerDraft?.carpet_area_sqft || ownerDraft?.super_built_up_sqft || 0);
  const isCarpet = Boolean(primarySub?.carpet_area_sqft || ownerDraft?.carpet_area_sqft);
  const listedDemand = Number(primarySub?.expected_price || primarySub?.expected_rent || ownerDraft?.expected_price || ownerDraft?.expected_rent || 0);
  const listedTxType = primarySub?.transaction_type || ownerDraft?.transaction_type || (primarySub?.expected_rent ? "RENT" : "SELL");
  const isRent = listedTxType === "RENT" || listedTxType === "RENT_OUT" || Boolean(primarySub?.expected_rent);
  const listedPossession = primarySub?.possession_status || ownerDraft?.possession_status || null;
  const listedFurnishing = primarySub?.furnishing_status || ownerDraft?.furnishing_status || null;
  const subStatus = primarySub?.status || (ownerDraft ? "PENDING_VERIFICATION" : null);

  // Status badge label & tone for listed property
  let reviewBadgeLabel = "Under Review";
  let reviewBadgeClass = "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  if (subStatus === "CONVERTED_TO_INVENTORY" || subStatus === "VERIFIED") {
    reviewBadgeLabel = "Verified / In Inventory";
    reviewBadgeClass = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  } else if (subStatus === "REJECTED") {
    reviewBadgeLabel = "Rejected";
    reviewBadgeClass = "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  } else if (subStatus === "PENDING_VERIFICATION") {
    reviewBadgeLabel = "Pending Verification";
    reviewBadgeClass = "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  }

  // Resolve buyer attributes
  const buyerPropType = lead.property_type ? lead.property_type.replace(/_/g, " ") : null;
  const buyerReqLabel = lead.requirement === "BUY" ? "kharidna chahte hain" : lead.requirement === "RENT" ? "rent par lena chahte hain" : "dekh rahe hain";
  const buyerLoc = lead.location || null;
  const buyerBudget = lead.budget && lead.budget > 0 ? Number(lead.budget) : null;
  const purposeLabel = lead.purpose === "INVESTMENT" ? "Investment" : lead.purpose === "SELF_USE" ? "Self-use" : null;
  const timelineLabel = lead.timeline || null;
  const shortlistedProp = lead.selected_property_name || null;

  const visitTime = (() => {
    const raw = lead.site_visit_datetime || lead.site_visit_at;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(d);
  })();

  // Persona Detection
  const hasListedProperty = Boolean(listedPropType || listedProject || primarySub || ownerDraft || meta.has_seller_profile);
  const hasBuyerInterest = Boolean(buyerPropType || buyerBudget || lead.requirement === "BUY" || lead.requirement === "RENT" || visitTime || meta.has_buyer_profile);

  const isDual = isDualRoleLead(lead) || lead.lead_type === "DUAL_ROLE" || (hasListedProperty && hasBuyerInterest);
  const isPureOwner = !isDual && (lead.lead_type === "PROVIDER" || String(lead.state || "").startsWith("OWNER_") || (hasListedProperty && !hasBuyerInterest));

  // Resolve FSM state explanation
  const rawState = String(lead.state || lead.status || "NEW").toUpperCase();
  const stateExplanation = FSM_STATE_EXPLANATIONS[rawState] || FSM_STATE_EXPLANATIONS[String(lead.status || "").toUpperCase()] || "Conversation active hai; AI customer requirements ke sath coordinate kar raha hai.";
  const stateLabel = (STATUS_MAP[rawState] || PROPERTY_STATE_MAP[rawState])?.label || rawState.replace(/_/g, " ");

  const followupText = (lead.followup_count && lead.followup_count > 0)
    ? ` (AI ne ${lead.followup_count} automated follow-up send kiye hain)`
    : "";

  // 1. DUAL-ROLE CLIENT BRIEFING
  if (isDual) {
    return div(
      "space-y-2.5",
      div(
        "flex items-center justify-between text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-500/15 border border-purple-500/30 px-3 py-1.5 rounded-xl shadow-2xs",
        span("flex items-center gap-1.5", "🌟", b("Dual-Role Client (Buyer + Seller)")),
        span("text-[10px] font-bold opacity-90", "High Value Opportunity")
      ),
      div(
        "rounded-xl bg-card border border-border/70 p-3 space-y-1.5 text-xs shadow-2xs",
        div(
          "flex items-center justify-between font-semibold text-foreground",
          span("flex items-center gap-1.5", "📋", b("Listed Property (Seller Side)")),
          span(`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${reviewBadgeClass}`, reviewBadgeLabel)
        ),
        p(
          "text-foreground/90 leading-relaxed font-normal",
          b(firstName), " ji ne ",
          b(listedPropType || "Property"),
          listedProject ? ` in ${listedProject}` : "",
          listedLoc ? `, ${listedLoc}` : "",
          " list kiya hai",
          listedArea > 0 ? `. Size: ${listedArea} sq.ft ${isCarpet ? "Carpet" : "Area"}` : "",
          listedDemand > 0 ? `. Expected ${isRent ? "Rent" : "Demand"}: ${formatMoney(listedDemand)}` : "",
          listedPossession ? `. ${listedPossession.replace(/_/g, " ")}` : "",
          listedFurnishing ? `. ${listedFurnishing.replace(/_/g, " ")}` : "",
          "."
        )
      ),
      div(
        "rounded-xl bg-card border border-border/70 p-3 space-y-1.5 text-xs shadow-2xs",
        div("flex items-center gap-1.5 font-semibold text-foreground", "🏡", b("Property Search (Buyer Side)")),
        p(
          "text-foreground/90 leading-relaxed font-normal",
          b(firstName), " ji ",
          buyerPropType ? `${buyerPropType} ` : "property ",
          buyerReqLabel,
          buyerLoc ? `, ${buyerLoc} mein` : "",
          buyerBudget ? `, budget ${formatMoney(buyerBudget)}` : "",
          purposeLabel ? `. ${purposeLabel} ke liye` : "",
          timelineLabel ? `, timeline ${timelineLabel}` : "",
          shortlistedProp ? `. Shortlist: ${shortlistedProp}` : "",
          visitTime ? `. VIP Site Visit: ${visitTime}` : "",
          "."
        )
      ),
      div(
        "rounded-xl bg-blue-500/10 border border-blue-500/25 p-2.5 text-xs space-y-1 shadow-2xs",
        div(
          "flex items-center justify-between text-blue-700 dark:text-blue-300 font-bold text-[11px]",
          span("flex items-center gap-1", "⚡", b(`Current Stage: ${stateLabel}`)),
          followupText ? span("text-[10px] font-medium opacity-85", followupText) : null
        ),
        p("text-foreground/80 leading-relaxed text-[11px] font-medium", stateExplanation)
      )
    );
  }

  // 2. PURE OWNER / SELLER BRIEFING
  if (isPureOwner) {
    return div(
      "space-y-2.5",
      div(
        "flex items-center justify-between text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-xl shadow-2xs",
        span("flex items-center gap-1.5", "📋", b("Property Owner / Seller Inquiry")),
        span(`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${reviewBadgeClass}`, reviewBadgeLabel)
      ),
      div(
        "rounded-xl bg-card border border-border/70 p-3 space-y-1.5 text-xs shadow-2xs",
        div("font-semibold text-foreground", b("Property Offering Details")),
        p(
          "text-foreground/90 leading-relaxed font-normal",
          b(firstName), " ji apni property ",
          b(isRent ? "Rent par dena" : "Bechna"), " chahte hain: ",
          b(listedPropType || "Property"),
          listedProject ? ` in ${listedProject}` : "",
          listedLoc ? `, ${listedLoc}` : "",
          listedArea > 0 ? `. Area: ${listedArea} sq.ft ${isCarpet ? "Carpet" : ""}` : "",
          listedDemand > 0 ? `. Expected ${isRent ? "Rent" : "Price"}: ${formatMoney(listedDemand)}` : "",
          listedPossession ? `. ${listedPossession.replace(/_/g, " ")}` : "",
          listedFurnishing ? `. ${listedFurnishing.replace(/_/g, " ")}` : "",
          "."
        )
      ),
      div(
        "rounded-xl bg-blue-500/10 border border-blue-500/25 p-2.5 text-xs space-y-1 shadow-2xs",
        div(
          "flex items-center justify-between text-blue-700 dark:text-blue-300 font-bold text-[11px]",
          span("flex items-center gap-1", "⚡", b(`Intake Status: ${stateLabel}`)),
          followupText ? span("text-[10px] font-medium opacity-85", followupText) : null
        ),
        p("text-foreground/80 leading-relaxed text-[11px] font-medium", stateExplanation)
      )
    );
  }

  // 3. PURE BUYER / SEEKER BRIEFING
  return div(
    "space-y-2.5",
    div(
      "rounded-xl bg-card border border-border/70 p-3 space-y-1.5 text-xs shadow-2xs",
      div("font-semibold text-foreground flex items-center gap-1.5", "🎯", b("Buyer Requirement")),
      p(
        "text-foreground/90 leading-relaxed font-normal",
        b(firstName), " ji ek ",
        b(buyerPropType || "property"), " ",
        buyerReqLabel,
        buyerLoc ? `, ${buyerLoc} mein` : "",
        buyerBudget ? `, budget ${formatMoney(buyerBudget)} ke saath` : "",
        purposeLabel ? `. ${purposeLabel} ke liye` : "",
        timelineLabel ? `, timeline ${timelineLabel}` : "",
        shortlistedProp ? `. ${shortlistedProp} shortlist mein hai` : "",
        visitTime ? `. Site visit ${visitTime} ke liye scheduled hai` : "",
        "."
      )
    ),
    div(
      "rounded-xl bg-blue-500/10 border border-blue-500/25 p-2.5 text-xs space-y-1 shadow-2xs",
      div(
        "flex items-center justify-between text-blue-700 dark:text-blue-300 font-bold text-[11px]",
        span("flex items-center gap-1", "⚡", b(`Current Stage: ${stateLabel}`)),
        followupText ? span("text-[10px] font-medium opacity-85", followupText) : null
      ),
      p("text-foreground/80 leading-relaxed text-[11px] font-medium", stateExplanation)
    )
  );
}

export function isValidUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalizes phone numbers for WhatsApp (`wa.me`) links.
 * Automatically prepends India (+91) country code for 10-digit mobile numbers
 * to prevent WhatsApp from misidentifying them as Iran (+98) or other foreign dial codes.
 */
export function toWhatsAppUrl(phone?: string | null, text?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return null;

  // If standard 10-digit Indian phone (e.g. 9820144821), prepend 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }

  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export type DatePreset = "today" | "tomorrow" | "all";

export function inDatePreset(iso: string | null, preset: DatePreset): boolean {
  if (preset === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  const ref = new Date();
  if (preset === "tomorrow") ref.setDate(ref.getDate() + 1);
  return d.toDateString() === ref.toDateString();
}

/**
 * Frozen response time in minutes. Once the executive acts, the duration is
 * stored on the lead and never recalculated against the current clock.
 */
export function responseMinutes(lead: Lead): number | null {
  if (typeof lead.sla_response_minutes === "number") return lead.sla_response_minutes;
  const end = lead.first_human_contact_at ?? lead.updated_at;
  if (!lead.alert_sent_at || !end) return null;
  const diff = (new Date(end).getTime() - new Date(lead.alert_sent_at).getTime()) / 60000;
  return diff >= 0 ? Math.round(diff) : null;
}

/** Values to persist when an executive responds: freezes SLA and clears the alert. */
export function contactResolution(lead: Lead): Partial<Lead> {
  const now = new Date().toISOString();
  const frozen =
    typeof lead.sla_response_minutes === "number"
      ? lead.sla_response_minutes
      : lead.alert_sent_at
        ? Math.max(0, Math.round((Date.now() - new Date(lead.alert_sent_at).getTime()) / 60000))
        : null;
  return {
    alert_sent_at: null,
    first_human_contact_at: lead.first_human_contact_at ?? now,
    // Always stamp last_interaction_at — the n8n drip cadence (DRIP_DAY_1/3/7/14/30)
    // and the 4-hour anti-spam gap both read this field. Without it the bot keeps
    // firing against leads the executive just acted on.
    last_interaction_at: now,
    ...(frozen !== null ? { sla_response_minutes: frozen } : {}),
    ...(lead.property_state === "HUMAN_HANDOVER"
      ? {
          property_state: lead.selected_property_name
            ? "PROPERTY_SELECTED"
            : "NO_PROPERTY_SEARCHED",
        }
      : {}),
  };
}

export function isUnattendedHotAlert(lead: Lead): boolean {
  if (!lead.alert_sent_at || lead.first_human_contact_at) return false;
  return (Date.now() - new Date(lead.alert_sent_at).getTime()) / 60000 > 30;
}

/** Formats a minute value as "Xh Ym" when ≥ 60 min, otherwise "X min". */
export function formatMinutes(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function slaTone(mins: number | null): Tone {
  if (mins === null) return "red";
  if (mins < 15) return "green";
  if (mins <= 30) return "yellow";
  return "red";
}

export const SALE_BUDGET_TIERS = [
  { key: "luxury", label: "Luxury & HNW", hint: "₹1.75 Cr+", min: 17500000, max: Infinity, tone: "purple" as const },
  { key: "premium", label: "Premium", hint: "₹90 L – ₹1.75 Cr", min: 9000000, max: 17500000, tone: "indigo" as const },
  { key: "mid", label: "Mid-Segment", hint: "₹45 L – ₹90 L", min: 4500000, max: 9000000, tone: "blue" as const },
  { key: "affordable", label: "Affordable", hint: "Under ₹45 L", min: 0, max: 4500000, tone: "teal" as const },
] as const;

export const RENT_BUDGET_TIERS = [
  { key: "luxury_rent", label: "Luxury / Commercial", hint: "₹75K+ /mo", min: 75000, max: Infinity, tone: "purple" as const },
  { key: "premium_rent", label: "Executive Rental", hint: "₹35K – ₹75K /mo", min: 35000, max: 75000, tone: "indigo" as const },
  { key: "mid_rent", label: "Family Rental", hint: "₹15K – ₹35K /mo", min: 15000, max: 35000, tone: "blue" as const },
  { key: "budget_rent", label: "Budget Rental", hint: "Under ₹15K /mo", min: 0, max: 15000, tone: "teal" as const },
] as const;

export const BUDGET_TIERS = SALE_BUDGET_TIERS;

/* ------------------------------------------------------------------ */
/* Hydration — merge normalized executive_id / metadata jsonb columns  */
/* into the flat, display-friendly shape the UI was built around.      */
/* ------------------------------------------------------------------ */

function metaStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v ? v : null;
}

function metaNum(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  if (typeof v === "number") return v;
  return toNumber(v as never);
}

export function isVisitBookedStatus(status?: string | null): boolean {
  return (
    status === "SITE_VISIT_BOOKED" ||
    status === "VISIT_BOOKED" ||
    status === "VISIT_RESCHEDULED" ||
    status === "SITE_VISIT_RESCHEDULED"
  );
}

export function isVisitDoneStatus(status?: string | null): boolean {
  return (
    status === "VISIT_DONE" ||
    status === "VISIT_COMPLETED" ||
    status === "SITE_VISIT_DONE"
  );
}

export function hydrateLead(
  row: LeadRow,
  executivesById: Map<string, ExecutiveLite>,
  inventoryById?: Map<string, { project_name: string; price: number; map_url?: string }>,
): Lead {
  const raw = row as Record<string, unknown>;
  const meta = ((raw.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const exec = row.assigned_executive_id
    ? executivesById.get(row.assigned_executive_id)
    : undefined;
  const matchedProp = row.selected_property_id && inventoryById
    ? inventoryById.get(row.selected_property_id)
    : undefined;

  const firstName = (raw.first_name as string) || (raw.name as string)?.split(" ")[0] || "Lead";
  const name = (raw.name as string) || (raw.first_name as string) || "Lead";
  let status = (raw.status as string) || (raw.state as string) || "NEW";
  // Normalize canonical synonyms so all components and metrics work seamlessly:
  if (status === "VISIT_BOOKED") status = "SITE_VISIT_BOOKED";
  if (status === "VISIT_COMPLETED" || status === "SITE_VISIT_DONE") status = "VISIT_DONE";
  if (status === "SITE_VISIT_MISSED") status = "VISIT_MISSED";
  if (status === "SITE_VISIT_RESCHEDULED") status = "VISIT_RESCHEDULED";
  if (status === "FRESH") status = "NEW";
  if (status === "COLD_UNQUALIFIED") status = "COLD";

  const siteVisitDate =
    (raw.site_visit_datetime as string) || (raw.site_visit_at as string) || null;

  return {
    ...row,
    name,
    first_name: firstName,
    status,
    state: (raw.state as string) || status,
    pre_visit_reminder_sent: (raw.pre_visit_reminder_sent as boolean) ?? false,
    post_visit_feedback_sent: (raw.post_visit_feedback_sent as boolean) ?? false,
    property_state:
      metaStr(meta, "property_state") ||
      (raw.property_state as string) ||
      (status === "SITE_VISIT_BOOKED" ? "SITE_VISIT_BOOKED" : null),
    first_human_contact_at:
      metaStr(meta, "first_human_contact_at") || (raw.first_human_contact_at as string) || null,
    sla_response_minutes:
      metaNum(meta, "sla_response_minutes") ?? (raw.sla_response_minutes as number) ?? null,
    source: metaStr(meta, "source") || (raw.source as string) || "WhatsApp",
    site_visit_datetime: siteVisitDate,
    site_visit_at: siteVisitDate,
    assigned_executive_name: exec?.name ?? (raw.assigned_executive_name as string) ?? null,
    assigned_executive_email: exec?.email ?? null,
    assigned_executive_phone: exec?.phone ?? null,
    assigned_executive_telegram_id: exec?.telegram_id ?? null,
    summary:
      metaStr(meta, "summary") ||
      `${firstName} (${(raw.user_language as string) || "GUJLISH"}) - ${(raw.property_type as string) || "Property"} in ${(raw.location as string) || "Vadodara"}`,
    last_message: metaStr(meta, "last_message"),
    followup_type: metaStr(meta, "followup_type"),
    followup_message: metaStr(meta, "followup_message"),
    selected_property_name:
      metaStr(meta, "selected_property_name") ||
      matchedProp?.project_name ||
      (raw.selected_property_id as string) ||
      null,
    selected_property_price:
      metaNum(meta, "selected_property_price") ||
      matchedProp?.price ||
      (raw.budget as number) ||
      null,
    selected_property_map_url:
      metaStr(meta, "selected_property_map_url") || matchedProp?.map_url || null,
    selected_property_brochure_url: metaStr(meta, "selected_property_brochure_url"),
    portal_property_id: metaStr(meta, "portal_property_id"),
    lead_type:
      metaStr(meta, "lead_type") ||
      (raw.lead_type as string) ||
      (status === "DUAL_ROLE" || status === "DUAL_ROLE_MENU_PENDING" ? "DUAL_ROLE" : null),
  };
}

export function hydrateProperty(
  row: PropertyRow,
  executivesById: Map<string, ExecutiveLite>,
): Property {
  const raw = row as Record<string, unknown>;
  const exec = row.assigned_executive_id
    ? executivesById.get(row.assigned_executive_id)
    : undefined;
  return {
    ...row,
    image_urls: (raw.image_urls as string[]) || (raw.image_url ? [raw.image_url as string] : []),
    amenities: (raw.amenities as string[]) || [],
    attributes: (raw.attributes as Record<string, unknown>) || {},
    assigned_executive_name: exec?.name ?? null,
    assigned_executive_email: exec?.email ?? null,
    assigned_executive_phone: exec?.phone ?? null,
    assigned_executive_telegram_id: exec?.telegram_id ?? null,
  };
}

/** Lead fields that are actually stored inside `metadata`, not as columns. */
const METADATA_LEAD_FIELDS = new Set<string>([
  "summary",
  "last_message",
  "followup_type",
  "followup_message",
  "selected_property_name",
  "selected_property_price",
  "selected_property_map_url",
  "selected_property_brochure_url",
  "portal_property_id",
]);

/**
 * Split a partial hydrated-`Lead` update into the real columns to persist
 * directly and the keys that need to be merged into the `metadata` jsonb
 * column instead.
 */
export function splitLeadUpdate(values: Partial<Lead>): {
  columns: Record<string, unknown>;
  metadataPatch: Record<string, unknown>;
} {
  const columns: Record<string, unknown> = {};
  const metadataPatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (METADATA_LEAD_FIELDS.has(key)) metadataPatch[key] = value;
    else columns[key] = value;
  }
  // Sync live database column names
  if (columns.status && !columns.state) columns.state = columns.status;
  if (columns.state && !columns.status) columns.status = columns.state;
  if (columns.site_visit_datetime && !columns.site_visit_at)
    columns.site_visit_at = columns.site_visit_datetime;
  if (columns.name && !columns.first_name) columns.first_name = columns.name;
  return { columns, metadataPatch };
}

/* ------------------------------------------------------------------ */
/* Activity history                                                    */
/* ------------------------------------------------------------------ */

export const ACTION_LABELS: Record<string, { label: string; tone: Tone }> = {
  TAKEOVER: { label: "Took over chat", tone: "purple" },
  CONTACTED: { label: "Marked contacted", tone: "green" },
  CALL_NOT_ANSWERED: { label: "Call not answered", tone: "orange" },
  VISIT_BOOKED: { label: "Booked site visit", tone: "blue" },
  SITE_VISIT_BOOKED: { label: "Booked site visit", tone: "blue" },
  SITE_VISIT_RESCHEDULED: { label: "Rescheduled visit", tone: "yellow" },
  RESCHEDULE_VISIT: { label: "Rescheduled visit", tone: "yellow" },
  SITE_VISIT_CANCELLED: { label: "Cancelled site visit", tone: "red" },
  CANCEL_VISIT: { label: "Cancelled site visit", tone: "red" },
  VISIT_DONE: { label: "Marked visit done", tone: "teal" },
  VISIT_COMPLETED: { label: "Visit completed", tone: "teal" },
  VISIT_MISSED: { label: "Marked visit missed", tone: "orange" },
  OPTIONS_SHARED: { label: "Shared property options", tone: "blue" },
  OPTIONS_SENT: { label: "Shared property options", tone: "blue" },
  DEAL_WON: { label: "Marked deal won", tone: "teal" },
  LEAD_DROPPED: { label: "Dropped lead", tone: "red" },
  LEAD_REVERTED: { label: "Reverted lead", tone: "indigo" },
  PROFILE_UPDATED: { label: "Updated lead profile", tone: "indigo" },
  BOT_TOGGLED: { label: "Changed AI bot", tone: "gray" },
  NOTE_ADDED: { label: "Added notes", tone: "yellow" },
  MESSAGE_PROCESSED: { label: "Message processed", tone: "indigo" },
  POST_VISIT_FEEDBACK_SENT: { label: "Feedback survey sent", tone: "teal" },
  NO_PROPERTY_MATCH: { label: "No property match", tone: "orange" },
  PASSIVE_ACK_SILENCED: { label: "Closing acknowledged", tone: "gray" },
  NEGOTIATION_REQUEST: { label: "Price negotiation", tone: "yellow" },
  BROCHURE_REQUEST: { label: "Brochure shared", tone: "indigo" },
  MAP_REQUEST: { label: "Map location shared", tone: "indigo" },
};

export function actionLabel(action: string | null): string {
  if (!action) return "Action";
  return ACTION_LABELS[action]?.label ?? action;
}

/* ------------------------------------------------------------------ */
/* AI activity & follow-up snapshot                                    */
/* ------------------------------------------------------------------ */

export type AiActivityEvent = {
  key: string;
  label: string;
  detail?: string | null;
  /** Only set when a real timestamp exists on the lead for this milestone. */
  timestamp?: string | null;
  tone: Tone;
  done: boolean;
};

/**
 * Reconstructs "what has the AI/automation done on this lead" from the
 * columns the n8n workflow itself writes on `leads`. There is no separate
 * historical event log for bot-driven actions — n8n writes straight to
 * Supabase, bypassing `lead_activity` (which only records executive/admin
 * actions taken from this dashboard) — so this is a snapshot of current
 * state, not a replay of every message. Timestamps are shown only where a
 * real one is stored; milestones without one just show as done/pending.
 */
export function buildAiActivity(lead: Lead): AiActivityEvent[] {
  const events: AiActivityEvent[] = [];

  events.push({
    key: "captured",
    label: "Lead captured",
    detail: lead.source ? `via ${lead.source}` : null,
    timestamp: lead.created_at,
    tone: "blue",
    done: true,
  });

  const qualified = !!(
    lead.requirement &&
    lead.property_type &&
    lead.location &&
    lead.budget &&
    lead.purpose &&
    lead.timeline
  );
  events.push({
    key: "qualified",
    label: "Requirements qualified",
    detail: qualified
      ? [lead.property_type, lead.location, formatMoney(lead.budget)].filter(Boolean).join(" · ")
      : "Still collecting requirement, location, budget, purpose or timeline",
    tone: "indigo",
    done: qualified,
  });

  let sharedNames: string[] = [];
  const rawOptions: unknown = lead.last_option_ids;
  if (Array.isArray(rawOptions)) {
    sharedNames = rawOptions
      .map((o) =>
        o && typeof o === "object" ? (o as Record<string, unknown>)["property_name"] : null,
      )
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  events.push({
    key: "options_shared",
    label: "Property options shared",
    detail: sharedNames.length ? sharedNames.join(", ") : "No options sent yet",
    tone: "blue",
    done: sharedNames.length > 0,
  });

  events.push({
    key: "property_selected",
    label: "Property selected",
    detail: lead.selected_property_name
      ? [lead.selected_property_name, formatMoney(lead.selected_property_price)]
          .filter(Boolean)
          .join(" · ")
      : "No property selected yet",
    tone: "purple",
    done: !!lead.selected_property_name,
  });

  events.push({
    key: "visit_booked",
    label: "Site visit booked",
    detail: lead.site_visit_datetime
      ? null
      : "Not booked yet",
    timestamp: lead.site_visit_datetime,
    tone: "green",
    done: !!lead.site_visit_datetime,
  });

  const visitTime = lead.site_visit_datetime ? new Date(lead.site_visit_datetime) : null;
  const visitIsFuture = !!visitTime && !Number.isNaN(visitTime.getTime()) && visitTime > new Date();
  const preReminderSent = !!lead.pre_visit_reminder_sent;
  const postFeedbackSent = !!lead.post_visit_feedback_sent;

  events.push({
    key: "pre_visit_reminder",
    label: "Pre-visit reminder",
    detail: preReminderSent
      ? "1-hour pre-visit reminder delivered with site map"
      : !lead.site_visit_datetime
        ? "No visit booked yet"
        : visitIsFuture
          ? lead.bot_active
            ? "Will be sent automatically 1 hour before visit"
            : "Bot is paused — won't be sent automatically"
          : "Visit date has passed",
    tone: preReminderSent ? "green" : "yellow",
    done: preReminderSent || (!!lead.site_visit_datetime && !visitIsFuture),
  });

  events.push({
    key: "post_visit_feedback",
    label: "Post-visit feedback survey",
    detail: postFeedbackSent
      ? "1-hour post-visit feedback survey delivered"
      : !lead.site_visit_datetime
        ? "No visit booked yet"
        : visitIsFuture
          ? "Scheduled 1 hour after visit completes"
          : "Pending post-visit feedback survey",
    tone: postFeedbackSent ? "teal" : "blue",
    done: postFeedbackSent,
  });

  events.push({
    key: "visit_outcome",
    label:
      lead.status === "VISIT_MISSED"
        ? "Site visit missed"
        : lead.status === "VISIT_DONE"
          ? "Site visit completed"
          : "Post-visit outcome",
    detail:
      lead.status === "VISIT_DONE"
        ? "Visit completed — Day-wise follow-up active"
        : lead.status === "VISIT_MISSED"
          ? "Customer missed visit — Reschedule requested"
          : "Pending — visit not yet marked done or missed",
    tone: lead.status === "VISIT_MISSED" ? "orange" : "teal",
    done: lead.status === "VISIT_DONE" || lead.status === "VISIT_MISSED",
  });

  events.push({
    key: "sales_alert",
    label: "Sales team notified",
    detail: lead.assigned_executive_name ? `Alerted ${lead.assigned_executive_name}` : null,
    timestamp: lead.alert_sent_at,
    tone: "orange",
    done: !!lead.alert_sent_at,
  });

  events.push({
    key: "human_takeover",
    label: "Executive took over chat",
    timestamp: lead.first_human_contact_at,
    tone: "purple",
    done: !!lead.first_human_contact_at,
  });

  const followupCount = lead.followup_count ?? 0;
  events.push({
    key: "drip_followups",
    label: "Automated day-wise follow-ups",
    detail:
      followupCount > 0
        ? `${followupCount} follow-up${followupCount === 1 ? "" : "s"} sent · Stage: ${lead.drip_stage ?? "N/A"}`
        : lead.status === "VISIT_DONE"
          ? "Post-visit drip cadence ready"
          : "None sent yet",
    timestamp: lead.last_followup_at,
    tone: lead.status === "VISIT_DONE" ? "teal" : "gray",
    done: followupCount > 0,
  });

  if (lead.rejection_reason) {
    events.push({
      key: "rejection",
      label: "Rejection / objection logged",
      detail: lead.rejection_reason,
      tone: "red",
      done: true,
    });
  }

  return events;
}

/** Fields whose before/after values are worth recording on the timeline. */
const TRACKED: { key: keyof Lead; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "property_state", label: "Property state" },
  { key: "site_visit_datetime", label: "Site visit" },
  { key: "bot_active", label: "AI bot" },
  { key: "selected_property_name", label: "Selected property" },
  { key: "budget", label: "Budget" },
  { key: "location", label: "Location" },
  { key: "property_type", label: "Property type" },
  { key: "requirement", label: "Requirement" },
  { key: "purpose", label: "Purpose" },
  { key: "timeline", label: "Timeline" },
];

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Active" : "Paused";
  return String(v);
};

/**
 * Build exactly ONE activity row for an executive action, annotated with the
 * primary field that changed (the first match in TRACKED order).
 * Returning a single row per call prevents duplicate entries in the timeline
 * when an action updates multiple fields simultaneously (e.g. VISIT_DONE sets
 * both `status` and `property_state`).
 */
export function buildActivityRows(
  lead: Lead,
  values: Partial<Lead>,
  action: string,
  note?: string | null,
): ActivityInsert[] {
  const base = {
    client_id: lead.client_id,
    lead_id: lead.lead_id,
    lead_name: lead.name ?? "Unnamed lead",
    executive_name: lead.assigned_executive_name ?? "Unassigned",
    action,
    note: (note ?? values.executive_notes ?? null) || null,
  };
  // Find the primary (first) field that actually changed and annotate the row.
  for (const t of TRACKED) {
    if (!(t.key in values)) continue;
    const next = asText(values[t.key]);
    const prev = asText(lead[t.key]);
    if (next !== prev) {
      return [{ ...base, field: t.label, old_value: prev, new_value: next }];
    }
  }
  // No tracked field changed — still record the action with no field annotation.
  return [{ ...base }];
}

/* ------------------------------------------------------------------ */
/* Reporting periods                                                   */
/* ------------------------------------------------------------------ */

export type Period = "today" | "7d" | "30d" | "all";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

export function periodStart(period: Period): Date | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "today") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
  return d;
}

export function inPeriod(iso: string | null | undefined, period: Period): boolean {
  if (period === "all") return true;
  if (!iso) return false;
  const start = periodStart(period);
  if (!start) return true;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= start.getTime();
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Hours since the lead was last touched, or null when unknown. */
export function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) ? ms / 3600000 : null;
}
