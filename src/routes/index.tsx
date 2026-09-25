import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nextgn Realtors — Real Estate CRM & Inventory Panel" },
      {
        name: "description",
        content:
          "Manage property leads, site visits, sales team SLAs and live inventory from one real estate admin panel.",
      },
      { property: "og:title", content: "Nextgn Realtors — Real Estate CRM & Inventory Panel" },
      {
        property: "og:description",
        content:
          "Track leads, book site visits, monitor executive response times and manage property inventory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight">Nextgn Realtors Admin Panel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Leads, site visits, team performance and property inventory in one place.
        </p>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
