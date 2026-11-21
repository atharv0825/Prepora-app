"use client";

import { useEffect, useRef } from "react";

/**
 * Fades content up when it scrolls into view (design doc §5).
 * Server-rendered content is visible by default; it's only hidden once JS is running and the
 * element is still below the fold, so nothing disappears if JS fails. Reduced motion: the global
 * CSS makes the animation instant.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    el.classList.add("opacity-0");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.remove("opacity-0");
          el.classList.add("animate-fade-up");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
