import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/landing/PublicLayout";
import { Zap, Timer, ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/promotions")({
  head: () => ({ meta: [{ title: "Promotions — Jackpot Jungle" }] }),
  component: PromotionsPage,
});

function PromotionsPage() {
  const promos = [
    {
      title: "New Member Welcome Bonus",
      badge: "Active",
      desc: "Sign up and complete your onboarding profile verification to receive an instant $5.00 wallet credit bonus.",
      code: "WELCOME5",
      expiry: "Ongoing",
    },
    {
      title: "Referral Network Boost",
      badge: "Limited Time",
      desc: "For every friend who verifies their email, both of you get an elevated $2.00 reward credit.",
      code: "JUNGLEBOOST",
      expiry: "Expires in 15 days",
    },
    {
      title: "Daily VIP Cashback Special",
      badge: "VIP Exclusive",
      desc: "Claim an elevated cashback percentage up to 8% based on your VIP status tier tier rankings.",
      code: "VIPCASH",
      expiry: "Ongoing",
    },
  ];

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex h-14 w-14 rounded-full bg-amber-500/10 text-amber-400 items-center justify-center border border-amber-500/20 shadow-md">
            <Zap className="h-7 w-7 animate-bounce" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Active Promotions
          </h1>
          <p className="text-muted-foreground text-lg">
            Boost your balance with our limited-time special codes, welcome incentives, and VIP exclusive campaigns.
          </p>
        </div>

        {/* Promo Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {promos.map((p) => (
            <div 
              key={p.title}
              className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/50 transition-all flex flex-col justify-between shadow-md"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    p.badge === "Active" ? "bg-emerald-500/10 text-emerald-400" :
                    p.badge === "Limited Time" ? "bg-amber-500/10 text-amber-400" : "bg-purple-500/10 text-purple-400"
                  }`}>
                    {p.badge}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Timer className="h-3 w-3" /> {p.expiry}
                  </span>
                </div>
                <h3 className="font-extrabold text-xl text-foreground">{p.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {p.desc}
                </p>
                <div className="pt-2">
                  <div className="p-3 rounded-xl bg-secondary/60 border border-border/40 text-center">
                    <span className="text-[10px] text-muted-foreground block uppercase font-bold tracking-widest mb-1">Promo Code</span>
                    <span className="font-mono text-base font-black text-primary tracking-wide">{p.code}</span>
                  </div>
                </div>
              </div>
              <div className="pt-6">
                <Link
                  to="/auth"
                  className="w-full py-3 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-primary/10"
                >
                  <span>Apply Code</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Secure Platform Highlights */}
        <div className="bg-secondary/20 border border-border/40 rounded-3xl p-8 sm:p-12 text-center space-y-4">
          <div className="h-10 w-10 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-xl font-extrabold text-foreground">Verified Promotion Verification</h3>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
            All bonus codes are checked by our database validator. Users are limited to one welcome code per verified account to prevent duplicate claiming.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
