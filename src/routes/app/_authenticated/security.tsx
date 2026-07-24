import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, KeyRound, Loader2, CheckCircle, Smartphone, Laptop, Globe, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getActiveSessionsUser, terminateSessionUser } from "@/lib/admin-super.functions";
import { useServerFn } from "@tanstack/react-start";
import { useLiveSessionsRefresh } from "@/hooks/useLiveSessionsRefresh";

export const Route = createFileRoute("/app/_authenticated/security")({
  ssr: false,
  head: () => ({ meta: [{ title: "Security — JJ Messenger" }] }),
  component: SecurityPage,
});

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown Device";
  const lowercase = ua.toLowerCase();

  let os = "Unknown OS";
  if (lowercase.includes("windows")) os = "Windows PC";
  else if (lowercase.includes("macintosh") || lowercase.includes("mac os")) os = "Mac";
  else if (lowercase.includes("iphone") || lowercase.includes("ipad")) os = "iPhone/iPad";
  else if (lowercase.includes("android")) os = "Android Device";
  else if (lowercase.includes("linux")) os = "Linux PC";

  let browser = "Web Browser";
  if (lowercase.includes("capacitor") || lowercase.includes("; wv)")) browser = "App";
  else if (lowercase.includes("edg/") || lowercase.includes("edge")) browser = "Edge";
  else if (lowercase.includes("firefox")) browser = "Firefox";
  else if (lowercase.includes("opr") || lowercase.includes("opera")) browser = "Opera";
  else if (lowercase.includes("chrome") || lowercase.includes("chromium")) browser = "Chrome";
  else if (lowercase.includes("safari")) browser = "Safari";

  return `${os} (${browser})`;
}

