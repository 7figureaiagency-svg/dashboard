import { useState } from "react";
import { FileText, MapPin, Pencil, Plus, Trash2, Upload } from "lucide-react";
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
import { ToneBadge } from "@/components/crm/badges";
import { useDeleteProperty, uploadBrochure, useExecutives, useSaveProperty } from "@/lib/crm-data";
import {
  CONFIGURATIONS,
  formatMoney,
  INVENTORY_STATUSES,
  isValidUrl,
  PROPERTY_CATEGORIES,
  STOCK_TYPES,
  toNumber,
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
  possession_status: string;
  brochure_url: string;
  map_url: string;
  assigned_executive_id: string;
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
  possession_status: "",
  brochure_url: "",
  map_url: "",
  assigned_executive_id: "",
};

const statusTone: Record<string, Tone> = {
  AVAILABLE: "green",
  SOLD: "gray",
  HOLD: "yellow",
};

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
  const del = useDeleteProperty();

  const openEdit = (p: Property) => {
    const draft = { ...EMPTY } as unknown as Record<string, string>;
    for (const key of Object.keys(EMPTY)) {
      const v = (p as unknown as Record<string, unknown>)[key];
      draft[key] = v === null || v === undefined ? "" : String(v);
    }
    setIsNew(false);
    setEditing(draft as unknown as Draft);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{properties.length} properties</p>
        <Button
          onClick={() => {
            setIsNew(true);
            setEditing({ ...EMPTY });
          }}
        >
          <Plus /> Add property
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading inventory…</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {properties.map((p) => (
          <Card key={p.property_id}>
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

  const submit = () => {
    if (!current.project_name || !current.location) {
      toast.error("Project name and location are required");
      return;
    }
    if (!current.assigned_executive_id) {
      toast.error("Assign a sales executive to this property");
      return;
    }
    if (!isValidUrl(current.map_url)) {
      toast.error("Enter a valid map URL (https://…)");
      return;
    }
    const payload = {
      property_id: current.property_id || `PROP-${Date.now()}`,
      project_name: current.project_name,
      property_category: current.property_category,
      configuration: current.configuration,
      location: current.location,
      price: toNumber(current.price) ?? 0,
      area_sqft: toNumber(current.area_sqft),
      status: current.status,
      stock_type: current.stock_type,
      possession_status: current.possession_status || null,
      brochure_url: current.brochure_url || null,
      map_url: current.map_url || null,
      assigned_executive_id: current.assigned_executive_id,
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
          <Field label="Property ID">
            <Input
              value={current.property_id}
              disabled={!isNew}
              placeholder="Auto-generated if blank"
              onChange={(e) => set("property_id", e.target.value)}
            />
          </Field>
          <Field label="Project name">
            <Input
              value={current.project_name}
              onChange={(e) => set("project_name", e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Dropdown
              value={current.property_category}
              options={PROPERTY_CATEGORIES}
              onChange={(v) => set("property_category", v)}
            />
          </Field>
          <Field label="Configuration">
            <Dropdown
              value={current.configuration}
              options={CONFIGURATIONS}
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
          <Field label="Price">
            <Input
              inputMode="numeric"
              value={current.price}
              onChange={(e) => set("price", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{formatMoney(toNumber(current.price))}</p>
          </Field>
          <Field label="Area (sq.ft)">
            <Input
              inputMode="numeric"
              value={current.area_sqft}
              onChange={(e) => set("area_sqft", e.target.value)}
            />
          </Field>
          <Field label="Stock type">
            <Dropdown
              value={current.stock_type}
              options={STOCK_TYPES}
              onChange={(v) => set("stock_type", v)}
            />
          </Field>
          <Field label="Possession status">
            <Input
              value={current.possession_status}
              onChange={(e) => set("possession_status", e.target.value)}
            />
          </Field>
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
          <Field label="Assigned sales executive">
            {executives.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No executives yet — add one from the Team Performance tab first.
              </p>
            ) : (
              <Select
                {...(current.assigned_executive_id ? { value: current.assigned_executive_id } : {})}
                onValueChange={(v) => set("assigned_executive_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an executive…" />
                </SelectTrigger>
                <SelectContent>
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
          <Button onClick={submit} disabled={save.isPending || uploading}>
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
