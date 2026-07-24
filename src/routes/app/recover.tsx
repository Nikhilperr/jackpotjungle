import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Capacitor } from "@capacitor/core";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";

const searchSchema = z.object({
  email: z.string().email().optional(),
  code: z.string().min(6).max(12).optional(),
  token: z.string().optional(),
  token_hash: z.string().optional(),
  type: z.string().optional(),
});

export const Route = createFileRoute("/app/recover")({
  ssr: false,
  head: () => ({ meta: [{ title: "Verify reset — Jackpot Jungle Messenger" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: RecoverPage,
});

/**
 * Auto-verify password-reset from email link (web or app deep link).
 * Query: ?email=&code=  OR  ?token_hash=&type=recovery
 * Then open /app/reset-password with a recovery session.
 */
function RecoverPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Verifying your reset link…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const email = (search.email || "").trim().toLowerCase();
    const code = (search.code || search.token || "").trim();
    const tokenHash = (search.token_hash || "").trim();

    // Mobile browser → hand off to native app (same query), then fall back to web verify.
    const isNative = Capacitor.isNativePlatform();
    const isMobileWeb =
      !isNative && typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobileWeb && (code || tokenHash)) {
      const q = new URLSearchParams();
      if (email) q.set("email", email);
      if (code) q.set("code", code);
      if (tokenHash) q.set("token_hash", tokenHash);
      q.set("type", "recovery");
      const qs = q.toString();
      const isAndroid = /Android/i.test(navigator.userAgent);
      try {
        if (isAndroid) {
          window.location.href =
            `intent://app/recover?${qs}#Intent;scheme=app.lovable.jackpotjungle;package=app.lovable.jackpotjungle;S.browser_fallback_url=${encodeURIComponent(`https://chat.playjackpotjungle.com/app/recover?${qs}`)};end`;
        } else {
          window.location.href = `app.lovable.jackpotjungle://app/recover?${qs}`;
        }
      } catch {
        /* continue with web verify */
      }
    }

    const delay = isMobileWeb ? 1800 : 0;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (tokenHash) {
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: "recovery",
            });
            if (error) throw error;
          } else if (email && code) {
            const { error } = await supabase.auth.verifyOtp({
              email,
              token: code,
              type: "recovery",
            });
            if (error) throw error;
          } else {
            throw new Error("This reset link is missing email/code. Request a new one.");
          }

          setStatus("ok");
          setMessage("Verified! Opening password reset…");
          toast.success("Reset verified. Choose a new password.");
          setTimeout(() => {
            navigate({ to: "/app/reset-password", replace: true });
          }, 600);
        } catch (err: any) {
          console.error("[Recover]", err);
          setStatus("error");
          setMessage(err?.message || "Invalid or expired reset link.");
          toast.error(err?.message || "Invalid or expired reset link.");
          setTimeout(() => {
            navigate({ to: "/app/forgot-password", replace: true });
          }, 2500);
        }
      })();
    }, delay);

    return () => clearTimeout(timer);
  }, [navigate, search.code, search.email, search.token, search.token_hash]);

  return (
    <AuthLayout>
      <AuthCard>
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
          {status === "working" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
          {status === "ok" && (
            <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 border border-green-500/20">
              <CheckCircle2 className="h-8 w-8" />
            </div>
          )}
          {status === "error" && (
            <div className="h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 text-2xl font-bold">
              !
            </div>
          )}
          <div className="space-y-1.5 px-2">
            <h2 className="font-bold text-lg text-foreground">
              {status === "ok" ? "Verified" : status === "error" ? "Link failed" : "Opening reset…"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
          </div>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
