import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// STUN handles most cases; TURN relays are required when either peer is behind
// symmetric NAT (mobile data, corporate Wi-Fi, some carrier-grade NATs).
// Using the public Open Relay Project TURN servers as a fallback.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turns:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
];

export type CallRole = "caller" | "callee";
export type CallKind = "voice" | "video";

type Args = {
  callId: string;
  role: CallRole;
  kind: CallKind;
  meId: string;
  context: string;
  onRemoteHangup?: () => void;
};

export function useWebRTC({ callId, role, kind, meId, context, onRemoteHangup }: Args) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const haveRemoteDescRef = useRef(false);
  const calleeReadyRef = useRef(false);

  // teardown
  const stopAll = useCallback(() => {
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setLocalStream((s) => { s?.getTracks().forEach((t) => t.stop()); return null; });
    setRemoteStream(null);
    setConnected(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") setConnected(true);
      if (s === "failed" || s === "disconnected" || s === "closed") setConnected(false);
    };

    const channel = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false, ack: false } } });
    channelRef.current = channel;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        channel.send({ type: "broadcast", event: "ice", payload: { from: meId, candidate: ev.candidate.toJSON() } });
      }
    };

    async function applyPendingIce() {
      const queue = pendingIceRef.current;
      pendingIceRef.current = [];
      for (const c of queue) {
        try { await pc.addIceCandidate(c); } catch (e) { console.warn("ICE add failed", e); }
      }
    }

    let offerSent = false;
    async function makeOffer() {
      if (offerSent) return;
      offerSent = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({ type: "broadcast", event: "offer", payload: { from: meId, sdp: offer } });
      } catch (e: any) { offerSent = false; setError(e.message ?? "Offer failed"); }
    }

    channel
      .on("broadcast", { event: "hello" }, (msg) => {
        // caller announces presence -> callee replies with ready
        if (role !== "callee") return;
        if ((msg.payload as any)?.from === meId) return;
        channel.send({ type: "broadcast", event: "ready", payload: { from: meId } });
      })
      .on("broadcast", { event: "ready" }, async (msg) => {
        // callee announces ready -> caller sends offer
        if (role !== "caller") return;
        if ((msg.payload as any)?.from === meId) return;
        calleeReadyRef.current = true;
        await makeOffer();
      })
      .on("broadcast", { event: "offer" }, async (msg) => {
        if (role !== "callee") return;
        const p = msg.payload as { from: string; sdp: RTCSessionDescriptionInit };
        if (p.from === meId) return;
        try {
          await pc.setRemoteDescription(p.sdp);
          haveRemoteDescRef.current = true;
          await applyPendingIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.send({ type: "broadcast", event: "answer", payload: { from: meId, sdp: answer } });
        } catch (e: any) { setError(e.message ?? "Answer failed"); }
      })
      .on("broadcast", { event: "answer" }, async (msg) => {
        if (role !== "caller") return;
        const p = msg.payload as { from: string; sdp: RTCSessionDescriptionInit };
        if (p.from === meId) return;
        try {
          await pc.setRemoteDescription(p.sdp);
          haveRemoteDescRef.current = true;
          await applyPendingIce();
        } catch (e: any) { setError(e.message ?? "Set remote failed"); }
      })
      .on("broadcast", { event: "ice" }, async (msg) => {
        const p = msg.payload as { from: string; candidate: RTCIceCandidateInit };
        if (p.from === meId) return;
        if (!haveRemoteDescRef.current) { pendingIceRef.current.push(p.candidate); return; }
        try { await pc.addIceCandidate(p.candidate); } catch (e) { console.warn("ICE add failed", e); }
      })
      .on("broadcast", { event: "media-state" }, (msg) => {
        const p = msg.payload as { from: string; muted?: boolean };
        if (p.from === meId) return;
        if (typeof p.muted === "boolean") setRemoteMuted(p.muted);
      })
      .on("broadcast", { event: "hangup" }, (msg) => {
        if ((msg.payload as any)?.from === meId) return;
        onRemoteHangup?.();
      });

    (async () => {
      try {
        const isCurrentParticipantAdmin = (context === "page" && role === "caller") || (context === "page_broadcast" && role === "callee");
        const wantVideo = kind === "video" && !isCurrentParticipantAdmin;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: wantVideo ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        setLocalStream(stream);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        await new Promise<void>((res) => {
          channel.subscribe((status) => { if (status === "SUBSCRIBED") res(); });
        });
        if (cancelled) return;

        if (role === "callee") {
          // tell caller we're ready (repeat a few times in case caller wasn't subscribed yet)
          for (let i = 0; i < 4; i++) {
            channel.send({ type: "broadcast", event: "ready", payload: { from: meId } });
            await new Promise((r) => setTimeout(r, 600));
          }
        } else {
          // caller announces presence so callee re-emits ready; also retry until offer is sent
          for (let i = 0; i < 6; i++) {
            if (calleeReadyRef.current) break;
            channel.send({ type: "broadcast", event: "hello", payload: { from: meId } });
            await new Promise((r) => setTimeout(r, 700));
          }
        }
      } catch (e: any) {
        setError(e.message ?? "Could not access camera/mic");
      }
    })();

    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, role, kind, meId]);

  const sendHangup = useCallback(() => {
    channelRef.current?.send({ type: "broadcast", event: "hangup", payload: { from: meId } });
  }, [meId]);

  const toggleAudio = useCallback((on: boolean) => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = on));
  }, [localStream]);

  const sendMediaState = useCallback((state: { muted?: boolean }) => {
    channelRef.current?.send({ type: "broadcast", event: "media-state", payload: { from: meId, ...state } });
  }, [meId]);

  const toggleVideo = useCallback((on: boolean) => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = on));
  }, [localStream]);

  const switchCamera = useCallback(async () => {
    if (!localStream || !pcRef.current) return;
    const cur = localStream.getVideoTracks()[0];
    const curFacing = (cur?.getSettings?.().facingMode as string | undefined) ?? "user";
    const next = curFacing === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: next } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (sender && newTrack) await sender.replaceTrack(newTrack);
      cur?.stop();
      localStream.removeTrack(cur);
      localStream.addTrack(newTrack);
      setLocalStream(new MediaStream(localStream.getTracks()));
    } catch (e) {
      console.warn("switchCamera failed", e);
    }
  }, [localStream]);

  return { localStream, remoteStream, connected, remoteMuted, error, sendHangup, toggleAudio, toggleVideo, switchCamera, sendMediaState, stopAll };
}
