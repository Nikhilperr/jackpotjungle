import { useEffect, useRef, useState, useTransition, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { 
  getUsersListAdmin, 
  updateUserProfileAdmin, 
  changeUserPasswordAdmin, 
  changeUserEmailAdmin, 
  deleteUserAccountAdmin,
  getAllEmailsAdmin
} from "@/lib/admin-super.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/messenger/Avatar";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { 
  Users, Search, Filter, Shield, ShieldCheck, Check, X, 
  KeyRound, Mail, Trash2, Camera, Loader2, Coins, 
  Award, Wallet, ChevronLeft, ChevronRight, Ban, 
  ShieldAlert, Settings, HelpCircle, Eye, EyeOff, Globe, Gift
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LIMIT = 15;

const AVAILABLE_PERMISSIONS = [
  { id: "inbox", label: "Page Inbox" },
  { id: "aichat", label: "AI Chat" },
  { id: "user_ai_knowledge", label: "User AI Knowledge" },
  { id: "teamchat", label: "Admin Team Chat" },
  { id: "quickreplies", label: "Quick Replies" },
  { id: "tags", label: "Tags" },
  { id: "broadcasts", label: "Broadcasts" },
  { id: "followups", label: "Follow-ups" },
  { id: "autoresp", label: "Auto-response" },
  { id: "referrals", label: "Referrals" },
  { id: "logs", label: "Logs" },
  { id: "users", label: "User Management" },
  { id: "monitor", label: "Monitor Chat" },
  { id: "push_notifications", label: "Push Notification" },
  { id: "profile", label: "My Profile" }
];

const DEFAULT_PERMISSIONS = ["inbox", "aichat", "teamchat", "referrals", "users", "monitor", "profile"];

export function UsersManagementView({ meId }: { meId: string }) {
  const fetchFn = useServerFn(getUsersListAdmin);
  const updateFn = useServerFn(updateUserProfileAdmin);
  const passwordFn = useServerFn(changeUserPasswordAdmin);
  const emailFn = useServerFn(changeUserEmailAdmin);
  const deleteFn = useServerFn(deleteUserAccountAdmin);
  const getEmailsFn = useServerFn(getAllEmailsAdmin);

  const [users, setUsers] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<any>("all");
  const [sortBy, setSortBy] = useState<any>("created_at");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  // Selected user details for editing
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modal actions
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteUsername, setConfirmDeleteUsername] = useState("");
  const [pwResetOpen, setPwResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [downloadEmailsOpen, setDownloadEmailsOpen] = useState(false);
  const [downloadType, setDownloadType] = useState<"all" | "users" | "admins">("all");
  const [downloadFormat, setDownloadFormat] = useState<"csv" | "pdf">("csv");
  const [downloadingEmails, setDownloadingEmails] = useState(false);

  // Edit details form states
  const [editUsername, setEditUsername] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editVipStatus, setEditVipStatus] = useState("none");
  const [editCoins, setEditCoins] = useState(0);
  const [editWalletBalance, setEditWalletBalance] = useState(0);
  const [editXp, setEditXp] = useState(0);
  const [editVerified, setEditVerified] = useState(false);
  const [editStatus, setEditStatus] = useState("active");
  const [editRole, setEditRole] = useState("user");
  const [editPermissions, setEditPermissions] = useState<string[]>(DEFAULT_PERMISSIONS);
  const [editTheme, setEditTheme] = useState("dark");
  const [editLanguage, setEditLanguage] = useState("en");
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);
  const [editCoverPhoto, setEditCoverPhoto] = useState<string | null>(null);
  const [editReferredBy, setEditReferredBy] = useState<string | null>(null);
  const [referrerProfile, setReferrerProfile] = useState<any>(null);
  const [referrerQuery, setReferrerQuery] = useState("");
  const [referrerResults, setReferrerResults] = useState<any[]>([]);
  const [searchingReferrer, setSearchingReferrer] = useState(false);

  // File refs
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);

  // Check super admin status
  useEffect(() => {
    supabase.from("user_roles")
      .select("role")
      .eq("user_id", meId)
      .eq("role", "super_admin")
      .maybeSingle()
      .then(({ data }) => {
        setIsSuperAdmin(!!data);
      });
  }, [meId]);

  useEffect(() => {
    if (editReferredBy) {
      supabase
        .from("profiles")
        .select("id, username, first_name, last_name")
        .eq("id", editReferredBy)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setReferrerProfile(data);
          } else {
            setReferrerProfile(null);
          }
        });
    } else {
      setReferrerProfile(null);
    }
  }, [editReferredBy]);

  useEffect(() => {
    if (!referrerQuery.trim()) {
      setReferrerResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setSearchingReferrer(true);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, first_name, last_name, email")
          .or(`username.ilike.%${referrerQuery}%,email.ilike.%${referrerQuery}%,first_name.ilike.%${referrerQuery}%,last_name.ilike.%${referrerQuery}%`)
          .neq("id", selectedUser?.id || "") // Can't refer oneself
          .limit(5);
        setReferrerResults(data || []);
      } catch (err) {
        console.warn("Referrer search error:", err);
      } finally {
        setSearchingReferrer(false);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [referrerQuery, selectedUser?.id]);

  const canEditSelectedUser = useMemo(() => {
    if (!selectedUser) return false;
    // Super admin targets are always read-only.
    if (selectedUser.role === "super_admin") return false;
    // Only super admins may edit any user / admin account.
    return isSuperAdmin;
  }, [selectedUser, isSuperAdmin]);

  /** Security / VIP / delete — same gate (super admin + editable target). */
  const canManageSecurity = canEditSelectedUser;

  // Load user records
  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await fetchFn({
        data: {
          search: search.trim() || undefined,
          filter,
          sortBy,
          sortDesc,
          page,
          limit: LIMIT
        }
      });
      setUsers(result.users);
      setTotalCount(result.count);
    } catch (e: any) {
      toast.error(e.message || "Failed to fetch user profiles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      loadUsers();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search, filter, sortBy, sortDesc, page]);

  // Open drawer helper
  const handleUserClick = (u: any) => {
    setSelectedUser(u);
    setEditUsername(u.username || "");
    setEditFirstName(u.first_name || "");
    setEditLastName(u.last_name || "");
    setEditPhone(u.phone || "");
    setEditAddress(u.address || "");
    setEditBio(u.bio || "");
    setEditVipStatus(u.vip_status || "none");
    setEditCoins(u.coins ?? 0);
    setEditWalletBalance(Number(u.wallet_balance ?? 0));
    setEditXp(u.xp ?? 0);
    setEditVerified(!!u.verified);
    setEditStatus(u.status || (u.is_blocked ? "suspended" : "active"));
    setEditRole(u.role || "user");
    setEditPermissions(u.permissions || DEFAULT_PERMISSIONS);
    setEditTheme(u.theme || "dark");
    setEditLanguage(u.language || "en");
    setEditAvatarUrl(u.avatar_url);
    setEditCoverPhoto(u.cover_photo);
    setEditReferredBy(u.referred_by || null);
    setReferrerQuery("");
    setReferrerResults([]);
    setDrawerOpen(true);
  };

  // Avatar Upload handler
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Max file size is 5MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    setUploadingAvatar(true);
    try {
      const { uploadAndSign, validateAvatarFile } = await import("@/lib/chat-media");
      const err = validateAvatarFile(file, file.name);
      if (err) throw new Error(err);
      const url = await uploadAndSign("avatars", `${selectedUser.id}-${Date.now()}`, file, ext, file.type, { filename: file.name });
      setEditAvatarUrl(url);
      toast.success("Profile image staged! Remember to click Save Changes.");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Cover Image handler
  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedUser) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Max file size is 5MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    
    setUploadingCover(true);
    try {
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("avatars", `${selectedUser.id}-cover-${Date.now()}`, file, ext, file.type);
      setEditCoverPhoto(url);
      toast.success("Cover image staged! Remember to click Save Changes.");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload cover.");
    } finally {
      setUploadingCover(false);
    }
  };

  // Save changes handler
  const handleSaveChanges = async () => {
    if (!selectedUser) return;
    if (!canEditSelectedUser) {
      toast.error("You do not have permission to edit this account.");
      return;
    }
    setSavingChanges(true);
    try {
      const profileUpdates: Record<string, unknown> = {
        username: editUsername.trim(),
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
        bio: editBio.trim(),
        theme: editTheme,
        language: editLanguage,
        avatar_url: editAvatarUrl,
        cover_photo: editCoverPhoto,
        referred_by: editReferredBy,
        vip_status: editVipStatus,
        coins: Number(editCoins),
        xp: Number(editXp),
        wallet_balance: Number(editWalletBalance),
        verified: editVerified,
        status: editStatus,
      };

      await updateFn({
        data: {
          targetUserId: selectedUser.id,
          profileUpdates: profileUpdates as any,
          roleUpdate: editRole as any,
          permissionsUpdate: editRole === "admin" ? editPermissions : undefined
        }
      });
      toast.success("User profile successfully updated.");
      setDrawerOpen(false);
      loadUsers();
    } catch (e: any) {
      toast.error(e.message || "Failed to save profile changes.");
    } finally {
      setSavingChanges(false);
    }
  };

  // Reset Password direct change
  const handleResetPassword = async () => {
    if (!selectedUser || newPassword.length < 6) return;
    if (!canManageSecurity) {
      toast.error("Only super admins can reset passwords.");
      return;
    }
    try {
      await passwordFn({
        data: {
          targetUserId: selectedUser.id,
          newPassword
        }
      });
      toast.success("Password updated successfully.");
      setPwResetOpen(false);
      setNewPassword("");
    } catch (e: any) {
      toast.error(e.message || "Failed to change password.");
    }
  };

  // Direct email updates
  const handleEmailChange = async () => {
    if (!selectedUser || !newEmail.trim()) return;
    if (!canManageSecurity) {
      toast.error("Only super admins can change emails.");
      return;
    }
    try {
      await emailFn({
        data: {
          targetUserId: selectedUser.id,
          newEmail: newEmail.trim()
        }
      });
      toast.success("Email address successfully changed.");
      setEmailChangeOpen(false);
      setNewEmail("");
      loadUsers();
    } catch (e: any) {
      toast.error(e.message || "Failed to update email.");
    }
  };

  // Delete User handler
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (!canManageSecurity) {
      toast.error("Only super admins can delete accounts.");
      return;
    }
    if (confirmDeleteUsername.trim().toLowerCase() !== selectedUser.username.toLowerCase()) {
      return toast.error("Confirm by entering correct username.");
    }
    try {
      await deleteFn({ data: { targetUserId: selectedUser.id } });
      toast.success("Account permanently deleted.");
      setConfirmDeleteOpen(false);
      setConfirmDeleteUsername("");
      setDrawerOpen(false);
      loadUsers();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete user.");
    }
  };

  const handleExportEmails = async () => {
    if (!isSuperAdmin) {
      toast.error("Only super admins can export email addresses.");
      return;
    }
    setDownloadingEmails(true);
    try {
      const result = await getEmailsFn();
      const list = Array.isArray((result as any)?.list) ? (result as any).list : [];
      
      const filtered = list.filter((item: any) => {
        if (downloadType === "admins") return item.role === "admin" || item.role === "super_admin";
        if (downloadType === "users") return item.role !== "admin" && item.role !== "super_admin";
        return true;
      });

      if (filtered.length === 0) {
        toast.error("No email records found.");
        return;
      }

      if (downloadFormat === "csv") {
        const headers = ["Email Address", "Username", "Display Name", "Role", "Joined Date"];
        const rows = filtered.map((item: any) => [
          item.email,
          item.username,
          item.name,
          item.role.toUpperCase(),
          item.created_at ? new Date(item.created_at).toLocaleDateString() : ""
        ]);

        const csvContent = [
          headers.join(","),
          ...rows.map((e: any) => e.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `JackpotJungle_Emails_${downloadType.toUpperCase()}_${new Date().toISOString().split("T")[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("CSV Email file downloaded successfully!");
      } else {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
          toast.error("Could not open print window. Please allow popups.");
          return;
        }

        const listRows = filtered.map((item: any) => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: left; font-family: monospace;"><strong>${item.email}</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: left;">@${item.username}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: left;">${item.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: left; text-transform: uppercase; font-size: 10px; font-weight: bold; color: ${item.role.includes("admin") ? "#d97706" : "#059669"};">${item.role}</td>
          </tr>
        `).join("");

        printWindow.document.write(`
          <html>
            <head>
              <title>Jackpot Jungle Users Email Export</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { text-align: left; padding: 8px; border-bottom: 2px solid #ddd; background-color: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
                .header { margin-bottom: 20px; border-bottom: 3px solid #10b981; padding-bottom: 12px; }
                .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1 style="margin: 0; color: #10b981; font-size: 24px;">JACKPOT JUNGLE</h1>
                <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #4b5563;">Email Address Export</p>
              </div>
              <div class="meta">
                <p style="margin: 4px 0;"><strong>Export Type:</strong> ${downloadType.toUpperCase()}</p>
                <p style="margin: 4px 0;"><strong>Total Count:</strong> ${filtered.length} records</p>
                <p style="margin: 4px 0;"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Email Address</th>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  ${listRows}
                </tbody>
              </table>
              <script>window.print();</script>
            </body>
          </html>
        `);
        printWindow.document.close();
        toast.success("PDF print layout prepared!");
      }
      setDownloadEmailsOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to download emails.");
    } finally {
      setDownloadingEmails(false);
    }
  };

  // Pagination totals
  const totalPages = Math.ceil(totalCount / LIMIT) || 1;
// ... (in JSX return)

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Users Management
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your casino players, roles, verification status, and wallet limits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border/80 h-10 select-none">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-muted-foreground">{totalCount} registered players</span>
          </div>

          {isSuperAdmin && (
            <Button
              onClick={() => setDownloadEmailsOpen(true)}
              variant="outline"
              className="rounded-full gap-1.5 h-10 text-xs font-bold font-sans bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20"
            >
              <Mail className="h-4 w-4" />
              <span>Download Emails</span>
            </Button>
          )}
        </div>
      </div>

      {/* Control bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by username, email, display name, or user ID..."
              className="pl-9 rounded-full bg-card"
            />
          </div>

          {/* Sort selection & direction toggle */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold font-mono"
            >
              <option value="created_at">Joined Date</option>
              <option value="username">Username</option>
              <option value="last_seen">Last Active</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => setSortDesc(!sortDesc)}
            >
              <Filter className={`h-4 w-4 transition-transform ${sortDesc ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filter Scroll buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          {[
            { id: "all", label: "All Users" },
            { id: "online", label: "Online" },
            { id: "offline", label: "Offline" },
            { id: "admins", label: "Admins" },
            { id: "super_admins", label: "Super Admins" },
            { id: "normal_users", label: "Normal Users" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setFilter(item.id); setPage(1); }}
              className={`px-4 h-8 rounded-full text-xs font-semibold uppercase shrink-0 transition-colors ${
                filter === item.id 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-card border border-border hover:bg-secondary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main user table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading && users.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground font-semibold">Loading casino database...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center gap-2">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="font-bold text-foreground">No players found</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Try adjusting your query, filters, or searching for other keywords.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="border-b border-border/80 bg-secondary/35 text-[10px] uppercase tracking-wider text-muted-foreground font-bold select-none">
                  <th className="p-4 pl-6">Player profile</th>
                  <th className="p-4">User ID</th>
                  <th className="p-4">Permissions</th>
                  <th className="p-4">Activity Log</th>
                  <th className="p-4 pr-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {users.map((u) => {
                  const displayName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username;
                  return (
                    <tr 
                      key={u.id}
                      onClick={() => handleUserClick(u)}
                      className="hover:bg-secondary/20 cursor-pointer transition-colors group"
                    >
                      {/* Name / Avatar / Email */}
                      <td className="p-4 pl-6 flex items-center gap-3">
                        <div className="relative">
                          <Avatar name={u.username} url={u.avatar_url} size={42} />
                          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-card ${u.online ? "bg-green-500" : "bg-muted"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {displayName}
                            </span>
                            {u.is_blocked && (
                              <Badge variant="destructive" className="h-4 text-[9px] px-1 font-bold">Blocked</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">@{u.username} · {u.email}</p>
                        </div>
                      </td>

                      {/* ID */}
                      <td className="p-4">
                        <span className="font-mono text-xs font-semibold text-muted-foreground select-all">
                          {u.id.substring(0, 18)}...
                        </span>
                      </td>

                      {/* Role */}
                      <td className="p-4">
                        {u.role === "super_admin" ? (
                          <Badge className="bg-amber-500 hover:bg-amber-600 gap-1"><ShieldCheck className="h-3 w-3" /> Super Admin</Badge>
                        ) : u.role === "admin" ? (
                          <Badge className="bg-blue-500 hover:bg-blue-600 gap-1"><Shield className="h-3 w-3" /> Admin</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground font-semibold">User</span>
                        )}
                      </td>



                      {/* Join / Active details */}
                      <td className="p-4">
                        <div className="text-xs space-y-0.5 text-muted-foreground">
                          <p>Join: {format(new Date(u.created_at), "MMM d, yyyy")}</p>
                          <p>Active: {u.last_seen ? formatDistanceToNow(new Date(u.last_seen), { addSuffix: true }) : "—"}</p>
                        </div>
                      </td>

                      {/* View Actions Trigger */}
                      <td className="p-4 pr-6 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-full border border-border bg-card shadow-sm hover:bg-secondary transition-colors"
                        >
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border select-none bg-secondary/15">
            <span className="text-xs text-muted-foreground font-semibold">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
                className="h-8 w-8 rounded-lg"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(page + 1)}
                className="h-8 w-8 rounded-lg"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Editor slide-out side drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-card border-l border-border p-0 flex flex-col h-full">
          {selectedUser && (
            <>
              {/* Cover Photo header */}
              <div className="relative h-32 bg-secondary shrink-0 overflow-hidden select-none">
                {editCoverPhoto ? (
                  <img src={editCoverPhoto} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-r from-primary/10 via-accent/5 to-secondary" />
                )}
                

                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                  className="hidden"
                />
              </div>

              {/* Drawer User Title Profile details */}
              <div className="px-6 pb-4 border-b border-border/80 shrink-0 relative flex flex-col items-center sm:items-start text-center sm:text-left">
                {/* Profile picture */}
                <div className="relative -mt-12 mb-3 z-10">
                  <div className="rounded-full ring-4 ring-card overflow-hidden bg-card">
                    <Avatar name={editUsername} url={editAvatarUrl} size={92} />
                  </div>
                  {canEditSelectedUser && (
                    <button 
                      onClick={() => avatarFileRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="absolute bottom-0 right-0 h-8 w-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full flex items-center justify-center shadow-lg transition-all"
                    >
                      {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>

                <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">
                      {editFirstName && editLastName ? `${editFirstName} ${editLastName}` : editUsername}
                    </h3>
                    <p className="text-xs text-muted-foreground font-semibold">@{editUsername} · {selectedUser.email}</p>
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    {editStatus === "banned" ? (
                      <Badge variant="destructive">Banned</Badge>
                    ) : editStatus === "suspended" ? (
                      <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 font-bold border-amber-500/20">Suspended</Badge>
                    ) : (
                      <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/20 font-bold border-green-500/20">Active</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs controls */}
              <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-6 my-4 bg-secondary select-none">
                  <TabsTrigger value="general" className="flex-1 text-xs">General</TabsTrigger>
                  <TabsTrigger value="security" className="flex-1 text-xs">Security</TabsTrigger>
                  <TabsTrigger value="wallet" className="flex-1 text-xs">VIP & XP</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0 space-y-4">
                  {!canEditSelectedUser && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 select-none">
                      <p className="text-xs text-amber-500 font-semibold flex items-center gap-1.5 leading-relaxed">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        {selectedUser?.role === "super_admin"
                          ? "Super Administrator accounts are read-only and cannot be modified."
                          : isSuperAdmin
                            ? "This account cannot be edited."
                            : "Only super admins can edit user accounts. You can view details only."}
                      </p>
                    </div>
                  )}
                  {/* General Tab */}
                  <TabsContent value="general" className="space-y-4 m-0 focus:outline-none">
                    {/* Username */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Username</label>
                      <Input
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="bg-secondary/40 border-border/80"
                        disabled={!canEditSelectedUser}
                      />
                    </div>

                    {/* Display Name */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase">First Name</label>
                        <Input
                          value={editFirstName}
                          onChange={(e) => setEditFirstName(e.target.value)}
                          className="bg-secondary/40 border-border/80"
                          disabled={!canEditSelectedUser}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Last Name</label>
                        <Input
                          value={editLastName}
                          onChange={(e) => setEditLastName(e.target.value)}
                          className="bg-secondary/40 border-border/80"
                          disabled={!canEditSelectedUser}
                        />
                      </div>
                    </div>

                    {/* Phone & Address */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Phone Number</label>
                      <Input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="bg-secondary/40 border-border/80"
                        placeholder="Not specified"
                        disabled={!canEditSelectedUser}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Address</label>
                      <Input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="bg-secondary/40 border-border/80"
                        placeholder="Not specified"
                        disabled={!canEditSelectedUser}
                      />
                    </div>

                    {/* Bio */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Bio</label>
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        className="w-full rounded-lg border border-border/80 bg-secondary/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px]"
                        placeholder="Casinò bio..."
                        disabled={!canEditSelectedUser}
                      />
                    </div>

                    {/* Referrer Relationship (Referred By) */}
                    <div className="space-y-2 border-t border-border/40 pt-4 mt-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                        <Gift className="h-4 w-4 text-primary" />
                        Referral Link Relationship
                      </label>
                      
                      {referrerProfile ? (
                        <div className="bg-secondary/40 border border-border/80 rounded-xl p-3.5 flex items-center justify-between gap-3 text-left">
                          <div>
                            <p className="text-xs font-bold text-foreground">
                              {referrerProfile.first_name && referrerProfile.last_name 
                                ? `${referrerProfile.first_name} ${referrerProfile.last_name}` 
                                : referrerProfile.username}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">@{referrerProfile.username} · ID: {referrerProfile.id.substring(0, 13)}...</p>
                          </div>
                          {canEditSelectedUser && (
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setEditReferredBy(null)}
                              className="h-8 text-destructive hover:bg-destructive/10 rounded-lg text-xs font-bold font-sans"
                            >
                              Remove Link
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {canEditSelectedUser ? (
                            <div className="relative">
                              <Input
                                value={referrerQuery}
                                onChange={(e) => setReferrerQuery(e.target.value)}
                                placeholder="Search by username or email to link referrer..."
                                className="bg-secondary/40 border-border/80 text-xs rounded-xl pr-8"
                              />
                              {searchingReferrer && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              )}
                              
                              {referrerResults.length > 0 && (
                                <div className="absolute left-0 right-0 z-30 mt-1.5 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden divide-y divide-border/60">
                                  {referrerResults.map((r) => (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => {
                                        setEditReferredBy(r.id);
                                        setReferrerQuery("");
                                        setReferrerResults([]);
                                      }}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary flex flex-col gap-0.5"
                                    >
                                      <span className="font-bold text-foreground">
                                        {r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : r.username}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">@{r.username} · {r.email}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground font-semibold italic">No referrer relationship linked</p>
                          )}
                        </div>
                      )}
                      
                      <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 select-none text-left">
                        <p className="text-[11px] text-primary/80 font-medium leading-relaxed">
                          💡 <strong>Referral Bonus Info:</strong> Referral bonuses are not automatic. After linking the relationship, the bonus reward must be manually verified and sent via Page Message in the user chat based on page rules.
                        </p>
                      </div>
                    </div>

                    {/* Theme & Language */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Theme</label>
                        <select
                          value={editTheme}
                          onChange={(e) => setEditTheme(e.target.value)}
                          className="w-full h-10 rounded-lg border border-border/80 bg-secondary/40 px-3 text-sm"
                          disabled={!canEditSelectedUser}
                        >
                          <option value="dark">Dark Theme</option>
                          <option value="light">Light Theme</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Language</label>
                        <select
                          value={editLanguage}
                          onChange={(e) => setEditLanguage(e.target.value)}
                          className="w-full h-10 rounded-lg border border-border/80 bg-secondary/40 px-3 text-sm"
                          disabled={!canEditSelectedUser}
                        >
                          <option value="en">English (US)</option>
                          <option value="de">German</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                        </select>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Security Tab */}
                  <TabsContent value="security" className="space-y-4 m-0 focus:outline-none">
                    {!isSuperAdmin && (
                      <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-1">
                        <p className="text-sm font-semibold text-foreground">Super admin only</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Role changes, account status, password/email resets, and deleting accounts can only be done by a super admin.
                        </p>
                      </div>
                    )}

                    {/* Role update (Super admin only) */}
                    {isSuperAdmin && (
                      <div className="space-y-1.5 bg-secondary/30 border border-border/60 rounded-xl p-4">
                        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                          <ShieldCheck className="h-4 w-4 text-amber-500" />
                          Security Role Access
                        </label>
                        <p className="text-[11px] text-muted-foreground mb-2">
                          Only super admins can modify administrative team access privileges.
                        </p>
                        <select
                          value={editRole}
                          onChange={(e) => {
                            const newRole = e.target.value;
                            setEditRole(newRole);
                            if (newRole === "admin" && (!selectedUser?.permissions || selectedUser.permissions.length === 0)) {
                              setEditPermissions(DEFAULT_PERMISSIONS);
                            }
                          }}
                          className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm"
                          disabled={!canManageSecurity}
                        >
                          <option value="user">Regular User</option>
                          <option value="admin">Administrator</option>
                          <option value="super_admin">Super Administrator</option>
                        </select>

                        {/* Sidebar permissions list if role is admin */}
                        {editRole === "admin" && (
                          <div className="space-y-2 border-t border-border/50 pt-3 mt-3">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Sidebar Permissions</label>
                            <div className="grid grid-cols-2 gap-2 mt-1 max-h-48 overflow-y-auto p-2 border border-border rounded-lg bg-card">
                              {AVAILABLE_PERMISSIONS.map((p) => {
                                const checked = editPermissions.includes(p.id);
                                return (
                                  <label key={p.id} className="flex items-center gap-2 text-xs font-medium cursor-pointer p-1 hover:bg-secondary/40 rounded select-none">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!canManageSecurity}
                                      onChange={() => {
                                        setEditPermissions(prev =>
                                          checked ? prev.filter(x => x !== p.id) : [...prev, p.id]
                                        );
                                      }}
                                      className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                                    />
                                    <span>{p.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status Suspension / Block Toggles */}
                    {isSuperAdmin && (
                    <div className="space-y-3 bg-secondary/30 border border-border/60 rounded-xl p-4">
                      <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                        <Ban className="h-4 w-4 text-destructive" />
                        Account Status Toggles
                      </label>
                      
                      <div className="flex gap-2">
                        {(["active", "suspended", "banned"] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setEditStatus(st)}
                            disabled={!canManageSecurity}
                            className={`flex-1 h-9 rounded-lg text-xs font-semibold uppercase transition-colors ${
                              editStatus === st 
                                ? st === "active" ? "bg-green-500 text-white" : st === "suspended" ? "bg-amber-500 text-white" : "bg-destructive text-white"
                                : "bg-card border border-border hover:bg-secondary disabled:opacity-50"
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                    )}

                    {/* Quick administrative actions */}
                    {isSuperAdmin && (
                    <div className="space-y-3 bg-secondary/30 border border-border/60 rounded-xl p-4">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Security Operations</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setPwResetOpen(true)}
                          disabled={!canManageSecurity}
                          className="w-full justify-start h-10 gap-2 border-border"
                        >
                          <KeyRound className="h-4 w-4 text-primary shrink-0" />
                          <span>Reset Password</span>
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => {
                            setNewEmail(selectedUser.email || "");
                            setEmailChangeOpen(true);
                          }}
                          disabled={!canManageSecurity}
                          className="w-full justify-start h-10 gap-2 border-border"
                        >
                          <Mail className="h-4 w-4 text-primary shrink-0" />
                          <span>Change Email</span>
                        </Button>
                      </div>
                    </div>
                    )}

                    {/* Danger zone */}
                    {isSuperAdmin && (
                    <div className="border border-destructive/20 bg-destructive/5 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
                        <h4 className="font-bold text-sm text-destructive">Danger Zone</h4>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Permanently deleting a user will destroy their player profile, casino ledger transactions, and auth credentials. This cannot be undone.
                      </p>
                      <Button 
                        type="button" 
                        variant="destructive"
                        onClick={() => setConfirmDeleteOpen(true)}
                        disabled={!canManageSecurity}
                        className="w-full h-9 rounded-lg"
                      >
                        Delete Player Account
                      </Button>
                    </div>
                    )}
                  </TabsContent>

                  {/* Balance / VIP Tab */}
                  <TabsContent value="wallet" className="space-y-4 m-0 focus:outline-none">
                    {!isSuperAdmin && (
                      <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-1">
                        <p className="text-sm font-semibold text-foreground">Super admin only</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          VIP level and XP can only be changed by a super admin.
                        </p>
                      </div>
                    )}

                    {/* XP & Level */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                        <Award className="h-4 w-4 text-blue-500" />
                        Experience Points (XP)
                      </label>
                      <Input
                        type="number"
                        value={editXp}
                        onChange={(e) => setEditXp(Number(e.target.value))}
                        className="bg-secondary/40 border-border/80 font-bold"
                        disabled={!canManageSecurity}
                      />
                    </div>

                    {/* VIP Level selection */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                        <Award className="h-4 w-4 text-amber-500" />
                        VIP Status Level
                      </label>
                      <select
                        value={editVipStatus}
                        onChange={(e) => setEditVipStatus(e.target.value)}
                        className="w-full h-10 rounded-lg border border-border/80 bg-secondary/40 px-3 text-sm font-semibold"
                        disabled={!canManageSecurity}
                      >
                        <option value="none">No VIP Level</option>
                        <option value="bronze">Bronze Membership</option>
                        <option value="silver">Silver Membership</option>
                        <option value="gold">Gold Membership</option>
                        <option value="platinum">Platinum Membership</option>
                        <option value="diamond">Diamond VIP Membership</option>
                      </select>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>

              {/* Fixed drawer footer controls */}
              <div className="p-4 border-t border-border bg-card flex gap-2 shrink-0 select-none">
                {!canEditSelectedUser ? (
                  <Button 
                    onClick={() => setDrawerOpen(false)}
                    className="w-full h-11 rounded-xl"
                  >
                    Close View
                  </Button>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => setDrawerOpen(false)}
                      className="flex-1 h-11 rounded-xl"
                      disabled={savingChanges}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSaveChanges}
                      className="flex-1 h-11 rounded-xl"
                      disabled={savingChanges}
                    >
                      {savingChanges ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Changes
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reset Password Modal */}
      <AlertDialog open={pwResetOpen} onOpenChange={setPwResetOpen}>
        <AlertDialogContent className="w-full max-w-sm bg-card border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Administrative Password Reset</AlertDialogTitle>
            <AlertDialogDescription>
              Instantly change the user's password. The user will be able to log in with this new password immediately without OTP validation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 characters)"
              className="pr-10 font-sans"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPwResetOpen(false); setNewPassword(""); }} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleResetPassword} 
              disabled={newPassword.length < 6}
              className="bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg font-sans"
            >
              Change Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Email Modal */}
      <AlertDialog open={emailChangeOpen} onOpenChange={setEmailChangeOpen}>
        <AlertDialogContent className="w-full max-w-sm bg-card border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Administrative Email Update</AlertDialogTitle>
            <AlertDialogDescription>
              Directly change the user's email address. The change is confirmed instantly. No OTP will be sent to the old or new address.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Enter new email address"
              className="font-sans"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setEmailChangeOpen(false); setNewEmail(""); }} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleEmailChange} 
              disabled={!newEmail.trim() || newEmail.trim() === selectedUser?.email}
              className="bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg font-sans"
            >
              Update Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Modal */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="w-full max-w-md bg-card border border-border border-destructive/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-1.5">
              <ShieldAlert className="h-5 w-5" />
              Confirm Permanent Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground select-none">
              This action is destructive and will remove player <span className="font-semibold text-foreground">@{selectedUser?.username}</span> permanently from both Auth databases and casino ledger systems.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 space-y-1.5">
            <p className="text-xs text-muted-foreground font-semibold uppercase">
              Type the username to confirm deletion:
            </p>
            <Input
              value={confirmDeleteUsername}
              onChange={(e) => setConfirmDeleteUsername(e.target.value)}
              placeholder={selectedUser?.username}
              className="border-destructive/30 focus-visible:ring-destructive font-sans"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmDeleteOpen(false); setConfirmDeleteUsername(""); }} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteUser}
              disabled={confirmDeleteUsername.trim().toLowerCase() !== selectedUser?.username.toLowerCase()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/95 rounded-lg font-sans"
            >
              Permanently Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Download Emails Dialog — super admin only */}
      {isSuperAdmin && (
      <Dialog open={downloadEmailsOpen} onOpenChange={setDownloadEmailsOpen}>
        <DialogContent className="w-full max-w-sm p-6 bg-card border border-border rounded-3xl shadow-2xl flex flex-col gap-4 text-foreground select-none">
          <div className="flex flex-col items-center gap-2 text-center border-b border-border pb-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg">Export Email Addresses</h3>
            <p className="text-xs text-muted-foreground">
              Choose who you want to export and select the file format.
            </p>
          </div>

          <div className="space-y-4 py-2">
            {/* Export Target Option */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase">Filter Target</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "users", label: "Users" },
                  { id: "admins", label: "Admins" }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDownloadType(t.id as any)}
                    className={`h-9 rounded-xl text-xs font-bold transition-all border ${
                      downloadType === t.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/45 text-muted-foreground border-border hover:bg-secondary"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Export Format Option */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase">File Format</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "csv", label: "CSV File" },
                  { id: "pdf", label: "PDF Document" }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDownloadFormat(f.id as any)}
                    className={`h-9 rounded-xl text-xs font-bold transition-all border ${
                      downloadFormat === f.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/45 text-muted-foreground border-border hover:bg-secondary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 pt-3 border-t border-border mt-1">
            <Button
              variant="outline"
              onClick={() => setDownloadEmailsOpen(false)}
              disabled={downloadingEmails}
              className="flex-1 rounded-xl h-11 text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExportEmails}
              disabled={downloadingEmails}
              className="flex-1 rounded-xl h-11 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 flex items-center justify-center gap-1.5"
            >
              {downloadingEmails && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Export</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
