// Server functions for tenant onboarding + WhatsApp (Meta) linking.
//
// NOTE: this module is imported by client components (it defines the
// client-side RPC stubs too), so never top-level import `client.server.ts`
// — always `await import(...)` it inside a `.handler()` body, same pattern
// as the generated integration files.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const META_APP_ID = process.env["META_APP_ID"];
const META_APP_SECRET = process.env["META_APP_SECRET"];
const META_GRAPH_VERSION = process.env["META_GRAPH_VERSION"] || "v21.0";
const META_WEBHOOK_URL =
  process.env["META_WEBHOOK_URL"] ||
  (process.env["SUPABASE_URL"]
    ? `${process.env["SUPABASE_URL"]}/functions/v1/realtor-lead-engine/webhook`
    : "https://yeiygfysijptjdepctnx.supabase.co/functions/v1/realtor-lead-engine/webhook");

type OnboardingInput = { companyName?: string; phone?: string };

/**
 * Runs right after a fresh sign-in (Facebook or email/password).
 *
 * - If the user is already bound to a tenant, this is a no-op.
 * - If their email matches an executive record waiting to be claimed
 *   (added by an admin before or after this user's very first sign-in),
 *   they're bound to that tenant as a sales executive.
 * - Otherwise, given a company name, a brand new tenant ("client") is
 *   created and this user becomes its admin.
 */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: OnboardingInput) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const claims = context.claims as Record<string, unknown> | undefined;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, client_id, role, email")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    if (profile?.client_id) {
      return {
        status: "already_onboarded" as const,
        clientId: profile.client_id,
        role: profile.role,
      };
    }

    const lookupEmail = (
      profile?.email ||
      (claims?.["email"] as string | undefined) ||
      ""
    ).toLowerCase();

    if (lookupEmail) {
      const { data: invite } = await supabaseAdmin
        .from("executives")
        .select("id, client_id")
        .ilike("email", lookupEmail)
        .is("user_id", null)
        .limit(1)
        .maybeSingle();

      if (invite) {
        const { error: bindErr } = await supabaseAdmin
          .from("executives")
          .update({ user_id: userId })
          .eq("id", invite.id);
        if (bindErr) throw new Error(bindErr.message);

        const { error: updProfileErr } = await supabaseAdmin
          .from("profiles")
          .update({ role: "sales_executive", client_id: invite.client_id })
          .eq("id", userId);
        if (updProfileErr) throw new Error(updProfileErr.message);

        return {
          status: "joined_existing_team" as const,
          clientId: invite.client_id,
          role: "sales_executive" as const,
        };
      }
    }

    if (!data.companyName || !data.companyName.trim()) {
      return { status: "needs_company_name" as const };
    }

    // Resumability: a previous attempt may have created the `clients` row
    // and then failed on a later step (e.g. a transient error, or the
    // env-var issue this deployment hit while it was still being set up).
    // Retrying "Continue" would otherwise hit clients_email_key on the
    // insert below — reuse that row instead of erroring.
    let clientId: string;
    if (lookupEmail) {
      const { data: existingClient, error: existingErr } = await supabaseAdmin
        .from("clients")
        .select("id, owner_user_id")
        .eq("email", lookupEmail)
        .maybeSingle();
      if (existingErr) throw new Error(existingErr.message);

      if (
        existingClient &&
        (!existingClient.owner_user_id || existingClient.owner_user_id === userId)
      ) {
        clientId = existingClient.id;
        if (!existingClient.owner_user_id) {
          const { error: claimErr } = await supabaseAdmin
            .from("clients")
            .update({
              company_name: data.companyName.trim(),
              owner_user_id: userId,
              is_active: true,
            })
            .eq("id", clientId);
          if (claimErr) throw new Error(claimErr.message);
        }
      } else if (existingClient) {
        throw new Error(
          "An account with this email already has a workspace under a different owner.",
        );
      } else {
        const { data: newClient, error: clientErr } = await supabaseAdmin
          .from("clients")
          .insert({
            company_name: data.companyName.trim(),
            email: lookupEmail,
            owner_user_id: userId,
            is_active: true,
          })
          .select("id")
          .single();
        if (clientErr) throw new Error(clientErr.message);
        clientId = newClient.id as string;
      }
    } else {
      const { data: newClient, error: clientErr } = await supabaseAdmin
        .from("clients")
        .insert({
          company_name: data.companyName.trim(),
          email: null,
          owner_user_id: userId,
          is_active: true,
        })
        .select("id")
        .single();
      if (clientErr) throw new Error(clientErr.message);
      clientId = newClient.id as string;
    }

    const profileUpdate: Record<string, unknown> = { role: "admin", client_id: clientId };
    if (data.phone) profileUpdate["phone"] = data.phone;

    const { error: promoteErr } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate as never)
      .eq("id", userId);
    if (promoteErr) throw new Error(promoteErr.message);

    return {
      status: "created_client" as const,
      clientId,
      role: "admin" as const,
    };
  });

type LinkWhatsAppInput = {
  clientId: string;
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
};

/**
 * Completes WhatsApp Embedded Signup: exchanges the `code` the Facebook JS
 * SDK returned for a Meta access token (server-side only — this never
 * touches the browser), then stores the WABA/phone-number identifiers on
 * the tenant's `clients` row so incoming WhatsApp leads can be resolved to
 * this tenant automatically.
 */
