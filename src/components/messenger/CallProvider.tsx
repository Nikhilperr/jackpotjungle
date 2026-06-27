import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CallScreen } from "./CallScreen";
import { IncomingCallModal } from "./IncomingCallModal";
import type { CallKind } from "./useWebRTC";
import { stopRingtone } from "./ringtone";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string | null;
  call_type: CallKind;
  status: "ringing" | "active" | "ended" | "missed" | "declined" | "canceled";
  context: string;
  page_conversation_id: string | null;
};

type PeerInfo = { name: string; avatar: string | null };

type ActiveCall = {
  callId: string;
  role: "caller" | "callee";
  kind: CallKind;
  peer: PeerInfo;
  initialActive: boolean;
  context: string;
};

type Incoming = {
  call: CallRow;
  peer: PeerInfo;
};

type Ctx = {
  startCall: (args: {
    calleeId: string | null;
    kind: CallKind;
    peer: PeerInfo;
    context?: "friend" | "page" | "page_broadcast";
    pageConversationId?: string | null;
  }) => Promise<void>;
};

const CallCtx = createContext<Ctx | null>(null);
export const useCalls = () => {
  const c = useContext(CallCtx);
  if (!c) throw new Error("useCalls must be used inside CallProvider");
  return c;
};

export function CallProvider({ children }: { children: ReactNode }) {
  const [meId, setMeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const callId = params.get("call_id");
    const callerName = params.get("caller_name");
    const callerAvatar = params.get("caller_avatar");
    const callType = params.get("call_type");

    if (callId && callerName) {
      console.log("[Call Debug] Initializing incoming call state synchronously on boot:", { callId, callerName });
      const decodedAvatar = callerAvatar ? decodeURIComponent(callerAvatar) : null;
      return {
        call: {
          id: callId,
          caller_id: "",
          callee_id: null,
          call_type: (callType as CallKind) || "voice",
          status: "ringing",
          context: "friend",
          page_conversation_id: null
        },
        peer: {
          name: decodeURIComponent(callerName),
          avatar: decodedAvatar === "null" || decodedAvatar === "undefined" ? null : decodedAvatar
        }
      };
    }
    return null;
  });
  const meIdRef = useRef<string | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<Incoming | null>(null);
  const missedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const launchedForCallRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("call_id")) {
      launchedForCallRef.current = true;
      console.log("[Call Debug] App launched specifically to handle incoming call ID:", params.get("call_id"));
    }
  }, []);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);

  const clearCallUrlParams = useCallback(() => {
    if (typeof window !== "undefined" && window.history?.replaceState) {
      const url = new URL(window.location.href);
      let changed = false;
      const paramsToClear = ["call_id", "caller_name", "caller_avatar", "call_type", "action"];
      paramsToClear.forEach((p) => {
        if (url.searchParams.has(p)) {
          url.searchParams.delete(p);
          changed = true;
        }
      });
      if (changed) {
        window.history.replaceState({}, "", url.pathname + url.search);
        console.log("[Call Debug] Cleared call query parameters from window location history.");
      }
    }
  }, []);

  // Centralized missed call timer coordinator
  useEffect(() => {
    if (!incoming) return;
    const callId = incoming.call.id;
    if (!missedTimersRef.current[callId]) {
      console.log("[Call Debug] Starting 35-second missed call timer for:", callId);
      missedTimersRef.current[callId] = setTimeout(async () => {
        const { data: latest } = await supabase.from("calls").select("status").eq("id", callId).maybeSingle();
        if (latest?.status === "ringing") {
          console.log("[Call Debug] Call timed out (no answer), setting to missed:", callId);
          await supabase.from("calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", callId);
          setIncoming((cur) => (cur?.call.id === callId ? null : cur));
        }
        delete missedTimersRef.current[callId];
      }, 35000);
    }
  }, [incoming]);

  const showIncomingCall = useCallback(async (row: CallRow) => {
    if (row.status !== "ringing") return;
    // Exclude if we are the caller (prevents same-account outgoing call ringback loop)
    if (row.caller_id === meIdRef.current) {
      console.log("[Call Debug] Ignoring call insert because we are the caller.");
      return;
    }
    if (activeRef.current || incomingRef.current) {
      await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", row.id);
      return;
    }
    const { data: prof } = await supabase
      .from("profiles").select("username, avatar_url").eq("id", row.caller_id).maybeSingle();
    if (activeRef.current || incomingRef.current) return;
    const isSupport = row.context === "page"; // Only override when Admin calls User, not when User calls Admin
    const displayName = isSupport ? "Jackpot Jungle Support" : (prof?.username ?? "Caller");
    const displayAvatar = isSupport ? "/icons/icon-256.webp" : (prof?.avatar_url ?? null);

    setIncoming({
      call: row,
      peer: { name: displayName, avatar: displayAvatar },
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setMeId(uid);
      meIdRef.current = uid;
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin(!!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin"));
      } else {
        setIsAdmin(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      const uid = s?.user?.id ?? null;
      setMeId(uid);
      meIdRef.current = uid;
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin(!!roles?.some((r: any) => r.role === "admin" || r.role === "super_admin"));
      } else {
        setIsAdmin(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Instant call URL parameters are parsed synchronously on state initialization

  // Listen for incoming calls (rows where callee_id = me, status = ringing)
  useEffect(() => {
    if (!meId) return;
    const ch = supabase
      .channel(`calls-inbox-${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${meId}` }, async (payload) => {
        const row = payload.new as CallRow;
        if (row.status !== "ringing") return;
        if (activeRef.current || (incomingRef.current && incomingRef.current.call.id !== row.id)) {
          // already on a DIFFERENT call -> auto-decline busy
          await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", row.id);
          return;
        }
        if (incomingRef.current?.call.id === row.id) {
          // Same call (already parsed on boot), ignore insert event
          return;
        }
        showIncomingCall(row);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${meId}` }, (payload) => {
        const row = payload.new as CallRow;
        // If caller canceled before we accepted, dismiss the modal
        if (missedTimersRef.current[row.id] && row.status !== "ringing") {
          clearTimeout(missedTimersRef.current[row.id]);
          delete missedTimersRef.current[row.id];
        }
        if (incomingRef.current?.call.id === row.id && row.status !== "ringing") {
          // If status changes to anything other than ringing (active, ended, declined, canceled, missed):
          // stop ringtone, dismiss modal, and close app if on lockscreen
          stopRingtone();
          setIncoming(null);
          clearCallUrlParams();
          if (launchedForCallRef.current && (window as any).AndroidBridge?.closeApp) {
            console.log("[Call Debug] Dismissing app from lockscreen; call is no longer ringing.");
            (window as any).AndroidBridge.closeApp();
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meId, showIncomingCall]);

  useEffect(() => {
    if (!meId) return;
    let alive = true;
    const poll = async () => {
      if (!alive || activeRef.current || incomingRef.current) return;
      const { data } = await supabase
        .from("calls")
        .select("id, caller_id, callee_id, call_type, status, context, page_conversation_id")
        .eq("callee_id", meId)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive && data) showIncomingCall(data as CallRow);
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(id); };
  }, [meId, showIncomingCall]);

  // Admin-only: listen for page-broadcast calls (callee_id IS NULL until claimed)
  useEffect(() => {
    if (!meId || !isAdmin) return;
    const ch = supabase
      .channel(`page-broadcast-inbox-${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `context=eq.page_broadcast` }, (payload) => {
        const row = payload.new as CallRow;
        if (row.status !== "ringing" || row.callee_id !== null) return;
        if (row.caller_id === meIdRef.current) return;
        if (activeRef.current || (incomingRef.current && incomingRef.current.call.id !== row.id)) return;
        if (incomingRef.current?.call.id === row.id) return;
        showIncomingCall(row);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `context=eq.page_broadcast` }, (payload) => {
        const row = payload.new as CallRow;
        // Another admin claimed it or caller canceled -> dismiss our modal
        if (incomingRef.current?.call.id === row.id && (row.callee_id !== null || row.status !== "ringing")) {
          if (row.callee_id !== meIdRef.current) {
            stopRingtone();
            if (missedTimersRef.current[row.id]) {
              clearTimeout(missedTimersRef.current[row.id]);
              delete missedTimersRef.current[row.id];
            }
            setIncoming(null);
            clearCallUrlParams();
            if (launchedForCallRef.current && (window as any).AndroidBridge?.closeApp) {
              console.log("[Call Debug] Dismissing broadcast call from lockscreen; call is no longer ringing.");
              (window as any).AndroidBridge.closeApp();
            }
          }
        }
      })
      .subscribe();
    // Poll as fallback
    let alive = true;
    const poll = async () => {
      if (!alive || activeRef.current || incomingRef.current) return;
      const { data } = await supabase
        .from("calls")
        .select("id, caller_id, callee_id, call_type, status, context, page_conversation_id")
        .eq("context", "page_broadcast")
        .eq("status", "ringing")
        .is("callee_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive && data && (data as any).caller_id !== meIdRef.current) {
        showIncomingCall(data as CallRow);
      }
    };
    poll();
    const pid = setInterval(poll, 2500);
    return () => {
      alive = false;
      clearInterval(pid);
      supabase.removeChannel(ch);
    };
  }, [meId, isAdmin, showIncomingCall]);

  const startCall = useCallback<Ctx["startCall"]>(async ({ calleeId, kind, peer, context = "friend", pageConversationId = null }) => {
    if (!meIdRef.current) return;
    if (activeRef.current || incomingRef.current) return;
    const { data, error } = await supabase
      .from("calls")
      .insert({
        caller_id: meIdRef.current,
        callee_id: context === "page_broadcast" ? null : calleeId,
        call_type: kind,
        status: "ringing",
        context,
        page_conversation_id: pageConversationId,
      } as any)
      .select()
      .single();
    if (error || !data) {
      console.error("startCall failed", error);
      alert("Could not start call.");
      return;
    }
    setActive({
      callId: (data as any).id,
      role: "caller",
      kind,
      peer,
      initialActive: false,
      context,
    });
  }, []);

  async function acceptIncoming() {
    if (!incoming) return;
    stopRingtone();
    if (missedTimersRef.current[incoming.call.id]) clearTimeout(missedTimersRef.current[incoming.call.id]);

    const completeAccept = async () => {
      // For page_broadcast: atomically claim by setting callee_id only if still null
      if (incoming.call.context === "page_broadcast") {
        const { data: claimed, error } = await supabase
          .from("calls")
          .update({ callee_id: meIdRef.current, status: "active", answered_at: new Date().toISOString() })
          .eq("id", incoming.call.id)
          .is("callee_id", null)
          .select()
          .maybeSingle();
        if (error || !claimed) {
          console.error("Failed to claim broadcast call", error);
          alert("This call has already been answered by another representative.");
          setIncoming(null);
          return;
        }
      } else {
        await supabase.from("calls").update({ status: "active", answered_at: new Date().toISOString() }).eq("id", incoming.call.id);
      }
      setActive({
        callId: incoming.call.id,
        role: "callee",
        kind: incoming.call.call_type,
        peer: incoming.peer,
        initialActive: true,
        context: incoming.call.context,
      });
      setIncoming(null);
      clearCallUrlParams();
    };

    // Request keyguard unlock natively on accept if phone is locked
    if ((window as any).AndroidBridge?.requestUnlock) {
      (window as any).onUnlockSucceeded = () => {
        console.log("[Call Debug] Unlock succeeded, completing accept.");
        completeAccept();
      };
      (window as any).AndroidBridge.requestUnlock();
    } else {
      console.log("[Call Debug] AndroidBridge not found, accepting immediately.");
      await completeAccept();
    }
  }

  async function declineIncoming() {
    if (!incoming) return;
    clearCallUrlParams();
    stopRingtone();
    if (missedTimersRef.current[incoming.call.id]) clearTimeout(missedTimersRef.current[incoming.call.id]);
    // For page broadcast: just dismiss locally - don't actually decline so other admins can still pick up
    if (incoming.call.context === "page_broadcast") {
      setIncoming(null);
      if (launchedForCallRef.current && (window as any).AndroidBridge?.closeApp) {
        console.log("[Call Debug] Closing app after declining broadcast call.");
        (window as any).AndroidBridge.closeApp();
      }
      return;
    }
    await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", incoming.call.id);
    setIncoming(null);
    if (launchedForCallRef.current && (window as any).AndroidBridge?.closeApp) {
      console.log("[Call Debug] Closing app after declining incoming call.");
      (window as any).AndroidBridge.closeApp();
    }
  }

  // Removed paramsCallId and isLoadingCall dependencies to prevent black loading screen on cancellation

  useEffect(() => {
    if (!incoming) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const callId = params.get("call_id");
    if (incoming.call.id === callId) {
      // Clean up all query parameters from the browser URL to prevent loops on refresh
      const cleanParams = new URLSearchParams(window.location.search);
      cleanParams.delete("action");
      cleanParams.delete("call_id");
      cleanParams.delete("caller_name");
      cleanParams.delete("caller_avatar");
      cleanParams.delete("call_type");
      const paramStr = cleanParams.toString();
      const newUrl = window.location.pathname + (paramStr ? `?${paramStr}` : "");
      window.history.replaceState({}, "", newUrl);

      if (action === "accept") {
        console.log("[Call Debug] Auto-accepting incoming call from URL action parameter");
        acceptIncoming();
      } else if (action === "decline") {
        console.log("[Call Debug] Auto-declining incoming call from URL action parameter");
        declineIncoming();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  return (
    <CallCtx.Provider value={{ startCall }}>
      {children}
      {incoming && !active && (
        <IncomingCallModal
          peerName={incoming.peer.name}
          peerAvatar={incoming.peer.avatar}
          kind={incoming.call.call_type}
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}
      {active && meId && (
        <CallScreen
          callId={active.callId}
          role={active.role}
          kind={active.kind}
          meId={meId}
          peerName={active.peer.name}
          peerAvatar={active.peer.avatar}
          initialActive={active.initialActive}
          context={active.context}
          onClose={() => {
            setActive(null);
            clearCallUrlParams();
            if (launchedForCallRef.current && (window as any).AndroidBridge?.closeApp) {
              console.log("[Call Debug] Closing app after active call ended.");
              (window as any).AndroidBridge.closeApp();
            }
          }}
        />
      )}
    </CallCtx.Provider>
  );
}
