import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Nextgn Realtors" },
      { name: "description", content: "Privacy Policy for Nextgn Realtors platform." },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: October 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-sm leading-relaxed text-foreground">
            <Section title="1. Introduction">
              Nextgn Realtors ("we", "us", or "our") operates a multi-tenant CRM platform for real
              estate businesses. This Privacy Policy explains how we collect, use, and protect your
              information when you use our platform.
            </Section>

            <Section title="2. Information We Collect">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Account information</strong> — name, email address, and Facebook profile
                  data when you sign in via Facebook Login.
                </li>
                <li>
                  <strong>Business information</strong> — company name, WhatsApp Business Account
                  details, and phone number provided during onboarding.
                </li>
                <li>
                  <strong>Lead data</strong> — contact information and interaction history of leads
                  managed within your workspace.
                </li>
                <li>
                  <strong>Usage data</strong> — actions taken within the platform such as lead
                  updates, site visit confirmations, and executive assignments.
                </li>
              </ul>
            </Section>

            <Section title="3. How We Use Your Information">
              <ul className="list-disc space-y-1 pl-5">
                <li>To provide and operate the CRM platform and WhatsApp automation features.</li>
                <li>To send automated follow-up messages to your leads on your behalf via WhatsApp.</li>
                <li>To authenticate users via Facebook Login and Supabase Auth.</li>
                <li>To improve platform features and performance.</li>
              </ul>
            </Section>

            <Section title="4. Data Sharing">
              We do not sell your data. We share data only with:
              <ul className="list-disc space-y-1 pl-5 mt-2">
                <li>
                  <strong>Meta (Facebook/WhatsApp)</strong> — to enable Facebook Login and WhatsApp
                  Business API messaging.
                </li>
                <li>
                  <strong>Supabase</strong> — our database and authentication provider.
                </li>
                <li>
                  <strong>n8n</strong> — our workflow automation provider for WhatsApp follow-ups.
                </li>
              </ul>
            </Section>

            <Section title="5. Data Retention">
              Your data is retained for as long as your account is active. You may request deletion
              of your account and associated data at any time by contacting us.
            </Section>

            <Section title="6. Security">
              We implement industry-standard security measures including row-level security on our
              database, encrypted connections (HTTPS), and secure token storage.
            </Section>

            <Section title="7. Your Rights">
              You have the right to access, correct, or delete your personal data. To exercise
              these rights, contact us at the email below.
            </Section>

            <Section title="8. Contact Us">
              For privacy-related queries, contact us at:{" "}
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