function SecurityPage() {
  const { user, loading: authLoading } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [settingPw, setSettingPw] = useState(false);

  // MFA states
  const [mfaStatus, setMfaStatus] = useState<"unverified" | "enrolling" | "active">("unverified");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  // Elevation states
  const [aalState, setAalState] = useState<{ current: string; next: string } | null>(null);
  const [elevationCode, setElevationCode] = useState("");
  const [elevating, setElevating] = useState(false);
  const [elevated, setElevated] = useState(false);

  // Active sessions / logins states
  const getSessionsFn = useServerFn(getActiveSessionsUser);
  const terminateSessionFn = useServerFn(terminateSessionUser);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const isGoogle = user?.app_metadata?.provider === "google" || user?.identities?.some((id: any) => id.provider === "google");

  // Check MFA status
  const checkMFA = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verifiedTotp = data.all.find(f => (f.factorType === "totp" || (f as any).factor_type === "totp") && f.status === "verified");
      if (verifiedTotp) {
        setMfaStatus("active");
        setMfaFactorId(verifiedTotp.id);
      } else {
        setMfaStatus("unverified");
      }
    } catch {}
  };

  const checkAalStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error && data) {
        setAalState({ current: data.currentLevel, next: data.nextLevel });
        if (data.currentLevel === "aal2") {
          setElevated(true);
        }
      }
    } catch {}
  };

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await getSessionsFn();
      setSessions(res.sessions || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load active sessions");
    } finally {
      setLoadingSessions(false);
    }
  }, [getSessionsFn]);

  const { live: sessionsLive } = useLiveSessionsRefresh({
    userId: user?.id,
    onRefresh: loadSessions,
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    checkMFA();
    checkAalStatus();
    void loadSessions();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentSessionId(data.session.id);
      }
    });
  }, [user, loadSessions]);

  const handleEnableMFA = async () => {
    setMfaLoading(true);
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (!listError && factors?.all) {
        const unverified = factors.all.filter(f => f.status === "unverified" || (f as any).status === "unverified");
        for (const factor of unverified) {
          try {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          } catch {}
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "JackpotJungle"
      });
      if (error) throw error;
      
      setMfaFactorId(data.id);
      setMfaQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
      setMfaStatus("enrolling");
      setMfaCode("");
    } catch (err: any) {
      toast.error(err.message || "Failed to start 2FA enrollment");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (!mfaFactorId) return;
    setMfaLoading(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      setMfaStatus("unverified");
      setMfaFactorId("");
      setMfaQrCode("");
      setMfaSecret("");
    } catch {}
    setMfaLoading(false);
  };

  const handleVerifyEnroll = async () => {
    setMfaLoading(true);
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode
      });
      if (verifyErr) throw verifyErr;

      toast.success("Two-Factor Authentication (2FA) is now enabled!");
      setMfaStatus("active");
      setMfaCode("");
    } catch (err: any) {
      toast.error(err.message || "Code verification failed. Check your app and try again.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    if (!mfaFactorId) return;
    setMfaLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      toast.success("Two-Factor Authentication disabled.");
      setMfaStatus("unverified");
      setMfaFactorId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to disable MFA");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setSettingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully!");
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setSettingPw(false);
    }
  };

  const handleElevateSession = async () => {
    setElevating(true);
    try {
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;
      const totpFactor = factors.totp.find(f => f.status === "verified");
      if (!totpFactor) throw new Error("No verified factor found");

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.id,
        code: elevationCode
      });
      if (verifyErr) throw verifyErr;

      toast.success("Identity verified! Settings unlocked.");
      setElevated(true);
      setAalState(prev => prev ? { ...prev, current: "aal2" } : null);
    } catch (err: any) {
      toast.error(err.message || "Failed to verify authenticator code.");
    } finally {
      setElevating(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const res = await terminateSessionFn({ data: { sessionId } });
      if (res.ok) {
        toast.success("Device logged out successfully!");
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to terminate device session");
    }
  };

  if (authLoading || !user) {
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
        <div className="p-3 border-b border-border flex items-center gap-2 bg-card/90 backdrop-blur-md sticky top-0 z-10">
          <HamburgerButton />
          <h1 className="font-bold">Security</h1>
        </div>

        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          {/* Two-Factor Authentication (MFA) Card */}
          <div className="bg-secondary rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-primary" /> Two-Factor Authentication
            </h2>
            
            {mfaStatus === "unverified" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Protect your account with an extra layer of security. Verifying logins with Google Authenticator prevents unauthorized access even if someone knows your password.
                </p>
                <Button
                  type="button"
                  onClick={handleEnableMFA}
                  disabled={mfaLoading}
                  className="rounded-full w-full sm:w-auto text-xs font-bold font-sans"
                >
                  {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Enable 2FA Protection
                </Button>
              </div>
            )}

            {mfaStatus === "enrolling" && mfaQrCode && (
              <div className="space-y-4 flex flex-col items-center text-center p-4 bg-card border border-border/80 rounded-2xl select-none">
                <p className="text-xs font-semibold text-foreground">Scan QR Code or enter the secret key in Google Authenticator</p>
                <div className="p-3 bg-white rounded-xl shadow-inner my-1">
                  <img src={mfaQrCode} alt="TOTP QR Code" className="h-40 w-40" />
                </div>
                <div className="w-full max-w-xs space-y-1 text-left">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Secret Key</p>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      readOnly
                      value={mfaSecret}
                      className="flex-1 bg-secondary border border-border rounded-lg text-xs font-mono p-2 text-foreground select-all outline-none"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { navigator.clipboard.writeText(mfaSecret); toast.success("Secret copied!"); }}
                      className="rounded-lg h-9 text-xs font-sans font-bold shrink-0"
                    >
                      Copy
                    </Button>
                  </div>
                </div>

                <div className="w-full max-w-xs space-y-2 text-left pt-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Enter 6-digit Code</label>
                  <Input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000 000"
                    maxLength={6}
                    className="text-center font-mono text-lg font-black tracking-widest bg-secondary h-11"
                  />
                  <div className="flex gap-2 pt-1.5">
                    <Button
                      variant="outline"
                      onClick={handleCancelEnroll}
                      disabled={mfaLoading}
                      className="flex-1 rounded-xl h-10 text-xs font-bold"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleVerifyEnroll}
                      disabled={mfaCode.length !== 6 || mfaLoading}
                      className="flex-1 rounded-xl h-10 text-xs font-bold"
                    >
                      {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Verify Code
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {mfaStatus === "active" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3.5 bg-green-500/10 border border-green-500/25 text-green-600 rounded-xl">
                  <CheckCircle className="h-5 w-5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold">MFA Protection is Active</p>
                    <p className="opacity-95 mt-0.5">Your account is secured. Logins require Google Authenticator codes.</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDisableMFA}
                  disabled={mfaLoading}
                  className="rounded-full w-full sm:w-auto text-xs font-bold font-sans"
                >
                  {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Disable Two-Factor Authentication
                </Button>
              </div>
            )}
          </div>

          {/* Session Elevation Verification Form */}
          {aalState && aalState.next === "aal2" && aalState.current !== "aal2" && !elevated && (
            <div className="bg-secondary/40 border border-amber-500/20 rounded-2xl p-5 space-y-3 text-xs">
              <p className="font-semibold text-amber-500 flex items-center gap-1.5">
                <Shield className="h-4 w-4" /> 2FA Verification Required
              </p>
              <p className="text-muted-foreground leading-relaxed">
                To lock these settings and update password/emails, please enter your Google Authenticator code first.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleElevateSession(); }} className="space-y-3 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="elevate-code" className="text-[10px] uppercase font-bold text-muted-foreground">Authenticator Code</Label>
                  <Input 
                    id="elevate-code" 
                    type="text" 
                    placeholder="000000" 
                    value={elevationCode} 
                    onChange={(e) => setElevationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="bg-card font-mono text-center tracking-widest max-w-[120px] h-9" 
                  />
                </div>
                <Button type="submit" disabled={elevationCode.length !== 6 || elevating} size="sm" className="rounded-full">
                  {elevating ? "Verifying..." : "Verify Code"}
                </Button>
              </form>
            </div>
          )}

          {/* Password Management Card */}
          <div className="bg-secondary/40 border border-border/80 rounded-2xl p-5 space-y-3 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-primary" /> 
              {isGoogle ? "Create Account Password" : "Change Password"}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {isGoogle 
                ? "You logged in via Google. You can create a password below to allow email & password login in the future."
                : "Update your account password below."}
            </p>
            <form onSubmit={handleSetPassword} className="space-y-3 pt-1">
              <div className="space-y-1">
                <Label htmlFor="new-pw" className="text-[10px] uppercase font-bold text-muted-foreground">New Password</Label>
                <Input 
                  id="new-pw" 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="Min 6 characters" 
                  className="bg-card h-9" 
                />
              </div>
              <Button type="submit" disabled={newPassword.length < 6 || settingPw} size="sm" className="rounded-full">
                {settingPw ? "Updating..." : isGoogle ? "Set Password" : "Update Password"}
              </Button>
            </form>
          </div>

          {/* Active Devices / Logins Card */}
          <div className="bg-secondary rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between font-sans">
              <h2 className="font-semibold flex items-center gap-2 text-foreground">
                <Smartphone className="h-5 w-5 text-primary" /> Active Login Sessions
              </h2>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    sessionsLive
                      ? "bg-green-500/15 text-green-600 border-green-500/30"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {sessionsLive ? "Live" : "Connecting…"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadSessions()}
                  disabled={loadingSessions}
                  className="h-8 rounded-full text-xs font-bold px-3"
                >
                  {loadingSessions ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                  Refresh
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Devices signed into your account update live. Removing another device signs it out instantly.
            </p>

            <div className="space-y-3 pt-2">
              {loadingSessions ? (
                <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/80 rounded-xl text-center select-none">
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin mb-2" />
                  <p className="text-xs text-muted-foreground">Loading active sessions...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/40 rounded-2xl text-center select-none bg-secondary/30">
                  <Smartphone className="h-7 w-7 text-muted-foreground/55 mb-2" />
                  <p className="text-xs font-bold text-foreground">No active sessions found</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Please refresh or verify your connection settings.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Current Device Session */}
                  {sessions.filter(s => s.id === currentSessionId).map((s) => {
                    const deviceLabel = parseUserAgent(s.user_agent);
                    const isMobile = s.user_agent?.toLowerCase().includes("iphone") || s.user_agent?.toLowerCase().includes("android");
                    return (
                      <div key={s.id} className="flex items-center justify-between p-3.5 bg-card border border-primary/30 hover:border-primary/50 rounded-xl transition-all gap-4 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0 border border-primary/20">
                            {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold text-foreground truncate">{deviceLabel}</p>
                              <span className="bg-primary/20 border border-primary/30 text-primary text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                This Device
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                              <span className="flex items-center gap-0.5"><Globe className="h-3 w-3" /> {s.ip || "Unknown IP"}</span>
                              <span>•</span>
                              <span>Last active: {new Date(s.updated_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Other Device Sessions */}
                  {sessions.filter(s => s.id !== currentSessionId).length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/40 rounded-2xl text-center select-none bg-secondary/30">
                      <Smartphone className="h-7 w-7 text-muted-foreground/55 mb-2" />
                      <p className="text-xs font-bold text-foreground">No other active devices found</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">You are currently logged in only on this device.</p>
                    </div>
                  ) : (
                    sessions.filter(s => s.id !== currentSessionId).map((s) => {
                      const deviceLabel = parseUserAgent(s.user_agent);
                      const isMobile = s.user_agent?.toLowerCase().includes("iphone") || s.user_agent?.toLowerCase().includes("android");
                      return (
                        <div key={s.id} className="flex items-center justify-between p-3.5 bg-card border border-border/60 hover:border-border rounded-xl transition-all gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 bg-secondary rounded-xl flex items-center justify-center text-primary shrink-0 border border-border/20">
                              {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">{deviceLabel}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                <span className="flex items-center gap-0.5"><Globe className="h-3 w-3" /> {s.ip || "Unknown IP"}</span>
                                <span>•</span>
                                <span>Last active: {new Date(s.updated_at).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleTerminateSession(s.id)}
                            className="h-8 w-8 rounded-lg shrink-0"
                            title="Log out device"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
