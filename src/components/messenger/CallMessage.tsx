import { Phone, PhoneMissed, Video } from "lucide-react";

type Props = {
  mine: boolean;
  kind: "voice" | "video";
  status: "ended" | "missed" | "declined" | "canceled" | "active" | "ringing";
  durationSeconds: number;
};

function fmtDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || (h === 0 && m === 0)) parts.push(`${s}s`);
  
  return parts.join(" ");
}

export function CallMessage({ mine, kind, status, durationSeconds }: Props) {
  const missed = status === "missed" || status === "declined" || status === "canceled";
  const Icon = missed ? PhoneMissed : kind === "video" ? Video : Phone;

  const direction = mine ? "Outgoing" : "Incoming";
  const typeLabel = kind === "video" ? "Video Call" : "Voice Call";
  const label = `${direction} ${typeLabel}`;

  let subtitle = "";
  if (status === "missed") {
    subtitle = "Missed";
  } else if (status === "declined") {
    subtitle = "Declined";
  } else if (status === "canceled") {
    subtitle = "Cancelled";
  } else if (status === "active" || status === "ringing") {
    subtitle = status === "active" ? "Active" : "Ringing";
  } else if (durationSeconds > 0) {
    subtitle = fmtDuration(durationSeconds);
  } else {
    subtitle = "Call ended";
  }

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
        <p className="text-[11px] opacity-75">{subtitle}</p>
      </div>
    </div>
  );
}
