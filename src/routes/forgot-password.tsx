import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — Jackpot Jungle Messenger" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Reset link sent. Check your email.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset email.");
    } finally {
      setBusy(false);
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
          <h1 className="text-2xl font-bold text-foreground">Find your account</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-foreground">
                If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its way.
              </p>
              <Link to="/auth" className="block text-sm font-semibold text-primary hover:underline">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <Button type="submit" disabled={busy} className="w-full rounded-full h-11 text-base font-semibold">
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <Link to="/auth" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                Back to login
              </Link>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
