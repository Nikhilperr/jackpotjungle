import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Log in — Jackpot Jungle Messenger" }] }),
  component: AuthPage,
});

type Mode = "login" | "signup";

function AuthPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");

  useEffect(() => {
    if (loading || roleLoading) return;
    if (user) navigate({ to: isAdmin ? "/admin" : "/chat" });
  }, [user, loading, isAdmin, roleLoading, navigate]);

  if (loading || roleLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Checking session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8 relative">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-20 w-20 rounded-full bg-primary items-center justify-center mb-4 shadow-lg">
            <MessageCircle className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Jackpot Jungle</h1>
          <p className="text-sm text-muted-foreground mt-1">Messenger</p>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          {mode === "login" ? (
            <LoginForm onSwitch={() => setMode("signup")} />
          ) : (
            <SignUpForm onSwitch={() => setMode("login")} />
          )}
        </div>
      </div>
    </main>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
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
      // Best-effort login log
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
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        placeholder="Username or email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        required
        autoComplete="username"
        className="h-12 rounded-xl text-base"
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        className="h-12 rounded-xl text-base"
      />
      <Button type="submit" disabled={busy} className="w-full rounded-full h-12 text-base font-semibold">
        {busy ? "Logging in…" : "Log in"}
      </Button>
      <div className="text-center pt-1">
        <Link to="/forgot-password" className="text-sm text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">OR</span></div>
      </div>
      <Button
        type="button"
        onClick={onSwitch}
        variant="secondary"
        className="w-full rounded-full h-12 text-base font-semibold"
      >
        Create new account
      </Button>
    </form>
  );
}

function SignUpForm({ onSwitch }: { onSwitch: () => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    if (username.length < 3) { toast.error("Username must be at least 3 characters."); return; }
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
      // If Supabase auto-created a session (e.g. auto-confirm enabled), sign out
      // so the user must complete OTP verification before being treated as logged in.
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
    <form onSubmit={onSubmit} className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground text-center">Create account</h2>
      <Input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        minLength={3}
        className="h-12 rounded-xl text-base"
      />
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        className="h-12 rounded-xl text-base"
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
        className="h-12 rounded-xl text-base"
      />
      <Input
        type="password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
        className="h-12 rounded-xl text-base"
      />
      <Button type="submit" disabled={busy} className="w-full rounded-full h-12 text-base font-semibold">
        {busy ? "Creating…" : "Sign up"}
      </Button>
      <button
        type="button"
        onClick={onSwitch}
        className="block w-full text-center text-sm text-muted-foreground hover:text-foreground pt-1"
      >
        Already have an account? <span className="text-primary font-semibold">Log in</span>
      </button>
    </form>
  );
}
