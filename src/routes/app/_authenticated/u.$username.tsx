import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, UserPlus, Check, X, MessageCircle, AlertCircle, ArrowLeft, Calendar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/messenger/Avatar";
import { toast } from "sonner";
import { format } from "date-fns";

const sb: any = supabase;

function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  return `/${normalized}.png`;
}

function getVipBadgeStyles(status: string | null | undefined) {
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
  }
  
  return { label, color };
}

export const Route = createFileRoute("/app/_authenticated/u/$username")({
  head: ({ params }) => ({
    meta: [
      {
        title: params.username 
          ? `@${params.username} Profile — Jackpot Jungle`
          : "User Profile — Jackpot Jungle"
      }
    ]
  }),
  component: UserProfileLandingPage,
});

function UserProfileLandingPage() {
  const { username } = useParams({ from: "/app/_authenticated/u/$username" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const meId = user?.id;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [pendingReq, setPendingReq] = useState<{ id: string; direction: "in" | "out" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function checkRelationship(myId: string, targetId: string) {
    try {
      // 1. Check friendship
      const [a, b] = myId < targetId ? [myId, targetId] : [targetId, myId];
      const { data: friendship } = await sb
        .from("friendships")
        .select("user_a")
        .eq("user_a", a)
        .eq("user_b", b)
        .maybeSingle();

      if (friendship) {
        setIsFriend(true);
        setPendingReq(null);
        return;
      }

      // 2. Check pending requests
      const { data: request } = await sb
        .from("friend_requests")
        .select("id, sender_id, status")
        .eq("status", "pending")
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${myId})`)
        .maybeSingle();

      if (request) {
        setPendingReq({
          id: request.id,
          direction: request.sender_id === myId ? "out" : "in"
        });
      } else {
        setPendingReq(null);
      }
      setIsFriend(false);
    } catch (err) {
      console.error("Error checking relationship:", err);
    }
  }

  useEffect(() => {
    if (!username) return;

    async function loadProfile() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const { data: prof, error } = await sb
          .from("profiles")
          .select("id, username, first_name, last_name, avatar_url, friend_code, created_at, vip_status")
          .eq("username", username)
          .maybeSingle();

        if (error) throw error;

        if (!prof) {
          setErrorMsg("The user profile you are looking for does not exist.");
          setLoading(false);
          return;
        }

        setProfile(prof);

        if (meId) {
          if (meId === prof.id) {
            setIsSelf(true);
          } else {
            setIsSelf(false);
            await checkRelationship(meId, prof.id);
          }
        }
      } catch (err: any) {
        console.error("Load profile error:", err);
        setErrorMsg("Failed to load profile details.");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [username, meId]);

  // Subscribe to real-time changes
  useEffect(() => {
    if (!profile?.id || !meId || isSelf) return;

    const rand = Math.random().toString(36).slice(2, 9);
    const channel = supabase
      .channel(`user-profile-page-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => {
        checkRelationship(meId, profile.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        checkRelationship(meId, profile.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, meId, isSelf]);

  async function handleAddFriend() {
    if (!profile || !meId || actionLoading) return;
    setActionLoading(true);
    try {
      const { error } = await sb.from("friend_requests").insert({
        sender_id: meId,
        receiver_id: profile.id,
      });

      if (error) {
        if (error.code === "23505") {
          toast.info("A friend request already exists between you two.");
        } else {
          throw error;
        }
      } else {
        toast.success("Friend request sent successfully!");
        await checkRelationship(meId, profile.id);
      }
    } catch (err: any) {
      console.error("Add friend error:", err);
      toast.error(err.message || "Failed to send friend request.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAcceptRequest() {
    if (!pendingReq || actionLoading) return;
    setActionLoading(true);
    try {
      const { error } = await sb
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("id", pendingReq.id);

      if (error) throw error;
      toast.success("You are now friends! Say hi 👋");
      if (profile && meId) {
        await checkRelationship(meId, profile.id);
      }
    } catch (err: any) {
      console.error("Accept request error:", err);
      toast.error(err.message || "Failed to accept friend request.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeclineRequest() {
    if (!pendingReq || actionLoading) return;
    setActionLoading(true);
    try {
      const { error } = await sb
        .from("friend_requests")
        .update({ status: "rejected" })
        .eq("id", pendingReq.id);

      if (error) throw error;
      toast.success("Friend request declined.");
      if (profile && meId) {
        await checkRelationship(meId, profile.id);
      }
    } catch (err: any) {
      console.error("Decline request error:", err);
      toast.error(err.message || "Failed to decline friend request.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground animate-pulse">Loading profile details...</p>
      </div>
    );
  }

  const displayName = profile?.first_name 
    ? (profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.first_name) 
    : profile?.username;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-6 relative overflow-hidden select-none">
      {/* Premium background decorations */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-secondary/15 rounded-full blur-[80px] pointer-events-none" />

      {errorMsg ? (
        <div className="relative w-full max-w-sm p-6 bg-card/60 backdrop-blur-xl border border-border/80 rounded-3xl shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mx-auto">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-bold text-lg">Profile Not Found</h3>
            <p className="text-xs text-muted-foreground leading-relaxed px-2">
              {errorMsg}
            </p>
          </div>
          <Button 
            asChild
            className="w-full rounded-2xl font-bold py-5 shadow-md shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all bg-primary"
          >
            <Link to="/app/chat">
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span>Back to Messenger</span>
            </Link>
          </Button>
        </div>
      ) : (
        <div className="relative w-full max-w-sm p-6 bg-card/60 backdrop-blur-xl border border-border/80 rounded-3xl shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
          <div className="space-y-4">
            {/* User Profile Card Header */}
            <div className="flex justify-center relative">
              <div className="shadow-xl border-2 border-primary/25 rounded-full overflow-hidden">
                <Avatar 
                  name={profile.username} 
                  url={profile.avatar_url} 
                  size={96} 
                />
              </div>
              {isSelf && (
                <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  You
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-extrabold text-foreground truncate max-w-[280px] mx-auto tracking-tight flex items-center justify-center gap-2">
                <span>{displayName}</span>
                {profile?.vip_status && profile.vip_status !== "none" && (
                  <img 
                    src={getVipBadgeUrl(profile.vip_status) || undefined} 
                    alt={`${profile.vip_status} VIP`} 
                    className="h-7 w-auto object-contain select-none inline-block align-middle"
                    title={`${profile.vip_status.toUpperCase()} VIP`}
                  />
                )}
              </h2>
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium select-none">
                <span>@{profile.username}</span>
                {(() => {
                  const info = getVipBadgeStyles(profile?.vip_status);
                  if (!info) return null;
                  return (
                    <>
                      <span className="text-muted-foreground/30">•</span>
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
                    </>
                  );
                })()}
                <span className="text-muted-foreground/30">•</span>
                <span className="bg-secondary/60 px-2 py-0.5 rounded-full text-[10px] font-bold text-primary tracking-wide uppercase">
                  {profile.friend_code}
                </span>
              </div>
            </div>
          </div>

          {/* Member Details badge */}
          <div className="flex justify-center items-center gap-1.5 text-[11px] text-muted-foreground py-2 border-y border-border/40">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/75" />
            <span>Member since {profile.created_at ? format(new Date(profile.created_at), "MMMM yyyy") : "Join Date N/A"}</span>
          </div>

          {/* Premium UI Action buttons based on relationship status */}
          <div className="space-y-3 pt-2">
            {isSelf ? (
              <Button
                onClick={() => navigate({ to: "/app/profile" })}
                className="w-full rounded-2xl font-bold py-6 shadow-md shadow-primary/20 hover:shadow-primary/35 active:scale-[0.98] transition-all bg-primary text-sm flex items-center justify-center gap-1.5"
              >
                <Sparkles className="h-4 w-4" />
                <span>Edit My Profile</span>
              </Button>
            ) : isFriend ? (
              <Button
                onClick={() => navigate({ to: `/app/chat/${profile.id}` })}
                className="w-full rounded-2xl font-bold py-6 shadow-md shadow-primary/20 hover:shadow-primary/35 active:scale-[0.98] transition-all bg-primary text-sm flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Send Message</span>
              </Button>
            ) : pendingReq ? (
              pendingReq.direction === "out" ? (
                <Button
                  disabled
                  className="w-full rounded-2xl font-bold py-6 bg-secondary/80 text-muted-foreground text-sm flex items-center justify-center gap-1.5"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
                  <span>Friend Request Pending</span>
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-primary/80 mb-2">Sent you a friend request</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleDeclineRequest}
                      disabled={actionLoading}
                      variant="outline"
                      className="flex-1 rounded-2xl font-bold py-6 border-border hover:bg-secondary/40 text-sm flex items-center justify-center gap-1"
                    >
                      <X className="h-4 w-4" />
                      <span>Decline</span>
                    </Button>
                    <Button
                      onClick={handleAcceptRequest}
                      disabled={actionLoading}
                      className="flex-1 rounded-2xl font-bold py-6 shadow-md shadow-primary/20 hover:shadow-primary/35 bg-primary text-sm flex items-center justify-center gap-1"
                    >
                      <Check className="h-4 w-4" />
                      <span>Accept</span>
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <Button
                onClick={handleAddFriend}
                disabled={actionLoading}
                className="w-full rounded-2xl font-bold py-6 shadow-md shadow-primary/20 hover:shadow-primary/35 active:scale-[0.98] transition-all bg-primary text-sm flex items-center justify-center gap-1.5"
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Sending Request...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    <span>Add Friend</span>
                  </>
                )}
              </Button>
            )}

            <Link 
              to="/app/chat" 
              className="block text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline transition-colors mt-2"
            >
              Back to Messenger
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
