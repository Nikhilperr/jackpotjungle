import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Jackpot Jungle Casino & Messenger" },
      { name: "description", content: "Read the official Jackpot Jungle Terms of Service. Review user guidelines, account rules, sweeps promotions parameters, and fair play requirements." },
      { property: "og:title", content: "Terms & Conditions — Jackpot Jungle Casino & Messenger" },
      { property: "og:description", content: "Jackpot Jungle Terms of Service. Detailed rules on welcome bonuses, referral payouts, and account safety guidelines." },
      { property: "og:url", content: "https://playjackpotjungle.com/terms" },
      { name: "twitter:title", content: "Terms & Conditions — Jackpot Jungle Casino & Messenger" },
      { name: "twitter:description", content: "Review user guidelines, credit transfer rules, and account registration requirements at Jackpot Jungle." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-primary/10 text-primary items-center justify-center border border-primary/20 shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Terms & Conditions
          </h1>
          <p className="text-muted-foreground text-sm">
            Last updated: June 30, 2026
          </p>
        </div>

        {/* Legal Text */}
        <div className="p-8 rounded-3xl bg-card border border-border/60 space-y-6 text-sm text-muted-foreground leading-relaxed shadow-sm">
          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">1. Acceptance of Terms</h3>
            <p>
              By accessing or using the Jackpot Jungle messenger platform, website, or application, you agree to comply with and be bound by these Terms and Conditions. If you do not agree to these terms, you must immediately terminate platform access.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">2. Account Responsibility</h3>
            <p>
              You must provide accurate verification information during onboarding and maintain account credentials securely. You are solely responsible for all activities occurring under your registered user profile.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">3. Fair Play & Conduct</h3>
            <p>
              Users are prohibited from creating duplicate accounts to claim welcome bonuses, employing automated scripts to game leaderboard scores, or engaging in harassing behavior inside direct chats. Violations will result in immediate permanent account suspension.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">4. Wallet & Rewards Credits</h3>
            <p>
              Jackpot Jungle reserves the right to modify daily spin values, referral coefficients, and cashback multiplier limits at our discretion without prior notice. Reward credits cannot be transferred or traded outside of authorized channels.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-lg text-foreground">5. Governing Law</h3>
            <p>
              These Terms and Conditions shall be governed by and construed in accordance with standard international commerce regulations.
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
