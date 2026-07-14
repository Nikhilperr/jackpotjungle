import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Avatar } from "./chat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, Check, X, MessageCircle, RefreshCw, UserMinus, Clock, Users, ArrowRight } from "lucide-react";
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
  
  // Live search for finding users in the database
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Live search for filtering existing friends
  const [friendSearchQuery, setFriendSearchQuery] = useState("");

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

  // Load user session on mount
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

  // Debounced live search for database users
  useEffect(() => {
    if (!meId) return;
    const q = userSearchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    let active = true;
    const searchUsers = async () => {
      setSearchingUsers(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, vip_status")
        .neq("id", meId)
        .ilike("username", `%${q}%`)
        .limit(8);

      if (active && data) {
        setSearchResults(data as Profile[]);
      }
      setSearchingUsers(false);
    };

    const timer = setTimeout(searchUsers, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userSearchQuery, meId]);

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
      else toast.info("This user has already sent you a friend request.");
      return;
    }

    const { error } = await supabase.from("friend_requests").insert({
      sender_id: meId,
      receiver_id: receiverId,
    });
    if (error) {
      toast.error(error.message);
    } else { 
      toast.success("Friend request sent!"); 
      setUserSearchQuery("");
      setSearchResults([]);
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
        {/* Sticky Header */}
        <div className="p-3 border-b border-border flex items-center justify-between bg-card/60 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <HamburgerButton />
            <h1 className="font-extrabold text-foreground flex items-center gap-2 font-sans">
              <Users className="h-5 w-5 text-primary" />
              <span>Social Connections</span>
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
            className="h-8.5 w-8.5 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center p-0"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>

        <PullToRefresh onRefresh={async () => { if (meId) { await load(meId); } }}>
          {/* Main Dashboard Layout Grid */}
          <div className="max-w-6xl mx-auto p-4 md:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
              
              {/* Left Column: My Friends (Width: 8/12 on LG) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-4">
                <div className="rounded-3xl bg-card border border-border/60 p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="font-black text-base text-foreground font-sans">
                      My Friends ({friends.length})
                    </h2>
                  </div>

                  {/* Friends search bar */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      placeholder="Search friends by username..."
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-secondary/40 border-transparent placeholder:text-muted-foreground/45 text-sm font-sans"
                    />
                  </div>

                  {/* Friends Stream */}
                  {filteredFriends.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {filteredFriends.map((friend) => {
                        const vipInfo = getVipBadgeStyles(friend.vip_status);
                        return (
                          <div 
                            key={friend.id}
                            className="p-3.5 rounded-2xl bg-secondary/20 border border-border/40 hover:border-border transition-all flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar name={friend.username} url={friend.avatar_url} size={40} />
                              <div className="min-w-0 space-y-0.5">
                                <span className="font-bold text-xs text-foreground truncate block leading-tight">
                                  {friend.username}
                                </span>
                                {friend.vip_status && friend.vip_status !== "none" && vipInfo && (
                                  <span 
                                    className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wide border inline-block leading-none"
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
                            
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button 
                                onClick={() => navigate({ to: "/chat/$friendId", params: { friendId: friend.id } })} 
                                size="sm" 
                                className="rounded-full h-8 text-[10px] font-bold px-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                <span>Chat</span>
                              </Button>
                              <Button 
                                onClick={() => removeFriend(friend.id)} 
                                variant="ghost" 
                                size="sm"
                                className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-0"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-16 text-center space-y-3 bg-secondary/5 border border-dashed border-border/60 rounded-2xl select-none">
                      <Users className="h-8 w-8 text-muted-foreground/35 mx-auto" />
                      <div className="space-y-1">
                        <h4 className="font-bold text-xs text-foreground">No friends found</h4>
                        <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                          {friendSearchQuery ? "Try searching for a different username query." : "Search global users on the right to start building your chat list!"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Search database & Pending requests (Width: 4/12 on LG) */}
              <div className="lg:col-span-5 xl:col-span-4 space-y-6">
                
                {/* Panel A: Live User search bar */}
                <div className="rounded-3xl bg-card border border-border/60 p-5 space-y-3.5 shadow-sm">
                  <div>
                    <h3 className="font-black text-sm text-foreground font-sans">Find Users</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      Search and connect with other social casino players live.
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      placeholder="Type username to search..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-secondary/40 border-transparent placeholder:text-muted-foreground/45 text-sm font-sans"
                    />
                  </div>

                  {/* Search Results stream */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-border/40 max-h-[220px] overflow-y-auto pr-1 no-scrollbar animate-in slide-in-from-top-2 duration-200">
                      {searchResults.map((user) => {
                        const isAlreadyFriend = friends.some((f) => f.id === user.id);
                        const isIncoming = incoming.some((r) => r.profile?.id === user.id);
                        const isOutgoing = outgoing.some((r) => r.profile?.id === user.id);
                        const vipInfo = getVipBadgeStyles(user.vip_status);

                        return (
                          <div 
                            key={user.id}
                            className="p-2.5 rounded-xl bg-secondary/10 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={user.username} url={user.avatar_url} size={30} />
                              <div className="min-w-0">
                                <span className="font-bold text-xs text-foreground truncate block leading-tight">
                                  {user.username}
                                </span>
                                {user.vip_status && user.vip_status !== "none" && vipInfo && (
                                  <span 
                                    className="px-1 py-0.5 rounded text-[6px] font-black uppercase tracking-wide border inline-block leading-none"
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

                            {/* Relationship-dependent Action */}
                            {isAlreadyFriend ? (
                              <span className="text-[10px] text-muted-foreground font-bold pr-2">Friend</span>
                            ) : isOutgoing ? (
                              <span className="text-[10px] text-primary font-bold pr-2 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Sent
                              </span>
                            ) : isIncoming ? (
                              <span className="text-[10px] text-green-500 font-bold pr-2">Received</span>
                            ) : (
                              <Button 
                                onClick={() => sendRequest(user.id)} 
                                size="sm" 
                                className="rounded-full h-7 w-7 p-0 flex items-center justify-center bg-primary text-primary-foreground shrink-0 shadow-sm"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {searchingUsers && (
                    <p className="text-[10px] text-muted-foreground text-center">Searching user directory...</p>
                  )}

                  {userSearchQuery && searchResults.length === 0 && !searchingUsers && (
                    <p className="text-[10px] text-muted-foreground text-center">No users match that search query.</p>
                  )}
                </div>

                {/* Panel B: Pending Connection requests */}
                {totalRequests > 0 && (
                  <div className="rounded-3xl bg-card border border-border/60 p-5 space-y-4 shadow-sm">
                    <h3 className="font-black text-sm text-foreground font-sans">
                      Pending Connection Invites ({totalRequests})
                    </h3>

                    {/* Received requests */}
                    {incoming.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[9px] uppercase tracking-wider font-black text-muted-foreground block">Received Connection Requests</span>
                        {incoming.map((r) => (
                          <div key={r.id} className="p-3 rounded-2xl bg-secondary/15 border border-border/40 flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={r.profile?.username ?? "?"} url={r.profile?.avatar_url} size={30} />
                              <span className="font-bold text-xs text-foreground truncate block">{r.profile?.username}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button 
                                size="sm" 
                                onClick={() => respond(r.id, "accepted")} 
                                className="rounded-full h-7 w-7 bg-green-600 hover:bg-green-700 text-white p-0"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => respond(r.id, "rejected")} 
                                className="rounded-full h-7 w-7 text-muted-foreground hover:text-destructive p-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sent requests */}
                    {outgoing.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <span className="text-[9px] uppercase tracking-wider font-black text-muted-foreground block">Sent Connection Requests</span>
                        {outgoing.map((r) => (
                          <div key={r.id} className="p-3 rounded-2xl bg-secondary/15 border border-border/40 flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={r.profile?.username ?? "?"} url={r.profile?.avatar_url} size={30} />
                              <span className="font-bold text-xs text-foreground truncate block">{r.profile?.username}</span>
                            </div>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => unsendRequest(r.id)} 
                              className="rounded-full h-7 text-[10px] font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2.5 shrink-0"
                            >
                              Unsend
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>
          </div>
        </PullToRefresh>
      </div>
    </AppShell>
  );
}
