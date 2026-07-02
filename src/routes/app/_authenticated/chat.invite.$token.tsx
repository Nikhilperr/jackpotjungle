import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Users, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/messenger/Avatar";
import { toast } from "sonner";

export const Route = createFileRoute("/app/_authenticated/chat/invite/$token")({
  head: () => ({ meta: [{ title: "Join Group Chat — Jackpot Jungle" }] }),
  component: InviteLandingPage,
});

function InviteLandingPage() {
  const { token } = useParams({ from: "/app/_authenticated/chat/invite/$token" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const meId = user?.id;

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    if (!token || !meId) return;

    async function validateInvite() {
      setLoading(true);
      setErrorMsg(null);
      try {
        // Query the invite token and joined group details
        const { data: invite, error } = await supabase
          .from("group_invites")
          .select("*, groups(*)")
          .eq("token", token)
          .maybeSingle();

        if (error) throw error;

        if (!invite) {
          setErrorMsg("This invite link is invalid or has expired.");
          setLoading(false);
          return;
        }

        // Check expiration date
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          setErrorMsg("This invite link has expired. Please ask the group admin to generate a new invite.");
          setLoading(false);
          return;
        }

        // Check if current user is already a member
        const { data: existingMember } = await supabase
          .from("group_members")
          .select("role")
          .eq("group_id", invite.group_id)
          .eq("user_id", meId)
          .maybeSingle();

        if (existingMember) {
          setAlreadyMember(true);
        }

        // Get group members count
        const { count } = await supabase
          .from("group_members")
          .select("user_id", { count: "exact", head: true })
          .eq("group_id", invite.group_id);

        setInviteData(invite);
        setMemberCount(count || 0);
      } catch (err: any) {
        console.error("Invite validation error:", err);
        setErrorMsg("Failed to validate invite link. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    validateInvite();
  }, [token, meId]);

  async function handleJoin() {
    if (!inviteData || !meId || joining) return;

    // If already a member, navigate directly
    if (alreadyMember) {
      navigate({ to: `/app/chat/group-${inviteData.group_id}` });
      return;
    }

    setJoining(true);
    try {
      // 1. Fetch current profile username to create a system log
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", meId)
        .single();

      const username = profile?.username || "Someone";

      // 2. Join the group (create membership row)
      const { error: joinErr } = await supabase
        .from("group_members")
        .insert({
          group_id: inviteData.group_id,
          user_id: meId,
          role: "member"
        });

      if (joinErr) throw joinErr;

      // 3. Log a human-readable system joined message
      await supabase
        .from("messages")
        .insert({
          group_id: inviteData.group_id,
          sender_id: meId,
          content: `[system:user_joined:${username}]`
        });

      toast.success("Successfully joined the group chat!");
      navigate({ to: `/app/chat/group-${inviteData.group_id}` });
    } catch (err: any) {
      console.error("Join group error:", err);
      toast.error(err.message || "Failed to join group.");
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground animate-pulse">Verifying invitation link...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-6 select-none">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      {errorMsg ? (
        <div className="relative w-full max-w-sm p-6 bg-card/60 backdrop-blur-xl border border-border/80 rounded-3xl shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200">
          <div className="h-14 w-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mx-auto">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-bold text-lg">Unable to Join Group</h3>
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
          <div className="space-y-3">
            <div className="flex justify-center">
              <Avatar 
                name={inviteData.groups?.name || "Group"} 
                url={inviteData.groups?.avatar_url} 
                size={80} 
                className="shadow-lg border-2 border-primary/25"
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground truncate max-w-[280px] mx-auto">
                {inviteData.groups?.name}
              </h2>
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{memberCount} {memberCount === 1 ? "member" : "members"}</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/40 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              {alreadyMember 
                ? "You are already a member of this conversation group." 
                : "You have been invited to join this group chat conversation."
              }
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleJoin}
              disabled={joining}
              className="w-full rounded-2xl font-bold py-6 shadow-md shadow-primary/20 hover:shadow-primary/35 active:scale-[0.98] transition-all bg-primary text-sm flex items-center justify-center gap-1.5"
            >
              {joining ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Joining...</span>
                </>
              ) : (
                <span>{alreadyMember ? "Open Conversation" : "Join Group Chat"}</span>
              )}
            </Button>

            <Link 
              to="/app/chat" 
              className="block text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline transition-colors"
            >
              Decline & Exit
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
