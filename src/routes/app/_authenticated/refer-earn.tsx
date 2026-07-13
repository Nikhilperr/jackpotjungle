import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Check, Gift, Users, Loader2, Share2, HelpCircle, ArrowRight, Coins, Percent } from "lucide-react";
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

// Commission calculator configuration based on Jackpot Jungle deposit-based session bonuses
const DEPOSIT_TIERS = [
  { deposit: 25, bonus: 5, commission: 0.5 },
  { deposit: 50, bonus: 15, commission: 1.5 },
  { deposit: 100, bonus: 35, commission: 3.50 },
  { deposit: 250, bonus: 100, commission: 10.00 },
  { deposit: 500, bonus: 250, commission: 25.00 },
  { deposit: 1000, bonus: 600, commission: 60.00 },
];

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

  // Referred by and referred users list states
  const [referredByProfile, setReferredByProfile] = useState<any>(null);
  const [referralsList, setReferralsList] = useState<any[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);

  // Copy indicator states
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Calculator states
  const [selectedTierIdx, setSelectedTierIdx] = useState(2); // Default to $100 tier
  const [customDeposit, setCustomDeposit] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    
    // Fetch profile
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

  // Load referral details
  useEffect(() => {
    if (!user) return;
    
    let mounted = true;
    setLoadingReferrals(true);
    
    const fetchDetails = async () => {
      try {
        // 1. Fetch referred_by from current user's profile
        const { data: myProf } = await supabase
          .from("profiles")
          .select("referred_by")
          .eq("id", user.id)
          .maybeSingle();

        if (myProf?.referred_by && mounted) {
          const { data: refBy } = await supabase
            .from("profiles")
            .select("username, first_name, last_name")
            .eq("id", myProf.referred_by)
            .maybeSingle();
          if (mounted) setReferredByProfile(refBy);
        }

        // 2. Fetch whom I referred
        const { data: refs, error: refsErr } = await supabase
          .from("referrals")
          .select("*")
          .eq("referrer_id", user.id);

        if (refsErr) throw refsErr;

        if (refs && refs.length > 0 && mounted) {
          const referredIds = refs.map((r) => r.referred_id);
          const { data: profs, error: profsErr } = await supabase
            .from("profiles")
            .select("id, username, first_name, last_name, vip_status, avatar_url")
            .in("id", referredIds);

          if (profsErr) throw profsErr;

          const combined = refs.map((r) => {
            const matchedProf = profs?.find((p) => p.id === r.referred_id);
            return {
              id: r.id,
              status: r.status,
              created_at: r.created_at,
              referredUser: matchedProf || { username: "Unknown User" },
            };
          });
          if (mounted) setReferralsList(combined);
        } else if (mounted) {
          setReferralsList([]);
        }
      } catch (err: any) {
        console.error("Failed to load referral details:", err);
      } finally {
        if (mounted) setLoadingReferrals(false);
      }
    };

    fetchDetails();
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

  // Helper for computing custom deposits
  const getCustomCalculation = () => {
    const depVal = parseFloat(customDeposit);
    if (isNaN(depVal) || depVal <= 0) return null;
    
    // Approximate a tier or simple ratio
    // Jackpot Jungle session bonuses average around 15% to 60% depending on the size of the deposit
    let bonusRatio = 0.2; // default
    if (depVal >= 1000) bonusRatio = 0.6;
    else if (depVal >= 500) bonusRatio = 0.5;
    else if (depVal >= 250) bonusRatio = 0.4;
    else if (depVal >= 100) bonusRatio = 0.35;
    else if (depVal >= 50) bonusRatio = 0.3;
    
    const calculatedBonus = depVal * bonusRatio;
    const calculatedCommission = calculatedBonus * 0.10; // Referrer earns 10% of the session bonus

    return {
      deposit: depVal,
      bonus: calculatedBonus,
      commission: calculatedCommission,
    };
  };

  const currentCalc = customDeposit ? getCustomCalculation() : DEPOSIT_TIERS[selectedTierIdx];

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
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold">Refer & Earn</h1>
        </div>

        {/* Page Body */}
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          {/* Dashboard Header Promo Card */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-purple-600/10 to-amber-500/10 border border-border/80 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-lg select-none">
            <div className="space-y-3 max-w-2xl text-left">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-primary/20 text-primary border border-primary/30 tracking-widest inline-block">
                Partnership Rewards
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Earn Lifetime Commission on Friend Deposits
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Invite friends to Jackpot Jungle. When they complete a deposit, they receive a **Session Bonus** to play with, and you earn an instant **10% commission** based on that bonus!
              </p>
            </div>
            <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
              <Gift className="h-10 w-10 animate-bounce" />
            </div>
          </div>

          {/* Two-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Column: Share and Calculator */}
            <div className="lg:col-span-7 space-y-6">
              
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

              {/* Dynamic Session Bonus Commission Calculator */}
              <div className="bg-card border border-border/60 rounded-3xl p-5 md:p-6 space-y-6 shadow-sm">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                    <Coins className="h-4.5 w-4.5 text-primary" /> Session Bonus Earnings Calculator
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Estimate your passive earnings based on what your referred player deposits.
                  </p>
                </div>

                {/* Preset Deposit Selectors */}
                <div className="space-y-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider text-left block">
                    Simulate referred player deposit
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {DEPOSIT_TIERS.map((tier, idx) => {
                      const isActive = !customDeposit && selectedTierIdx === idx;
                      return (
                        <button
                          key={tier.deposit}
                          onClick={() => {
                            setCustomDeposit("");
                            setSelectedTierIdx(idx);
                          }}
                          className={`py-2 px-1 rounded-xl text-xs font-bold transition-all border ${
                            isActive
                              ? "bg-primary text-primary-foreground border-transparent shadow-sm"
                              : "bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border-border/60"
                          }`}
                        >
                          ${tier.deposit}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Deposit Field */}
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Or enter a custom deposit amount ($)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                    <Input
                      type="number"
                      placeholder="e.g. 150"
                      value={customDeposit}
                      onChange={(e) => {
                        setCustomDeposit(e.target.value);
                      }}
                      className="pl-7 bg-secondary border-border/60 rounded-2xl h-11"
                    />
                  </div>
                </div>

                {/* Simulated Results Grid */}
                <div className="bg-secondary/45 rounded-2xl border border-border/40 p-5 space-y-4 shadow-inner">
                  <div className="grid grid-cols-2 gap-4 divide-x divide-border/50">
                    
                    {/* Friend's Session Bonus */}
                    <div className="text-left space-y-1">
                      <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">Friend's Session Bonus</span>
                      <h4 className="text-xl sm:text-2xl font-black text-foreground font-mono">
                        ${currentCalc ? Number(currentCalc.bonus).toFixed(2) : "0.00"}
                      </h4>
                      <p className="text-[9px] text-muted-foreground">
                        Added instantly to their balance
                      </p>
                    </div>

                    {/* Referrer's Commission */}
                    <div className="text-left pl-4 space-y-1">
                      <span className="text-[9px] text-primary uppercase font-bold tracking-wider flex items-center gap-1">
                        <Percent className="h-3 w-3" /> Your Referral Commission
                      </span>
                      <h4 className="text-xl sm:text-2xl font-black text-primary font-mono">
                        ${currentCalc ? Number(currentCalc.commission).toFixed(2) : "0.00"}
                      </h4>
                      <p className="text-[9px] text-primary/85 font-medium">
                        10% of their Session Bonus!
                      </p>
                    </div>

                  </div>

                  <div className="text-[10px] text-muted-foreground leading-relaxed text-center border-t border-border/40 pt-3 select-none">
                    💥 No limits! The larger their deposit, the higher their Session Bonus, and the more cash you earn.
                  </div>
                </div>

              </div>

            </div>

            {/* Right Column: Referrer & Referrals History */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Referred By Section */}
              <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm space-y-3">
                <h3 className="font-extrabold text-xs text-muted-foreground uppercase tracking-wider text-left">Referred By</h3>
                {loadingReferrals ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading referrer data...
                  </div>
                ) : referredByProfile ? (
                  <div className="flex items-center gap-3 p-3 bg-secondary/35 border border-border/40 rounded-2xl">
                    <div className="h-9 w-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-black text-xs border border-primary/20 uppercase shrink-0">
                      {referredByProfile.username.slice(0, 2)}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">
                        {referredByProfile.first_name ? `${referredByProfile.first_name} ${referredByProfile.last_name || ""}`.trim() : referredByProfile.username}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">@{referredByProfile.username}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground italic text-left pl-1">Direct Signup (No Referrer)</p>
                )}
              </div>

              {/* My Referrals Section */}
              <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm flex flex-col min-h-[300px]">
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                  <h3 className="font-extrabold text-sm text-foreground flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-primary" /> Your Network
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono bg-secondary text-muted-foreground">
                    {referralsList.length} Total
                  </span>
                </div>

                {loadingReferrals ? (
                  <div className="flex-1 flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : referralsList.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 py-12 select-none">
                    <Users className="h-8 w-8 opacity-25 mb-2" />
                    <p className="text-xs font-bold text-foreground">No referrals yet</p>
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
                      Share your custom referral code or link with friends to build your earning network!
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto max-h-[400px] pr-1 pt-3 space-y-2.5">
                    {referralsList.map((ref) => (
                      <div key={ref.id} className="flex items-center justify-between p-3 bg-secondary/35 border border-border/40 rounded-2xl hover:border-border transition-all">
                        <div className="flex items-center gap-2.5 min-w-0 text-left">
                          <div className="h-8 w-8 bg-secondary border border-border rounded-full flex items-center justify-center text-foreground font-bold text-xs uppercase shrink-0">
                            {ref.referredUser.username.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">
                              {ref.referredUser.first_name ? `${ref.referredUser.first_name} ${ref.referredUser.last_name || ""}`.trim() : ref.referredUser.username}
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <span>@{ref.referredUser.username}</span>
                              <span>•</span>
                              <span>{new Date(ref.created_at).toLocaleDateString()}</span>
                            </p>
                          </div>
                        </div>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${
                          ref.status === "qualified" || ref.status === "joined"
                            ? "bg-green-500/10 text-green-500 border-green-500/20"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        }`}>
                          {ref.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      </div>
    </AppShell>
  );
}
