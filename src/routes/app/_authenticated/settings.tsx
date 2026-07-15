import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Settings, Shield, User, Bell, ChevronRight, LogOut, Moon, Sun, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_authenticated/settings")({
  ssr: false,
  head: () => ({ meta: [{ title: "Settings — JJ Messenger" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("notif_enabled")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPushEnabled(!!data.notif_enabled);
      });
  }, [user]);

  const handlePushToggle = async (checked: boolean) => {
    setPushEnabled(checked);
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ notif_enabled: checked })
      .eq("id", user.id);

    if (error) {
      toast.error("Failed to update notification settings.");
      setPushEnabled(!checked);
    } else {
      toast.success(checked ? "Push notifications enabled." : "Push notifications muted.");
    }
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <span>Settings</span>
          </h1>
        </div>

        {/* Page Body */}
        <div className="max-w-2xl mx-auto p-4 pb-28 md:pb-6 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          {/* Preferences Section */}
          <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm space-y-4 text-left">
            <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
              <Bell className="h-4.5 w-4.5 text-primary" /> Preference Settings
            </h3>
            
            <div className="space-y-4 divide-y divide-border/40">
              {/* Push Notifications */}
              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-foreground">Push Notifications</p>
                  <p className="text-[10px] text-muted-foreground">Receive system announcements and chat updates</p>
                </div>
                <Switch 
                  checked={pushEnabled} 
                  onCheckedChange={handlePushToggle}
                />
              </div>

              {/* Chat Sounds */}
              <div className="flex items-center justify-between pt-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-foreground">Sound Effects</p>
                  <p className="text-[10px] text-muted-foreground">Play sound alerts when messages are received</p>
                </div>
                <Switch 
                  checked={soundEnabled} 
                  onCheckedChange={setSoundEnabled}
                />
              </div>

              {/* Appearance Mode */}
              <div className="flex items-center justify-between pt-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-foreground">Color Theme Mode</p>
                  <p className="text-[10px] text-muted-foreground">Toggle application light and dark appearance styles</p>
                </div>
                <div className="h-9">
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="bg-card border border-border/60 rounded-3xl p-5 shadow-sm space-y-4 text-left">
            <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
              <User className="h-4.5 w-4.5 text-primary" /> Account & Security
            </h3>

            <div className="flex flex-col gap-2">
              {/* Profile Route Link */}
              <Link 
                to="/app/profile"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/35 border border-border/40 hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <User className="h-4.5 w-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-xs font-bold text-foreground">Edit Player Profile</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              {/* Security Route Link */}
              <Link 
                to="/app/security"
                className="flex items-center justify-between p-3.5 rounded-2xl bg-secondary/35 border border-border/40 hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="h-4.5 w-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-xs font-bold text-foreground">Password & Sessions Security</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </div>

          {/* Application Info */}
          <div className="flex items-center gap-2 bg-secondary/35 border border-border/40 rounded-2xl p-4 text-left">
            <Info className="h-5 w-5 text-primary shrink-0" />
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
              Jackpot Jungle Messenger Social Casino client version 2.4.0 (Stable release). Registered user credentials and cryptographic hashes are secured using industry-standard TLS 1.3 encryption.
            </p>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
