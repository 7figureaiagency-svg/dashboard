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
  process.env["META_WEBHOOK_URL"] || "https://n8n.yourdomain.com/webhook/meta-whatsapp";

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

    const { data: newClient, error: clientErr } = await supabaseAdmin
      .from("clients")
      .insert({
        company_name: data.companyName.trim(),
        email: lookupEmail || null,
        owner_user_id: userId,
        is_active: true,
      })
      .select("id")
      .single();
    if (clientErr) throw new Error(clientErr.message);

    const profileUpdate: Record<string, unknown> = { role: "admin", client_id: newClient.id };
    if (data.phone) profileUpdate["phone"] = data.phone;

    const { error: promoteErr } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate as never)
      .eq("id", userId);
    if (promoteErr) throw new Error(promoteErr.message);

    return {
      status: "created_client" as const,
      clientId: newClient.id as string,
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
    if (META_APP_ID && META_APP_SECRET) {
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
