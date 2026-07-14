import { createFileRoute } from "@tanstack/react-router";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell, Trash2, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { deleteNotificationUser, clearAllNotificationsUser, markNotificationsSeenUser } from "@/lib/user-ai.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/_authenticated/notifications")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Notifications — JJ Messenger" }] }),
  component: NotificationsPage,
});

type NotificationItem = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  user_id: string;
};

function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteFn = useServerFn(deleteNotificationUser);
  const clearAllFn = useServerFn(clearAllNotificationsUser);
  const markSeenFn = useServerFn(markNotificationsSeenUser);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotifications((data as any[]) || []);

      // Automatically mark fetched notifications as seen/read via server function
      if (data && data.some((n: any) => !n.seen)) {
        await markSeenFn();
        window.dispatchEvent(new CustomEvent("unread-notifications-updated"));
      }
    } catch (err: any) {
      console.error("Failed to load notifications:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await deleteFn({ data: { id } });
      if (!res.success) throw new Error(res.error || "Failed to delete notification.");
      
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success("Notification deleted.");
      window.dispatchEvent(new CustomEvent("unread-notifications-updated"));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete notification.");
    } finally {
      setDeleting(null);
    }
  };

  const handleClearAll = async () => {
    if (!user || notifications.length === 0) return;

    setLoading(true);
    try {
      const res = await clearAllFn();
      if (!res.success) throw new Error(res.error || "Failed to clear notifications.");
      
      setNotifications([]);
      toast.success("All notifications cleared.");
      window.dispatchEvent(new CustomEvent("unread-notifications-updated"));
    } catch (err: any) {
      toast.error(err.message || "Failed to clear notifications.");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        {/* Page Header */}
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HamburgerButton />
            <h1 className="font-bold flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <span>Inbox Announcements</span>
            </h1>
          </div>
          {notifications.length > 0 && (
            <Button
              onClick={() => setConfirmOpen(true)}
              variant="outline"
              size="sm"
              className="rounded-full text-xs font-bold font-sans h-9 text-destructive hover:bg-destructive/10 hover:text-destructive border-border/80"
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Page Body */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4 animate-in fade-in duration-300">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-semibold">Loading announcement history...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-24 text-center space-y-3 select-none">
              <div className="inline-flex h-14 w-14 rounded-full bg-secondary border border-border items-center justify-center text-muted-foreground/45 shadow-inner">
                <Bell className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-sm text-foreground">Your inbox is empty</h3>
                <p className="text-xs text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
                  Announcements, push notifications, and rewards status logs sent by Jackpot Jungle will stay listed here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {notifications.map((n) => (
                <div 
                  key={n.id}
                  className="p-4 rounded-2xl bg-card border border-border/60 hover:border-border transition-all flex items-start gap-3.5 relative overflow-hidden group shadow-sm text-left"
                >
                  {/* Decorative Left Border */}
                  <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-primary to-purple-500" />
                  
                  <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="font-extrabold text-sm text-foreground leading-snug">
                        {n.title}
                      </h4>
                      <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap pt-0.5">
                        {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {n.content}
                    </p>
                  </div>

                  <Button
                    onClick={() => handleDelete(n.id)}
                    disabled={deleting === n.id}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg border border-border/60 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="w-full max-w-sm bg-card border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-5 w-5" />
              Clear All Notifications
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground select-none">
              Are you sure you want to permanently clear all notifications? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel onClick={() => setConfirmOpen(false)} className="rounded-lg font-sans border-border">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearAll} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/95 rounded-lg font-sans"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
