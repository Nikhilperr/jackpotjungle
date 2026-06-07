import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  disabled?: boolean;
  uploading?: boolean;
  onRecorded: (blob: Blob, mime: string, ext: string) => void | Promise<void>;
};

function pickMime(): { mime: string; ext: string } {
  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  const MR = typeof window !== "undefined" ? (window as any).MediaRecorder : null;
  if (!MR) return candidates[0];
  for (const c of candidates) if (MR.isTypeSupported?.(c.mime)) return c;
  return candidates[0];
}

const BAR_COUNT = 28;
const CANCEL_THRESHOLD = 80; // px upward swipe to cancel

export function VoiceRecorder({ disabled, uploading, onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.12));
  const [dragY, setDragY] = useState(0); // negative when swiping up
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const recordingRef = useRef(false);

  useEffect(() => () => stopStream(), []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  function startMeter(stream: MediaStream) {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      analyserRef.current = an;
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const lvl = Math.min(1, 0.12 + rms * 3.2);
        setLevels((prev) => {
          const next = prev.slice(1);
          next.push(lvl);
          return next;
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      /* ignore */
    }
  }

  async function start() {
    if (disabled || recordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime, ext } = pickMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const wasCancelled = cancelRef.current;
        stopStream();
        recordingRef.current = false;
        setRecording(false);
        setSeconds(0);
        setDragY(0);
        setLevels(Array(BAR_COUNT).fill(0.12));
        if (!wasCancelled && blob.size > 0) await onRecorded(blob, mime, ext);
      };
      rec.start();
      recRef.current = rec;
      recordingRef.current = true;
      setRecording(true);
      setSeconds(0);
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      startMeter(stream);
    } catch (err) {
      console.error(err);
      alert("Microphone permission denied.");
    }
  }

  function stop(cancel = false) {
    if (!recRef.current) return;
    cancelRef.current = cancel;
    try { recRef.current.stop(); } catch { /* noop */ }
    recRef.current = null;
  }

  function handleMicClick() {
    if (disabled || uploading || recordingRef.current) return;
    void start();
  }

  return (
    <>
      {recording && (
        <div className="absolute inset-0 z-20 flex items-center gap-2 px-3 bg-card animate-fade-in select-none">
          {/* Cancel button */}
          <button
            type="button"
            onClick={() => stop(true)}
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95 transition"
            aria-label="Cancel recording"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Waveform pill */}
          <div className="flex-1 min-w-0 h-10 px-3 rounded-full bg-secondary flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0" />
            <span className="text-xs font-mono tabular-nums text-foreground shrink-0 w-10">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0 h-6 flex items-center gap-[2px] overflow-hidden">
              {levels.map((v, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-full bg-primary/70 transition-all duration-75"
                  style={{ height: `${Math.max(8, Math.round(v * 100))}%` }}
                />
              ))}
            </div>
          </div>

          {/* Send button (matches form submit styling) */}
          <Button
            type="button"
            size="icon"
            onClick={() => stop(false)}
            className="rounded-full shrink-0"
            aria-label="Send voice message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={handleMicClick}
        disabled={disabled || uploading}
        className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50"
        aria-label="Record voice message"
      >
        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
      </button>
    </>
  );
}

