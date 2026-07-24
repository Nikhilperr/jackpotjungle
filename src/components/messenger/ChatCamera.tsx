import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, SwitchCamera, Video, X } from "lucide-react";
import { toastPermissionDenied } from "@/lib/native/permissions";
import { cn } from "@/lib/utils";

type Mode = "photo" | "video";
type Facing = "user" | "environment";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with a captured File (image or short video). Parent should stage/confirm before send. */
  onCapture: (file: File) => void;
};

const LOGO = "/icons/icon-256.webp";

function pickRecorderMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function CameraLogoSplash({ label = "Opening camera…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-4 bg-black">
      <img
        src={LOGO}
        alt="Jackpot Jungle"
        className="h-24 w-24 rounded-2xl object-cover shadow-lg animate-pulse"
      />
      <p className="text-white/75 text-sm font-medium">{label}</p>
    </div>
  );
}

/**
 * Full-screen in-chat camera: Photo | Video, front/back flip.
 * Stream stays hot so Photo↔Video is instant. Does not auto-send.
 */
export function ChatCamera({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAt = useRef(0);
  const facingRef = useRef<Facing>("environment");
  const openGen = useRef(0);

  const [mode, setMode] = useState<Mode>("photo");
  const [facing, setFacing] = useState<Facing>("environment");
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);

  facingRef.current = facing;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const attachStream = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.controls = false;
    await el.play().catch(() => undefined);
  }, []);

  const startStream = useCallback(
    async (nextFacing: Facing, opts?: { soft?: boolean }) => {
      const gen = openGen.current;
      if (!opts?.soft) setReady(false);
      else setSwitching(true);
      setError(null);

      // Keep old stream until new one is ready (avoids blank play-button flash).
      const prev = streamRef.current;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Always grab mic so Photo↔Video never restarts the camera.
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (gen !== openGen.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        await attachStream(stream);
        prev?.getTracks().forEach((t) => t.stop());
        setReady(true);
        setSwitching(false);
      } catch (e: any) {
        if (gen !== openGen.current) return;
        prev?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const name = e?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          toastPermissionDenied("camera");
          setError("Camera permission denied");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("No camera found on this device");
        } else {
          setError(e?.message || "Could not open camera");
        }
        setReady(false);
        setSwitching(false);
      }
    },
    [attachStream],
  );

  useEffect(() => {
    if (!open) {
      openGen.current += 1;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      recorderRef.current = null;
      setRecording(false);
      setReady(false);
      setSwitching(false);
      setError(null);
      setMode("photo");
      setFacing("environment");
      stopStream();
      return;
    }
    openGen.current += 1;
    void startStream("environment");
    return () => {
      openGen.current += 1;
      stopStream();
    };
    // Only boot when opened — mode switches never restart the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - recordingStartedAt.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [recording]);

  async function flipCamera() {
    if (recording || busy || switching) return;
    const next: Facing = facing === "user" ? "environment" : "user";
    setFacing(next);
    await startStream(next, { soft: true });
  }

  function switchMode(next: Mode) {
    if (recording || busy || next === mode) return;
    // Instant — stream already has video (+ mic).
    setMode(next);
  }

  function takePhoto() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || !ready || busy) return;
    setBusy(true);
    try {
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.() || {};
      const w = video.videoWidth || (settings.width as number) || 1280;
      const h = video.videoHeight || (settings.height as number) || 720;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      if (facing === "user") {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          setBusy(false);
          if (!blob) return;
          const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
          onCapture(file);
          onClose();
        },
        "image/jpeg",
        0.92,
      );
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || !ready || recording || busy) return;
    const mime = pickRecorderMime();
    try {
      chunksRef.current = [];
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 })
        : new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        setRecording(false);
        setBusy(false);
        const type = rec.mimeType || mime || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const dur = Date.now() - recordingStartedAt.current;
        if (blob.size < 1000 || dur < 400) return;
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `camera-${Date.now()}.${ext}`, { type });
        onCapture(file);
        onClose();
      };
      recordingStartedAt.current = Date.now();
      rec.start(250);
      setRecording(true);
    } catch (e) {
      console.error(e);
      setError("Could not start video recording");
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setBusy(true);
    try {
      rec.stop();
    } catch {
      setBusy(false);
      setRecording(false);
    }
  }

  function onShutter() {
    if (mode === "photo") takePhoto();
    else if (recording) stopRecording();
    else startRecording();
  }

  function handleClose() {
    if (recording) {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
    }
    onClose();
  }

  if (!open) return null;

  const mm = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const ss = (elapsed % 60).toString().padStart(2, "0");
  const showSplash = (!ready || switching) && !error;

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="relative flex-1 min-h-0 overflow-hidden bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          controls={false}
          disablePictureInPicture
          className={cn(
            "absolute inset-0 h-full w-full object-cover bg-black transition-opacity duration-150",
            ready && !switching ? "opacity-100" : "opacity-0",
            facing === "user" && "scale-x-[-1]",
          )}
        />

        {showSplash && (
          <CameraLogoSplash label={switching ? "Switching camera…" : "Opening camera…"} />
        )}

        {error && (
          <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 px-6 text-center bg-black">
            <img src={LOGO} alt="" className="h-16 w-16 rounded-xl object-cover opacity-90" />
            <p className="text-white text-sm font-medium">{error}</p>
            <button
              type="button"
              onClick={() => void startStream(facingRef.current)}
              className="h-10 px-4 rounded-full bg-white/15 text-white text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        <div className="absolute top-0 inset-x-0 z-[3] pt-[max(0.75rem,env(safe-area-inset-top))] px-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="h-10 w-10 rounded-full bg-black/45 text-white flex items-center justify-center"
            aria-label="Close camera"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex rounded-full bg-black/45 p-1 gap-0.5">
            <button
              type="button"
              disabled={recording || busy}
              onClick={() => switchMode("photo")}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-semibold transition-colors",
                mode === "photo" ? "bg-white text-black" : "text-white/80",
              )}
            >
              Photo
            </button>
            <button
              type="button"
              disabled={recording || busy}
              onClick={() => switchMode("video")}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-semibold transition-colors",
                mode === "video" ? "bg-white text-black" : "text-white/80",
              )}
            >
              Video
            </button>
          </div>

          <button
            type="button"
            onClick={() => void flipCamera()}
            disabled={recording || busy || !ready || switching}
            className="h-10 w-10 rounded-full bg-black/45 text-white flex items-center justify-center disabled:opacity-40"
            aria-label="Flip camera"
          >
            <SwitchCamera className="h-5 w-5" />
          </button>
        </div>

        {recording && (
          <div className="absolute top-16 left-1/2 z-[3] -translate-x-1/2 flex items-center gap-2 rounded-full bg-red-600/90 text-white text-xs font-semibold px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            REC {mm}:{ss}
          </div>
        )}
      </div>

      <div className="shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 px-6 bg-black flex items-center justify-center gap-10">
        <div className="w-10" />
        <button
          type="button"
          onClick={onShutter}
          disabled={!ready || !!error || busy || switching}
          className={cn(
            "relative h-[72px] w-[72px] rounded-full border-[3px] border-white flex items-center justify-center disabled:opacity-40",
            recording && "border-red-500",
          )}
          aria-label={mode === "photo" ? "Take photo" : recording ? "Stop recording" : "Start recording"}
        >
          <span
            className={cn(
              "transition-all",
              mode === "photo" && "h-14 w-14 rounded-full bg-white",
              mode === "video" && !recording && "h-14 w-14 rounded-full bg-red-500",
              mode === "video" && recording && "h-7 w-7 rounded-md bg-red-500",
            )}
          />
        </button>
        <div className="w-10 flex justify-center text-white/70">
          {mode === "photo" ? <Camera className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </div>
      </div>
    </div>
  );
}
