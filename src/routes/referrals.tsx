import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Users, Share2, DollarSign, ArrowRight, HelpCircle, Gift } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "Referral Program — Jackpot Jungle Messenger & Casino" },
      { name: "description", content: "Earn passive income with the Jackpot Jungle Referral Program. Share your invite link to get signup bonuses and 10% lifetime commissions." },
      { property: "og:title", content: "Referral Program — Jackpot Jungle Messenger & Casino" },
      { property: "og:description", content: "Invite friends to Jackpot Jungle and earn lifetime commission rewards. Custom signup bonuses and progressive referral tiers." },
      { property: "og:url", content: "https://playjackpotjungle.com/referrals" },
      { name: "twitter:title", content: "Referral Program — Jackpot Jungle Messenger & Casino" },
      { name: "twitter:description", content: "Details on how the Jackpot Jungle referral bonus works, sign up requirements, and dynamic player rewards." },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

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

  const benefits = [
    {
      title: "Instant Signup Bonus",
      val: "$2.00 / Friend",
      desc: "Both you and your referred friend receive $2.00 in wallet credits immediately upon their email verification.",
    },
    {
      title: "Lifetime Commission",
      val: "10% Commission",
      desc: "Earn a continuous 10% split of all progressive spin rewards and streaking bonuses claimed by your referrals.",
    },
    {
      title: "Network Multipliers",
      val: "Up to 2x Boost",
      desc: "Increase your base commissions to 15% and 20% as your total active network pool expands.",
    },
  ];

  const faqs = [
    {
      q: "Is there a limit to how many friends I can invite?",
      a: "No! There is no limit. You can invite as many users as you like and accumulate lifetime compounding commissions.",
    },
    {
      q: "When are commissions deposited into my wallet?",
      a: "Commissions are processed and deposited instantly in real time whenever your referrals claim their rewards.",
    },
    {
      q: "Can I transfer my referral credits?",
      a: "Yes. Referral wallet balance can be used directly for sweeps gaming or transferred to friend accounts via the messenger interface.",
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {steps.map((s) => (
            <div key={s.step} className="p-8 rounded-3xl bg-card border border-border/60 space-y-4 shadow-md relative">
              <span className="text-4xl font-black text-primary/30 block">{s.step}</span>
              <h3 className="font-extrabold text-xl text-foreground">{s.title}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Earning Benefits Overview */}
        <div className="space-y-8 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center">Earnings & Benefits Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {benefits.map((b) => (
              <div key={b.title} className="p-6 rounded-3xl bg-secondary/15 border border-border/40 flex flex-col justify-between shadow-inner">
                <div className="space-y-3">
                  <span className="text-xs font-extrabold text-primary tracking-widest uppercase">Rewards Structure</span>
                  <h4 className="font-extrabold text-lg text-foreground">{b.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
                <div className="pt-6 font-black text-xl text-amber-500">{b.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-foreground text-center">Referral Program FAQs</h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div key={idx} className="border border-border/60 rounded-2xl bg-card shadow-sm overflow-hidden">
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-5 flex items-center justify-between font-bold text-sm sm:text-base text-foreground text-left hover:bg-secondary/40 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <HelpCircle className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180 text-primary" : "text-muted-foreground"}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Call To Action Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-primary/20 via-purple-600/20 to-amber-500/20 border border-border/80 p-8 sm:p-12 text-center space-y-6 max-w-5xl mx-auto">
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
