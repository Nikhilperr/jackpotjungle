import { Phone, PhoneMissed, Video, VideoOff } from "lucide-react";

type Props = {
  mine: boolean;
  kind: "voice" | "video";
  status: "ended" | "missed" | "declined" | "canceled" | "active" | "ringing";
  durationSeconds: number;
  onCallBack?: () => void;
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

export function CallMessage({ mine, kind, status, durationSeconds, onCallBack }: Props) {
  const missed = status === "missed" || status === "declined" || status === "canceled";
  const Icon = missed ? PhoneMissed : kind === "video" ? Video : Phone;

  const typeLabel = kind === "video" ? "Video Call" : "Audio Call";
  
  let mainTitle = "";
  if (status === "missed") {
    mainTitle = `Missed ${typeLabel}`;
  } else if (status === "declined") {
    mainTitle = `Declined ${typeLabel}`;
  } else if (status === "canceled") {
    mainTitle = `Cancelled ${typeLabel}`;
  } else {
    mainTitle = mine ? `Outgoing ${typeLabel}` : `Incoming ${typeLabel}`;
  }

  let subtitle = "";
  if (status === "active" || status === "ringing") {
    subtitle = status === "active" ? "Active now" : "Ringing";
  } else if (durationSeconds > 0) {
    subtitle = `Answered • ${fmtDuration(durationSeconds)}`;
  } else {
    subtitle = "Call ended";
  }

  return (
    <div className="w-full max-w-[240px] bg-secondary/40 border border-border/80 rounded-2xl p-3 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
          missed ? "bg-red-500/10 text-red-500 dark:text-red-400" : "bg-primary/10 text-primary"
        }`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight text-foreground truncate">{mainTitle}</p>
          <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">{subtitle}</p>
        </div>
      </div>
      {onCallBack && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCallBack(); }}
          className="w-full py-1.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-[11px] transition-colors flex items-center justify-center gap-1.5 border border-border"
        >
          {kind === "video" ? <Video className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
          Call back
        </button>
      )}
    </div>
  );
}
