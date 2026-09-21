"use client";

/**
 * El recorrido del Estudio Especializado.
 *
 * El trabajo son dos pasos con orden: cargar los ocupantes y contrastarlos con
 * el mercado. El Historial no es un paso — es donde quedan guardados los
 * informes que se congelan en el paso 2 — así que va aparte y sin número, para
 * no dar a entender que hay que pasar por ahí para terminar.
 */
import { ChevronRight, History } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { useNavigationTrigger } from "./NavigationProgress";

const BASE = "/market-analyzer/estudio";

const PASOS = [
  { href: `${BASE}/cargos`,      nombre: "Mis cargos",  detalle: "Carga tus ocupantes" },
  { href: `${BASE}/comparacion`, nombre: "Comparación", detalle: "Genera y descarga" },
];

const HISTORIAL = { href: `${BASE}/informes`, nombre: "Historial", detalle: "Informes guardados" };

export function PasosEstudio() {
  const pathname = usePathname();
  const triggerNavigation = useNavigationTrigger();

  return (
    <nav
      aria-label="Recorrido del Estudio Especializado"
      className="surface-panel flex flex-wrap items-center gap-1 rounded-[1.5rem] p-2"
    >
      {PASOS.map((paso, i) => {
        const activo = pathname === paso.href;
        return (
          <Fragment key={paso.href}>
            {i > 0 && <ChevronRight size={15} aria-hidden className="shrink-0 text-slate-300" />}
            <Link
              href={paso.href}
              onClick={activo ? undefined : triggerNavigation}
              aria-current={activo ? "step" : undefined}
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[1.15rem] border px-3 py-2 transition ${
                activo
                  ? "border-[#1B4965]/10 bg-[linear-gradient(135deg,rgba(27,73,101,0.14),rgba(21,58,82,0.06))] text-slate-900 shadow-[0_2px_10px_rgba(27,73,101,0.18)]"
                  : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white/70"
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[0.78rem] font-bold ${
                  activo ? "bg-[#1B4965] text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="font-display block truncate text-[0.85rem] font-bold leading-5">{paso.nombre}</span>
                <span className="block truncate text-[0.7rem] leading-4 text-slate-500">{paso.detalle}</span>
              </span>
            </Link>
          </Fragment>
        );
      })}

      {/* Separado de los pasos: es un destino, no una etapa del trabajo. */}
      <span aria-hidden className="mx-1 hidden h-8 w-px shrink-0 bg-slate-200 sm:block" />

      {(() => {
        const activo = pathname === HISTORIAL.href;
        return (
          <Link
            href={HISTORIAL.href}
            onClick={activo ? undefined : triggerNavigation}
            aria-current={activo ? "page" : undefined}
            className={`flex min-w-0 items-center gap-2.5 rounded-[1.15rem] border px-3 py-2 transition ${
              activo
                ? "border-[#1B4965]/10 bg-[linear-gradient(135deg,rgba(27,73,101,0.14),rgba(21,58,82,0.06))] text-slate-900 shadow-[0_2px_10px_rgba(27,73,101,0.18)]"
                : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white/70"
            }`}
          >
            <span
              aria-hidden
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                activo ? "bg-[#1B4965] text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              <History size={14} />
            </span>
            <span className="min-w-0">
              <span className="font-display block truncate text-[0.85rem] font-bold leading-5">{HISTORIAL.nombre}</span>
              <span className="block truncate text-[0.7rem] leading-4 text-slate-500">{HISTORIAL.detalle}</span>
            </span>
          </Link>
        );
      })()}
    </nav>
  );
}
