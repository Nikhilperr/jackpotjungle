import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Avatar } from "@/components/messenger/Avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Camera, Loader2, Bell, BellOff, Share2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { ShareProfileModal } from "@/components/messenger/ShareProfileModal";

export const Route = createFileRoute("/app/_authenticated/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Profile — JJ Messenger" }] }),
  component: ProfilePage,
});

export function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  if (normalized === "black_diamond" || normalized === "blackvip") return "/blackvip.png";
  return `/${normalized}.png`;
}

export function getVipBadgeStyles(status: string | null | undefined) {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  
  let label = "VIP";
  let color = "#10b981";
  
  if (normalized === "bronze") {
    label = "Bronze VIP";
    color = "#b45309";
  } else if (normalized === "silver") {
    label = "Silver VIP";
    color = "#64748b";
  } else if (normalized === "gold") {
    label = "Gold VIP";
    color = "#d97706";
  } else if (normalized === "platinum") {
    label = "Platinum VIP";
    color = "#0891b2";
  } else if (normalized === "diamond") {
    label = "Diamond VIP";
    color = "#2563eb";
  } else if (normalized === "black_diamond" || normalized === "blackvip") {
    label = "Black Diamond VIP";
    color = "#000000";
  }
  
  return { label, color };
}

type Profile = {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  friend_code: string;
  referral_code: string;
  avatar_url: string | null;
  created_at: string;
  vip_status?: string | null;
};

function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  // Load profile instantly from cache; the useEffect below will refresh from the server.
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("jj_cached_my_profile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [shareOpen, setShareOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const email = user?.email ?? null;

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    supabase.from("profiles")
      .select("id, username, first_name, last_name, avatar_url, friend_code, referral_code, created_at, notif_enabled, vip_status" as any)
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data) return;
        const profileData = data as unknown as Profile;
        setProfile(profileData);
        setUsername((data as any).username);
        setFirstName((data as any).first_name ?? "");
        setLastName((data as any).last_name ?? "");
        setNotifEnabled((data as any).notif_enabled ?? true);
        // Persist to localStorage so the Profile page renders instantly next visit
        try {
          localStorage.setItem("jj_cached_my_profile", JSON.stringify(profileData));
        } catch {}
      });

    // Realtime listener for profile edits
    const channel = supabase
      .channel(`profile-details-changes-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && mounted) {
            setProfile((prev) => prev ? { ...prev, ...(payload.new as Profile) } : null);
          }
        }
      )
      .subscribe();

    if (typeof window !== "undefined" && "Notification" in window) setPermission(Notification.permission);
    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, [user]);

  async function toggleNotif(v: boolean) {
    if (!profile) return;
    setNotifEnabled(v);
    await supabase.from("profiles").update({ notif_enabled: v } as any).eq("id", profile.id);
    if (v && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      const p = await Notification.requestPermission();
      setPermission(p);
    }
  }

  async function requestPerm() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") toast.success("Browser notifications enabled.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      username,
      first_name: firstName.trim(),
      last_name: lastName.trim()
    }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated.");
      setProfile({
        ...profile,
        username,
        first_name: firstName.trim(),
        last_name: lastName.trim()
      });
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;

    // Static image validation
    const fileMime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (fileMime === "image/gif" || ext === "gif") {
      return toast.error("GIF files are not supported. Please choose a static image.");
    }
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const allowedExts = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    if (!allowedMimes.includes(fileMime) && !allowedExts.includes(ext)) {
      return toast.error("Unsupported format. Please choose a JPEG, PNG, WEBP, or HEIC image.");
    }

    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB.");
    setUploading(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("avatars", profile.id, file, ext, file.type);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
      if (updErr) throw updErr;
      setProfile({ ...profile, avatar_url: url });
      toast.success("Profile picture updated.");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    }
    setUploading(false);
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  if (authLoading || !profile) {
    return (
      <AppShell>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold">Profile</h1>
        </div>
        
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          <div className="flex flex-col items-center text-center pt-4 border-b border-border/40 pb-6 select-none">
            <div className="relative">
              <Avatar name={profile.username} url={profile.avatar_url} size={96} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                aria-label="Change profile picture"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickFile}
                className="hidden"
              />
            </div>
            <h1 className="mt-4 text-2xl font-bold flex items-center justify-center gap-2">
              <span>{profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username}</span>
              {profile.vip_status && profile.vip_status !== "none" && (
                <img 
                  src={getVipBadgeUrl(profile.vip_status) || undefined} 
                  alt={`${profile.vip_status} VIP`} 
                  className="h-7 w-auto object-contain select-none inline-block align-middle"
                  title={`${profile.vip_status.toUpperCase()} VIP`}
                />
              )}
            </h1>
            <div className="flex items-center gap-2 mt-1 select-none">
              <span className="text-xs text-muted-foreground font-semibold">@{profile.username}</span>
              {(() => {
                const info = getVipBadgeStyles(profile.vip_status);
                if (!info) return null;
                return (
                  <span 
                    className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border inline-block"
                    style={{
                      color: info.color,
                      backgroundColor: `${info.color}15`,
                      borderColor: `${info.color}30`
                    }}
                  >
                    {info.label}
                  </span>
                );
              })()}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
            <div className="flex gap-2.5 mt-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1.5 bg-secondary/50 hover:bg-secondary px-3.5 py-2 rounded-full border border-border/40 font-bold transition-all"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>{uploading ? "Uploading…" : "Change photo"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="text-xs text-primary hover:underline flex items-center gap-1.5 bg-secondary/50 hover:bg-secondary px-3.5 py-2 rounded-full border border-border/40 font-bold transition-all"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Profile</span>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <CodeCard label="Friend code" value={profile.friend_code} onCopy={() => copy(profile.friend_code, "Friend code")} />
              <CodeCard label="Referral code" value={profile.referral_code} onCopy={() => copy(profile.referral_code, "Referral code")} />
            </div>

            <form onSubmit={save} className="bg-secondary rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-foreground">Edit profile</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fn">First Name</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="bg-card" />
                </div>
                <div>
                  <Label htmlFor="ln">Last Name</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} className="bg-card" />
                </div>
              </div>
              <div>
                <Label htmlFor="u">Username</Label>
                <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-card" />
              </div>
              <Button type="submit" disabled={saving || (username === profile.username && firstName === (profile.first_name ?? "") && lastName === (profile.last_name ?? ""))} className="rounded-full">
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>

            <div className="bg-secondary rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2 text-foreground">
                {notifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} Notifications
              </h2>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">New message alerts</p>
                  <p className="text-xs text-muted-foreground">Get notified when someone messages you.</p>
                </div>
                <Switch checked={notifEnabled} onCheckedChange={toggleNotif} />
              </div>
              {notifEnabled && permission !== "granted" && (
                <Button type="button" variant="outline" size="sm" onClick={requestPerm} className="rounded-full">
                  {permission === "denied" ? "Notifications blocked in browser" : "Enable browser notifications"}
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground pt-4">
            Member since {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <ShareProfileModal
        isOpen={shareOpen}
        onOpenChange={setShareOpen}
        username={profile.username}
        displayName={profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username}
        avatarUrl={profile.avatar_url}
        memberSince={profile.created_at}
      />
    </AppShell>
  );
}

function CodeCard({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <button onClick={onCopy} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent transition-colors group w-full">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="font-mono font-bold mt-1 truncate">{value}</p>
    </button>
  );
}
