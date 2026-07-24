import React, { useEffect, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Camera, ChevronRight, ImageIcon, Loader2, Send, Smile, ThumbsUp, X } from "lucide-react";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { ChatCamera } from "@/components/messenger/ChatCamera";
import { isChatVideoFile } from "@/lib/chat-video";
import { cn } from "@/lib/utils";

type PendingMedia = { file: File; url: string; kind: "image" | "video" };

type Props = {
  value: string;
  onChange: (value: string, cursor: number) => void;
  onSubmit: (e: FormEvent) => void;
  /** Called only after the user confirms Send on the preview — never on raw pick/capture. */
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onVoice: (blob: Blob, mime: string, ext: string) => void | Promise<void>;
  placeholder?: string;
  sending?: boolean;
  uploading?: boolean;
  recUploading?: boolean;
  hideMedia?: boolean;
  showEmojiButton?: boolean;
  emojiActive?: boolean;
  onToggleEmoji?: () => void;
  onThumbsUp?: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  inputRef?: RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  children?: ReactNode;
  /** Extra left-side tools shown only when the toolbar is expanded. */
  expandedExtras?: ReactNode;
};

function makeFileChangeEvent(files: File[]): ChangeEvent<HTMLInputElement> {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  const input = document.createElement("input");
  input.type = "file";
  input.files = dt.files;
  return { target: input, currentTarget: input } as ChangeEvent<HTMLInputElement>;
}

/**
 * Messenger-style composer: full tool row when idle; collapses to chevron + gallery
 * when the field is focused or has text. Tap the chevron to expand tools again.
 * Gallery/camera stage media for confirm — never auto-sends.
 */
export function MessengerComposer({
  value,
  onChange,
  onSubmit,
  onFileChange,
  onVoice,
  placeholder = "Aa",
  sending = false,
  uploading = false,
  recUploading = false,
  hideMedia = false,
  showEmojiButton = true,
  emojiActive = false,
  onToggleEmoji,
  onThumbsUp,
  fileRef,
  inputRef,
  onKeyDown,
  autoFocus,
  children,
  expandedExtras,
}: Props) {
  // autoFocus chats (admin inbox) should open already collapsed like Messenger.
  const [focused, setFocused] = useState(!!autoFocus);
  /** User pinned the tool row open via the chevron while the field is active. */
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const hasText = value.trim().length > 0;

  const showFullTools = !hideMedia && (pinnedOpen || (!focused && !hasText)) && pending.length === 0;
  const showCollapsedChrome = !hideMedia && !showFullTools && pending.length === 0;

  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  function openGallery() {
    // Keep tools collapsed; open the system gallery immediately (no second tap).
    setPinnedOpen(false);
    fileRef.current?.click();
  }

  function openCamera() {
    setPinnedOpen(false);
    setCameraOpen(true);
  }

  function collapseTools() {
    setPinnedOpen(false);
  }

  function clearPending() {
    setPending((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }

  function stageFiles(list: File[]) {
    if (list.length === 0) return;
    const next: PendingMedia[] = [];
    for (const file of list.slice(0, 8)) {
      const kind = isChatVideoFile(file, file.name) ? "video" : "image";
      next.push({ file, url: URL.createObjectURL(file), kind });
    }
    setPending((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return next;
    });
  }

  function onPickerChange(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    stageFiles(list);
  }

  function onCameraCapture(file: File) {
    stageFiles([file]);
  }

  function confirmSendMedia() {
    if (pending.length === 0 || uploading) return;
    const files = pending.map((p) => p.file);
    for (const file of files) {
      onFileChange(makeFileChangeEvent([file]));
    }
    clearPending();
  }

  function removePending(idx: number) {
    setPending((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return copy;
    });
  }

  const videoCount = pending.filter((p) => p.kind === "video").length;
  const photoCount = pending.length - videoCount;
  const pendingLabel =
    pending.length === 0
      ? ""
      : videoCount > 0 && photoCount === 0
        ? pending.length === 1
          ? "Selected video"
          : `${pending.length} videos selected`
        : photoCount > 0 && videoCount === 0
          ? pending.length === 1
            ? "Selected photo"
            : `${pending.length} photos selected`
          : `${pending.length} items selected`;

  const sendLabel =
    videoCount > 0 && photoCount === 0
      ? pending.length > 1
        ? `Send ${pending.length} videos`
        : "Send video"
      : photoCount > 0 && videoCount === 0
        ? pending.length > 1
          ? `Send ${pending.length} photos`
          : "Send photo"
        : `Send ${pending.length}`;

  return (
    <div className="relative shrink-0 bg-background border-t border-border">
      <ChatCamera open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={onCameraCapture} />

      {pending.length > 0 && (
        <div className="px-3 pt-3 pb-2 space-y-2 border-b border-border/60 bg-card/80">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {pendingLabel}
            </p>
            <button
              type="button"
              onClick={clearPending}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pending.map((p, i) => (
              <div key={p.url} className="relative shrink-0 h-24 w-24 rounded-xl overflow-hidden border border-border bg-secondary">
                {p.kind === "video" ? (
                  <video src={p.url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={confirmSendMedia}
            disabled={uploading || sending}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendLabel}
          </button>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="relative px-2 py-2 flex items-center gap-0.5"
      >
        {children}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif"
          multiple
          onChange={onPickerChange}
          className="hidden"
        />

        {!hideMedia && (
          <>
            {showCollapsedChrome && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPinnedOpen(true)}
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary transition-colors"
                aria-label="Show more actions"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}

            {showFullTools && (
              <>
                {expandedExtras}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={openCamera}
                  disabled={uploading}
                  className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50 transition-colors"
                  aria-label="Open camera"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                </button>
              </>
            )}

            {/* Gallery stays visible collapsed + expanded (Messenger keeps one media affordance). */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openGallery}
              disabled={uploading}
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50 transition-colors"
              aria-label="Choose photo"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
            </button>

            <VoiceRecorder
              onRecorded={onVoice}
              uploading={recUploading}
              hideIdle={!showFullTools}
            />
          </>
        )}

        <div className="flex-1 min-w-0 h-9 rounded-full bg-secondary flex items-center pl-3.5 pr-1 gap-0.5">
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => {
              collapseTools();
              onChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              collapseTools();
            }}
            onBlur={() => setFocused(false)}
            onClick={collapseTools}
            placeholder={placeholder}
            enterKeyHint="send"
            className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
          />
          {showEmojiButton && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToggleEmoji?.()}
              className={cn(
                "h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition-colors",
                emojiActive ? "text-primary" : "text-primary/80 hover:text-primary",
              )}
              aria-label="Emoji"
            >
              <Smile className="h-5 w-5" />
            </button>
          )}
        </div>

        {hasText ? (
          <button
            type="submit"
            disabled={sending}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50 send-btn-active transition-all"
            aria-label="Send"
          >
            <Send className="h-5 w-5" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onThumbsUp?.()}
            disabled={!onThumbsUp || sending}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-60 transition-colors"
            aria-label="Like"
          >
            <ThumbsUp className="h-5 w-5" fill="currentColor" />
          </button>
        )}
      </form>
    </div>
  );
}
