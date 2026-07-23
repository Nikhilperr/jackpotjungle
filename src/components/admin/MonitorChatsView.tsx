import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getMonitorConversationsAdmin, getMonitorMessagesAdmin } from "@/lib/admin-super.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/messenger/Avatar";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { formatSystemMessage, isSystemMessage } from "@/lib/chat-helpers";
import { 
  Eye, Search, MessageSquare, Shield, Users, User, Clock, 
  Volume2, ImageIcon, FileText, ArrowLeft, RefreshCw, Bot, Menu
} from "lucide-react";

function cleanMessageContent(content: string | null): string {
  if (!content) return "";
  if (content.startsWith("[system:forwarded] ")) {
    return content.slice("[system:forwarded] ".length);
  }
  if (content.startsWith("[system:forwarded]")) {
    return content.slice("[system:forwarded]".length).trim() || "Forwarded message";
  }
  if (content === "[system:forwarded]") {
    return "Forwarded message";
  }
  return content;
}

export function MonitorChatsView({ meId, onOpenNav }: { meId: string; onOpenNav: () => void }) {
  const getConvsFn = useServerFn(getMonitorConversationsAdmin);
  const getMsgsFn = useServerFn(getMonitorMessagesAdmin);

  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "direct" | "group">("all");
  
  const [selectedConv, setSelectedConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Refs for realtime listener callbacks
  const activeConvRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConvs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await getConvsFn();
      const list = Array.isArray((result as any)?.list) ? (result as any).list : [];
      setConvs(list);
    } catch (err: any) {
      setConvs([]);
      toast.error(err.message || "Failed to load monitor conversations.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadActiveMessages = async (conv: any, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const payload: any = { type: conv.type };
      if (conv.type === "group") {
        payload.groupId = conv.groupId;
      } else {
        payload.userA = conv.userA.id;
        payload.userB = conv.userB.id;
      }
      const result = await getMsgsFn({ data: payload });
      const list = Array.isArray((result as any)?.messages) ? (result as any).messages : [];
      setMessages(list);
      
      // Scroll to bottom on load
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setMessages([]);
      toast.error(err.message || "Failed to load chat messages.");
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Initial load and Realtime listener
  useEffect(() => {
    loadConvs();

    const channel = supabase
      .channel("monitor-global-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          loadConvs(true);
          if (activeConvRef.current) {
            loadActiveMessages(activeConvRef.current, true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const selectConversation = (conv: any) => {
    setSelectedConv(conv);
    activeConvRef.current = conv;
    loadActiveMessages(conv);
  };

  // Filter conversations list
  const filteredConvs = (convs ?? []).filter(c => {
    if (filterType === "direct" && c.type !== "direct") return false;
    if (filterType === "group" && c.type !== "group") return false;
    
    if (search.trim()) {
      const query = search.toLowerCase();
      if (c.name.toLowerCase().includes(query)) return true;
      if (c.type === "direct") {
        if (c.userA.username.toLowerCase().includes(query)) return true;
        if (c.userB.username.toLowerCase().includes(query)) return true;
        if (c.userA.name.toLowerCase().includes(query)) return true;
        if (c.userB.name.toLowerCase().includes(query)) return true;
      }
      return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col min-h-0 bg-background text-foreground select-none">
      {/* Top Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onOpenNav} className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary animate-pulse" />
            <h2 className="text-lg font-bold tracking-tight">Monitor Live Chats</h2>
            <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Admin Shield
            </span>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => { loadConvs(); if (selectedConv) loadActiveMessages(selectedConv); }}
          disabled={loading || loadingMessages}
          className="h-8 w-8 rounded-full"
        >
          <RefreshCw className={`h-4 w-4 ${loading || loadingMessages ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Main split dashboard pane */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Side: Conversations list */}
        <div className={`w-full lg:w-[350px] shrink-0 border-r border-border flex flex-col bg-card/40 ${selectedConv ? "hidden lg:flex" : "flex"}`}>
          {/* Controls */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats or users..."
                className="pl-9 rounded-full bg-card h-9 text-xs"
              />
            </div>
            
            {/* Filter buttons */}
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: "all", label: "All Chats" },
                { id: "direct", label: "Direct" },
                { id: "group", label: "Groups" }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFilterType(opt.id as any)}
                  className={`h-7 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                    filterType === opt.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/45 text-muted-foreground border-border hover:bg-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations list wrapper */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground font-semibold">Loading live feeds...</span>
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No matching chat feeds found.
              </div>
            ) : (
              filteredConvs.map(conv => {
                const isActive = selectedConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left ${
                      isActive 
                        ? "bg-primary/10 border border-primary/20" 
                        : "hover:bg-secondary/50 border border-transparent"
                    }`}
                  >
                    {/* Avatars */}
                    {conv.type === "group" ? (
                      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                        <Users className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="relative shrink-0 flex items-center h-10 w-12 mr-1">
                        <div className="absolute top-0 left-0 border border-background rounded-full shadow overflow-hidden z-10">
                          <Avatar
                            name={conv.userA.name || conv.userA.username}
                            url={conv.userA.avatar_url}
                            size={28}
                          />
                        </div>
                        <div className="absolute bottom-0 right-0 border border-background rounded-full shadow overflow-hidden z-0">
                          <Avatar
                            name={conv.userB.name || conv.userB.username}
                            url={conv.userB.avatar_url}
                            size={28}
                          />
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-1">
                        <span className="font-bold text-xs truncate">
                          {conv.type === "group" ? (
                            <span className="flex items-center gap-1">
                              <span className="truncate">{conv.name}</span>
                              {conv.is_admin_team && (
                                <span className="bg-red-500/10 text-red-500 text-[8px] font-extrabold px-1 rounded uppercase">Staff</span>
                              )}
                            </span>
                          ) : (
                            <span className="truncate">{conv.userA.name} & {conv.userB.name}</span>
                          )}
                        </span>
                        {conv.last_at && (
                          <span className="text-[9px] text-muted-foreground shrink-0 font-mono">
                            {formatDistanceToNow(new Date(conv.last_at), { addSuffix: false })}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-sans leading-relaxed">
                        {isSystemMessage(conv.last_message) ? formatSystemMessage(conv.last_message) : cleanMessageContent(conv.last_message)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Message log thread */}
        <div className={`flex-1 flex flex-col min-w-0 ${selectedConv ? "flex" : "hidden lg:flex"}`}>
          {selectedConv ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-card/10">
              {/* Active Header */}
              <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button 
                    onClick={() => { setSelectedConv(null); activeConvRef.current = null; }} 
                    className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-secondary lg:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <h3 className="font-bold text-xs sm:text-sm truncate">
                      {selectedConv.type === "group" ? `Group: ${selectedConv.name}` : `Direct Chat: ${selectedConv.userA.name} ↔ ${selectedConv.userB.name}`}
                    </h3>
                    <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span>Live monitoring stream active</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedConv.type === "direct" && (
                    <div className="text-[10px] font-mono text-muted-foreground bg-secondary/45 border border-border px-2 py-0.5 rounded-md hidden md:block">
                      A: @{selectedConv.userA.username} | B: @{selectedConv.userB.username}
                    </div>
                  )}
                </div>
              </div>

              {/* Chat messages area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/5">
                {loadingMessages ? (
                  <div className="py-24 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground font-semibold">Tuning in to conversation...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-24 text-center text-xs text-muted-foreground">
                    This conversation is empty.
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isSystem = isSystemMessage(msg.content);
                    const sender = msg.sender || { username: "unknown", first_name: "Unknown", last_name: "" };
                    const senderName = `${sender.first_name || ""} ${sender.last_name || ""}`.trim() || sender.username;
                    const systemText = isSystem ? formatSystemMessage(msg.content, senderName) : "";
                    const cleanText = cleanMessageContent(msg.content);
                    
                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2 select-none w-full">
                          <span className="bg-secondary text-muted-foreground text-[10px] px-2.5 py-1 rounded-full font-sans border border-border max-w-[80%] text-center">
                            {systemText}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className="flex items-start gap-2.5 max-w-[85%] mx-1">
                        <Avatar
                          name={senderName}
                          url={sender.avatar_url}
                          size={32}
                        />
                        <div className="flex flex-col">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-bold text-xs text-primary">{senderName}</span>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {format(new Date(msg.created_at), "HH:mm")}
                            </span>
                          </div>

                          <div className="mt-1 bg-card border border-border/80 p-3 rounded-2xl rounded-tl-none shadow-sm flex flex-col gap-2">
                            {/* Message text content */}
                            {cleanText && (
                              <p className="text-xs text-foreground select-text selection:bg-primary/20 break-words whitespace-pre-wrap leading-relaxed">
                                {cleanText}
                              </p>
                            )}

                            {/* Image Attachment */}
                            {msg.image_url && (
                              <div className="relative rounded-lg overflow-hidden border border-border/40 max-w-sm mt-1">
                                <img
                                  src={msg.image_url}
                                  alt="Attachment"
                                  className="max-h-60 object-contain bg-black/20"
                                />
                              </div>
                            )}

                            {/* Voice/Audio attachment */}
                            {msg.audio_url && (
                              <div className="flex items-center gap-2 bg-secondary/35 border border-border/40 p-2 rounded-xl mt-1 max-w-xs">
                                <Volume2 className="h-4 w-4 text-primary shrink-0" />
                                <audio src={msg.audio_url} controls className="h-7 max-w-[180px] shrink text-xs" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-secondary/5">
              <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Shield className="h-8 w-8" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Live Conversation Monitor</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                Select a conversation stream from the sidebar to view live chatting details between users or inside group rooms in real-time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
