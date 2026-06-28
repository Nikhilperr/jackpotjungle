import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { MessageCircle, Mail, Lock, User, CheckSquare, Square, Chrome, Github, Facebook } from "lucide-react";
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

function AuthPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("welcome");

  useEffect(() => {
    if (loading || roleLoading) return;
    if (user) navigate({ to: isAdmin ? "/admin" : "/chat", replace: true });
  }, [user, loading, isAdmin, roleLoading, navigate]);

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
            <LoginForm onSwitch={() => setMode("signup")} onBack={() => setMode("welcome")} />
          </AuthCard>
        )}

        {mode === "signup" && (
          <AuthCard key="signup">
            <SignUpForm onSwitch={() => setMode("login")} onBack={() => setMode("welcome")} />
          </AuthCard>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}

function LoginForm({ onSwitch, onBack }: { onSwitch: () => void; onBack: () => void }) {
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

      <AuthButton type="submit" busy={busy}>
        Sign In
      </AuthButton>

      {/* Social Login Placeholders */}
      <div className="relative my-6 select-none">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/60" /></div>
        <div className="relative flex justify-center"><span className="bg-card px-3 text-[11px] font-bold text-muted-foreground uppercase">Or continue with</span></div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="h-10 flex items-center justify-center border border-border/60 rounded-xl hover:bg-secondary/40 transition-colors">
          <Chrome className="h-4 w-4" />
        </button>
        <button type="button" className="h-10 flex items-center justify-center border border-border/60 rounded-xl hover:bg-secondary/40 transition-colors">
          <Github className="h-4 w-4" />
        </button>
        <button type="button" className="h-10 flex items-center justify-center border border-border/60 rounded-xl hover:bg-secondary/40 transition-colors">
          <Facebook className="h-4 w-4 text-blue-500 fill-blue-500" />
        </button>
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

function SignUpForm({ onSwitch, onBack }: { onSwitch: () => void; onBack: () => void }) {
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
        />
      </div>

      <PasswordStrength value={password} />

      <div className="flex items-start gap-2 px-1 text-xs">
        <button
          type="button"
          onClick={() => setTerms(!terms)}
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {terms ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
        </button>
        <span className="text-muted-foreground leading-snug">
          I agree to the <Link className="text-primary hover:underline font-semibold">Terms of Service</Link> and <Link className="text-primary hover:underline font-semibold">Privacy Policy</Link>
        </span>
      </div>

      <AuthButton type="submit" busy={busy}>
        Register Account
      </AuthButton>

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
