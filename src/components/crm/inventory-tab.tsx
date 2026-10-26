import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Eye,
  FileText,
  Flame,
  ImageOff,
  LayoutGrid,
  LayoutList,
  MapPin,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/auth";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeadScoreBadge, StatusBadge, ToneBadge } from "@/components/crm/badges";
import { LeadDrawer } from "@/components/crm/lead-drawer";
import { Textarea } from "@/components/ui/textarea";
import {
  uploadBrochure,
  uploadPropertyImages,
  useApprovePropertySubmission,
  useDeleteProperty,
  useExecutives,
  useLeads,
  usePropertySubmissions,
  useSaveProperty,
  useUpdatePropertySubmission,
} from "@/lib/crm-data";
import {
  AMENITY_OPTIONS,
  COMMERCIAL_ATTRIBUTE_FIELDS,
  COMMERCIAL_HAS_DIMENSIONS,
  COMMERCIAL_NO_FURNISHED,
  configurationsForCategory,
  FACING_OPTIONS,
  formatMoney,
  formatRatePerSqft,
  FURNISHED_STATUSES,
  INVENTORY_STATUSES,
  isValidUrl,
  LISTING_TYPES,
  OWNERSHIP_TYPES,
  POSSESSION_STATUSES,
  PROPERTY_CATEGORIES,
  PROPERTY_SUBMISSION_STATUS_MAP,
  STOCK_TYPES,
  toNumber,
  toWhatsAppUrl,
  TRANSACTION_TYPES,
  type Lead,
  type Property,
  type PropertySubmission,
  type Tone,
} from "@/lib/crm";

interface Draft {
  property_id: string;
  project_name: string;
  property_category: string;
  configuration: string;
  location: string;
  price: string;
  area_sqft: string;
  status: string;
  stock_type: string;
  listing_type: string;
  furnished_status: string;
  possession_status: string;
  brochure_url: string;
  map_url: string;
  assigned_executive_id: string;
  /** Commercial-only physical/utility specs — stored in `inventory.attributes`. */
  attr_length_ft: string;
  attr_width_ft: string;
  attr_height_ft: string;
  attr_power_supply_kw: string;
  /** Universal listing details. */
  rera_number: string;
  carpet_area_sqft: string;
  super_built_up_area_sqft: string;
  property_age_years: string;
  transaction_type: string;
  facing: string;
  ownership_type: string;
  price_negotiable: string;
  maintenance_charges: string;
  amenities: string[];
  image_urls: string[];
  landmarks_input: string;
  city: string;
  floor_number: string;
  total_floors: string;
  bathrooms: string;
  balconies: string;
  description: string;
}

const EMPTY: Draft = {
  property_id: "",
  project_name: "",
  property_category: "FLAT",
  configuration: "2BHK",
  location: "",
  price: "",
  area_sqft: "",
  status: "AVAILABLE",
  stock_type: "REGULAR",
  listing_type: "SALE",
  furnished_status: "UNFURNISHED",
  possession_status: "",
  brochure_url: "",
  map_url: "",
  assigned_executive_id: "",
  attr_length_ft: "",
  attr_width_ft: "",
  attr_height_ft: "",
  attr_power_supply_kw: "",
  rera_number: "",
  carpet_area_sqft: "",
  super_built_up_area_sqft: "",
  property_age_years: "",
  transaction_type: "NEW_BOOKING",
  facing: "NORTH",
  ownership_type: "FREEHOLD",
  price_negotiable: "false",
  maintenance_charges: "",
  amenities: [],
  image_urls: [],
  landmarks_input: "",
  city: "",
  floor_number: "",
  total_floors: "",
  bathrooms: "",
  balconies: "",
  description: "",
};

const ATTRIBUTE_FIELD_TO_DRAFT_KEY: Record<
  (typeof COMMERCIAL_ATTRIBUTE_FIELDS)[number]["key"],
  keyof Draft
> = {
  length_ft: "attr_length_ft",
  width_ft: "attr_width_ft",
  height_ft: "attr_height_ft",
  power_supply_kw: "attr_power_supply_kw",
};

const statusTone: Record<string, Tone> = {
  AVAILABLE: "green",
  SOLD: "gray",
  HOLD: "yellow",
};

type ViewMode = "grid" | "list";

function cleanPhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function InventoryTab({
  properties,
  loading,
  clientId,
}: {
  properties: Property[];
  loading: boolean;
  clientId: string | null;
}) {
  const [activeTab, setActiveTab] = useState<"inventory" | "submissions">("inventory");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const del = useDeleteProperty();

  const { data: allLeads = [] } = useLeads();
  const [matchingDialogProperty, setMatchingDialogProperty] = useState<{
    property: Property;
    buyers: Lead[];
  } | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // ── Filters & Sorting state ──
  const [search, setSearch] = useState("");
  const [dealTypeFilter, setDealTypeFilter] = useState<"ALL" | "SALE" | "RENT">("ALL");
  const [configFilter, setConfigFilter] = useState<string>("ALL");
  const [priceBracket, setPriceBracket] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"DEMAND" | "PRICE_ASC" | "PRICE_DESC" | "AREA_DESC" | "NEWEST">("DEMAND");

  const matchingBuyersMap = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const p of properties) {
      const pLoc = (p.location || "").toLowerCase().trim();
      const pCat = (p.property_category || "").toLowerCase().trim();
      const pConfig = (p.configuration || "").toLowerCase().trim();
      const pPrice = Number(p.price) || 0;

      const isCommercialProp =
        pCat.includes("commercial") ||
        pCat.includes("office") ||
        pCat.includes("shop") ||
        pConfig.includes("office") ||
        pConfig.includes("shop");
      const isPlotProp =
        pCat.includes("plot") ||
        pCat.includes("land") ||
        pConfig.includes("plot") ||
        pConfig.includes("land");
      const isResidentialProp = !isCommercialProp && !isPlotProp;

      const matches = allLeads.filter((l) => {
        // Disqualify dropped or dead leads
        if (l.status === "NOT_INTERESTED" || l.status === "DROPPED") return false;

        // RULE 1: Explicit Property Lock (Highest Priority)
        // If the lead has selected or booked a visit for a specific property:
        if (l.selected_property_id) {
          return l.selected_property_id === p.property_id;
        }

        // RULE 2: Category Isolation (For generic / unassigned leads)
        const lType = (l.property_type || "").toLowerCase().trim();
        const lReq = (l.requirement || "").toLowerCase().trim();
        const leadText = `${lType} ${lReq}`.trim();

        const isLeadCommercial =
          leadText.includes("commercial") ||
          leadText.includes("office") ||
          leadText.includes("shop") ||
          leadText.includes("retail") ||
          leadText.includes("showroom");

        const isLeadPlot =
          leadText.includes("plot") ||
          leadText.includes("land") ||
          leadText.includes("agricultural");

        const isLeadResidential =
          leadText.includes("bhk") ||
          leadText.includes("flat") ||
          leadText.includes("apartment") ||
          leadText.includes("villa") ||
          leadText.includes("bungalow") ||
          leadText.includes("penthouse") ||
          leadText.includes("residential") ||
          (!isLeadCommercial && !isLeadPlot && leadText !== "");

        // Strict category cross-match prevention:
        if (isCommercialProp && !isLeadCommercial) return false;
        if (!isCommercialProp && isLeadCommercial) return false;
        if (isPlotProp && !isLeadPlot) return false;
        if (!isPlotProp && isLeadPlot) return false;
        if (isResidentialProp && !isLeadResidential) return false;

        // RULE 3: Multi-Factor Scoring (No budget-only matches)
        let score = 0;

        // Factor A: Location Alignment
        const lLoc = (l.location || "").toLowerCase().trim();
        if (lLoc && pLoc && (pLoc.includes(lLoc) || lLoc.includes(pLoc))) {
          score += 3;
        }

        // Factor B: Configuration / Type Alignment
        if (lType) {
          if (pConfig && (lType.includes(pConfig) || pConfig.includes(lType))) {
            score += 3;
          } else if (pCat && (lType.includes(pCat) || pCat.includes(lType))) {
            score += 2;
          }
        }

        // Factor C: Realistic Budget Bracket (Must be within 0.7x to 1.5x of property price)
        const lBudget = toNumber(l.budget as never);
        if (lBudget > 0 && pPrice > 0) {
          if (lBudget >= pPrice * 0.7 && lBudget <= pPrice * 1.5) {
            score += 2;
          }
        }

        // Threshold: Must have at least 4 points (e.g. Location + Config, or Location + Budget, or Config + Budget)
        // A single factor (like budget alone = 2) can NEVER trigger a match!
        return score >= 4;
      });

      map.set(p.property_id, matches);
    }
    return map;
  }, [properties, allLeads]);

  // ── Portfolio Overview KPIs ──
  const portfolioStats = useMemo(() => {
    let totalSaleValue = 0;
    let saleCount = 0;
    let rentCount = 0;
    let highDemandCount = 0;

    for (const p of properties) {
      const pPrice = Number(p.price) || 0;
      const isRent =
        (p.listing_type || "").toUpperCase() === "RENT" ||
        (p.listing_type || "").toUpperCase() === "LEASE" ||
        (p.transaction_type || "").toUpperCase().includes("RENT");

      if (isRent) {
        rentCount++;
      } else {
        saleCount++;
        totalSaleValue += pPrice;
      }

      const matches = matchingBuyersMap.get(p.property_id)?.length || 0;
      if (matches > 0) {
        highDemandCount++;
      }
    }

    return {
      totalCount: properties.length,
      totalSaleValue,
      saleCount,
      rentCount,
      highDemandCount,
    };
  }, [properties, matchingBuyersMap]);

  // ── Filtered and Sorted Properties ──
  const filteredProperties = useMemo(() => {
    const list = properties.filter((p) => {
      // 1. Search Query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = p.project_name?.toLowerCase().includes(q);
        const matchLoc = p.location?.toLowerCase().includes(q);
        const matchCity = (p as { city?: string | null }).city?.toLowerCase().includes(q);
        const matchConfig = p.configuration?.toLowerCase().includes(q);
        const matchId = p.property_id?.toLowerCase().includes(q);
        const matchLandmarks = Array.isArray((p as { landmarks?: string[] }).landmarks)
          ? (p as { landmarks?: string[] }).landmarks?.some((lm) => lm.toLowerCase().includes(q))
          : false;
        if (!matchName && !matchLoc && !matchCity && !matchConfig && !matchId && !matchLandmarks) {
          return false;
        }
      }

      // 2. Deal Type
      const isRent =
        (p.listing_type || "").toUpperCase() === "RENT" ||
        (p.listing_type || "").toUpperCase() === "LEASE" ||
        (p.transaction_type || "").toUpperCase().includes("RENT");
      if (dealTypeFilter === "SALE" && isRent) return false;
      if (dealTypeFilter === "RENT" && !isRent) return false;

      // 3. Configuration / BHK
      if (configFilter !== "ALL") {
        const cfg = (p.configuration || "").toLowerCase();
        const cat = (p.property_category || "").toLowerCase();
        if (configFilter === "1BHK" && !(cfg.includes("1") && cfg.includes("bhk"))) return false;
        if (configFilter === "2BHK" && !(cfg.includes("2") && cfg.includes("bhk"))) return false;
        if (configFilter === "3BHK" && !(cfg.includes("3") && cfg.includes("bhk"))) return false;
        if (configFilter === "4BHK+" && !(cfg.includes("4") || cfg.includes("5") || cfg.includes("penthouse"))) return false;
        if (configFilter === "VILLA" && !(cat.includes("villa") || cfg.includes("villa") || cfg.includes("bungalow") || cfg.includes("duplex"))) return false;
        if (configFilter === "COMMERCIAL" && !(cat.includes("commercial") || cat.includes("plot") || cat.includes("land") || cfg.includes("shop") || cfg.includes("office"))) return false;
      }

      // 4. Price Bracket
      if (priceBracket !== "ALL") {
        const pr = Number(p.price) || 0;
        if (priceBracket === "UNDER_40L" && pr >= 4000000) return false;
        if (priceBracket === "40L_75L" && (pr < 4000000 || pr > 7500000)) return false;
        if (priceBracket === "75L_15CR" && (pr < 7500000 || pr > 15000000)) return false;
        if (priceBracket === "ABOVE_15CR" && pr <= 15000000) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "DEMAND") {
        const demA = matchingBuyersMap.get(a.property_id)?.length || 0;
        const demB = matchingBuyersMap.get(b.property_id)?.length || 0;
        if (demB !== demA) return demB - demA;
        return (Number(b.price) || 0) - (Number(a.price) || 0);
      }
      if (sortBy === "PRICE_ASC") {
        return (Number(a.price) || 0) - (Number(b.price) || 0);
      }
      if (sortBy === "PRICE_DESC") {
        return (Number(b.price) || 0) - (Number(a.price) || 0);
      }
      if (sortBy === "AREA_DESC") {
        const areaA = Number(a.area_sqft || a.carpet_area_sqft) || 0;
        const areaB = Number(b.area_sqft || b.carpet_area_sqft) || 0;
        return areaB - areaA;
      }
      if (sortBy === "NEWEST") {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      return 0;
    });

    return list;
  }, [properties, search, dealTypeFilter, configFilter, priceBracket, sortBy, matchingBuyersMap]);

  const isFilterActive =
    search !== "" ||
    dealTypeFilter !== "ALL" ||
    configFilter !== "ALL" ||
    priceBracket !== "ALL" ||
    sortBy !== "DEMAND";

  const resetFilters = () => {
    setSearch("");
    setDealTypeFilter("ALL");
    setConfigFilter("ALL");
    setPriceBracket("ALL");
    setSortBy("DEMAND");
  };

  const { data: submissions = [] } = usePropertySubmissions();
  const pendingSubmissionsCount = submissions.filter(
    (s) => !s.status || s.status === "PENDING_VERIFICATION",
  ).length;

  const openEdit = (p: Property) => {
    const draft = { ...EMPTY } as unknown as Record<string, unknown>;
    for (const key of Object.keys(EMPTY)) {
      if (key.startsWith("attr_") || key === "amenities" || key === "image_urls") continue;
      const v = (p as unknown as Record<string, unknown>)[key];
      draft[key] = v === null || v === undefined ? "" : String(v);
    }
    if (!draft["furnished_status"]) draft["furnished_status"] = "UNFURNISHED";
    if (!draft["listing_type"]) draft["listing_type"] = "SALE";
    if (!draft["transaction_type"]) draft["transaction_type"] = "NEW_BOOKING";
    if (!draft["facing"]) draft["facing"] = "NORTH";
    if (!draft["ownership_type"]) draft["ownership_type"] = "FREEHOLD";

    draft["amenities"] = Array.isArray(p.amenities) ? p.amenities : [];
    draft["image_urls"] = Array.isArray(p.image_urls) ? p.image_urls : [];
    draft["landmarks_input"] = Array.isArray((p as { landmarks?: string[] }).landmarks)
      ? ((p as { landmarks?: string[] }).landmarks ?? []).join(", ")
      : "";
    draft["city"] = (p as { city?: string | null }).city || "";

    const attributes = (p.attributes as Record<string, unknown> | null) ?? {};
    for (const { key } of COMMERCIAL_ATTRIBUTE_FIELDS) {
      const draftKey = ATTRIBUTE_FIELD_TO_DRAFT_KEY[key];
      if (!draftKey) continue;
      const v = attributes[key];
      draft[draftKey] = v === null || v === undefined ? "" : String(v);
    }
    draft["floor_number"] = attributes.floor_number !== undefined && attributes.floor_number !== null ? String(attributes.floor_number) : "";
    draft["total_floors"] = attributes.total_floors !== undefined && attributes.total_floors !== null ? String(attributes.total_floors) : "";
    draft["bathrooms"] = attributes.bathrooms !== undefined && attributes.bathrooms !== null ? String(attributes.bathrooms) : "";
    draft["balconies"] = attributes.balconies !== undefined && attributes.balconies !== null ? String(attributes.balconies) : "";
    draft["description"] = attributes.description !== undefined && attributes.description !== null ? String(attributes.description) : "";
    setIsNew(false);
    setEditing(draft as unknown as Draft);
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab segment toggle */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center rounded-xl border border-border/30 bg-muted/60 p-1 shadow-2xs backdrop-blur-xs">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`apple-button flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "inventory"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="size-3.5" />
            <span>Live Inventory ({properties.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("submissions")}
            className={`apple-button relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "submissions"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="size-3.5" />
            <span>Owner Submissions ({submissions.length})</span>
            {pendingSubmissionsCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                {pendingSubmissionsCount} new
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === "submissions" ? (
        <OwnerSubmissionsView clientId={clientId} />
      ) : (
        <>
          {/* ── Top Portfolio Overview Strip (Apple Complication Widgets) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-border/50 bg-card p-4.5 shadow-xs transition-all hover:bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Building2 className="size-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {portfolioStats.totalCount} <span className="text-xs font-normal text-muted-foreground">units</span>
              </p>
              <div className="mt-1">
                <span className="text-xs font-semibold text-foreground">Total Inventory</span>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate tabular-nums">
                  {formatMoney(portfolioStats.totalSaleValue)} total value
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card p-4.5 shadow-xs transition-all hover:bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <span className="inline-block size-2.5 rounded-full bg-emerald-500" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                {portfolioStats.saleCount} <span className="text-xs font-normal text-muted-foreground">units</span>
              </p>
              <div className="mt-1">
                <span className="text-xs font-semibold text-foreground">For Sale</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ready for booking</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card p-4.5 shadow-xs transition-all hover:bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <span className="inline-block size-2.5 rounded-full bg-sky-500" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400 tabular-nums">
                {portfolioStats.rentCount} <span className="text-xs font-normal text-muted-foreground">units</span>
              </p>
              <div className="mt-1">
                <span className="text-xs font-semibold text-foreground">For Rent</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">High rental yield</p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4.5 shadow-xs transition-all hover:bg-amber-500/10">
              <div className="flex items-center justify-between">
                <div className="size-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Flame className="size-4 fill-amber-500 text-amber-500" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-300 tabular-nums">
                {portfolioStats.highDemandCount} <span className="text-xs font-normal text-muted-foreground">units</span>
              </p>
              <div className="mt-1">
                <span className="text-xs font-semibold text-foreground">Hot Buyer Demand</span>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">Active CRM buyers ready</p>
              </div>
            </div>
          </div>

          {/* ── Filter & Search Toolbar (Apple HIG Grouped Panel) ── */}
          <div className="space-y-3 rounded-2xl border border-border/50 bg-card p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by project name, locality, landmarks, ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs rounded-xl bg-muted/40 border-border/40 focus:bg-background transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Deal Type Switcher */}
                <div className="flex items-center rounded-xl border border-border/30 bg-muted/60 p-1 text-xs shrink-0">
                  {(["ALL", "SALE", "RENT"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDealTypeFilter(t)}
                      className={`apple-button px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        dealTypeFilter === t
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "ALL" ? "All Deals" : t === "SALE" ? "For Sale" : "For Rent"}
                    </button>
                  ))}
                </div>

                {/* Sort Select */}
                <div className="w-[180px] shrink-0">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as never)}>
                    <SelectTrigger className="h-9 text-xs rounded-xl border-border/40 bg-muted/40 hover:bg-muted/60">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEMAND">🔥 Highest Demand</SelectItem>
                      <SelectItem value="PRICE_ASC">💰 Price: Low to High</SelectItem>
                      <SelectItem value="PRICE_DESC">💎 Price: High to Low</SelectItem>
                      <SelectItem value="AREA_DESC">📐 Area: High to Low</SelectItem>
                      <SelectItem value="NEWEST">🕒 Recently Added</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center rounded-xl border border-border/30 bg-muted/60 p-1 shrink-0">
                  <button
                    onClick={() => setView("grid")}
                    className={`apple-button rounded-lg p-1.5 transition-all ${
                      view === "grid" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Grid view"
                  >
                    <LayoutGrid className="size-4" />
                  </button>
                  <button
                    onClick={() => setView("list")}
                    className={`apple-button rounded-lg p-1.5 transition-all ${
                      view === "list" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="List view"
                  >
                    <LayoutList className="size-4" />
                  </button>
                </div>

                {/* Add Property Button */}
                <Button
                  size="sm"
                  className="apple-button h-9 rounded-xl px-3.5 text-xs font-semibold gap-1.5 shadow-2xs shrink-0"
                  onClick={() => {
                    setIsNew(true);
                    setEditing({ ...EMPTY });
                  }}
                >
                  <Plus className="size-3.5" />
                  <span>Add Property</span>
                </Button>
              </div>
            </div>

            {/* Quick Filter Pills Row (BHK & Price brackets) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
              <div className="touch-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5 w-full sm:w-auto">
                <span className="text-[11px] text-muted-foreground font-medium mr-1 shrink-0">BHK:</span>
                {[
                  { id: "ALL", label: "All" },
                  { id: "1BHK", label: "1 BHK" },
                  { id: "2BHK", label: "2 BHK" },
                  { id: "3BHK", label: "3 BHK" },
                  { id: "4BHK+", label: "4+ BHK" },
                  { id: "VILLA", label: "Villa" },
                  { id: "COMMERCIAL", label: "Commercial" },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setConfigFilter(c.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                      configFilter === c.id
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="touch-scroll flex items-center gap-1.5 overflow-x-auto pb-0.5 w-full sm:w-auto">
                <span className="text-[11px] text-muted-foreground font-medium mr-1 shrink-0">Price:</span>
                {[
                  { id: "ALL", label: "Any" },
                  { id: "UNDER_40L", label: "< ₹40 L" },
                  { id: "40L_75L", label: "₹40 L - ₹75 L" },
                  { id: "75L_15CR", label: "₹75 L - ₹1.5 Cr" },
                  { id: "ABOVE_15CR", label: "> ₹1.5 Cr" },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setPriceBracket(b.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                      priceBracket === b.id
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}

                {isFilterActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[11px] text-destructive hover:underline ml-1 font-medium"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
            <p>
              Showing <b>{filteredProperties.length}</b> of {properties.length} properties
              {isFilterActive && " (filtered)"}
            </p>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Loading inventory…</p>}

          {/* Empty Filter State */}
          {!loading && filteredProperties.length === 0 && properties.length > 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center bg-card/40 space-y-2">
              <p className="text-sm font-semibold text-foreground">No properties match your current filters</p>
              <p className="text-xs text-muted-foreground">
                Try adjusting your search query, configuration, or price bracket.
              </p>
              <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={resetFilters}>
                Clear All Filters
              </Button>
            </div>
          )}

          {/* ── Grid view ── */}
          {view === "grid" && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProperties.map((p) => {
                const isRent =
                  (p.listing_type || "").toUpperCase() === "RENT" ||
                  (p.listing_type || "").toUpperCase() === "LEASE" ||
                  (p.transaction_type || "").toUpperCase().includes("RENT");
                const ratePerSqft = formatRatePerSqft(p.price, p.area_sqft || p.carpet_area_sqft);
                const matchingBuyers = matchingBuyersMap.get(p.property_id) ?? [];

                return (
                  <div
                    key={p.property_id}
                    className="rounded-2xl border border-border/70 bg-card overflow-hidden flex flex-col justify-between hover:border-primary/50 transition-all shadow-xs"
                  >
                    <div>
                      <div className="relative">
                        {p.image_urls && p.image_urls.length > 0 ? (
                          <img
                            src={p.image_urls[0]}
                            alt={p.project_name}
                            className="h-44 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-44 w-full items-center justify-center bg-muted/60 text-muted-foreground">
                            <ImageOff className="size-6" />
                          </div>
                        )}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs ${
                              isRent ? "bg-sky-600 text-white" : "bg-emerald-600 text-white"
                            }`}
                          >
                            {isRent ? "FOR RENT" : "FOR SALE"}
                          </span>
                          {p.stock_type === "PREMIUM" && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 shadow-xs">
                              PREMIUM
                            </span>
                          )}
                        </div>
                        {ratePerSqft && (
                          <span className="absolute top-2.5 right-2.5 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xs text-white border border-white/20 shadow-xs">
                            {ratePerSqft}
                          </span>
                        )}
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-base text-foreground tracking-tight truncate">{p.project_name}</h4>
                            <ToneBadge
                              tone={statusTone[p.status ?? "AVAILABLE"] ?? "gray"}
                              label={p.status ?? "—"}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground font-medium">
                            {p.property_category} · {p.configuration?.replaceAll("_", " ") || "—"} · {p.location}
                            {p.city ? `, ${p.city}` : ""}
                          </p>
                          {Array.isArray(p.landmarks) && p.landmarks.length > 0 && (
                            <p className="line-clamp-1 text-[11px] text-muted-foreground font-medium">
                              📍 {p.landmarks.join(", ")}
                            </p>
                          )}
                        </div>

                        <div className="flex items-baseline justify-between pt-1 border-t border-border/40">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-xl font-bold tracking-tight text-foreground tabular-nums">
                              {formatMoney(p.price, { isRent })}
                            </span>
                            {ratePerSqft && (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                                ({ratePerSqft})
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-foreground/80 font-semibold tabular-nums">
                            {p.area_sqft ?? p.carpet_area_sqft ?? "—"} sq.ft
                          </span>
                        </div>

                        <p className="text-[11px] text-muted-foreground font-medium">
                          Stock: {p.stock_type} · {p.possession_status || "Possession N/A"}
                        </p>

                        <div className="rounded-xl bg-muted/50 p-2.5 text-xs flex items-center justify-between border border-border/60">
                          <div>
                            <p className="font-bold text-foreground">{p.assigned_executive_name || "Unassigned"}</p>
                            <p className="text-foreground/80 font-medium text-[11px] tabular-nums">{p.assigned_executive_phone || "No phone"}</p>
                          </div>
                          <span className="text-[10px] font-mono font-semibold text-foreground/80 px-2 py-0.5 rounded-md bg-card border border-border/60 shadow-2xs">
                            {p.property_id}
                          </span>
                        </div>

                        {/* ── 🎯 Reverse Matchmaker: Matching Buyers Banner ── */}
                        {matchingBuyers.length > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            className="apple-button w-full justify-between bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-medium h-8.5 rounded-xl text-xs shadow-2xs"
                            onClick={() =>
                              setMatchingDialogProperty({ property: p, buyers: matchingBuyers })
                            }
                          >
                            <span className="flex items-center gap-1.5 font-bold">
                              <Flame className="size-3.5 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
                              <span>{matchingBuyers.length} Matching {matchingBuyers.length === 1 ? "Buyer" : "Buyers"} Ready</span>
                            </span>
                            <span className="text-[11px] underline font-semibold">View Leads</span>
                          </Button>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic px-1">
                            No matching buyers in CRM yet
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-4 pt-0">
                      <div className="flex flex-wrap gap-2 pt-2.5 border-t border-border/40">
                        {p.brochure_url && (
                          <Button asChild size="sm" variant="outline" className="apple-button min-h-[38px] sm:min-h-[32px] rounded-xl text-xs shadow-2xs">
                            <a href={p.brochure_url} target="_blank" rel="noreferrer">
                              <FileText className="size-3.5 mr-1" /> Brochure
                            </a>
                          </Button>
                        )}
                        {p.map_url && (
                          <Button asChild size="sm" variant="outline" className="apple-button min-h-[38px] sm:min-h-[32px] rounded-xl text-xs shadow-2xs">
                            <a href={p.map_url} target="_blank" rel="noreferrer">
                              <MapPin className="size-3.5 mr-1" /> Map
                            </a>
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" className="apple-button min-h-[38px] sm:min-h-[32px] rounded-xl text-xs shadow-2xs font-semibold" onClick={() => openEdit(p)}>
                          <Pencil className="size-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="apple-button min-h-[38px] sm:min-h-[32px] rounded-xl text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(p.property_id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── List view (Responsive: Mobile Cards + Desktop Inset Table) ── */}
          {view === "list" && (
            <div className="space-y-3">
              {/* 📱 Mobile Inventory Cards (< 768px) */}
              <div className="space-y-3 md:hidden">
                {filteredProperties.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center bg-card/60">
                    <p className="text-xs font-semibold text-foreground">No properties match your filter</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Try clearing your search or filter criteria.
                    </p>
                  </div>
                )}
                {filteredProperties.map((p) => {
                  const isRent =
                    (p.listing_type || "").toUpperCase() === "RENT" ||
                    (p.listing_type || "").toUpperCase() === "LEASE" ||
                    (p.transaction_type || "").toUpperCase().includes("RENT");
                  const ratePerSqft = formatRatePerSqft(p.price, p.area_sqft || p.carpet_area_sqft);
                  const matchingBuyers = matchingBuyersMap.get(p.property_id) || [];

                  return (
                    <div
                      key={`m-list-${p.property_id}`}
                      className="rounded-2xl border border-border/50 bg-card p-4 shadow-xs space-y-3 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {p.image_urls && p.image_urls.length > 0 ? (
                            <img
                              src={p.image_urls[0]}
                              alt={p.project_name}
                              className="size-12 rounded-xl object-cover shrink-0 shadow-2xs border border-border/40"
                            />
                          ) : (
                            <div className="flex size-12 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground shrink-0 border border-border/40">
                              <Building2 className="size-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-foreground truncate">{p.project_name}</h4>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {p.configuration?.replaceAll("_", " ") || "—"} · {p.location}
                            </p>
                          </div>
                        </div>
                        <ToneBadge
                          tone={statusTone[p.status ?? "AVAILABLE"] ?? "gray"}
                          label={p.status ?? "—"}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs bg-muted/40 rounded-xl px-3 py-2 border border-border/40">
                        <div>
                          <span className="font-bold text-base text-foreground tabular-nums">
                            {formatMoney(p.price)}
                          </span>
                          {isRent && <span className="text-[11px] text-muted-foreground font-normal"> /mo</span>}
                        </div>
                        {ratePerSqft && (
                          <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {ratePerSqft}
                          </span>
                        )}
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {p.area_sqft ? `${p.area_sqft} sq.ft` : "—"}
                        </span>
                      </div>

                      {matchingBuyers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setMatchingDialogProperty({ property: p, buyers: matchingBuyers })}
                          className="apple-button w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 text-xs font-semibold shadow-2xs transition-all"
                        >
                          <span className="flex items-center gap-1.5">
                            <Flame className="size-3.5 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
                            <span>{matchingBuyers.length} Matching {matchingBuyers.length === 1 ? "Buyer" : "Buyers"}</span>
                          </span>
                          <span className="text-[11px] underline">View Leads</span>
                        </button>
                      )}

                      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                        {p.brochure_url && (
                          <Button asChild size="sm" variant="outline" className="apple-button min-h-[40px] flex-1 rounded-xl text-xs font-semibold shadow-2xs">
                            <a href={p.brochure_url} target="_blank" rel="noreferrer">
                              <FileText className="size-3.5 mr-1" /> Brochure
                            </a>
                          </Button>
                        )}
                        {p.map_url && (
                          <Button asChild size="sm" variant="outline" className="apple-button min-h-[40px] flex-1 rounded-xl text-xs font-semibold shadow-2xs">
                            <a href={p.map_url} target="_blank" rel="noreferrer">
                              <MapPin className="size-3.5 mr-1" /> Map
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          className="apple-button min-h-[40px] flex-1 rounded-xl text-xs font-semibold shadow-2xs"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="size-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="apple-button min-h-[40px] px-3 rounded-xl text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(p.property_id)}
                          aria-label="Delete property"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 💻 Desktop Table (>= 768px) */}
              <div className="hidden md:block overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xs">
                <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 border-b border-border/40 hover:bg-muted/30">
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Property</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Category</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Location</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Price</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Rate/Sq.ft</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Area</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Status</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Executive</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3">Matching Demand</TableHead>
                      <TableHead className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase py-3 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="py-12 text-center text-muted-foreground text-xs">
                          No properties match your filter.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredProperties.map((p) => {
                      const isRent =
                        (p.listing_type || "").toUpperCase() === "RENT" ||
                        (p.listing_type || "").toUpperCase() === "LEASE" ||
                        (p.transaction_type || "").toUpperCase().includes("RENT");
                      const ratePerSqft = formatRatePerSqft(p.price, p.area_sqft || p.carpet_area_sqft);
                      const matchingBuyers = matchingBuyersMap.get(p.property_id) || [];

                      return (
                        <TableRow key={p.property_id} className="border-b border-border/30 hover:bg-muted/35 transition-colors">
                          <TableCell className="py-3.5">
                            <div className="flex items-center gap-2.5">
                              {p.image_urls && p.image_urls.length > 0 ? (
                                <img
                                  src={p.image_urls[0]}
                                  alt={p.project_name}
                                  className="size-10 rounded-xl object-cover shadow-2xs"
                                />
                              ) : (
                                <div className="flex size-10 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                                  <ImageOff className="size-4" />
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-semibold text-foreground text-sm leading-tight">{p.project_name}</p>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                      isRent ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                    }`}
                                  >
                                    {isRent ? "RENT" : "SALE"}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.property_id}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground py-3.5">
                            {p.property_category} · {p.configuration?.replaceAll("_", " ") || "—"}
                          </TableCell>
                          <TableCell className="text-xs py-3.5">
                            <div className="font-medium text-foreground">
                              {p.location}
                              {p.city ? `, ${p.city}` : ""}
                            </div>
                            {Array.isArray(p.landmarks) && p.landmarks.length > 0 && (
                              <div className="line-clamp-1 text-[11px] text-muted-foreground mt-0.5">
                                📍 {p.landmarks.slice(0, 2).join(", ")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-bold text-foreground text-sm tabular-nums py-3.5">
                            {formatMoney(p.price, { isRent })}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs text-emerald-600 dark:text-emerald-400 font-medium tabular-nums py-3.5">
                            {ratePerSqft || "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums py-3.5">
                            {p.area_sqft ?? p.carpet_area_sqft ?? "—"} sq.ft
                          </TableCell>
                          <TableCell className="py-3.5">
                            <ToneBadge
                              tone={statusTone[p.status ?? "AVAILABLE"] ?? "gray"}
                              label={p.status ?? "—"}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground py-3.5">
                            {p.assigned_executive_name || (
                              <span className="italic">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3.5">
                            {matchingBuyers.length > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="apple-button h-7 px-2.5 rounded-lg border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium text-xs gap-1.5 shadow-2xs tabular-nums"
                                onClick={() =>
                                  setMatchingDialogProperty({ property: p, buyers: matchingBuyers })
                                }
                                title={`View ${matchingBuyers.length} matching buyer leads`}
                              >
                                <Flame className="size-3 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
                                <span><b>{matchingBuyers.length}</b> {matchingBuyers.length === 1 ? "Buyer" : "Buyers"}</span>
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">None yet</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right py-3.5">
                            <div className="flex justify-end gap-1.5">
                              {p.brochure_url && (
                                <Button asChild size="sm" variant="outline" className="apple-button size-8 p-0 rounded-lg shadow-2xs">
                                  <a href={p.brochure_url} target="_blank" rel="noreferrer" title="Brochure">
                                    <FileText className="size-3.5" />
                                  </a>
                                </Button>
                              )}
                              {p.map_url && (
                                <Button asChild size="sm" variant="outline" className="apple-button size-8 p-0 rounded-lg shadow-2xs">
                                  <a href={p.map_url} target="_blank" rel="noreferrer" title="Map">
                                    <MapPin className="size-3.5" />
                                  </a>
                                </Button>
                              )}
                              <Button size="sm" variant="secondary" className="apple-button size-8 p-0 rounded-lg shadow-2xs" onClick={() => openEdit(p)} title="Edit property">
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="apple-button size-8 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteId(p.property_id)}
                                title="Delete property"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
        </>
      )}

      <PropertyForm
        draft={editing}
        isNew={isNew}
        clientId={clientId}
        onClose={() => setEditing(null)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this property?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) del.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reverse Demand Matchmaker Dialog ── */}
      <Dialog
        open={!!matchingDialogProperty}
        onOpenChange={(open) => !open && setMatchingDialogProperty(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Reverse Demand Matchmaker
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Active CRM buyer leads matching{" "}
                  <b className="text-foreground">
                    {matchingDialogProperty?.property.project_name}
                  </b>{" "}
                  ({matchingDialogProperty?.property.location} ·{" "}
                  {formatMoney(matchingDialogProperty?.property.price)})
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 py-2">
            {!matchingDialogProperty || matchingDialogProperty.buyers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No active buyer leads currently match this property's criteria.
              </div>
            ) : (
              matchingDialogProperty.buyers.map((buyer) => (
                <div
                  key={buyer.lead_id}
                  className="rounded-lg border p-3.5 bg-card hover:border-primary/40 transition-colors shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm leading-tight text-foreground">
                        {buyer.name || "Unnamed Buyer"}
                      </span>
                      <StatusBadge value={buyer.status} />
                      {buyer.selected_property_id === matchingDialogProperty?.property.property_id || buyer.site_visit_booked ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shadow-2xs">
                          🎯 Direct Property Lead / Site Visit Booked
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1 shadow-2xs">
                          ✨ Criteria Match (Category & Budget)
                        </span>
                      )}
                      {buyer.ai_score !== undefined && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Score: {buyer.ai_score}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {buyer.phone && (
                        <span className="font-mono text-foreground font-medium flex items-center gap-1">
                          <Phone className="size-3 text-muted-foreground" />
                          {buyer.phone}
                        </span>
                      )}
                      <span>
                        Budget:{" "}
                        <b className="text-foreground">
                          {buyer.budget ? formatMoney(buyer.budget) : "Flexible"}
                        </b>
                      </span>
                      {buyer.location && (
                        <span>
                          Area: <b className="text-foreground">{buyer.location}</b>
                        </span>
                      )}
                      {buyer.property_type && (
                        <span>
                          Type: <b className="text-foreground">{buyer.property_type}</b>
                        </span>
                      )}
                    </div>
                    {buyer.ai_notes && (
                      <p className="text-xs text-muted-foreground line-clamp-1 italic mt-0.5">
                        "{buyer.ai_notes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {buyer.phone ? (
                      <>
                        <Button
                          asChild
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-8 px-3 gap-1.5 shadow-2xs"
                          title={`Call ${buyer.name || "Buyer"}`}
                        >
                          <a href={`tel:${buyer.phone}`}>
                            <Phone className="size-3.5" />
                            <span>Call</span>
                          </a>
                        </Button>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="apple-button h-8 px-2.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 gap-1 shadow-2xs"
                          title={`WhatsApp ${buyer.name || "Buyer"}`}
                        >
                          <a
                            href={`https://wa.me/${buyer.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                              `Namaste ${buyer.name || "ji"}, regarding your inquiry for ${matchingDialogProperty?.property.project_name || "the property"}...`,
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle className="size-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No phone</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs px-2.5 shadow-2xs"
                      onClick={() => {
                        setSelectedLead(buyer);
                      }}
                    >
                      View CRM Profile
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="border-t pt-3 flex items-center justify-between sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {matchingDialogProperty?.buyers.length || 0} verified buyer(s) matching {matchingDialogProperty?.property.project_name}.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMatchingDialogProperty(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Drawer for viewing matching buyer details */}
      <LeadDrawer
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => !open && setSelectedLead(null)}
      />
    </div>
  );
}

function OwnerSubmissionsView({
  clientId,
}: {
  clientId: string | null;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [detailsSubmission, setDetailsSubmission] = useState<PropertySubmission | null>(null);
  const [editSubmission, setEditSubmission] = useState<PropertySubmission | null>(null);
  const [selectedMatchSubmission, setSelectedMatchSubmission] = useState<PropertySubmission | null>(null);

  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const { data: submissions = [], isLoading } = usePropertySubmissions();
  const { data: leads = [] } = useLeads(clientId);
  const approveMutation = useApprovePropertySubmission();
  const updateMutation = useUpdatePropertySubmission();

  const getMatchingBuyers = useMemo(() => {
    return (s: PropertySubmission) => {
      if (!s) return [];
      const subLoc = (s.location || "").toLowerCase().trim();
      const subConfig = (s.configuration || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const subPrice = Number(s.expected_price || s.expected_rent || 0);
      const cleanSubPhone = s.owner_phone ? s.owner_phone.replace(/\D/g, "").slice(-10) : "";

      return leads.filter((b) => {
        // Multi-tenant isolation: strictly same client_id
        if (s.client_id && b.client_id && b.client_id !== s.client_id) return false;
        // Do not match owner to their own listing
        if (s.lead_id && b.lead_id === s.lead_id) return false;
        if (cleanSubPhone && b.phone) {
          const cleanBuyerPhone = b.phone.replace(/\D/g, "").slice(-10);
          if (cleanBuyerPhone && cleanBuyerPhone === cleanSubPhone) return false;
        }

        // Active buyer leads only
        if (b.status === "NOT_INTERESTED" || b.status === "DROPPED" || b.status === "DEAL_WON") return false;
        if (b.lead_type === "PROVIDER") return false;

        // Locality
        const bLoc = (b.location || "").toLowerCase().trim();
        let locMatch = false;
        if (!subLoc || !bLoc) {
          locMatch = true;
        } else if (bLoc.includes(subLoc) || subLoc.includes(bLoc)) {
          locMatch = true;
        }

        // Configuration
        const bConfig = (b.property_type || b.requirement || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        let configMatch = false;
        if (!subConfig || !bConfig) {
          configMatch = true;
        } else if (bConfig.includes(subConfig) || subConfig.includes(bConfig)) {
          configMatch = true;
        }

        // Budget viability: buyer budget >= 80% of asking price
        const bBudget = Number(b.budget || 0);
        let budgetMatch = true;
        if (subPrice > 0 && bBudget > 0) {
          budgetMatch = bBudget >= subPrice * 0.8;
        }

        return locMatch && configMatch && budgetMatch;
      });
    };
  }, [leads]);

  const pendingCount = submissions.filter(
    (s) => !s.status || s.status === "PENDING_VERIFICATION",
  ).length;

  const convertedCount = submissions.filter(
    (s) => s.status === "CONVERTED_TO_INVENTORY",
  ).length;

  const rejectedCount = submissions.filter(
    (s) => s.status === "REJECTED",
  ).length;

  const filtered = submissions.filter((s) => {
    if (filter === "PENDING" && s.status && s.status !== "PENDING_VERIFICATION") return false;
    if (filter === "CONVERTED" && s.status !== "CONVERTED_TO_INVENTORY") return false;
    if (filter === "REJECTED" && s.status !== "REJECTED") return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = s.owner_name?.toLowerCase().includes(q);
      const matchPhone = s.owner_phone?.toLowerCase().includes(q);
      const matchProject =
        s.project_name?.toLowerCase().includes(q) || s.society_name?.toLowerCase().includes(q);
      const matchLoc = s.location?.toLowerCase().includes(q);
      const matchConfig = s.configuration?.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchProject && !matchLoc && !matchConfig) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Pending alert banner */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300/60 bg-amber-50/70 p-3.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-medium">
              {pendingCount} new owner {pendingCount === 1 ? "submission" : "submissions"} pending verification
            </span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 hidden sm:block">
            Review specifications and click <strong>Approve</strong> to automatically publish into live inventory.
          </p>
        </div>
      )}

      {/* Filter and search bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={filter === "ALL" ? "default" : "outline"}
            onClick={() => setFilter("ALL")}
            className="h-8 text-xs"
          >
            All ({submissions.length})
          </Button>
          <Button
            size="sm"
            variant={filter === "PENDING" ? "default" : "outline"}
            onClick={() => setFilter("PENDING")}
            className={`h-8 text-xs ${filter !== "PENDING" && pendingCount > 0 ? "border-amber-400 text-amber-600 dark:text-amber-400" : ""}`}
          >
            Pending ({pendingCount})
          </Button>
          <Button
            size="sm"
            variant={filter === "CONVERTED" ? "default" : "outline"}
            onClick={() => setFilter("CONVERTED")}
            className="h-8 text-xs"
          >
            Live Inventory ({convertedCount})
          </Button>
          <Button
            size="sm"
            variant={filter === "REJECTED" ? "default" : "outline"}
            onClick={() => setFilter("REJECTED")}
            className="h-8 text-xs"
          >
            Rejected ({rejectedCount})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search owner, project, locality..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading owner submissions…</p>}

      {!isLoading && submissions.length === 0 && (
        <Card className="p-8 text-center">
          <Building2 className="mx-auto size-10 text-muted-foreground/60 mb-2" />
          <h3 className="text-base font-medium">No owner submissions yet</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            When sellers and landlords send messages like <em>"Mera 3BHK flat bechna hai"</em> or <em>"Shop rent par deni hai"</em>, the AI conversational engine automatically gathers their society, carpet area, and expected price and lists them here for 1-click verification.
          </p>
        </Card>
      )}

      {!isLoading && submissions.length > 0 && filtered.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted-foreground">
          No property submissions match the current filter or search criteria.
        </Card>
      )}

      {!isAdmin && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <b>Restricted Mode:</b> You are signed in as a Sales Executive. Only <b>Admin</b> users can verify legal paperwork and approve owner submissions into Live Inventory.
          </span>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {/* 📱 Mobile Owner Submissions Cards (< 768px) */}
          <div className="space-y-3 md:hidden">
            {filtered.map((s) => {
              const isConverted = s.status === "CONVERTED_TO_INVENTORY";
              const isRejected = s.status === "REJECTED";
              const isPending = !s.status || s.status === "PENDING_VERIFICATION";
              const priceDisplay = s.expected_price
                ? formatMoney(Number(s.expected_price))
                : s.expected_rent
                ? `${formatMoney(Number(s.expected_rent))}/mo`
                : "Price on request";

              return (
                <div key={`m-sub-${s.id}`} className="rounded-2xl border border-border/50 bg-card p-4 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{s.owner_name || "Owner Listing"}</h4>
                      {s.owner_phone && (
                        <a href={`tel:${s.owner_phone}`} className="inline-flex items-center gap-1 text-xs text-primary font-mono font-medium mt-0.5">
                          <Phone className="size-3" /> {s.owner_phone}
                        </a>
                      )}
                    </div>
                    <ToneBadge
                      tone={PROPERTY_SUBMISSION_STATUS_MAP[s.status || "PENDING_VERIFICATION"]?.tone ?? "yellow"}
                      label={PROPERTY_SUBMISSION_STATUS_MAP[s.status || "PENDING_VERIFICATION"]?.label ?? (s.status || "Pending")}
                    />
                  </div>

                  <div className="text-xs bg-muted/40 rounded-xl p-3 border border-border/40 space-y-1">
                    <div className="font-semibold text-foreground text-sm flex items-center justify-between">
                      <span className="truncate pr-2">{s.project_name || s.society_name || "Direct Owner Listing"}</span>
                      <span className="font-bold shrink-0 tabular-nums">{priceDisplay}</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      {s.property_category || "RESIDENTIAL"} · {s.configuration?.replaceAll("_", " ") || "—"} · 📍 {s.location || "Vadodara"}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {s.carpet_area_sqft ? `${s.carpet_area_sqft} sq.ft carpet` : s.super_built_up_sqft ? `${s.super_built_up_sqft} sq.ft built-up` : "Area not specified"}
                    </p>
                  </div>

                  {/* 🤝 In-House Buyer Cross-Match Badge */}
                  {(() => {
                    const matchingBuyers = getMatchingBuyers(s);
                    return (
                      <div className="flex items-center justify-between pt-0.5">
                        {matchingBuyers.length > 0 ? (
                          <Badge
                            variant="outline"
                            onClick={() => setSelectedMatchSubmission(s)}
                            className="cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 py-1 px-2.5 rounded-lg text-xs font-semibold transition-all shadow-2xs"
                          >
                            <Users className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{matchingBuyers.length} In-House {matchingBuyers.length === 1 ? "Buyer" : "Buyers"} Matching</span>
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/70 inline-flex items-center gap-1">
                            <Users className="size-3 text-muted-foreground/50" /> 0 matching buyers
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                    {s.owner_phone && (
                      <Button asChild size="sm" variant="outline" className="apple-button min-h-[40px] flex-1 rounded-xl text-xs font-semibold">
                        <a href={`tel:${s.owner_phone}`}>
                          <Phone className="size-3.5 mr-1 text-primary" /> Call
                        </a>
                      </Button>
                    )}
                    {isPending && (
                      <>
                        <Button
                          size="sm"
                          className={`apple-button min-h-[40px] flex-1 rounded-xl text-xs font-semibold shadow-2xs ${
                            isAdmin
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                          }`}
                          disabled={approveMutation.isPending || !isAdmin}
                          onClick={() => {
                            if (!isAdmin) {
                              toast.error("Admin approval required: Only an Admin can convert owner listings into Live Inventory.");
                              return;
                            }
                            approveMutation.mutate({ submission: s, clientId });
                          }}
                          title={isAdmin ? "Approve & Convert to Live Inventory" : "Admin approval required"}
                        >
                          <CheckCircle2 className="size-3.5 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="apple-button min-h-[40px] px-3 rounded-xl text-xs text-destructive hover:bg-destructive/10"
                          disabled={updateMutation.isPending || !isAdmin}
                          onClick={() => {
                            if (!isAdmin) {
                              toast.error("Admin access required: Only an Admin can reject owner listings.");
                              return;
                            }
                            updateMutation.mutate({ id: s.id, values: { status: "REJECTED" } });
                          }}
                          aria-label="Reject submission"
                          title={isAdmin ? "Reject submission" : "Admin access required"}
                        >
                          <XCircle className="size-3.5" />
                        </Button>
                      </>
                    )}
                    {isConverted && (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Live in Inventory
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="apple-button min-h-[40px] px-2.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setDetailsSubmission(s)}
                      aria-label="View details"
                    >
                      <Eye className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 💻 Desktop Table (>= 768px) */}
          <div className="hidden md:block rounded-2xl border border-border/50 bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[200px]">Owner</TableHead>
                <TableHead>Property Specs</TableHead>
                <TableHead>Area & Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const isConverted = s.status === "CONVERTED_TO_INVENTORY";
                const isRejected = s.status === "REJECTED";
                const isPending = !s.status || s.status === "PENDING_VERIFICATION";
                const priceDisplay = s.expected_price
                  ? formatMoney(Number(s.expected_price))
                  : s.expected_rent
                  ? `${formatMoney(Number(s.expected_rent))}/mo`
                  : "Price on request";

                return (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="align-top">
                      <div className="font-medium text-sm text-foreground">
                        {s.owner_name || "Owner"}
                      </div>
                      {s.owner_phone && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <a
                            href={`tel:${s.owner_phone}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline font-mono font-medium"
                            title="Call Owner"
                          >
                            <Phone className="size-3" />
                            {s.owner_phone}
                          </a>
                        </div>
                      )}
                      {s.lead_id && (
                        <div className="mt-1 text-[11px] font-mono text-muted-foreground">
                          ID: {s.lead_id.length > 15 ? `${s.lead_id.slice(0, 15)}…` : s.lead_id}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm">
                          {s.project_name || s.society_name || "Direct Owner Listing"}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {s.transaction_type || "SELL"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.property_category || "RESIDENTIAL"} · {s.configuration?.replaceAll("_", " ") || "—"} · 📍 {s.location || "Vadodara"}
                      </p>
                      {s.notes && (
                        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1 italic">
                          "{s.notes}"
                        </p>
                      )}

                      {/* 🤝 In-House Buyer Cross-Match Badge */}
                      <div className="mt-2">
                        {(() => {
                          const matchingBuyers = getMatchingBuyers(s);
                          return matchingBuyers.length > 0 ? (
                            <Badge
                              variant="outline"
                              onClick={() => setSelectedMatchSubmission(s)}
                              className="cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5 py-0.5 px-2 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center shadow-2xs"
                              title="Click to view matching buyers and pitch property"
                            >
                              <Users className="size-3 text-emerald-600 dark:text-emerald-400" />
                              <span>{matchingBuyers.length} In-House {matchingBuyers.length === 1 ? "Buyer" : "Buyers"} Matching</span>
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60 inline-flex items-center gap-1">
                              <Users className="size-3 text-muted-foreground/40" /> 0 matching buyers
                            </span>
                          );
                        })()}
                      </div>
                    </TableCell>

                    <TableCell className="align-top">
                      <div className="font-semibold text-sm text-foreground">
                        {priceDisplay}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.carpet_area_sqft
                          ? `${s.carpet_area_sqft} sq.ft carpet`
                          : s.super_built_up_sqft
                          ? `${s.super_built_up_sqft} sq.ft built-up`
                          : "Area not specified"}
                      </div>
                      {(s.possession_status || s.furnishing_status) && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {[s.possession_status?.replaceAll("_", " "), s.furnishing_status?.replaceAll("_", " ")]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      <ToneBadge
                        tone={PROPERTY_SUBMISSION_STATUS_MAP[s.status || "PENDING_VERIFICATION"]?.tone ?? "yellow"}
                        label={PROPERTY_SUBMISSION_STATUS_MAP[s.status || "PENDING_VERIFICATION"]?.label ?? (s.status || "Pending")}
                      />
                    </TableCell>

                    <TableCell className="align-top text-xs text-muted-foreground whitespace-nowrap">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                    </TableCell>

                    <TableCell className="align-top text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {isPending && (
                          <>
                            <Button
                              size="sm"
                              className={`h-7 text-xs ${
                                isAdmin
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                              }`}
                              disabled={approveMutation.isPending || !isAdmin}
                              onClick={() => {
                                if (!isAdmin) {
                                  toast.error("Admin approval required: Only an Admin can convert owner listings into Live Inventory.");
                                  return;
                                }
                                approveMutation.mutate({ submission: s, clientId });
                              }}
                              title={isAdmin ? "Convert to Live Inventory for Seeker Matching" : "Admin approval required to convert submission"}
                            >
                              <CheckCircle2 className="size-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              disabled={updateMutation.isPending || !isAdmin}
                              onClick={() => {
                                if (!isAdmin) {
                                  toast.error("Admin access required: Only an Admin can reject owner listings.");
                                  return;
                                }
                                updateMutation.mutate({ id: s.id, values: { status: "REJECTED" } });
                              }}
                              title={isAdmin ? "Reject submission" : "Admin access required"}
                            >
                              <XCircle className="size-3.5" />
                            </Button>
                          </>
                        )}
                        {isConverted && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="size-3" /> Live
                          </span>
                        )}
                        {isRejected && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={updateMutation.isPending || !isAdmin}
                            onClick={() => {
                              if (!isAdmin) {
                                toast.error("Admin access required: Only an Admin can reopen rejected submissions.");
                                return;
                              }
                              updateMutation.mutate({ id: s.id, values: { status: "PENDING_VERIFICATION" } });
                            }}
                            title={isAdmin ? "Reopen submission" : "Admin access required"}
                          >
                            Reopen
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                          onClick={() => setSelectedMatchSubmission(s)}
                          title="Open In-House Buyer Cross-Matchmaker"
                        >
                          <Users className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setDetailsSubmission(s)}
                          title="View complete details"
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditSubmission(s)}
                          title="Edit submission details"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    )}

      {/* Details Dialog */}
      {detailsSubmission && (
        <Dialog open={!!detailsSubmission} onOpenChange={(open) => !open && setDetailsSubmission(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <span>{detailsSubmission.project_name || detailsSubmission.society_name || "Owner Property Submission"}</span>
                <ToneBadge
                  tone={PROPERTY_SUBMISSION_STATUS_MAP[detailsSubmission.status || "PENDING_VERIFICATION"]?.tone ?? "yellow"}
                  label={PROPERTY_SUBMISSION_STATUS_MAP[detailsSubmission.status || "PENDING_VERIFICATION"]?.label ?? (detailsSubmission.status || "Pending")}
                />
              </DialogTitle>
              <DialogDescription>
                Submitted by {detailsSubmission.owner_name || "Property Owner"} on{" "}
                {detailsSubmission.created_at ? new Date(detailsSubmission.created_at).toLocaleString("en-IN") : "recently"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm py-2">
              <div className="rounded-lg border bg-muted/40 p-2.5">
                <span className="text-xs text-muted-foreground block">Owner Details</span>
                <span className="font-semibold block">{detailsSubmission.owner_name || "—"}</span>
                <span className="text-xs font-mono text-muted-foreground block">{detailsSubmission.owner_phone || "—"}</span>
                {detailsSubmission.owner_phone && (
                  <a
                    href={`tel:${detailsSubmission.owner_phone}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1 font-medium"
                  >
                    <Phone className="size-3" /> Call Owner ({detailsSubmission.owner_phone})
                  </a>
                )}
              </div>

              <div className="rounded-lg border bg-muted/40 p-2.5">
                <span className="text-xs text-muted-foreground block">Location & Society</span>
                <span className="font-semibold block">{detailsSubmission.society_name || detailsSubmission.project_name || "—"}</span>
                <span className="text-xs text-muted-foreground block">📍 {detailsSubmission.location || "Vadodara"}</span>
              </div>

              <div className="rounded-lg border bg-muted/40 p-2.5">
                <span className="text-xs text-muted-foreground block">Category & Type</span>
                <span className="font-semibold block">{detailsSubmission.property_category || "RESIDENTIAL"}</span>
                <span className="text-xs text-muted-foreground block">{detailsSubmission.configuration || "—"} ({detailsSubmission.transaction_type || "SELL"})</span>
              </div>

              <div className="rounded-lg border bg-muted/40 p-2.5">
                <span className="text-xs text-muted-foreground block">Carpet & Built-up Area</span>
                <span className="font-semibold block">{detailsSubmission.carpet_area_sqft ? `${detailsSubmission.carpet_area_sqft} sq.ft` : "—"}</span>
                <span className="text-xs text-muted-foreground block">{detailsSubmission.super_built_up_sqft ? `${detailsSubmission.super_built_up_sqft} sq.ft super` : "—"}</span>
              </div>

              <div className="rounded-lg border bg-muted/40 p-2.5">
                <span className="text-xs text-muted-foreground block">Asking Price / Rent</span>
                <span className="font-semibold block text-base text-primary">
                  {detailsSubmission.expected_price
                    ? formatMoney(Number(detailsSubmission.expected_price))
                    : detailsSubmission.expected_rent
                    ? `${formatMoney(Number(detailsSubmission.expected_rent))}/mo`
                    : "Not specified"}
                </span>
              </div>

              <div className="rounded-lg border bg-muted/40 p-2.5">
                <span className="text-xs text-muted-foreground block">Status & Furnishing</span>
                <span className="font-semibold block">{detailsSubmission.possession_status?.replaceAll("_", " ") || "—"}</span>
                <span className="text-xs text-muted-foreground block">{detailsSubmission.furnishing_status?.replaceAll("_", " ") || "—"}</span>
              </div>
            </div>

            {detailsSubmission.notes && (
              <div className="rounded-lg border p-2.5 bg-background">
                <span className="text-xs font-medium text-muted-foreground block mb-1">Notes / Special Instructions</span>
                <p className="text-xs leading-relaxed text-foreground">{detailsSubmission.notes}</p>
              </div>
            )}

            {detailsSubmission.attributes && typeof detailsSubmission.attributes === "object" && (
              (() => {
                const attrs = detailsSubmission.attributes as Record<string, unknown>;
                const specs = [
                  attrs.floor_number !== undefined && attrs.floor_number !== null
                    ? `Floor: ${attrs.floor_number}${attrs.total_floors ? ` of ${attrs.total_floors}` : ""}`
                    : null,
                  attrs.bathrooms ? `${attrs.bathrooms} Bathrooms` : null,
                  attrs.balconies ? `${attrs.balconies} Balconies` : null,
                  attrs.parking ? `${attrs.parking} Parking` : null,
                ].filter(Boolean);
                if (specs.length === 0) return null;
                return (
                  <div className="rounded-lg border bg-muted/20 p-2.5">
                    <span className="text-xs text-muted-foreground block mb-1">Additional Specifications</span>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {specs.map((s, idx) => (
                        <span key={idx} className="rounded bg-muted px-2 py-0.5 font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}

            <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Lead Ref: {detailsSubmission.lead_id || "—"}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  onClick={() => {
                    const toMatch = detailsSubmission;
                    setDetailsSubmission(null);
                    setSelectedMatchSubmission(toMatch);
                  }}
                  title="View matching in-house buyers"
                >
                  <Users className="size-3.5 mr-1.5" />
                  Matching Buyers
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const toEdit = detailsSubmission;
                    setDetailsSubmission(null);
                    setEditSubmission(toEdit);
                  }}
                  title="Edit submission details"
                >
                  <Pencil className="size-3.5 mr-1.5" />
                  Edit Details
                </Button>
                {detailsSubmission.status !== "CONVERTED_TO_INVENTORY" && (
                  <Button
                    size="sm"
                    className={
                      isAdmin
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                    }
                    disabled={approveMutation.isPending || !isAdmin}
                    onClick={() => {
                      if (!isAdmin) {
                        toast.error("Admin approval required: Only an Admin can convert owner listings into Live Inventory.");
                        return;
                      }
                      approveMutation.mutate({ submission: detailsSubmission, clientId });
                      setDetailsSubmission(null);
                    }}
                    title={isAdmin ? "Approve & Add to Live Inventory" : "Admin approval required"}
                  >
                    <CheckCircle2 className="size-4 mr-1.5" />
                    Approve & Add to Live Inventory
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setDetailsSubmission(null)}>
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 🤝 In-House Buyer Cross-Matchmaker Sheet */}
      <Sheet open={!!selectedMatchSubmission} onOpenChange={(open) => !open && setSelectedMatchSubmission(null)}>
        <SheetContent className="sm:max-w-xl w-full flex flex-col p-0 overflow-hidden bg-background">
          {selectedMatchSubmission && (
            <>
              <SheetHeader className="p-5 border-b border-border/50 bg-muted/20">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <SheetTitle className="text-base font-bold text-foreground">
                      In-House Buyer Cross-Matchmaker
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                      Double-ended brokerage opportunities for verified owner resale
                    </SheetDescription>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span>{selectedMatchSubmission.project_name || selectedMatchSubmission.society_name || "Owner Listing"}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {selectedMatchSubmission.expected_price
                        ? formatMoney(Number(selectedMatchSubmission.expected_price))
                        : selectedMatchSubmission.expected_rent
                        ? `${formatMoney(Number(selectedMatchSubmission.expected_rent))}/mo`
                        : "Price on request"}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {selectedMatchSubmission.property_category || "RESIDENTIAL"} · {selectedMatchSubmission.configuration?.replaceAll("_", " ") || "—"} · 📍 {selectedMatchSubmission.location || "Vadodara"}
                    {selectedMatchSubmission.carpet_area_sqft ? ` · ${selectedMatchSubmission.carpet_area_sqft} sq.ft` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Owner: <b>{selectedMatchSubmission.owner_name || "Direct Owner"}</b> {selectedMatchSubmission.owner_phone ? `(${selectedMatchSubmission.owner_phone})` : ""}
                  </p>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {(() => {
                  const buyers = getMatchingBuyers(selectedMatchSubmission);
                  if (buyers.length === 0) {
                    return (
                      <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center space-y-2">
                        <Users className="mx-auto size-8 text-muted-foreground/50" />
                        <h4 className="font-semibold text-sm">No active buyer matches right now</h4>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          There are currently no active buyer leads in your CRM looking for {selectedMatchSubmission.configuration || "this configuration"} in {selectedMatchSubmission.location || "this area"}. As new buyer leads arrive, they will automatically appear here.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
                        <span className="font-semibold text-foreground">
                          {buyers.length} Matching In-House {buyers.length === 1 ? "Buyer" : "Buyers"}
                        </span>
                        <span>1-Tap WhatsApp Resale Pitch</span>
                      </div>

                      {buyers.map((b) => {
                        const pitchMessage = `Hello ${b.name || "Client"}! We have an exclusive verified owner resale listing at ${selectedMatchSubmission.society_name || selectedMatchSubmission.project_name || "prime location"} (${selectedMatchSubmission.configuration || "property"} in ${selectedMatchSubmission.location || "city"}) matching your budget of ${formatMoney(b.budget)}. Would you like to review the layout photos or schedule a private site visit? 🏡`;
                        const waUrl = toWhatsAppUrl(b.phone, pitchMessage);

                        return (
                          <div
                            key={b.lead_id}
                            className="rounded-2xl border border-border/50 bg-card p-4 shadow-xs space-y-3 hover:border-emerald-500/30 transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-bold text-sm text-foreground">{b.name || "Prospective Buyer"}</h4>
                                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                  {b.phone && <span className="font-mono">{b.phone}</span>}
                                  <span>·</span>
                                  <span>📍 {b.location || "Any location"}</span>
                                </div>
                              </div>
                              <LeadScoreBadge lead={b} />
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-xl border border-border/30">
                              <div>
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Buyer Budget</span>
                                <span className="font-bold text-foreground">{formatMoney(b.budget)}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Requirement</span>
                                <span className="font-semibold text-foreground truncate block">
                                  {b.property_type || b.requirement || "Residential"}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                              {b.phone && (
                                <Button asChild size="sm" variant="outline" className="apple-button h-9 flex-1 rounded-xl text-xs font-semibold">
                                  <a href={`tel:${b.phone}`}>
                                    <Phone className="size-3.5 mr-1 text-primary" /> Call
                                  </a>
                                </Button>
                              )}
                              <Button
                                asChild
                                size="sm"
                                className="apple-button h-9 flex-1 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                              >
                                <a
                                  href={waUrl || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <MessageSquare className="size-3.5 mr-1" /> Pitch Resale
                                </a>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Submission Dialog */}
      <EditOwnerSubmissionDialog
        submission={editSubmission}
        open={!!editSubmission}
        onOpenChange={(open) => !open && setEditSubmission(null)}
      />
    </div>
  );
}

function EditOwnerSubmissionDialog({
  submission,
  open,
  onOpenChange,
}: {
  submission: PropertySubmission | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateMutation = useUpdatePropertySubmission();

  const [form, setForm] = useState({
    owner_name: "",
    owner_phone: "",
    project_name: "",
    society_name: "",
    location: "",
    property_category: "RESIDENTIAL",
    configuration: "2BHK",
    transaction_type: "SELL",
    expected_price: "",
    expected_rent: "",
    carpet_area_sqft: "",
    super_built_up_sqft: "",
    possession_status: "READY_TO_MOVE",
    furnishing_status: "UNFURNISHED",
    notes: "",
    floor_number: "",
    total_floors: "",
    bathrooms: "",
    balconies: "",
    parking: "",
  });

  useEffect(() => {
    if (submission) {
      const rawAttrs =
        typeof submission.attributes === "object" && submission.attributes !== null
          ? (submission.attributes as Record<string, unknown>)
          : {};

      setForm({
        owner_name: submission.owner_name ?? "",
        owner_phone: submission.owner_phone ?? "",
        project_name: submission.project_name ?? submission.society_name ?? "",
        society_name: submission.society_name ?? submission.project_name ?? "",
        location: submission.location ?? "Vadodara",
        property_category: submission.property_category ?? "RESIDENTIAL",
        configuration: submission.configuration ?? "2BHK",
        transaction_type: submission.transaction_type ?? "SELL",
        expected_price: submission.expected_price ? String(submission.expected_price) : "",
        expected_rent: submission.expected_rent ? String(submission.expected_rent) : "",
        carpet_area_sqft: submission.carpet_area_sqft ? String(submission.carpet_area_sqft) : "",
        super_built_up_sqft: submission.super_built_up_sqft ? String(submission.super_built_up_sqft) : "",
        possession_status: submission.possession_status ?? "READY_TO_MOVE",
        furnishing_status: submission.furnishing_status ?? "UNFURNISHED",
        notes: submission.notes ?? "",
        floor_number:
          rawAttrs.floor_number !== undefined && rawAttrs.floor_number !== null
            ? String(rawAttrs.floor_number)
            : "",
        total_floors:
          rawAttrs.total_floors !== undefined && rawAttrs.total_floors !== null
            ? String(rawAttrs.total_floors)
            : "",
        bathrooms:
          rawAttrs.bathrooms !== undefined && rawAttrs.bathrooms !== null
            ? String(rawAttrs.bathrooms)
            : "",
        balconies:
          rawAttrs.balconies !== undefined && rawAttrs.balconies !== null
            ? String(rawAttrs.balconies)
            : "",
        parking:
          rawAttrs.parking !== undefined && rawAttrs.parking !== null
            ? String(rawAttrs.parking)
            : "",
      });
    }
  }, [submission]);

  const setField = (key: string, val: string) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submission) return;

    const rawAttrs =
      typeof submission.attributes === "object" && submission.attributes !== null
        ? (submission.attributes as Record<string, unknown>)
        : {};

    const updatedAttrs = {
      ...rawAttrs,
      floor_number: form.floor_number.trim() ? Number(form.floor_number) : null,
      total_floors: form.total_floors.trim() ? Number(form.total_floors) : null,
      bathrooms: form.bathrooms.trim() ? Number(form.bathrooms) : null,
      balconies: form.balconies.trim() ? Number(form.balconies) : null,
      parking: form.parking.trim() ? form.parking.trim() : null,
      owner_name: form.owner_name.trim() || null,
      owner_phone: form.owner_phone.trim() || null,
    };

    const payload: Partial<PropertySubmission> = {
      owner_name: form.owner_name.trim() || null,
      owner_phone: form.owner_phone.trim() || null,
      project_name: form.project_name.trim() || null,
      society_name: form.society_name.trim() || form.project_name.trim() || null,
      location: form.location.trim() || null,
      property_category: form.property_category || "RESIDENTIAL",
      configuration: form.configuration || null,
      transaction_type: form.transaction_type || "SELL",
      expected_price: form.expected_price.trim() ? Number(form.expected_price) : null,
      expected_rent: form.expected_rent.trim() ? Number(form.expected_rent) : null,
      carpet_area_sqft: form.carpet_area_sqft.trim() ? Number(form.carpet_area_sqft) : null,
      super_built_up_sqft: form.super_built_up_sqft.trim() ? Number(form.super_built_up_sqft) : null,
      possession_status: form.possession_status || null,
      furnishing_status: form.furnishing_status || null,
      notes: form.notes.trim() || null,
      attributes: updatedAttrs as never,
    };

    try {
      await updateMutation.mutateAsync({
        id: submission.id,
        values: payload,
      });
      onOpenChange(false);
    } catch {
      // Error is surfaced by mutation toast
    }
  };

  const CATEGORY_OPTIONS = ["RESIDENTIAL", "COMMERCIAL", "LAND_PLOT", "FLAT", "VILLA", "PLOT"];
  const CONFIG_OPTIONS = [
    "1RK",
    "1BHK",
    "2BHK",
    "3BHK",
    "4BHK",
    "5BHK",
    "PENTHOUSE",
    "DUPLEX",
    "VILLA",
    "SHOP",
    "SHOWROOM",
    "OFFICE",
    "WAREHOUSE",
    "PLOT",
    "AGRICULTURAL_LAND",
  ];
  const TX_OPTIONS = ["SELL", "RENT", "LEASE"];
  const POSSESSION_OPTIONS = [
    "READY_TO_MOVE",
    "UNDER_CONSTRUCTION",
    "RESALE",
    "WITHIN_3_MONTHS",
    "WITHIN_6_MONTHS",
  ];
  const FURNISHING_OPTIONS = ["UNFURNISHED", "SEMI_FURNISHED", "FULLY_FURNISHED"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4 text-primary" />
            <span>Edit Owner Property Submission</span>
          </DialogTitle>
          <DialogDescription>
            Update owner contact, project specifications, and expected price before or after verification.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-1">
          {/* Section: Owner Information */}
          <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <User className="size-3.5 text-muted-foreground" />
              <span>Owner Contact Information</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Owner Name</Label>
                <Input
                  value={form.owner_name}
                  onChange={(e) => setField("owner_name", e.target.value)}
                  placeholder="e.g. Rajesh Patel"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Owner Phone</Label>
                <Input
                  value={form.owner_phone}
                  onChange={(e) => setField("owner_phone", e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section: Property Identification & Location */}
          <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Building2 className="size-3.5 text-muted-foreground" />
              <span>Property & Locality Details</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Project / Society Name</Label>
                <Input
                  value={form.project_name}
                  onChange={(e) => {
                    setField("project_name", e.target.value);
                    setField("society_name", e.target.value);
                  }}
                  placeholder="e.g. Nilamber Bellissimo"
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Location / Area</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                  placeholder="e.g. Waghodia, Vasna, Gotri"
                  className="h-8 text-xs"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Category</Label>
                <Select
                  value={form.property_category}
                  onValueChange={(val) => setField("property_category", val)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {c.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Configuration</Label>
                <Select
                  value={form.configuration}
                  onValueChange={(val) => setField("configuration", val)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Config" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIG_OPTIONS.map((cfg) => (
                      <SelectItem key={cfg} value={cfg} className="text-xs">
                        {cfg.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Transaction Type</Label>
                <Select
                  value={form.transaction_type}
                  onValueChange={(val) => setField("transaction_type", val)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TX_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section: Pricing & Area */}
          <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>💰 Commercials & Sizing</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  Expected Sale Price (₹)
                  {form.expected_price && Number(form.expected_price) > 0 && (
                    <span className="ml-1 text-[11px] font-normal text-primary">
                      ({formatMoney(Number(form.expected_price))})
                    </span>
                  )}
                </Label>
                <Input
                  type="number"
                  value={form.expected_price}
                  onChange={(e) => setField("expected_price", e.target.value)}
                  placeholder="e.g. 7500000"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  Expected Rent (₹/month)
                  {form.expected_rent && Number(form.expected_rent) > 0 && (
                    <span className="ml-1 text-[11px] font-normal text-primary">
                      ({formatMoney(Number(form.expected_rent))}/mo)
                    </span>
                  )}
                </Label>
                <Input
                  type="number"
                  value={form.expected_rent}
                  onChange={(e) => setField("expected_rent", e.target.value)}
                  placeholder="e.g. 25000"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Carpet Area (sq.ft)</Label>
                <Input
                  type="number"
                  value={form.carpet_area_sqft}
                  onChange={(e) => setField("carpet_area_sqft", e.target.value)}
                  placeholder="e.g. 1250"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Super Built-up Area (sq.ft)</Label>
                <Input
                  type="number"
                  value={form.super_built_up_sqft}
                  onChange={(e) => setField("super_built_up_sqft", e.target.value)}
                  placeholder="e.g. 1650"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section: Status & Interior Specs */}
          <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>🏗️ Status & Specifications</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Possession Status</Label>
                <Select
                  value={form.possession_status}
                  onValueChange={(val) => setField("possession_status", val)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Possession" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSSESSION_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">
                        {p.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">Furnishing Status</Label>
                <Select
                  value={form.furnishing_status}
                  onValueChange={(val) => setField("furnishing_status", val)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Furnishing" />
                  </SelectTrigger>
                  <SelectContent>
                    {FURNISHING_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {f.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Floor</Label>
                <Input
                  type="number"
                  value={form.floor_number}
                  onChange={(e) => setField("floor_number", e.target.value)}
                  placeholder="e.g. 4"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Total Floors</Label>
                <Input
                  type="number"
                  value={form.total_floors}
                  onChange={(e) => setField("total_floors", e.target.value)}
                  placeholder="e.g. 10"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Baths</Label>
                <Input
                  type="number"
                  value={form.bathrooms}
                  onChange={(e) => setField("bathrooms", e.target.value)}
                  placeholder="e.g. 3"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Balconies</Label>
                <Input
                  type="number"
                  value={form.balconies}
                  onChange={(e) => setField("balconies", e.target.value)}
                  placeholder="e.g. 2"
                  className="h-7 text-xs"
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <Label className="text-[11px] text-muted-foreground">Parking</Label>
                <Input
                  value={form.parking}
                  onChange={(e) => setField("parking", e.target.value)}
                  placeholder="1 Covered"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section: Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Realtor Notes / Verification Remarks</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="e.g. Corner flat, East facing, owner open to slight negotiation on token..."
              rows={3}
              className="text-xs resize-none"
            />
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-3 border-t">
            <span className="text-xs text-muted-foreground">
              Lead ID: {submission?.lead_id ? `${submission.lead_id.slice(0, 14)}…` : "Direct"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updateMutation.isPending}
                className="bg-primary text-primary-foreground"
              >
                {updateMutation.isPending ? "Saving Changes…" : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function PropertyForm({
  draft,
  isNew,
  clientId,
  onClose,
}: {
  draft: Draft | null;
  isNew: boolean;
  clientId: string | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Draft>(draft ?? EMPTY);
  const [uploading, setUploading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const save = useSaveProperty();
  const { data: executives = [] } = useExecutives();

  const open = !!draft;
  const current = values;

  // Re-sync local state whenever a different property is opened.
  const openedRef = draft ? JSON.stringify(draft) : "";
  const [lastOpened, setLastOpened] = useState("");
  if (open && openedRef !== lastOpened) {
    setLastOpened(openedRef);
    setValues(draft as Draft);
  }

  const set = (k: keyof Draft, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const toggleAmenity = (amenity: string) =>
    setValues((p) => ({
      ...p,
      amenities: p.amenities.includes(amenity)
        ? p.amenities.filter((a) => a !== amenity)
        : [...p.amenities, amenity],
    }));

  const removeImage = (url: string) =>
    setValues((p) => ({ ...p, image_urls: p.image_urls.filter((u) => u !== url) }));

  const submit = () => {
    if (!current.project_name || !current.location) {
      toast.error("Project name and location are required");
      return;
    }
    if (current.map_url && !isValidUrl(current.map_url)) {
      toast.error("Enter a valid map URL (https://…)");
      return;
    }
    // Configuration encodes the BHK count for FLAT/VILLA (e.g. "3BHK") —
    // keep the numeric `bhk_num` column in sync with it rather than asking
    // for the number twice; commercial units/plots have no BHK count.
    const bhkMatch = /(\d+)\s*BHK/i.exec(current.configuration);
    const bhk_num = bhkMatch ? Number(bhkMatch[1]) : null;

    // Commercial-only physical/utility specs live in `attributes` (jsonb).
    // Also persist floor_number, total_floors, bathrooms, balconies, and description.
    const commercialSpecs =
      current.property_category === "COMMERCIAL"
        ? Object.fromEntries(
            COMMERCIAL_ATTRIBUTE_FIELDS.map(({ key }) => [
              key,
              toNumber(current[ATTRIBUTE_FIELD_TO_DRAFT_KEY[key]] as string),
            ]).filter(([, v]) => v !== null),
          )
        : {};

    const attributes: Record<string, unknown> = {
      ...commercialSpecs,
      ...(bhk_num !== null ? { bhk_num } : {}),
      ...(current.floor_number ? { floor_number: toNumber(current.floor_number) } : {}),
      ...(current.total_floors ? { total_floors: toNumber(current.total_floors) } : {}),
      ...(current.bathrooms ? { bathrooms: toNumber(current.bathrooms) } : {}),
      ...(current.balconies ? { balconies: toNumber(current.balconies) } : {}),
      ...(current.description?.trim() ? { description: current.description.trim() } : {}),
    };

    const payload = {
      property_id: current.property_id || `PROP-${Date.now()}`,
      project_name: current.project_name,
      property_category: current.property_category,
      configuration: current.configuration,
      bhk_num,
      location: current.location,
      price: toNumber(current.price) ?? 0,
      area_sqft: toNumber(current.area_sqft),
      status: current.status,
      stock_type: current.stock_type,
      listing_type: current.listing_type || null,
      furnished_status: current.furnished_status || null,
      possession_status: current.possession_status || null,
      brochure_url: current.brochure_url || null,
      map_url: current.map_url || null,
      assigned_executive_id: current.assigned_executive_id || null,
      attributes,
      rera_number: current.rera_number || null,
      carpet_area_sqft: toNumber(current.carpet_area_sqft),
      super_built_up_area_sqft: toNumber(current.super_built_up_area_sqft),
      property_age_years: toNumber(current.property_age_years),
      transaction_type: current.transaction_type || null,
      facing: current.facing || null,
      ownership_type: current.ownership_type || null,
      price_negotiable: current.price_negotiable === "true",
      maintenance_charges: toNumber(current.maintenance_charges),
      amenities: current.amenities,
      image_urls: current.image_urls,
      landmarks: current.landmarks_input
        ? current.landmarks_input
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      city: current.city ? current.city.trim() : null,
    };
    save.mutate({ values: payload, isNew, clientId }, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add property" : "Edit property"}</DialogTitle>
          <DialogDescription>All prices and areas are saved as plain numbers.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {!isNew && (
            <Field label="Property ID">
              <Input value={current.property_id} disabled onChange={() => {}} />
            </Field>
          )}
          <Field label="Project name">
            <Input
              value={current.project_name}
              onChange={(e) => set("project_name", e.target.value)}
            />
          </Field>
          <Field label="RERA number">
            <Input
              value={current.rera_number}
              placeholder="Optional"
              onChange={(e) => set("rera_number", e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Dropdown
              value={current.property_category}
              options={PROPERTY_CATEGORIES}
              onChange={(v) => {
                // Configuration options depend on the category (a flat can be
                // 1-5 BHK, a commercial unit is a Shop/Office, a plot is just
                // a plot) — reset it whenever the category changes so a
                // stale, no-longer-valid configuration never gets saved.
                const validOptions = configurationsForCategory(v);
                setValues((p) => ({
                  ...p,
                  property_category: v,
                  configuration: validOptions.includes(p.configuration)
                    ? p.configuration
                    : (validOptions[0] ?? ""),
                }));
              }}
            />
          </Field>
          <Field label="Configuration">
            <Dropdown
              value={current.configuration}
              options={configurationsForCategory(current.property_category)}
              onChange={(v) => set("configuration", v)}
            />
          </Field>
          <Field label="City">
            <Input
              value={current.city}
              placeholder="e.g. Vadodara, Ahmedabad, Pune"
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
          <Field label="Location / Area">
            <Input
              value={current.location}
              placeholder="e.g. Gotri, Bhayli, Vastrapur"
              onChange={(e) => {
                const raw = e.target.value;
                // Normalise to Title Case so "waghodia" and "Waghodia" are never stored differently
                const titleCase = raw
                  .split(" ")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join(" ");
                set("location", titleCase);
              }}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Landmarks & Nearby Spots (Comma separated)">
              <Input
                value={current.landmarks_input}
                placeholder="e.g. Near Bansal Mall, Gotri D-Mart, Yash Complex"
                onChange={(e) => set("landmarks_input", e.target.value)}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Property Highlights & Description">
              <Textarea
                value={current.description}
                placeholder="Key features, landmark proximity, special amenities, developer highlights…"
                rows={3}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Status">
            <Dropdown
              value={current.status}
              options={INVENTORY_STATUSES}
              onChange={(v) => set("status", v)}
            />
          </Field>
          <Field label="Transaction type">
            <Dropdown
              value={current.transaction_type}
              options={TRANSACTION_TYPES}
              onChange={(v) => set("transaction_type", v)}
            />
          </Field>
          <Field label="Ownership type">
            <Dropdown
              value={current.ownership_type}
              options={OWNERSHIP_TYPES}
              onChange={(v) => set("ownership_type", v)}
            />
          </Field>
          <Field label="Facing">
            <Dropdown
              value={current.facing}
              options={FACING_OPTIONS}
              onChange={(v) => set("facing", v)}
            />
          </Field>
          <Field label="Property age (years)">
            <Input
              inputMode="numeric"
              value={current.property_age_years}
              placeholder="0 for new construction"
              onChange={(e) => set("property_age_years", e.target.value)}
            />
          </Field>
          <Field label="Price">
            <Input
              inputMode="numeric"
              value={current.price}
              onChange={(e) => set("price", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{formatMoney(toNumber(current.price))}</p>
          </Field>
          <Field label="Price negotiable">
            <div className="flex h-9 items-center gap-2">
              <Switch
                checked={current.price_negotiable === "true"}
                onCheckedChange={(v) => set("price_negotiable", v ? "true" : "false")}
              />
              <span className="text-sm text-muted-foreground">
                {current.price_negotiable === "true" ? "Yes" : "No"}
              </span>
            </div>
          </Field>
          {!["PLOT", "LAND"].includes(current.property_category) && (
            <Field label="Maintenance charges (₹/month)">
              <Input
                inputMode="numeric"
                value={current.maintenance_charges}
                placeholder="Optional"
                onChange={(e) => set("maintenance_charges", e.target.value)}
              />
            </Field>
          )}
          <Field label={["PLOT", "LAND"].includes(current.property_category) ? "Plot / Land area (sq.ft)" : "Built-up area (sq.ft)"}>
            <Input
              inputMode="numeric"
              value={current.area_sqft}
              onChange={(e) => set("area_sqft", e.target.value)}
            />
          </Field>
          {!["PLOT", "LAND"].includes(current.property_category) && (
            <Field label="Carpet area (sq.ft)">
              <Input
                inputMode="numeric"
                value={current.carpet_area_sqft}
                placeholder="Optional"
                onChange={(e) => set("carpet_area_sqft", e.target.value)}
              />
            </Field>
          )}
          {!["PLOT", "LAND"].includes(current.property_category) && (
            <Field label="Super built-up area (sq.ft)">
              <Input
                inputMode="numeric"
                value={current.super_built_up_area_sqft}
                placeholder="Optional"
                onChange={(e) => set("super_built_up_area_sqft", e.target.value)}
              />
            </Field>
          )}
          <Field label="Stock type">
            <Dropdown
              value={current.stock_type}
              options={STOCK_TYPES}
              onChange={(v) => set("stock_type", v)}
            />
          </Field>
          <Field label="Listing type">
            <Dropdown
              value={current.listing_type}
              options={LISTING_TYPES}
              onChange={(v) => set("listing_type", v)}
            />
          </Field>
          {!["PLOT", "LAND"].includes(current.property_category) &&
            !(
              current.property_category === "COMMERCIAL" &&
              COMMERCIAL_NO_FURNISHED.has(current.configuration)
            ) && (
              <Field label="Furnished status">
                <Dropdown
                  value={current.furnished_status}
                  options={FURNISHED_STATUSES}
                  onChange={(v) => set("furnished_status", v)}
                />
              </Field>
            )}
          <Field label="Possession status">
            <Select
              value={current.possession_status}
              onValueChange={(v) => set("possession_status", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {POSSESSION_STATUSES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!["PLOT", "LAND"].includes(current.property_category) && (
            <>
              <Field label="Floor number">
                <Input
                  inputMode="numeric"
                  value={current.floor_number}
                  placeholder="e.g. 4"
                  onChange={(e) => set("floor_number", e.target.value)}
                />
              </Field>
              <Field label="Total floors in building">
                <Input
                  inputMode="numeric"
                  value={current.total_floors}
                  placeholder="e.g. 14"
                  onChange={(e) => set("total_floors", e.target.value)}
                />
              </Field>
              <Field label="Bathrooms / Washrooms">
                <Input
                  inputMode="numeric"
                  value={current.bathrooms}
                  placeholder="e.g. 2"
                  onChange={(e) => set("bathrooms", e.target.value)}
                />
              </Field>
              <Field label="Balconies">
                <Input
                  inputMode="numeric"
                  value={current.balconies}
                  placeholder="e.g. 1"
                  onChange={(e) => set("balconies", e.target.value)}
                />
              </Field>
            </>
          )}
          {current.property_category === "COMMERCIAL" &&
            COMMERCIAL_HAS_DIMENSIONS.has(current.configuration) && (
              <>
                {COMMERCIAL_ATTRIBUTE_FIELDS.map(({ key, label }) => (
                  <Field key={key} label={label}>
                    <Input
                      inputMode="decimal"
                      value={current[ATTRIBUTE_FIELD_TO_DRAFT_KEY[key]]}
                      onChange={(e) => set(ATTRIBUTE_FIELD_TO_DRAFT_KEY[key], e.target.value)}
                    />
                  </Field>
                ))}
              </>
            )}

          <div className="sm:col-span-2">
            <Field label="Amenities">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {AMENITY_OPTIONS.map((amenity) => (
                  <label
                    key={amenity}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={current.amenities.includes(amenity)}
                      onChange={() => toggleAmenity(amenity)}
                    />
                    {amenity.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Photos">
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    if (!clientId) {
                      toast.error("No tenant selected — cannot upload");
                      return;
                    }
                    setUploadingImages(true);
                    try {
                      const urls = await uploadPropertyImages(files, clientId);
                      setValues((p) => ({ ...p, image_urls: [...p.image_urls, ...urls] }));
                      toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} uploaded`);
                    } catch (err) {
                      toast.error((err as Error).message);
                    } finally {
                      setUploadingImages(false);
                      e.target.value = "";
                    }
                  }}
                />
                {uploadingImages && <Upload className="size-4 animate-pulse" />}
              </div>
              {current.image_urls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {current.image_urls.map((url) => (
                    <div key={url} className="group relative">
                      <img
                        src={url}
                        alt="Property"
                        className="size-20 rounded-md border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remove photo"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>
          </div>

          <Field label="Brochure (PDF)">
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="application/pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!clientId) {
                    toast.error("No tenant selected — cannot upload");
                    return;
                  }
                  setUploading(true);
                  try {
                    const url = await uploadBrochure(file, clientId);
                    set("brochure_url", url);
                    toast.success("Brochure uploaded");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              {uploading && <Upload className="size-4 animate-pulse" />}
            </div>
            {current.brochure_url && (
              <a
                className="truncate text-xs text-primary underline"
                href={current.brochure_url}
                target="_blank"
                rel="noreferrer"
              >
                View uploaded brochure
              </a>
            )}
          </Field>
          <Field label="Google Maps URL">
            <Input
              value={current.map_url}
              placeholder="https://maps.google.com/…"
              onChange={(e) => set("map_url", e.target.value)}
            />
          </Field>
          <Field label="Assigned sales executive (optional)">
            {executives.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No executives yet — add one from the Team Performance tab first.
              </p>
            ) : (
              <Select
                value={current.assigned_executive_id || "__none__"}
                onValueChange={(v) => set("assigned_executive_id", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (unassigned)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (unassigned)</SelectItem>
                  {executives.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>
                      {ex.name} {ex.email ? `· ${ex.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending || uploading || uploadingImages}>
            Save property
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Dropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
