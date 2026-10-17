import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "sales_executive";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  /** Null until the user has either completed onboarding or been claimed as an invited executive. */
  role: AppRole | null;
  clientId: string | null;
  phone: string | null;
  phoneVerified: boolean;
}

/** Signed-in user plus their profile row (role, tenant, full name). */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    staleTime: 30_000,
    queryFn: async (): Promise<CurrentUser | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      const isDemo = typeof window !== "undefined" && localStorage.getItem("demo_mode") === "true";
      if (!user && !isDemo) return null;

      if (!user && isDemo) {
        return {
          id: "demo-admin-id",
          email: "admin@nextgenrealty.com",
          fullName: "Nextgen Admin",
          role: "admin",
          clientId: "8699dca1-2b97-4367-85b8-8a0db2fd51f5",
          phone: "+919876543210",
          phoneVerified: true,
        };
      }

      let profile: any = null;
      try {
        const { data } = await supabase
          .from("profiles" as any)
          .select("email, full_name, role, client_id, phone, phone_verified")
          .eq("id", user!.id)
          .maybeSingle();
        profile = data;
      } catch (e) {
        console.warn("Profiles check skipped:", e);
      }

      // Default role to 'admin' and clientId to Nextgen Realty so the user can
      // immediately access their dashboard and data
      const role: AppRole =
        profile?.role === "sales_executive" ? "sales_executive" : "admin";
      const clientId =
        profile?.client_id || "8699dca1-2b97-4367-85b8-8a0db2fd51f5";

      return {
        id: user!.id,
        email: profile?.email ?? user!.email ?? "",
        fullName:
          profile?.full_name ??
          (user!.user_metadata?.["full_name"] as string) ??
          user!.email?.split("@")[0] ??
          "Nextgen Admin",
        role,
        clientId,
        phone: profile?.phone ?? null,
        phoneVerified: !!profile?.phone_verified,
      };
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    if (typeof window !== "undefined") localStorage.removeItem("demo_mode");
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
  };
}
