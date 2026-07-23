import React, { useState, useEffect, useRef } from "react";
import { getCachedMedia, releaseCachedMedia } from "@/lib/media-cache";

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  placeholderSrc?: string;
  fallbackSrc?: string;
  progressive?: boolean;
  cachePolicy?: "persistent" | "volatile";
}

export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  placeholderSrc,
  fallbackSrc,
  progressive = true,
  cachePolicy = "volatile",
  className,
  style,
  ...props
}) => {
  const [displaySrc, setDisplaySrc] = useState<string>(placeholderSrc || "");
  const [isLoaded, setIsLoaded] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<HTMLImageElement | null>(null);
  const resolvedUrlRef = useRef<string>("");

  useEffect(() => {
    let active = true;

    const loadImage = async () => {
      if (!src) return;

      try {
        const cached = await getCachedMedia(src, cachePolicy);
        if (active) {
          resolvedUrlRef.current = cached;
          setDisplaySrc(cached);
          setIsLoaded(true);
        } else {
          // If the component unmounted while fetching, clean it up
          if (cachePolicy === "volatile" && cached.startsWith("blob:")) {
            releaseCachedMedia(cached);
          }
        }
      } catch (err) {
        if (active) {
          setDisplaySrc(src);
          setIsLoaded(true);
        }
      }
    };

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadImage();
          if (observerRef.current && elementRef.current) {
            observerRef.current.unobserve(elementRef.current);
          }
        }
      });
    };

    // Lazy load with prefetch (rootMargin: 400px triggers loading just before image enters viewport)
    if (typeof window !== "undefined" && window.IntersectionObserver && elementRef.current) {
      observerRef.current = new IntersectionObserver(handleIntersection, {
        rootMargin: "400px",
      });
      observerRef.current.observe(elementRef.current);
    } else {
      loadImage();
    }

    return () => {
      active = false;
      if (observerRef.current && elementRef.current) {
        observerRef.current.unobserve(elementRef.current);
      }
      // Volatile cleanup on unmount
      if (cachePolicy === "volatile" && resolvedUrlRef.current) {
        releaseCachedMedia(resolvedUrlRef.current);
        resolvedUrlRef.current = "";
      }
    };
  }, [src, cachePolicy]);

  const handleError = () => {
    if (fallbackSrc && displaySrc !== fallbackSrc) {
      setDisplaySrc(fallbackSrc);
    } else {
      setDisplaySrc(src); // fallback to network url on local errors
    }
  };

  const imageClass = className || "";
  
  if (!progressive) {
    return (
      <img
        ref={elementRef}
        src={displaySrc}
        onError={handleError}
        className={imageClass}
        style={style}
        {...props}
      />
    );
  }

  return (
    <div 
      className="relative overflow-hidden inline-block" 
      style={{ 
        width: style?.width, 
        height: style?.height,
        borderRadius: style?.borderRadius
      }}
    >
      {!isLoaded && (
        <div className="absolute inset-0 bg-secondary/35 animate-pulse rounded-[inherit]" />
      )}
      <img
        ref={elementRef}
        src={displaySrc}
        onError={handleError}
        className={`${imageClass} transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        style={style}
        {...props}
      />
    </div>
  );
};
