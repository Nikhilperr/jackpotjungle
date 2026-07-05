import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Mail, Lock, User, CheckSquare, Square, Sparkles, Shield } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { Capacitor } from "@capacitor/core";

import { z } from "zod";

const searchSchema = z.object({
  mode: z.enum(["welcome", "login", "signup"]).optional(),
  logout: z.union([z.string(), z.boolean()]).optional(),
});

export const Route = createFileRoute("/app/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Log in — Jackpot Jungle Messenger" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

type Mode = "welcome" | "login" | "signup";

const GoogleIcon = () => (
  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" width="24" height="24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

function AuthPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const { mode: urlMode, logout } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(urlMode || "welcome");
  const [googleBusy, setGoogleBusy] = useState(false);

  const isLogoutRequest = logout === "true" || logout === true;

  useEffect(() => {
    if (!loading && !user && typeof window !== "undefined") {
      localStorage.removeItem("jj_verified");
    }
  }, [user, loading]);

  useEffect(() => {
    if (isLogoutRequest) {
      async function clearAll() {
        try {
          await supabase.auth.signOut();
        } catch {}
        try {
          localStorage.clear();
        } catch {}
        navigate({ search: (old: any) => ({ ...old, logout: undefined }), replace: true });
      }
      clearAll();
    }
  }, [isLogoutRequest, navigate]);

  useEffect(() => {
    if (urlMode) {
      setMode(urlMode);
    }
  }, [urlMode]);

  useEffect(() => {
    if (loading || roleLoading || isLogoutRequest) return;
    
    const isRecovery = typeof window !== "undefined" && (
      window.location.hash.includes("recovery") ||
      window.location.search.includes("recovery")
    );
    if (isRecovery) return;

    if (user) {
      const isGoogleLogin = user.app_metadata?.provider === "google";
      const isVerified = typeof window !== "undefined" && localStorage.getItem("jj_verified") === "true";
      if (!isGoogleLogin && !isVerified) return;

      const timer = setTimeout(async () => {
        const hostname = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
        const isProdDomain = hostname.endsWith("playjackpotjungle.com");
        const isChatOrPrimary = hostname.startsWith("chat.") || hostname === "playjackpotjungle.com" || hostname === "www.playjackpotjungle.com";

        if (isProdDomain) {
          const sessionRes = await supabase.auth.getSession();
          const session = sessionRes.data.session;
          const hashParams = session ? `#access_token=${session.access_token}&refresh_token=${session.refresh_token}` : "";

          if (isAdmin && isChatOrPrimary) {
            window.location.href = `https://admin.playjackpotjungle.com/app/admin${window.location.search}${hashParams}`;
            return;
          }
          if (!isAdmin && hostname.startsWith("admin.")) {
            window.location.href = `https://chat.playjackpotjungle.com/app/chat${window.location.search}${hashParams}`;
            return;
          }
        }

        const savedRedirect = typeof window !== "undefined" ? sessionStorage.getItem("jj_invite_redirect") : null;
        if (savedRedirect) {
          sessionStorage.removeItem("jj_invite_redirect");
          window.location.href = savedRedirect;
          return;
        }

        navigate({ to: isAdmin ? "/app/admin" : "/app/chat", replace: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, loading, isAdmin, roleLoading, navigate]);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    try {
      const nativeCheck = Capacitor.isNativePlatform();

      if (nativeCheck) {
        // Use native Google Sign-In on mobile devices
        const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
        try {
          await GoogleAuth.initialize({
            clientId: "877420815591-feisfm6hjc1n8omdhrbv9li9tdk1v63t.apps.googleusercontent.com",
            scopes: ["profile", "email"],
            grantOfflineAccess: true,
          });
        } catch (e) {
          // If already initialized, it might throw, which is fine to ignore
          console.log("GoogleAuth initialized or already active:", e);
        }
        const userResult = await GoogleAuth.signIn();
        const idToken = userResult.authentication.idToken;
        if (!idToken) throw new Error("Google Sign-In did not return an ID token.");

        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });
        if (error) throw error;
      } else {
        // Standard browser redirection on desktop
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin + "/app/auth",
            queryParams: {
              prompt: "select_account",
            },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error("Google Auth error details:", err);
      // Suppress user cancellation crashes so they do not show ugly errors
      if (err.message?.includes("cancel") || err.message?.includes("12501")) {
        setGoogleBusy(false);
        return;
      }
      toast.error(err.message ?? "Google authentication failed.");
      setGoogleBusy(false);
    }
  }

  if (loading || roleLoading) {
    return (
      <AuthLayout>
        <AuthCard>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="h-10 w-10 border-4 border-primary/20 border-t-primary rounded-full"
            />
            <p className="text-sm font-semibold text-muted-foreground animate-pulse">Checking session...</p>
          </div>
        </AuthCard>
      </AuthLayout>
    );
  }



  return (
    <AuthLayout mode={mode} setMode={setMode}>
      <AnimatePresence mode="wait">
        {mode === "welcome" && (
          <AuthCard key="welcome">
            <div className="text-center space-y-4 py-2 select-none">
              <p className="text-xs text-muted-foreground/75 leading-relaxed mx-auto max-w-[280px]">
                Connect instantly with friends, admins, and support teams. Explore our fast, modern messenger experience.
              </p>

              <div className="pt-2">
                <button
                  onClick={() => setMode("login")}
                  className="w-full py-4 bg-primary text-primary-foreground hover:bg-primary/95 active:scale-[0.98] font-bold rounded-2xl text-sm transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] hover:shadow-[0_0_25px_rgba(var(--primary-rgb),0.55)] flex items-center justify-center gap-2 group cursor-pointer"
                >
                  <span>Get Started</span>
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    →
                  </motion.span>
                </button>
              </div>
            </div>
          </AuthCard>
        )}

        {mode === "login" && (
          <AuthCard key="login">
            <LoginForm 
              onSwitch={() => setMode("signup")} 
              onBack={() => setMode("welcome")} 
              signInWithGoogle={signInWithGoogle}
              googleBusy={googleBusy}
            />
          </AuthCard>
        )}

        {mode === "signup" && (
          <AuthCard key="signup">
            <SignUpForm 
              onSwitch={() => setMode("login")} 
              onBack={() => setMode("welcome")} 
              signInWithGoogle={signInWithGoogle}
              googleBusy={googleBusy}
            />
          </AuthCard>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

function LoginForm({ 
  onSwitch, 
  onBack, 
  signInWithGoogle, 
  googleBusy 
}: { 
  onSwitch: () => void; 
  onBack: () => void;
  signInWithGoogle: () => void;
  googleBusy: boolean;
}) {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<"email" | "2fa" | null>(null);
  const [has2FaFactor, setHas2FaFactor] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const interval = setInterval(() => {
      setResendCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCountdown]);

  useEffect(() => {
    const checkAalOnMount = async () => {
      try {
        const sessionRes = await supabase.auth.getSession();
        const session = sessionRes.data.session;
        if (!session?.user) return;

        const isGoogleLogin = session.user.app_metadata?.provider === "google";
        if (isGoogleLogin) return;

        const isVerified = typeof window !== "undefined" && localStorage.getItem("jj_verified") === "true";
        if (isVerified) return;

        // Force secondary verification
        setVerificationRequired(true);
        
        const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
        const has2fa = !listErr && factors?.totp?.some(f => f.status === "verified");
        setHas2FaFactor(has2fa);

        if (has2fa) {
          setVerificationMethod(null);
        } else {
          setVerificationMethod("email");
          if (session.user.email) {
            await sendEmailOtp(session.user.email);
          }
        }
      } catch {}
    };
    checkAalOnMount();
  }, []);

  async function sendEmailOtp(email: string) {
    setMfaBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false
        }
      });
      if (error) throw error;
      setEmailOtpSent(true);
      setResendCountdown(60);
      toast.success("Verification code sent to your email!");
    } catch (err: any) {
      toast.error(err.message || "Failed to send email verification code");
    } finally {
      setMfaBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let email = identifier.trim();
      if (!email.includes("@")) {
        const { lookupEmailByUsername } = await import("@/lib/auth-lookup.functions");
        const res = await lookupEmailByUsername({ data: { username: email } });
        if (!res.email) throw new Error("No account with that username.");
        email = res.email;
      }
      
      if (typeof window !== "undefined") {
        localStorage.setItem("jj_google_session", "false");
        localStorage.removeItem("jj_verified");
      }

      const { data: signed, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      const has2fa = !listErr && factors?.totp?.some(f => f.status === "verified");
      setHas2FaFactor(has2fa);

      setVerificationRequired(true);
      if (has2fa) {
        setVerificationMethod(null);
      } else {
        setVerificationMethod("email");
        await sendEmailOtp(email);
      }
    } catch (err: any) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("jj_verified");
      }
      toast.error(err.message ?? "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    setMfaBusy(true);
    try {
      let email = identifier.trim();
      if (!email) {
        const sessionRes = await supabase.auth.getSession();
        email = sessionRes.data.session?.user?.email || "";
      }
      if (email && !email.includes("@")) {
        const { lookupEmailByUsername } = await import("@/lib/auth-lookup.functions");
        const res = await lookupEmailByUsername({ data: { username: email } });
        email = res.email || email;
      }

      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: "email"
      });
      if (error) throw error;

      if (typeof window !== "undefined") {
        localStorage.setItem("jj_verified", "true");
      }

      // Send recent login notification email!
      try {
        const { notifyRecentLogin } = await import("@/lib/email-notification.functions");
        await notifyRecentLogin({ email });
      } catch (e: any) {
        console.warn("Failed to send login notification email:", e.message);
      }

      try {
        const userRes = await supabase.auth.getUser();
        if (userRes.data.user) {
          await (supabase as any).from("login_logs").insert({
            user_id: userRes.data.user.id,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
            success: true,
          });
        }
      } catch {}

      toast.success("Welcome back!");
      
      // Redirect
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes.data.session;
      if (session?.user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
        const isAdmin = !!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
        navigate({ to: isAdmin ? "/app/admin" : "/app/chat", replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Invalid email verification code.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function onVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaBusy(true);
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
        code: otpCode
      });
      if (verifyErr) throw verifyErr;

      if (typeof window !== "undefined") {
        localStorage.setItem("jj_verified", "true");
      }

      // Send recent login notification email!
      let email = identifier.trim();
      if (!email) {
        const sessionRes = await supabase.auth.getSession();
        email = sessionRes.data.session?.user?.email || "";
      }
      if (email && !email.includes("@")) {
        const { lookupEmailByUsername } = await import("@/lib/auth-lookup.functions");
        const res = await lookupEmailByUsername({ data: { username: email } });
        email = res.email || email;
      }
      try {
        const { notifyRecentLogin } = await import("@/lib/email-notification.functions");
        await notifyRecentLogin({ email });
      } catch (e: any) {
        console.warn("Failed to send login notification email:", e.message);
      }

      try {
        const userRes = await supabase.auth.getUser();
        if (userRes.data.user) {
          await (supabase as any).from("login_logs").insert({
            user_id: userRes.data.user.id,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
            success: true,
          });
        }
      } catch {}

      toast.success("Verified. Welcome back!");
      
      // Redirect
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes.data.session;
      if (session?.user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
        const isAdmin = !!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
        navigate({ to: isAdmin ? "/app/admin" : "/app/chat", replace: true });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Verification failed.");
    } finally {
      setMfaBusy(false);
    }
  }

  if (verificationRequired) {
    if (!verificationMethod) {
      return (
        <div className="space-y-6 w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="text-center space-y-2 select-none">
            <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-1">
              <Shield className="h-6 w-6 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Two-Step Verification</h2>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
              For your account security, choose one verification method.
            </p>
          </div>

          <div className="space-y-4 pt-1">
            {/* Card 1: Google Authenticator */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setVerificationMethod("2fa")}
              className="flex items-start gap-4 p-4 rounded-2xl border border-border/80 bg-card/50 hover:bg-secondary/40 transition-colors cursor-pointer group shadow-sm hover:shadow-md"
            >
              <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div className="text-left space-y-1">
                <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">Google Authenticator</h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Verify using the 6-digit code from your authenticator app.
                </p>
              </div>
            </motion.div>

            {/* Card 2: Email Verification */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                let email = identifier.trim();
                if (!email.includes("@")) {
                  const { lookupEmailByUsername } = await import("@/lib/auth-lookup.functions");
                  const res = await lookupEmailByUsername({ data: { username: email } });
                  email = res.email || email;
                }
                setVerificationMethod("email");
                await sendEmailOtp(email);
              }}
              className="flex items-start gap-4 p-4 rounded-2xl border border-border/80 bg-card/50 hover:bg-secondary/40 transition-colors cursor-pointer group shadow-sm hover:shadow-md"
            >
              <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div className="text-left space-y-1">
                <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">Email OTP</h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Receive a secure 6-digit code in your registered email inbox.
                </p>
              </div>
            </motion.div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setVerificationRequired(false);
                setVerificationMethod(null);
                setOtpCode("");
              }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground font-semibold py-2 transition-colors select-none"
            >
              Back to Login
            </button>
          </div>
        </div>
      );
    }

    if (verificationMethod === "email") {
      return (
        <form onSubmit={onVerifyEmailOtp} className="space-y-4 animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-xl font-bold text-foreground">Verify Email</h2>
            <button 
              type="button" 
              onClick={() => {
                if (has2FaFactor) {
                  setVerificationMethod(null);
                } else {
                  supabase.auth.signOut();
                  setVerificationRequired(false);
                  setVerificationMethod(null);
                }
                setOtpCode("");
              }} 
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              {has2FaFactor ? "Change Method" : "Cancel"}
            </button>
          </div>

          <div className="space-y-2 py-2 text-center select-none">
            <p className="text-xs text-muted-foreground leading-relaxed">
              We've sent a 6-digit verification code to your email. Enter it below to complete sign-in:
            </p>
            <div className="pt-2">
              <AuthInput
                label="Verification Code"
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                maxLength={6}
                autoFocus
                className="text-center font-mono text-lg font-black tracking-widest bg-secondary"
                icon={<Shield className="h-4 w-4 text-primary" />}
              />
            </div>
          </div>

          <div className="pt-2 space-y-3">
            <AuthButton type="submit" busy={mfaBusy} disabled={otpCode.length !== 6}>
              Verify and Login
            </AuthButton>
            <button
              type="button"
              disabled={resendCountdown > 0}
              onClick={async () => {
                if (resendCountdown > 0) return;
                let email = identifier.trim();
                if (!email.includes("@")) {
                  const { lookupEmailByUsername } = await import("@/lib/auth-lookup.functions");
                  const res = await lookupEmailByUsername({ data: { username: email } });
                  email = res.email || email;
                }
                await sendEmailOtp(email);
              }}
              className="text-xs font-semibold text-primary disabled:text-muted-foreground hover:underline disabled:no-underline text-center w-full block transition-all"
            >
              {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : "Resend code"}
            </button>
          </div>
        </form>
      );
    }

    if (verificationMethod === "2fa") {
      return (
        <form onSubmit={onVerifyMfa} className="space-y-4 animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-xl font-bold text-foreground">Security Verification</h2>
            <button 
              type="button" 
              onClick={() => {
                setVerificationMethod(null);
                setOtpCode("");
              }} 
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Change Method
            </button>
          </div>

          <div className="space-y-2 py-2 text-center select-none">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter the 6-digit verification code generated by your Google Authenticator app.
            </p>
            <div className="pt-2">
              <AuthInput
                label="6-Digit Code"
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                maxLength={6}
                autoFocus
                className="text-center font-mono text-lg font-black tracking-widest bg-secondary"
                icon={<Shield className="h-4 w-4 text-primary" />}
              />
            </div>
          </div>

          <div className="pt-2">
            <AuthButton type="submit" busy={mfaBusy} disabled={otpCode.length !== 6}>
              Verify and Login
            </AuthButton>
          </div>
        </form>
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xl font-bold text-foreground">Sign In</h2>
        <button type="button" onClick={onBack} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          Go Back
        </button>
      </div>

      <div className="space-y-3">
        <AuthInput
          label="Username or Email"
          placeholder="Enter username or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          icon={<User className="h-4 w-4" />}
        />
        <AuthInput
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          icon={<Lock className="h-4 w-4" />}
        />
      </div>

      <div className="flex items-center justify-between px-1 text-xs">
        <button
          type="button"
          onClick={() => setRememberMe(!rememberMe)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {rememberMe ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
          <span>Remember me</span>
        </button>
        <Link to="/app/forgot-password" className="text-primary hover:underline font-semibold">
          Forgot password?
        </Link>
      </div>

      <div className="space-y-3 pt-1">
        <AuthButton type="submit" busy={busy} disabled={googleBusy}>
          Sign In
        </AuthButton>

        <AuthButton 
          type="button" 
          variant="secondary" 
          onClick={signInWithGoogle} 
          busy={googleBusy} 
          disabled={busy}
        >
          <GoogleIcon />
          Continue with Google
        </AuthButton>
      </div>

      <button
        type="button"
        onClick={onSwitch}
        className="block w-full text-center text-xs text-muted-foreground hover:text-foreground pt-2 select-none"
      >
        Don't have an account? <span className="text-primary font-semibold">Create account</span>
      </button>
    </form>
  );
}

function SignUpForm({ 
  onSwitch, 
  onBack, 
  signInWithGoogle, 
  googleBusy 
}: { 
  onSwitch: () => void; 
  onBack: () => void;
  signInWithGoogle: () => void;
  googleBusy: boolean;
}) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    if (username.length < 3) { toast.error("Username must be at least 3 characters."); return; }
    if (!terms) { toast.error("Please accept the terms & conditions."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });
      if (error) throw error;
      if (data.session) {
        try { await supabase.auth.signOut(); } catch {}
      }
      navigate({ to: "/app/verify-otp", search: { email, mode: "signup" } });
    } catch (err: any) {
      toast.error(err.message ?? "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-xl font-bold text-foreground">Create Account</h2>
        <button type="button" onClick={onBack} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          Go Back
        </button>
      </div>

      <div className="space-y-3">
        <AuthInput
          label="Username"
          placeholder="Choose a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          icon={<User className="h-4 w-4" />}
          disabled={googleBusy}
        />
        <AuthInput
          label="Email Address"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
          disabled={googleBusy}
        />
        <AuthInput
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          disabled={googleBusy}
        />
        <AuthInput
          label="Confirm Password"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          disabled={googleBusy}
        />
      </div>

      <PasswordStrength value={password} />

      <div className="flex items-start gap-2 px-1 text-xs">
        <button
          type="button"
          onClick={() => setTerms(!terms)}
          disabled={googleBusy}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {terms ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
        </button>
        <span className="text-muted-foreground leading-snug">
          I agree to the{" "}
          <button
            type="button"
            onClick={() => setShowTermsModal(true)}
            className="text-primary hover:underline font-semibold"
          >
            Terms of Service
          </button>{" "}
          and{" "}
          <button
            type="button"
            onClick={() => setShowPrivacyModal(true)}
            className="text-primary hover:underline font-semibold"
          >
            Privacy Policy
          </button>
        </span>
      </div>

      <div className="space-y-3">
        <AuthButton type="submit" busy={busy} disabled={googleBusy}>
          Register Account
        </AuthButton>

        <AuthButton 
          type="button" 
          variant="secondary" 
          onClick={signInWithGoogle} 
          busy={googleBusy} 
          disabled={busy}
        >
          <GoogleIcon />
          Continue with Google
        </AuthButton>
      </div>

      <button
        type="button"
        onClick={onSwitch}
        className="block w-full text-center text-xs text-muted-foreground hover:text-foreground pt-1 select-none"
      >
        Already have an account? <span className="text-primary font-semibold">Sign In</span>
      </button>

      <LegalModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Terms of Service"
        content={TERMS_CONTENT}
      />

      <LegalModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Privacy Policy"
        content={PRIVACY_CONTENT}
      />
    </form>
  );
}

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: React.ReactNode;
}

function LegalModal({ isOpen, onClose, title, content }: LegalModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] z-10 text-left"
          >
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-lg text-foreground">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors font-bold text-sm"
              >
                ✕
              </button>
            </div>
            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-muted-foreground leading-relaxed">
              {content}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const TERMS_CONTENT = (
  <>
    <p className="font-semibold text-foreground text-sm">1. Introduction</p>
    <p>Welcome to Jackpot Jungle ("we," "us," or "our"). By registering an account or using our messaging platform, you agree to comply with and be bound by these Terms of Service. If you do not agree, please do not use our services.</p>
    
    <p className="font-semibold text-foreground text-sm">2. Account Registration</p>
    <p>To use certain features, you must register for an account using a valid email address. You are solely responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account.</p>
    
    <p className="font-semibold text-foreground text-sm">3. Acceptable Use</p>
    <p>You agree not to use Jackpot Jungle for any unlawful purposes, including but not limited to sending spam, harassing other users, distributing malicious software, or violating any intellectual property rights.</p>
    
    <p className="font-semibold text-foreground text-sm">4. Service Modifications</p>
    <p>We reserve the right to modify, suspend, or discontinue any aspect of our messaging platform at any time without notice. We are not liable to you or any third party for such modifications.</p>
    
    <p className="font-semibold text-foreground text-sm">5. Disclaimer of Warranties</p>
    <p>Our services are provided "as is" and "as available" without any warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>
  </>
);

const PRIVACY_CONTENT = (
  <>
    <p className="font-semibold text-foreground text-sm">1. Information We Collect</p>
    <p>We collect information you provide directly to us when creating an account, including your email address, username, profile picture, first and last name, phone number, and address. We also collect the content of messages and attachments sent through the platform.</p>
    
    <p className="font-semibold text-foreground text-sm">2. How We Use Information</p>
    <p>We use the collected information to operate, maintain, and improve our messaging service, personalize your experience, provide customer support, and ensure the security of the platform.</p>
    
    <p className="font-semibold text-foreground text-sm">3. Information Sharing</p>
    <p>We do not sell or rent your personal information to third parties. We only share information when required by law, to enforce our terms, or with trusted service providers who help operate our platform.</p>
    
    <p className="font-semibold text-foreground text-sm">4. Data Security</p>
    <p>We implement industry-standard administrative, technical, and physical security measures to protect your personal data from unauthorized access, disclosure, or modification.</p>
    
    <p className="font-semibold text-foreground text-sm">5. Your Choices & Rights</p>
    <p>You have the right to access, update, or delete your account information at any time through your Profile page settings or by contacting our official support team.</p>
  </>
);
