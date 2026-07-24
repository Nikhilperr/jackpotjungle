import React, { useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Camera, ChevronRight, ImageIcon, Loader2, Send, Smile, ThumbsUp } from "lucide-react";
import { VoiceRecorder } from "@/components/messenger/VoiceRecorder";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string, cursor: number) => void;
  onSubmit: (e: FormEvent) => void;
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

/**
 * Messenger-style composer: full tool row when idle; collapses to chevron + gallery
 * when the field is focused or has text. Tap the chevron to expand tools again.
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
  const hasText = value.trim().length > 0;

  const showFullTools = !hideMedia && (pinnedOpen || (!focused && !hasText));
  const showCollapsedChrome = !hideMedia && !showFullTools;

  function openPicker() {
    fileRef.current?.click();
  }

  function collapseTools() {
    setPinnedOpen(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative px-2 py-2 border-t border-border flex items-center gap-0.5 bg-background shrink-0"
    >
      {children}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif"
        onChange={onFileChange}
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
                onClick={openPicker}
                disabled={uploading}
                className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50 transition-colors"
                aria-label="Take photo"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              </button>
            </>
          )}

          {/* Gallery stays visible collapsed + expanded (Messenger keeps one media affordance). */}
          <button
            type="button"
            onClick={openPicker}
            disabled={uploading}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-primary hover:bg-secondary disabled:opacity-50 transition-colors"
            aria-label="Send image"
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
  );
}
