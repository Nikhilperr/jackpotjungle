import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Mail, Lock, User, CheckSquare, Square, Sparkles } from "lucide-react";
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
});

export const Route = createFileRoute("/app/auth")({
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
  const { mode: urlMode } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(urlMode || "welcome");
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (urlMode) {
      setMode(urlMode);
    }
  }, [urlMode]);

  useEffect(() => {
    if (loading || roleLoading) return;
    if (user) navigate({ to: isAdmin ? "/app/admin" : "/app/chat", replace: true });
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
    <AuthLayout mode={mode}>
      <AnimatePresence mode="popLayout">
        {mode === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 140, damping: 24, mass: 1.1 }}
            className="w-full max-w-sm flex flex-col items-center justify-center pt-2 pb-6 text-center select-none"
          >
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.6 }}
              className="text-xs text-muted-foreground/75 max-w-[280px] leading-relaxed mb-6"
            >
              Connect instantly with friends, admins, and support teams. Explore our fast, modern messenger experience.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="w-full px-4"
            >
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
            </motion.div>
          </motion.div>
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
