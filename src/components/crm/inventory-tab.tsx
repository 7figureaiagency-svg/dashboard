import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Eye,
  FileText,
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
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { StatusBadge, ToneBadge } from "@/components/crm/badges";
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

  const matchingBuyersMap = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const p of properties) {
      const pLoc = (p.location || "").toLowerCase().trim();
      const pCat = (p.property_category || "").toLowerCase().trim();
      const pConfig = (p.configuration || "").toLowerCase().trim();
      const pPrice = Number(p.price) || 0;

      const matches = allLeads.filter((l) => {
        if (l.status === "NOT_INTERESTED" || l.status === "DROPPED") return false;

        let score = 0;
        const lLoc = (l.location || "").toLowerCase().trim();
        if (lLoc && pLoc && (pLoc.includes(lLoc) || lLoc.includes(pLoc))) {
          score += 3;
        }

        const lType = (l.property_type || "").toLowerCase().trim();
        if (lType) {
          if (pConfig && (lType.includes(pConfig) || pConfig.includes(lType))) score += 2;
          else if (pCat && (lType.includes(pCat) || pCat.includes(lType))) score += 1;
        }

        const lBudget = toNumber(l.budget as never);
        if (lBudget > 0 && pPrice > 0) {
          if (lBudget >= pPrice * 0.8) {
            score += 2;
          }
        }

        return score >= 2;
      });

      map.set(p.property_id, matches);
    }
    return map;
  }, [properties, allLeads]);

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
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "inventory"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Building2 className="size-4" />
            <span>Live Inventory ({properties.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("submissions")}
            className={`relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "submissions"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <User className="size-4" />
            <span>Owner Submissions ({submissions.length})</span>
            {pendingSubmissionsCount > 0 && (
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  activeTab === "submissions"
                    ? "bg-amber-400 text-slate-950 font-bold"
                    : "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold"
                }`}
              >
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
          <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{properties.length} properties</p>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border bg-background p-1">
            <button
              onClick={() => setView("grid")}
              className={`rounded-md p-1.5 transition-colors ${view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="Grid view"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md p-1.5 transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="List view"
            >
              <LayoutList className="size-4" />
            </button>
          </div>
          <Button
            onClick={() => {
              setIsNew(true);
              setEditing({ ...EMPTY });
            }}
          >
            <Plus /> Add property
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading inventory…</p>}

      {/* ── Grid view ── */}
      {view === "grid" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {properties.map((p) => (
            <Card key={p.property_id} className="overflow-hidden">
              {p.image_urls && p.image_urls.length > 0 ? (
                <img
                  src={p.image_urls[0]}
                  alt={p.project_name}
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-muted text-muted-foreground">
                  <ImageOff className="size-6" />
                </div>
              )}
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span>{p.project_name}</span>
                  <ToneBadge
                    tone={statusTone[p.status ?? "AVAILABLE"] ?? "gray"}
                    label={p.status ?? "—"}
                  />
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {p.property_category} · {p.configuration?.replaceAll("_", " ") || "—"} · {p.location}
                  {p.city ? `, ${p.city}` : ""}
                </p>
                {Array.isArray(p.landmarks) && p.landmarks.length > 0 && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    📍 {p.landmarks.join(", ")}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold">{formatMoney(p.price)}</span>
                  <span className="text-muted-foreground">{p.area_sqft ?? "—"} sq.ft</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Stock: {p.stock_type} · {p.possession_status || "Possession N/A"}
                </p>
                <div className="rounded-lg bg-muted/60 p-2 text-xs">
                  <p className="font-medium">{p.assigned_executive_name || "No executive"}</p>
                  <p className="text-muted-foreground">
                    {p.assigned_executive_phone || "—"} · {p.assigned_executive_telegram_id || "—"}
                  </p>
                  <p className="text-muted-foreground">{p.assigned_executive_email || "—"}</p>
                </div>

                {/* ── 🎯 Reverse Matchmaker: Matching Buyers Pill ── */}
                {(() => {
                  const matchingBuyers = matchingBuyersMap.get(p.property_id) ?? [];
                  return matchingBuyers.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full justify-between border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 font-medium h-8 text-xs shadow-2xs"
                      onClick={() =>
                        setMatchingDialogProperty({ property: p, buyers: matchingBuyers })
                      }
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-primary" />
                        <span><b>{matchingBuyers.length}</b> Matching {matchingBuyers.length === 1 ? "Buyer" : "Buyers"}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground underline">View & Call</span>
                    </Button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic px-1">
                      No matching buyers in CRM yet
                    </p>
                  );
                })()}

                <div className="flex flex-wrap gap-2">
                  {p.brochure_url && (
                    <Button asChild size="sm" variant="outline">
                      <a href={p.brochure_url} target="_blank" rel="noreferrer">
                        <FileText /> Brochure
                      </a>
                    </Button>
                  )}
                  {p.map_url && (
                    <Button asChild size="sm" variant="outline">
                      <a href={p.map_url} target="_blank" rel="noreferrer">
                        <MapPin /> Map
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                    <Pencil /> Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setDeleteId(p.property_id)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── List view ── */}
      {view === "list" && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Matching Demand</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No properties yet.
                  </TableCell>
                </TableRow>
              )}
              {properties.map((p) => (
                <TableRow key={p.property_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.image_urls && p.image_urls.length > 0 ? (
                        <img
                          src={p.image_urls[0]}
                          alt={p.project_name}
                          className="size-10 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ImageOff className="size-4" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium leading-tight">{p.project_name}</p>
                        <p className="text-xs text-muted-foreground">{p.property_id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {p.property_category} · {p.configuration?.replaceAll("_", " ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>
                      {p.location}
                      {p.city ? `, ${p.city}` : ""}
                    </div>
                    {Array.isArray(p.landmarks) && p.landmarks.length > 0 && (
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        📍 {p.landmarks.slice(0, 2).join(", ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-semibold">
                    {formatMoney(p.price)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {p.area_sqft ?? "—"} sq.ft
                  </TableCell>
                  <TableCell>
                    <ToneBadge
                      tone={statusTone[p.status ?? "AVAILABLE"] ?? "gray"}
                      label={p.status ?? "—"}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.assigned_executive_name || (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const matchingBuyers = matchingBuyersMap.get(p.property_id) || [];
                      return matchingBuyers.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-medium text-xs gap-1.5 shadow-2xs"
                          onClick={() =>
                            setMatchingDialogProperty({ property: p, buyers: matchingBuyers })
                          }
                          title={`View ${matchingBuyers.length} matching buyer leads`}
                        >
                          <Sparkles className="size-3 text-primary" />
                          <span><b>{matchingBuyers.length}</b> {matchingBuyers.length === 1 ? "Buyer" : "Buyers"}</span>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">None yet</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.brochure_url && (
                        <Button asChild size="sm" variant="outline">
                          <a href={p.brochure_url} target="_blank" rel="noreferrer">
                            <FileText />
                          </a>
                        </Button>
                      )}
                      {p.map_url && (
                        <Button asChild size="sm" variant="outline">
                          <a href={p.map_url} target="_blank" rel="noreferrer">
                            <MapPin />
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                        <Pencil />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteId(p.property_id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

  const { data: submissions = [], isLoading } = usePropertySubmissions();
  const approveMutation = useApprovePropertySubmission();
  const updateMutation = useUpdatePropertySubmission();

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

      {!isLoading && filtered.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
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
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={approveMutation.isPending}
                              onClick={() => approveMutation.mutate({ submission: s, clientId })}
                              title="Convert to Live Inventory for Seeker Matching"
                            >
                              <CheckCircle2 className="size-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              disabled={updateMutation.isPending}
                              onClick={() => updateMutation.mutate({ id: s.id, values: { status: "REJECTED" } })}
                              title="Reject submission"
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
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: s.id, values: { status: "PENDING_VERIFICATION" } })}
                          >
                            Reopen
                          </Button>
                        )}
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
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={approveMutation.isPending}
                    onClick={() => {
                      approveMutation.mutate({ submission: detailsSubmission, clientId });
                      setDetailsSubmission(null);
                    }}
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

      {/* Edit Submission Dialog */}
      <EditOwnerSubmissionDialog
        submission={editSubmission}
        open={!!editSubmission}
        onOpenChange={(open) => !open && setEditSubmission(null)}
      />

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
                      <StatusBadge status={buyer.status} />
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
                      <Button
                        asChild
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-8 px-3 gap-1.5 shadow-2xs"
                        title={`Call ${buyer.name || "Buyer"}`}
                      >
                        <a href={`tel:${buyer.phone}`}>
                          <Phone className="size-3.5" />
                          <span>Call Lead</span>
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No phone</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs px-2.5"
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
              {matchingDialogProperty?.buyers.length || 0} potential buyer(s) with matching budget & location.
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
