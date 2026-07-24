import { CachedImage } from "@/components/messenger/CachedImage";
import { isChatVideoUrl } from "@/lib/chat-video";

type Props = {
  url: string;
  onPreview: (url: string) => void;
  className?: string;
};

/** Renders a chat image or short camera video from image_url. */
export function ChatMediaBubble({ url, onPreview, className }: Props) {
  const src = url;
  const isVideo = isChatVideoUrl(src);

  if (isVideo) {
    return (
      <div className={className ?? "max-w-[200px] rounded-2xl overflow-hidden min-h-[150px] bg-secondary/35"}>
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          className="block max-h-80 w-[200px] object-cover rounded-2xl bg-black"
          style={{ width: "200px", height: "auto", maxHeight: "320px" }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPreview(src)}
      className={
        className ??
        "max-w-[200px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary block min-h-[150px] bg-secondary/35 flex items-center justify-center"
      }
    >
      <CachedImage
        src={src}
        alt=""
        className="block max-h-80 w-[200px] object-cover rounded-2xl"
        style={{ width: "200px", height: "auto", maxHeight: "320px" }}
        cachePolicy="persistent"
      />
    </button>
  );
}
