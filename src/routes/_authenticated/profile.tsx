import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/messenger/AppShell";
import { Avatar } from "./chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — JJ Messenger" }] }),
  component: ProfilePage,
});

type Profile = {
  id: string;
  username: string;
  email: string | null;
  friend_code: string;
  referral_code: string;
  avatar_url: string | null;
  created_at: string;
};

function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("id, username, avatar_url, friend_code, referral_code, online, last_seen, created_at").eq("id", u.user.id).maybeSingle();
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

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  if (!profile) return <AppShell><div className="p-8 text-muted-foreground">Loading…</div></AppShell>;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-6">
          <div className="flex flex-col items-center text-center pt-4">
            <Avatar name={profile.username} url={profile.avatar_url} size={96} />
            <h1 className="mt-4 text-2xl font-bold">{profile.username}</h1>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
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
