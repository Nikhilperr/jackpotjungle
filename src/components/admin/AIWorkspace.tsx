import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  Edit,
  ArrowLeft,
  MessageSquare,
  Send,
  Copy,
  Check,
  RefreshCw,
  XCircle,
  Cpu,
  Brain,
  Search,
  Database,
  LineChart,
  Menu,
  X,
  Megaphone,
  Smartphone,
  Mail,
  Calendar,
  Settings,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getAIResponse } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { sendBroadcast, sendCustomPushNotificationAllUsers } from "@/lib/admin-super.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

function AIActionCard({ card, onExecuteSuccess }: { card: any; onExecuteSuccess: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [execMessage, setExecMessage] = useState("");
  const executeBroadcast = useServerFn(sendBroadcast);
  const executePush = useServerFn(sendCustomPushNotificationAllUsers);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (card.action === "send_broadcast") {
        const res = await executeBroadcast({
          data: {
            content: card.content,
            targetType: card.targetType,
            tagId: card.tagId || undefined,
            userIds: card.userIds || undefined,
          }
        });
        setExecuted(true);
        setExecMessage(`✓ Broadcast announcement successfully sent to ${res.sent} players.`);
        onExecuteSuccess(`Broadcast sent to ${res.sent} players.`);
      } else if (card.action === "send_push") {
        const res = await executePush({
          data: {
            title: card.title,
            message: card.message,
          }
        });
        setExecuted(true);
        setExecMessage(`✓ Custom push notification successfully sent to ${res.sentCount} active devices.`);
        onExecuteSuccess(`Push notification sent to ${res.sentCount} devices.`);
      } else if (card.action === "send_message") {
        // Find or create page conversation
        const { data: conv, error: convErr } = await supabase
          .from("page_conversations")
          .upsert({ user_id: card.userId }, { onConflict: "user_id" })
          .select("id")
          .single();

        if (convErr) throw new Error(convErr.message);

        const { error: msgErr } = await supabase
          .from("page_messages")
          .insert({
            conversation_id: conv.id,
            from_page: true,
            content: card.content,
          });

        if (msgErr) throw new Error(msgErr.message);

        setExecuted(true);
        setExecMessage(`✓ Direct message successfully sent to @${card.username}.`);
        onExecuteSuccess(`Message sent to @${card.username}.`);
      } else if (card.action === "schedule_followup") {
        const meId = (await supabase.auth.getUser()).data.user?.id;
        if (!meId) throw new Error("No active admin session found.");

        const scheduledTime = new Date(Date.now() + card.days * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase
          .from("followups")
          .insert({
            user_id: card.userId,
            admin_id: meId,
            days_after: card.days,
            scheduled_at: scheduledTime,
            message: card.message,
            sent: false,
          });

        if (error) throw new Error(error.message);

        setExecuted(true);
        setExecMessage(`✓ Follow-up reminder successfully scheduled for @${card.username} in ${card.days} day(s).`);
        onExecuteSuccess(`Scheduled follow-up for @${card.username}.`);
      } else if (card.action === "configure_reengagement") {
        const { error } = await supabase
          .from("system_settings")
          .upsert({
            key: "reengagement_campaign",
            value: {
              enabled: card.enabled,
              inactivity_days: card.inactivity_days,
              message_template: card.message_template,
            }
          });

        if (error) throw new Error(error.message);

        setExecuted(true);
        setExecMessage(`✓ Re-engagement campaign settings successfully updated.`);
        onExecuteSuccess(`Updated re-engagement rules.`);
      } else {
        throw new Error(`Unsupported action type: ${card.action}`);
      }
    } catch (e: any) {
      console.error("[Action Execution Failure]:", e);
      toast.error(e.message || "Failed to execute action.");
    } finally {
      setBusy(false);
    }
  };

  const getActionTitle = () => {
    switch (card.action) {
      case "send_broadcast": return "Prepare Broadcast Announcement";
      case "send_push": return "Prepare Custom Push Notification";
      case "send_message": return "Prepare Single User Message";
      case "schedule_followup": return "Schedule User Follow-up Reminder";
      case "configure_reengagement": return "Configure Auto Re-engagement Rules";
      default: return "Administrative Action Request";
    }
  };

  const getActionIcon = () => {
    switch (card.action) {
      case "send_broadcast": return <Megaphone className="h-4 w-4 text-emerald-500" />;
      case "send_push": return <Smartphone className="h-4 w-4 text-amber-500" />;
      case "send_message": return <Mail className="h-4 w-4 text-blue-500" />;
      case "schedule_followup": return <Calendar className="h-4 w-4 text-purple-500" />;
      case "configure_reengagement": return <Settings className="h-4 w-4 text-pink-500" />;
      default: return <Brain className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div className="my-4 rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          {getActionIcon()}
          <span className="text-xs font-bold text-foreground">{getActionTitle()}</span>
        </div>
        <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-500">Review Required</span>
      </div>

      {/* Detail Preview */}
      <div className="p-4 space-y-3 text-xs">
        {card.action === "send_broadcast" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Target Type:</span>
              <span className="font-bold text-foreground uppercase">{card.targetType}</span>
            </div>
            {card.tagId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Tag ID:</span>
                <span className="font-mono text-[10px] text-foreground">{card.tagId}</span>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Broadcast Content:</span>
              <div className="p-2.5 bg-secondary/35 rounded-lg border border-border font-sans whitespace-pre-wrap text-foreground">
                {card.content}
              </div>
            </div>
          </>
        )}

        {card.action === "send_push" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Notification Title:</span>
              <span className="font-bold text-foreground">{card.title}</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Message Text:</span>
              <div className="p-2.5 bg-secondary/35 rounded-lg border border-border whitespace-pre-wrap text-foreground">
                {card.message}
              </div>
            </div>
          </>
        )}

        {card.action === "send_message" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Recipient:</span>
              <span className="font-bold text-foreground">@{card.username}</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Direct Message Content:</span>
              <div className="p-2.5 bg-secondary/35 rounded-lg border border-border whitespace-pre-wrap text-foreground font-sans">
                {card.content}
              </div>
            </div>
          </>
        )}

        {card.action === "schedule_followup" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">User:</span>
              <span className="font-bold text-foreground">@{card.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Scheduled For:</span>
              <span className="font-bold text-[#d97706]">In {card.days} day(s)</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Follow-up Message:</span>
              <div className="p-2.5 bg-secondary/35 rounded-lg border border-border whitespace-pre-wrap text-foreground font-sans">
                {card.message}
              </div>
            </div>
          </>
        )}

        {card.action === "configure_reengagement" && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Status:</span>
              <span className={`font-bold uppercase ${card.enabled ? "text-emerald-500" : "text-destructive"}`}>
                {card.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Inactivity Limit:</span>
              <span className="font-bold text-foreground">{card.inactivity_days} day(s)</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Re-engagement Message Template:</span>
              <div className="p-2.5 bg-secondary/35 rounded-lg border border-border whitespace-pre-wrap text-foreground font-mono text-[10px]">
                {card.message_template}
              </div>
            </div>
          </>
        )}

        {/* Footer Buttons */}
        <div className="pt-2 border-t border-amber-500/10 flex justify-end">
          {executed ? (
            <div className="w-full flex items-center gap-1.5 p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg font-bold select-none text-[11px]">
              <Check className="h-4 w-4 shrink-0" />
              <span>{execMessage}</span>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={busy}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-1.5 h-8 text-[11px]"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  <span>Executing Campaign...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  <span>Confirm & Launch Action</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AIConversation {
  id: string;
  title: string;
  createdAt: string;
  messages: AIMessage[];
}

interface AIWorkspaceProps {
  onBackToDashboard: () => void;
  onBackToPageChats: () => void;
  adminName: string;
}

export function AIWorkspace({ onBackToDashboard, onBackToPageChats, adminName }: AIWorkspaceProps) {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Configuration States (Future AI Integration Placeholders)
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "gemini" | "anthropic">("openai");
  const [temperature, setTemperature] = useState(0.7);
  const [tokenUsage, setTokenUsage] = useState({ promptTokens: 0, completionTokens: 0, total: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input field when active chat changes
  useEffect(() => {
    if (activeConvId) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [activeConvId]);

  // 1. Local storage load
  useEffect(() => {
    try {
      const stored = localStorage.getItem("jj_ai_conversations");
      if (stored) {
        const parsed = JSON.parse(stored) as AIConversation[];
        setConversations(parsed);
        const storedActiveId = localStorage.getItem("jj_active_ai_chat_id");
        if (storedActiveId && parsed.some((c) => c.id === storedActiveId)) {
          setActiveConvId(storedActiveId);
        } else if (parsed.length > 0) {
          setActiveConvId(parsed[0].id);
          localStorage.setItem("jj_active_ai_chat_id", parsed[0].id);
        }
      } else {
        // Seed with a welcome conversation if empty
        const welcomeConv: AIConversation = {
          id: "welcome-chat",
          title: "Getting Started with Super AI",
          createdAt: new Date().toISOString(),
          messages: [
            {
              id: "welcome-msg-1",
              role: "assistant",
              content: `Hello, **${adminName}**! Welcome to the **Jackpot Jungle Super AI Workspace**. 

This is the UI Foundation workspace (Phase 2). Here you can manage your AI conversations, test UI rendering, and configure parameters for future agent capabilities.

### 🚀 Demonstration of Markdown Support:
You can format your messages, and the assistant renders them automatically:
- **Bold text** and *Italics*
- Lists and bullet points
- Custom Code blocks (with Copy button)
- Visual data tables (see below)

### 📊 Mock Financial Ledger Sample:
| User ID | Vip Level | Cashin Total | Wallet Balance | Status |
| :--- | :--- | :--- | :--- | :--- |
| \`usr-928\` | Platinum | $1,250.00 | $82.40 | Active |
| \`usr-412\` | Diamond | $5,800.00 | $520.00 | Active |
| \`usr-733\` | Bronze | $120.00 | $4.50 | Blocked |

### 🛠️ Configured Tools Preview:
\`\`\`typescript
// The future AI agent will invoke RPC validators securely:
const result = await performWalletActionAdmin({
  targetUserId: "user-id",
  action: "deposit",
  amount: 100,
  reason: "AI Recommended Loyalty Reward"
});
\`\`\`

Type a message below to test the instant conversation history and interface feedback.`,
              createdAt: new Date().toISOString(),
            },
          ],
        };
        setConversations([welcomeConv]);
        setActiveConvId(welcomeConv.id);
        localStorage.setItem("jj_ai_conversations", JSON.stringify([welcomeConv]));
        localStorage.setItem("jj_active_ai_chat_id", welcomeConv.id);
      }
    } catch (e) {
      console.warn("Failed to load AI conversations:", e);
    }
  }, [adminName]);

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeConvId, isGenerating]);

  // Helper: Get currently active conversation
  const activeConversation = conversations.find((c) => c.id === activeConvId);

  // Helper: Save conversations
  const saveConversations = (nextConvs: AIConversation[]) => {
    setConversations(nextConvs);
    try {
      localStorage.setItem("jj_ai_conversations", JSON.stringify(nextConvs));
    } catch (e) {
      console.error("Failed to save AI conversations to localStorage:", e);
    }
  };

  // 2. Actions: Create New Chat
  const handleCreateNewChat = () => {
    const newId = `ai-chat-${Date.now()}`;
    const newChat: AIConversation = {
      id: newId,
      title: `AI Chat - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: new Date().toISOString(),
      messages: [],
    };
    const nextConvs = [newChat, ...conversations];
    saveConversations(nextConvs);
    setActiveConvId(newId);
    localStorage.setItem("jj_active_ai_chat_id", newId);
    setSidebarOpen(false);
    toast.success("New AI conversation created!");
  };

  // 3. Actions: Delete Conversation
  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextConvs = conversations.filter((c) => c.id !== id);
    saveConversations(nextConvs);
    if (activeConvId === id) {
      const nextActiveId = nextConvs.length > 0 ? nextConvs[0].id : null;
      setActiveConvId(nextActiveId);
      if (nextActiveId) {
        localStorage.setItem("jj_active_ai_chat_id", nextActiveId);
      } else {
        localStorage.removeItem("jj_active_ai_chat_id");
      }
    }
    toast.success("AI conversation deleted.");
  };

  // 4. Actions: Rename Conversation
  const handleStartRename = (conv: AIConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = (id: string) => {
    if (!editTitle.trim()) return;
    const nextConvs = conversations.map((c) =>
      c.id === id ? { ...c, title: editTitle.trim() } : c
    );
    saveConversations(nextConvs);
    setEditingConvId(null);
    toast.success("Conversation renamed successfully!");
  };

  // 5. Actions: Clear All History
  const handleClearAllHistory = () => {
    if (window.confirm("Are you sure you want to clear all AI chat history? This cannot be undone.")) {
      saveConversations([]);
      setActiveConvId(null);
      toast.success("AI Chat history cleared.");
    }
  };

  // 6. Actions: Send User Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConvId) return;

    const userMsg: AIMessage = {
      id: `user-msg-${Date.now()}`,
      role: "user",
      content: inputMessage.trim(),
      createdAt: new Date().toISOString(),
    };

    const currentConv = conversations.find((c) => c.id === activeConvId);
    if (!currentConv) return;

    const updatedMessages = [...currentConv.messages, userMsg];

    // Update active conversation locally
    const nextConvs = conversations.map((c) => {
      if (c.id === activeConvId) {
        return {
          ...c,
          title: c.messages.length === 0 ? userMsg.content.substring(0, 30) : c.title,
          messages: updatedMessages,
        };
      }
      return c;
    });

    saveConversations(nextConvs);
    setInputMessage("");
    setIsGenerating(true);
    inputRef.current?.focus();

    try {
      const result = await getAIResponse({ data: { messages: updatedMessages } });

      if (result.error) {
        const errorMsg: AIMessage = {
          id: `assistant-msg-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **System Error:** ${result.error}`,
          createdAt: new Date().toISOString(),
        };

        const errorConvs = nextConvs.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              messages: [...c.messages, errorMsg],
            };
          }
          return c;
        });
        saveConversations(errorConvs);
      } else if (result.content) {
        const assistantMsg: AIMessage = {
          id: `assistant-msg-${Date.now()}`,
          role: "assistant",
          content: result.content,
          createdAt: new Date().toISOString(),
        };

        const finalConvs = nextConvs.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              messages: [...c.messages, assistantMsg],
            };
          }
          return c;
        });
        saveConversations(finalConvs);

        const estPromptTokens = Math.ceil(updatedMessages.reduce((acc, m) => acc + m.content.length, 0) / 4);
        const estCompletionTokens = Math.ceil(result.content.length / 4);
        setTokenUsage((prev) => ({
          promptTokens: prev.promptTokens + estPromptTokens,
          completionTokens: prev.completionTokens + estCompletionTokens,
          total: prev.total + estPromptTokens + estCompletionTokens,
        }));
      }
    } catch (err: any) {
      const networkErrorMsg: AIMessage = {
        id: `assistant-msg-${Date.now()}`,
        role: "assistant",
        content: `⚠️ **Network Error:** Failed to query server endpoint. ${err.message || "Please check your network connection."}`,
        createdAt: new Date().toISOString(),
      };

      const errorConvs = nextConvs.map((c) => {
        if (c.id === activeConvId) {
          return {
            ...c,
            messages: [...c.messages, networkErrorMsg],
          };
        }
        return c;
      });
      saveConversations(errorConvs);
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  // Copy to clipboard helper
  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Response copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Simple Markdown Parsing helper (Bolds, Lists, Code, Tables)
  const parseMarkdown = (text: string) => {
    const lines = text.split("\n");
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];

    const parsedElements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      // 1. Code block handling
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          // close code block
          inCodeBlock = false;
          const codeString = codeContent.join("\n");

          let actionCard: any = null;
          try {
            const parsed = JSON.parse(codeString.trim());
            if (parsed && typeof parsed === "object" && parsed.action) {
              actionCard = parsed;
            }
          } catch (e) {
            // Not a valid action card JSON
          }

          if (actionCard) {
            parsedElements.push(
              <AIActionCard
                key={`action-card-${index}`}
                card={actionCard}
                onExecuteSuccess={(msg) => {
                  toast.success(msg);
                }}
              />
            );
          } else {
            parsedElements.push(
              <div key={`code-${index}`} className="relative my-3 rounded-xl overflow-hidden border border-amber-500/20 bg-[#0f0f12]">
                <div className="flex items-center justify-between px-4 py-1.5 bg-[#1b1b22] border-b border-white/5">
                  <span className="text-[10px] uppercase font-bold text-amber-500/90 tracking-wider">code snippet</span>
                  <button
                    onClick={() => handleCopyMessage(`code-${index}`, codeString)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono overflow-x-auto text-[#e2e8f0] leading-relaxed">
                  <code>{codeString}</code>
                </pre>
              </div>
            );
          }
          codeContent = [];
        } else {
          // open code block
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }

      // 2. Table handling
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        inTable = true;
        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter((_, i, arr) => i > 0 && i < arr.length - 1);

        if (line.includes("---")) {
          // alignment/separator line, skip
          return;
        }

        if (tableHeaders.length === 0) {
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        return;
      } else if (inTable) {
        // Table ended, render it
        inTable = false;
        parsedElements.push(
          <div key={`table-${index}`} className="my-3 overflow-x-auto rounded-xl border border-border bg-card/40 backdrop-blur-md">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border">
                  {tableHeaders.map((h, i) => (
                    <th key={i} className="p-3 font-bold text-foreground/80">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border/50 hover:bg-secondary/15 transition-colors">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="p-3 font-mono text-muted-foreground">{cell.replace(/`/g, "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableHeaders = [];
        tableRows = [];
      }

      // 3. Regular Markdown formatting (bold, list items)
      let renderedLine: React.ReactNode = line;

      // Unordered lists
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const content = line.trim().substring(2);
        renderedLine = (
          <li className="list-disc ml-5 text-sm my-0.5 text-foreground/90">
            {formatInlineMarkdown(content)}
          </li>
        );
        parsedElements.push(<ul key={`li-${index}`} className="my-1">{renderedLine}</ul>);
        return;
      }

      // Headings
      if (line.trim().startsWith("### ")) {
        parsedElements.push(
          <h4 key={`h3-${index}`} className="text-sm font-bold text-foreground pt-3 pb-1">
            {formatInlineMarkdown(line.trim().substring(4))}
          </h4>
        );
        return;
      }

      // Normal paragraphs
      if (line.trim().length > 0) {
        parsedElements.push(
          <p key={`p-${index}`} className="text-sm text-foreground/90 leading-relaxed my-1.5">
            {formatInlineMarkdown(line)}
          </p>
        );
      } else {
        parsedElements.push(<div key={`br-${index}`} className="h-2" />);
      }
    });

    return parsedElements;
  };

  // Format inline bold/italic
  const formatInlineMarkdown = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      const boldIndex = remaining.indexOf("**");
      const italicIndex = remaining.indexOf("*");

      if (boldIndex !== -1 && (italicIndex === -1 || boldIndex < italicIndex)) {
        // Handle bold
        if (boldIndex > 0) {
          parts.push(remaining.substring(0, boldIndex));
        }
        const closingBold = remaining.indexOf("**", boldIndex + 2);
        if (closingBold !== -1) {
          parts.push(
            <strong key={`b-${remaining.length}`} className="font-bold text-amber-500/90">
              {remaining.substring(boldIndex + 2, closingBold)}
            </strong>
          );
          remaining = remaining.substring(closingBold + 2);
        } else {
          parts.push(remaining.substring(boldIndex));
          remaining = "";
        }
      } else if (italicIndex !== -1) {
        // Handle italic
        if (italicIndex > 0) {
          parts.push(remaining.substring(0, italicIndex));
        }
        const closingItalic = remaining.indexOf("*", italicIndex + 1);
        if (closingItalic !== -1) {
          parts.push(
            <em key={`i-${remaining.length}`} className="italic text-foreground/90">
              {remaining.substring(italicIndex + 1, closingItalic)}
            </em>
          );
          remaining = remaining.substring(closingItalic + 1);
        } else {
          parts.push(remaining.substring(italicIndex));
          remaining = "";
        }
      } else {
        parts.push(remaining);
        remaining = "";
      }
    }

    return parts;
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter conversations based on query
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSidebarContent = () => (
    <>
      {/* Workspace Brand / Header */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-border bg-secondary/15 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-black text-sm tracking-wide bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
              Super AI
            </p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Admin Assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" title="Engine Standby" />
          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Action Controls: New Chat */}
      <div className="p-3 space-y-2 shrink-0">
        <button
          onClick={handleCreateNewChat}
          className="w-full h-11 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(var(--primary-rgb),0.25)]"
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </button>

        {/* Local search filtering conversations */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 bg-secondary/30 border border-border focus:border-primary/20 rounded-lg pl-9 pr-3 text-xs text-foreground placeholder-muted-foreground/60 transition-all outline-none"
          />
        </div>
      </div>

      {/* Conversation List (Scrollable Area) */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 scrollbar-thin">
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConvId;
            const isEditing = conv.id === editingConvId;

            return (
              <div
                key={conv.id}
                onClick={() => {
                  if (!isEditing) {
                    setActiveConvId(conv.id);
                    localStorage.setItem("jj_active_ai_chat_id", conv.id);
                    setSidebarOpen(false);
                  }
                }}
                className={`w-full group rounded-xl p-2.5 flex items-center justify-between transition-all border text-left cursor-pointer ${
                  isActive
                    ? "bg-primary/10 border-primary/20 text-foreground"
                    : "bg-transparent border-transparent text-muted-foreground hover:bg-[#1b1b26]/50 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveRename(conv.id)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveRename(conv.id)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="w-full bg-secondary/80 text-foreground border border-primary/20 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                    />
                  ) : (
                    <span className="text-xs font-semibold truncate flex-1">{conv.title}</span>
                  )}
                </div>

                {!isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    <button
                      onClick={(e) => handleStartRename(conv, e)}
                      className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground"
                      title="Rename Chat"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="h-6 w-6 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Delete Chat"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/35 mb-2 animate-bounce" />
            <p className="text-xs font-bold text-muted-foreground/60">No AI chats found</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Create a new chat to begin.</p>
          </div>
        )}
      </div>

      {/* Action Controls: Clear History & Back Routing */}
      <div className="p-3 border-t border-border bg-secondary/15 space-y-2 shrink-0">
        <button
          onClick={handleClearAllHistory}
          className="w-full h-9 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive text-xs font-semibold transition-colors flex items-center justify-center gap-2 select-none"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Clear Chat History</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onBackToDashboard}
            className="h-9 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground text-xs font-bold transition-all flex items-center justify-center gap-1.5 select-none"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={onBackToPageChats}
            className="h-9 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground text-xs font-bold transition-all flex items-center justify-center gap-1.5 select-none"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Inbox</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-full w-full bg-background text-foreground overflow-hidden">
      {/* ── DESKTOP SIDEBAR ────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-80 border-r border-border bg-card/90 flex-col shrink-0">
        {renderSidebarContent()}
      </aside>

      {/* ── MOBILE SIDEBAR DRAWER ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-80 h-full border-r border-border bg-card flex flex-col animate-in slide-in-from-left duration-200">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* ── MAIN AI PANEL ──────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col bg-background relative overflow-hidden">
        {/* Workspace Top Header Panel */}
        <header className="px-4 py-3 bg-secondary/15 border-b border-border flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            {/* Hamburger menu button for mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-sm font-black text-foreground">AI Workspace Panel</h2>
              <p className="text-[10px] text-muted-foreground">Local UI Simulation Mode</p>
            </div>
          </div>

          {/* Configuration Placeholders for Future Agent */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary/50 rounded-lg border border-white/5 text-[11px] font-bold text-foreground">
              <Cpu className="h-3.5 w-3.5 text-amber-500" />
              <span>Jackpot Jungle AI</span>
            </div>

            <div className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              <span>Temp storage: Isolated</span>
            </div>
          </div>
        </header>

        {/* Message Thread History */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin">
          {activeConversation && activeConversation.messages.length > 0 ? (
            activeConversation.messages.map((msg) => {
              const isUser = msg.role === "user";

              return (
                <div key={msg.id} className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 flex gap-3 shadow-md border ${
                      isUser
                        ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-sm"
                        : "bg-card text-foreground border-border rounded-tl-sm"
                    }`}
                  >
                    {/* Icon Column */}
                    {!isUser && (
                      <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                    )}

                    {/* Content Column */}
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black text-muted-foreground/80 tracking-wide">
                          {isUser ? `${adminName} (Admin)` : "Super AI Assistant"}
                        </span>
                        {!isUser && (
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="text-muted-foreground hover:text-foreground hover:bg-secondary p-1 rounded-md transition-colors"
                            title="Copy Response"
                          >
                            {copiedId === msg.id ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className="text-sm select-text whitespace-pre-wrap leading-relaxed">
                        {isUser ? msg.content : parseMarkdown(msg.content)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            /* Welcome / Onboarding Card */
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center px-4 py-8">
              <div className="h-16 w-16 rounded-3xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-600/10 mb-6 animate-pulse">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Super AI Administrative Terminal
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-[420px] leading-relaxed">
                Connect the assistant model to execute audits, fetch logs, compose templates, or analyze player ledger histories.
              </p>

              {/* Grid of Prompt Ideas */}
              <div className="grid grid-cols-2 gap-3 w-full mt-8">
                {[
                  { title: "Audit Player History", desc: "Show transactions for user usr-928" },
                  { title: "Verify Ledgers", desc: "Check balance integrity check matches transactions" },
                  { title: "Draft Tag Broadcast", desc: "Create a push notification draft for Gold VIP tier" },
                  { title: "Explain Wallet Action", desc: "Show why user credits were auto-released today" },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInputMessage(item.desc)}
                    className="p-3 border border-border bg-card/50 hover:bg-secondary/40 rounded-xl transition-all text-left group shadow-sm"
                  >
                    <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Streaming Indicator */}
          {isGenerating && (
            <div className="flex justify-start">
              <div className="bg-card text-foreground border border-border rounded-2xl p-4 flex gap-3 shadow-md rounded-tl-sm animate-pulse">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="flex items-center gap-1.5 py-1">
                  <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form Bar */}
        <div className="p-4 border-t border-border bg-secondary/15 shrink-0">
          <form onSubmit={handleSendMessage} className="relative flex items-center gap-2 max-w-4xl mx-auto">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isGenerating || !activeConvId}
              placeholder={
                !activeConvId
                  ? "Create or select a chat in the sidebar to begin..."
                  : "Ask Super AI (e.g. 'audit user ledger')..."
              }
              className="w-full h-12 bg-secondary/30 border border-border focus:border-primary/30 rounded-2xl pl-4 pr-12 text-sm text-foreground outline-none transition-all placeholder-muted-foreground/60 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isGenerating || !activeConvId}
              className="absolute right-2.5 h-8.5 w-8.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/95 disabled:bg-secondary disabled:text-muted-foreground transition-all flex items-center justify-center shadow-md cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          {/* Placeholders for Regenerate / Stop Generation Buttons */}
          <div className="flex items-center justify-center gap-4 mt-3">
            <button
              type="button"
              disabled
              className="h-7 px-3 rounded-lg border border-border bg-card/40 opacity-55 text-[10px] font-bold text-muted-foreground flex items-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Regenerate (Standby)</span>
            </button>
            <button
              type="button"
              disabled
              className="h-7 px-3 rounded-lg border border-border bg-card/40 opacity-55 text-[10px] font-bold text-muted-foreground flex items-center gap-1.5"
            >
              <XCircle className="h-3 w-3" />
              <span>Stop Generating</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
