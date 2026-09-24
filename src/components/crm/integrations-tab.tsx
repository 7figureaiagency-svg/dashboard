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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <div className="space-y-6">
      <WhatsAppConnectCard clientId={clientId} client={client} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="size-4" /> Portal lead webhooks
            </CardTitle>
            <CardDescription>
              Add the webhook URL for every portal you list on — 99acres, Housing.com, MagicBricks,
              OLX or anything else. Each one routes straight into your automation and lands as a new
              lead here. You can add as many as you need.
            </CardDescription>
          </div>
          <Button onClick={openAdd}>
            <Plus /> Add webhook
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && integrations.filter((i) => i.provider !== "meta").length === 0 && (
            <p className="text-sm text-muted-foreground">
              No portal webhooks added yet. Click "Add webhook" to add your first one.
            </p>
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
        </CardContent>
      </Card>

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
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={draft.webhookUrl}
                  placeholder="https://…/webhook/portal/…"
                  onChange={(e) => setDraft((p) => ({ ...p, webhookUrl: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard?.writeText(draft.webhookUrl);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>API key (if the portal gives you one)</Label>
              <Input
                value={draft.apiKey}
                onChange={(e) => setDraft((p) => ({ ...p, apiKey: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Forwarding email (optional)</Label>
              <Input
                type="email"
                value={draft.forwardingEmail}
                placeholder="leads@yourcompany.com"
                onChange={(e) => setDraft((p) => ({ ...p, forwardingEmail: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={add.isPending || update.isPending}>
              {editing ? "Save changes" : "Add webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Leads from this source will stop arriving until you add it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) del.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Remove
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{row.label || meta?.label || row.provider}</p>
          <ToneBadge
            tone={row.is_enabled ? "green" : "gray"}
            label={row.is_enabled ? "Active" : "Paused"}
          />
        </div>
        <p className="truncate text-xs text-muted-foreground">{row.webhook_url || "No URL set"}</p>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={row.is_enabled} onCheckedChange={onToggle} aria-label="Toggle webhook" />
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil /> Edit
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>
          <Trash2 /> Remove
        </Button>
      </div>
    </div>
  );
}

/** Best-effort suggested webhook URL for a given portal + tenant, matching the n8n convention already in use. */
export function suggestedWebhookUrl(provider: string, clientId: string | null): string {
  const base =
    (import.meta.env["VITE_N8N_WEBHOOK_BASE_URL"] as string | undefined) ||
    "https://n8n.yourdomain.com/webhook";
  if (!clientId) return "";
  if (provider === "custom") return "";
  return `${base}/portal/${provider}/${clientId}`;
}
