import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Mail, Lock, User, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { PasswordStrength } from "@/components/auth/PasswordStrength";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Log in — Jackpot Jungle Messenger" }] }),
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
  const [mode, setMode] = useState<Mode>("welcome");
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (user) navigate({ to: isAdmin ? "/admin" : "/chat", replace: true });
  }, [user, loading, isAdmin, roleLoading, navigate]);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth",
        },
      });
      if (error) throw error;
    } catch (err: any) {
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
    <AuthLayout>
      <AnimatePresence mode="wait">
        {mode === "welcome" && (
          <AuthCard key="welcome" delay={0.1}>
            <div className="text-center space-y-4 py-4">
              <h2 className="text-2xl font-extrabold text-foreground">Welcome to Jackpot Jungle</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Connect instantly with friends, admins, and support teams. Explore our fast, modern messenger experience.
              </p>
              
              <div className="space-y-3 pt-4">
                <AuthButton onClick={() => setMode("login")} variant="primary">
                  Sign In
                </AuthButton>
                <AuthButton onClick={() => setMode("signup")} variant="secondary">
                  Create New Account
                </AuthButton>
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
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);

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
      const { data: signed, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      try {
        if (signed.user) {
          await (supabase as any).from("login_logs").insert({
            user_id: signed.user.id,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
            success: true,
          });
        }
      } catch {}
      toast.success("Welcome back!");
    } catch (err: any) {
      toast.error(err.message ?? "Login failed.");
    } finally {
      setBusy(false);
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
        <Link to="/forgot-password" className="text-primary hover:underline font-semibold">
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
      navigate({ to: "/verify-otp", search: { email, mode: "signup" } });
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
          I agree to the <Link className="text-primary hover:underline font-semibold">Terms of Service</Link> and <Link className="text-primary hover:underline font-semibold">Privacy Policy</Link>
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
    </form>
  );
}
