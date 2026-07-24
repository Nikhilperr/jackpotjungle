import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from "react";
import { createFileRoute, useParams, Link, useNavigate } from "@tanstack/react-router";
import { toCDNUrl } from "@/config";
import { CachedImage } from "@/components/messenger/CachedImage";
import { ChatMediaBubble } from "@/components/messenger/ChatMediaBubble";
import { ChatImagePreview } from "@/components/messenger/ChatImagePreview";
import { supabase } from "@/integrations/supabase/client";
import { copyChatMessage } from "@/lib/chat-clipboard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, X, Search, ChevronUp, ChevronDown, Phone, Video, Pin, Reply, Trash2, Forward, Copy, MoreHorizontal, Info, Bell, Sparkles, BookOpen, Megaphone, Check, Users, UserMinus, ShieldAlert, LogOut, Camera, Share2, QrCode, RefreshCw, Download, MessageCircle, Edit, Shield, ShieldCheck, User } from "lucide-react";
import { Avatar } from "@/components/messenger/Avatar";
import { MessengerComposer } from "@/components/messenger/MessengerComposer";
import { VoiceMessage } from "@/components/messenger/VoiceMessage";
import { CallMessage } from "@/components/messenger/CallMessage";
import { useCalls } from "@/components/messenger/CallProvider";
import { uploadAndSign, CHAT_IMAGE_ALLOWED_MIMES, CHAT_IMAGE_ALLOWED_EXTS, isAnimatedGif } from "@/lib/chat-media";
import { isChatVideoFile } from "@/lib/chat-video";
import { NetworkManager, generateUUID } from "@/lib/network-manager";
import { prefetchChatMedia } from "@/lib/media-cache";
import { messageBubbleSelectClass, messageTextSelectClass, onMessageContextMenu } from "@/lib/desktop-text-select";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";

function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  if (normalized === "black_diamond" || normalized === "blackvip") return "/blackvip.png";
  return `/${normalized}.png`;
}
import { unsendMessagesServer } from "@/lib/messages.functions";
import { getUserAIResponse } from "@/lib/user-ai.functions";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { downloadQRCode, shouldShowDaySeparator, formatChatDaySeparator } from "@/lib/chat-helpers";
import { CreateGroupModal } from "./chat";
import {
  getCachedProfile,
  getCachedMessages,
  hydrateCachedMessages,
  hydrateCachedProfile,
  hydrateCachedGroupMessages,
  setCachedGroupMessagesDurable,
  setCachedProfile,
  setCachedMessages,
  invalidateMessageCache,
  getDraft,
  setDraft,
  clearDraft,
} from "@/lib/chat-cache";
import { syncDmThread, applyRealtimeMessageToLocal, dmConvKey } from "@/lib/local-first-sync";
import { useTrackActiveConversation } from "@/lib/active-conversation";

import { ShareProfileModal } from "@/components/messenger/ShareProfileModal";

