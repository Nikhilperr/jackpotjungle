import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
};

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const isAtTop = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      isAtTop.current = el.scrollTop === 0;
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    if (isAtTop.current) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (refreshing || startY.current === 0) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    if (diff > 0 && isAtTop.current) {
      // Apply drag resistance
      const distance = Math.min(diff * 0.4, 80);
      setPullDistance(distance);
      // Prevent browser default pull-to-refresh behavior
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = async () => {
    if (refreshing) return;
    startY.current = 0;
    if (pullDistance >= 50) {
      setRefreshing(true);
      setPullDistance(50);
      try {
        await onRefresh();
      } catch (e) {
        console.error(e);
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex-1 overflow-y-auto h-full flex flex-col"
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-150 ease-out bg-slate-950/10 shrink-0"
        style={{
          height: refreshing ? 50 : pullDistance,
          opacity: pullDistance > 0 || refreshing ? 1 : 0,
        }}
      >
        <Loader2 className={`h-6 w-6 text-primary ${refreshing ? "animate-spin" : ""}`} style={{ transform: refreshing ? "none" : `rotate(${pullDistance * 5}deg)` }} />
      </div>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
