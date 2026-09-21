"use client";

/**
 * Selector con búsqueda y scroll interno.
 *
 * Un `<select>` nativo no sirve cuando hay cientos de opciones: el navegador
 * dibuja la lista desplegada a la altura que quiere — con 300 empresas ocupa
 * la pantalla entera — y eso no se puede limitar con CSS. Así que la lista se
 * dibuja aquí: altura fija, scroll propio y un campo para filtrar.
 */
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type OpcionSelector = { value: string; label: string };

export function SelectorBuscador({
  id,
  value,
  onChange,
  opciones,
  placeholder = "Selecciona una opción",
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: OpcionSelector[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedor = useRef<HTMLDivElement>(null);
  const campoBusqueda = useRef<HTMLInputElement>(null);

  const seleccionada = opciones.find((o) => o.value === value);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter((o) => o.label.toLowerCase().includes(q));
  }, [opciones, busqueda]);

  // Cerrar al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;

    function alClic(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }

    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTeclado);
    campoBusqueda.current?.focus();
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTeclado);
    };
  }, [abierto]);

  function abrir() {
    if (disabled) return;
    setBusqueda("");
    setAbierto((v) => !v);
  }

  function elegir(valor: string) {
    onChange(valor);
    setAbierto(false);
  }

  return (
    <div ref={contenedor} className="relative">
      <button
        id={id}
        type="button"
        onClick={abrir}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="field-select flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundImage: "none", paddingRight: "1rem" }}
      >
        <span className={`min-w-0 truncate ${seleccionada ? "" : "text-slate-500"}`}>
          {seleccionada?.label ?? placeholder}
        </span>
        <ChevronDown size={14} aria-hidden className="shrink-0 text-slate-500" />
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={14} aria-hidden className="shrink-0 text-slate-400" />
            <input
              ref={campoBusqueda}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar entre las opciones"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          {/* La altura es fija a propósito: el problema que resuelve este
              componente es justamente que la lista crezca sin control. */}
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtradas.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias.</li>
            )}
            {filtradas.map((o) => {
              const activa = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={activa}
                    onClick={() => elegir(o.value)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                      activa ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 truncate">{o.label}</span>
                    {activa && <Check size={14} aria-hidden className="shrink-0 text-[#1B4965]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
