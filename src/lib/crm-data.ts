import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  buildActivityRows,
  hydrateLead,
  hydrateProperty,
  splitLeadUpdate,
  type Activity,
  type Client,
  type ClientIntegration,
  type Executive,
  type ExecutiveLite,
  type Lead,
  type Property,
  type PropertyRow,
} from "@/lib/crm";

const POLL_MS = 30000;

/**
 * RLS scopes every one of these tables to the signed-in user's own
 * `client_id` automatically (see `public.current_client_id()`), so none of
 * the queries below need an explicit `.eq("client_id", ...)` — the database
 * itself refuses to return or mutate another tenant's rows.
 */

async function fetchExecutivesMap(): Promise<Map<string, ExecutiveLite>> {
  const { data, error } = await supabase
    .from("executives")
    .select("id,name,email,phone,telegram_id");
  if (error) throw error;
  return new Map((data ?? []).map((e) => [e.id, e]));
}

export function useActivity() {
  return useQuery({
    queryKey: ["lead_activity"],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from("lead_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: POLL_MS,
  });
}

export function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async (): Promise<Lead[]> => {
      const [{ data, error }, execMap] = await Promise.all([
        supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(1000),
        fetchExecutivesMap(),
      ]);
      if (error) throw error;
      return (data ?? []).map((row) => hydrateLead(row, execMap));
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: POLL_MS,
  });
}

export function useInventory() {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: async (): Promise<Property[]> => {
      const [{ data, error }, execMap] = await Promise.all([
        supabase
          .from("inventory")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000),
        fetchExecutivesMap(),
      ]);
      if (error) throw error;
      return (data ?? []).map((row) => hydrateProperty(row, execMap));
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: POLL_MS,
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      values,
      message,
      lead,
      action,
      note,
    }: {
      leadId: string;
      values: Partial<Lead>;
      message?: string;
      /** Pass the current lead + an action key to record the change in history. */
      lead?: Lead;
      action?: string;
      note?: string | null;
    }) => {
      const { columns, metadataPatch } = splitLeadUpdate(values);
      const payload: Record<string, unknown> = { ...columns, updated_at: new Date().toISOString() };
      if (Object.keys(metadataPatch).length > 0) {
        payload["metadata"] = {
          ...((lead?.metadata as Record<string, unknown> | null) ?? {}),
          ...metadataPatch,
        };
      }
      const { error } = await supabase
        .from("leads")
        .update(payload as never)
        .eq("lead_id", leadId);
      if (error) throw error;
      if (lead && action) {
        const rows = buildActivityRows(lead, values, action, note);
        const { error: logError } = await supabase.from("lead_activity").insert(rows);
        if (logError) console.error("activity log failed", logError.message);
      }
      return message;
    },
    onMutate: async ({ leadId, values }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const previous = qc.getQueryData<Lead[]>(["leads"]);
      qc.setQueryData<Lead[]>(["leads"], (old) =>
        (old ?? []).map((l) =>
          l.lead_id === leadId ? { ...l, ...values, updated_at: new Date().toISOString() } : l,
        ),
      );
      return { previous };
    },
    onSuccess: (message) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_activity"] });
      toast.success(message ?? "Lead updated");
    },

    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["leads"], ctx.previous);
      toast.error(e.message);
    },
  });
}

export function useSaveProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      values,
      isNew,
      clientId,
    }: {
      values: Partial<PropertyRow> & { property_id: string };
      isNew: boolean;
      /** Required when inserting — every new row must be stamped with the tenant it belongs to. */
      clientId?: string | null;
    }) => {
      if (isNew) {
        const { error } = await supabase
          .from("inventory")
          .insert({ ...values, client_id: clientId ?? null } as never);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("inventory")
          .update(values as never)
          .eq("property_id", values.property_id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Property saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (propertyId: string) => {
      const { error } = await supabase.from("inventory").delete().eq("property_id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Property deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export async function uploadBrochure(file: File, clientId: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${clientId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from("property-brochures")
    .upload(path, file, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  return supabase.storage.from("property-brochures").getPublicUrl(path).data.publicUrl;
}

/** Uploads one property photo to the (per-tenant-scoped) `property-images` bucket. */
export async function uploadPropertyImage(file: File, clientId: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage
    .from("property-images")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  return supabase.storage.from("property-images").getPublicUrl(path).data.publicUrl;
}

/** Uploads several property photos in parallel, returning their public URLs in order. */
export async function uploadPropertyImages(files: File[], clientId: string): Promise<string[]> {
  return Promise.all(files.map((file) => uploadPropertyImage(file, clientId)));
}

/** Uploads a company logo to the `client-logos` bucket and returns its public URL. */
export async function uploadClientLogo(file: File, clientId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${clientId}/logo.${ext}`;
  const { error } = await supabase.storage
    .from("client-logos")
    .upload(path, file, { contentType: file.type || "image/png", upsert: true });
  if (error) throw error;
  return supabase.storage.from("client-logos").getPublicUrl(path).data.publicUrl;
}

/* ------------------------------------------------------------------ */
/* Team (executives)                                                   */
/* ------------------------------------------------------------------ */

export function useExecutives() {
  return useQuery({
    queryKey: ["executives"],
    queryFn: async (): Promise<Executive[]> => {
      const { data, error } = await supabase.from("executives").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useAddExecutive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      clientId: string;
      name: string;
      email: string;
      phone?: string;
      telegram_id?: string;
      role?: string;
    }) => {
      const { error } = await supabase.from("executives").insert({
        client_id: values.clientId,
        name: values.name,
        email: values.email.trim().toLowerCase(),
        phone: values.phone || null,
        telegram_id: values.telegram_id || null,
        role: values.role || "sales_executive",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executives"] });
      toast.success(
        "Executive added — they'll be linked automatically the next time they sign in with this email.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExecutive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("executives").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executives"] });
      toast.success("Executive removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateExecutive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      email,
      phone,
      role,
    }: {
      id: string;
      name: string;
      email: string;
      phone?: string;
      role?: string;
    }) => {
      const { error } = await supabase
        .from("executives")
        .update({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone?.trim() || null,
          role: role || "sales_executive",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executives"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Executive details updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ------------------------------------------------------------------ */
/* Client (tenant) record                                              */
/* ------------------------------------------------------------------ */

export function useClient(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["client", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<Client | null> => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/* Lead-source webhook integrations (99acres / Housing / MagicBricks…) */
/* ------------------------------------------------------------------ */

export function useIntegrations() {
  return useQuery({
    queryKey: ["client_integrations"],
    queryFn: async (): Promise<ClientIntegration[]> => {
      const { data, error } = await supabase
        .from("client_integrations")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useAddIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      clientId: string;
      provider: string;
      label?: string | null;
      webhookUrl?: string | null;
      apiKey?: string | null;
      forwardingEmail?: string | null;
      isEnabled?: boolean;
    }) => {
      const { error } = await supabase.from("client_integrations").insert({
        client_id: values.clientId,
        provider: values.provider,
        label: values.label || null,
        webhook_url: values.webhookUrl || null,
        api_key: values.apiKey || null,
        forwarding_email: values.forwardingEmail || null,
        is_enabled: values.isEnabled ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_integrations"] });
      toast.success("Webhook added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<ClientIntegration> }) => {
      const { error } = await supabase
        .from("client_integrations")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_integrations"] });
      toast.success("Webhook updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_integrations"] });
      toast.success("Webhook removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
