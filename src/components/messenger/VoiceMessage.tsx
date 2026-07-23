import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCachedMedia, releaseCachedMedia } from "@/lib/media-cache";

type Props = {
  src: string;
  mine?: boolean;
};

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Stable pseudo-random bar heights per src (so it doesn't reshuffle on render)
function makeBars(src: string, count = 28): number[] {
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const v = (h % 1000) / 1000; // 0..1
    bars.push(0.25 + v * 0.75);
  }
  return bars;
}

export function VoiceMessage({ src, mine }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const barsRef = useRef<number[]>(makeBars(src));
  const resolvedUrlRef = useRef<string>("");

  useEffect(() => {
    let active = true;
    const a = new Audio();
    a.preload = "metadata";
    audioRef.current = a;

    const onMeta = () => setDuration(a.duration || 0);
    const onTime = () => setCurrent(a.currentTime || 0);
    const onEnd = () => { setPlaying(false); setCurrent(0); a.currentTime = 0; };
    const onPlay = () => { setPlaying(true); setLoading(false); };
    const onPause = () => setPlaying(false);
    const onWait = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("waiting", onWait);
    a.addEventListener("canplay", onCanPlay);

    // Fetch and load from Cache API
    getCachedMedia(src, "volatile").then((cached) => {
      if (active) {
        resolvedUrlRef.current = cached;
        a.src = cached;
      } else {
        if (cached.startsWith("blob:")) {
          releaseCachedMedia(cached);
        }
      }
    }).catch(() => {
      if (active) {
        a.src = src;
      }
    });

    return () => {
      active = false;
      a.pause();
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("waiting", onWait);
      a.removeEventListener("canplay", onCanPlay);
      audioRef.current = null;

      // Release volatile audio URL
      if (resolvedUrlRef.current) {
        releaseCachedMedia(resolvedUrlRef.current);
        resolvedUrlRef.current = "";
      }
    };
  }, [src]);

  async function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); return; }
    try {
      setLoading(true);
      await a.play();
    } catch {
      setLoading(false);
    }
  }

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * duration;
    setCurrent(a.currentTime);
  }

  const progress = duration > 0 ? current / duration : 0;
  const bars = barsRef.current;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-3xl select-none min-w-[200px] max-w-[280px]",
        mine ? "bg-bubble-me text-bubble-me-foreground" : "bg-bubble-them text-bubble-them-foreground",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-95",
          mine ? "bg-white/20 hover:bg-white/30" : "bg-primary text-primary-foreground hover:opacity-90",
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current translate-x-[1px]" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div
          onClick={seekTo}
          className="h-8 flex items-center gap-[2px] cursor-pointer"
        >
          {bars.map((h, i) => {
            const filled = i / bars.length < progress;
            return (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-all duration-150",
                  mine
                    ? filled ? "bg-white" : "bg-white/40"
                    : filled ? "bg-primary" : "bg-foreground/25",
                  playing && !filled && "animate-pulse",
                )}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            );
          })}
        </div>
        <div className={cn("text-[11px] font-mono tabular-nums mt-0.5", mine ? "text-white/80" : "text-muted-foreground")}>
          {fmt(playing || current > 0 ? current : duration)}
        </div>
      </div>
    </div>
  );
}
