/**
 * Schedule work after the first paint so native cold start stays interactive.
 * Uses requestIdleCallback when available, otherwise a short timeout.
 */
export function runAfterFirstPaint(fn: () => void, timeoutMs = 1200): () => void {
  if (typeof window === "undefined") {
    fn();
    return () => {};
  }

  let cancelled = false;
  let idleId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;

  const run = () => {
    if (cancelled) return;
    fn();
  };

  rafId = window.requestAnimationFrame(() => {
    rafId = window.requestAnimationFrame(() => {
      const ric = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout: number }) => number)
        | undefined;
      if (typeof ric === "function") {
        idleId = ric(run, { timeout: timeoutMs });
      } else {
        timeoutId = setTimeout(run, Math.min(timeoutMs, 400));
      }
    });
  });

  return () => {
    cancelled = true;
    if (rafId != null) window.cancelAnimationFrame(rafId);
    if (idleId != null && typeof (window as any).cancelIdleCallback === "function") {
      (window as any).cancelIdleCallback(idleId);
    }
    if (timeoutId != null) clearTimeout(timeoutId);
  };
}
