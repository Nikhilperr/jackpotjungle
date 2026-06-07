import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, Trash2, Send } from "lucide-react";

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

export function VoiceRecorder({ disabled, uploading, onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(24).fill(0.15));
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

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
        const lvl = Math.min(1, 0.15 + rms * 3);
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
    if (disabled || recording) return;
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
        stopStream();
        setRecording(false);
        setSeconds(0);
        setLevels(Array(24).fill(0.15));
        if (!cancelRef.current && blob.size > 0) await onRecorded(blob, mime, ext);
      };
      rec.start();
      recRef.current = rec;
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
    cancelRef.current = cancel;
    recRef.current?.stop();
    recRef.current = null;
  }

  if (recording) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0 h-10 px-2 rounded-full bg-destructive/10 animate-fade-in">
        <button
          type="button"
          onClick={() => stop(true)}
          className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/15 active:scale-95 transition"
          aria-label="Cancel recording"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1 min-w-0">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0" />
          <span className="text-xs font-mono tabular-nums text-destructive shrink-0">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
          </span>
        </div>

        <div className="flex-1 min-w-0 h-6 flex items-center gap-[2px] overflow-hidden px-1">
          {levels.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-full bg-destructive/70 transition-all duration-100"
              style={{ height: `${Math.max(8, Math.round(v * 100))}%` }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => stop(false)}
          className="h-8 w-8 shrink-0 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 active:scale-95 transition"
          aria-label="Send voice message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || uploading}
      className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50"
      aria-label="Record voice message"
    >
      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
    </button>
  );
}
