import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, VolumeX, SwitchCamera, X } from "lucide-react";
import { useWebRTC, type CallKind, type CallRole } from "./useWebRTC";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "./Avatar";
import { playRingtone, stopRingtone } from "./ringtone";

type Props = {
  callId: string;
  role: CallRole;
  kind: CallKind;
  meId: string;
  peerName: string;
  peerAvatar: string | null;
  /** True when call is already accepted on both sides (active). For caller this becomes true on first answer received. */
  initialActive: boolean;
  context: string;
  onClose: () => void;
};

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export function CallScreen({ callId, role, kind, meId, peerName, peerAvatar, initialActive, context, onClose }: Props) {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(kind === "video");
  const [dbStatus, setDbStatus] = useState<string>(role === "caller" ? "calling" : "ringing");
  const [noAnswer, setNoAnswer] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [active, setActive] = useState(initialActive);
  const startRef = useRef<number | null>(initialActive ? Date.now() : null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const activeRef = useRef(initialActive);
  const closedRef = useRef(false);

  const { localStream, remoteStream, connected, remoteMuted, sendHangup, toggleAudio, toggleVideo, switchCamera, sendMediaState } = useWebRTC({
    callId, role, kind, meId, context,
    onRemoteHangup: () => endCall("remote"),
    onRinging: () => setDbStatus("ringing"),
  });

  useEffect(() => { activeRef.current = active; }, [active]);

  // Sync speakerphone state natively on mount, toggle, and once WebRTC connects
  useEffect(() => {
    if ((window as any).AndroidBridge?.setSpeakerphoneOn) {
      (window as any).AndroidBridge.setSpeakerphoneOn(speakerOn);
    }
  }, [speakerOn, connected, active, localStream, remoteStream]);

  // Reset audio natively when CallScreen unmounts
  useEffect(() => {
    return () => {
      if ((window as any).AndroidBridge?.resetAudio) {
        (window as any).AndroidBridge.resetAudio();
      }
    };
  }, []);

  // Subscribe to status changes (for caller: when callee answers -> status=active)
  useEffect(() => {
    const ch = supabase
      .channel(`call-status:${callId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` }, (payload) => {
        const row = payload.new as { status: string };
        setDbStatus(row.status);
        if (row.status === "active" && !active) {
          setActive(true);
          startRef.current = Date.now();
          stopRingtone();
        }
        if (row.status === "ended" || row.status === "declined" || row.status === "canceled") {
          stopRingtone();
          onClose();
        } else if (row.status === "missed") {
          stopRingtone();
          setNoAnswer(true);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  // 45-second ringing timeout for caller
  useEffect(() => {
    if (role === "caller" && !active && !noAnswer) {
      const t = setTimeout(async () => {
        console.log("[Call Debug] Caller timed out waiting for answer. Setting status to missed.");
        stopRingtone();
        setNoAnswer(true);
        await supabase.from("calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", callId);
      }, 45000);
      return () => clearTimeout(t);
    }
  }, [role, active, noAnswer, callId]);

  // Outgoing dial tone while ringing (caller only)
  useEffect(() => {
    if (role === "caller" && !active && !noAnswer && dbStatus === "ringing") {
      playRingtone("outgoing");
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [role, active, noAnswer, dbStatus]);

  // Duration timer
  useEffect(() => {
    if (!active) return;
    if (!startRef.current) startRef.current = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);

  // Attach streams
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  async function endCall(reason: "local" | "remote") {
    if (closedRef.current) return;
    closedRef.current = true;
    stopRingtone();
    if (reason === "local") sendHangup();
    const duration = startRef.current ? Math.floor((Date.now() - startRef.current) / 1000) : 0;
    try {
      if (reason === "local") {
        await supabase.from("calls").update({
          status: activeRef.current ? "ended" : (role === "caller" ? "canceled" : "declined"),
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
        }).eq("id", callId);
      }
    } catch (e) { console.warn(e); }
    onClose();
  }

  function onToggleMute() {
    const next = !muted;
    setMuted(next);
    toggleAudio(!next);
    sendMediaState({ muted: next });
  }
  function onToggleVideo() {
    const next = !cameraOff;
    setCameraOff(next);
    toggleVideo(!next);
  }
  function onToggleSpeaker() {
    const next = !speakerOn;
    setSpeakerOn(next);
    if ((window as any).AndroidBridge?.setSpeakerphoneOn) {
      (window as any).AndroidBridge.setSpeakerphoneOn(next);
    }
  }

  const isVideo = kind === "video";
  const showLocalVideo = isVideo;
  const hasRemoteVideo = isVideo && active && remoteStream && remoteStream.getVideoTracks().length > 0;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white flex flex-col animate-in fade-in duration-200">
      {/* Remote video / avatar */}
      <div className="absolute inset-0">
        {/* Remote video element - always in DOM so ref is stable */}
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            hasRemoteVideo && !noAnswer ? "opacity-100" : "opacity-0 pointer-events-none"
          }`} 
        />
        
        {/* Avatar/Calling Overlay - shown when there is no remote video */}
        {(!hasRemoteVideo || noAnswer) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
            <div className="relative">
              {!noAnswer && (
                <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: "2s" }} />
              )}
              <div className="relative">
                <Avatar name={peerName} url={peerAvatar} size={140} />
              </div>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold">{peerName}</p>
              <p className="text-sm text-white/70 mt-1">
                {noAnswer ? (
                  <span className="text-red-500 font-bold text-lg animate-pulse">No Answer</span>
                ) : active ? (
                  connected ? fmt(seconds) : "Connecting…"
                ) : role === "caller" ? (
                  dbStatus === "ringing" ? "Ringing…" : "Calling…"
                ) : (
                  "Incoming call…"
                )}
              </p>
              {remoteMuted && active && !noAnswer && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-white/85">
                  <MicOff className="h-3.5 w-3.5" /> {peerName} is muted
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* always play remote audio */}
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      </div>

      {/* Local video PIP - always in DOM so ref is stable, mirrors front camera preview */}
      <div 
        className={`absolute top-4 right-4 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-black z-10 transition-opacity duration-200 ${
          showLocalVideo && !noAnswer ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ transform: "scaleX(-1)" }}
          className={`w-full h-full object-cover transition-opacity duration-150 ${cameraOff ? "opacity-0" : "opacity-100"}`} 
        />
        {cameraOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
            <VideoOff className="h-6 w-6 text-white/70" />
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="relative z-10 p-4 flex items-center justify-between">
        <div className="text-sm text-white/80 bg-black/30 backdrop-blur px-3 py-1.5 rounded-full">
          {noAnswer ? "Call ended" : active ? (connected ? "Connected" : "Connecting…") : role === "caller" ? (dbStatus === "ringing" ? "Ringing…" : "Calling…") : "Connecting…"}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 mt-auto pb-10 px-6 flex items-center justify-center gap-4">
        {noAnswer ? (
          <button
            onClick={() => endCall("local")}
            aria-label="Dismiss"
            className="flex flex-col items-center gap-2 group animate-in zoom-in duration-200"
          >
            <span className="h-16 w-16 rounded-full bg-slate-700 hover:bg-slate-600 active:scale-95 transition flex items-center justify-center shadow-2xl">
              <X className="h-7 w-7 text-white" />
            </span>
            <span className="text-xs text-white/80">Dismiss</span>
          </button>
        ) : (
          <>
            <ControlButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute} active={muted}>
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </ControlButton>

            {isVideo && (
              <ControlButton label={cameraOff ? "Camera on" : "Camera off"} onClick={onToggleVideo} active={cameraOff}>
                {cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </ControlButton>
            )}

            <ControlButton label={speakerOn ? "Speaker on" : "Speaker off"} onClick={onToggleSpeaker} active={speakerOn}>
              <Volume2 className="h-6 w-6" />
            </ControlButton>

            {isVideo && (
              <ControlButton label="Flip camera" onClick={switchCamera}>
                <SwitchCamera className="h-6 w-6" />
              </ControlButton>
            )}

            <button
              onClick={() => endCall("local")}
              aria-label="End call"
              className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 transition flex items-center justify-center shadow-2xl shadow-red-900/50"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  children, onClick, label, active,
}: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`h-14 w-14 rounded-full flex items-center justify-center transition active:scale-95 backdrop-blur ${
        active ? "bg-white text-slate-900" : "bg-white/15 hover:bg-white/25 text-white"
      }`}
    >
      {children}
    </button>
  );
}
