import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { registerBackAction } from "@/lib/native/navigation";
import { Capacitor } from "@capacitor/core";

const DEFAULT_WIDTH = 288; // w-72
const DISMISS_THRESHOLD = 96;
const VELOCITY_DISMISS = 0.45; // px/ms

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width in px — match child aside (default 288 / w-72). */
  width?: number;
};

/**
 * Messenger-style left drawer: solid dim (no blur on native), elevation,
 * interactive drag-to-dismiss, and Android back closes first.
 */
export function NativeSideDrawer({ open, onClose, children, width = DEFAULT_WIDTH }: Props) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const velocityRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const drawerWidth = width;

  useEffect(() => {
    if (!open) {
      setDragX(0);
      setDragging(false);
      return;
    }
    return registerBackAction(() => {
      onClose();
      return true;
    }, 100);
  }, [open, onClose]);

  // Lock body scroll while open (mobile).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const finishDrag = useCallback(() => {
    const shouldClose = dragX < -DISMISS_THRESHOLD || velocityRef.current < -VELOCITY_DISMISS;
    setDragging(false);
    if (shouldClose) {
      onClose();
      setDragX(0);
    } else {
      setDragX(0);
    }
  }, [dragX, onClose]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    startXRef.current = e.clientX;
    lastXRef.current = e.clientX;
    lastTRef.current = performance.now();
    velocityRef.current = 0;
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    const dx = Math.min(0, e.clientX - startXRef.current);
    const now = performance.now();
    const dt = Math.max(1, now - lastTRef.current);
    velocityRef.current = (e.clientX - lastXRef.current) / dt;
    lastXRef.current = e.clientX;
    lastTRef.current = now;
    setDragX(dx);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    finishDrag();
  };

  if (!open) return null;

  const progress = Math.min(1, Math.max(0, 1 + dragX / drawerWidth));
  const dimOpacity = 0.45 * progress;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 border-0 p-0 cursor-default"
        style={{
          backgroundColor: `rgba(0,0,0,${dimOpacity})`,
          // Avoid backdrop-filter on native — janks MIUI WebView.
          backdropFilter: isNative ? "none" : undefined,
          WebkitBackdropFilter: isNative ? "none" : undefined,
          transition: dragging ? "none" : "background-color 200ms ease-out",
        }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        data-jj-drawer-shell
        className="relative z-10 h-full will-change-transform touch-pan-y animate-in slide-in-from-left duration-200 native-safe-shell bg-card"
        style={{
          width: drawerWidth,
          transform: `translate3d(${dragX}px,0,0)`,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1)",
          boxShadow: "8px 0 32px rgba(0,0,0,0.45)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
