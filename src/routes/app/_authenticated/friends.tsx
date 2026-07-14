import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Avatar } from "./chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, Check, X, MessageCircle, RefreshCw, UserMinus, Plus, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { PullToRefresh } from "@/components/messenger/PullToRefresh";
import { getVipBadgeUrl, getVipBadgeStyles } from "./profile";

export const Route = createFileRoute("/app/_authenticated/friends")({
  head: () => ({ meta: [{ title: "Friends — JJ Messenger" }] }),
  component: FriendsPage,
});

type Profile = { 
  id: string; 
  username: string; 
  avatar_url: string | null; 
  vip_status?: string | null;
};

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
  const [usernameInput, setUsernameInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<Profile | null>(null);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "requests" | "add">("list");

  const [requests, setRequests] = useState<RequestRow[]>(() =>
    typeof window !== "undefined" ? readCache<RequestRow[]>(REQUESTS_CACHE_KEY) ?? [] : []
  );
  const [friends, setFriends] = useState<Profile[]>(() =>
    typeof window !== "undefined" ? readCache<Profile[]>(FRIENDS_CACHE_KEY) ?? [] : []
  );
  
  const navigate = useNavigate();

  async function load(myId: string) {
    try {
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
          .select("id, username, avatar_url, vip_status")
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
          .from("profiles")
          .select("id, username, avatar_url, vip_status")
          .in("id", fids);
        const friendList = (fprofs as Profile[]) ?? [];
        setFriends(friendList);
        writeCache(FRIENDS_CACHE_KEY, friendList);
      } else {
        setFriends([]);
        writeCache(FRIENDS_CACHE_KEY, []);
      }
    } catch (e) {
      console.error("Failed to load friends details:", e);
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

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  async function findByUsername(e: React.FormEvent) {
    e.preventDefault();
    const searchVal = usernameInput.trim();
    if (!searchVal) return;
    setSearching(true);
    setSearchResult(null);
    
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, vip_status")
      .ilike("username", searchVal)
      .maybeSingle();

    setSearching(false);
    if (error || !data) { 
      toast.error("No user found with that username."); 
      return; 
    }
    if (data.id === meId) { 
      toast.info("That's your own profile 😄"); 
      return; 
    }
    setSearchResult(data as Profile);
  }

  async function sendRequest(receiverId: string) {
    if (!meId) return;
    
    // Check for existing friendship
    const [a, b] = meId < receiverId ? [meId, receiverId] : [receiverId, meId];
    const { data: existingFriend } = await supabase
      .from("friendships")
      .select("user_a")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (existingFriend) { 
      toast.info("You're already friends with this user."); 
      return; 
    }

    // Check existing pending request either direction
    const { data: existingReq } = await supabase
      .from("friend_requests")
      .select("id, sender_id, status")
      .eq("status", "pending")
      .or(`and(sender_id.eq.${meId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${meId})`)
      .maybeSingle();
    if (existingReq) {
      if (existingReq.sender_id === meId) toast.info("You've already sent a friend request to this user.");
      else toast.info("This user has already sent you a friend request — check pending to accept.");
      return;
    }

    const { error } = await supabase.from("friend_requests").insert({
      sender_id: meId,
      receiver_id: receiverId,
    });
    if (error) {
      if (error.code === "23505") toast.info("A friend request already exists between you two.");
      else toast.error(error.message);
    } else { 
      toast.success("Friend request sent!"); 
      setSearchResult(null); 
      setUsernameInput(""); 
      setActiveTab("list");
    }
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

  async function removeFriend(friendId: string) {
    if (!meId) return;
    const confirm = window.confirm("Are you sure you want to remove this friend?");
    if (!confirm) return;

    const [a, b] = meId < friendId ? [meId, friendId] : [friendId, meId];
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("user_a", a)
      .eq("user_b", b);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Friend removed.");
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    }
  }

  const incoming = requests.filter((r) => r.direction === "in");
  const outgoing = requests.filter((r) => r.direction === "out");
  const totalRequests = incoming.length + outgoing.length;

  const filteredFriends = friends.filter((f) =>
    f.username.toLowerCase().includes(friendSearchQuery.toLowerCase())
  );

  return (
    <AppShell>
      <div className="h-full overflow-y-auto bg-background/30 select-none">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center justify-between bg-card/60 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <HamburgerButton />
            <h1 className="font-extrabold text-foreground flex items-center gap-2 font-sans">
              <Users className="h-5 w-5 text-primary" />
              <span>Social Friends</span>
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (meId) {
                const promise = load(meId);
                toast.promise(promise, {
                  loading: "Syncing lists...",
                  success: "Synchronized!",
                  error: "Failed to sync lists.",
                });
                await promise;
              }
            }}
            className="h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center p-0"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>

        <PullToRefresh onRefresh={async () => { if (meId) { await load(meId); } }}>
          <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            
            {/* Navigation Tabs (Mobile optimized) */}
            <div className="flex p-1 bg-secondary/60 rounded-2xl border border-border/60">
              <button
                onClick={() => setActiveTab("list")}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                My Friends ({friends.length})
              </button>
              <button
                onClick={() => setActiveTab("requests")}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all relative ${activeTab === "requests" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Requests
                {incoming.length > 0 && (
                  <span className="absolute top-1.5 right-4 h-4 min-w-[16px] px-1 bg-primary text-primary-foreground text-[8px] font-black rounded-full flex items-center justify-center animate-pulse">
                    {incoming.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("add")}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === "add" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Add Friend
              </button>
            </div>

            {/* Content Windows */}
            <div className="animate-in fade-in duration-300">
              
              {/* Tab 1: Friends list */}
              {activeTab === "list" && (
                <div className="space-y-4 text-left">
                  {/* Live Search bar */}
                  <div className="relative">
                    <Search className="absolute left-4 top-3.5 h-4.5 w-4.5 text-muted-foreground/60" />
                    <Input
                      placeholder="Search friends by username..."
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-2xl bg-card border-border/80 font-sans focus:outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/45"
                    />
                  </div>

                  {filteredFriends.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredFriends.map((friend) => {
                        const vipInfo = getVipBadgeStyles(friend.vip_status);
                        return (
                          <div 
                            key={friend.id}
                            className="p-4 rounded-3xl bg-card/75 border border-border/60 hover:border-border transition-all flex items-center justify-between gap-4 shadow-sm"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={friend.username} url={friend.avatar_url} size={44} />
                              <div className="min-w-0 space-y-0.5">
                                <span className="font-bold text-sm text-foreground truncate block leading-tight">
                                  {friend.username}
                                </span>
                                {friend.vip_status && friend.vip_status !== "none" && vipInfo && (
                                  <span 
                                    className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wide border inline-block leading-none"
                                    style={{
                                      color: vipInfo.color,
                                      backgroundColor: `${vipInfo.color}15`,
                                      borderColor: `${vipInfo.color}30`
                                    }}
                                  >
                                    {vipInfo.label}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Button 
                                onClick={() => navigate({ to: "/chat/$friendId", params: { friendId: friend.id } })} 
                                size="sm" 
                                className="rounded-full h-8.5 text-[11px] font-bold gap-1 px-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/15"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                <span>Chat</span>
                              </Button>
                              <Button 
                                onClick={() => removeFriend(friend.id)} 
                                variant="ghost" 
                                size="sm"
                                className="h-8.5 w-8.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-0 shrink-0"
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-16 text-center space-y-3 bg-card/45 border border-dashed border-border/80 rounded-3xl select-none">
                      <Users className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                      <div className="space-y-1">
                        <h4 className="font-bold text-sm text-foreground">No friends found</h4>
                        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                          {friendSearchQuery ? "Try searching for a different username query." : "You haven't added any friends yet. Toggle 'Add Friend' to get started."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Pending Requests */}
              {activeTab === "requests" && (
                <div className="space-y-6 text-left">
                  {/* Incoming Requests */}
                  <div>
                    <h3 className="font-extrabold text-xs text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span>Received Requests ({incoming.length})</span>
                    </h3>
                    {incoming.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {incoming.map((r) => (
                          <div key={r.id} className="p-4 rounded-3xl bg-card border border-border/60 flex items-center justify-between gap-3 shadow-sm animate-in fade-in duration-200">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={r.profile?.username ?? "?"} url={r.profile?.avatar_url} size={40} />
                              <div className="min-w-0">
                                <span className="font-bold text-sm text-foreground truncate block leading-tight">
                                  {r.profile?.username}
                                </span>
                                <span className="text-[10px] text-muted-foreground leading-none">wants to connect</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button 
                                size="sm" 
                                onClick={() => respond(r.id, "accepted")} 
                                className="rounded-full h-8.5 w-8.5 bg-green-600 hover:bg-green-700 text-white p-0"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => respond(r.id, "rejected")} 
                                className="rounded-full h-8.5 w-8.5 text-muted-foreground hover:text-destructive p-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-4 bg-card/45 border border-dashed border-border/80 rounded-2xl text-center">No incoming connection requests.</p>
                    )}
                  </div>

                  {/* Outgoing Requests */}
                  <div>
                    <h3 className="font-extrabold text-xs text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>Sent Requests ({outgoing.length})</span>
                    </h3>
                    {outgoing.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {outgoing.map((r) => (
                          <div key={r.id} className="p-4 rounded-3xl bg-card border border-border/60 flex items-center justify-between gap-3 shadow-sm animate-in fade-in duration-200">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={r.profile?.username ?? "?"} url={r.profile?.avatar_url} size={40} />
                              <div className="min-w-0">
                                <span className="font-bold text-sm text-foreground truncate block leading-tight">
                                  {r.profile?.username}
                                </span>
                                <span className="text-[10px] text-muted-foreground leading-none">Pending confirmation</span>
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => unsendRequest(r.id)} 
                              className="rounded-full h-8.5 text-[11px] font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-3.5"
                            >
                              Unsend
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-4 bg-card/45 border border-dashed border-border/80 rounded-2xl text-center">No pending outgoing requests.</p>
                    )}
                  </div>

                </div>
              )}

              {/* Tab 3: Add Friend */}
              {activeTab === "add" && (
                <div className="max-w-xl mx-auto space-y-6 text-left">
                  <div className="space-y-2 border border-border bg-card rounded-3xl p-6 shadow-sm">
                    <h2 className="text-base font-black text-foreground font-sans">Add Friend by Username</h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Enter the exact username of the person you'd like to add. Once submitted, they will receive a request to connect in their Requests tab.
                    </p>
                    
                    <form onSubmit={findByUsername} className="flex gap-2 pt-2">
                      <div className="relative flex-1">
                        <Search className="h-4.5 w-4.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                        <Input
                          placeholder="Search unique username..."
                          value={usernameInput}
                          onChange={(e) => setUsernameInput(e.target.value)}
                          className="pl-10.5 rounded-full bg-secondary border-transparent focus:border-primary/50 text-sm font-sans h-11"
                        />
                      </div>
                      <Button type="submit" disabled={searching} className="rounded-full h-11 px-5 text-xs font-bold shadow-md">
                        {searching ? "Searching…" : "Find User"}
                      </Button>
                    </form>
                  </div>

                  {searchResult && (() => {
                    const isAlreadyFriend = friends.some((f) => f.id === searchResult.id);
                    const vipInfo = getVipBadgeStyles(searchResult.vip_status);
                    return (
                      <div className="flex items-center justify-between gap-4 p-5 rounded-3xl bg-primary/5 border border-primary/20 shadow-sm animate-in zoom-in-95 duration-250">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={searchResult.username} url={searchResult.avatar_url} size={48} />
                          <div className="min-w-0 space-y-0.5">
                            <span className="font-extrabold text-sm text-foreground truncate block leading-tight">
                              {searchResult.username}
                            </span>
                            {searchResult.vip_status && searchResult.vip_status !== "none" && vipInfo && (
                              <span 
                                className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wide border inline-block leading-none"
                                style={{
                                  color: vipInfo.color,
                                  backgroundColor: `${vipInfo.color}15`,
                                  borderColor: `${vipInfo.color}30`
                                }}
                              >
                                {vipInfo.label}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAlreadyFriend ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-semibold">Already friends</span>
                            <Button 
                              onClick={() => {
                                setSearchResult(null);
                                setUsernameInput("");
                                navigate({ to: "/chat/$friendId", params: { friendId: searchResult.id } });
                              }} 
                              size="sm" 
                              variant="secondary" 
                              className="rounded-full"
                            >
                              <MessageCircle className="h-4 w-4 mr-1" /> Chat
                            </Button>
                          </div>
                        ) : (
                          <Button onClick={() => sendRequest(searchResult.id)} size="sm" className="rounded-full h-9 font-bold px-4">
                            <UserPlus className="h-4 w-4 mr-1.5" /> Add Friend
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>
          </div>
        </PullToRefresh>
      </div>
    </AppShell>
  );
}
