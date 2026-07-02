import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/auth-callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // 1. Mobile App Deep Link Redirection Check
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      const searchAndHash = window.location.search + window.location.hash;
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        window.location.href = `intent://auth-callback${searchAndHash}#Intent;scheme=app.lovable.jackpotjungle;package=app.lovable.jackpotjungle;end`;
      } else {
        window.location.href = `app.lovable.jackpotjungle://auth-callback${searchAndHash}`;
      }
    }

    // 2. Stay in browser fallback handler
    const handleCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        const type = hashParams.get("type") || queryParams.get("type") || "signup";
        const code = queryParams.get("code") || queryParams.get("token");

        if (code) {
          // Exchange PKCE verification code for a valid session
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // Wait to let Supabase Auth capture and initialize the session
        setTimeout(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          
          if (type === "recovery" || type === "password_reset") {
            toast.success("Authentication verified! Set your new password.");
            navigate({ to: "/app/reset-password" });
          } else {
            if (session?.user) {
              toast.success("Account verified successfully!");
              navigate({ to: "/app/" }); // Authenticated layout will auto-intercept and show Onboarding if incomplete
            } else {
              navigate({ to: "/app/auth", search: { mode: "login" } });
            }
          }
        }, 1000);
      } catch (err: any) {
        console.error("Callback error:", err);
        toast.error(err.message || "Failed to complete email verification.");
        navigate({ to: "/app/auth" });
      }
    };

    // If mobile, delay browser processing slightly to give the deep-link prompt time to open the native app
    const delay = isMobile ? 2500 : 0;
    const timer = setTimeout(() => {
      handleCallback();
    }, delay);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <div className="text-center space-y-1">
        <h2 className="font-bold text-lg">Verifying your link</h2>
        <p className="text-xs text-muted-foreground px-4 leading-relaxed">
          Please wait while we securely process your verification...
        </p>
      </div>
    </div>
  );
}
