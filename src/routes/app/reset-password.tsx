import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, CheckCircle2, ArrowLeft, Shield } from "lucide-react";
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
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (error.message?.includes("AAL2") || error.message?.includes("MFA")) {
          const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
          if (!listErr && factors?.totp?.some(f => f.status === "verified")) {
            setMfaRequired(true);
            setBusy(false);
            toast.info("Please enter your 2FA verification code to authorize this password update.");
            return;
          }
        }
        throw error;
      }
      
      try {
        await supabase.auth.signOut();
      } catch {}
      
      setShowSuccess(true);
      setTimeout(() => {
        navigate({ to: "/app/auth", search: { mode: "login" } });
      }, 2000);
    } catch (err: any) {
      toast.error(err.message ?? "Could not update password.");
      setBusy(false);
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
        code: mfaCode
      });
      if (verifyErr) throw verifyErr;

      // Session is now upgraded to AAL2. Complete the password update:
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      try {
        await supabase.auth.signOut();
      } catch {}
      
      setShowSuccess(true);
      setTimeout(() => {
        navigate({ to: "/app/auth", search: { mode: "login" } });
      }, 2000);
    } catch (err: any) {
      toast.error(err.message ?? "2FA Verification failed.");
    } finally {
      setMfaBusy(false);
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
                  Your password has been updated. Redirecting you to the login page...
                </p>
              </div>
            </motion.div>
          </AuthCard>
        ) : mfaRequired ? (
          <AuthCard key="mfa-form">
            <form onSubmit={onVerifyMfa} className="space-y-4 animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-xl font-bold text-foreground">Security Verification</h2>
                <button 
                  type="button" 
                  onClick={() => {
                    setMfaRequired(false);
                    setMfaCode("");
                  }} 
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-2 py-2 text-center select-none">
                <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-1">
                  <Shield className="h-6 w-6 animate-pulse" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter the 6-digit verification code generated by your Google Authenticator app to authorize this password update.
                </p>
                <div className="pt-2">
                  <AuthInput
                    label="6-Digit Code"
                    placeholder="000000"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    autoFocus
                    className="text-center font-mono text-2xl font-black tracking-[0.25em] bg-secondary/30 border-primary/20 focus:ring-primary/25 pr-2 pl-2"
                  />
                </div>
              </div>

              <div className="pt-2">
                <AuthButton type="submit" busy={mfaBusy} disabled={mfaCode.length !== 6}>
                  Verify & Reset Password
                </AuthButton>
              </div>
            </form>
          </AuthCard>
        ) : (
          <AuthCard key="reset-form">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-xl font-bold text-foreground">New Password</h2>
                <Link to="/app/auth" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3 w-3" />
                  <span>Cancel</span>
                </Link>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Choose a strong new password containing numbers, capital letters, and symbols.
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
