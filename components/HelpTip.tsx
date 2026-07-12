"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  title: string;
  description: string;
};

export function HelpTip({ title, description }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  function open() {
    setRect(btnRef.current?.getBoundingClientRect() ?? null);
  }

  function close() {
    setRect(null);
  }

  // Close on Escape or click outside
  useEffect(() => {
    if (!rect) return;
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    function handleClick(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [rect]);

  // Position: above the button, centered horizontally, clamped to viewport
  const tooltipWidth = 288;
  const left = rect
    ? Math.min(
        Math.max(8, rect.left + rect.width / 2 - tooltipWidth / 2),
        window.innerWidth - tooltipWidth - 8
      )
    : 0;
  const top = rect ? rect.top - 8 : 0; // will be shifted up via transform

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={rect ? close : open}
        aria-label={`Definición: ${title}`}
        aria-expanded={!!rect}
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[0.55rem] font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${rect ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-500 hover:bg-teal-100 hover:text-teal-700"}`}
      >
        ?
      </button>

      {rect && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{ position: "fixed", left, top, transform: "translateY(-100%)", width: tooltipWidth, zIndex: 9999 }}
          className="rounded-2xl bg-slate-900 p-4 shadow-2xl"
        >
          <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-teal-400">{title}</p>
          <p className="text-[0.75rem] leading-[1.5] text-slate-300">{description}</p>
          {/* Arrow pointing down */}
          <span
            style={{ left: rect.left + rect.width / 2 - left - 6 }}
            className="absolute -bottom-1.5 h-3 w-3 rotate-45 bg-slate-900"
          />
        </div>,
        document.body
      )}
    </>
  );
}
