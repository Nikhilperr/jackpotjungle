import { Phone, PhoneMissed, Video, PhoneOff } from "lucide-react";

type Props = {
  mine: boolean;
  kind: "voice" | "video";
  status: "ended" | "missed" | "declined" | "canceled" | "active" | "ringing";
  durationSeconds: number;
};

function fmt(s: number) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export function CallMessage({ mine, kind, status, durationSeconds }: Props) {
  const missed = status === "missed" || status === "declined" || status === "canceled";
  const Icon = missed ? PhoneMissed : kind === "video" ? Video : Phone;
  const label =
    status === "missed" ? "Missed call"
    : status === "declined" ? (mine ? "Declined" : "Missed call")
    : status === "canceled" ? (mine ? "Canceled call" : "Missed call")
    : kind === "video" ? "Video call" : "Voice call";
  const meta = durationSeconds > 0 ? fmt(durationSeconds) : "";

  return (
    <div className={`max-w-[76%] px-4 py-2.5 rounded-3xl flex items-center gap-2.5 ${
      missed ? "bg-destructive/10 text-destructive" : mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-primary/10 text-primary"
    }`}>
      <span className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        missed ? "bg-destructive/15" : mine ? "bg-white/15" : "bg-primary/15"
      }`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-tight">{label}</p>
        <p className="text-[11px] opacity-75">{missed ? "Tap to call back" : meta ? `Talked ${meta}` : status === "ended" ? "Call ended" : ""}</p>
      </div>
    </div>
  );
}
