import { useState } from "react";
import { Copy, Globe2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ToneBadge } from "@/components/crm/badges";
import { WhatsAppConnectCard } from "@/components/crm/whatsapp-connect";
import {
  useAddIntegration,
  useDeleteIntegration,
  useIntegrations,
  useUpdateIntegration,
} from "@/lib/crm-data";
import { INTEGRATION_PROVIDERS, isValidUrl, type Client, type ClientIntegration } from "@/lib/crm";

interface Draft {
  provider: string;
  label: string;
  webhookUrl: string;
  apiKey: string;
  forwardingEmail: string;
}

const EMPTY: Draft = {
  provider: "99acres",
  label: "",
  webhookUrl: "",
  apiKey: "",
  forwardingEmail: "",
};

export function IntegrationsTab({
  clientId,
  client,
}: {
  clientId: string | null;
  client: Client | null;
}) {
  const { data: integrations = [], isLoading } = useIntegrations();
  const add = useAddIntegration();
  const update = useUpdateIntegration();
  const del = useDeleteIntegration();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientIntegration | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDraft({ ...EMPTY, webhookUrl: suggestedWebhookUrl("99acres", clientId) });
    setOpen(true);
  };

  const openEdit = (row: ClientIntegration) => {
    setEditing(row);
    setDraft({
      provider: row.provider,
      label: row.label ?? "",
      webhookUrl: row.webhook_url ?? "",
      apiKey: row.api_key ?? "",
      forwardingEmail: row.forwarding_email ?? "",
    });
    setOpen(true);
  };

  const submit = () => {
    if (!isValidUrl(draft.webhookUrl)) {
      toast.error("Enter a valid webhook URL (https://…)");
      return;
    }
    if (editing) {
      update.mutate(
        {
          id: editing.id,
          values: {
            provider: draft.provider,
            label: draft.label || null,
            webhook_url: draft.webhookUrl || null,
            api_key: draft.apiKey || null,
            forwarding_email: draft.forwardingEmail || null,
          },
        },
        { onSuccess: () => setOpen(false) },
      );
    } else {
      if (!clientId) {
        toast.error("No tenant selected");
        return;
      }
      add.mutate(
        {
          clientId,
          provider: draft.provider,
          label: draft.label || null,
          webhookUrl: draft.webhookUrl || null,
          apiKey: draft.apiKey || null,
          forwardingEmail: draft.forwardingEmail || null,
        },
        { onSuccess: () => setOpen(false) },
      );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <WhatsAppConnectCard clientId={clientId} client={client} />

      <div className="rounded-2xl border border-border/50 bg-card shadow-xs overflow-hidden">
        <div className="p-5 pb-4 border-b border-border/30 bg-muted/15 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="flex-1">
            <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
              <div className="size-8 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Globe2 className="size-4" />
              </div>
              <span>Portal Lead Webhooks</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              Add the webhook URL for every portal you list on — 99acres, Housing.com, MagicBricks,
              CommonFloor, Facebook Lead Ads, OLX, or custom channels. Each lead routes straight into
              your automated lead engine with zero manual entry.
            </p>
          </div>
          <Button onClick={openAdd} className="apple-button h-9 rounded-xl px-3.5 text-xs font-semibold gap-1.5 shadow-2xs w-full sm:w-auto">
            <Plus className="size-3.5" /> <span>Add webhook</span>
          </Button>
        </div>
        <div className="p-5 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading webhooks…</p>}
          {!isLoading && integrations.filter((i) => i.provider !== "meta").length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center bg-card/40 space-y-2">
              <p className="text-sm font-semibold text-foreground">No portal webhooks configured yet</p>
              <p className="text-xs text-muted-foreground">
                Click "Add webhook" above to generate a webhook endpoint for 99acres, MagicBricks, Housing.com, CommonFloor, Facebook, or Custom.
              </p>
            </div>
          )}
          {integrations
            .filter((i) => i.provider !== "meta")
            .map((row) => (
              <IntegrationRow
                key={row.id}
                row={row}
                onToggle={(v) => update.mutate({ id: row.id, values: { is_enabled: v } })}
                onEdit={() => openEdit(row)}
                onDelete={() => setDeleteId(row.id)}
              />
            ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit webhook" : "Add a webhook"}</DialogTitle>
            <DialogDescription>
              Paste this URL into the portal's lead-notification / API integration settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Portal</Label>
              <Select
                value={draft.provider}
                onValueChange={(v) => {
                  setDraft((p) => ({
                    ...p,
                    provider: v,
                    webhookUrl: editing ? p.webhookUrl : suggestedWebhookUrl(v, clientId),
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTEGRATION_PROVIDERS.filter((p) => p.key !== "meta").map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.provider === "custom" && (
              <div className="space-y-1.5">
                <Label>Custom source name</Label>
                <Input
                  value={draft.label}
                  placeholder="e.g. Sulekha, Facebook Ads"
                  onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={draft.webhookUrl}
                  placeholder="https://…/webhook/portal/…"
                  onChange={(e) => setDraft((p) => ({ ...p, webhookUrl: e.target.value }))}
                  className="rounded-xl border-border/40 bg-muted/30 focus:bg-background text-xs h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="apple-button size-9 rounded-xl border-border/40 shrink-0"
                  onClick={() => {
                    navigator.clipboard?.writeText(draft.webhookUrl);
                    toast.success("Copied webhook URL");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">API key (if portal provides one)</Label>
              <Input
                value={draft.apiKey}
                onChange={(e) => setDraft((p) => ({ ...p, apiKey: e.target.value }))}
                className="rounded-xl border-border/40 bg-muted/30 focus:bg-background text-xs h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Forwarding email (optional)</Label>
              <Input
                type="email"
                value={draft.forwardingEmail}
                placeholder="leads@yourcompany.com"
                onChange={(e) => setDraft((p) => ({ ...p, forwardingEmail: e.target.value }))}
                className="rounded-xl border-border/40 bg-muted/30 focus:bg-background text-xs h-9"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="apple-button rounded-xl min-h-[44px] sm:min-h-0 sm:h-9 text-xs font-semibold" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="apple-button rounded-xl min-h-[44px] sm:min-h-0 sm:h-9 text-xs font-semibold shadow-2xs" onClick={submit} disabled={add.isPending || update.isPending}>
              {editing ? "Save changes" : "Add webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent className="rounded-2xl border-border/50 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold tracking-tight">Remove this webhook?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground">
              Leads from this source will stop arriving until you add it back. Existing leads in your CRM will remain safe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="apple-button rounded-xl min-h-[44px] sm:min-h-0 sm:h-9 text-xs font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="apple-button rounded-xl min-h-[44px] sm:min-h-0 sm:h-9 text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-2xs"
              onClick={() => {
                if (deleteId) del.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Remove Webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IntegrationRow({
  row,
  onToggle,
  onEdit,
  onDelete,
}: {
  row: ClientIntegration;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = INTEGRATION_PROVIDERS.find((p) => p.key === row.provider);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-4 sm:flex-row sm:items-center sm:justify-between hover:border-primary/40 transition-all shadow-2xs">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-sm text-foreground">{row.label || meta?.label || row.provider}</p>
          <ToneBadge
            tone={row.is_enabled ? "green" : "gray"}
            label={row.is_enabled ? "Active" : "Paused"}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="break-all text-xs text-muted-foreground font-mono bg-muted/40 rounded-lg px-2.5 py-1 border border-border/30 inline-block">
            {row.webhook_url || "No URL set"}
          </span>
          {row.webhook_url && (
            <button
              type="button"
              className="apple-button text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1"
              onClick={() => {
                navigator.clipboard?.writeText(row.webhook_url || "");
                toast.success("Webhook URL copied to clipboard");
              }}
            >
              <Copy className="size-3" /> Copy
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30">
        <Switch checked={row.is_enabled} onCheckedChange={onToggle} aria-label="Toggle webhook" />
        <Button size="sm" variant="secondary" className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold px-3" onClick={onEdit}>
          <Pencil className="size-3.5 mr-1" />
          <span>Edit</span>
        </Button>
        <Button size="sm" variant="destructive" className="apple-button min-h-[44px] sm:min-h-0 sm:h-8 rounded-lg text-xs font-semibold px-3 shadow-2xs" onClick={onDelete}>
          <Trash2 className="size-3.5 mr-1" />
          <span>Remove</span>
        </Button>
      </div>
    </div>
  );
}

/** Suggested webhook URL for incoming portal leads routing direct to Supabase Edge Function (100% Non-n8n). */
export function suggestedWebhookUrl(provider: string, clientId: string | null): string {
  const base = "https://yeiygfysijptjdepctnx.supabase.co/functions/v1/realtor-lead-engine";
  if (!clientId) return "";
  if (provider === "custom") return `${base}?source=custom&client_id=${clientId}`;
  return `${base}?source=${provider}&client_id=${clientId}`;
}
