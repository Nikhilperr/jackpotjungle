import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  email: z.string().email(),
  mode: z.enum(["signup", "recovery"]).default("signup"),
});

export const Route = createFileRoute("/verify-otp")({
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

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) { toast.error("Enter the 6-digit code."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: mode === "recovery" ? "recovery" : "email",
      });
      if (error) throw error;
      if (mode === "recovery") {
        toast.success("Code verified. Set a new password.");
        navigate({ to: "/reset-password" });
      } else {
        // Sign out so the user must explicitly log in with their credentials.
        try { await supabase.auth.signOut(); } catch {}
        toast.success("Account verified successfully");
        navigate({ to: "/auth" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setResending(true);
    try {
      if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resend({ type: "signup", email });
        if (error) throw error;
      }
      toast.success("New code sent.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not resend code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 rounded-full bg-primary items-center justify-center mb-4 shadow-lg">
            <MessageCircle className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Enter verification code</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We sent a 6-digit code to <span className="font-semibold text-foreground">{email}</span>
          </p>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          <form onSubmit={onVerify} className="space-y-5">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-full h-12 text-base font-semibold">
              {busy ? "Verifying…" : "Verify"}
            </Button>
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="block w-full text-center text-sm text-primary hover:underline disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
            <Link to="/auth" className="block text-center text-sm text-muted-foreground hover:text-foreground">
              Back to login
            </Link>
          </form>
        </div>
      </div>
    </main>
  );
}
