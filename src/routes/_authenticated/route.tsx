import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    const isDemo = typeof window !== "undefined" && localStorage.getItem("demo_mode") === "true";
    if (!data?.user && !isDemo) throw redirect({ to: "/auth" });
    return {
      user: data?.user ?? ({ id: "demo-admin-id", email: "admin@nextgenrealty.com" } as any),
    };
  },
  component: () => <Outlet />,
});
