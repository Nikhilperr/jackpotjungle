import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Avatar } from "./chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, Check, X, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PullToRefresh } from "@/components/messenger/PullToRefresh";

export const Route = createFileRoute("/app/_authenticated/friends")({
  head: () => ({ meta: [{ title: "Friends — JJ Messenger" }] }),
  component: FriendsPage,
});

type Profile = { id: string; username: string; avatar_url: string | null; friend_code: string };
type RequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  profile: Profile | null;
  direction: "in" | "out";
};

const FRIENDS_CACHE_KEY = "jj_cached_friends";
const REQUESTS_CACHE_KEY = "jj_cached_friend_requests";

function readCache<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function FriendsPage() {
  const [meId, setMeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<Profile | null>(null);
  // Initialise from cache so the page renders instantly without a spinner
  const [requests, setRequests] = useState<RequestRow[]>(() =>
    typeof window !== "undefined" ? readCache<RequestRow[]>(REQUESTS_CACHE_KEY) ?? [] : []
  );
  const [friends, setFriends] = useState<Profile[]>(() =>
    typeof window !== "undefined" ? readCache<Profile[]>(FRIENDS_CACHE_KEY) ?? [] : []
  );
  const navigate = useNavigate();

  async function load(myId: string) {
    const { data: reqs } = await supabase
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status")
      .eq("status", "pending")
      .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`);
    const ids = (reqs ?? []).map((r) => (r.sender_id === myId ? r.receiver_id : r.sender_id));
    const profMap = new Map<string, Profile>();
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, friend_code")
        .in("id", ids);
      (profs ?? []).forEach((p) => profMap.set(p.id, p as Profile));
    }
    const mappedRequests = (reqs ?? []).map((r) => ({
      ...r,
      direction: r.sender_id === myId ? "out" : "in",
      profile: profMap.get(r.sender_id === myId ? r.receiver_id : r.sender_id) ?? null,
    })) as RequestRow[];
    setRequests(mappedRequests);
    writeCache(REQUESTS_CACHE_KEY, mappedRequests);

    const { data: fr } = await supabase.from("friendships").select("user_a, user_b");
    const fids = (fr ?? []).map((f) => (f.user_a === myId ? f.user_b : f.user_a));
    if (fids.length > 0) {
      const { data: fprofs } = await supabase
        .from("profiles").select("id, username, avatar_url, friend_code").in("id", fids);
      const friendList = (fprofs as Profile[]) ?? [];
      setFriends(friendList);
      writeCache(FRIENDS_CACHE_KEY, friendList);
    } else {
      setFriends([]);
      writeCache(FRIENDS_CACHE_KEY, []);
    }
  }


  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || !mounted) return;
      setMeId(data.user.id);
      load(data.user.id);
    });
    const rand = Math.random().toString(36).slice(2, 9);
    const channel = supabase
      .channel(`friends-page-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        supabase.auth.getUser().then(({ data }) => { if (data.user && mounted) load(data.user.id); });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        supabase.auth.getUser().then(({ data }) => { if (data.user && mounted) load(data.user.id); });
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);

  async function findByCode(e: React.FormEvent) {
    e.preventDefault();
    const searchVal = code.trim();
    if (!searchVal) return;
    setSearching(true);
    setSearchResult(null);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, friend_code")
      .or(`friend_code.eq.${searchVal.toUpperCase()},username.ilike.${searchVal}`)
      .maybeSingle();
    setSearching(false);
    if (!data) { toast.error("No user found with that friend code or username."); return; }
    if (data.id === meId) { toast.info("That's your own profile 😄"); return; }
    setSearchResult(data as Profile);
  }

  async function sendRequest(receiverId: string) {
    if (!meId) return;
    // Check for existing friendship
    const [a, b] = meId < receiverId ? [meId, receiverId] : [receiverId, meId];
    const { data: existingFriend } = await supabase
      .from("friendships")
      .select("user_a")
      .eq("user_a", a).eq("user_b", b).maybeSingle();
    if (existingFriend) { toast.info("You're already friends with this user."); return; }
    // Check existing pending request either direction
    const { data: existingReq } = await supabase
      .from("friend_requests")
      .select("id, sender_id, status")
      .eq("status", "pending")
      .or(`and(sender_id.eq.${meId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${meId})`)
      .maybeSingle();
    if (existingReq) {
      if (existingReq.sender_id === meId) toast.info("You've already sent a friend request to this user.");
      else toast.info("This user has already sent you a friend request — check below to accept.");
      return;
    }
    const { error } = await supabase.from("friend_requests").insert({
      sender_id: meId,
      receiver_id: receiverId,
    });
    if (error) {
      if (error.code === "23505") toast.info("A friend request already exists between you two.");
      else toast.error(error.message);
    } else { toast.success("Friend request sent!"); setSearchResult(null); setCode(""); }
  }

  async function unsendRequest(id: string) {
    const { error } = await supabase.from("friend_requests").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Friend request unsent.");
  }

  async function respond(id: string, status: "accepted" | "rejected") {
    const { error } = await supabase.from("friend_requests").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(status === "accepted" ? "You're now friends! Say hi 👋" : "Request declined.");
  }

  const incoming = requests.filter((r) => r.direction === "in");
  const outgoing = requests.filter((r) => r.direction === "out");

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <PullToRefresh onRefresh={async () => { if (meId) { await load(meId); } }}>
          <div className="max-w-2xl mx-auto p-6 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <HamburgerButton />
              <h1 className="text-2xl font-bold">Add a friend</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Enter a friend code (e.g. <code className="bg-secondary px-2 py-0.5 rounded">JJM-123456</code>) or username</p>
            <form onSubmit={findByCode} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Enter friend code or username..."
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="pl-9 rounded-full bg-secondary border-transparent"
                />
              </div>
              <Button type="submit" disabled={searching} className="rounded-full">
                {searching ? "Searching…" : "Find"}
              </Button>
            </form>
            <div className="flex justify-end mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (meId) {
                    const promise = load(meId);
                    toast.promise(promise, {
                      loading: "Refreshing friends list...",
                      success: "Friends list refreshed!",
                      error: "Could not refresh friends.",
                    });
                    await promise;
                  }
                }}
                className="h-8 rounded-full text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh list
              </Button>
            </div>
            {searchResult && (() => {
              const isAlreadyFriend = friends.some((f) => f.id === searchResult.id);
              return (
                <div className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-secondary animate-in fade-in duration-200">
                  <Avatar name={searchResult.username} url={searchResult.avatar_url} />
                  <div className="flex-1">
                    <p className="font-semibold">{searchResult.username}</p>
                    <p className="text-xs text-muted-foreground">{searchResult.friend_code}</p>
                  </div>
                  {isAlreadyFriend ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-semibold">Already friends</span>
                      <Button onClick={() => navigate({ to: "/chat/$friendId", params: { friendId: searchResult.id } })} size="sm" variant="secondary" className="rounded-full">
                        <MessageCircle className="h-4 w-4 mr-1" /> Chat
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={() => sendRequest(searchResult.id)} size="sm" className="rounded-full">
                      <UserPlus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>

          {incoming.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Friend requests</h2>
              <div className="space-y-2">
                {incoming.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary">
                    <Avatar name={r.profile?.username ?? "?"} url={r.profile?.avatar_url} />
                    <div className="flex-1">
                      <p className="font-semibold">{r.profile?.username}</p>
                      <p className="text-xs text-muted-foreground">{r.profile?.friend_code}</p>
                    </div>
                    <Button size="sm" onClick={() => respond(r.id, "accepted")} className="rounded-full">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => respond(r.id, "rejected")} className="rounded-full">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {outgoing.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Sent requests</h2>
              <div className="space-y-2">
                {outgoing.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary">
                    <Avatar name={r.profile?.username ?? "?"} url={r.profile?.avatar_url} />
                    <div className="flex-1">
                      <p className="font-semibold">{r.profile?.username}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => unsendRequest(r.id)} className="rounded-full">
                      <X className="h-4 w-4 mr-1" /> Unsend
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-bold mb-3">Your friends ({friends.length})</h2>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No friends yet. Share your friend code or add someone above.</p>
            ) : (
              <div className="space-y-2">
                {friends.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary hover:bg-accent transition-colors">
                    <Avatar name={f.username} url={f.avatar_url} />
                    <div className="flex-1">
                      <p className="font-semibold">{f.username}</p>
                      <p className="text-xs text-muted-foreground">{f.friend_code}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/chat/$friendId", params: { friendId: f.id } })} className="rounded-full">
                      <MessageCircle className="h-4 w-4 mr-1" /> Chat
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          </div>
        </PullToRefresh>
      </div>
    </AppShell>
  );
}
