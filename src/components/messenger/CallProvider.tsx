import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CallScreen } from "./CallScreen";
import { IncomingCallModal } from "./IncomingCallModal";
import type { CallKind } from "./useWebRTC";
import { stopRingtone } from "./ringtone";

type CallRow = {
  id: string;
  caller_id: string;
  callee_id: string;
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
};

type Incoming = {
  call: CallRow;
  peer: PeerInfo;
};

type Ctx = {
  startCall: (args: {
    calleeId: string;
    kind: CallKind;
    peer: PeerInfo;
    context?: "friend" | "page";
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
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const meIdRef = useRef<string | null>(null);
  const activeRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<Incoming | null>(null);
  const missedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);

  const showIncomingCall = useCallback(async (row: CallRow) => {
    if (row.status !== "ringing") return;
    if (activeRef.current || incomingRef.current) {
      await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", row.id);
      return;
    }
    const { data: prof } = await supabase
      .from("profiles").select("username, avatar_url").eq("id", row.caller_id).maybeSingle();
    if (activeRef.current || incomingRef.current) return;
    setIncoming({
      call: row,
      peer: { name: prof?.username ?? "Caller", avatar: prof?.avatar_url ?? null },
    });
    if (!missedTimersRef.current[row.id]) {
      missedTimersRef.current[row.id] = setTimeout(async () => {
        const { data: latest } = await supabase.from("calls").select("status").eq("id", row.id).maybeSingle();
        if (latest?.status === "ringing") {
          await supabase.from("calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", row.id);
          setIncoming((cur) => (cur?.call.id === row.id ? null : cur));
        }
        delete missedTimersRef.current[row.id];
      }, 35000);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMeId(data.user?.id ?? null);
      meIdRef.current = data.user?.id ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setMeId(s?.user?.id ?? null);
      meIdRef.current = s?.user?.id ?? null;
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Listen for incoming calls (rows where callee_id = me, status = ringing)
  useEffect(() => {
    if (!meId) return;
    const ch = supabase
      .channel(`calls-inbox-${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${meId}` }, async (payload) => {
        const row = payload.new as CallRow;
        if (row.status !== "ringing") return;
        if (activeRef.current || incomingRef.current) {
          // already on a call -> auto-decline busy
          await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", row.id);
          return;
        }
        showIncomingCall(row);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${meId}` }, (payload) => {
        const row = payload.new as CallRow;
        // If caller canceled before we accepted, dismiss the modal
        if (incoming?.call.id === row.id && row.status !== "ringing" && row.status !== "active") {
          setIncoming(null);
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

  const startCall = useCallback<Ctx["startCall"]>(async ({ calleeId, kind, peer, context = "friend", pageConversationId = null }) => {
    if (!meIdRef.current) return;
    if (activeRef.current || incomingRef.current) return;
    const { data, error } = await supabase
      .from("calls")
      .insert({
        caller_id: meIdRef.current,
        callee_id: calleeId,
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
    });
  }, []);

  async function acceptIncoming() {
    if (!incoming) return;
    stopRingtone();
    await supabase.from("calls").update({ status: "active", answered_at: new Date().toISOString() }).eq("id", incoming.call.id);
    setActive({
      callId: incoming.call.id,
      role: "callee",
      kind: incoming.call.call_type,
      peer: incoming.peer,
      initialActive: true,
    });
    setIncoming(null);
  }

  async function declineIncoming() {
    if (!incoming) return;
    stopRingtone();
    await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", incoming.call.id);
    setIncoming(null);
  }

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
          onClose={() => setActive(null)}
        />
      )}
    </CallCtx.Provider>
  );
}
