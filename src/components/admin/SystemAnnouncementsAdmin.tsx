import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/messenger/Avatar";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, Megaphone, Loader2, X, Image as ImageIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { publishSystemAnnouncement, deleteSystemAnnouncement } from "@/lib/admin-super.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { uploadAndSign } from "@/lib/chat-media";

/* ============ CONFIRM DIALOG HOOK ============ */
function useConfirm() {
  const [state, setState] = useState<{ open: boolean; title: string; desc?: string; confirmText?: string; destructive?: boolean; resolve?: (v: boolean) => void }>({ open: false, title: "" });
  const ask = (opts: { title: string; desc?: string; confirmText?: string; destructive?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ open: true, ...opts, resolve }));
  const node = (
    <AlertDialog open={state.open} onOpenChange={(o) => { if (!o) { state.resolve?.(false); setState((s) => ({ ...s, open: false })); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.desc && <AlertDialogDescription>{state.desc}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { state.resolve?.(false); setState((s) => ({ ...s, open: false })); }}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={state.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            onClick={() => { state.resolve?.(true); setState((s) => ({ ...s, open: false })); }}
          >{state.confirmText ?? "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { ask, node };
}

interface Announcement {
  id: string;
  channel_type: "rules" | "updates";
  sender_id: string;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
  profiles?: {
    username: string;
    avatar_url: string | null;
  } | null;
}

export function SystemAnnouncementsAdminView({ channelType, meId }: { channelType: "rules" | "updates"; meId: string }) {
  const publishFn = useServerFn(publishSystemAnnouncement);
  const deleteFn = useServerFn(deleteSystemAnnouncement);

  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Announcement[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const { ask, node: confirmNode } = useConfirm();

  async function loadHistory() {
    try {
      const { data, error } = await supabase
        .from("system_announcements")
        .select(`
          id,
          channel_type,
          sender_id,
          content,
          image_url,
          audio_url,
          created_at,
          profiles:sender_id (
            username,
            avatar_url
          )
        ` as any)
        .eq("channel_type", channelType)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistory(data as any[] ?? []);
    } catch (e: any) {
      console.error("[Announcements History Error]:", e.message);
    }
  }

  useEffect(() => {
    loadHistory();
    // Subscribe to realtime database updates
    const channel = supabase
      .channel(`system-announcements-${channelType}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "system_announcements", filter: `channel_type=eq.${channelType}` }, () => {
        loadHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelType]);

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Simple static image validation
    const mime = file.type.toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (mime === "image/gif" || ext === "gif") {
      return toast.error("GIF files are not supported. Please choose a static image.");
    }
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedMimes.includes(mime)) {
      return toast.error("Please choose a valid JPEG, PNG, or WEBP image.");
    }

    setUploading(true);
    try {
      const url = await uploadAndSign("chat-images", meId, file, ext, file.type);
      setImageUrl(url);
      toast.success("Image uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handlePublish() {
    if (!content.trim() && !imageUrl) return;
    setBusy(true);
    try {
      const res = await publishFn({
        data: {
          channelType,
          content: content.trim(),
          imageUrl
        }
      }) as any;
      if (res && !res.success) {
        toast.error(res.error || "Failed to publish announcement");
      } else {
        toast.success("Announcement published successfully!");
        setContent("");
        setImageUrl(null);
        loadHistory();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to publish announcement");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await ask({
      title: "Delete Announcement?",
      desc: "This will permanently delete this announcement for all users. This action cannot be undone.",
      confirmText: "Delete",
      destructive: true
    });
    if (!ok) return;

    try {
      const res = await deleteFn({ data: { id } }) as any;
      if (res && !res.success) {
        toast.error(res.error || "Failed to delete announcement");
      } else {
        toast.success("Announcement deleted successfully");
        loadHistory();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete announcement");
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {confirmNode}
      
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold capitalize">System Pinned Chat: {channelType === "rules" ? "All Rules" : "Updates"}</h2>
        <p className="text-sm text-muted-foreground">
          Manage announcements published to this permanent read-only user conversation channel.
        </p>
      </div>

      {/* Editor Box */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-4 shadow-sm">
        <div className="relative">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Type your new announcement here... (Media files can be attached below)`}
            rows={5}
            className="w-full bg-secondary/30 resize-none pr-10 focus-visible:ring-1"
          />
        </div>

        {/* Image Attachment Preview */}
        {imageUrl && (
          <div className="relative inline-block group rounded-xl overflow-hidden border border-border max-w-[200px]">
            <img src={imageUrl} alt="Attached announcement media" className="h-32 w-auto object-cover" />
            <button
              onClick={() => setImageUrl(null)}
              className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            <input
              type="file"
              ref={fileRef}
              accept="image/*"
              className="hidden"
              onChange={handleImagePick}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || busy}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              <span>Attach Image</span>
            </Button>
          </div>

          <Button
            onClick={handlePublish}
            disabled={busy || uploading || (!content.trim() && !imageUrl)}
            className="px-6 font-semibold"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Megaphone className="h-4 w-4 mr-1.5" />
            )}
            <span>Publish</span>
          </Button>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Publish History</h3>
        
        <div className="space-y-3">
          {history.map((ann) => (
            <div key={ann.id} className="p-4 bg-card border border-border rounded-xl shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={ann.profiles?.username ?? "System"}
                    url={ann.profiles?.avatar_url ?? null}
                    size={32}
                  />
                  <div>
                    <p className="text-sm font-semibold">{ann.profiles?.username ?? "System Admin"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(ann.id)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete announcement"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {ann.content && (
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {ann.content}
                </p>
              )}

              {ann.image_url && (
                <div className="rounded-lg overflow-hidden border border-border max-w-md bg-secondary/10">
                  <img src={ann.image_url} alt="Announcement content media" className="max-h-[300px] w-auto object-contain" />
                </div>
              )}
            </div>
          ))}

          {history.length === 0 && (
            <div className="text-center py-12 bg-card border border-dashed border-border rounded-xl">
              <Megaphone className="h-8 w-8 text-muted-foreground/55 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No announcements have been published to this channel yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