function getCachedGroupDetails(groupId: string) {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(`jj_group_details_${groupId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function setCachedGroupDetails(groupId: string, details: any) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`jj_group_details_${groupId}`, JSON.stringify(details));
  } catch {}
}

function getCachedGroupMessages(groupId: string) {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(`jj_group_msgs_${groupId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function setCachedGroupMessages(groupId: string, messages: any[]) {
  setCachedGroupMessagesDurable(groupId, messages);
}

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled";
  duration_seconds: number;
  created_at: string;
};


interface GroupAddMembersModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string | null;
  meId: string;
  onMembersAdded: () => void;
  isAdminOrSuper?: boolean;
  isAdminTeamChat?: boolean;
}

export function GroupAddMembersModal({
  open,
  onClose,
  groupId,
  meId,
  onMembersAdded,
  isAdminOrSuper: forceAdminOrSuper,
  isAdminTeamChat = false,
}: GroupAddMembersModalProps) {
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [potentialMembers, setPotentialMembers] = useState<any[]>([]);
  const [loadingPotential, setLoadingPotential] = useState(false);
  const [newMembersSelected, setNewMembersSelected] = useState<string[]>([]);
  const [potentialSearchQuery, setPotentialSearchQuery] = useState("");
  const [myUsername, setMyUsername] = useState("Someone");
  const { role } = useRole();
  const isAdminOrSuper = forceAdminOrSuper !== undefined ? forceAdminOrSuper : (role === "admin" || role === "super_admin" || isAdminTeamChat);

  useEffect(() => {
    if (meId) {
      supabase.from("profiles").select("username").eq("id", meId).single().then(({ data }) => {
        if (data?.username) setMyUsername(data.username);
      });
    }
  }, [meId]);

  const loadPotential = useCallback(async () => {
    if (!groupId || !meId) return;
    setLoadingPotential(true);
    try {
      const { data: currentMembers } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId);

      const existingUserIds = new Set((currentMembers ?? []).map(m => m.user_id));

      if (isAdminTeamChat) {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "super_admin"]);

        const staffIds = (roleRows ?? []).map(r => r.user_id).filter(id => id !== meId && !existingUserIds.has(id));

        if (staffIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, first_name, last_name, avatar_url")
            .in("id", staffIds);
          setFriendsList(profiles ?? []);
          setPotentialMembers(profiles ?? []);
        } else {
          setFriendsList([]);
          setPotentialMembers([]);
        }
        setLoadingPotential(false);
        return;
      }

      const currentMembersUserIds = (currentMembers ?? []).map(m => m.user_id);
      const { data: currentAdminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("user_id", currentMembersUserIds)
        .in("role", ["admin", "super_admin"]);

      const hasAdminInGroup = currentAdminRoles && currentAdminRoles.length > 0;

      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_a, user_b");
      
      let initialFriends: any[] = [];
      if (friendships) {
        const friendIds = friendships
          .map(f => f.user_a === meId ? f.user_b : f.user_a)
          .filter(id => !existingUserIds.has(id));
          
        if (friendIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username, first_name, last_name, avatar_url")
            .in("id", friendIds);
          initialFriends = profiles ?? [];
        }
      }

      if (!hasAdminInGroup) {
        initialFriends = [
          {
            id: "support-page-temp",
            username: "jackpotjungle",
            first_name: "Jackpot",
            last_name: "Jungle",
            avatar_url: "/icons/icon-256.webp"
          },
          ...initialFriends
        ];
      }

      setFriendsList(initialFriends);
      setPotentialMembers(initialFriends);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPotential(false);
    }
  }, [groupId, meId, isAdminTeamChat]);

  useEffect(() => {
    if (open) {
      setNewMembersSelected([]);
      setPotentialSearchQuery("");
      setPotentialMembers([]);
      setFriendsList([]);
      loadPotential();
    }
  }, [open, loadPotential]);

  useEffect(() => {
    if (!open) return;

    const trimmed = potentialSearchQuery.trim();
    if (!trimmed) {
      setPotentialMembers(friendsList);
      return;
    }

    if (isAdminTeamChat) {
      const delay = setTimeout(async () => {
        setLoadingPotential(true);
        try {
          const { data: currentMembers } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", groupId);
          const existingUserIds = new Set((currentMembers ?? []).map(m => m.user_id));

          const { data: roleRows } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "super_admin"]);

          const staffIds = (roleRows ?? []).map(r => r.user_id).filter(id => id !== meId && !existingUserIds.has(id));

          if (staffIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, username, first_name, last_name, avatar_url")
              .in("id", staffIds)
              .or(`username.ilike.%${trimmed}%,first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`)
              .limit(30);
            setPotentialMembers(profiles ?? []);
          } else {
            setPotentialMembers([]);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingPotential(false);
        }
      }, 300);
      return () => clearTimeout(delay);
    }

    if (!isAdminOrSuper) {
      const qLower = trimmed.toLowerCase();
      const filtered = friendsList.filter((item) => {
        const dispName = item.first_name && item.last_name ? `${item.first_name} ${item.last_name}` : item.username;
        return (
          dispName.toLowerCase().includes(qLower) ||
          item.username.toLowerCase().includes(qLower)
        );
      });
      setPotentialMembers(filtered);
      return;
    }

    const delay = setTimeout(async () => {
      setLoadingPotential(true);
      try {
        const { data: currentMembers } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId);
        const existingUserIds = new Set((currentMembers ?? []).map(m => m.user_id));

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, first_name, last_name, avatar_url")
          .neq("id", meId)
          .neq("username", "jackpotjungle")
          .or(`username.ilike.%${trimmed}%,first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`)
          .limit(30);
          
        let filtered = (profiles ?? []).filter(p => !existingUserIds.has(p.id));
        setPotentialMembers(filtered);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPotential(false);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [potentialSearchQuery, open, groupId, meId, friendsList, isAdminOrSuper, isAdminTeamChat]);

  async function handleAddSubmit() {
    if (!groupId || !meId || newMembersSelected.length === 0) return;
    try {
      let finalSelected = [...newMembersSelected];
      let addedJackpotJungle = false;
      if (newMembersSelected.includes("support-page-temp")) {
        finalSelected = finalSelected.filter(id => id !== "support-page-temp");
        addedJackpotJungle = true;
        
        const { data: adminRows } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "super_admin"]);
        
        if (adminRows && adminRows.length > 0) {
          const adminUserIds = adminRows.map(r => r.user_id);
          adminUserIds.forEach(uid => {
            if (uid !== meId && !finalSelected.includes(uid)) {
              finalSelected.push(uid);
            }
          });
        }
      }

      const inserts = finalSelected.map(uid => ({
        group_id: groupId,
        user_id: uid,
        role: "member"
      }));

      const { error } = await supabase.from("group_members").insert(inserts);
      if (error) throw error;

      if (addedJackpotJungle) {
        await supabase
          .from("messages")
          .insert({
            sender_id: meId,
            group_id: groupId,
            content: `[system:user_added:Jackpot Jungle:${myUsername}]`
          } as any);
      }

      for (const uid of newMembersSelected) {
        if (uid === "support-page-temp") continue;
        const profile = potentialMembers.find(p => p.id === uid) || friendsList.find(p => p.id === uid);
        const targetUsername = profile?.username || "Someone";
        await supabase
          .from("messages")
          .insert({
            sender_id: meId,
            group_id: groupId,
            content: `[system:user_added:${targetUsername}:${myUsername}]`
          } as any);
      }

      toast.success("Members added to group");
      onMembersAdded();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to add members");
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-full max-w-sm p-6 bg-card border border-border rounded-3xl shadow-2xl flex flex-col gap-4 max-h-[80vh] overflow-y-auto text-foreground [&>button]:hidden">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="font-bold text-lg">Add Members</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users to add..."
            value={potentialSearchQuery}
            onChange={(e) => setPotentialSearchQuery(e.target.value)}
            className="pl-9 rounded-xl bg-background/50 border-border/80"
          />
        </div>

        <div className="max-h-48 overflow-y-auto border border-border/60 rounded-xl divide-y divide-border/40 bg-background/30 animate-in fade-in duration-200">
          {loadingPotential ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : potentialMembers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {potentialSearchQuery.trim() ? "No users found" : "No friends available to add"}
            </div>
          ) : (
            potentialMembers.map((item) => {
              const isChecked = newMembersSelected.includes(item.id);
              const dispName = item.first_name && item.last_name ? `${item.first_name} ${item.last_name}` : item.username;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setNewMembersSelected(prev =>
                      isChecked ? prev.filter(uid => uid !== item.id) : [...prev, item.id]
                    );
                  }}
                  className="flex items-center justify-between p-3 hover:bg-secondary/40 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={dispName} url={item.avatar_url} size={36} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{dispName}</p>
                      <p className="text-[10px] text-muted-foreground">@{item.username}</p>
                    </div>
                  </div>
                  <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-all ${isChecked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-transparent"}`}>
                    {isChecked && <Check className="h-3 w-3" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-3 pt-3 border-t border-border mt-2">
          <button
            onClick={onClose}
            className="flex-1 h-11 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
          >
            Cancel
          </button>
          <button
            onClick={handleAddSubmit}
            disabled={newMembersSelected.length === 0}
            className="flex-1 h-11 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            Add
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FastChatInput = React.forwardRef<HTMLInputElement, {
  draft: string;
  onDraftChange: (v: string, sel?: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  onHasContentChange?: (hasContent: boolean) => void;
}>(({ draft, onDraftChange, onKeyDown, placeholder, className, onHasContentChange }, ref) => {
  const [val, setVal] = useState(draft);
  const draftRef = useRef(draft);

  useEffect(() => {
    if (draft !== draftRef.current) {
      draftRef.current = draft;
      setVal(draft);
      if (onHasContentChange) onHasContentChange(!!draft.trim());
    }
  }, [draft, onHasContentChange]);

  return (
    <Input
      ref={ref}
      value={val}
      onChange={(e) => {
        const next = e.target.value;
        const sel = e.target.selectionStart || 0;
        setVal(next);
        draftRef.current = next;
        if (onHasContentChange) onHasContentChange(!!next.trim());
        onDraftChange(next, sel);
      }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
    />
  );
});
FastChatInput.displayName = "FastChatInput";

export const Route = createFileRoute("/app/_authenticated/chat/$friendId")({
  component: ChatView,
});

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  seen: boolean;
  delivered: boolean;
  created_at: string;
  failed?: boolean;
};
type Profile = { 
  id: string; 
  username: string; 
  first_name?: string | null; 
  last_name?: string | null; 
  avatar_url: string | null; 
  online: boolean; 
  last_seen: string;
  friend_code?: string;
  referral_code?: string;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
  vip_status?: string | null;
};

function ChatView() {
  const { friendId } = useParams({ from: "/app/_authenticated/chat/$friendId" });
  const { user } = useAuth();
  const navigate = useNavigate();
  // Messenger: suppress notifications for THIS open thread only.
  useTrackActiveConversation(friendId);
  const [meId, setMeId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("jj_me_id");
  });
  const aiMessagesKey = meId ? `jj_ai_messages_${meId}` : "jj_ai_messages";
  const aiLastMsgKey = meId ? `jj_ai_last_msg_${meId}` : "jj_ai_last_msg";
  const aiLastAtKey = meId ? `jj_ai_last_at_${meId}` : "jj_ai_last_at";

  useEffect(() => {
    if (user?.id) {
      setMeId(user.id);
      try {
        localStorage.setItem("jj_me_id", user.id);
      } catch {}
    }
  }, [user]);

  const [friend, setFriend] = useState<Profile | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cachedProfile = getCachedProfile(friendId);
      return cachedProfile || null;
    } catch {}
    return null;
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const myId = localStorage.getItem("jj_me_id");
      if (myId) {
        const cachedMsgs = getCachedMessages(myId, friendId);
        return cachedMsgs || [];
      }
    } catch {}
    return [];
  });
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [prevFriendId, setPrevFriendId] = useState(friendId);

  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const isNearBottomRef = useRef(true);
  const isGroup = friendId.startsWith("group-");
  const groupId = isGroup ? friendId.substring(6) : null;
  const [group, setGroup] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [memberRoles, setMemberRoles] = useState<Map<string, "admin" | "super_admin">>(new Map());
  const [friendRole, setFriendRole] = useState<"admin" | "super_admin" | "user">("user");
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupAvatar, setEditingGroupAvatar] = useState("");
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; username: string } | null>(null);
  const { isAdmin, isSuperAdmin } = useRole();

  const myMemberInfo = groupMembers.find(m => m.profiles?.id === meId);
  const isGroupAdmin = myMemberInfo?.role === "admin" || isSuperAdmin;
  const myUsername = user?.user_metadata?.username || user?.email?.split("@")[0] || "Someone";

  const { startCall } = useCalls();
  // Restore any unsent draft from localStorage so users don't lose their text
  // when they navigate away and come back.
  const [draft, setDraftState] = useState(() =>
    typeof window !== "undefined" ? getDraft(friendId) : ""
  );

  // Wrapper: keep state and localStorage in sync
  const handleDraftChange = (val: string) => {
    setDraftState(val);
    setDraft(friendId, val);
  };



  const [selectedMentionProfile, setSelectedMentionProfile] = useState<any>(null);
  const [mentionOptionsOpen, setMentionOptionsOpen] = useState(false);
  const [isFriendOfMine, setIsFriendOfMine] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [checkingFriendship, setCheckingFriendship] = useState(false);

  const handleAddFriend = async () => {
    if (!meId || !selectedMentionProfile) return;
    try {
      const { error } = await supabase.from("friend_requests").insert({
        sender_id: meId,
        receiver_id: selectedMentionProfile.id,
        status: "pending"
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Friend request sent successfully!");
        setFriendRequestSent(true);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send friend request");
    }
  };

  const handleMentionClick = async (username: string) => {
    console.log("handleMentionClick called in customer chat with username:", username);
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url, online")
        .ilike("username", username)
        .maybeSingle();

      if (error) {
        console.error("Error querying profiles inside handleMentionClick (customer):", error);
      }
      console.log("Query result profile (customer):", profile);

      if (profile) {
        setSelectedMentionProfile(profile);
        setMentionOptionsOpen(true);
        setFriendRequestSent(false); // Reset sent state
        
        if (meId && profile.id !== meId) {
          setCheckingFriendship(true);
          const { data } = await supabase
            .from("friendships")
            .select("user_a, user_b")
            .or(`and(user_a.eq.${meId},user_b.eq.${profile.id}),and(user_a.eq.${profile.id},user_b.eq.${meId})`)
            .maybeSingle();
          setIsFriendOfMine(!!data);
          setCheckingFriendship(false);
        } else {
          setIsFriendOfMine(false);
        }
      } else {
        toast.error(`User @${username} not found.`);
      }
    } catch (err) {
      console.error("Exception in handleMentionClick (customer):", err);
    }
  };

  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);

  const filteredMembers = useMemo(() => {
    if (mentionSearch === null) return [];
    const query = mentionSearch.toLowerCase();
    const list = groupMembers.map((m: any) => m.profiles).filter(Boolean);
    const seen = new Set<string>();
    const uniqueList: any[] = [];
    list.forEach((p: any) => {
      if (p && p.id && p.id !== meId && !seen.has(p.id)) {
        seen.add(p.id);
        uniqueList.push(p);
      }
    });
    return uniqueList.filter((p: any) =>
      p.username?.toLowerCase().includes(query) ||
      p.first_name?.toLowerCase().includes(query) ||
      p.last_name?.toLowerCase().includes(query)
    );
  }, [mentionSearch, groupMembers]);

  const handleMentionCheck = (textValue: string, selectionStart: number) => {
    const beforeCursor = textValue.substring(0, selectionStart);
    const lastAt = beforeCursor.lastIndexOf("@");
    if (lastAt !== -1) {
      const textAfterAt = beforeCursor.substring(lastAt + 1);
      if (!textAfterAt.includes(" ")) {
        setMentionSearch(textAfterAt);
        setMentionIdx(0);
        return;
      }
    }
    setMentionSearch(null);
  };

  const insertMention = (selectedUsername: string) => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    const val = el.value;
    const selectionStart = el.selectionStart || 0;
    const beforeCursor = val.substring(0, selectionStart);
    const lastAt = beforeCursor.lastIndexOf("@");
    if (lastAt !== -1) {
      const beforeAt = val.substring(0, lastAt);
      const afterCursor = val.substring(selectionStart);
      const nextText = `${beforeAt}@${selectedUsername} ${afterCursor}`;
      handleDraftChange(nextText);
      setMentionSearch(null);
      setTimeout(() => {
        el.focus();
        const nextPos = lastAt + selectedUsername.length + 2;
        el.setSelectionRange(nextPos, nextPos);
      }, 50);
    }
  };

  const friendDisplayName = friend
    ? (friend.first_name ? (friend.last_name ? `${friend.first_name} ${friend.last_name}` : friend.first_name) : friend.username)
    : (isGroup ? (group?.name || "Group") : "Friend");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recUploading, setRecUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [friendTyping, setFriendTyping] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const [threadPinned, setThreadPinned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!meId) return;

    if (isGroup) {
      if (groupMembers.length === 0) return;
      const userIds = groupMembers.map(m => m.profiles?.id).filter(Boolean);
      supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds)
        .in("role", ["admin", "super_admin"])
        .then(({ data }) => {
          if (data) {
            const map = new Map<string, "admin" | "super_admin">();
            data.forEach(r => {
              const existing = map.get(r.user_id);
              if (!existing || r.role === "super_admin") {
                map.set(r.user_id, r.role as "admin" | "super_admin");
              }
            });
            setMemberRoles(map);
          }
        });
    } else {
      if (!friendId || friendId.startsWith("system-")) return;
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", friendId)
        .in("role", ["admin", "super_admin"])
        .then(({ data }) => {
          if (data && data.length > 0) {
            const rolesList = data.map(r => r.role);
            if (rolesList.includes("super_admin")) setFriendRole("super_admin");
            else if (rolesList.includes("admin")) setFriendRole("admin");
            else setFriendRole("user");
          } else {
            setFriendRole("user");
          }
        });
    }
  }, [isGroup, groupMembers, friendId, meId]);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMountedRef = useRef(true);

  if (friendId !== prevFriendId) {
    setPrevFriendId(friendId);
    const myId = (typeof window !== "undefined" ? localStorage.getItem("jj_me_id") : null) || meId;
    if (friendId.startsWith("group-")) {
      const gId = friendId.substring(6);
      const cachedDetails = getCachedGroupDetails(gId);
      const cachedGroupMsgs = getCachedGroupMessages(gId);
      setGroup(cachedDetails || null);
      setFriend(null);
      setMessages(cachedGroupMsgs || []);
    } else {
      const cachedProfile = getCachedProfile(friendId);
      const cachedMsgs = myId ? getCachedMessages(myId, friendId) : [];
      setFriend(cachedProfile || null);
      setGroup(null);
      setMessages(cachedMsgs || []);
    }
    setCalls([]);
    setHasOlderMessages(false);
  }

  const getOfflineQueuedForCurrent = useCallback(() => {
    const queue = NetworkManager.getMessageQueue();
    return queue.filter(m => {
      if (m.is_page) return false;
      if (isGroup) {
        return m.group_id === groupId;
      } else {
        return m.receiver_id === friendId;
      }
    }).map(m => ({
      id: m.id,
      sender_id: m.sender_id,
      receiver_id: m.receiver_id,
      group_id: m.group_id,
      content: m.content,
      image_url: m.image_url,
      audio_url: m.audio_url,
      created_at: m.created_at,
      seen: false,
      delivered: false,
      queued: !m.failed,
      failed: !!m.failed
    }));
  }, [isGroup, groupId, friendId]);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!meId) return;
    // Soft resume must NOT reset scroll pin / opacity — that caused black flash.
    if (!opts?.soft) {
      isInitialLoadRef.current = true;
    }

    if (isGroup) {
      const cachedDetails = getCachedGroupDetails(groupId || "");
      let cachedGroupMsgs =
        (groupId ? await hydrateCachedGroupMessages(groupId) : null) ||
        getCachedGroupMessages(groupId || "");
      if (cachedGroupMsgs) {
        const sample = cachedGroupMsgs[0];
        if (sample && sample.group_id !== groupId) {
          localStorage.removeItem(`jj_group_msgs_${groupId}`);
          cachedGroupMsgs = null;
        }
      }
      if (cachedDetails) {
        setGroup(cachedDetails);
        setEditingGroupName(cachedDetails.name);
        setEditingGroupAvatar(cachedDetails.avatar_url || "");
      }
      if (cachedGroupMsgs) {
        setMessages(cachedGroupMsgs);
      }

      // ── Group Chat Hydration ──────────────────────────────────────
      try {
        const lastCachedMsg = cachedGroupMsgs && cachedGroupMsgs.length > 0 ? cachedGroupMsgs[cachedGroupMsgs.length - 1] : null;

        const [groupRes, membersRes] = await Promise.all([
          supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
          supabase.from("group_members").select("role, joined_at, profiles(id, username, first_name, last_name, avatar_url, online, last_seen, vip_status)").eq("group_id", groupId),
        ]);

        if (!isMountedRef.current) return;
        if (activeFriendIdRef.current !== friendId) return;

        if (groupRes.data) {
          setGroup(groupRes.data);
          setEditingGroupName(groupRes.data.name);
          setEditingGroupAvatar(groupRes.data.avatar_url || "");
          setCachedGroupDetails(groupId, groupRes.data);
        } else if (!cachedDetails) {
          toast.error("This group has been dismissed.");
          window.location.href = "/app/chat";
          return;
        }

        if (membersRes.data) {
          setGroupMembers(membersRes.data);
        }

        let finalMsgs: any[] = [];
        if (lastCachedMsg) {
          const { data: deltaMsgs } = await supabase
            .from("messages")
            .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
            .eq("group_id", groupId)
            .gt("created_at", lastCachedMsg.created_at)
            .order("created_at", { ascending: false });

          if (activeFriendIdRef.current !== friendId) return;
          const delta = (deltaMsgs ?? []).reverse();
          const combined = [...(cachedGroupMsgs || [])];
          delta.forEach((m) => {
            if (!combined.some((x) => x.id === m.id)) {
              combined.push(m);
            }
          });
          finalMsgs = combined;
        } else {
          const { data: msgsData } = await supabase
            .from("messages")
            .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
            .eq("group_id", groupId)
            .order("created_at", { ascending: false })
            .limit(50 + 1);

          if (activeFriendIdRef.current !== friendId) return;
          const rawMsgs = (msgsData ?? []) as any[];
          const hasMore = rawMsgs.length > 50;
          finalMsgs = rawMsgs.slice(0, 50).reverse();
          setHasOlderMessages(hasMore);
        }

        const queued = getOfflineQueuedForCurrent();
        setMessages([...finalMsgs, ...queued]);
        setCachedGroupMessages(groupId, finalMsgs);
        setCalls([]); // Group call logs placeholder

        // Mark messages as seen for group chat
        await supabase
          .from("messages")
          .update({ seen: true } as any)
          .eq("group_id", groupId)
          .neq("sender_id", meId)
          .eq("seen", false);
      } catch (err) {
        console.error("Error loading group chat:", err);
      }
      return;
    }

    const isSystem = friendId.startsWith("system-");
    if (isSystem) {
      if (friendId === "system-user-ai-chat") {
        const virtualFriend = {
          id: "system-user-ai-chat",
          username: "jackpotjungle_ai",
          first_name: "✨ Jackpot Jungle AI",
          last_name: "",
          avatar_url: null,
          online: true,
          last_seen: new Date().toISOString()
        } as any;
        setFriend(virtualFriend);
        if (typeof window !== "undefined") {
          try {
            const stored = localStorage.getItem(aiMessagesKey);
            if (stored) {
              setMessages(JSON.parse(stored));
            } else {
              const welcomeMsg = {
                id: "welcome-ai",
                sender_id: "system-user-ai-chat",
                receiver_id: meId || "user",
                content: "👋 Welcome to Jackpot Jungle!\n\nI'm your personal Jackpot Jungle Assistant.\n\nI can help you with bonuses, games, promotions, VIP rewards, deposits, withdrawals and anything related to the platform.",
                created_at: new Date().toISOString(),
                seen: true,
                delivered: true
              };
              setMessages([welcomeMsg]);
              localStorage.setItem(aiMessagesKey, JSON.stringify([welcomeMsg]));
              localStorage.setItem(aiLastMsgKey, welcomeMsg.content);
              localStorage.setItem(aiLastAtKey, welcomeMsg.created_at);
            }
          } catch {
            setMessages([]);
          }
        }
        setHasOlderMessages(false);
        setCalls([]);
        return;
      }

      const isRules = friendId === "system-rules-chat";
      const virtualFriend = {
        id: friendId,
        username: isRules ? "system_rules" : "system_updates",
        first_name: isRules ? "Rules" : "Updates",
        last_name: "",
        avatar_url: null,
        online: true,
        last_seen: new Date().toISOString()
      } as any;
      setFriend(virtualFriend);
      setMessages([]);

      try {
        const channelType = isRules ? "rules" : "updates";
        const { data: anns, error } = await supabase
          .from("system_announcements")
          .select("*")
          .eq("channel_type", channelType)
          .order("created_at", { ascending: true });
        
        if (error) throw error;
        if (!isMountedRef.current) return;
        if (activeFriendIdRef.current !== friendId) return;

        const converted = (anns ?? []).map(ann => ({
          id: ann.id,
          sender_id: ann.sender_id || "system",
          receiver_id: meId,
          content: ann.content,
          image_url: ann.image_url,
          audio_url: ann.audio_url,
          created_at: ann.created_at,
          seen: true,
          delivered: true
        }));
        setMessages(converted);
        setHasOlderMessages(false);

        const lastMsg = converted[converted.length - 1];
        if (lastMsg) {
          localStorage.setItem(isRules ? "jj_rules_last_read" : "jj_updates_last_read", lastMsg.created_at);
        }
      } catch (e: any) {
        console.error("Error loading system announcements:", e);
      }
      return;
    }

    // ── Local-first DM: paint local mirror → delta sync only ───────────
    const cachedProfile =
      (await hydrateCachedProfile(friendId)) || getCachedProfile(friendId);
    let cachedMsgs = await hydrateCachedMessages(meId, friendId);
    if (cachedMsgs) {
      const sample = cachedMsgs[0] as any;
      if (sample) {
        if (sample.group_id) {
          invalidateMessageCache(meId, friendId);
          cachedMsgs = null;
        } else {
          const involvesMe = sample.sender_id === meId || sample.receiver_id === meId;
          const involvesFriend = sample.sender_id === friendId || sample.receiver_id === friendId;
          if (!involvesMe || !involvesFriend) {
            invalidateMessageCache(meId, friendId);
            cachedMsgs = null;
          }
        }
      }
    }
    setFriend(cachedProfile || null);
    setMessages(cachedMsgs || []);

    const PAGE = 50;

    try {
      const [{ data: prof }, { data: spamRow }, { data: callRows }, syncResult] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, username, first_name, last_name, avatar_url, online, last_seen, friend_code, referral_code, phone, address, created_at, vip_status",
          )
          .eq("id", friendId)
          .maybeSingle(),
        supabase
          .from("spam_list")
          .select("id")
          .eq("user_id", friendId)
          .eq("spammed_user_id", meId)
          .maybeSingle(),
        supabase
          .from("calls")
          .select("id, caller_id, callee_id, call_type, status, duration_seconds, created_at")
          .or(
            `and(caller_id.eq.${meId},callee_id.eq.${friendId}),and(caller_id.eq.${friendId},callee_id.eq.${meId})`,
          )
          .eq("context", "friend")
          .order("created_at", { ascending: true })
          .limit(200),
        syncDmThread({
          meId,
          friendId,
          localMessages: (cachedMsgs as any) || [],
          pageSize: PAGE,
        }),
      ]);
      if (!isMountedRef.current) return;
      if (activeFriendIdRef.current !== friendId) return;

      const profile = prof as Profile | null;
      if (profile && spamRow) profile.online = false;
      if (profile) {
        setFriend(profile);
        setCachedProfile(friendId, profile);
      }

      const combined = syncResult.messages as Message[];
      const queued = getOfflineQueuedForCurrent();
      setMessages([...combined, ...queued]);
      setCachedMessages(meId, friendId, combined);
      setHasOlderMessages(syncResult.hasOlder || combined.length >= PAGE);
      setCalls(
        ((callRows ?? []) as CallRow[]).filter(
          (c) => c.status !== "ringing" && c.status !== "active",
        ),
      );

      // Opening a thread: mark delivered for anything still undelivered, then seen.
      await supabase
        .from("messages")
        .update({ delivered: true } as any)
        .eq("sender_id", friendId)
        .eq("receiver_id", meId)
        .eq("delivered", false);
      await supabase
        .from("messages")
        .update({ seen: true, delivered: true } as any)
        .eq("sender_id", friendId)
        .eq("receiver_id", meId)
        .eq("seen", false);
    } catch (err) {
      console.error("Error fetching chat data:", err);
      // Keep locally painted messages visible offline.
    }
  }, [friendId, meId]);

  useEffect(() => {
    isMountedRef.current = true;
    load();
    const onForeground = () => {
      if (isMountedRef.current) void load({ soft: true });
    };
    window.addEventListener("jj-app-foreground", onForeground);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener("jj-app-foreground", onForeground);
    };
  }, [load]);

  // friendId changes already recreate `load` — do not call load() again here
  // (that caused a double network hydrate on every conversation open).

  useEffect(() => {
    if (!isGroup && meId && friendId && messages.length > 0) {
      const sample = messages[0];
      if (sample) {
        if (sample.group_id) return;
        const involvesMe = sample.sender_id === meId || sample.receiver_id === meId;
        const involvesFriend = sample.sender_id === friendId || sample.receiver_id === friendId;
        if (!involvesMe || !involvesFriend) return;
      }
      const persistent = messages.filter(m => m.id && typeof m.id === "string" && !m.id.startsWith("temp-") && !m.failed);
      if (persistent.length > 0) {
        setCachedMessages(meId, friendId, persistent);
      }
    }
  }, [messages, isGroup, meId, friendId]);

  // Messenger-style: warm local cache so reopening the thread paints media instantly.
  useEffect(() => {
    prefetchChatMedia(
      messages.flatMap((m) => [
        m.image_url ? toCDNUrl(m.image_url) : null,
        m.audio_url ? toCDNUrl(m.audio_url) : null,
      ]),
    );
  }, [messages]);

  useEffect(() => {
    if (isGroup && groupId && messages.length > 0) {
      const sample = messages[0];
      if (sample && sample.group_id !== groupId) return;
      const persistent = messages.filter(m => m.id && typeof m.id === "string" && !m.id.startsWith("temp-") && !m.failed);
      if (persistent.length > 0) {
        setCachedGroupMessages(groupId, persistent);
      }
    }
  }, [messages, isGroup, groupId]);

  // Load 50 older messages above the current batch
  async function loadOlderMessages() {
    if (!meId || loadingOlder || !hasOlderMessages) return;
    setLoadingOlder(true);
    const oldest = messages[0]?.created_at;
    const PAGE = 50;
    const query = supabase
      .from("messages")
      .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);

    if (isGroup) {
      query.eq("group_id", groupId);
    } else {
      query.or(`and(sender_id.eq.${meId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${meId})`);
    }

    if (oldest) query.lt("created_at", oldest);
    const { data } = await query;
    const rows = (data ?? []) as any[];
    const hasMore = rows.length > PAGE;
    const batch = rows.slice(0, PAGE).reverse();
    // Preserve scroll position: remember height before adding messages
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setMessages((prev) => [...batch, ...prev]);
    setHasOlderMessages(hasMore);
    setLoadingOlder(false);
    // After render, restore scroll so user stays at same position
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  const activeFriendIdRef = useRef(friendId);
  useEffect(() => {
    activeFriendIdRef.current = friendId;
  }, [friendId]);

  useEffect(() => {
    if (!meId) return;

    const rand = Math.random().toString(36).slice(2, 9);
    const isSystem = friendId.startsWith("system-");

    if (isSystem) {
      const channelType = friendId === "system-rules-chat" ? "rules" : "updates";
      const annChannel = supabase
        .channel(`chat-active-announcements-${rand}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_announcements", filter: `channel_type=eq.${channelType}` }, (payload) => {
          const ann = payload.new as any;
          if (ann) {
            const m = {
              id: ann.id,
              sender_id: ann.sender_id || "system",
              receiver_id: meId,
              content: ann.content,
              image_url: ann.image_url,
              audio_url: ann.audio_url,
              created_at: ann.created_at,
              seen: true,
              delivered: true
            } as any;
            setMessages((prev) => {
              if (prev.some((x) => x.id === m.id)) return prev;
              const next = [...prev, m];
              localStorage.setItem(channelType === "rules" ? "jj_rules_last_read" : "jj_updates_last_read", m.created_at);
              return next;
            });
          }
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "system_announcements", filter: `channel_type=eq.${channelType}` }, (payload) => {
          const old = payload.old as any;
          if (old) {
            setMessages((prev) => prev.filter(x => x.id !== old.id));
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(annChannel);
      };
    }

    const involvesGroupMsg = (m: any) => {
      const currentFriendId = activeFriendIdRef.current;
      const isCurrGroup = currentFriendId.startsWith("group-");
      if (isCurrGroup) {
        const currGroupId = currentFriendId.substring(6);
        return m.group_id === currGroupId;
      }
      return !m.group_id && (
        (m.sender_id === meId && m.receiver_id === currentFriendId) ||
        (m.sender_id === currentFriendId && m.receiver_id === meId)
      );
    };
    const msgChannel = supabase
      .channel(`chat-active-friend-global-${rand}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as any;
        if (!m) return;
        if (!m.group_id && m.sender_id !== meId && m.receiver_id !== meId) return;
        const involves = involvesGroupMsg(m);

        if (involves) {
          // If we receive a message in real-time, we want to ensure its sender relation is resolved or loaded
          // To keep it simple, we can fetch the sender details and merge it, or resolve from groupMembers,
          // or just append the message and trigger a background fetch if sender name is missing.
          // Let's resolve the sender details from groupMembers if present:
          const cachedSender = groupMembers.find(member => member.profiles?.id === m.sender_id)?.profiles;
          const mappedMsg = {
            ...m,
            sender: cachedSender ? {
              id: cachedSender.id,
              username: cachedSender.username,
              first_name: cachedSender.first_name || null,
              last_name: cachedSender.last_name || null,
              avatar_url: cachedSender.avatar_url || null
            } : null
          };

          setMessages((prev) => {
            const exactIdx = prev.findIndex((x) => x.id === m.id);
            if (exactIdx >= 0) {
              const copy = prev.slice();
              copy[exactIdx] = { ...copy[exactIdx], ...mappedMsg, queued: false, failed: false, delivered: true };
              return copy;
            }
            const idx = prev.findIndex((x) =>
              x.id && typeof x.id === "string" && x.id.startsWith("temp-") &&
              x.sender_id === m.sender_id &&
              (x.content ?? null) === (m.content ?? null) &&
              (x.image_url ?? null) === (m.image_url ?? null) &&
              (x.audio_url ?? null) === (m.audio_url ?? null)
            );
            if (idx >= 0) {
              const copy = prev.slice();
              copy[idx] = { ...copy[idx], ...mappedMsg, queued: false, failed: false, delivered: true };
              return copy;
            }
            return [...prev, mappedMsg];
          });
          
          // Delivered = reached device; seen = thread is open/focused.
          if (m.group_id) {
            if (m.sender_id !== meId) {
              const focused = document.visibilityState === "visible";
              supabase
                .from("messages")
                .update((focused ? { seen: true, delivered: true } : { delivered: true }) as any)
                .eq("id", m.id)
                .then();
            }
          } else if (m.receiver_id === meId) {
            const focused = document.visibilityState === "visible";
            supabase
              .from("messages")
              .update((focused ? { seen: true, delivered: true } : { delivered: true }) as any)
              .eq("id", m.id)
              .then();
          }
        } else if (!m.group_id && meId) {
          const otherFid = m.sender_id === meId ? m.receiver_id : m.sender_id;
          if (otherFid) {
            void applyRealtimeMessageToLocal(dmConvKey(meId, otherFid), m, "INSERT").then((next) => {
              setCachedMessages(meId, otherFid, next as any);
            });
          }
        }
        if (involves && meId) {
          const key = m.group_id
            ? `group-${m.group_id}`
            : dmConvKey(meId, m.sender_id === meId ? m.receiver_id : m.sender_id);
          void applyRealtimeMessageToLocal(key, m, "INSERT");
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as any;
        if (!m) return;
        if (!m.group_id && m.sender_id !== meId && m.receiver_id !== meId) return;
        const involves = involvesGroupMsg(m);

        if (involves) {
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
          if (meId) {
            const key = m.group_id
              ? `group-${m.group_id}`
              : dmConvKey(meId, friendId);
            void applyRealtimeMessageToLocal(key, m, "UPDATE");
          }
        } else if (!m.group_id && meId) {
          const otherFid = m.sender_id === meId ? m.receiver_id : m.sender_id;
          if (otherFid) {
            void applyRealtimeMessageToLocal(dmConvKey(meId, otherFid), m, "UPDATE").then((next) => {
              setCachedMessages(meId, otherFid, next as any);
            });
          }
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.old as any;
        if (!m?.id) return;
        const involves = involvesGroupMsg(m);
        if (involves) {
          setMessages((prev) => prev.filter((x) => x.id !== m.id));
          if (meId) {
            const key = m.group_id
              ? `group-${m.group_id}`
              : dmConvKey(meId, friendId);
            void applyRealtimeMessageToLocal(key, m, "DELETE");
          }
        } else if (!m.group_id && meId) {
          const otherFid = m.sender_id === meId ? m.receiver_id : m.sender_id;
          if (otherFid) {
            void applyRealtimeMessageToLocal(dmConvKey(meId, otherFid), m, "DELETE").then((next) => {
              setCachedMessages(meId, otherFid, next as any);
            });
          }
        }
      })
      .subscribe();

    const groupMemberChannel = supabase
      .channel(`active-group-members-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: isGroup ? `group_id=eq.${groupId}` : undefined }, async (payload) => {
        if (!isMountedRef.current || !isGroup) return;
        const newRow = payload.new as any;
        const oldRow = payload.old as any;

        if (payload.eventType === "DELETE" && oldRow) {
          setGroupMembers((prev) => prev.filter((m) => m.profiles?.id !== oldRow.user_id));
        } else if (payload.eventType === "INSERT" && newRow) {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("id, username, first_name, last_name, avatar_url, online, last_seen, vip_status")
              .eq("id", newRow.user_id)
              .maybeSingle();
            
            if (prof && isMountedRef.current) {
              setGroupMembers((prev) => {
                if (prev.some((m) => m.profiles?.id === prof.id)) return prev;
                return [...prev, { role: newRow.role, joined_at: newRow.joined_at, profiles: prof }];
              });
            }
          } catch (e) {
            console.error("Error fetching group member profile on insert:", e);
          }
        } else if (payload.eventType === "UPDATE" && newRow) {
          setGroupMembers((prev) =>
            prev.map((m) =>
              m.profiles?.id === newRow.user_id ? { ...m, role: newRow.role } : m
            )
          );
        }
      })
      .subscribe();

    const groupChannel = supabase
      .channel(`active-groups-${rand}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "groups", filter: isGroup ? `id=eq.${groupId}` : undefined }, (payload) => {
        if (!isMountedRef.current || !isGroup) return;
        const newRow = payload.new as any;
        if (newRow) {
          setGroup(newRow);
          setEditingGroupName(newRow.name);
          setEditingGroupAvatar(newRow.avatar_url || "");
          setCachedGroupDetails(groupId, newRow);
        }
      })
      .subscribe();

    const profileChannel = supabase
      .channel(`chat-active-profile-${rand}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: isGroup ? undefined : `id=eq.${friendId}` }, (payload) => {
        if (!isMountedRef.current || isGroup) return;
        const p = payload.new as any;
        if (p) {
          setFriend((prev) => {
            if (!prev) return p;
            const changed = prev.online !== p.online || prev.avatar_url !== p.avatar_url || prev.vip_status !== p.vip_status || prev.username !== p.username || prev.last_seen !== p.last_seen;
            return changed ? { ...prev, ...p } : prev;
          });
        }
      })
      .subscribe();

    // Stable channel name so both peers share the same realtime topic (Messenger-style).
    const typingTopic = isGroup && groupId
      ? `typing-group-${groupId}`
      : `typing-dm-${[meId, friendId].sort().join("-")}`;
    const typingChannel = supabase
      .channel(typingTopic, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        const data = payload.payload as { from: string; to: string; fromUsername?: string };
        if (!data || data.from === meId) return;
        const targetsMe = isGroup
          ? data.to === groupId || data.to === `group-${groupId}`
          : data.to === meId;
        if (!targetsMe) return;
        void import("@/lib/local-db").then(({ localDbSetTyping }) =>
          localDbSetTyping(typingTopic, {
            userId: data.from,
            at: new Date().toISOString(),
          }),
        );
        if (isGroup) {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.add(data.fromUsername || "Someone");
            return next;
          });
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUsers(new Set()), 2500);
        } else {
          setFriendTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setFriendTyping(false), 2500);
        }
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    const callsChannel = supabase
      .channel(`calls-active-friend-global-${rand}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        if (isGroup) return;
        const row = (payload.new ?? payload.old) as CallRow & { context?: string };
        if (!row || (row as any).context !== "friend") return;
        
        const currentFriendId = activeFriendIdRef.current;
        const involves = (row.caller_id === meId && row.callee_id === currentFriendId) || 
                         (row.caller_id === currentFriendId && row.callee_id === meId);
                         
        if (!involves) return;
        if (row.status === "ringing" || row.status === "active") return;
        
        setCalls((prev) => {
          const exists = prev.some((c) => c.id === row.id);
          if (exists) return prev.map((c) => (c.id === row.id ? (row as CallRow) : c));
          return [...prev, row as CallRow];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(groupMemberChannel);
      supabase.removeChannel(groupChannel);
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(callsChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [meId, friendId]);

  const lastMsgCountRef = useRef(0);
  const lastFriendIdRef = useRef<string | null>(null);

  const pinThreadToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, []);

  // Messenger: open already at latest messages — no top→bottom scroll animation.
  useLayoutEffect(() => {
    const prevCount = lastMsgCountRef.current;
    lastMsgCountRef.current = messages.length;
    const switched = friendId !== lastFriendIdRef.current;

    if (switched) {
      lastFriendIdRef.current = friendId;
      isInitialLoadRef.current = true;
      setThreadPinned(false);
      lastMsgCountRef.current = messages.length;
    }

    if (messages.length === 0 && calls.length === 0) {
      setThreadPinned(true);
      isInitialLoadRef.current = false;
      return;
    }

    if (isInitialLoadRef.current || switched) {
      pinThreadToBottom(false);
      requestAnimationFrame(() => pinThreadToBottom(false));
      isInitialLoadRef.current = false;
      setThreadPinned(true);
      return;
    }

    const lastMsg = messages[messages.length - 1];
    const isMine = lastMsg?.sender_id === meId;
    const isSingleNewMessage = messages.length === prevCount + 1;

    if (isSingleNewMessage && (isMine || isNearBottomRef.current)) {
      pinThreadToBottom(true);
      setShowScrollToBottom(false);
    } else if (friendTyping && isNearBottomRef.current) {
      pinThreadToBottom(false);
    } else if (isNearBottomRef.current) {
      pinThreadToBottom(false);
      setShowScrollToBottom(false);
    } else if (isSingleNewMessage) {
      setShowScrollToBottom(true);
    }
  }, [messages, calls, friendTyping, friendId, meId, pinThreadToBottom]);

  useEffect(() => {
    if (friend) {
      // Small timeout to allow input element to mount fully
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [friendId, friend]);

  useEffect(() => {
    const handleQueueChange = () => {
      const queued = getOfflineQueuedForCurrent();
      setMessages((prev) => {
        const withoutQueued = prev.filter((m) => !queued.some((q) => q.id === m.id));
        return [...withoutQueued, ...queued];
      });
    };

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { id, finalImageUrl, finalAudioUrl } = customEvent.detail;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === id
            ? {
                ...msg,
                queued: false,
                failed: false,
                delivered: true,
                image_url: finalImageUrl || msg.image_url,
                audio_url: finalAudioUrl || msg.audio_url
              }
            : msg
        )
      );
    };

    window.addEventListener("jj-queue-updated", handleQueueChange);
    window.addEventListener("jj-queue-processed", handleQueueChange);
    window.addEventListener("jj-message-synchronized", handleSync);
    return () => {
      window.removeEventListener("jj-queue-updated", handleQueueChange);
      window.removeEventListener("jj-queue-processed", handleQueueChange);
      window.removeEventListener("jj-message-synchronized", handleSync);
    };
  }, [getOfflineQueuedForCurrent]);

  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [confirmPinTarget, setConfirmPinTarget] = useState<string | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<string | null>(null);
  const [showAllPins, setShowAllPins] = useState(false);
  const [unsendTarget, setUnsendTarget] = useState<string | null>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isNear = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    isNearBottomRef.current = isNear;
    if (isNear && showScrollToBottom) {
      setShowScrollToBottom(false);
    }
  };

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [deletedForMeIds, setDeletedForMeIds] = useState<Set<string>>(new Set());
  const [showDeleteBottomSheet, setShowDeleteBottomSheet] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // One-time mobile check — avoid resize listener (keyboard triggers it on Android)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMobile(window.innerWidth < 768);
  }, []);

  const [forwardTargetMsg, setForwardTargetMsg] = useState<Message | null>(null);
  const [forwardCandidates, setForwardCandidates] = useState<Array<{ id: string; name: string; avatar: string | null; type: "friend" | "page" }>>([]);
  const [forwardingTargetId, setForwardingTargetId] = useState<string | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");

  useEffect(() => {
    if (!forwardTargetMsg || !meId) return;
    (async () => {
      const { data: fr } = await supabase.from("friendships").select("user_a, user_b");
      const fids = (fr ?? []).map((f) => (f.user_a === meId ? f.user_b : f.user_a));
      let list: Array<{ id: string; name: string; avatar: string | null; type: "friend" | "page" }> = [];
      
      list.push({ id: "support-page", name: "Jackpot Jungle Support", avatar: null, type: "page" });

      if (fids.length > 0) {
        const { data: fprofs } = (await supabase
          .from("profiles")
          .select("id, username, avatar_url, first_name, last_name" as any)
          .in("id", fids)) as { data: any[] | null; error: any };
        
        (fprofs ?? []).forEach((p) => {
          const displayName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username;
          list.push({ id: p.id, name: displayName, avatar: p.avatar_url, type: "friend" });
        });
      }
      setForwardCandidates(list);
    })();
  }, [forwardTargetMsg, meId]);

  async function executeForward(target: typeof forwardCandidates[0]) {
    if (!forwardTargetMsg || !meId) return;
    setForwardingTargetId(target.id);
    try {
      const contentPrefix = "[system:forwarded] ";
      let newContent = forwardTargetMsg.content;
      if (newContent) {
        if (!newContent.startsWith("[system:forwarded]")) {
          newContent = contentPrefix + newContent;
        }
      } else {
        newContent = "[system:forwarded]";
      }

      if (target.type === "page") {
        let { data: conv } = await supabase.from("page_conversations").select("id").eq("user_id", meId).maybeSingle();
        if (!conv) {
          const ins = await supabase.from("page_conversations").insert({ user_id: meId }).select("id").single();
          conv = ins.data;
        }
        if (!conv) throw new Error("Could not find or create support conversation");

        const { error } = await supabase.from("page_messages").insert({
          conversation_id: conv.id,
          sender_id: meId,
          from_page: false,
          content: newContent,
          image_url: forwardTargetMsg.image_url,
          audio_url: forwardTargetMsg.audio_url
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("messages").insert({
          sender_id: meId,
          receiver_id: target.id,
          content: newContent,
          image_url: forwardTargetMsg.image_url,
          audio_url: forwardTargetMsg.audio_url
        } as any);
        if (error) throw error;
      }
      toast.success(`Message forwarded to ${target.name}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to forward message");
    } finally {
      setForwardingTargetId(null);
      setForwardTargetMsg(null);
    }
  }

  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
      setDeletedForMeIds(new Set(Array.isArray(list) ? list : []));
    } catch {
      setDeletedForMeIds(new Set());
    }
  }, []);

  const deleteForMe = (ids: string[]) => {
    try {
      const nextList = JSON.parse(localStorage.getItem("jj_deleted_messages") || "[]");
      const nextSet = new Set<string>([...(Array.isArray(nextList) ? nextList : []), ...ids]);
      localStorage.setItem("jj_deleted_messages", JSON.stringify(Array.from(nextSet)));
      setDeletedForMeIds(nextSet);
    } catch {
      const nextSet = new Set<string>(ids);
      localStorage.setItem("jj_deleted_messages", JSON.stringify(ids));
      setDeletedForMeIds(nextSet);
    }
  };

  const parsedMessages = useMemo(() => {
    const visible: Array<Message & {
      reactions: Record<string, string[]>;
      replyTo?: { id: string; senderName: string; text: string };
      isPinned: boolean;
      isSystemPin?: boolean;
      isSystemUnpin?: boolean;
      isUnsent?: boolean;
      isForwarded?: boolean;
    }> = [];

    const reactionMap: Record<string, Record<string, string[]>> = {};
    const pinSet = new Set<string>();

    for (const m of messages) {
      if (deletedForMeIds.has(m.id)) continue;
      if (m.content?.startsWith("[system:reaction:")) {
        const parts = m.content.split(":");
        const msgId = parts[2];
        const emoji = parts[3];
        const senderId = parts[4]?.replace("]", "");
        if (msgId && emoji && senderId) {
          if (!reactionMap[msgId]) reactionMap[msgId] = {};
          if (!reactionMap[msgId][emoji]) reactionMap[msgId][emoji] = [];
          const idx = reactionMap[msgId][emoji].indexOf(senderId);
          if (idx >= 0) {
            reactionMap[msgId][emoji].splice(idx, 1);
          } else {
            for (const key of Object.keys(reactionMap[msgId])) {
              reactionMap[msgId][key] = reactionMap[msgId][key].filter(uid => uid !== senderId);
            }
            if (!reactionMap[msgId][emoji]) reactionMap[msgId][emoji] = [];
            reactionMap[msgId][emoji].push(senderId);
          }
        }
      } else if (m.content?.startsWith("[system:pin:")) {
        const parts = m.content.split(":");
        const msgId = parts[2]?.replace("]", "");
        if (msgId) pinSet.add(msgId);
      } else if (m.content?.startsWith("[system:unpin:")) {
        const parts = m.content.split(":");
        const msgId = parts[2]?.replace("]", "");
        if (msgId) pinSet.delete(msgId);
      }
    }

    for (const m of messages) {
      if (deletedForMeIds.has(m.id)) continue;
      if (m.content === "[system:unsent]") {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isUnsent: true,
        });
        continue;
      }

      if (m.content?.startsWith("[system:reaction:")) continue;

      if (m.content?.startsWith("[system:group_created]")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemGroupCreated: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_left:")) {
        const leftName = m.content.slice(18, -1);
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserLeft: true,
          systemLeftName: leftName,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_joined:")) {
        const joinedName = m.content.slice(20, -1);
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserJoined: true,
          systemJoinedName: joinedName,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:ownership_transferred:")) {
        const targetName = m.content.slice(30, -1);
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemOwnershipTransferred: true,
          systemOwnershipTarget: targetName,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:group_name_changed:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemGroupNameChanged: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:group_avatar_changed:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemGroupAvatarChanged: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_removed:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserRemoved: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_promoted:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserPromoted: true,
        } as any);
        continue;
      }
      if (m.content?.startsWith("[system:user_added:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUserAdded: true,
        } as any);
        continue;
      }

      if (m.content?.startsWith("[system:pin:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemPin: true,
        });
        continue;
      }

      if (m.content?.startsWith("[system:unpin:")) {
        visible.push({
          ...m,
          reactions: {},
          isPinned: false,
          isSystemUnpin: true,
        });
        continue;
      }

      let replyTo: any = undefined;
      let cleanContent = m.content;
      let isForwarded = false;

      if (cleanContent?.startsWith("[system:forwarded] ")) {
        isForwarded = true;
        cleanContent = cleanContent.slice("[system:forwarded] ".length);
      } else if (cleanContent?.startsWith("[system:forwarded]")) {
        isForwarded = true;
        cleanContent = cleanContent.slice("[system:forwarded]".length).trim() || null;
      } else if (cleanContent === "[system:forwarded]") {
        isForwarded = true;
        cleanContent = null;
      }

      if (cleanContent?.startsWith("[reply:")) {
        const match = cleanContent.match(/^\[reply:([^:]+):([^:]+):([^\]]*)\]\s*([\s\S]*)/);
        if (match) {
          const [_, targetId, senderName, text, actualText] = match;
          replyTo = { id: targetId, senderName, text };
          cleanContent = actualText;
        }
      }

      visible.push({
        ...m,
        content: cleanContent,
        reactions: reactionMap[m.id] || {},
        replyTo,
        isPinned: pinSet.has(m.id),
        isForwarded,
      });
    }

    return visible;
  }, [messages]);

  const allSelectedAreMine = useMemo(() => {
    if (selectedMsgs.size === 0) return false;
    for (const id of selectedMsgs) {
      const msg = parsedMessages.find(x => x.id === id);
      if (!msg || msg.sender_id !== meId) return false;
    }
    return true;
  }, [selectedMsgs, parsedMessages, meId]);

  const pinnedMessages = useMemo(() => {
    return parsedMessages.filter(m => m.isPinned);
  }, [parsedMessages]);

  const scrollToMessage = (msgId: string) => {
    const el = msgRefs.current[msgId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/20", "transition-colors", "duration-500", "rounded-2xl");
      setTimeout(() => {
        el.classList.remove("bg-primary/20");
      }, 2000);
    }
  };

  async function reactToMessage(msgId: string, emoji: string) {
    if (!meId) return;
    const reactionContent = `[system:reaction:${msgId}:${emoji}:${meId}]`;
    const insertObj: any = {
      sender_id: meId,
      content: reactionContent,
      seen: true,
      delivered: true,
    };
    if (isGroup) insertObj.group_id = groupId;
    else insertObj.receiver_id = friendId;

    const { data, error } = await supabase.from("messages").insert(insertObj).select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)").single();
    if (error) {
      toast.error("Failed to update reaction");
    } else {
      setMessages(prev => [...prev, data as any]);
    }
  }

  async function pinMessage(msgId: string) {
    if (!meId) return;
    const pinContent = `[system:pin:${msgId}]`;
    const insertObj: any = {
      sender_id: meId,
      content: pinContent,
      seen: true,
      delivered: true,
    };
    if (isGroup) insertObj.group_id = groupId;
    else insertObj.receiver_id = friendId;

    const { data, error } = await supabase.from("messages").insert(insertObj).select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)").single();
    if (error) {
      toast.error("Failed to pin message");
    } else {
      setMessages(prev => [...prev, data as any]);
      toast.success("Message pinned");
    }
  }

  async function unpinMessage(msgId: string) {
    if (!meId) return;
    const unpinContent = `[system:unpin:${msgId}]`;
    const insertObj: any = {
      sender_id: meId,
      content: unpinContent,
      seen: true,
      delivered: true,
    };
    if (isGroup) insertObj.group_id = groupId;
    else insertObj.receiver_id = friendId;

    const { data, error } = await supabase.from("messages").insert(insertObj).select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)").single();
    if (error) {
      toast.error("Failed to unpin message");
    } else {
      setMessages(prev => [...prev, data as any]);
      toast.success("Message unpinned");
    }
  }

  const handleSelect = useCallback((id: string) => {
    setSelectedMsgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleReact = useCallback((id: string, emoji: string) => {
    reactToMessage(id, emoji);
  }, [meId, friendId]);

  const handlePin = useCallback((id: string) => {
    setConfirmPinTarget(id);
  }, []);

  const handleUnpin = useCallback((id: string) => {
    unpinMessage(id);
  }, [meId, friendId]);

  const handleReply = useCallback((m: any) => {
    setReplyingTo(m);
  }, []);

  const handleCopy = useCallback((text: string) => {
    void copyChatMessage({ content: text });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedMsgs(new Set([id]));
  }, []);

  const handleForward = useCallback((m: any) => {
    const note = prompt("Forward this message to:");
    if (note) toast.success("Forwarded message successfully");
  }, []);

  const handlePreviewImage = useCallback((url: string) => {
    setPreview(url);
  }, []);

  const handleMenuOpen = useCallback((id: string) => {
    setActiveMsgMenu(id);
  }, []);

  async function handleLeaveGroup() {
    if (!meId || !groupId) return;

    // Redundant window.confirm bypass for regular users (if !isAdmin && !isSuperAdmin).
    // Admins/Super Admins on the chat page still use the browser confirm.
    if (isAdmin || isSuperAdmin) {
      const confirmLeave = window.confirm("Are you sure you want to leave this group?");
      if (!confirmLeave) return;
    }

    try {
      // 1. Fetch current members of the group to check counts and roles
      const { data: membersRes } = await supabase
        .from("group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", groupId);

      const membersList = membersRes ?? [];
      const remaining = membersList.filter(m => m.user_id !== meId);

      // 2. If no remaining members, dismiss the group entirely!
      if (remaining.length === 0) {
        await supabase.from("group_members").delete().eq("group_id", groupId);
        await supabase.from("messages").delete().eq("group_id", groupId);
        await supabase.from("groups").delete().eq("id", groupId);

        toast.success("You left. Group has been dismissed.");
        window.location.href = "/app/chat";
        return;
      }

      // 3. Check if the leaving user is the group administrator
      const leavingMember = membersList.find(m => m.user_id === meId);
      const wasAdmin = leavingMember?.role === "admin";

      if (wasAdmin) {
        // If there's no other group administrator left among the remaining members
        const hasOtherAdmin = remaining.some(m => m.role === "admin");
        if (!hasOtherAdmin) {
          // Priority 1: Find earliest joined app-level administrator/super administrator
          const remainingUserIds = remaining.map(m => m.user_id);
          const { data: appRoles } = await supabase
            .from("user_roles")
            .select("user_id, role")
            .in("user_id", remainingUserIds);

          const eligibleAdminIds = new Set(
            (appRoles ?? [])
              .filter(r => r.role === "admin" || r.role === "super_admin")
              .map(r => r.user_id)
          );

          const sortedRemaining = [...remaining].sort((a, b) =>
            new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
          );

          const eligibleAdmins = sortedRemaining.filter(m => eligibleAdminIds.has(m.user_id));

          let newAdminId = "";
          if (eligibleAdmins.length > 0) {
            newAdminId = eligibleAdmins[0].user_id;
          } else {
            // Priority 2: Automatically promote the earliest remaining group member
            newAdminId = sortedRemaining[0].user_id;
          }

          if (newAdminId) {
            // Update role to admin
            await supabase
              .from("group_members")
              .update({ role: "admin" } as any)
              .eq("group_id", groupId)
              .eq("user_id", newAdminId);

            // Get profile's display name
            const { data: profile } = await supabase
              .from("profiles")
              .select("username, first_name, last_name")
              .eq("id", newAdminId)
              .single();

            const targetDisplayName = profile
              ? (profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username)
              : "Someone";

            // Insert ownership transferred message
            await supabase.from("messages").insert({
              group_id: groupId,
              sender_id: meId,
              content: `[system:ownership_transferred:${targetDisplayName}]`
            } as any);
          }
        }
      }

      // 4. Create the system user_left message BEFORE deleting the membership
      await supabase.from("messages").insert({
        sender_id: meId,
        group_id: groupId,
        content: `[system:user_left:${myUsername}]`
      } as any);

      // 5. Delete leaving member's entry
      const { error: deleteErr } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", meId);

      if (deleteErr) throw deleteErr;

      toast.success("You left the group");
      window.location.href = "/app/chat";
    } catch (err: any) {
      toast.error(err.message || "Failed to leave group");
    }
  }

  async function handleUpdateGroupName(newName: string) {
    if (!groupId || !meId || !newName.trim()) return;
    try {
      const { error } = await supabase
        .from("groups")
        .update({ name: newName.trim() })
        .eq("id", groupId);

      if (error) throw error;

      await supabase
        .from("messages")
        .insert({
          sender_id: meId,
          group_id: groupId,
          content: `[system:group_name_changed:${newName.trim()}:${myUsername}]`
        } as any);

      toast.success("Group name updated");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to rename group");
    }
  }

  async function handleUpdateGroupAvatar(newAvatarUrl: string) {
    if (!groupId || !meId) return;
    try {
      const { error } = await supabase
        .from("groups")
        .update({ avatar_url: newAvatarUrl.trim() || "/groop.png" })
        .eq("id", groupId);

      if (error) throw error;

      await supabase
        .from("messages")
        .insert({
          sender_id: meId,
          group_id: groupId,
          content: `[system:group_avatar_changed:${myUsername}]`
        } as any);

      toast.success("Group photo updated");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update group photo");
    }
  }

  async function handleRemoveMember(memberId: string, memberUsername: string) {
    setMemberToRemove({ id: memberId, username: memberUsername });
  }

  async function confirmExecuteRemoveMember() {
    if (!groupId || !meId || !memberToRemove) return;
    const { id: memberId, username: memberUsername } = memberToRemove;
    setMemberToRemove(null);

    try {
      if (memberId === "support-page-temp") {
        const { data: adminRows } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "super_admin"]);
        
        const adminIds = (adminRows ?? []).map(r => r.user_id);
        
        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .in("user_id", adminIds);

        if (error) throw error;

        await supabase
          .from("messages")
          .insert({
            sender_id: meId,
            group_id: groupId,
            content: `[system:user_removed:Jackpot Jungle:${myUsername}]`
          } as any);
      } else {
        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", memberId);

        if (error) throw error;

        await supabase
          .from("messages")
          .insert({
            sender_id: meId,
            group_id: groupId,
            content: `[system:user_removed:${memberUsername}:${myUsername}]`
          } as any);
      }

      toast.success("Member removed");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    }
  }

  async function handlePromoteMember(memberId: string, memberUsername: string) {
    if (!groupId || !meId) return;
    try {
      const { error } = await supabase
        .from("group_members")
        .update({ role: "admin" })
        .eq("group_id", groupId)
        .eq("user_id", memberId);

      if (error) throw error;

      await supabase
        .from("messages")
        .insert({
          sender_id: meId,
          group_id: groupId,
          content: `[system:user_promoted:${memberUsername}:${myUsername}]`
        } as any);

      toast.success("Member promoted to admin");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to promote member");
    }
  }

  function handleOpenAddMembers() {
    setAddMembersOpen(true);
  }

  const debouncedDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onDraftChange(v: string, selectionStart?: number) {
    setDraft(friendId, v);
    if (debouncedDraftTimerRef.current) clearTimeout(debouncedDraftTimerRef.current);
    debouncedDraftTimerRef.current = setTimeout(() => {
      handleDraftChange(v);
      if (isGroup && selectionStart !== undefined && v.includes("@")) {
        handleMentionCheck(v, selectionStart);
      } else if (mentionSearch !== null) {
        setMentionSearch(null);
      }
    }, 120);

    const now = Date.now();
    if (typingChannelRef.current && meId && now - lastTypingSentRef.current > 2500) {
      lastTypingSentRef.current = now;
      typingChannelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: {
          from: meId,
          // Peer listens for to === their user id (DM) or group id (group).
          to: isGroup ? groupId : friendId,
          fromUsername: myUsername
        }
      });
    }
  }

  function addOptimistic(partial: Partial<Message>, customId?: string): string {
    const tempId = customId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Message = {
      id: tempId,
      sender_id: meId!,
      receiver_id: isGroup ? null : friendId,
      content: null,
      image_url: null,
      audio_url: null,
      seen: false,
      delivered: false,
      created_at: new Date().toISOString(),
      ...partial,
    } as any;
    if (isGroup) {
      (optimistic as any).group_id = groupId;
      (optimistic as any).sender = {
        id: meId,
        username: myUsername,
        first_name: user?.user_metadata?.first_name || null,
        last_name: user?.user_metadata?.last_name || null,
        avatar_url: user?.user_metadata?.avatar_url || null
      };
    }
    setMessages((prev) => [...prev, optimistic]);
    return tempId;
  }

  const streamAIResponse = (assistantText: string, assistantId: string) => {
    let currentText = "";
    const words = assistantText.split(/(\s+)/);
    let index = 0;
    
    const interval = setInterval(() => {
      if (index >= words.length) {
        clearInterval(interval);
        return;
      }
      
      currentText += words[index];
      index++;
      
      setMessages((prev) => {
        const updated = prev.map((msg) => {
          if (msg.id === assistantId) {
            return { ...msg, content: currentText };
          }
          return msg;
        });
        localStorage.setItem(aiMessagesKey, JSON.stringify(updated));
        localStorage.setItem(aiLastMsgKey, currentText);
        return updated;
      });

      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 25);
  };

  const submitToAI = useCallback(async (content: string) => {
    if (!meId) return;
    
    const userMsg = {
      id: `user-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender_id: meId,
      receiver_id: "system-user-ai-chat",
      content: content,
      image_url: null,
      audio_url: null,
      seen: true,
      delivered: true,
      created_at: new Date().toISOString()
    };
    
    let currentMsgs: Message[] = [];
    setMessages((prev) => {
      currentMsgs = [...prev, userMsg];
      localStorage.setItem(aiMessagesKey, JSON.stringify(currentMsgs));
      localStorage.setItem(aiLastMsgKey, content);
      localStorage.setItem(aiLastAtKey, userMsg.created_at);
      return currentMsgs;
    });

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);

    const typingId = "ai-typing-indicator";
    const typingMsg = {
      id: typingId,
      sender_id: "system-user-ai-chat",
      receiver_id: meId,
      content: "[typing]",
      image_url: null,
      audio_url: null,
      seen: true,
      delivered: true,
      created_at: new Date().toISOString()
    };
    
    setMessages((prev) => [...prev, typingMsg]);
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);

    try {
      let historyList: Message[] = [];
      try {
        const stored = localStorage.getItem(aiMessagesKey);
        if (stored) {
          historyList = JSON.parse(stored);
        }
      } catch (e) {
        console.warn("Failed to parse stored user AI messages:", e);
      }
      
      if (historyList.length === 0) {
        historyList = [...currentMsgs];
      } else {
        if (!historyList.some(m => m.id === userMsg.id)) {
          historyList = [...historyList, userMsg];
        }
      }

      const apiHistory = historyList
        .filter(m => m.id !== "welcome-ai" && m.id !== "ai-typing-indicator")
        .map(m => ({
          role: (m.sender_id === meId ? "user" : "assistant") as "user" | "assistant",
          content: m.content || "",
        }));

      const result = await getUserAIResponse({ data: { messages: apiHistory } });
      
      setMessages((prev) => {
        const filtered = prev.filter(x => x.id !== typingId);
        if (result.error) {
          const errId = `ai-err-${Date.now()}`;
          const errText = `❌ Error: ${result.error}`;
          const errMsg = {
            id: errId,
            sender_id: "system-user-ai-chat",
            receiver_id: meId,
            content: errText,
            image_url: null,
            audio_url: null,
            seen: true,
            delivered: true,
            created_at: new Date().toISOString()
          };
          const updated = [...filtered, errMsg];
          localStorage.setItem(aiMessagesKey, JSON.stringify(updated));
          localStorage.setItem(aiLastMsgKey, errText);
          localStorage.setItem(aiLastAtKey, errMsg.created_at);
          return updated;
        }

        const assistantText = result.content || "";
        const assistantId = `assistant-msg-${Date.now()}`;
        const assistantMsg = {
          id: assistantId,
          sender_id: "system-user-ai-chat",
          receiver_id: meId,
          content: "",
          image_url: null,
          audio_url: null,
          seen: true,
          delivered: true,
          created_at: new Date().toISOString()
        };
        const updated = [...filtered, assistantMsg];
        localStorage.setItem(aiMessagesKey, JSON.stringify(updated));
        localStorage.setItem(aiLastAtKey, assistantMsg.created_at);
        
        setTimeout(() => {
          streamAIResponse(assistantText, assistantId);
        }, 50);

        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const filtered = prev.filter(x => x.id !== typingId);
        const errId = `ai-err-${Date.now()}`;
        const errText = `❌ Network Error: Failed to connect to Jackpot Jungle AI.`;
        const errMsg = {
          id: errId,
          sender_id: "system-user-ai-chat",
          receiver_id: meId,
          content: errText,
          image_url: null,
          audio_url: null,
          seen: true,
          delivered: true,
          created_at: new Date().toISOString()
        };
        const updated = [...filtered, errMsg];
        localStorage.setItem(aiMessagesKey, JSON.stringify(updated));
        localStorage.setItem(aiLastMsgKey, errText);
        localStorage.setItem(aiLastAtKey, errMsg.created_at);
        return updated;
      });
    }
  }, [meId]);

  async function send(e?: React.FormEvent, overrideContent?: string) {
    e?.preventDefault();
    const content = (overrideContent ?? draft).trim();
    if (!content || !meId) return;
    setDraftState("");
    clearDraft(friendId);
    setShowEmoji(false);

    if (friendId === "system-user-ai-chat") {
      submitToAI(content);
      return;
    }

    if (editingMessageId) {
      const msgId = editingMessageId;
      setEditingMessageId(null);
      const { data, error } = await supabase
        .from("messages")
        .update({ content, is_edited: true })
        .eq("id", msgId)
        .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
        .single();
      if (error) {
        toast.error("Failed to edit message");
        console.error(error);
        return;
      }
      if (data) {
        setMessages((prev) => prev.map((x) => (x.id === msgId ? (data as any) : x)));
      }
      return;
    }
    
    const replyPrefix = replyingTo
      ? `[reply:${replyingTo.id}:${replyingTo.sender_id === meId ? "You" : (replyingTo.sender?.username || friendDisplayName)}:${replyingTo.content ? replyingTo.content.slice(0, 30) : replyingTo.image_url ? "Image 📷" : replyingTo.audio_url ? "Voice message 🎙️" : "Message"}] `
      : "";
    const finalContent = replyPrefix + content;
    setReplyingTo(null);

    const clientUuid = generateUUID();
    const tempId = addOptimistic({ content }, clientUuid);
    window.dispatchEvent(
      new CustomEvent("jj-message-sent", {
        detail: {
          receiverId: isGroup ? null : friendId,
          groupId: isGroup ? groupId : null,
          content,
          image_url: null,
          audio_url: null,
          created_at: new Date().toISOString()
        }
      })
    );

    if (!NetworkManager.isOnline()) {
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: isGroup ? null : friendId,
        group_id: isGroup ? groupId : null,
        content: finalContent,
        image_url: null,
        audio_url: null,
        is_page: false,
        reply_to: replyingTo
      });
      return;
    }

    const insertObj: any = { id: clientUuid, sender_id: meId, content: finalContent };
    if (isGroup) {
      insertObj.group_id = groupId;
    } else {
      insertObj.receiver_id = friendId;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert(insertObj)
      .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url)")
      .single();
    if (error) {
      if (error.code === "23505") {
        return;
      }
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: isGroup ? null : friendId,
        group_id: isGroup ? groupId : null,
        content: finalContent,
        image_url: null,
        audio_url: null,
        is_page: false,
        reply_to: replyingTo
      });
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
      console.error(error);
      return;
    }
    if (data) {
      setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as any) : x)));
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !meId) return;

    const fileMime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isVideo = isChatVideoFile(file, file.name);

    if (!isVideo) {
      if (fileMime === "image/gif" || ext === "gif" || isAnimatedGif(file, file.name)) {
        alert("GIF files are not supported. Please choose a static image.");
        return;
      }
      const allowedMimes = CHAT_IMAGE_ALLOWED_MIMES as readonly string[];
      const allowedExts = CHAT_IMAGE_ALLOWED_EXTS as readonly string[];
      if (!allowedMimes.includes(fileMime) && !allowedExts.includes(ext)) {
        alert("Unsupported format. Please choose a JPEG, PNG, WEBP, AVIF, or HEIC image.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) { alert("Max 8 MB"); return; }
    } else {
      if (file.size > 25 * 1024 * 1024) { alert("Max 25 MB for video"); return; }
    }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    const clientUuid = generateUUID();
    const tempId = addOptimistic({ image_url: localPreview }, clientUuid);
    window.dispatchEvent(
      new CustomEvent("jj-message-sent", {
        detail: {
          receiverId: isGroup ? null : friendId,
          groupId: isGroup ? groupId : null,
          content: null,
          image_url: localPreview,
          audio_url: null,
          created_at: new Date().toISOString()
        }
      })
    );

    if (!NetworkManager.isOnline()) {
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: isGroup ? null : friendId,
        group_id: isGroup ? groupId : null,
        content: null,
        image_url: localPreview,
        audio_url: null,
        is_page: false,
        fileExt: ext,
        fileMime: fileMime
      }, file);
      setUploading(false);
      return;
    }

    try {
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      const insertObj: any = { id: clientUuid, sender_id: meId, content: null, image_url: url };
      if (isGroup) insertObj.group_id = groupId;
      else insertObj.receiver_id = friendId;

      const { data } = await supabase
        .from("messages")
        .insert(insertObj as any)
        .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
        .single();
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as any) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, image_url: url } : x)));
    } catch (err) {
      console.error(err);
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: isGroup ? null : friendId,
        group_id: isGroup ? groupId : null,
        content: null,
        image_url: localPreview,
        audio_url: null,
        is_page: false,
        fileExt: ext,
        fileMime: fileMime
      }, file);
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
    }
    setUploading(false);
  }

  async function onVoice(blob: Blob, mime: string, ext: string) {
    if (!meId) return;
    setRecUploading(true);
    const localPreview = URL.createObjectURL(blob);
    const clientUuid = generateUUID();
    const tempId = addOptimistic({ audio_url: localPreview }, clientUuid);
    window.dispatchEvent(
      new CustomEvent("jj-message-sent", {
        detail: {
          receiverId: isGroup ? null : friendId,
          groupId: isGroup ? groupId : null,
          content: null,
          image_url: null,
          audio_url: localPreview,
          created_at: new Date().toISOString()
        }
      })
    );

    if (!NetworkManager.isOnline()) {
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: isGroup ? null : friendId,
        group_id: isGroup ? groupId : null,
        content: null,
        image_url: null,
        audio_url: localPreview,
        is_page: false,
        fileExt: ext,
        fileMime: mime
      }, blob);
      setRecUploading(false);
      return;
    }

    try {
      const url = await uploadAndSign("chat-audio", meId, blob, ext, mime);
      const insertObj: any = { id: clientUuid, sender_id: meId, content: null, audio_url: url };
      if (isGroup) insertObj.group_id = groupId;
      else insertObj.receiver_id = friendId;

      const { data } = await supabase
        .from("messages")
        .insert(insertObj as any)
        .select("*, sender:sender_id(id, username, first_name, last_name, avatar_url, vip_status)")
        .single();
      if (data) setMessages((prev) => prev.map((x) => (x.id === tempId ? (data as any) : x)));
      else setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, audio_url: url } : x)));
    } catch (err) {
      console.error(err);
      await NetworkManager.queueMessage({
        id: clientUuid,
        sender_id: meId,
        receiver_id: isGroup ? null : friendId,
        group_id: isGroup ? groupId : null,
        content: null,
        image_url: null,
        audio_url: localPreview,
        is_page: false,
        fileExt: ext,
        fileMime: mime
      }, blob);
      setMessages((prev) => prev.map((x) => (x.id === tempId ? { ...x, failed: true } : x)));
    }
    setRecUploading(false);
  }

  const matchIds = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages.filter((m) => m.content && m.content.toLowerCase().includes(q)).map((m) => m.id);
  })();

  useEffect(() => {
    if (!searchOpen || matchIds.length === 0) return;
    const idx = Math.min(activeMatch, matchIds.length - 1);
    const id = matchIds[idx];
    const el = msgRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMatch, searchQuery, searchOpen, matchIds.length]);

  function highlight(text: string, q: string) {
    if (!q) return text;
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    const parts: React.ReactNode[] = [];
    let i = 0;
    while (i < text.length) {
      const found = lower.indexOf(ql, i);
      if (found === -1) { parts.push(text.slice(i)); break; }
      if (found > i) parts.push(text.slice(i, found));
      parts.push(<mark key={found} className="bg-yellow-300 text-black rounded px-0.5">{text.slice(found, found + q.length)}</mark>);
      i = found + q.length;
    }
    return parts;
  }

  // Show skeleton UI while loading — feels instant like Messenger
  if (isGroup ? !group : !friend) return (
    <div className="h-full max-h-full flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      {/* Skeleton Header — same layout as real Messenger header (name + call slots) */}
      <header className="sticky top-0 z-30 px-3 py-3 border-b border-border flex items-center gap-3 bg-card min-h-[65px] shrink-0">
        <div className="h-9 w-9 rounded-full bg-secondary animate-pulse shrink-0" />
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3.5 w-28 rounded bg-secondary animate-pulse" />
          <div className="h-2.5 w-16 rounded bg-secondary/60 animate-pulse" />
        </div>
        <div className="h-9 w-9 rounded-full bg-secondary/80 animate-pulse shrink-0" />
        <div className="h-9 w-9 rounded-full bg-secondary/80 animate-pulse shrink-0" />
      </header>
      {/* Skeleton Messages */}
      <div className="flex-1 overflow-hidden px-4 py-6 space-y-4 min-h-0">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className={`h-9 rounded-2xl bg-secondary animate-pulse ${i % 3 === 0 ? 'w-40' : i % 3 === 1 ? 'w-56' : 'w-32'}`} style={{ animationDelay: `${i * 80}ms` }} />
          </div>
        ))}
      </div>
      {/* Skeleton Input Bar */}
      <div className="p-3 border-t border-border flex items-center gap-2 bg-card shrink-0">
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
        <div className="flex-1 h-10 rounded-full bg-secondary animate-pulse" />
        <div className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
      </div>
    </div>
  );

  return (
    <div className="h-full max-h-full flex-1 flex min-h-0 relative w-full overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 bg-background w-full overflow-hidden">
        {selectionMode ? (
        <header className="sticky top-0 z-30 px-3 md:px-5 py-3 border-b border-border flex items-center justify-between bg-card min-h-[65px] shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectionMode(false);
              setSelectedMsgs(new Set());
            }}
            className="text-primary hover:opacity-80 font-semibold text-sm"
          >
            Cancel
          </button>
          <span className="font-semibold text-foreground text-sm">Delete messages</span>
          <div className="w-12" /> {/* Spacer */}
        </header>
      ) : (
        <header className="sticky top-0 z-30 px-3 md:px-5 py-3 border-b border-border flex items-center gap-2 bg-card min-h-[65px] shrink-0">
          <Link to="/app/chat" className="md:hidden h-10 w-10 -ml-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary shrink-0 touch-target">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!friendId.startsWith("system-")) {
                if (isGroup) setShowGroupInfo((v) => !v);
                else setShowDetail((v) => !v);
              }
            }}
            className="flex-1 min-w-0 flex items-center gap-3 text-left hover:opacity-85 transition-opacity"
          >
            <div className="relative">
              {friendId === "system-rules-chat" ? (
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center text-white shadow-md">
                  <BookOpen className="h-5 w-5" />
                </div>
              ) : friendId === "system-updates-chat" ? (
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <Megaphone className="h-5 w-5 animate-pulse" />
                </div>
              ) : isGroup ? (
                <>
                  <Avatar name={friendDisplayName} url={group?.avatar_url ?? null} size={40} isGroup={true} />
                </>
              ) : (
                <>
                  <Avatar name={friendDisplayName} url={friend?.avatar_url ?? null} size={40} />
                  {friend?.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />}
                </>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate flex items-center gap-1.5">
                <span>{friendDisplayName}</span>
                {!isGroup && friend?.vip_status && friend.vip_status !== "none" && (
                  <img 
                    src={getVipBadgeUrl(friend.vip_status) || undefined} 
                    alt={`${friend.vip_status} VIP`} 
                    className="h-5 w-auto object-contain select-none shrink-0"
                    title={`${friend.vip_status.toUpperCase()} VIP`}
                  />
                )}
                {!isGroup && friendRole === "super_admin" && (
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10 shrink-0" title="Super Admin" />
                )}
                {!isGroup && friendRole === "admin" && (
                  <Shield className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 shrink-0" title="Admin User" />
                )}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {friendId.startsWith("system-") ? "Official Channel" : 
                 isGroup ? (
                   typingUsers.size > 0 ? (
                     typingUsers.size === 1 
                       ? `${Array.from(typingUsers)[0]} is typing…` 
                       : `${Array.from(typingUsers).join(", ")} are typing…`
                   ) : `${groupMembers.length} members`
                 ) : friendTyping ? "Typing…" : friend?.online ? "Active now" :
                  (friend?.last_seen && !isNaN(new Date(friend.last_seen).getTime())) ? `Active ${formatDistanceToNow(new Date(friend.last_seen), { addSuffix: true })}` : "Offline"}
              </p>
            </div>
          </button>
          {/* Messenger default header actions: voice + video always on the right */}
          {!friendId.startsWith("system-") && !isGroup && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => friend && startCall({ calleeId: friend.id, kind: "voice", peer: { name: friendDisplayName, avatar: friend.avatar_url }, context: "friend" })}
                className="h-10 w-10 rounded-full flex items-center justify-center text-primary hover:bg-secondary active:bg-secondary/80 touch-target"
                aria-label="Voice call"
                title="Voice call"
              >
                <Phone className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => friend && startCall({ calleeId: friend.id, kind: "video", peer: { name: friendDisplayName, avatar: friend.avatar_url }, context: "friend" })}
                className="h-10 w-10 rounded-full flex items-center justify-center text-primary hover:bg-secondary active:bg-secondary/80 touch-target"
                aria-label="Video call"
                title="Video call"
              >
                <Video className="h-5 w-5" />
              </button>
            </div>
          )}
        </header>
      )}

      {searchOpen && (
        <div className="px-3 py-2 border-b border-border bg-card flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setActiveMatch(0); }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || matchIds.length === 0) return;
              e.preventDefault();
              if (e.shiftKey) setActiveMatch((i) => (i - 1 + matchIds.length) % matchIds.length);
              else setActiveMatch((i) => (i + 1) % matchIds.length);
            }}
            placeholder="Search in conversation (Enter = next)"
            className="rounded-full bg-secondary border-transparent h-9"
          />
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums min-w-[3.5rem] text-center">
            {searchQuery.trim() ? `${matchIds.length === 0 ? 0 : activeMatch + 1}/${matchIds.length}` : "0/0"}
          </span>
          <button type="button" disabled={matchIds.length === 0}
            onClick={() => setActiveMatch((i) => (i - 1 + matchIds.length) % matchIds.length)}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-40" aria-label="Previous match">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" disabled={matchIds.length === 0}
            onClick={() => setActiveMatch((i) => (i + 1) % matchIds.length)}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-40" aria-label="Next match">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary" aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="bg-secondary/60 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center justify-between text-xs text-foreground z-10 transition-all">
          <div className="flex items-center gap-2 truncate flex-1 cursor-pointer" onClick={() => scrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)}>
            <Pin className="h-3.5 w-3.5 text-primary rotate-45 fill-primary shrink-0" />
            <span className="font-semibold text-muted-foreground shrink-0">Pinned:</span>
            <span className="truncate italic">
              {pinnedMessages[pinnedMessages.length - 1].content || (pinnedMessages[pinnedMessages.length - 1].image_url ? "Image 📷" : "Voice message 🎙️")}
            </span>
          </div>
          <button 
            type="button"
            onClick={() => setShowAllPins(true)} 
            className="text-[10px] uppercase tracking-wider font-bold text-primary hover:underline ml-3 shrink-0"
          >
            See All ({pinnedMessages.length})
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain smooth-scroll px-4 py-6 space-y-2 relative ${threadPinned ? "opacity-100" : "opacity-0"}`}
      >
        {/* Floating scroll bottom arrow */}
        {showScrollToBottom && (
          <button
            type="button"
            onClick={() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
              setShowScrollToBottom(false);
            }}
            className="absolute bottom-20 right-6 bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:opacity-90 flex items-center gap-1.5 text-xs font-semibold animate-bounce z-40"
          >
            <ChevronDown className="h-4 w-4" />
            <span>New messages</span>
          </button>
        )}
        {/* Load older messages button */}
        {hasOlderMessages && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/10 hover:bg-primary/20 disabled:opacity-50 px-4 py-1.5 rounded-full transition-colors"
            >
              {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              {loadingOlder ? "Loading..." : "Load older messages"}
            </button>
          </div>
        )}
        {parsedMessages.length === 0 && calls.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">No messages yet. Say hi 👋</div>
        )}
        {(() => {
          type TimelineItem =
            | { kind: "msg"; at: string; msg: typeof parsedMessages[0] }
            | { kind: "call"; at: string; call: CallRow };
          const items: TimelineItem[] = [
            ...parsedMessages.map((m) => ({ kind: "msg" as const, at: m.created_at, msg: m })),
            ...calls.map((c) => ({ kind: "call" as const, at: c.created_at, call: c })),
          ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

          return items.map((it, i) => {
            const prev = items[i - 1];
            const showTime = shouldShowDaySeparator(prev?.at, it.at);

            if (it.kind === "call") {
              const c = it.call;
              const mine = c.caller_id === meId;
              return (
                <div key={`call-${c.id}`}>
                  {showTime && c.created_at && !isNaN(new Date(c.created_at).getTime()) && (
                    <div className="flex justify-center py-3 select-none">
                      <span className="premium-date-header">
                        {formatChatDaySeparator(c.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"} p-1`}>
                    <CallMessage 
                      mine={mine} 
                      kind={c.call_type} 
                      status={c.status as any} 
                      durationSeconds={c.duration_seconds} 
                      onCallBack={() => friend && startCall({ calleeId: friend.id, kind: c.call_type, peer: { name: friendDisplayName, avatar: friend.avatar_url }, context: "friend" })}
                    />
                  </div>
                </div>
              );
            }

            const m = it.msg;
            const mine = m.sender_id === meId;
            const nextIt = items[i + 1];
            const isLastMine = mine && (!nextIt || nextIt.kind !== "msg" || nextIt.msg.sender_id !== meId);
            const isMatch = matchIds.includes(m.id);
            const isActiveMatch = isMatch && matchIds[activeMatch] === m.id;

            const senderRole = isGroup 
              ? memberRoles.get(m.sender_id)
              : (mine 
                  ? (isSuperAdmin ? "super_admin" : (isAdmin ? "admin" : undefined))
                  : (friendRole === "admin" || friendRole === "super_admin" ? friendRole : undefined)
                );
            if (m.content === "[typing]") {
              return (
                <div key={m.id} className="flex justify-start py-1 pl-2">
                  <div className="bg-bubble-them text-bubble-them-foreground px-4 py-2.5 rounded-3xl flex items-center gap-2 shadow-xs border border-border/20">
                    <span className="text-[12px] text-muted-foreground/80 italic font-semibold flex items-center gap-1.5 select-none animate-pulse">
                      <Sparkles className="h-3.5 w-3.5 text-purple-500 animate-bounce" />
                      <span>AI is typing</span>
                    </span>
                    <span className="inline-flex gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  </div>
                </div>
              );
            }

            const welcomeChipLayout = m.id === "welcome-ai" ? (
              <div key="welcome-chips" className="flex flex-wrap gap-2 pl-12 pr-4 py-1.5 justify-start select-none">
                {["🎁 Bonuses", "👑 VIP Club", "🎮 Games", "💰 Deposit", "💸 Withdraw", "📞 Support"].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => submitToAI(chip)}
                    className="text-xs font-semibold px-3.5 py-1.5 rounded-full border border-primary/25 bg-primary/5 hover:bg-primary/10 text-primary transition-all shadow-xs shrink-0"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null;

            return (
              <React.Fragment key={m.id}>
                <MessageItem
                  m={m}
                  meId={meId}
                  friend={friend}
                  friendDisplayName={friendDisplayName}
                  isLastMine={isLastMine}
                  isMatch={isMatch}
                  isActiveMatch={isActiveMatch}
                  selectionMode={selectionMode}
                  isSelected={selectedMsgs.has(m.id)}
                  showTime={showTime}
                  msgRefs={msgRefs}
                  onSelect={handleSelect}
                  onReact={handleReact}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                  onReply={handleReply}
                  onCopy={handleCopy}
                  onDelete={handleDelete}
                  onForward={handleForward}
                  onPreviewImage={handlePreviewImage}
                  onMenuOpen={handleMenuOpen}
                  highlight={highlight}
                  searchQuery={searchQuery}
                  scrollToMessage={scrollToMessage}
                  isGroup={isGroup}
                  senderRole={senderRole}
                  onMentionClick={handleMentionClick}
                />
                {welcomeChipLayout}
              </React.Fragment>
            );
          });
        })()}
        {!isGroup && friendTyping && (
          <div className="flex justify-start pt-1">
            <div className="bg-bubble-them text-bubble-them-foreground px-4 py-2 rounded-3xl flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/85 italic font-semibold flex items-center gap-1">
                <span>{friendDisplayName} is typing</span>
                {friendRole === "super_admin" && (
                  <ShieldCheck className="h-3 w-3 text-amber-500 fill-amber-500/10 shrink-0" title="Super Admin" />
                )}
                {friendRole === "admin" && (
                  <Shield className="h-3 w-3 text-blue-500 fill-blue-500/10 shrink-0" title="Admin User" />
                )}
              </span>
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1 w-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1 w-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
        {isGroup && typingUsers.size > 0 && (
          <div className="flex justify-start pt-1">
            <div className="bg-bubble-them text-bubble-them-foreground px-4 py-2 rounded-3xl flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/85 italic font-semibold flex items-center gap-1">
                {typingUsers.size === 1 ? (
                  <>
                    <span>{Array.from(typingUsers)[0]} is typing</span>
                    {(() => {
                      const username = Array.from(typingUsers)[0];
                      const member = groupMembers.find(gm => gm.profiles?.username === username);
                      const role = member ? memberRoles.get(member.profiles?.id) : undefined;
                      if (role === "super_admin") return <ShieldCheck className="h-3 w-3 text-amber-500 fill-amber-500/10 shrink-0" />;
                      if (role === "admin") return <Shield className="h-3 w-3 text-blue-500 fill-blue-500/10 shrink-0" />;
                      return null;
                    })()}
                  </>
                ) : (
                  <span>typing</span>
                )}
              </span>
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1 w-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1 w-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {replyingTo && (
        <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground reply-preview-enter animate-in slide-in-from-bottom-2 duration-200">
          <div className="truncate flex-1">
            <span className="font-bold text-primary block text-[10px] uppercase">Replying to {replyingTo.sender_id === meId ? "yourself" : friendDisplayName}</span>
            <span className="truncate block italic">{replyingTo.content || "Media / Attachment"}</span>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center ml-2 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {editingMessageId && (() => {
        const editingMsg = messages.find(x => x.id === editingMessageId);
        return (
          <div className="px-4 py-2 border-t border-border bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground reply-preview-enter animate-in slide-in-from-bottom-2 duration-200">
            <div className="truncate flex-1">
              <span className="font-bold text-primary block text-[10px] uppercase">Editing Message</span>
              <span className="truncate block italic">{editingMsg?.content || ""}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMessageId(null);
                setDraft("");
              }}
              className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center ml-2 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })()}

      {(friendId.startsWith("system-") && friendId !== "system-user-ai-chat") ? (
        <div className="relative px-4 py-4 border-t border-border flex flex-col gap-2 bg-card shrink-0 text-center items-center" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <div className="bg-secondary/40 border border-border/60 rounded-xl p-4 w-full max-w-lg text-xs text-muted-foreground flex flex-col items-center gap-2 shadow-xs">
            <Megaphone className="h-5 w-5 text-primary" />
            <p className="font-semibold text-foreground">Official Read-Only Channel</p>
            <p className="max-w-md">Only administrators can send messages in this conversation. This channel is used for official announcements and important platform information.</p>
          </div>
        </div>
      ) : selectionMode ? (
        <div className="p-3 border-t border-border flex items-center justify-center bg-card">
          <button
            type="button"
            disabled={selectedMsgs.size === 0}
            onClick={() => setShowDeleteBottomSheet(true)}
            className="w-full max-w-md py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-bold rounded-xl text-sm transition-colors text-center shadow-md"
          >
            Delete ({selectedMsgs.size})
          </button>
        </div>
      ) : (
        <MessengerComposer
          value={draft}
          onChange={(v, cursor) => onDraftChange(v, cursor)}
          onSubmit={(e) => void send(e)}
          onFileChange={(e) => void onPickImage(e)}
          onVoice={onVoice}
          onThumbsUp={() => void send(undefined, "👍")}
          placeholder="Aa"
          sending={sending}
          uploading={uploading}
          recUploading={recUploading}
          hideMedia={friendId === "system-user-ai-chat"}
          showEmojiButton={friendId !== "system-user-ai-chat"}
          emojiActive={showEmoji}
          onToggleEmoji={() => setShowEmoji((v) => !v)}
          fileRef={fileRef}
          inputRef={inputRef}
          onKeyDown={(e) => {
            if (mentionSearch !== null && filteredMembers.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIdx((prev) => (prev + 1) % filteredMembers.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIdx((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insertMention(filteredMembers[mentionIdx].username);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setMentionSearch(null);
              }
            }
          }}
        >
          {mentionSearch !== null && filteredMembers.length > 0 && (
            <div className="absolute left-3 right-3 bottom-full mb-2 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden z-30 max-h-48 overflow-y-auto backdrop-blur-md bg-opacity-95">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/50 flex items-center gap-1 border-b border-border">
                <span>Mention member</span>
              </div>
              {filteredMembers.map((member, i) => (
                <button
                  key={member.id}
                  type="button"
                  onMouseEnter={() => setMentionIdx(i)}
                  onClick={() => insertMention(member.username)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-secondary ${i === mentionIdx ? "bg-secondary" : ""}`}
                >
                  <Avatar name={member.first_name && member.last_name ? `${member.first_name} ${member.last_name}` : member.username} url={member.avatar_url} size={24} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold">@{member.username}</span>
                    {member.first_name && (
                      <span className="text-[10px] text-muted-foreground truncate">{member.first_name} {member.last_name || ""}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </MessengerComposer>
      )}

      {preview && <ChatImagePreview url={preview} onClose={() => setPreview(null)} />}

      {/* Message Context Menu & Reactions */}
      {activeMsgMenu && (() => {
        const m = parsedMessages.find(x => x.id === activeMsgMenu);
        if (!m) return null;
        const mine = m.sender_id === meId;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActiveMsgMenu(null)} />
            <div className="relative w-full max-w-[280px] flex flex-col gap-3 context-menu-pop z-10">
              {/* Reactions Bar */}
              <div className="bg-card border border-border/80 rounded-full py-2 px-3 shadow-2xl flex items-center justify-between gap-1">
                {["❤️", "😂", "😮", "😢", "😡", "👍"].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      reactToMessage(m.id, emoji);
                      setActiveMsgMenu(null);
                    }}
                    className="text-2xl reaction-emoji-btn"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const more = prompt("Type any emoji reaction:");
                    if (more) reactToMessage(m.id, more.trim().slice(0, 5));
                    setActiveMsgMenu(null);
                  }}
                  className="h-8 w-8 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground flex items-center justify-center text-lg font-bold shrink-0 transition-colors"
                >
                  +
                </button>
              </div>

              {/* Context Menu */}
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-2.5 overflow-hidden flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(m);
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Reply className="h-4 w-4 text-primary" />
                  <span>Reply</span>
                </button>
                {mine && !m.image_url && !m.audio_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(m.content || "");
                      setEditingMessageId(m.id);
                      setReplyingTo(null);
                      setActiveMsgMenu(null);
                    }}
                    className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                  >
                    <Edit className="h-4 w-4 text-primary" />
                    <span>Edit</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void copyChatMessage(m);
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Copy className="h-4 w-4 text-primary" />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (m.isPinned) {
                      unpinMessage(m.id);
                    } else {
                      setConfirmPinTarget(m.id);
                    }
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Pin className="h-4 w-4 text-primary rotate-45" />
                  <span>{m.isPinned ? "Unpin message" : "Pin message"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode(true);
                    setSelectedMsgs(new Set([m.id]));
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForwardTargetMsg(m);
                    setActiveMsgMenu(null);
                  }}
                  className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm font-medium hover:bg-secondary text-foreground transition-colors"
                >
                  <Forward className="h-4 w-4 text-primary" />
                  <span>Forward</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pin Confirmation dialog */}
      {confirmPinTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border w-full max-w-[280px] rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-center animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-bold text-base text-foreground leading-snug">Pin this message?</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Everyone in the chat can see pinned messages. You can see and manage pinned messages from the chat details.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmPinTarget(null)}
                className="flex-1 py-2 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  pinMessage(confirmPinTarget);
                  setConfirmPinTarget(null);
                }}
                className="flex-1 py-2 bg-primary hover:opacity-90 text-primary-foreground font-semibold rounded-xl text-xs transition-colors"
              >
                Pin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* See All Pinned messages modal */}
      {showAllPins && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowAllPins(false)} />
          <div className="relative bg-card border border-border w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden animate-in zoom-in-95 duration-200 z-10">
            <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-base text-foreground flex items-center gap-1.5">
                <Pin className="h-4 w-4 rotate-45 text-primary fill-primary" />
                Pinned Messages ({pinnedMessages.length})
              </h3>
              <button type="button" onClick={() => setShowAllPins(false)} className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pinnedMessages.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">No pinned messages.</p>
              ) : (
                pinnedMessages.map(m => (
                  <div 
                    key={m.id} 
                    className="p-3 bg-secondary/30 hover:bg-secondary/60 border border-border rounded-xl transition-colors flex flex-col gap-1.5 relative group"
                  >
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-bold text-primary cursor-pointer" onClick={() => { scrollToMessage(m.id); setShowAllPins(false); }}>
                        {m.sender_id === meId ? "You" : friendDisplayName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{m.created_at && !isNaN(new Date(m.created_at).getTime()) ? formatDistanceToNow(new Date(m.created_at), { addSuffix: true }) : ""}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            unpinMessage(m.id);
                          }}
                          className="text-destructive hover:underline font-semibold"
                        >
                          Unpin
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground line-clamp-3 break-words cursor-pointer" onClick={() => { scrollToMessage(m.id); setShowAllPins(false); }}>
                      {m.content || (m.image_url ? "Image 📷" : "Voice message 🎙️")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      {showDeleteBottomSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowDeleteBottomSheet(false)} />
          <div className="relative bg-card border border-border w-full max-w-[320px] rounded-2xl shadow-2xl p-5 flex flex-col gap-3 animate-in zoom-in-95 duration-200 z-10 text-foreground text-center">
            <h3 className="font-bold text-base leading-snug">Delete {selectedMsgs.size} message{selectedMsgs.size > 1 ? "s" : ""}?</h3>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
            
            <div className="flex flex-col gap-2 mt-2">
              {allSelectedAreMine && (
                <button
                  type="button"
                  onClick={async () => {
                    setShowDeleteBottomSheet(false);
                    const targetIds = Array.from(selectedMsgs);
                    setSelectionMode(false);
                    setSelectedMsgs(new Set());
                    
                    try {
                      await unsendMessagesServer({ data: { ids: targetIds } });
                      setMessages(prev => prev.map(m => targetIds.includes(m.id) ? { ...m, content: "[system:unsent]", image_url: null, audio_url: null } : m));
                      toast.success(`${targetIds.length} message${targetIds.length > 1 ? "s" : ""} deleted for everyone`);
                    } catch (e: any) {
                      toast.error(e?.message || "Could not unsend message");
                    }
                  }}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-colors text-center shadow-sm"
                >
                  Delete for everyone
                </button>
              )}
              
              <button
                type="button"
                onClick={() => {
                  setShowDeleteBottomSheet(false);
                  const targetIds = Array.from(selectedMsgs);
                  setSelectionMode(false);
                  setSelectedMsgs(new Set());
                  deleteForMe(targetIds);
                  toast.success(`${targetIds.length} message${targetIds.length > 1 ? "s" : ""} deleted for you`);
                }}
                className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-xl text-xs transition-colors text-center border border-border/40"
              >
                Delete for you
              </button>
              
              <button
                type="button"
                onClick={() => setShowDeleteBottomSheet(false)}
                className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-muted-foreground font-semibold rounded-xl text-xs transition-colors text-center border border-border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Desktop Detail Sidebar */}
      {showDetail && !isGroup && (
        <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200 shrink-0">
          <ConversationDetailPanel 
            friend={friend} 
            meId={meId}
            pinnedMessages={pinnedMessages} 
            onClose={() => setShowDetail(false)} 
            onCreateGroupClick={() => {
              setShowDetail(false);
              setCreateGroupOpen(true);
            }}
            onSearchClick={() => {
              setShowDetail(false);
              setSearchOpen(true);
              setSearchQuery("");
              setActiveMatch(0);
            }}
          />
        </aside>
      )}

      {showGroupInfo && isGroup && (
        <aside className="w-80 border-l border-border bg-card hidden lg:flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200 shrink-0">
          <GroupDetailPanel 
            group={group} 
            members={groupMembers} 
            messages={messages} 
            meId={meId} 
            onClose={() => setShowGroupInfo(false)} 
            onLeave={handleLeaveGroup}
            onUpdateName={handleUpdateGroupName}
            onUpdateAvatar={handleUpdateGroupAvatar}
            onAddMembers={handleOpenAddMembers}
            onShare={() => setShareOpen(true)}
            onRemoveMember={handleRemoveMember}
            onPromoteMember={handlePromoteMember}
            onMemberClick={(userId) => {
              navigate({ to: `/app/chat/${userId}` });
            }}
          />
        </aside>
      )}

      {/* Mobile/Tablet Detail Sheet */}
      <Sheet open={showDetail && !isGroup && isMobile} onOpenChange={setShowDetail}>
        <SheetContent side="right" className="w-full sm:max-w-none p-0 lg:hidden bg-card border-l border-border text-foreground [&>button]:hidden">
          <ConversationDetailPanel 
            friend={friend} 
            meId={meId}
            pinnedMessages={pinnedMessages} 
            onClose={() => setShowDetail(false)} 
            onCreateGroupClick={() => {
              setShowDetail(false);
              setCreateGroupOpen(true);
            }}
            onSearchClick={() => {
              setShowDetail(false);
              setSearchOpen(true);
              setSearchQuery("");
              setActiveMatch(0);
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={showGroupInfo && isGroup && isMobile} onOpenChange={setShowGroupInfo}>
        <SheetContent side="right" className="w-full sm:max-w-none p-0 lg:hidden bg-card border-l border-border text-foreground [&>button]:hidden">
          <GroupDetailPanel 
            group={group} 
            members={groupMembers} 
            messages={messages} 
            meId={meId} 
            onClose={() => setShowGroupInfo(false)} 
            onLeave={handleLeaveGroup}
            onUpdateName={handleUpdateGroupName}
            onUpdateAvatar={handleUpdateGroupAvatar}
            onAddMembers={handleOpenAddMembers}
            onShare={() => setShareOpen(true)}
            onRemoveMember={handleRemoveMember}
            onPromoteMember={handlePromoteMember}
            onMemberClick={(userId) => {
              navigate({ to: `/app/chat/${userId}` });
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Forward Modal */}
      {forwardTargetMsg && (() => {
        const filteredCandidates = forwardCandidates.filter((c) =>
          c.name.toLowerCase().includes(forwardSearch.toLowerCase())
        );
        return (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={() => { setForwardTargetMsg(null); setForwardSearch(""); }} />
            <div className="relative bg-background/70 dark:bg-card/65 backdrop-blur-xl border border-border/80 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden animate-in zoom-in-95 duration-200 z-10 text-foreground">
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-transparent">
                <h3 className="font-bold text-base">Forward message</h3>
                <button type="button" onClick={() => { setForwardTargetMsg(null); setForwardSearch(""); }} className="h-8 w-8 rounded-full hover:bg-secondary/40 flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {/* Messenger style Search Bar */}
              <div className="px-4 py-2 border-b border-border/40 bg-transparent shrink-0">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
                  <Input
                    placeholder="Search friends"
                    value={forwardSearch}
                    onChange={(e) => setForwardSearch(e.target.value)}
                    className="pl-9 rounded-full bg-secondary/40 border-transparent text-xs h-8 focus:bg-secondary/60 focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {forwardCandidates.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-6">No matching candidates found.</p>
                ) : (
                  filteredCandidates.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-secondary/15 border border-border/20 hover:bg-secondary/35 transition-colors animate-in slide-in-from-bottom-2 duration-150">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={c.name} url={c.avatar} size={36} />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground/75 uppercase tracking-wide">
                            {c.type === "page" ? "Official page" : "Friend"}
                          </p>
                        </div>
                      </div>
                      <Button 
                        onClick={() => executeForward(c)} 
                        disabled={forwardingTargetId !== null} 
                        size="sm" 
                        className="rounded-full shrink-0 shadow-sm"
                      >
                        {forwardingTargetId === c.id ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Group Add Members Modal */}
      <GroupAddMembersModal
        open={addMembersOpen}
        onClose={() => setAddMembersOpen(false)}
        groupId={groupId!}
        meId={meId!}
        onMembersAdded={load}
      />

      {/* Group Share Modal */}
      <GroupShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        groupId={groupId!}
        groupName={group?.name || "Group"}
        meId={meId!}
      />

      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        meId={meId}
        preselectedMemberId={friend?.id}
        onGroupCreated={(newGroupId) => {
          navigate({ to: "/app/chat/$friendId", params: { friendId: `group-${newGroupId}` } });
        }}
      />

      {/* Member Removal Confirmation Dialog */}
      <Dialog open={memberToRemove !== null} onOpenChange={(val) => { if (!val) setMemberToRemove(null); }}>
        <DialogContent className="w-full max-w-sm p-6 bg-card border border-border rounded-3xl shadow-2xl flex flex-col gap-4 text-foreground text-center animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <UserMinus className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg">Remove Member</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-foreground">@{memberToRemove?.username}</span> from the group?
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => setMemberToRemove(null)}
              className="flex-1 rounded-xl h-11 text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmExecuteRemoveMember}
              className="flex-1 rounded-xl h-11 text-xs font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mentionOptionsOpen} onOpenChange={setMentionOptionsOpen}>
        <DialogContent className="max-w-xs bg-card border border-border p-6 rounded-2xl shadow-2xl backdrop-blur-md">
          {selectedMentionProfile && (
            <div className="flex flex-col items-center text-center gap-4">
              <Avatar
                name={selectedMentionProfile.first_name && selectedMentionProfile.last_name
                  ? `${selectedMentionProfile.first_name} ${selectedMentionProfile.last_name}`
                  : selectedMentionProfile.username}
                url={selectedMentionProfile.avatar_url}
                size={80}
              />
              <div className="flex flex-col">
                <span className="font-bold text-foreground text-lg">
                  {selectedMentionProfile.first_name && selectedMentionProfile.last_name
                    ? `${selectedMentionProfile.first_name} ${selectedMentionProfile.last_name}`
                    : `@${selectedMentionProfile.username}`}
                </span>
                <span className="text-xs text-muted-foreground">@{selectedMentionProfile.username}</span>
              </div>
              <div className="w-full flex flex-col gap-2 mt-2">
                <button
                  onClick={() => {
                    setMentionOptionsOpen(false);
                    navigate({ to: "/app/chat/" + selectedMentionProfile.id });
                  }}
                  className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-primary/20"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Message</span>
                </button>
                <button
                  onClick={() => {
                    setMentionOptionsOpen(false);
                    navigate({ to: "/app/u/$username", params: { username: selectedMentionProfile.username } });
                  }}
                  className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors border border-border/50"
                >
                  <User className="h-4 w-4 text-primary" />
                  <span>View profile</span>
                </button>
                {selectedMentionProfile.id !== meId && !isFriendOfMine && !friendRequestSent && (
                  <button
                    onClick={handleAddFriend}
                    className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors border border-border/50"
                  >
                    <UserPlus className="h-4 w-4 text-primary" />
                    <span>Add friend</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ConversationDetailPanel({ 
  friend, 
  meId,
  pinnedMessages = [], 
  onClose,
  onCreateGroupClick,
  onSearchClick
}: { 
  friend: Profile | null; 
  meId: string | null;
  pinnedMessages?: any[]; 
  onClose?: () => void;
  onCreateGroupClick?: () => void;
  onSearchClick?: () => void;
}) {
  const [notif, setNotif] = useState(true);
  const [totalFriends, setTotalFriends] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const { startCall } = useCalls();
  const { role } = useRole();
  const isAdminOrSuper = role === "admin" || role === "super_admin";

  useEffect(() => {
    if (!friend?.id) return;
    supabase
      .from("friendships")
      .select("user_a, user_b", { count: "exact", head: true })
      .or(`user_a.eq.${friend.id},user_b.eq.${friend.id}`)
      .then(({ count }) => {
        setTotalFriends(count ?? 0);
      });
  }, [friend?.id]);

  useEffect(() => {
    if (!meId || !friend?.id) {
      setIsFriend(false);
      return;
    }
    const [a, b] = meId < friend.id ? [meId, friend.id] : [friend.id, meId];
    supabase
      .from("friendships")
      .select("user_a")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle()
      .then(({ data }) => {
        setIsFriend(!!data);
      });
  }, [meId, friend?.id]);

  if (!friend) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-muted-foreground select-none">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = friend.first_name ? (friend.last_name ? `${friend.first_name} ${friend.last_name}` : friend.first_name) : friend.username;

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  const showCreateGroupButton = isAdminOrSuper || isFriend || friend.username === "jackpotjungle";

  return (
    <div className="h-full flex flex-col bg-card select-none">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0 bg-card">
        {onClose && (
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={onClose}>
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Button>
        )}
        <span className="font-bold text-sm">Details</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3">
            <Avatar name={friend.username} url={friend.avatar_url} size={80} />
          </div>
          <p className="font-bold text-lg">{displayName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">@{friend.username}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {friend.online ? "Active now" : "Offline"}
          </p>
        </div>

        {/* Action Shortcuts */}
        <div className="grid grid-cols-3 gap-y-4 gap-x-2 py-2 border-b border-border/40 pb-4 justify-items-center">
          {/* Message Button */}
          <button 
            onClick={onClose}
            className="flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity"
            title="Message"
          >
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-foreground shadow-sm">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">Message</span>
          </button>

          {/* Audio Call Button */}
          <button 
            onClick={() => startCall({ calleeId: friend.id, kind: "voice", peer: { name: displayName, avatar: friend.avatar_url }, context: "friend" })}
            className="flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity"
            title="Audio Call"
          >
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-foreground shadow-sm">
              <Phone className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">Audio</span>
          </button>

          {/* Video Call Button */}
          <button 
            onClick={() => startCall({ calleeId: friend.id, kind: "video", peer: { name: displayName, avatar: friend.avatar_url }, context: "friend" })}
            className="flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity"
            title="Video Call"
          >
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-foreground shadow-sm">
              <Video className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">Video</span>
          </button>

          {/* Create Group Button */}
          {showCreateGroupButton && (
            <button 
              onClick={onCreateGroupClick}
              className="flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity animate-in fade-in duration-200"
              title="Create Group"
            >
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-foreground shadow-sm">
                <Users className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground">Create Group</span>
            </button>
          )}

          {/* Search Conversation Button */}
          {onSearchClick && (
            <button 
              onClick={onSearchClick}
              className="flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity animate-in fade-in duration-200"
              title="Search Conversation"
            >
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-foreground shadow-sm">
                <Search className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground">Search</span>
            </button>
          )}

          {/* Share Profile Button */}
          <button 
            onClick={() => setShareOpen(true)}
            className="flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity animate-in fade-in duration-200"
            title="Share Profile"
          >
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-foreground shadow-sm">
              <Share2 className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">Share</span>
          </button>
        </div>

        {/* Contact Info */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2">Contact Info</p>
          <div className="bg-secondary/40 border border-border/50 rounded-2xl p-4 space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Phone</span>
              <p className="text-sm font-semibold text-foreground break-words">{friend.phone || "Not specified"}</p>
            </div>
            <div className="space-y-1 pt-1.5 border-t border-border/40">
              <span className="text-[10px] uppercase text-muted-foreground font-semibold">Address</span>
              <p className="text-sm font-semibold text-foreground break-words">{friend.address || "Not specified"}</p>
            </div>
          </div>
        </div>

        {/* Profile Info */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2">Profile Details</p>
          <div className="bg-secondary/40 border border-border/50 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Friend Code</span>
              <button 
                onClick={() => friend.friend_code && handleCopy(friend.friend_code, "Friend code")} 
                className="font-mono font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
              >
                <span>{friend.friend_code || "—"}</span>
                {friend.friend_code && <Copy className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex justify-between items-center text-sm pt-2 border-t border-border/40">
              <span className="text-muted-foreground">Total Friends</span>
              <span className="font-bold text-foreground">{totalFriends !== null ? totalFriends : "..."}</span>
            </div>
            {friend.created_at && (
              <div className="flex justify-between items-center text-sm pt-2 border-t border-border/40">
                <span className="text-muted-foreground">Member Since</span>
                <span className="font-medium text-foreground">{new Date(friend.created_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2 mb-2">Options</p>
          <button
            onClick={() => setNotif(v => !v)}
            className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-secondary/60 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                <Bell className="h-4 w-4 text-foreground" />
              </div>
              <span className="text-sm font-medium">Mute Notifications</span>
            </div>
            <div className={`w-8 h-4 rounded-full transition-colors ${notif ? "bg-primary" : "bg-muted-foreground/30"} p-0.5 flex items-center ${notif ? "justify-end" : "justify-start"}`}>
              <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
            </div>
          </button>
        </div>

        {/* Pinned Messages */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase text-muted-foreground font-semibold px-2">Pinned Messages</p>
          {pinnedMessages.length === 0 ? (
            <p className="text-xs text-muted-foreground italic px-2">No pinned messages in this chat.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {pinnedMessages.map((m) => (
                <div key={m.id} className="p-3 bg-secondary/30 border border-border/50 rounded-2xl text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground">
                    {m.sender_id === m.receiver_id ? "System" : m.sender_id === m.receiver_id ? "Other" : "Message"}
                  </p>
                  <p className="truncate text-foreground">{m.content || "Image / media 📷"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ShareProfileModal 
        isOpen={shareOpen}
        onOpenChange={setShareOpen}
        username={friend.username}
        displayName={displayName}
        avatarUrl={friend.avatar_url}
        memberSince={friend.created_at}
      />
    </div>
  );
}

function renderContentWithMentions(
  content: string,
  onMentionClick: (username: string) => void,
  isMatch: boolean,
  highlight: (text: string, q: string) => React.ReactNode,
  searchQuery: string,
  isMine: boolean
) {
  if (!content) return "";
  const parts = content.split(/(\s+)/);
  return parts.map((part, index) => {
    if (part.startsWith("@") && part.length > 1) {
      const match = part.match(/^@([a-zA-Z0-9_\-]+)(.*)$/);
      if (match) {
        const [_, username, punctuation] = match;
        return (
          <React.Fragment key={index}>
            <button
              type="button"
              onClick={(e) => {
                console.log("Mention HTML button clicked directly (customer)! username:", username);
                e.preventDefault();
                e.stopPropagation();
                onMentionClick(username);
              }}
              className={`hover:underline font-bold focus:outline-none ${
                isMine
                  ? "text-white underline decoration-dashed decoration-white/50"
                  : "text-primary font-semibold"
              }`}
            >
              @{username}
            </button>
            {punctuation}
          </React.Fragment>
        );
      }
    }
    return isMatch ? highlight(part, searchQuery) : part;
  });
}

interface MessageItemProps {
  m: any;
  meId: string | null;
  friend: Profile | null;
  friendDisplayName: string;
  isLastMine: boolean;
  isMatch: boolean;
  isActiveMatch: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  showTime: boolean;
  msgRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  onSelect: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onReply: (m: any) => void;
  onCopy: (text: string) => void;
  onDelete: (id: string) => void;
  onForward: (m: any) => void;
  onPreviewImage: (url: string) => void;
  onMenuOpen: (id: string) => void;
  highlight: (text: string, query: string) => React.ReactNode;
  searchQuery: string;
  scrollToMessage: (id: string) => void;
  isGroup?: boolean;
  senderRole?: "admin" | "super_admin";
  onMentionClick: (username: string) => void;
}

const MessageItem = React.memo(function MessageItem({
  m,
  meId,
  friend,
  friendDisplayName,
  isLastMine,
  isMatch,
  isActiveMatch,
  selectionMode,
  isSelected,
  showTime,
  msgRefs,
  onSelect,
  onReact,
  onPin,
  onUnpin,
  onReply,
  onCopy,
  onDelete,
  onForward,
  onPreviewImage,
  onMenuOpen,
  highlight,
  searchQuery,
  scrollToMessage,
  isGroup = false,
  senderRole,
  onMentionClick,
}: MessageItemProps) {
  const mine = m.sender_id === meId;
  const [showSelfTime, setShowSelfTime] = useState(false);
  const reactionKeys = Object.keys(m.reactions || {}).filter(k => m.reactions[k].length > 0);

  const pressTimerRef = useRef<any>(null);
  const startPress = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      onMenuOpen(m.id);
    }, 600);
  };
  const cancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const senderDispName = m.sender 
    ? (m.sender.first_name && m.sender.last_name ? `${m.sender.first_name} ${m.sender.last_name}` : `@${m.sender.username}`)
    : (mine ? "You" : "Someone");

  if ((m as any).isSystemGroupCreated) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {mine ? "You created the group." : `${senderDispName} created the group.`}
      </div>
    );
  }
  if ((m as any).isSystemUserLeft) {
    const leftName = (m as any).systemLeftName || senderDispName;
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {leftName} left the group
      </div>
    );
  }
  if ((m as any).isSystemUserJoined) {
    const joinedName = (m as any).systemJoinedName || senderDispName;
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {joinedName} joined the group
      </div>
    );
  }
  if ((m as any).isSystemOwnershipTransferred) {
    const targetName = (m as any).systemOwnershipTarget || "Someone";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {targetName} became the group administrator
      </div>
    );
  }
  if ((m as any).isSystemGroupNameChanged) {
    const parts = m.content?.split(":") || [];
    const newName = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} renamed the group to "{newName}"
      </div>
    );
  }
  if ((m as any).isSystemGroupAvatarChanged) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} updated the group photo
      </div>
    );
  }
  if ((m as any).isSystemUserRemoved) {
    const parts = m.content?.split(":") || [];
    const targetUser = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} removed @{targetUser} from the group
      </div>
    );
  }
  if ((m as any).isSystemUserPromoted) {
    const parts = m.content?.split(":") || [];
    const targetUser = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} promoted @{targetUser} to admin
      </div>
    );
  }
  if ((m as any).isSystemUserAdded) {
    const parts = m.content?.split(":") || [];
    const targetUser = parts[2] || "";
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic">
        {senderDispName} added @{targetUser} to the group
      </div>
    );
  }

  if (m.isSystemPin) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
        <Pin className="h-3 w-3 rotate-45 text-muted-foreground/60 fill-muted-foreground/30" />
        {mine ? "You pinned a message" : `${friendDisplayName} pinned a message`}
      </div>
    );
  }

  if (m.isSystemUnpin) {
    return (
      <div key={m.id} className="text-center text-[10px] text-muted-foreground/60 py-1.5 select-none italic flex items-center justify-center gap-1">
        <Pin className="h-3 w-3 rotate-45 text-muted-foreground/40" />
        {mine ? "You unpinned a message" : `${friendDisplayName} unpinned a message`}
      </div>
    );
  }

  if (m.isUnsent) {
    return (
      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} py-1`}>
        <div className="max-w-[240px] px-4 py-2 rounded-2xl border border-border bg-secondary/10 text-muted-foreground/50 text-[13px] italic select-none">
          {mine ? "You unsent a message" : "This message was unsent"}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={(el) => { msgRefs.current[m.id] = el; }} 
      className={`group/msg py-1 flex items-center gap-3 transition-colors ${selectionMode ? "hover:bg-secondary/10 cursor-pointer" : ""}`}
      onClick={() => {
        if (selectionMode) {
          onSelect(m.id);
        }
      }}
    >
      {selectionMode && (
        <div className="pl-3 shrink-0 flex items-center justify-center">
          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-transparent"}`}>
            {isSelected && (
              <svg className="h-3 w-3 fill-current stroke-current" viewBox="0 0 24 24" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        {showTime && m.created_at && !isNaN(new Date(m.created_at).getTime()) && (
          <div className="flex justify-center py-3 select-none">
            <span className="premium-date-header">
              {formatChatDaySeparator(m.created_at)}
            </span>
          </div>
        )}
        
        {/* Reply To Preview */}
        {m.replyTo && (
          <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-1`}>
            <div 
              onClick={() => scrollToMessage(m.replyTo.id)}
              className="max-w-[60%] text-[10px] bg-secondary/80 hover:bg-secondary border border-border/60 rounded-2xl px-3 py-1 text-muted-foreground truncate cursor-pointer transition-colors"
            >
              <span className="font-bold text-primary block text-[8px] uppercase tracking-wider">Replying to {m.replyTo.senderName}</span>
              <span className="italic truncate block">{m.replyTo.text}</span>
            </div>
          </div>
        )}

        {m.isForwarded && (
          <div className={`flex ${mine ? "justify-end" : "justify-start"} mb-0.5 px-2`}>
            <span className="text-[10px] text-muted-foreground/60 italic flex items-center gap-1 select-none">
              <Forward className="h-3 w-3 text-muted-foreground/50" />
              Forwarded
            </span>
          </div>
        )}

        {isGroup && !mine && (m as any).sender && (
          <div className="flex justify-start mb-0.5 pl-2">
            <span className="text-[10px] font-bold text-muted-foreground/80 flex items-center gap-1">
              <span>
                {(m as any).sender.first_name && (m as any).sender.last_name 
                  ? `${(m as any).sender.first_name} ${(m as any).sender.last_name}` 
                  : `@${(m as any).sender.username}`}
              </span>
              {(m as any).sender.vip_status && (m as any).sender.vip_status !== "none" && (
                <img 
                  src={getVipBadgeUrl((m as any).sender.vip_status) || undefined} 
                  alt={`${(m as any).sender.vip_status} VIP`} 
                  className="h-3.5 w-auto object-contain select-none shrink-0"
                  title={`${(m as any).sender.vip_status.toUpperCase()} VIP`}
                />
              )}
              {senderRole === "super_admin" && (
                <ShieldCheck className="h-3 w-3 text-amber-500 fill-amber-500/10 shrink-0" title="Super Admin" />
              )}
              {senderRole === "admin" && (
                <Shield className="h-3 w-3 text-blue-500 fill-blue-500/10 shrink-0" title="Admin User" />
              )}
            </span>
          </div>
        )}

        <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div 
            onPointerDown={selectionMode ? undefined : startPress}
            onPointerUp={selectionMode ? undefined : cancelPress}
            onPointerMove={selectionMode ? undefined : cancelPress}
            onPointerLeave={selectionMode ? undefined : cancelPress}
            onContextMenu={(e) => {
              onMessageContextMenu(e, () => {
                if (!selectionMode) onMenuOpen(m.id);
              });
            }}
            className={`relative ${messageBubbleSelectClass()} ${selectionMode ? "pointer-events-none" : "cursor-pointer"}`}
            onClick={() => {
              if (!selectionMode) {
                setShowSelfTime(!showSelfTime);
              }
            }}
          >
            {m.image_url ? (
              <ChatMediaBubble url={toCDNUrl(m.image_url)!} onPreview={onPreviewImage} />
            ) : m.audio_url ? (
              <div className="block">
                <VoiceMessage src={toCDNUrl(m.audio_url)} mine={mine} />
              </div>
            ) : (
              <div className={`max-w-[240px] px-4 py-2 rounded-2xl ${mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground"} ${isActiveMatch ? "ring-2 ring-primary" : ""}`}>
                <p className={`text-[14px] whitespace-pre-wrap break-words leading-relaxed ${messageTextSelectClass()}`}>
                  {m.content ? renderContentWithMentions(m.content, onMentionClick, isMatch, highlight, searchQuery.trim(), mine) : ""}
                  {m.is_edited && (
                    <span className="text-[10px] opacity-60 ml-1.5 select-none font-medium text-inherit italic">
                      (edited)
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {showSelfTime && m.created_at && !isNaN(new Date(m.created_at).getTime()) && (
          <div className={`flex mt-0.5 ${mine ? "justify-end" : "justify-start"} px-2 select-none`}>
            <span className="text-[9px] text-muted-foreground/60 font-semibold">
              {format(new Date(m.created_at), "MMM d, h:mm a")}
            </span>
          </div>
        )}

        {/* Reactions Badge */}
        {reactionKeys.length > 0 && (
          <div className={`flex mt-1 ${mine ? "justify-end" : "justify-start"} px-1`}>
            <div className="inline-flex items-center gap-1 bg-secondary border border-border/80 px-2 py-0.5 rounded-full shadow-sm text-xs leading-none">
              {reactionKeys.map(k => (
                <span key={k} onClick={() => onReact(m.id, k)} className="cursor-pointer" title={m.reactions[k].join(", ")}>{k}</span>
              ))}
              {reactionKeys.reduce((acc, k) => acc + m.reactions[k].length, 0) > 1 && (
                <span className="text-[9px] font-bold text-muted-foreground">{reactionKeys.reduce((acc, k) => acc + m.reactions[k].length, 0)}</span>
              )}
            </div>
          </div>
        )}

        {/* Pin Badge */}
        {m.isPinned && (
          <div className={`flex mt-1 ${mine ? "justify-end" : "justify-start"} px-1`}>
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <Pin className="h-3 w-3 rotate-45 text-primary fill-primary shrink-0" />
              Pinned
            </span>
          </div>
        )}

        {mine && (isLastMine || m.failed || (m as any).queued) && (
          <div className="flex items-center justify-end gap-1.5 pr-2 pt-1 min-h-5 text-[11px] font-medium leading-none text-message-status">
            {m.failed ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toast.promise(NetworkManager.retryMessage(m.id), {
                    loading: "Retrying message...",
                    success: "Message sent!",
                    error: "Failed to retry message."
                  });
                }}
                className="inline-flex items-center gap-1 text-destructive hover:underline cursor-pointer font-bold"
              >
                <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                Not delivered. Tap to retry
              </button>
            ) : (m.id && typeof m.id === "string" && (m.id.startsWith("temp-") || (m as any).queued)) ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-message-status/60 animate-pulse shrink-0" />
                Sending…
              </span>
            ) : m.seen ? (
              <span className="inline-flex items-center gap-1">
                {friend?.avatar_url ? (
                  <img src={friend.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover ring-1 ring-border" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                )}
                Seen
              </span>
            ) : m.delivered ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-message-status shrink-0" />
                Delivered
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-message-status/60 shrink-0" />
                Sent
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export interface GroupDetailPanelProps {
  group: any;
  members: any[];
  messages: any[];
  meId: string | null;
  onClose: () => void;
  onLeave: () => void;
  onUpdateName: (name: string) => void;
  onUpdateAvatar: (url: string) => void;
  onAddMembers: () => void;
  onShare: () => void;
  onRemoveMember: (id: string, username: string) => void;
  onPromoteMember: (id: string, username: string) => void;
  onMemberClick?: (id: string, username: string, avatarUrl: string | null) => void;
}

export function GroupDetailPanel({
  group,
  members,
  messages,
  meId,
  onClose,
  onLeave,
  onUpdateName,
  onUpdateAvatar,
  onAddMembers,
  onShare,
  onRemoveMember,
  onPromoteMember,
  onMemberClick
}: GroupDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(group?.name || "");
  const [avatarInput, setAvatarInput] = useState(group?.avatar_url || "/groop.png");
  const [activeMemberMenu, setActiveMemberMenu] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const { isSuperAdmin } = useRole();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [adminUserRoles, setAdminUserRoles] = useState<Map<string, "admin" | "super_admin">>(new Map());

  useEffect(() => {
    if (members.length === 0) return;
    const userIds = members.map(m => m.profiles?.id).filter(Boolean);
    supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .in("role", ["admin", "super_admin"])
      .then(({ data }) => {
        if (data) {
          setAdminUserIds(new Set(data.map(r => r.user_id)));
          const map = new Map<string, "admin" | "super_admin">();
          data.forEach(r => {
            const existing = map.get(r.user_id);
            if (!existing || r.role === "super_admin") {
              map.set(r.user_id, r.role as "admin" | "super_admin");
            }
          });
          setAdminUserRoles(map);
        }
      });
  }, [members]);

  useEffect(() => {
    setNameInput(group?.name || "");
    setAvatarInput(group?.avatar_url || "/groop.png");
  }, [group, isEditing]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

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
      const url = await uploadAndSign("avatars", group?.id || meId || "group", file, ext, file.type);
      setAvatarInput(url);
      toast.success("Image uploaded. Click Save to apply changes.");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    }
    setUploading(false);
  }

  const myMemberInfo = members.find(m => m.profiles?.id === meId);
  const isGroupAdmin = myMemberInfo?.role === "admin" || isSuperAdmin;

  const adminsInGroup = members.filter(m => adminUserIds.has(m.profiles?.id));
  const hasSupportPage = adminsInGroup.length > 0 && !group?.is_admin_team;
  
  let renderedMembers = members.filter(m => hasSupportPage ? !adminUserIds.has(m.profiles?.id) : true);
  if (hasSupportPage) {
    renderedMembers = [
      {
        role: "member",
        profiles: {
          id: "support-page-temp",
          username: "jackpotjungle",
          first_name: "Jackpot",
          last_name: "Jungle",
          avatar_url: "/icons/icon-256.webp"
        }
      } as any,
      ...renderedMembers
    ];
  }

  const groupInitials = (group?.name || "GP")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-full flex flex-col bg-card text-foreground">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <h3 className="font-bold text-base">Group Details</h3>
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-secondary flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Group Info Cards */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="relative">
            {avatarInput ? (
              <img
                src={toCDNUrl(avatarInput)}
                alt={nameInput || "Group Preview"}
                className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/20 shadow-lg"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-2xl shadow-inner">
                {groupInitials}
              </div>
            )}
            {isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50"
                  aria-label="Upload group picture"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="hidden"
                />
              </>
            )}
          </div>
          {isEditing && avatarInput && (
            <button
              type="button"
              onClick={() => setAvatarInput("")}
              className="text-[11px] text-destructive font-semibold hover:underline"
            >
              Remove Photo
            </button>
          )}

          {!isEditing ? (
            <div className="space-y-1">
              <h4 className="font-bold text-lg">{group?.name}</h4>
              <p className="text-xs text-muted-foreground">
                {hasSupportPage ? (members.length - adminsInGroup.length + 1) : members.length} members
              </p>
              {isGroupAdmin && (
                <button
                  onClick={() => {
                    setNameInput(group?.name || "");
                    setAvatarInput(group?.avatar_url || "");
                    setIsEditing(true);
                  }}
                  className="text-xs text-primary font-semibold hover:underline mt-1"
                >
                  Edit name & photo
                </button>
              )}
            </div>
          ) : (
            <div className="w-full space-y-3 bg-secondary/20 p-3 rounded-2xl border border-border/40">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase text-left block mb-1 pl-1">Name</label>
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="h-9 rounded-xl bg-background text-sm"
                  placeholder="Group name"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-lg text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onUpdateName(nameInput);
                    onUpdateAvatar(avatarInput);
                    setIsEditing(false);
                  }}
                  className="flex-1 py-1.5 bg-primary text-primary-foreground font-semibold rounded-lg text-xs transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            onClick={onAddMembers}
            className="w-full py-2.5 bg-primary/10 hover:bg-primary/15 text-primary border border-primary/20 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Users className="h-4 w-4" />
            <span>Add Members</span>
          </button>

          <button
            onClick={onShare}
            className="w-full py-2.5 bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Share2 className="h-4 w-4" />
            <span>Share Group</span>
          </button>
        </div>

        {/* Members List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Members</span>
            <span className="text-[10px] text-muted-foreground/60">
              {hasSupportPage ? (members.length - adminsInGroup.length + 1) : members.length} total
            </span>
          </div>

          <div className="space-y-2 divide-y divide-border/20 animate-in fade-in duration-200">
            {renderedMembers.map((m) => {
              if (!m.profiles) return null;
              const p = m.profiles;
              const isSelf = p.id === meId;
              const isSupportPage = p.id === "support-page-temp";
              const dispName = p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.username;
              const isAdmin = m.role === "admin";
              
              return (
                <div key={p.id} className="flex items-center justify-between py-2.5 first:pt-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSupportPage) {
                        onMemberClick?.("page", "jackpotjungle", "/icons/icon-256.webp");
                      } else {
                        onMemberClick?.(p.id, p.username, p.avatar_url);
                      }
                    }}
                    className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-85 transition-opacity cursor-pointer flex-1"
                  >
                    <Avatar name={dispName} url={p.avatar_url} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <span className="truncate">{dispName}</span>
                        {adminUserRoles.get(p.id) === "super_admin" && (
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-500 fill-amber-500/10 shrink-0" title="Super Admin" />
                        )}
                        {adminUserRoles.get(p.id) === "admin" && (
                          <Shield className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 shrink-0" title="Admin User" />
                        )}
                        {isSelf && <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded-full font-normal text-muted-foreground">You</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">@{p.username}</p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSupportPage ? (
                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold border border-primary/20">Official Page</span>
                    ) : isAdmin ? (
                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold border border-primary/20">Admin</span>
                    ) : (
                      <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold">Member</span>
                    )}

                    {isGroupAdmin && !isSelf && (
                      <div className="relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMemberMenu(prev => prev === p.id ? null : p.id);
                          }}
                          className="h-6 w-6 rounded-full hover:bg-secondary flex items-center justify-center text-muted-foreground"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {activeMemberMenu === p.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActiveMemberMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 bg-background border border-border shadow-lg rounded-xl py-1 min-w-[120px] z-50 overflow-hidden animate-in zoom-in-95 duration-100">
                              {!isAdmin && !isSupportPage && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPromoteMember(p.id, p.username);
                                    setActiveMemberMenu(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-[10px] font-semibold text-foreground hover:bg-secondary flex items-center gap-1.5"
                                >
                                  <ShieldAlert className="h-3 w-3 text-primary" />
                                  <span>Make Admin</span>
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveMember(p.id, isSupportPage ? "Jackpot Jungle" : p.username);
                                  setActiveMemberMenu(null);
                                }}
                                className={`w-full px-3 py-1.5 text-left text-[10px] font-semibold text-destructive hover:bg-secondary flex items-center gap-1.5 ${(!isAdmin && !isSupportPage) ? "border-t border-border/20" : ""}`}
                              >
                                <UserMinus className="h-3 w-3 text-destructive" />
                                <span>Remove</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border shrink-0 bg-background/50 backdrop-blur-md">
        <button
          onClick={() => setShowLeaveConfirm(true)}
          className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg transform active:scale-[0.98] duration-150 border border-red-500/20"
        >
          <LogOut className="h-4 w-4" />
          <span>Leave Group</span>
        </button>
      </div>

      {/* Leave Group Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="font-bold text-lg text-foreground">Leave Group?</h3>
            <p className="text-sm text-muted-foreground">Are you sure you want to leave this group chat? You will no longer receive or send messages here.</p>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-colors"
              >
                No, Stay
              </button>
              <button
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onLeave();
                }}
                className="px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold rounded-xl text-xs transition-colors"
              >
                Yes, Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface GroupShareModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  meId: string;
}

export function GroupShareModal({ open, onClose, groupId, groupName, meId }: GroupShareModalProps) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  const fetchOrCreateInvite = useCallback(async (forceRegenerate = false) => {
    if (!groupId || !meId) return;
    setLoading(true);
    try {
      if (!forceRegenerate) {
        const { data } = await supabase
          .from("group_invites")
          .select("token, expires_at")
          .eq("group_id", groupId)
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setToken(data.token);
          setExpiresAt(data.expires_at);
          setLoading(false);
          return;
        }
      }

      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let randomToken = "";
      for (let i = 0; i < 16; i++) {
        randomToken += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      const newExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const { error } = await supabase.from("group_invites").insert({
        token: randomToken,
        group_id: groupId,
        created_by: meId,
        expires_at: newExpiry
      });

      if (error) throw error;

      setToken(randomToken);
      setExpiresAt(newExpiry);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate invite link");
    } finally {
      setLoading(false);
    }
  }, [groupId, meId]);

  useEffect(() => {
    if (open) {
      setToken(null);
      setExpiresAt(null);
      setTimeLeft(0);
      setCopied(false);
      fetchOrCreateInvite();
    }
  }, [open, fetchOrCreateInvite]);

  useEffect(() => {
    if (!expiresAt) return;
    const calculateTimeLeft = () => {
      const difference = new Date(expiresAt).getTime() - Date.now();
      return Math.max(0, Math.floor(difference / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const rem = calculateTimeLeft();
      setTimeLeft(rem);
      if (rem <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!open) return null;

  const inviteLink = token ? `${window.location.origin}/app/chat/invite/${token}` : "";
  const qrCodeUrl = token ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(inviteLink)}` : "";

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleCopy = () => {
    if (!inviteLink || timeLeft <= 0) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Invite link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (!inviteLink || timeLeft <= 0) return;
    downloadQRCode(inviteLink, `qr-invite-${groupName.replace(/\s+/g, "-").toLowerCase()}.png`);
    toast.success("Downloading QR Code...");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-full max-w-sm p-6 bg-card/85 backdrop-blur-xl border border-border/80 rounded-3xl shadow-2xl flex flex-col gap-4 text-foreground [&>button]:hidden select-none animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <span>Share Group</span>
          </h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-secondary/50 flex items-center justify-center transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Generating secure token...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timeLeft > 0 ? (
              <>
                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-4 bg-secondary/20 border border-border/40 rounded-2xl">
                  {qrCodeUrl && (
                    <img 
                      src={qrCodeUrl} 
                      alt="QR Code" 
                      className="w-44 h-44 object-contain rounded-lg border border-border/60 bg-white p-2 shadow-sm"
                    />
                  )}
                  <p className="text-[11px] text-muted-foreground mt-3 font-semibold">Scan QR Code to join directly</p>
                </div>

                {/* Expiration Timer */}
                <div className="flex items-center justify-between px-2 text-xs">
                  <span className="text-muted-foreground">Expires in:</span>
                  <span className={`font-bold ${timeLeft < 30 ? "text-destructive animate-pulse" : "text-primary"}`}>
                    {formatCountdown(timeLeft)} (Valid for 5 minutes)
                  </span>
                </div>

                {/* Link Sharing Copy Box */}
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 bg-secondary/50 border border-border/60 rounded-xl px-3 py-2 text-xs focus:outline-none select-all truncate text-muted-foreground"
                  />
                  <Button 
                    onClick={handleCopy}
                    size="sm"
                    className="rounded-xl px-4 font-semibold text-xs transition-all shadow-sm"
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleDownloadQR}
                    className="flex-1 py-2.5 bg-secondary hover:bg-secondary/80 border border-border/60 text-foreground font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download QR</span>
                  </button>
                  <button
                    onClick={() => fetchOrCreateInvite(true)}
                    className="flex-1 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Regenerate</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <div className="text-4xl">⚠️</div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm">Invite Expired</h4>
                  <p className="text-[11px] text-muted-foreground max-w-[240px]">This invite token has expired. Please regenerate a new secure token.</p>
                </div>
                <button
                  onClick={() => fetchOrCreateInvite(true)}
                  className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-95 transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Generate New Invite</span>
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
