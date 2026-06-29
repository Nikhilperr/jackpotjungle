import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Users, Share2, DollarSign, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/referral")({
  head: () => ({ meta: [{ title: "Referral Program — Jackpot Jungle" }] }),
  component: ReferralPage,
});

function ReferralPage() {
  const steps = [
    {
      step: "01",
      title: "Get Your Custom Link",
      desc: "Register your free account and locate your unique referral code inside your profile settings.",
    },
    {
      step: "02",
      title: "Invite Your Friends",
      desc: "Share your code on social media, group chats, or directly to friends via Jackpot Jungle messenger.",
    },
    {
      step: "03",
      title: "Earn Lifetime Bonus",
      desc: "Receive instant signup bonus credits plus 10% lifetime commissions on all active reward spins.",
    },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-purple-500/10 text-purple-400 items-center justify-center border border-purple-500/20 shadow-md">
            <Users className="h-7 w-7" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Referral Partner Program
          </h1>
          <p className="text-muted-foreground text-lg">
            Invite your friends to Jackpot Jungle and build a passive income network with instant bonus payouts.
          </p>
        </div>

        {/* 3 Step Guide */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.step} className="p-8 rounded-3xl bg-card border border-border/60 space-y-4 shadow-md relative">
              <span className="text-4xl font-black text-primary/30 block">{s.step}</span>
              <h3 className="font-extrabold text-xl text-foreground">{s.title}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Call To Action Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-primary/20 via-purple-600/20 to-amber-500/20 border border-border/80 p-8 sm:p-12 text-center space-y-6">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground">Ready to Start Inviting?</h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Create your free Jackpot Jungle account today and generate your personal invite link instantly.
          </p>
          <div>
            <Link
              to="/app/auth"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-lg hover:shadow-primary/20"
            >
              <span>Get Your Referral Link</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
