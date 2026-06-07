import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { Avatar } from "./Avatar";
import { playRingtone, stopRingtone } from "./ringtone";
import type { CallKind } from "./useWebRTC";

type Props = {
  peerName: string;
  peerAvatar: string | null;
  kind: CallKind;
  onAccept: () => void;
  onDecline: () => void;
};

export function IncomingCallModal({ peerName, peerAvatar, kind, onAccept, onDecline }: Props) {
  useEffect(() => {
    playRingtone("incoming");
    return () => stopRingtone();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-slate-900 to-black text-white flex flex-col items-center justify-between p-8 animate-in fade-in duration-200">
      <div className="pt-8 text-center">
        <p className="text-sm text-white/70 uppercase tracking-wider">
          Incoming {kind === "video" ? "video" : "voice"} call
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/40 animate-ping" style={{ animationDuration: "1.5s" }} />
          <div className="absolute inset-[-12px] rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.3s" }} />
          <div className="relative">
            <Avatar name={peerName} url={peerAvatar} size={140} />
          </div>
        </div>
        <p className="text-2xl font-semibold">{peerName}</p>
        <p className="text-white/70">is calling you…</p>
      </div>

      <div className="w-full max-w-sm flex items-center justify-around pb-8">
        <button
          onClick={onDecline}
          aria-label="Decline"
          className="flex flex-col items-center gap-2 group"
        >
          <span className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 transition flex items-center justify-center shadow-2xl shadow-red-900/50">
            <PhoneOff className="h-7 w-7 text-white" />
          </span>
          <span className="text-xs text-white/80">Decline</span>
        </button>
        <button
          onClick={onAccept}
          aria-label="Accept"
          className="flex flex-col items-center gap-2 group"
        >
          <span className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-500 active:scale-95 transition flex items-center justify-center shadow-2xl shadow-green-900/50">
            {kind === "video" ? <Video className="h-7 w-7 text-white" /> : <Phone className="h-7 w-7 text-white" />}
          </span>
          <span className="text-xs text-white/80">Accept</span>
        </button>
      </div>
    </div>
  );
}
