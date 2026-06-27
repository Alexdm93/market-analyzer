"use client";

import type { ReactNode } from "react";

function splitDots(n: number): string[] {
  return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".").split(".");
}

export function FmtMoney({ value, prefix = "$", className }: { value: number | null | undefined; prefix?: string; className?: string }): ReactNode {
  if (value == null || Number.isNaN(value) || value === 0) {
    return <span className={className}>—</span>;
  }
  const parts = splitDots(value);
  return (
    <span className={className}>
      {prefix}{" "}
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-slate-300 select-none" aria-hidden>.</span>}
          {part}
        </span>
      ))}
    </span>
  );
}

export function fmtMoneyStr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "ND";
  if (n === 0) return "—";
  return `$ ${Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
