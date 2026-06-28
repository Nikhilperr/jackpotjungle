import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — Jackpot Jungle Messenger" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      
      setShowSuccess(true);
      setTimeout(() => {
        navigate({ to: "/verify-otp", search: { email, mode: "recovery" } });
      }, 2000);
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset code.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {!showSuccess ? (
          <AuthCard key="forgot-form">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-xl font-bold text-foreground">Forgot Password</h2>
                <Link to="/auth" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3 w-3" />
                  <span>Back</span>
                </Link>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your email address below and we'll send you a 6-digit verification code to reset your password.
              </p>

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

              <AuthButton type="submit" busy={busy}>
                Send Verification Code
              </AuthButton>
            </form>
          </AuthCard>
        ) : (
          <AuthCard key="forgot-success">
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
                <h3 className="font-bold text-lg text-foreground">Code Sent!</h3>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  Please check your inbox at <span className="font-semibold text-foreground">{email}</span> for the verification code.
                </p>
              </div>
            </motion.div>
          </AuthCard>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
