import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Info, Sparkles, ShieldCheck, Heart, Award } from "lucide-react";

export const Route = createFileRoute("/app/_authenticated/about")({
  ssr: false,
  head: () => ({ meta: [{ title: "About Us — JJ Messenger" }] }),
  component: AboutUsPage,
});

function AboutUsPage() {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <span>About Us</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          {/* Main Hero card */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-purple-600/10 to-amber-500/10 border border-border/80 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-lg select-none">
            <div className="space-y-3 max-w-xl text-left">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block flex items-center gap-1 w-fit">
                <Sparkles className="h-3 w-3" />
                Who We Are
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-sans">
                Welcome to the Jungle
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Jackpot Jungle is a next-generation social casino messenger platform. We blend secure direct communication, real-time sweepstakes community groups, and VIP loyalty rewards into a single unified social app experience.
              </p>
            </div>
          </div>

          {/* Mission & Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left">
            <div className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/20 transition-all space-y-3">
              <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                <Heart className="h-5 w-5" />
              </div>
              <h3 className="font-extrabold text-base text-foreground">Social First Approach</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We believe social gaming is meant to be social. By integrating dynamic messenger capabilities directly with gaming support, we remove friction and connect players immediately with active casino hosts.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border/60 hover:border-primary/20 transition-all space-y-3">
              <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-extrabold text-base text-foreground">Privacy & Security</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Our messenger architecture employs state-of-the-art secure routing, ledger logging, and dynamic encryption layers so that your profile identity, chats, and credit transfers remain entirely confidential.
              </p>
            </div>
          </div>

          {/* Corporate Details Accordion/Section */}
          <div className="bg-card border border-border/60 rounded-3xl p-6 text-left space-y-4">
            <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
              <Award className="h-4.5 w-4.5 text-primary" /> Regulatory & Sweepstakes Rules
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Jackpot Jungle operates under standard US/Canadian social sweepstakes guidelines. No purchase is necessary to participate in sweepstakes promotions. The credits, spins, and coins loaded on the platform hold no external cash value and are strictly governed by our social casino compliance policies.
            </p>
            <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-muted-foreground uppercase">Platform Version</span>
                <p className="font-bold text-foreground">v2.4.1 (Stable Build)</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-black text-muted-foreground uppercase">Compliance</span>
                <p className="font-bold text-foreground">Social Sweepstakes Rules Met</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
