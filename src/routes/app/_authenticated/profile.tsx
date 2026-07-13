import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, HamburgerButton } from "@/components/messenger/AppShell";
import { Avatar } from "@/components/messenger/Avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Camera, Loader2, Bell, BellOff, Wallet, History, FileText, Download, Printer, CheckCircle, Share2, Shield, Trash2, Smartphone, Laptop, Globe, User, KeyRound, Award } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { getWalletHistoryUser } from "@/lib/wallet.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShareProfileModal } from "@/components/messenger/ShareProfileModal";
import { getActiveSessionsUser, terminateSessionUser } from "@/lib/admin-super.functions";
import { getUserRewardHistory } from "@/lib/api/vip-reward-engine/history.functions";
import { getUserVipDashboardStats } from "@/lib/api/vip-reward-engine/dashboard.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/app/_authenticated/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "Profile — JJ Messenger" }] }),
  component: ProfilePage,
});

export function getVipBadgeUrl(status: string | null | undefined): string | null {
  if (!status || status === "none") return null;
  const normalized = status.toLowerCase();
  if (normalized === "platinum") return "/platium.png";
  if (normalized === "diamond") return "/dimond.png";
  if (normalized === "black_diamond" || normalized === "blackvip") return "/blackvip.png";
  return `/${normalized}.png`;
}

export function getVipBadgeStyles(status: string | null | undefined) {
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
  } else if (normalized === "black_diamond" || normalized === "blackvip") {
    label = "Black Diamond VIP";
    color = "#000000";
  }
  
  return { label, color };
}

type Profile = {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  friend_code: string;
  referral_code: string;
  avatar_url: string | null;
  created_at: string;
  wallet_balance?: number;
  credit_balance?: number;
  wallet_deposits?: number;
  wallet_released?: number;
  wallet_used?: number;
  wallet_last_updated?: string;
  vip_status?: string | null;
};

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown Device";
  const lowercase = ua.toLowerCase();
  
  let os = "Unknown OS";
  if (lowercase.includes("windows")) os = "Windows PC";
  else if (lowercase.includes("macintosh") || lowercase.includes("mac os")) os = "Mac";
  else if (lowercase.includes("iphone") || lowercase.includes("ipad")) os = "iPhone/iPad";
  else if (lowercase.includes("android")) os = "Android Device";
  else if (lowercase.includes("linux")) os = "Linux PC";

  let browser = "Web Browser";
  if (lowercase.includes("chrome") || lowercase.includes("chromium")) browser = "Chrome";
  else if (lowercase.includes("firefox")) browser = "Firefox";
  else if (lowercase.includes("safari") && !lowercase.includes("chrome")) browser = "Safari";
  else if (lowercase.includes("edge")) browser = "Edge";
  else if (lowercase.includes("opr") || lowercase.includes("opera")) browser = "Opera";
  
  return `${os} (${browser})`;
}

