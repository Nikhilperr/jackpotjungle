import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Check, Gift, Share2, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/app/_authenticated/refer-earn")({
  ssr: false,
  head: () => ({ meta: [{ title: "Refer & Earn — JJ Messenger" }] }),
  component: ReferEarnPage,
});

type Profile = {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  friend_code: string;
  referral_code: string;
  avatar_url: string | null;
  created_at: string;
  referred_by?: string | null;
};

function ReferEarnPage() {
  const { user, loading: authLoading } = useAuth();
  
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("jj_cached_my_profile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    
    supabase.from("profiles")
      .select("id, username, first_name, last_name, avatar_url, friend_code, referral_code, created_at, referred_by" as any)
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data) return;
        const profileData = data as unknown as Profile;
        setProfile(profileData);
        try {
          localStorage.setItem("jj_cached_my_profile", JSON.stringify(profileData));
        } catch {}
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  const referralLink = profile?.referral_code
    ? `${window.location.origin}/referrals?code=${profile.referral_code}`
    : "";

  const handleCopyCode = () => {
    if (!profile?.referral_code) return;
    navigator.clipboard.writeText(profile.referral_code);
    setCopiedCode(true);
    toast.success("Referral code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (authLoading || !profile) {
    return (
      <AppShell>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2 bg-card/90 backdrop-blur-md sticky top-0 z-10">
          <HamburgerButton />
          <h1 className="font-bold">Refer & Earn</h1>
        </div>

        {/* Page Body */}
        <div className="max-w-5xl mx-auto p-4 pb-28 md:pb-6 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          {/* Dashboard Header Promo Card */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-purple-600/10 to-amber-500/10 border border-border/80 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-lg select-none">
            <div className="space-y-3 max-w-2xl text-left">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block">
                Partnership Rewards
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Invite Friends to Jackpot Jungle
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Refer your friends using your custom referral credentials below. You can track your referral network and bonuses directly with our Support Hosts.
              </p>
            </div>
            <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
              <Gift className="h-10 w-10 animate-bounce" />
            </div>
          </div>

          {/* Two-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Share and Credentials */}
            <div className="lg:col-span-6 space-y-6">
              
              {/* Share & Codes Panel */}
              <div className="bg-card border border-border/60 rounded-3xl p-5 md:p-6 space-y-5 shadow-sm">
                <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                  <Share2 className="h-4.5 w-4.5 text-primary" /> Your Sharing Credentials
                </h3>

                <div className="space-y-4">
                  {/* Referral Code */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Your Referral Code</label>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-secondary border border-border/60 rounded-2xl px-4 py-3 font-mono font-bold text-sm tracking-wider text-foreground select-all flex items-center justify-between">
                        {profile.referral_code}
                      </div>
                      <Button onClick={handleCopyCode} variant="outline" className="rounded-2xl shrink-0 px-4 h-12 font-bold text-xs gap-1.5">
                        {copiedCode ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        <span>{copiedCode ? "Copied" : "Copy"}</span>
                      </Button>
                    </div>
                  </div>

                  {/* Referral Link */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Your Unique Invite Link</label>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-secondary border border-border/60 rounded-2xl px-4 py-3 text-xs text-muted-foreground truncate flex items-center select-all">
                        {referralLink}
                      </div>
                      <Button onClick={handleCopyLink} variant="outline" className="rounded-2xl shrink-0 px-4 h-12 font-bold text-xs gap-1.5">
                        {copiedLink ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        <span>{copiedLink ? "Copied" : "Copy"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Referral Rules & Guidelines */}
            <div className="lg:col-span-6 space-y-6">
              
              <div className="bg-card border border-border/60 rounded-3xl p-5 md:p-6 shadow-sm space-y-4 text-left">
                <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                  <Gift className="h-4.5 w-4.5 text-primary" /> Referral Program Guidelines
                </h3>
                
                <div className="space-y-4 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  <p>
                    Inviting friends to Jackpot Jungle is extremely easy. Once your friend registers an account, please have them sign up. The administrator registers your referral connection in the system.
                  </p>
                  
                  <div className="p-4 bg-secondary/35 border border-border/40 rounded-2xl space-y-2 text-foreground font-medium">
                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                      Manual Bonus Payouts
                    </div>
                    <p className="text-xs text-muted-foreground">
                      An administrator will manually link your referral status in the system config dashboard. Once verified, your referral bonus is delivered directly via a system chat page message!
                    </p>
                  </div>

                  <p className="text-xs">
                    * Referral bonuses are subject to Jackpot Jungle's standard Terms of Service and wagering/session validation checks. Abuse of the referral system is strictly prohibited.
                  </p>
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>
    </AppShell>
  );
}
