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

export type ExecutiveLite = Pick<Executive, "id" | "name" | "email" | "phone" | "telegram_id">;

/**
 * `leads` and `inventory` were redesigned server-side around a normalized
 * `assigned_executive_id` FK and a free-form `metadata`/`attributes` jsonb
 * column instead of a pile of flat text columns. The dashboard UI still
 * wants to read plain fields like `assigned_executive_name` or
 * `selected_property_name`, so the data layer "hydrates" every row with
 * these derived, read-only fields before handing it to components.
 */
export type Lead = LeadRow & {
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
};

export type Property = PropertyRow & {
  assigned_executive_name: string | null;
  assigned_executive_email: string | null;
  assigned_executive_phone: string | null;
  assigned_executive_telegram_id: string | null;
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
};

export const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "Fresh Lead", tone: "gray" },
  QUALIFYING: { label: "In Conversation", tone: "blue" },
  QUALIFIED: { label: "Qualified Prospect", tone: "indigo" },
  SITE_VISIT_BOOKED: { label: "Site Visit Booked", tone: "green" },
  VISIT_DONE: { label: "Visit Completed", tone: "teal" },
  VISIT_MISSED: { label: "Visit Missed", tone: "orange" },
  DEAL_WON: { label: "Deal Won", tone: "teal" },
  COLD: { label: "Gone Cold", tone: "gray" },
  NOT_INTERESTED: { label: "Closed/Dropped", tone: "gray" },
};

export const LEAD_STATUSES = Object.keys(STATUS_MAP);
export const PROPERTY_STATES = Object.keys(PROPERTY_STATE_MAP);

// SHOP/OFFICE/PLOT are configurations, not top-level categories — a
// property's category is one of these four; its configuration options then
// depend on which category is picked (see CONFIGURATIONS_BY_CATEGORY below).
export const PROPERTY_CATEGORIES = ["FLAT", "VILLA", "COMMERCIAL", "PLOT"];
export const CONFIGURATIONS = ["1BHK", "2BHK", "3BHK", "4BHK", "5BHK", "SHOP", "OFFICE", "PLOT"];

export const CONFIGURATIONS_BY_CATEGORY: Record<string, string[]> = {
  FLAT: ["1BHK", "2BHK", "3BHK", "4BHK", "5BHK"],
  VILLA: ["1BHK", "2BHK", "3BHK", "4BHK", "5BHK"],
  COMMERCIAL: ["SHOP", "OFFICE"],
  PLOT: ["PLOT"],
};

export function configurationsForCategory(category: string): string[] {
  return CONFIGURATIONS_BY_CATEGORY[category] ?? CONFIGURATIONS;
}

export const INVENTORY_STATUSES = ["AVAILABLE", "SOLD", "HOLD"];
export const STOCK_TYPES = ["REGULAR", "CLEARANCE"];
export const LISTING_TYPES = ["SALE", "RENT", "LEASE"];
export const FURNISHED_STATUSES = ["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"];
export const TRANSACTION_TYPES = ["NEW_BOOKING", "RESALE"];
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
  "LIFT",
  "POWER_BACKUP",
  "SECURITY",
  "GYM",
  "CLUBHOUSE",
  "SWIMMING_POOL",
  "GARDEN",
  "GATED_COMMUNITY",
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

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
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

export function isValidUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
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

export function slaTone(mins: number | null): Tone {
  if (mins === null) return "red";
  if (mins < 15) return "green";
  if (mins <= 30) return "yellow";
  return "red";
}

export const BUDGET_TIERS = [
  { key: "luxury", label: "Luxury", hint: "Above ₹60 L", min: 6000000, max: Infinity },
  { key: "middle", label: "Middle", hint: "₹25 L – ₹60 L", min: 2500000, max: 6000000 },
  { key: "lower", label: "Lower", hint: "Below ₹25 L", min: 0, max: 2500000 },
] as const;

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

export function hydrateLead(row: LeadRow, executivesById: Map<string, ExecutiveLite>): Lead {
  const meta = ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const exec = row.assigned_executive_id
    ? executivesById.get(row.assigned_executive_id)
    : undefined;
  return {
    ...row,
    assigned_executive_name: exec?.name ?? null,
    assigned_executive_email: exec?.email ?? null,
    assigned_executive_phone: exec?.phone ?? null,
    assigned_executive_telegram_id: exec?.telegram_id ?? null,
    summary: metaStr(meta, "summary"),
    last_message: metaStr(meta, "last_message"),
    followup_type: metaStr(meta, "followup_type"),
    followup_message: metaStr(meta, "followup_message"),
    selected_property_name: metaStr(meta, "selected_property_name"),
    selected_property_price: metaNum(meta, "selected_property_price"),
    selected_property_map_url: metaStr(meta, "selected_property_map_url"),
    selected_property_brochure_url: metaStr(meta, "selected_property_brochure_url"),
    portal_property_id: metaStr(meta, "portal_property_id"),
  };
}

export function hydrateProperty(
  row: PropertyRow,
  executivesById: Map<string, ExecutiveLite>,
): Property {
  const exec = row.assigned_executive_id
    ? executivesById.get(row.assigned_executive_id)
    : undefined;
  return {
    ...row,
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
  VISIT_DONE: { label: "Marked visit done", tone: "teal" },
  VISIT_MISSED: { label: "Marked visit missed", tone: "orange" },
  OPTIONS_SHARED: { label: "Shared property options", tone: "blue" },
  DEAL_WON: { label: "Marked deal won", tone: "teal" },
  LEAD_DROPPED: { label: "Dropped lead", tone: "red" },
  LEAD_REVERTED: { label: "Reverted lead", tone: "indigo" },
  PROFILE_UPDATED: { label: "Updated lead profile", tone: "indigo" },
  BOT_TOGGLED: { label: "Changed AI bot", tone: "gray" },
  NOTE_ADDED: { label: "Added notes", tone: "yellow" },
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
      ? `Scheduled for ${lead.site_visit_datetime}`
      : "Not booked yet",
    timestamp: lead.site_visit_datetime,
    tone: "green",
    done: !!lead.site_visit_datetime,
  });

  const visitTime = lead.site_visit_datetime ? new Date(lead.site_visit_datetime) : null;
  const visitIsFuture = !!visitTime && !Number.isNaN(visitTime.getTime()) && visitTime > new Date();
  events.push({
    key: "pre_visit_reminder",
    label: "Pre-visit reminder",
    detail: !lead.site_visit_datetime
      ? "No visit booked yet"
      : visitIsFuture
        ? lead.bot_active
          ? "Will be sent automatically before the visit"
          : "Bot is paused — won't be sent automatically"
        : "Visit date has passed",
    tone: "yellow",
    done: !!lead.site_visit_datetime && !visitIsFuture,
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
        ? "Marked done — awaiting negotiation/booking follow-up"
        : lead.status === "VISIT_MISSED"
          ? "Executive should re-engage or reschedule"
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
        ? `${followupCount} follow-up${followupCount === 1 ? "" : "s"} sent · drip stage ${lead.drip_stage ?? 0}`
        : "None sent yet",
    timestamp: lead.last_followup_at,
    tone: "gray",
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
