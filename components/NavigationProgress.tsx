"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const NavigationCtx = createContext<() => void>(() => {});

export function useNavigationTrigger() {
  return useContext(NavigationCtx);
}

export default function NavigationProgress({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState(false);
  const [fading, setFading] = useState(false);

  const trigger = useCallback(() => {
    clearTimeout(timer.current);
    setActive(true);
    setFading(false);
  }, []);

  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    if (!active) return;

    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setFading(true);
      timer.current = setTimeout(() => {
        setActive(false);
        setFading(false);
      }, 300);
    }, 200);

    return () => clearTimeout(timer.current);
  }, [pathname, active]);

  const barOpacity = active ? 1 : 0;
  const barScale = fading ? "scaleX(1)" : active ? "scaleX(0.72)" : "scaleX(0)";
  const barTransition = fading
    ? "transform 0.15s ease-out, opacity 0.25s ease-out 0.1s"
    : active
    ? "transform 0.35s ease-out"
    : "none";

  const overlayOpacity = fading ? 0 : active ? 1 : 0;
  const overlayTransition = fading ? "opacity 0.3s ease-out" : "none";

  return (
    <NavigationCtx.Provider value={trigger}>
      {children}
      {/* Top progress bar */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "var(--accent)",
          zIndex: 60,
          pointerEvents: "none",
          transformOrigin: "left center",
          opacity: barOpacity,
          transform: barScale,
          transition: barTransition,
        }}
      />
      {/* Content overlay */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--shell-background)",
          zIndex: 50,
          pointerEvents: active && !fading ? "all" : "none",
          opacity: overlayOpacity,
          transition: overlayTransition,
        }}
      />
    </NavigationCtx.Provider>
  );
}
