"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: acción destructiva · warning: otorga permisos o tiene consecuencias */
  tone?: "danger" | "warning";
  eyebrow?: string;
};

/**
 * Reemplazo de window.confirm con el estilo de la app.
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: "...", message: "..." }))) return;
 *   ...
 *   return <main>...{confirmDialog}</main>;
 *
 * Devuelve una promesa que resuelve true (confirmar) o false (cancelar, Escape
 * o clic fuera). El foco inicial queda en Cancelar: en una acción destructiva,
 * un Enter distraído no debería confirmarla.
 */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    // Si ya había uno abierto, se resuelve como cancelado
    resolverRef.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const dialog = options ? (
    <ConfirmDialogView options={options} onCancel={() => close(false)} onConfirm={() => close(true)} />
  ) : null;

  return [confirm, dialog];
}

function ConfirmDialogView({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tone = options.tone ?? "danger";
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const Icon = tone === "danger" ? AlertTriangle : ShieldAlert;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="surface-card relative z-10 w-full max-w-md overflow-hidden rounded-[2rem] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className={`eyebrow mb-0.5 ${tone === "danger" ? "text-red-700" : "text-amber-700"}`}>
              {options.eyebrow ?? (tone === "danger" ? "Confirmar eliminación" : "Confirmar")}
            </div>
            <h2 id="confirm-dialog-title" className="font-display text-lg font-bold text-slate-900">
              {options.title}
            </h2>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div
            className={`flex items-start gap-2.5 rounded-[1rem] border px-4 py-3 text-sm leading-6 ${
              tone === "danger"
                ? "border-red-100 bg-red-50/70 text-red-900"
                : "border-amber-100 bg-amber-50/70 text-amber-900"
            }`}
          >
            <Icon className="mt-1 h-4 w-4 shrink-0" />
            <div>{options.message}</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn btn-secondary">
            {options.cancelLabel ?? "Cancelar"}
          </button>
          <button type="button" onClick={onConfirm} className={tone === "danger" ? "btn btn-danger" : "btn btn-primary"}>
            {options.confirmLabel ?? (tone === "danger" ? "Sí, eliminar" : "Sí, continuar")}
          </button>
        </div>
      </div>
    </div>
  );
}
