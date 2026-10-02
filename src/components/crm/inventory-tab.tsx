import { useState } from "react";
import { FileText, ImageOff, LayoutGrid, LayoutList, MapPin, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
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
import { ToneBadge } from "@/components/crm/badges";
import {
  uploadBrochure,
  uploadPropertyImages,
  useDeleteProperty,
  useExecutives,
  useSaveProperty,
} from "@/lib/crm-data";
import {
  AMENITY_OPTIONS,
  COMMERCIAL_ATTRIBUTE_FIELDS,
  configurationsForCategory,
  FACING_OPTIONS,
  formatMoney,
  FURNISHED_STATUSES,
  INVENTORY_STATUSES,
  isValidUrl,
  LISTING_TYPES,
  OWNERSHIP_TYPES,
  PROPERTY_CATEGORIES,
  STOCK_TYPES,
  toNumber,
  TRANSACTION_TYPES,
  type Property,
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

export function InventoryTab({
  properties,
  loading,
  clientId,
}: {
  properties: Property[];
  loading: boolean;
  clientId: string | null;
}) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const del = useDeleteProperty();

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

    const attributes = (p.attributes as Record<string, unknown> | null) ?? {};
    for (const { key } of COMMERCIAL_ATTRIBUTE_FIELDS) {
      const draftKey = ATTRIBUTE_FIELD_TO_DRAFT_KEY[key];
      if (!draftKey) continue;
      const v = attributes[key];
      draft[draftKey] = v === null || v === undefined ? "" : String(v);
    }
    setIsNew(false);
    setEditing(draft as unknown as Draft);
  };

  return (
    <div className="space-y-4">
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
                  {p.property_category} · {p.configuration || "—"} · {p.location}
                </p>
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
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
                    {p.property_category} · {p.configuration || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{p.location}</TableCell>
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
    const bhkMatch = /^(\d+)BHK$/.exec(current.configuration);
    const bhk_num = bhkMatch ? Number(bhkMatch[1]) : null;

    // Commercial-only physical/utility specs live in `attributes` (jsonb) —
    // only persist them for commercial units, and clear the column
    // otherwise so switching a listing away from Commercial doesn't leave
    // stale specs behind.
    const attributes =
      current.property_category === "COMMERCIAL"
        ? Object.fromEntries(
            COMMERCIAL_ATTRIBUTE_FIELDS.map(({ key }) => [
              key,
              toNumber(current[ATTRIBUTE_FIELD_TO_DRAFT_KEY[key]] as string),
            ]).filter(([, v]) => v !== null),
          )
        : {};

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
          <Field label="Location">
            <Input value={current.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
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
          <Field label="Maintenance charges (₹/month)">
            <Input
              inputMode="numeric"
              value={current.maintenance_charges}
              placeholder="Optional"
              onChange={(e) => set("maintenance_charges", e.target.value)}
            />
          </Field>
          <Field label="Built-up area (sq.ft)">
            <Input
              inputMode="numeric"
              value={current.area_sqft}
              onChange={(e) => set("area_sqft", e.target.value)}
            />
          </Field>
          <Field label="Carpet area (sq.ft)">
            <Input
              inputMode="numeric"
              value={current.carpet_area_sqft}
              placeholder="Optional"
              onChange={(e) => set("carpet_area_sqft", e.target.value)}
            />
          </Field>
          <Field label="Super built-up area (sq.ft)">
            <Input
              inputMode="numeric"
              value={current.super_built_up_area_sqft}
              placeholder="Optional"
              onChange={(e) => set("super_built_up_area_sqft", e.target.value)}
            />
          </Field>
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
          {current.property_category !== "PLOT" && (
            <Field label="Furnished status">
              <Dropdown
                value={current.furnished_status}
                options={FURNISHED_STATUSES}
                onChange={(v) => set("furnished_status", v)}
              />
            </Field>
          )}
          <Field label="Possession status">
            <Input
              value={current.possession_status}
              onChange={(e) => set("possession_status", e.target.value)}
            />
          </Field>
          {current.property_category === "COMMERCIAL" && (
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
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