export const linkWhatsAppAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: LinkWhatsAppInput) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("client_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile?.client_id || profile.client_id !== data.clientId || profile.role !== "admin") {
      throw new Error("You're not authorized to connect WhatsApp for this tenant.");
    }

    let accessToken: string | null = null;
    let accessTokenExpiresAt: string | null = null;

    if (META_APP_ID && META_APP_SECRET) {
      // Step 1: exchange the short-lived OAuth code for an initial token
      try {
        const params = new URLSearchParams({
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          code: data.code,
        });
        const tokenRes = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${params.toString()}`,
        );
        const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: unknown };
        if (tokenJson.access_token) accessToken = tokenJson.access_token;
        else console.error("Meta token exchange did not return a token", tokenJson.error);
      } catch (err) {
        console.error("Meta token exchange failed", err);
      }

      // Step 2: exchange the short-lived token for a long-lived token (~60 days)
      if (accessToken) {
        try {
          const llParams = new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            fb_exchange_token: accessToken,
          });
          const llRes = await fetch(
            `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${llParams.toString()}`,
          );
          const llJson = (await llRes.json()) as {
            access_token?: string;
            expires_in?: number;
            error?: unknown;
          };
          if (llJson.access_token) {
            accessToken = llJson.access_token;
            // expires_in is in seconds; default to 60 days if not returned
            const secondsToExpiry = llJson.expires_in ?? 60 * 24 * 60 * 60;
            accessTokenExpiresAt = new Date(Date.now() + secondsToExpiry * 1000).toISOString();
          } else {
            console.error("Meta long-lived token exchange failed", llJson.error);
          }
        } catch (err) {
          console.error("Meta long-lived token exchange failed", err);
        }
      }
    }

    let displayPhoneNumber: string | null = null;
    if (accessToken && data.phoneNumberId) {
      try {
        const phoneRes = await fetch(
          `https://graph.facebook.com/${META_GRAPH_VERSION}/${data.phoneNumberId}?fields=display_phone_number&access_token=${accessToken}`,
        );
        const phoneJson = (await phoneRes.json()) as { display_phone_number?: string };
        displayPhoneNumber = phoneJson.display_phone_number ?? null;
      } catch (err) {
        console.error("Meta phone-number lookup failed", err);
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("clients")
      .update({
        waba_id: data.wabaId ?? null,
        phone_number_id: data.phoneNumberId ?? null,
        waba_business_id: data.businessId ?? null,
        access_token: accessToken,
        access_token_expires_at: accessTokenExpiresAt,
        display_phone_number: displayPhoneNumber,
        is_active: true,
        meta_signup_status: accessToken ? "connected" : "connected_pending_token",
      })
      .eq("id", data.clientId);
    if (updateErr) throw new Error(updateErr.message);

    const { data: existingIntegration } = await supabaseAdmin
      .from("client_integrations")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("provider", "meta")
      .maybeSingle();

    if (existingIntegration) {
      await supabaseAdmin
        .from("client_integrations")
        .update({ is_enabled: true, webhook_url: META_WEBHOOK_URL })
        .eq("id", existingIntegration.id);
    } else {
      await supabaseAdmin.from("client_integrations").insert({
        client_id: data.clientId,
        provider: "meta",
        is_enabled: true,
        webhook_url: META_WEBHOOK_URL,
        label: "WhatsApp (Meta Cloud API)",
      });
    }

    return { status: accessToken ? ("connected" as const) : ("connected_pending_token" as const) };
  });

/**
 * Clears all WhatsApp credentials for the tenant's `clients` row and disables
 * the Meta `client_integrations` entry.  Only the tenant admin may call this.
 */
export const disconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { clientId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("client_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile?.client_id || profile.client_id !== data.clientId || profile.role !== "admin") {
      throw new Error("You're not authorized to disconnect WhatsApp for this tenant.");
    }

    const { error: updateErr } = await supabaseAdmin
      .from("clients")
      .update({
        waba_id: null,
        phone_number_id: null,
        waba_business_id: null,
        access_token: null,
        access_token_expires_at: null,
        display_phone_number: null,
        meta_signup_status: "disconnected",
      })
      .eq("id", data.clientId);
    if (updateErr) throw new Error(updateErr.message);

    // Disable (but don't delete) the meta integration row so webhook history is preserved
    await supabaseAdmin
      .from("client_integrations")
      .update({ is_enabled: false })
      .eq("client_id", data.clientId)
      .eq("provider", "meta");

    return { status: "disconnected" as const };
  });

type TestConnectionResult =
  | { ok: true; displayPhoneNumber: string }
  | { ok: false; reason: "no_credentials" | "token_invalid" | "number_not_found" | "network_error" };

/**
 * Probes the Meta Graph API with the tenant's stored credentials to verify
 * the token and phone number are still live.
 */
export const testWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { clientId: string }) => data)
  .handler(async ({ data, context }): Promise<TestConnectionResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Any team member (not just admin) may run the test
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("client_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile?.client_id || profile.client_id !== data.clientId) {
      throw new Error("Not authorized.");
    }

    const { data: clientRow } = await supabaseAdmin
      .from("clients")
      .select("access_token, phone_number_id")
      .eq("id", data.clientId)
      .maybeSingle();

    if (!clientRow?.access_token || !clientRow?.phone_number_id) {
      return { ok: false, reason: "no_credentials" };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${clientRow.phone_number_id}?fields=display_phone_number&access_token=${clientRow.access_token}`,
      );
      const json = (await res.json()) as {
        display_phone_number?: string;
        error?: { code?: number; message?: string };
      };
      if (json.display_phone_number) {
        return { ok: true, displayPhoneNumber: json.display_phone_number };
      }
      const errCode = json.error?.code;
      return {
        ok: false,
        reason: errCode === 190 ? "token_invalid" : "number_not_found",
      };
    } catch {
      return { ok: false, reason: "network_error" };
    }
  });
