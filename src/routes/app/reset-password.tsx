import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { PasswordStrength } from "@/components/auth/PasswordStrength";

export const Route = createFileRoute("/app/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reset password — Jackpot Jungle Messenger" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      // Disable 2FA first, then set password via admin — no Authenticator prompt.
      const { completePasswordReset } = await import("@/lib/auth-otp.functions");
      await completePasswordReset({ data: { password } });

      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }

      setShowSuccess(true);
      setTimeout(() => {
        navigate({ to: "/app/auth", search: { mode: "login" } });
      }, 2000);
    } catch (err: any) {
      toast.error(err.message ?? "Could not update password.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {showSuccess ? (
          <AuthCard key="reset-success">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15 }}
              className="flex flex-col items-center justify-center py-6 text-center space-y-4"
            >
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                >
                  <CheckCircle2 className="h-10 w-10" />
                </motion.div>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-lg text-foreground">Password Reset Complete!</h3>
                <p className="text-xs text-muted-foreground">
                  Your password has been updated and Google Authenticator 2FA has been turned off.
                  Sign in with your new password, then you can enable 2FA again in Security.
                </p>
              </div>
            </motion.div>
          </AuthCard>
        ) : (
          <AuthCard key="reset-form">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-xl font-bold text-foreground">New Password</h2>
                <Link
                  to="/app/auth"
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>Cancel</span>
                </Link>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Choose a strong new password. For security, Authenticator 2FA will be turned off
                after this reset — you can turn it back on after login.
              </p>

              <div className="space-y-3">
                <AuthInput
                  label="New Password"
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

              <AuthButton type="submit" busy={busy}>
                Reset Password
              </AuthButton>
            </form>
          </AuthCard>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
