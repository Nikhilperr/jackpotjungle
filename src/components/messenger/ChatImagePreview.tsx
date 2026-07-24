import { useState, type MouseEvent } from "react";
import { Download, Loader2, X } from "lucide-react";
import { downloadChatMedia } from "@/lib/chat-clipboard";
import { isChatVideoUrl } from "@/lib/chat-video";

type Props = {
  url: string;
  onClose: () => void;
};

/** Full-screen chat media viewer with close + bottom-right download. */
export function ChatImagePreview({ url, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);
  const isVideo = isChatVideoUrl(url);

  async function onDownload(e: MouseEvent) {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadChatMedia(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isVideo ? "Video preview" : "Photo preview"}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {isVideo ? (
        <video
          src={url}
          controls
          playsInline
          autoPlay
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={url}
          alt=""
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="absolute bottom-6 right-6 z-10 h-12 w-12 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 active:scale-95 disabled:opacity-60 shadow-lg backdrop-blur-sm"
        style={{ marginBottom: "max(0px, env(safe-area-inset-bottom))" }}
        aria-label="Download"
      >
        {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
      </button>
    </div>
  );
}