function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  // Load profile instantly from cache; the useEffect below will refresh from the server.
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("jj_cached_my_profile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [walletHistory, setWalletHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "wallet" | "credit">("all");
  const [shareOpen, setShareOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [settingPw, setSettingPw] = useState(false);

  // Sub-tab selection state
  const [activeSubTab, setActiveSubTab] = useState<"profile" | "wallet" | "logins" | "vipRewards">("profile");
  const getVipHistoryFn = useServerFn(getUserRewardHistory);
  const getVipStatsFn = useServerFn(getUserVipDashboardStats);
  const [vipRewardsHistory, setVipRewardsHistory] = useState<any[]>([]);
  const [loadingVipHistory, setLoadingVipHistory] = useState(false);
  const [vipDashboardStats, setVipDashboardStats] = useState<any>(null);
  const [loadingVipDashboard, setLoadingVipDashboard] = useState(false);
  const [vipHistoryPage, setVipHistoryPage] = useState(1);

  // MFA states
  const [mfaStatus, setMfaStatus] = useState<"unverified" | "enrolling" | "active">("unverified");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

  // Elevation states
  const [aalState, setAalState] = useState<{ current: string; next: string } | null>(null);
  const [elevationCode, setElevationCode] = useState("");
  const [elevating, setElevating] = useState(false);
  const [elevated, setElevated] = useState(false);

  // Active sessions / logins states
  const getSessionsFn = useServerFn(getActiveSessionsUser);
  const terminateSessionFn = useServerFn(terminateSessionUser);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Check MFA status
  const checkMFA = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verifiedTotp = data.all.find(f => (f.factorType === "totp" || (f as any).factor_type === "totp") && f.status === "verified");
      if (verifiedTotp) {
        setMfaStatus("active");
        setMfaFactorId(verifiedTotp.id);
      } else {
        setMfaStatus("unverified");
      }
    } catch {}
  };

  const checkAalStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error && data) {
        setAalState({ current: data.currentLevel, next: data.nextLevel });
        if (data.currentLevel === "aal2") {
          setElevated(true);
        }
      }
    } catch {}
  };

  useEffect(() => {
    checkMFA();
    checkAalStatus();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setCurrentSessionId(data.session.id);
      }
    });
  }, []);

  const loadVipHistory = async () => {
    setLoadingVipHistory(true);
    setLoadingVipDashboard(true);
    try {
      const historyRes = await getVipHistoryFn();
      if (historyRes.success && historyRes.history) {
        setVipRewardsHistory(historyRes.history);
      }
      const statsRes = await getVipStatsFn();
      if (statsRes.success) {
        setVipDashboardStats(statsRes);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load VIP history");
    } finally {
      setLoadingVipHistory(false);
      setLoadingVipDashboard(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "vipRewards") {
      loadVipHistory();
    }
  }, [activeSubTab]);

  const handleEnableMFA = async () => {
    setMfaLoading(true);
    try {
      // Clean up any existing unverified factors to avoid duplication errors
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (!listError && factors?.all) {
        const unverified = factors.all.filter(f => f.status === "unverified" || (f as any).status === "unverified");
        for (const factor of unverified) {
          console.log("[MFA_DEBUG] Cleaning up unverified factor:", factor.id);
          try {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          } catch {}
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "JackpotJungle"
      });
      if (error) throw error;
      
      setMfaFactorId(data.id);
      setMfaQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
      setMfaStatus("enrolling");
      setMfaCode("");
    } catch (err: any) {
      toast.error(err.message || "Failed to start 2FA enrollment");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (!mfaFactorId) return;
    setMfaLoading(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      setMfaStatus("unverified");
      setMfaFactorId("");
      setMfaQrCode("");
      setMfaSecret("");
    } catch {}
    setMfaLoading(false);
  };

  const handleVerifyEnroll = async () => {
    setMfaLoading(true);
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode
      });
      if (verifyErr) throw verifyErr;

      toast.success("Two-Factor Authentication (2FA) is now enabled!");
      setMfaStatus("active");
      setMfaCode("");
    } catch (err: any) {
      toast.error(err.message || "Code verification failed. Check your app and try again.");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    if (!mfaFactorId) return;
    setMfaLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      toast.success("Two-Factor Authentication disabled.");
      setMfaStatus("unverified");
      setMfaFactorId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to disable MFA");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setSettingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully!");
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setSettingPw(false);
    }
  };

  const handleElevateSession = async () => {
    setElevating(true);
    try {
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;
      const totpFactor = factors.totp.find(f => f.status === "verified");
      if (!totpFactor) throw new Error("No verified factor found");

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.id,
        code: elevationCode
      });
      if (verifyErr) throw verifyErr;

      toast.success("Identity verified! Settings unlocked.");
      setElevated(true);
      setAalState(prev => prev ? { ...prev, current: "aal2" } : null);
    } catch (err: any) {
      toast.error(err.message || "Failed to verify authenticator code.");
    } finally {
      setElevating(false);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await getSessionsFn();
      setSessions(res.sessions || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load active sessions");
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const res = await terminateSessionFn({ data: { sessionId } });
      if (res.ok) {
        toast.success("Device logged out successfully!");
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to terminate device session");
    }
  };

  const filteredHistory = walletHistory.filter((tx) => {
    if (ledgerFilter !== "all") {
      const isCreditAction = ["credit_added", "credit_released", "deduct_credit", "transfer", "reset"].includes(tx.action);
      const isWalletAction = ["deposit", "deduction", "correction", "refund", "bonus", "reset"].includes(tx.action);
      if (ledgerFilter === "credit" && !isCreditAction) return false;
      if (ledgerFilter === "wallet" && !isWalletAction) return false;
    }
    if (startDate) {
      const txDate = new Date(tx.created_at);
      const limitDate = new Date(startDate + "T00:00:00");
      if (txDate < limitDate) return false;
    }
    if (endDate) {
      const txDate = new Date(tx.created_at);
      const limitDate = new Date(endDate + "T23:59:59.999");
      if (txDate > limitDate) return false;
    }
    return true;
  });

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await getWalletHistoryUser();
      setWalletHistory(data ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load wallet transaction history");
    } finally {
      setLoadingHistory(false);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const email = user?.email ?? null;
  const isGoogle = user?.app_metadata?.provider === "google" || user?.identities?.some((id: any) => id.provider === "google");

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    supabase.from("profiles")
      .select("id, username, first_name, last_name, avatar_url, friend_code, referral_code, created_at, notif_enabled, wallet_balance, credit_balance, wallet_deposits, wallet_released, wallet_used, wallet_last_updated, vip_status" as any)
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data) return;
        const profileData = data as unknown as Profile;
        setProfile(profileData);
        setUsername((data as any).username);
        setFirstName((data as any).first_name ?? "");
        setLastName((data as any).last_name ?? "");
        setNotifEnabled((data as any).notif_enabled ?? true);
        // Persist to localStorage so the Profile tab renders instantly next visit
        try {
          localStorage.setItem("jj_cached_my_profile", JSON.stringify(profileData));
        } catch {}

      });

    // Realtime listener for balance adjustments from admin panel
    const channel = supabase
      .channel(`profile-wallet-changes-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && mounted) {
            setProfile((prev) => prev ? { ...prev, ...(payload.new as Profile) } : null);
          }
        }
      )
      .subscribe();

    if (typeof window !== "undefined" && "Notification" in window) setPermission(Notification.permission);
    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, [user]);

  async function toggleNotif(v: boolean) {
    if (!profile) return;
    setNotifEnabled(v);
    await supabase.from("profiles").update({ notif_enabled: v } as any).eq("id", profile.id);
    if (v && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      const p = await Notification.requestPermission();
      setPermission(p);
    }
  }

  async function requestPerm() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") toast.success("Browser notifications enabled.");
  }


  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      username,
      first_name: firstName.trim(),
      last_name: lastName.trim()
    }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated.");
      setProfile({
        ...profile,
        username,
        first_name: firstName.trim(),
        last_name: lastName.trim()
      });
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;

    // Static image validation
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
      const { uploadAndSign } = await import("@/lib/chat-media");
      const url = await uploadAndSign("avatars", profile.id, file, ext, file.type);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
      if (updErr) throw updErr;
      setProfile({ ...profile, avatar_url: url });
      toast.success("Profile picture updated.");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    }
    setUploading(false);
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  const exportUserCSV = () => {
    if (filteredHistory.length === 0) return toast.error("No transactions to export.");

    let headers: string[] = [];
    let rows: any[][] = [];

    if (ledgerFilter === "wallet") {
      headers = ["Date & Time", "Action", "Amount", "Balance Before", "Balance After", "Reason", "Notes"];
      rows = filteredHistory.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.avail_before).toFixed(2)}`,
        `$${Number(tx.avail_after).toFixed(2)}`,
        tx.reason,
        tx.notes || ""
      ]);
    } else if (ledgerFilter === "credit") {
      headers = ["Date & Time", "Action", "Amount", "Credit Before", "Credit After", "Reason", "Notes"];
      rows = filteredHistory.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.credit_before).toFixed(2)}`,
        `$${Number(tx.credit_after).toFixed(2)}`,
        tx.reason,
        tx.notes || ""
      ]);
    } else {
      headers = ["Date & Time", "Action", "Amount", "Avail Before", "Avail After", "Credit Before", "Credit After", "Reason", "Notes"];
      rows = filteredHistory.map(tx => [
        new Date(tx.created_at).toLocaleString(),
        tx.action.toUpperCase(),
        `$${Number(tx.amount).toFixed(2)}`,
        `$${Number(tx.avail_before).toFixed(2)}`,
        `$${Number(tx.avail_after).toFixed(2)}`,
        `$${Number(tx.credit_before).toFixed(2)}`,
        `$${Number(tx.credit_after).toFixed(2)}`,
        tx.reason,
        tx.notes || ""
      ]);
    }

    const csvContent = [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `JJ_Wallet_Statement_${ledgerFilter.toUpperCase()}_${profile?.username || "user"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV Statement exported successfully!");
  };

  const printStatement = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Could not open print window.");

    const customerName = profile?.first_name
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile?.username || "Valued Customer";

    // Table Headers
    let tableHeaders = "";
    let colspan = 8;
    if (ledgerFilter === "wallet") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Avail. Before</th>
        <th style="text-align: right;">Avail. After</th>
        <th>Reason</th>
      `;
      colspan = 6;
    } else if (ledgerFilter === "credit") {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Credit Before</th>
        <th style="text-align: right;">Credit After</th>
        <th>Reason</th>
      `;
      colspan = 6;
    } else {
      tableHeaders = `
        <th>Date & Time</th>
        <th>Action</th>
        <th style="text-align: right;">Amount</th>
        <th style="text-align: right;">Avail. Before</th>
        <th style="text-align: right;">Avail. After</th>
        <th style="text-align: right;">Credit Before</th>
        <th style="text-align: right;">Credit After</th>
        <th>Reason</th>
      `;
      colspan = 8;
    }

    const txRows = filteredHistory.map(tx => {
      let cells = `
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(tx.created_at).toLocaleString()}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; font-weight: bold;">${tx.action}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.amount).toFixed(2)}</td>
      `;

      if (ledgerFilter === "wallet") {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_after).toFixed(2)}</td>
        `;
      } else if (ledgerFilter === "credit") {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_after).toFixed(2)}</td>
        `;
      } else {
        cells += `
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.avail_after).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_before).toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(tx.credit_after).toFixed(2)}</td>
        `;
      }

      cells += `
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${tx.reason}</td>
      `;

      return `<tr>${cells}</tr>`;
    }).join("");

    // Summary block
    let summaryHTML = "";
    if (ledgerFilter === "wallet") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(profile?.wallet_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Total Deposited:</strong> $${(profile?.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Total Used:</strong> $${(profile?.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else if (ledgerFilter === "credit") {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(profile?.credit_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Total Released:</strong> $${(profile?.wallet_released ?? 0).toFixed(2)}</p>
        </div>
      `;
    } else {
      summaryHTML = `
        <div>
          <p style="margin: 4px 0;"><strong>Available Balance:</strong> $${(profile?.wallet_balance ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Credit Balance:</strong> $${(profile?.credit_balance ?? 0).toFixed(2)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 4px 0;"><strong>Total Deposited:</strong> $${(profile?.wallet_deposits ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Total Released:</strong> $${(profile?.wallet_released ?? 0).toFixed(2)}</p>
          <p style="margin: 4px 0;"><strong>Total Used:</strong> $${(profile?.wallet_used ?? 0).toFixed(2)}</p>
        </div>
      `;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Jackpot Jungle Ledger Statement</title>
          <style>
            body { font-family: sans-serif; padding: 24px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f5f5f5; text-align: left; padding: 8px; border-bottom: 2px solid #ddd; }
            .header { margin-bottom: 30px; border-bottom: 3px solid #10b981; padding-bottom: 16px; }
            .summary { background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; color: #10b981;">JACKPOT JUNGLE</h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Wallet credit ledger statement</p>
          </div>
          <div>
            <h3 style="margin: 0;">Customer Name: ${customerName}</h3>
            <p style="margin: 4px 0; font-size: 13px;">Username: @${profile?.username}</p>
            <p style="margin: 4px 0; font-size: 13px;">Statement generated: ${new Date().toLocaleString()}</p>
          </div>
          <div class="summary" style="display: flex; justify-content: space-between; margin-top: 20px;">
            ${summaryHTML}
          </div>
          <table>
            <thead>
              <tr>
                ${tableHeaders}
              </tr>
            </thead>
            <tbody>
              ${txRows || `<tr><td colspan="${colspan}" style="text-align: center; padding: 20px;">No transaction records found.</td></tr>`}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (authLoading || !profile) {
    return (
      <AppShell>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="md:hidden p-3 border-b border-border flex items-center gap-2">
          <HamburgerButton />
          <h1 className="font-bold">Profile</h1>
        </div>
        
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-300">
          
          <div className="flex flex-col items-center text-center pt-4 border-b border-border/40 pb-6 select-none">
            <div className="relative">
              <Avatar name={profile.username} url={profile.avatar_url} size={96} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:opacity-90 disabled:opacity-50"
                aria-label="Change profile picture"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickFile}
                className="hidden"
              />
            </div>
            <h1 className="mt-4 text-2xl font-bold flex items-center justify-center gap-2">
              <span>{profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username}</span>
              {profile.vip_status && profile.vip_status !== "none" && (
                <img 
                  src={getVipBadgeUrl(profile.vip_status) || undefined} 
                  alt={`${profile.vip_status} VIP`} 
                  className="h-7 w-auto object-contain select-none inline-block align-middle"
                  title={`${profile.vip_status.toUpperCase()} VIP`}
                />
              )}
            </h1>
            <div className="flex items-center gap-2 mt-1 select-none">
              <span className="text-xs text-muted-foreground font-semibold">@{profile.username}</span>
              {(() => {
                const info = getVipBadgeStyles(profile.vip_status);
                if (!info) return null;
                return (
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
                );
              })()}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
            <div className="flex gap-2.5 mt-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1.5 bg-secondary/50 hover:bg-secondary px-3.5 py-2 rounded-full border border-border/40 font-bold transition-all"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>{uploading ? "Uploading…" : "Change photo"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="text-xs text-primary hover:underline flex items-center gap-1.5 bg-secondary/50 hover:bg-secondary px-3.5 py-2 rounded-full border border-border/40 font-bold transition-all"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Profile</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Sidebar sub-navigation tabs */}
            <div className="w-full md:w-56 shrink-0 flex md:flex-col gap-1 border-b md:border-b-0 md:border-r border-border pb-3 md:pb-0 md:pr-4">
              <button
                type="button"
                onClick={() => setActiveSubTab("profile")}
                className={`flex-1 md:flex-initial flex items-center justify-center md:justify-start gap-2.5 px-3 py-2 text-xs md:text-sm font-bold rounded-xl transition-all ${
                  activeSubTab === "profile" 
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <User className="h-4 w-4" />
                <span>My Profile</span>
              </button>
              
              <button
                type="button"
                onClick={() => setActiveSubTab("wallet")}
                className={`flex-1 md:flex-initial flex items-center justify-center md:justify-start gap-2.5 px-3 py-2 text-xs md:text-sm font-bold rounded-xl transition-all ${
                  activeSubTab === "wallet" 
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Wallet className="h-4 w-4" />
                <span>Wallet Ledger</span>
              </button>
              
              <button
                type="button"
                onClick={() => { setActiveSubTab("logins"); loadSessions(); }}
                className={`flex-1 md:flex-initial flex items-center justify-center md:justify-start gap-2.5 px-3 py-2 text-xs md:text-sm font-bold rounded-xl transition-all ${
                  activeSubTab === "logins" 
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Shield className="h-4 w-4" />
                <span>Logins</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab("vipRewards")}
                className={`flex-1 md:flex-initial flex items-center justify-center md:justify-start gap-2.5 px-3 py-2 text-xs md:text-sm font-bold rounded-xl transition-all ${
                  activeSubTab === "vipRewards" 
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Award className="h-4 w-4" />
                <span>VIP Payouts</span>
              </button>
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 w-full space-y-6">
              {activeSubTab === "profile" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 gap-3">
                    <CodeCard label="Friend code" value={profile.friend_code} onCopy={() => copy(profile.friend_code, "Friend code")} />
                    <CodeCard label="Referral code" value={profile.referral_code} onCopy={() => copy(profile.referral_code, "Referral code")} />
                  </div>

                  <form onSubmit={save} className="bg-secondary rounded-2xl p-5 space-y-4">
                    <h2 className="font-semibold text-foreground">Edit profile</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="fn">First Name</Label>
                        <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="bg-card" />
                      </div>
                      <div>
                        <Label htmlFor="ln">Last Name</Label>
                        <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} className="bg-card" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="u">Username</Label>
                      <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-card" />
                    </div>
                    <Button type="submit" disabled={saving || (username === profile.username && firstName === (profile.first_name ?? "") && lastName === (profile.last_name ?? ""))} className="rounded-full">
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  </form>

                  {aalState && aalState.next === "aal2" && aalState.current !== "aal2" && !elevated ? (
                    <div className="bg-secondary/40 border border-amber-500/20 rounded-2xl p-5 space-y-3 text-xs">
                      <p className="font-semibold text-amber-500 flex items-center gap-1.5">
                        <Shield className="h-4 w-4" /> 2FA Verification Required
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        To lock these settings and update password/emails, please enter your Google Authenticator code first.
                      </p>
                      <form onSubmit={(e) => { e.preventDefault(); handleElevateSession(); }} className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <Label htmlFor="elevate-code" className="text-[10px] uppercase font-bold text-muted-foreground">Authenticator Code</Label>
                          <Input 
                            id="elevate-code" 
                            type="text" 
                            placeholder="000000" 
                            value={elevationCode} 
                            onChange={(e) => setElevationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="bg-card font-mono text-center tracking-widest max-w-[120px] h-9" 
                          />
                        </div>
                        <Button type="submit" disabled={elevationCode.length !== 6 || elevating} size="sm" className="rounded-full">
                          {elevating ? "Verifying..." : "Verify Code"}
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <div className="bg-secondary/40 border border-border/80 rounded-2xl p-5 space-y-3 text-xs">
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        <KeyRound className="h-4 w-4 text-primary" /> 
                        {isGoogle ? "Create Account Password" : "Change Password"}
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        {isGoogle 
                          ? "You logged in via Google. You can create a password below to allow email & password login in the future."
                          : "Update your account password below."}
                      </p>
                      <form onSubmit={handleSetPassword} className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <Label htmlFor="new-pw" className="text-[10px] uppercase font-bold text-muted-foreground">New Password</Label>
                          <Input 
                            id="new-pw" 
                            type="password" 
                            value={newPassword} 
                            onChange={(e) => setNewPassword(e.target.value)} 
                            placeholder="Min 6 characters" 
                            className="bg-card h-9" 
                          />
                        </div>
                        <Button type="submit" disabled={newPassword.length < 6 || settingPw} size="sm" className="rounded-full">
                          {settingPw ? "Updating..." : isGoogle ? "Set Password" : "Update Password"}
                        </Button>
                      </form>
                    </div>
                  )}

                  <div className="bg-secondary rounded-2xl p-5 space-y-4">
                    <h2 className="font-semibold flex items-center gap-2 text-foreground">
                      {notifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} Notifications
                    </h2>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">New message alerts</p>
                        <p className="text-xs text-muted-foreground">Get notified when someone messages you.</p>
                      </div>
                      <Switch checked={notifEnabled} onCheckedChange={toggleNotif} />
                    </div>
                    {notifEnabled && permission !== "granted" && (
                      <Button type="button" variant="outline" size="sm" onClick={requestPerm} className="rounded-full">
                        {permission === "denied" ? "Notifications blocked in browser" : "Enable browser notifications"}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {activeSubTab === "wallet" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="bg-secondary rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold flex items-center gap-2 text-foreground">
                        <Wallet className="h-5 w-5 text-primary" /> Premium Wallet Ledger
                      </h2>
                      <div className="text-[10px] text-muted-foreground uppercase bg-card/65 border border-border px-2 py-0.5 rounded-full font-bold select-none">
                        Owner Only
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="bg-card border border-border/80 rounded-xl p-3.5 flex flex-col justify-between">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Available Balance</p>
                        <p className="text-xl font-black text-green-500 mt-1">${(profile.wallet_balance ?? 0).toFixed(2)}</p>
                      </div>

                      <div className="bg-card border border-border/80 rounded-xl p-3.5 flex flex-col justify-between">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Credit Balance</p>
                        <p className="text-xl font-black text-amber-500 mt-1">${(profile.credit_balance ?? 0).toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-border/60 pt-3 text-xs">
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Total Deposited:</span>
                        <span className="font-semibold text-foreground">${(profile.wallet_deposits ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Total Released From Credit:</span>
                        <span className="font-semibold text-foreground">${(profile.wallet_released ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground font-medium border-t border-border/40 pt-2 text-foreground">
                        <span>Total Used / Deducted:</span>
                        <span className="text-red-500 font-bold">${(profile.wallet_used ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground text-right mt-1 font-semibold">
                        Last updated: {profile.wallet_last_updated ? new Date(profile.wallet_last_updated).toLocaleString() : "Never"}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border/60">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          fetchHistory();
                          setHistoryOpen(true);
                        }}
                        className="flex-1 rounded-full gap-1.5 h-10 font-bold text-xs"
                      >
                        <History className="h-3.5 w-3.5" />
                        History Ledger
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          fetchHistory();
                          setStatementOpen(true);
                        }}
                        className="flex-1 rounded-full gap-1.5 h-10 font-bold text-xs"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Statement
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === "logins" && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  
                  {/* Two-Factor Authentication (MFA) Card */}
                  <div className="bg-secondary rounded-2xl p-5 space-y-4">
                    <h2 className="font-semibold flex items-center gap-2 text-foreground">
                      <Shield className="h-5 w-5 text-primary" /> Two-Factor Authentication
                    </h2>
                    
                    {mfaStatus === "unverified" && (
                      <div className="space-y-4">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Protect your account with an extra layer of security. Verifying logins with Google Authenticator prevents unauthorized access even if someone knows your password.
                        </p>
                        <Button
                          type="button"
                          onClick={handleEnableMFA}
                          disabled={mfaLoading}
                          className="rounded-full w-full sm:w-auto text-xs font-bold font-sans"
                        >
                          {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                          Enable 2FA Protection
                        </Button>
                      </div>
                    )}

                    {mfaStatus === "enrolling" && mfaQrCode && (
                      <div className="space-y-4 flex flex-col items-center text-center p-4 bg-card border border-border/80 rounded-2xl select-none">
                        <p className="text-xs font-semibold text-foreground">Scan QR Code or enter the secret key in Google Authenticator</p>
                        <div className="p-3 bg-white rounded-xl shadow-inner my-1">
                          <img src={mfaQrCode} alt="TOTP QR Code" className="h-40 w-40" />
                        </div>
                        <div className="w-full max-w-xs space-y-1 text-left">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Secret Key</p>
                          <div className="flex gap-1.5 items-center">
                            <input
                              type="text"
                              readOnly
                              value={mfaSecret}
                              className="flex-1 bg-secondary border border-border rounded-lg text-xs font-mono p-2 text-foreground select-all outline-none"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { navigator.clipboard.writeText(mfaSecret); toast.success("Secret copied!"); }}
                              className="rounded-lg h-9 text-xs font-sans font-bold shrink-0"
                            >
                              Copy
                            </Button>
                          </div>
                        </div>

                        <div className="w-full max-w-xs space-y-2 text-left pt-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase">Enter 6-digit Code</label>
                          <Input
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000 000"
                            maxLength={6}
                            className="text-center font-mono text-lg font-black tracking-widest bg-secondary h-11"
                          />
                          <div className="flex gap-2 pt-1.5">
                            <Button
                              variant="outline"
                              onClick={handleCancelEnroll}
                              disabled={mfaLoading}
                              className="flex-1 rounded-xl h-10 text-xs font-bold"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleVerifyEnroll}
                              disabled={mfaCode.length !== 6 || mfaLoading}
                              className="flex-1 rounded-xl h-10 text-xs font-bold"
                            >
                              {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                              Verify Code
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {mfaStatus === "active" && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3.5 bg-green-500/10 border border-green-500/25 text-green-600 rounded-xl">
                          <CheckCircle className="h-5 w-5 shrink-0" />
                          <div className="text-xs">
                            <p className="font-bold">MFA Protection is Active</p>
                            <p className="opacity-95 mt-0.5">Your account is secured. Logins require Google Authenticator codes.</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleDisableMFA}
                          disabled={mfaLoading}
                          className="rounded-full w-full sm:w-auto text-xs font-bold font-sans"
                        >
                          {mfaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                          Disable Two-Factor Authentication
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Active Devices / Logins Card */}
                  <div className="bg-secondary rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between font-sans">
                      <h2 className="font-semibold flex items-center gap-2 text-foreground">
                        <Smartphone className="h-5 w-5 text-primary" /> Active Login Sessions
                      </h2>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadSessions}
                        disabled={loadingSessions}
                        className="h-8 rounded-full text-xs font-bold px-3"
                      >
                        {loadingSessions ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
                        Refresh Sessions
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Below is a list of devices and sessions currently signed into your Jackpot Jungle account. You can log out other devices instantly.
                    </p>

                    <div className="space-y-3 pt-2">
                      {loadingSessions ? (
                        <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/80 rounded-xl text-center select-none">
                          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin mb-2" />
                          <p className="text-xs text-muted-foreground">Loading active sessions...</p>
                        </div>
                      ) : sessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/40 rounded-2xl text-center select-none bg-secondary/30">
                          <Smartphone className="h-7 w-7 text-muted-foreground/55 mb-2" />
                          <p className="text-xs font-bold text-foreground">No active sessions found</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Please refresh or verify your connection settings.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Current Device Session */}
                          {sessions.filter(s => s.id === currentSessionId).map((s) => {
                            const deviceLabel = parseUserAgent(s.user_agent);
                            const isMobile = s.user_agent?.toLowerCase().includes("iphone") || s.user_agent?.toLowerCase().includes("android");
                            return (
                              <div key={s.id} className="flex items-center justify-between p-3.5 bg-card border border-primary/30 hover:border-primary/50 rounded-xl transition-all gap-4 shadow-sm">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="h-9 w-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0 border border-primary/20">
                                    {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-xs font-bold text-foreground truncate">{deviceLabel}</p>
                                      <span className="bg-primary/20 border border-primary/30 text-primary text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                        This Device
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                      <span className="flex items-center gap-0.5"><Globe className="h-3 w-3" /> {s.ip || "Unknown IP"}</span>
                                      <span>•</span>
                                      <span>Last active: {new Date(s.updated_at).toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Other Device Sessions */}
                          {sessions.filter(s => s.id !== currentSessionId).length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/40 rounded-2xl text-center select-none bg-secondary/30">
                              <Smartphone className="h-7 w-7 text-muted-foreground/55 mb-2" />
                              <p className="text-xs font-bold text-foreground">No other active devices found</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">You are currently logged in only on this device.</p>
                            </div>
                          ) : (
                            sessions.filter(s => s.id !== currentSessionId).map((s) => {
                              const deviceLabel = parseUserAgent(s.user_agent);
                              const isMobile = s.user_agent?.toLowerCase().includes("iphone") || s.user_agent?.toLowerCase().includes("android");
                              return (
                                <div key={s.id} className="flex items-center justify-between p-3.5 bg-card border border-border/60 hover:border-border rounded-xl transition-all gap-4">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-9 w-9 bg-secondary rounded-xl flex items-center justify-center text-primary shrink-0 border border-border/20">
                                      {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-foreground truncate">{deviceLabel}</p>
                                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                        <span className="flex items-center gap-0.5"><Globe className="h-3 w-3" /> {s.ip || "Unknown IP"}</span>
                                        <span>•</span>
                                        <span>Last active: {new Date(s.updated_at).toLocaleString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    onClick={() => handleTerminateSession(s.id)}
                                    className="h-8 w-8 rounded-lg shrink-0"
                                    title="Log out device"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {activeSubTab === "vipRewards" && (
                <div className="space-y-6 animate-in fade-in duration-200 text-left">
                  <div className="bg-secondary rounded-2xl p-5 space-y-3">
                    <h2 className="font-semibold text-foreground flex items-center gap-2">
                      <Award className="h-5 w-5 text-primary animate-pulse" /> Monthly VIP Loyalty Payouts
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Your VIP status tracker and historical rewards distributed at the end of each monthly calculations cycle.
                    </p>
                  </div>

                  {loadingVipHistory || loadingVipDashboard ? (
                    <div className="flex h-32 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      
                      {/* VIP Dashboard Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* 1. Monthly Reward Estimator Card */}
                        <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Current Month Reward</span>
                            {vipDashboardStats?.activeMonthEstimate ? (
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                vipDashboardStats.activeMonthEstimate.status === "Approved" || vipDashboardStats.activeMonthEstimate.status === "Completed"
                                  ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                                  : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                              }`}>
                                {vipDashboardStats.activeMonthEstimate.status}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-secondary text-muted-foreground border border-border">
                                Calculating
                              </span>
                            )}
                          </div>
                          
                          <div>
                            <h3 className="text-2xl font-black text-foreground font-mono">
                              ${vipDashboardStats?.activeMonthEstimate ? Number(vipDashboardStats.activeMonthEstimate.rewardAmount).toFixed(2) : "0.00"}
                            </h3>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {vipDashboardStats?.activeMonthEstimate?.qualified
                                ? `Score: ${vipDashboardStats.activeMonthEstimate.finalScore.toFixed(4)}% | Multiplier: ${vipDashboardStats.activeMonthEstimate.multiplier.toFixed(2)}x`
                                : vipDashboardStats?.activeMonthEstimate?.disqualificationReason || "Qualified deposits & positive holding required."}
                            </p>
                          </div>
                          <div className="text-[9px] text-muted-foreground border-t border-border/50 pt-2 flex items-center justify-between">
                            <span>Expected Distribution Date:</span>
                            <span className="font-bold text-foreground">1st of next month</span>
                          </div>
                        </div>

                        {/* 2. VIP level card and progress */}
                        <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-3 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">VIP Tier Progression</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                              {vipDashboardStats?.progression?.currentTier || "NONE"}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground font-medium">Progress to {vipDashboardStats?.progression?.nextTier}</span>
                              <span className="font-bold text-foreground font-mono">{vipDashboardStats?.progression?.progressPercentage || 0}%</span>
                            </div>
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-primary h-full transition-all duration-500 rounded-full"
                                style={{ width: `${vipDashboardStats?.progression?.progressPercentage || 0}%` }}
                              ></div>
                            </div>
                          </div>

                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            {vipDashboardStats?.progression?.remainingDeposits > 0
                              ? `Deposit $${vipDashboardStats.progression.remainingDeposits.toLocaleString()} more to reach ${vipDashboardStats.progression.nextTier}.`
                              : "Maximum VIP tier achieved! Enjoy premium benefits."}
                          </p>

                          <div className="text-[9px] border-t border-border/50 pt-2 text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 font-semibold">
                            {vipDashboardStats?.progression?.benefits?.map((benefit: string, idx: number) => (
                              <span key={idx} className="flex items-center gap-1">
                                <span className="h-1 w-1 bg-primary rounded-full shrink-0"></span> {benefit}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* 3. Referral Progress Card */}
                        <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Referral Stats</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-secondary text-foreground">
                              {vipDashboardStats?.referrals?.qualified || 0} Qualified
                            </span>
                          </div>
                          <div>
                            <h3 className="text-2xl font-black text-foreground font-mono">
                              {vipDashboardStats?.referrals?.total || 0} Referrals
                            </h3>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Qualified referrals registered and deposited at least ${vipDashboardStats?.referrals?.minRequiredDeposit || 50}.
                            </p>
                          </div>
                          <div className="text-[9px] text-muted-foreground border-t border-border/50 pt-2">
                            Earn referral score weights to increase monthly rewards score.
                          </div>
                        </div>

                        {/* 4. Wallet Balances Summary Card */}
                        <div className="bg-card border border-border/80 rounded-2xl p-5 space-y-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Available & Credits Balance</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-left">
                            <div>
                              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Available</span>
                              <span className="text-base font-bold text-foreground font-mono">
                                ${vipDashboardStats?.profile?.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground font-semibold block uppercase">Credits</span>
                              <span className="text-base font-bold text-primary font-mono">
                                ${vipDashboardStats?.profile?.creditBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                          <div className="text-[9px] text-muted-foreground border-t border-border/50 pt-2">
                            Rewards distributed are automatically credited to your Available Balance.
                          </div>
                        </div>

                      </div>

                      {/* Reward Payout History Table */}
                      <div className="bg-card border border-border/80 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-border/50 bg-secondary/15 flex items-center justify-between">
                          <h4 className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <History className="h-4 w-4 text-primary" /> Reward Payout History
                          </h4>
                          <span className="text-[10px] text-muted-foreground font-semibold font-mono">
                            {vipRewardsHistory.length} total entries
                          </span>
                        </div>

                        {vipRewardsHistory.length === 0 ? (
                          <div className="flex h-32 flex-col items-center justify-center text-muted-foreground text-center p-6 select-none bg-secondary/10">
                            <Award className="h-7 w-7 opacity-30 mb-2" />
                            <p className="text-xs font-bold text-foreground">No VIP rewards found</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 max-w-xs mx-auto">
                              Complete qualified deposits and maintain positive holding to earn loyalty rewards next cycle!
                            </p>
                          </div>
                        ) : (
                          <div className="w-full">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                                <thead>
                                  <tr className="border-b border-border/80 bg-secondary/35 text-[10px] uppercase font-bold text-muted-foreground">
                                    <th className="p-3 pl-5">Cycle Period</th>
                                    <th className="p-3 text-center">VIP Tier</th>
                                    <th className="p-3 text-right">Scores (Dep/Hold/Ref/Loy)</th>
                                    <th className="p-3 text-right">VIP Multiplier</th>
                                    <th className="p-3 text-right">Final Score</th>
                                    <th className="p-3 text-right text-emerald-400">Reward amount</th>
                                    <th className="p-3 pr-5">Distribution Date</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                  {vipRewardsHistory
                                    .slice((vipHistoryPage - 1) * 5, vipHistoryPage * 5)
                                    .map((row) => (
                                      <tr key={row.id} className="hover:bg-secondary/10 transition-colors">
                                        <td className="p-3 pl-5 font-bold text-foreground">
                                          {new Date(0, row.month - 1).toLocaleString("en", { month: "long" })} {row.year}
                                        </td>
                                        <td className="p-3 text-center">
                                          <span className="px-2 py-0.5 rounded bg-secondary text-[10px] font-black uppercase text-foreground">
                                            {row.vip_status}
                                          </span>
                                        </td>
                                        <td className="p-3 text-right text-[10px] font-mono text-muted-foreground">
                                          Dep: {Number(row.deposit_score).toFixed(0)} | Hold: {Number(row.holding_score).toFixed(0)} | Ref: {Number(row.referral_score).toFixed(0)} | Loy: {Number(row.loyalty_score).toFixed(0)}
                                        </td>
                                        <td className="p-3 text-right font-mono text-muted-foreground font-semibold">
                                          {Number(row.multiplier).toFixed(2)}x
                                        </td>
                                        <td className="p-3 text-right font-mono font-bold text-foreground">
                                          {Number(row.final_score).toFixed(4)}%
                                        </td>
                                        <td className="p-3 text-right font-mono font-black text-emerald-400 text-sm">
                                          ${Number(row.reward_amount).toFixed(2)}
                                        </td>
                                        <td className="p-3 pr-5 font-mono text-muted-foreground">
                                          {new Date(row.distribution_date).toLocaleDateString()}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Client-side Pagination controls */}
                            {vipRewardsHistory.length > 5 && (
                              <div className="flex items-center justify-between p-3 bg-secondary/5 border-t border-border/50 text-[10px]">
                                <span className="text-muted-foreground">
                                  Showing page {vipHistoryPage} of {Math.ceil(vipRewardsHistory.length / 5)}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setVipHistoryPage(p => Math.max(1, p - 1))}
                                    disabled={vipHistoryPage === 1}
                                    className="px-2 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-all"
                                  >
                                    Previous
                                  </button>
                                  <button
                                    onClick={() => setVipHistoryPage(p => Math.min(Math.ceil(vipRewardsHistory.length / 5), p + 1))}
                                    disabled={vipHistoryPage === Math.ceil(vipRewardsHistory.length / 5)}
                                    className="px-2 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 disabled:opacity-50 transition-all"
                                  >
                                    Next
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Member since {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Transaction History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <History className="h-5 w-5 text-primary" /> Wallet Transaction History
            </DialogTitle>
            <DialogDescription>
              A full ledger of your wallet transactions, deposits, and released credits.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/35 p-3 rounded-xl border border-border/40 my-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Type:</span>
                <select
                  value={ledgerFilter}
                  onChange={(e) => setLedgerFilter(e.target.value as any)}
                  className="bg-card text-foreground text-xs font-bold px-2 py-1 rounded border border-border focus:outline-none cursor-pointer h-8"
                >
                  <option value="all">All</option>
                  <option value="wallet">Wallet Only</option>
                  <option value="credit">Credit Only</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">Start:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-muted-foreground">End:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="text-xs font-bold text-destructive hover:underline"
                >
                  Clear dates
                </button>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={exportUserCSV} className="rounded-full text-xs font-bold gap-1.5 h-8 shrink-0">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto border border-border/80 rounded-xl bg-secondary/20">
            {loadingHistory ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center text-muted-foreground text-center p-4">
                <Wallet className="h-8 w-8 opacity-40 mb-2" />
                <p className="text-sm font-semibold">No transactions found matching this filter.</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/80 bg-secondary/50 text-muted-foreground font-bold">
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Action</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right">Avail Before</th>
                      <th className="p-3 text-right">Avail After</th>
                      <th className="p-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((tx) => (
                      <tr key={tx.id} className="border-b border-border/40 hover:bg-secondary/40">
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tx.action === "deposit" || tx.action === "refund" || tx.action === "bonus"
                              ? "bg-green-500/10 text-green-500"
                              : tx.action === "credit_added" || tx.action === "credit_released"
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-red-500/10 text-red-500"
                            }`}>
                            {tx.action.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-foreground">
                          ${Number(tx.amount).toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          ${Number(tx.avail_before).toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-foreground font-semibold">
                          ${Number(tx.avail_after).toFixed(2)}
                        </td>
                        <td className="p-3 max-w-[150px] truncate text-muted-foreground" title={tx.reason}>
                          {tx.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Statement Dialog */}
      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FileText className="h-5 w-5 text-primary" /> Wallet Statement
            </DialogTitle>
            <DialogDescription>
              Preview and print your financial wallet ledger statement.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 bg-secondary/35 p-3 rounded-xl border border-border/40 my-1">
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Start:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground w-full"
              />
            </div>
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">End:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 px-2 rounded bg-card text-xs border border-border/50 font-medium text-foreground dark:text-foreground w-full"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="text-[10px] font-bold text-destructive hover:underline shrink-0"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto border border-border/80 rounded-xl p-4 space-y-4 bg-secondary/10">
            <div className="border-b border-green-500 pb-2">
              <h3 className="text-sm font-black text-green-500 uppercase tracking-widest">Jackpot Jungle</h3>
              <p className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">Wallet Credit Statement</p>
            </div>

            <div className="text-xs space-y-1">
              <p className="font-bold">Customer: <span className="font-normal text-muted-foreground">
                {profile.first_name ? `${profile.first_name} ${profile.last_name || ""}`.trim() : profile.username} (@{profile.username})
              </span></p>
              <p className="font-bold">Generated: <span className="font-normal text-muted-foreground">{new Date().toLocaleString()}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y border-border/60 py-2.5">
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase">Available Balance</p>
                <p className="font-bold text-green-500 text-sm mt-0.5">${(profile.wallet_balance ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-bold uppercase">Credit Balance</p>
                <p className="font-bold text-amber-500 text-sm mt-0.5">${(profile.credit_balance ?? 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider">Summary Stats</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Lifetime Deposits:</span>
                <span className="font-semibold">${(profile.wallet_deposits ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Released Credit:</span>
                <span className="font-semibold">${(profile.wallet_released ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Wallet Spent:</span>
                <span className="font-semibold text-red-500">${(profile.wallet_used ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4 shrink-0">
            <Button className="flex-1 rounded-full gap-1.5 h-11 font-bold" onClick={printStatement}>
              <Printer className="h-4 w-4" /> Print Statement
            </Button>
            <Button variant="outline" className="flex-1 rounded-full gap-1.5 h-11 font-bold" onClick={exportUserCSV}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ShareProfileModal
        isOpen={shareOpen}
        onOpenChange={setShareOpen}
        username={profile.username}
        displayName={profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username}
        avatarUrl={profile.avatar_url}
        memberSince={profile.created_at}
      />
    </AppShell>
  );
}

function CodeCard({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <button onClick={onCopy} className="bg-secondary rounded-2xl p-4 text-left hover:bg-accent transition-colors group">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
      <p className="font-mono font-bold mt-1">{value}</p>
    </button>
  );
}
