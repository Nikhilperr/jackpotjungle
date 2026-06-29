import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Mail, CheckCircle2, ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthButton } from "@/components/auth/AuthButton";
import { OTPInput } from "@/components/auth/OTPInput";

const searchSchema = z.object({
  email: z.string().email(),
  mode: z.enum(["signup", "recovery"]).default("signup"),
});

export const Route = createFileRoute("/app/verify-otp")({
  head: () => ({ meta: [{ title: "Verify code — Jackpot Jungle Messenger" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: VerifyOtpPage,
});

function VerifyOtpPage() {
  const { email, mode } = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [expiryTime, setExpiryTime] = useState(300); // 5 minutes in seconds
  const [resendCooldown, setResendCooldown] = useState(60); // 1 minute in seconds

  useEffect(() => {
    const timer = setInterval(() => {
      setExpiryTime((prev) => (prev > 0 ? prev - 1 : 0));
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check if profile was completed on another device
  useEffect(() => {
    if (!email) return;
    const interval = setInterval(async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("email", email)
        .maybeSingle();

      if (profile?.first_name?.trim() && profile?.last_name?.trim()) {
        toast.success("Verification completed on another device! Redirecting to login...");
        navigate({ to: "/app/auth", search: { mode: "login" } });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [email, navigate]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (expiryTime === 0) {
      toast.error("This verification code has expired. Please request a new one.");
      return;
    }
    if (code.length !== 6) { toast.error("Enter the 6-digit code."); return; }
    setBusy(true);
    setHasError(false);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: mode === "recovery" ? "recovery" : "email",
      });
      if (error) throw error;
      
      setShowSuccess(true);
      setTimeout(async () => {
        if (mode === "recovery") {
          toast.success("Code verified. Set a new password.");
          navigate({ to: "/app/reset-password" });
        } else {
          try { await supabase.auth.signOut(); } catch {}
          toast.success("Account verified successfully");
          navigate({ to: "/app/auth", search: { mode: "login" } });
        }
      }, 1500);
    } catch (err: any) {
      setHasError(true);
      toast.error(err.message ?? "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setResending(true);
    setHasError(false);
    try {
      if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resend({ type: "signup", email });
        if (error) throw error;
      }
      toast.success("New code sent.");
      setCode(""); // Invalidate previous code input
      setExpiryTime(300); // Reset 5-minute expiration timer
      setResendCooldown(60); // Reset 1-minute resend cooldown
    } catch (err: any) {
      toast.error(err.message ?? "Could not resend code.");
    } finally {
      setResending(false);
    }
  }

  const getEmailProviderLink = () => {
    if (email.endsWith("@gmail.com")) return "https://mail.google.com/";
    if (email.endsWith("@outlook.com") || email.endsWith("@hotmail.com")) return "https://outlook.live.com/";
    if (email.endsWith("@yahoo.com")) return "https://mail.yahoo.com/";
    return null;
  };
  const providerUrl = getEmailProviderLink();

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {!showSuccess ? (
          <AuthCard key="otp-form">
            <form onSubmit={onVerify} className="space-y-5">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-xl font-bold text-foreground">Verify OTP</h2>
                <Link to="/app/auth" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3 w-3" />
                  <span>Back</span>
                </Link>
              </div>

              <div className="flex flex-col items-center text-center space-y-3 py-2">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Mail className="h-6 w-6" />
                </div>
                <p className="text-xs text-muted-foreground max-w-[285px] leading-relaxed">
                  We have sent a 6-digit verification code to <span className="font-semibold text-foreground break-all">{email}</span>.
                </p>
              </div>

              {/* Multi-device Info Helper Banner */}
              <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/10 text-center text-[11px] text-muted-foreground leading-relaxed max-w-[285px] mx-auto select-none space-y-1">
                <p className="font-bold text-foreground flex items-center justify-center gap-1">
                  <span>📱</span> Continuing on another device?
                </p>
                <p>You can tap the link in the email on your mobile phone to complete this process directly on your phone.</p>
              </div>

              <div className="space-y-4">
                <OTPInput
                  value={code}
                  onChange={(val) => {
                    setCode(val);
                    if (hasError) setHasError(false);
                  }}
                  disabled={expiryTime === 0 || busy}
                  hasError={hasError}
                />

                <div className="text-center h-5">
                  <AnimatePresence mode="wait">
                    {expiryTime > 0 ? (
                      <motion.span
                        key="active"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[11px] text-muted-foreground font-medium"
                      >
                        Code expires in <span className="font-bold text-foreground">{formatTime(expiryTime)}</span>
                      </motion.span>
                    ) : (
                      <motion.span
                        key="expired"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[11px] text-destructive font-bold"
                      >
                        OTP Expired. Please request a new code.
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-3">
                <AuthButton type="submit" disabled={code.length !== 6 || expiryTime === 0 || busy} busy={busy}>
                  Verify & Confirm
                </AuthButton>

                {providerUrl && (
                  <a
                    href={providerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-11 w-full border border-border/60 hover:bg-secondary/40 text-foreground transition-colors flex items-center justify-center gap-1.5 rounded-2xl text-xs font-semibold select-none"
                  >
                    <span>Open Email Inbox</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              <div className="flex flex-col items-center gap-2 pt-2 text-xs">
                <button
                  type="button"
                  onClick={onResend}
                  disabled={resending || resendCooldown > 0}
                  className="text-primary hover:underline disabled:opacity-50 disabled:no-underline font-semibold"
                >
                  {resending
                    ? "Sending code…"
                    : resendCooldown > 0
                    ? `Resend code in ${formatTime(resendCooldown)}`
                    : "Resend Verification Code"}
                </button>
              </div>
            </form>
          </AuthCard>
        ) : (
          <AuthCard key="otp-success">
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
                <h3 className="font-bold text-lg text-foreground">Code Verified!</h3>
                <p className="text-xs text-muted-foreground">
                  Redirecting you shortly...
                </p>
              </div>
            </motion.div>
          </AuthCard>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
