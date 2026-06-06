import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Trash2 } from "lucide-react";

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
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => () => stopStream(), []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
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
        if (!cancelRef.current && blob.size > 0) await onRecorded(blob, mime, ext);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setSeconds(0);
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
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
      <div className="flex items-center gap-2 px-3 h-10 rounded-full bg-destructive/10 text-destructive shrink-0">
        <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-xs font-mono tabular-nums">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </span>
        <button type="button" onClick={() => stop(true)} className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-destructive/20" aria-label="Cancel">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => stop(false)} className="h-7 w-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center" aria-label="Stop & send">
          <Square className="h-3.5 w-3.5 fill-current" />
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
