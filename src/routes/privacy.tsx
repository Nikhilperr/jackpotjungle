import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — Jackpot Jungle" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-400 items-center justify-center border border-emerald-500/20 shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-sm">
            Last updated: June 30, 2026
          </p>
        </div>

        {/* Legal Text */}
        <div className="p-8 rounded-3xl bg-card border border-border/60 space-y-6 text-sm text-muted-foreground leading-relaxed shadow-sm">
          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">1. Introduction</h3>
            <p>
              Jackpot Jungle ("we", "our", or "us") respects your privacy and is committed to protecting your personal data. This privacy policy informs you about how we handle your personal data when you visit our web platform or native application.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">2. Data We Collect</h3>
            <p>
              We may collect personal identification information including your username, email address, IP address, device specifications, and communications metadata within the messenger application.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">3. How We Use Your Information</h3>
            <p>
              Your information is used exclusively to facilitate your account authentication, maintain live messenger socket channels, deliver reward wallet updates, and ensure platform security against fraudulent activity.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">4. Data Security</h3>
            <p>
              We implement strict Row-Level Security (RLS) database policies and industry-standard encryption protocols to protect your personal data against unauthorized access, alteration, or disclosure.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">5. Contact Us</h3>
            <p>
              If you have questions regarding this Privacy Policy or wish to request data deletion, please reach out to support@playjackpotjungle.com.
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
