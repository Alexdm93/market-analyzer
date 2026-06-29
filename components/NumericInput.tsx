"use client";
import { useEffect, useState } from "react";

function fmt(n: number): string {
  if (!n) return "";
  const [int, dec] = n.toString().split(".");
  const thousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${thousands},${dec}` : thousands;
}

function parse(raw: string): number {
  // Accept comma as decimal separator (typed when not focused) or dot (typed while focused)
  // Remove thousand dots first, then normalize decimal separator to dot
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  return Number(normalized) || 0;
}

export function NumericInput({
  value,
  onChange,
  className,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value ? String(value) : "");

  useEffect(() => {
    if (!focused) setRaw(value ? String(value) : "");
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? raw : fmt(value)}
      className={className}
      onFocus={() => { setFocused(true); setRaw(value ? String(value) : ""); }}
      onBlur={() => { setFocused(false); onChange(parse(raw)); }}
      onChange={(e) => {
        // Allow digits, one dot and one comma (decimal separators)
        const val = e.target.value;
        const cleaned = val.replace(/[^\d.,]/g, "");
        // Only allow one decimal separator
        const parts = cleaned.split(/[.,]/);
        const normalized = parts.length > 2
          ? parts[0] + "." + parts.slice(1).join("")
          : cleaned;
        setRaw(normalized);
        onChange(parse(normalized));
      }}
    />
  );
}
