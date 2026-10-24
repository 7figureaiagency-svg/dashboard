import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/auth";
import {
  buildActivityRows,
  hydrateLead,
  hydrateProperty,
  splitLeadUpdate,
  summarizeLeadEvent,
  type Activity,
  type Client,
  type ClientIntegration,
  type Executive,
  type ExecutiveLite,
  type Lead,
  type Property,
  type PropertyRow,
  type PropertySubmission,
} from "@/lib/crm";

const POLL_MS = 30000;

/**
 * RLS scopes every one of these tables to the signed-in user's own
 * `client_id` automatically (see `public.current_client_id()`), so none of
 * the queries below need an explicit `.eq("client_id", ...)` — the database
 * itself refuses to return or mutate another tenant's rows.
 */

async function fetchExecutivesMap(clientId?: string | null): Promise<Map<string, ExecutiveLite>> {
  let query = supabase
    .from("executives")
    .select("id,name,phone,telegram_id");
  if (clientId) {
    query = query.eq("client_id", clientId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn("fetchExecutivesMap warning:", error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((e: any) => [
      e.id,
      {
        id: e.id,
        name: e.name,
        email: e.email ?? null,
        phone: e.phone ?? null,
        telegram_id: e.telegram_id ?? null,
      },
    ]),
  );
}

export function useActivity(passedClientId?: string | null) {
  const { data: me } = useCurrentUser();
  const clientId = passedClientId !== undefined ? passedClientId : me?.clientId;
  return useQuery({
    queryKey: ["lead_activity", clientId],
    enabled: clientId !== undefined ? !!clientId : true,
    queryFn: async (): Promise<Activity[]> => {
      // Query live database table lead_events as the single unified source of truth for audit timeline
      let evQuery = supabase
        .from("lead_events" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (clientId) {
        evQuery = evQuery.eq("client_id", clientId);
      }

      let leadsQuery = supabase
        .from("leads")
        .select("lead_id, first_name, assigned_executive_id");
      if (clientId) {
        leadsQuery = leadsQuery.eq("client_id", clientId);
      }

      const [{ data: events }, { data: leadsData }, execMap] = await Promise.all([
        evQuery,
        leadsQuery,
        fetchExecutivesMap(clientId),
      ]);

      if (!events) return [];

      const leadMap = new Map((leadsData ?? []).map((l: any) => [l.lead_id, l]));

      return events.map((ev: any) => {
        const payload = ev.payload || {};
        const lead = leadMap.get(ev.lead_id);
        const exec = lead?.assigned_executive_id ? execMap.get(lead.assigned_executive_id) : undefined;
        const execName = payload.executive_name || exec?.name || null;

        const summaryMeta = summarizeLeadEvent(ev.event_type || "ACTIVITY", payload, execName);

        return {
          id: ev.id,
          client_id: ev.client_id,
          lead_id: ev.lead_id,
          action: ev.event_type || "ACTIVITY",
          created_at: ev.created_at,
          lead_name: lead?.first_name || (payload.name as string) || (payload.userName as string) || null,
          executive_name: summaryMeta.actorLabel,
          field: payload.field || (payload.state ? `state: ${payload.state}` : null),
          old_value: payload.old_value || null,
          new_value: payload.new_value || payload.state || null,
          note: summaryMeta.details,
          actor_type: summaryMeta.actorType,
          actor_label: summaryMeta.actorLabel,
          short_summary: summaryMeta.shortSummary,
          details: summaryMeta.details,
          raw_payload: payload,
        } as Activity;
      });
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: POLL_MS,
  });
}

export function useLeadEvents(leadId?: string | null) {
  return useQuery({
    queryKey: ["lead_events", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("lead_events" as any)
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) {
        console.warn("fetch lead_events error:", error);
        return [];
      }
      return (data ?? []) as Array<{
        id: string;
        event_type: string;
        created_at: string;
        payload: any;
      }>;
    },
    enabled: !!leadId,
    refetchInterval: 15000,
    refetchOnWindowFocus: false,
    staleTime: 15000,
  });
}

async function fetchInventoryLiteMap(clientId?: string | null): Promise<
  Map<string, { project_name: string; price: number; map_url?: string }>
> {
  let query = supabase
    .from("inventory")
    .select("property_id, project_name, price, map_url");
  if (clientId) {
    query = query.eq("client_id", clientId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn("fetchInventoryLiteMap warning:", error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((p: any) => [
      p.property_id,
      {
        project_name: p.project_name,
        price: Number(p.price) || 0,
        map_url: p.map_url ?? undefined,
      },
    ]),
  );
}

export function useLeads(passedClientId?: string | null) {
  const { data: me } = useCurrentUser();
  const clientId = passedClientId !== undefined ? passedClientId : me?.clientId;
  return useQuery({
    queryKey: ["leads", clientId],
    enabled: clientId !== undefined ? !!clientId : true,
    queryFn: async (): Promise<Lead[]> => {
      let query = supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(1000);
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      const [{ data, error }, execMap, invMap] = await Promise.all([
        query,
        fetchExecutivesMap(clientId),
        fetchInventoryLiteMap(clientId),
      ]);
      if (error) throw error;
      return (data ?? []).map((row) => hydrateLead(row, execMap, invMap));
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: POLL_MS,
  });
}

export function useInventory(passedClientId?: string | null) {
  const { data: me } = useCurrentUser();
  const clientId = passedClientId !== undefined ? passedClientId : me?.clientId;
  return useQuery({
    queryKey: ["inventory", clientId],
    enabled: clientId !== undefined ? !!clientId : true,
    queryFn: async (): Promise<Property[]> => {
      let query = supabase
        .from("inventory")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      const [{ data, error }, execMap] = await Promise.all([
        query,
        fetchExecutivesMap(clientId),
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
  const { data: me } = useCurrentUser();
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
        // Persist executive action into lead_events for unified audit trail
        const eventInserts = rows.map((r) => ({
          client_id: lead.client_id || me?.clientId || null,
          lead_id: lead.lead_id,
          event_type: action,
          payload: {
            source: "EXECUTIVE_ACTION",
            executive_name: r.executive_name,
            action,
            field: r.field || null,
            old_value: r.old_value || null,
            new_value: r.new_value || null,
            note: r.note || note || null,
          },
        }));
        const { error: logError } = await supabase.from("lead_events").insert(eventInserts as any);
        if (logError) console.error("executive action log failed", logError.message);
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
    onSuccess: (message, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_activity"] });
      qc.invalidateQueries({ queryKey: ["lead_events"] });
      if (vars?.leadId) {
        qc.invalidateQueries({ queryKey: ["lead_events", vars.leadId] });
      }
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
  const { data: me } = useCurrentUser();
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
      const effectiveClientId = clientId || me?.clientId || null;
      if (isNew) {
        const { error } = await supabase
          .from("inventory")
          .insert({ ...values, client_id: effectiveClientId } as never);
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

export function usePropertySubmissions(passedClientId?: string | null) {
  const { data: me } = useCurrentUser();
  const clientId = passedClientId !== undefined ? passedClientId : me?.clientId;
  return useQuery({
    queryKey: ["property_submissions", clientId],
    enabled: clientId !== undefined ? !!clientId : true,
    queryFn: async (): Promise<PropertySubmission[]> => {
      let query = supabase
        .from("property_submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      const { data, error } = await query;
      if (error) {
        console.warn("fetch property_submissions warning:", error);
        return [];
      }
      return data ?? [];
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: POLL_MS,
  });
}

export function useApprovePropertySubmission() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  return useMutation({
    mutationFn: async ({
      submission,
      clientId,
    }: {
      submission: PropertySubmission;
      clientId?: string | null;
    }) => {
      // 1. Generate unique property_id
      const timestamp = Date.now().toString(36).toUpperCase();
      const cfgClean = (submission.configuration || "PROP").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const propertyId = `OWNER-${cfgClean}-${timestamp}`;

      // 2. Map category and listing type
      const cat = submission.property_category?.toUpperCase() || "FLAT";
      const validCategories = ["FLAT", "VILLA", "COMMERCIAL", "PLOT", "LAND"];
      const propertyCategory = validCategories.includes(cat) ? cat : "FLAT";

      const txType = submission.transaction_type?.toUpperCase() || "SELL";
      const listingType = txType === "RENT" || txType === "LEASE" ? "RENT" : "SALE";

      const price = Number(
        listingType === "RENT"
          ? (submission.expected_rent || submission.expected_price || 0)
          : (submission.expected_price || submission.expected_rent || 0)
      );

      const area = submission.carpet_area_sqft
        ? Number(submission.carpet_area_sqft)
        : submission.super_built_up_sqft
        ? Number(submission.super_built_up_sqft)
        : null;

      // Extract numeric BHK count for attributes.bhk_num
      const bhkMatch = (submission.configuration || "").match(/\b([1-5])\s*bhk\b/i);
      const bhk_num = bhkMatch ? Number(bhkMatch[1]) : null;

      // Extract attributes object safely
      const rawAttrs = typeof submission.attributes === "object" && submission.attributes !== null
        ? (submission.attributes as Record<string, unknown>)
        : {};

      const resolvedClientId = submission.client_id || clientId || me?.clientId;
      if (!resolvedClientId) {
        throw new Error("Cannot approve property: missing tenant client_id");
      }

      // 3. Insert into inventory (both bhk_num column and inside attributes jsonb)
      const { error: insertError } = await supabase.from("inventory").insert({
        property_id: propertyId,
        client_id: resolvedClientId,
        project_name: submission.project_name || submission.society_name || "Direct Owner Property",
        property_category: propertyCategory,
        configuration: submission.configuration || "2BHK",
        bhk_num,
        location: submission.location || "Vadodara",
        city: "Vadodara",
        price,
        area_sqft: area,
        carpet_area_sqft: submission.carpet_area_sqft ? Number(submission.carpet_area_sqft) : null,
        super_built_up_area_sqft: submission.super_built_up_sqft ? Number(submission.super_built_up_sqft) : null,
        status: "AVAILABLE",
        stock_type: "RESALE",
        listing_type: listingType,
        transaction_type: listingType === "RENT" ? "RENTAL" : "RESALE",
        furnished_status: submission.furnishing_status || "UNFURNISHED",
        possession_status: submission.possession_status || "READY_TO_MOVE",
        price_negotiable: false,
        amenities: [],
        image_urls: submission.images ?? [],
        attributes: {
          ...rawAttrs,
          bhk_num,
          floor_number: rawAttrs.floor_number ?? null,
          total_floors: rawAttrs.total_floors ?? null,
          bathrooms: rawAttrs.bathrooms ?? null,
          balconies: rawAttrs.balconies ?? null,
          parking: rawAttrs.parking ?? null,
          owner_name: submission.owner_name,
          owner_phone: submission.owner_phone,
          lead_id: submission.lead_id,
          submission_id: submission.id,
          verified_source: "OWNER_SUBMISSION",
        },
      } as never);

      if (insertError) throw insertError;

      // 4. Update property_submissions status
      const { error: updateError } = await supabase
        .from("property_submissions")
        .update({
          status: "CONVERTED_TO_INVENTORY",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", submission.id);

      if (updateError) throw updateError;

      return { propertyId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["property_submissions"] });
      toast.success("Owner submission approved and added to Live Inventory!");
    },
    onError: (e: Error) => {
      toast.error(`Approval failed: ${e.message}`);
    },
  });
}

export function useUpdatePropertySubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<PropertySubmission>;
    }) => {
      const { error } = await supabase
        .from("property_submissions")
        .update({ ...values, updated_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property_submissions"] });
      toast.success("Submission updated");
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

export function useExecutives(passedClientId?: string | null) {
  const { data: me } = useCurrentUser();
  const clientId = passedClientId !== undefined ? passedClientId : me?.clientId;
  return useQuery({
    queryKey: ["executives", clientId],
    enabled: clientId !== undefined ? !!clientId : true,
    queryFn: async (): Promise<Executive[]> => {
      let query = supabase.from("executives").select("*").order("name");
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      const { data, error } = await query;
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
      email?: string;
      phone?: string;
      telegram_id?: string;
      role?: string;
    }) => {
      const payload: Record<string, unknown> = {
        client_id: values.clientId,
        name: values.name,
        phone: values.phone || null,
        telegram_id: values.telegram_id || null,
        role: values.role || "sales_executive",
      };
      if (values.email) {
        payload["email"] = values.email.trim().toLowerCase();
      }
      let { error } = await supabase.from("executives").insert(payload as any);
      if (error && error.message?.includes("email")) {
        delete payload["email"];
        const res = await supabase.from("executives").insert(payload as any);
        error = res.error;
      }
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executives"] });
      toast.success(
        "Executive added successfully.",
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
      telegram_id,
      role,
    }: {
      id: string;
      name: string;
      email?: string;
      phone?: string;
      telegram_id?: string;
      role?: string;
    }) => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        phone: phone?.trim() || null,
        telegram_id: telegram_id !== undefined ? (telegram_id.trim() || null) : undefined,
        role: role || "sales_executive",
      };
      if (email) payload["email"] = email.trim().toLowerCase();
      let { error } = await supabase
        .from("executives")
        .update(payload as any)
        .eq("id", id);
      if (error && error.message?.includes("email")) {
        delete payload["email"];
        const res = await supabase.from("executives").update(payload as any).eq("id", id);
        error = res.error;
      }
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
      if (!clientId) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("useClient warning:", error);
        return null;
      }
      if (!data) return null;
      const raw = data as Record<string, unknown>;
      return {
        ...data,
        company_name: (raw.company_name as string) || (raw.name as string) || "Real Estate CRM",
      } as Client;
    },
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/* Lead-source webhook integrations (99acres / Housing / MagicBricks…) */
/* ------------------------------------------------------------------ */

export function useIntegrations(passedClientId?: string | null) {
  const { data: me } = useCurrentUser();
  const clientId = passedClientId !== undefined ? passedClientId : me?.clientId;
  return useQuery({
    queryKey: ["client_integrations", clientId],
    enabled: clientId !== undefined ? !!clientId : true,
    queryFn: async (): Promise<ClientIntegration[]> => {
      let query = supabase
        .from("client_integrations")
        .select("*")
        .order("created_at", { ascending: true });
      if (clientId) {
        query = query.eq("client_id", clientId);
      }
      const { data, error } = await query;
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
