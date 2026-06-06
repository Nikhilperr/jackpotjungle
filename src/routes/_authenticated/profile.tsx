import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Avatar } from "./chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Camera, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — JJ Messenger" }] }),
  component: ProfilePage,
});

type Profile = {
  id: string;
  username: string;
  friend_code: string;
  referral_code: string;
  avatar_url: string | null;
  created_at: string;
};

function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? null);
      const { data } = await supabase.from("profiles").select("id, username, avatar_url, friend_code, referral_code, created_at").eq("id", u.user.id).maybeSingle();
      if (data) { setProfile(data as Profile); setUsername(data.username); }
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ username }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile updated."); setProfile({ ...profile, username }); }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image.");
    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB.");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    setUploading(false);
    if (updErr) return toast.error(updErr.message);
    setProfile({ ...profile, avatar_url: url });
    toast.success("Profile picture updated.");
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  if (!profile) return <AppShell><div className="p-8 text-muted-foreground">Loading…</div></AppShell>;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="md:hidden p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold">Profile</h1>
        </div>
        <div className="max-w-xl mx-auto p-6 space-y-6">
          <div className="flex flex-col items-center text-center pt-4">
            <div className="relative">
              <Avatar name={profile.username} url={profile.avatar_url} size={96} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50"
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
            <h1 className="mt-4 text-2xl font-bold">{profile.username}</h1>
            <p className="text-sm text-muted-foreground">{email}</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="mt-2 text-xs text-primary hover:underline disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Change profile picture"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CodeCard label="Friend code" value={profile.friend_code} onCopy={() => copy(profile.friend_code, "Friend code")} />
            <CodeCard label="Referral code" value={profile.referral_code} onCopy={() => copy(profile.referral_code, "Referral code")} />
          </div>

          <form onSubmit={save} className="bg-secondary rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">Edit profile</h2>
            <div>
              <Label htmlFor="u">Username</Label>
              <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-card" />
            </div>
            <Button type="submit" disabled={saving || username === profile.username} className="rounded-full">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            Member since {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function CodeCard({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <button onClick={onCopy} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent transition-colors group">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
      <p className="font-mono font-bold mt-1">{value}</p>
    </button>
  );
}
