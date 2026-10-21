import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Nextgn Realtors" },
      { name: "description", content: "Terms of Service for Nextgn Realtors platform." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms of Service</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: October 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-sm leading-relaxed text-foreground">
            <Section title="1. Acceptance of Terms">
              By accessing or using the Nextgn Realtors platform, you agree to be bound by these
              Terms of Service. If you do not agree, please do not use the platform.
            </Section>

            <Section title="2. Description of Service">
              Nextgn Realtors provides a multi-tenant CRM platform for real estate businesses,
              including lead management, WhatsApp automation, inventory tracking, and team
              performance tools.
            </Section>

            <Section title="3. Account Registration">
              <ul className="list-disc space-y-1 pl-5">
                <li>You must provide accurate information when creating an account.</li>
                <li>
                  You are responsible for maintaining the security of your account credentials.
                </li>
                <li>Each workspace is isolated — you may only access data within your tenant.</li>
              </ul>
            </Section>

            <Section title="4. Acceptable Use">
              You agree not to:
              <ul className="list-disc space-y-1 pl-5 mt-2">
                <li>Use the platform for any unlawful purpose.</li>
                <li>Send unsolicited or spam messages via the WhatsApp integration.</li>
                <li>Attempt to access another tenant's data.</li>
                <li>Reverse engineer or tamper with the platform.</li>
              </ul>
            </Section>

            <Section title="5. WhatsApp Messaging">
              By connecting a WhatsApp Business Account, you agree to comply with{" "}
              <a
                href="https://www.whatsapp.com/legal/business-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                WhatsApp's Business Policy
              </a>{" "}
              and{" "}
              <a
                href="https://developers.facebook.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Meta's Platform Terms
              </a>
              . You are solely responsible for the content of messages sent to your leads.
            </Section>

            <Section title="6. Data Ownership">
              You retain ownership of all lead data and business data you upload to the platform.
              We do not claim any rights over your data.
            </Section>

            <Section title="7. Service Availability">
              We aim to maintain high availability but do not guarantee uninterrupted access. We
              are not liable for downtime caused by third-party services (Meta, Supabase, Vercel).
            </Section>

            <Section title="8. Termination">
              We reserve the right to suspend or terminate accounts that violate these terms. You
              may terminate your account at any time by contacting us.
            </Section>

            <Section title="9. Limitation of Liability">
              To the maximum extent permitted by law, Nextgn Realtors is not liable for indirect,
              incidental, or consequential damages arising from your use of the platform.
            </Section>

            <Section title="10. Changes to Terms">
              We may update these terms from time to time. Continued use of the platform after
              changes constitutes acceptance of the updated terms.
            </Section>

            <Section title="11. Contact Us">
              For questions about these terms, contact us at:{" "}
              <a href="mailto:support@nextgnrealtors.com" className="text-primary underline">
                support@nextgnrealtors.com
              </a>
            </Section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
