import { isNative } from "@/lib/native/utils";

/**
 * Desktop browser only — enables native text selection / copy for chat bubbles.
 * Native Android/iOS keep long-press menus and select-none behaviour.
 */
export function isDesktopWeb(): boolean {
  if (typeof window === "undefined") return false;
  if (isNative()) return false;
  // Prefer fine pointer (mouse/trackpad) over coarse touch tablets in browser.
  try {
    if (window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches) {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/** Class for message body text: selectable on desktop web, locked on native/mobile. */
export function messageTextSelectClass(): string {
  return isDesktopWeb() ? "jj-msg-text select-text" : "jj-msg-text select-none";
}

/** Class for bubble chrome that should not steal selection on desktop. */
export function messageBubbleSelectClass(): string {
  return isDesktopWeb() ? "jj-msg-bubble" : "jj-msg-bubble select-none";
}

/**
 * Context menu on message bubbles:
 * - Native / touch: preventDefault → app long-press menu
 * - Desktop web: allow browser Copy menu (do not preventDefault)
 */
export function onMessageContextMenu(
  e: { preventDefault: () => void },
  openAppMenu?: () => void,
): void {
  if (isDesktopWeb()) {
    // Let the browser show Copy / standard context menu.
    return;
  }
  e.preventDefault();
  openAppMenu?.();
}
