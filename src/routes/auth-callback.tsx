import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";

export const Route = createFileRoute("/auth-callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [verifyingInBrowser, setVerifyingInBrowser] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsMobileDevice(isMobile);

    if (!isMobile) {
      // On desktop, auto-process in browser
      handleCallback();
    }
  }, []);

  const handleOpenApp = () => {
    const searchAndHash = window.location.search + window.location.hash;
    window.location.href = `chancerealm://auth-callback${searchAndHash}`;
  };

  const handleCallback = async () => {
    setLoading(true);
    setVerifyingInBrowser(true);
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
          navigate({ to: "/reset-password" });
        } else {
          if (session?.user) {
            toast.success("Account verified successfully!");
            navigate({ to: "/chat" }); // Authenticated layout will auto-intercept and show Onboarding if incomplete
          } else {
            navigate({ to: "/auth", search: { mode: "login" } });
          }
        }
      }, 1000);
    } catch (err: any) {
      console.error("Callback error:", err);
      toast.error(err.message || "Failed to complete email verification.");
      setLoading(false);
      setVerifyingInBrowser(false);
    }
  };

  if (isMobileDevice && !verifyingInBrowser) {
    return (
      <AuthLayout hideHeader={true}>
        <AuthCard className="max-w-sm w-full text-center space-y-6">
          <div className="flex flex-col items-center gap-3">
            <img 
              src="/icons/icon-256.webp" 
              alt="Logo" 
              className="h-16 w-16 rounded-2xl shadow-xl object-cover border border-border/20"
            />
            <h2 className="font-extrabold text-xl text-foreground">Jackpot Jungle</h2>
            <p className="text-xs text-muted-foreground leading-relaxed px-2">
              Choose how you want to complete your verification setup.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleOpenApp}
              className="w-full h-11 bg-primary hover:opacity-95 text-primary-foreground font-semibold rounded-xl text-xs transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              <span>Continue in Mobile App</span>
            </button>

            <button
              onClick={handleCallback}
              className="w-full h-11 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
            >
              Continue in Web Browser
            </button>
          </div>
        </AuthCard>
      </AuthLayout>
    );
  }

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
