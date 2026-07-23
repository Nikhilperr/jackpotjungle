/**
 * Messenger-style inbox placeholders: soft blur/shimmer rows while network catches up.
 * Shown inside the real chat shell — never a full-screen loading flash.
 */
export function ChatListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="px-2 pt-1 pb-4 space-y-0.5" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-3 rounded-2xl"
          style={{ opacity: 1 - i * 0.06 }}
        >
          <div className="h-12 w-12 shrink-0 rounded-full bg-muted/70 jj-skel" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-[42%] max-w-[9rem] rounded-full bg-muted/70 jj-skel" />
            <div className="h-3 w-[68%] max-w-[14rem] rounded-full bg-muted/50 jj-skel" />
          </div>
          <div className="h-2.5 w-8 shrink-0 rounded-full bg-muted/40 jj-skel" />
        </div>
      ))}
      <style>{`
        @keyframes jj-skel-pulse {
          0%, 100% { filter: blur(0px); opacity: 0.55; }
          50% { filter: blur(0.6px); opacity: 0.9; }
        }
        .jj-skel {
          animation: jj-skel-pulse 1.1s ease-in-out infinite;
          will-change: opacity, filter;
        }
      `}</style>
    </div>
  );
}
