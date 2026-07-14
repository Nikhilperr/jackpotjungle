import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Info, Sparkles, ShieldCheck, Heart, Award, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/about")({
  ssr: false,
  head: () => ({ meta: [{ title: "About Us — JJ Messenger" }] }),
  component: AboutUsPage,
});

function AboutUsPage() {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto bg-background/30">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2 bg-card/60 backdrop-blur-md sticky top-0 z-10">
          <HamburgerButton />
          <h1 className="font-extrabold flex items-center gap-2 text-foreground font-sans">
            <Info className="h-5 w-5 text-primary" />
            <span>About Us</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          {/* Main Hero Card */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-purple-600/5 to-amber-500/5 border border-border/60 p-6 sm:p-8 relative overflow-hidden shadow-sm select-none text-left">
            <div className="space-y-3 max-w-xl">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block flex items-center gap-1 w-fit">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Who We Are
              </span>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground font-sans">
                Welcome to the Jungle
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Jackpot Jungle is a next-generation social casino messenger platform. We blend secure direct communication, real-time sweepstakes community groups, and VIP loyalty rewards into a single unified social app experience.
              </p>
            </div>
          </div>

          {/* Core Values / Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left">
            <div className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/35 hover:shadow-sm transition-all duration-300 space-y-4">
              <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/15">
                <Heart className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h3 className="font-extrabold text-sm text-foreground font-sans">Social First Approach</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We believe social gaming is meant to be social. By integrating dynamic messenger capabilities directly with gaming support, we remove friction and connect players immediately with active casino hosts.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/35 hover:shadow-sm transition-all duration-300 space-y-4">
              <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center border border-primary/15">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h3 className="font-extrabold text-sm text-foreground font-sans">Privacy & Security</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Our messenger architecture employs state-of-the-art secure routing, ledger logging, and dynamic encryption layers so that your profile identity, chats, and credit transfers remain entirely confidential.
                </p>
              </div>
            </div>
          </div>

          {/* Sweepstakes Guidelines */}
          <div className="bg-card border border-border/60 rounded-3xl p-6 text-left space-y-4 shadow-sm">
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2 font-sans">
                <Award className="h-4.5 w-4.5 text-primary" /> Regulatory & Sweepstakes Rules
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Jackpot Jungle operates under standard US/Canadian social sweepstakes guidelines. No purchase is necessary to participate in sweepstakes promotions. The credits, spins, and coins loaded on the platform hold no external cash value and are strictly governed by our social casino compliance policies.
              </p>
            </div>

            {/* Verification highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px] text-muted-foreground border-t border-border/40">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <span>Geographical restrictions apply (US/CA only)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                <span>Fair play random numbers generator audited</span>
              </div>
            </div>

            {/* Version Metadata grid */}
            <div className="pt-4 border-t border-border/45 grid grid-cols-3 gap-4 text-xs font-sans">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-wide block">Version</span>
                <p className="font-bold text-foreground font-mono">v2.4.1 (Stable)</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-wide block">Auditing</span>
                <p className="font-bold text-foreground font-mono">SOC2-Ready</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-wide block">Sweepstakes</span>
                <p className="font-bold text-foreground font-mono">Compliant</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
