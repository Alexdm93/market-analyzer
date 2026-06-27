"use client";
import { useEffect, useState } from "react";

function fmt(n: number): string {
  return n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
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
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? raw : fmt(value)}
      className={className}
      onFocus={() => { setFocused(true); setRaw(value ? String(value) : ""); }}
      onBlur={() => { setFocused(false); onChange(Number(raw.replace(/\./g, "")) || 0); }}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d]/g, "");
        setRaw(cleaned);
        onChange(Number(cleaned) || 0);
      }}
    />
  );
}
