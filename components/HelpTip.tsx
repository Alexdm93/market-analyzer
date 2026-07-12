"use client";

type Props = {
  title: string;
  description: string;
  side?: "left" | "right";
};

export function HelpTip({ title, description, side = "right" }: Props) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        tabIndex={0}
        aria-label={`Definición: ${title}`}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[0.55rem] font-black text-slate-500 transition-colors hover:bg-teal-100 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        ?
      </button>

      {/* Tooltip card — visible on hover or focus-within */}
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute bottom-full z-50 mb-2 w-72 rounded-2xl bg-slate-900 p-3.5 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${side === "left" ? "right-0" : "left-0"}`}
      >
        <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-widest text-teal-400">{title}</span>
        <span className="block text-[0.75rem] leading-[1.45] text-slate-300">{description}</span>
        {/* Arrow */}
        <span className={`absolute -bottom-1.5 h-3 w-3 rotate-45 bg-slate-900 ${side === "left" ? "right-3" : "left-3"}`} />
      </span>
    </span>
  );
}
